// One watch round against one address. Runs the same on a GitHub runner or on any machine with Node 18 or newer.
// A round reads once; if that read fails it waits and reads again, and only a second failure is a fault.
// Prints one JSON line per read, then one line: ROUND ok | ROUND blip <first reason> | ROUND fault <reason>.
// Exit 0 for ok and blip, 1 for a fault, 2 for a usage error. A key is read from an environment variable and never printed.
//
// usage: node probe.mjs [url=https://keled.de/sitemap.xml] [expect='<loc>https://keled.de/</loc>']
//                       [timeout-ms=10000] [retry-ms=60000] [key-env=NAME]
const args = process.argv.slice(2);
const opt = { url: 'https://keled.de/sitemap.xml', expect: '<loc>https://keled.de/</loc>', 'timeout-ms': '10000', 'retry-ms': '60000', 'key-env': '' };
for (const a of args) {
  const at = a.indexOf('=');
  const k = at > 0 ? a.slice(0, at) : a;
  if (at < 1 || !(k in opt)) { console.log(`usage error: ${a}`); process.exit(2); }
  opt[k] = a.slice(at + 1);
}
const timeoutMs = Number(opt['timeout-ms']);
const retryMs = Number(opt['retry-ms']);
const key = opt['key-env'] ? process.env[opt['key-env']] || '' : '';
if (opt['key-env'] && !key) { console.log(`usage error: ${opt['key-env']} is empty`); process.exit(2); }

async function read(n) {
  const u = new URL(opt.url);
  u.searchParams.set('kw', String(Date.now())); // a cache busting query, so the edge cannot answer from its cache
  const headers = { 'cache-control': 'no-cache', 'user-agent': 'keled-watch/1' };
  if (key) headers.authorization = `Bearer ${key}`;
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const row = { read: n, at: new Date(t0).toISOString(), path: new URL(opt.url).pathname };
  try {
    const res = await fetch(u, { headers, signal: ctl.signal, redirect: 'manual' });
    const body = await res.text();
    row.status = res.status;
    row.ms = Date.now() - t0;
    row.bytes = Buffer.byteLength(body);
    if (res.status !== 200) row.reason = `status ${res.status}`;
    else if (opt.expect && !body.includes(opt.expect)) row.reason = 'marker missing';
  } catch (e) {
    row.ms = Date.now() - t0;
    const code = e?.cause?.code || e?.code || e?.name || 'error';
    row.reason = ctl.signal.aborted ? `timeout ${timeoutMs} ms` : String(code);
  } finally {
    clearTimeout(timer);
  }
  row.ok = !row.reason;
  console.log(JSON.stringify(row));
  return row;
}

// The verdict is set as process.exitCode and the process ends on its own: calling process.exit() while an HTTPS
// connection is still closing crashed Node 24 on Windows with exit 127 after a good round.
const first = await read(1);
if (first.ok) {
  console.log('ROUND ok');
  process.exitCode = 0;
} else {
  await new Promise(r => setTimeout(r, retryMs));
  const second = await read(2);
  if (second.ok) { console.log(`ROUND blip ${first.reason}`); process.exitCode = 0; }
  else { console.log(`ROUND fault ${second.reason}`); process.exitCode = 1; }
}
