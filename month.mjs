// Counts one month of watch.yml runs into log/YYYY-MM.md, one row per day.
// Reads GitHub's API through the runner's own GITHUB_API_URL and GITHUB_REPOSITORY, so this file names no host.
// usage: node month.mjs [month=YYYY-MM]   (default: the month of yesterday, UTC)
import fs from 'node:fs';

const api = process.env.GITHUB_API_URL;
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
if (!api || !repo || !token) { console.log('usage error: needs GITHUB_API_URL, GITHUB_REPOSITORY and GH_TOKEN'); process.exit(2); }
const arg = process.argv.slice(2).find(a => a.startsWith('month='));
const month = arg ? arg.slice(6) : new Date(Date.now() - 86400000).toISOString().slice(0, 7);
if (!/^\d{4}-\d{2}$/.test(month)) { console.log(`usage error: ${month}`); process.exit(2); }

const [y, m] = month.split('-').map(Number);
const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
const today = new Date().toISOString().slice(0, 10);

async function get(path) {
  const res = await fetch(`${api}/${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

const rows = [];
const faults = [];
const all = { runs: 0, ok: 0, failed: 0, other: 0 };
for (let d = 1; d <= days; d++) {
  const day = `${month}-${String(d).padStart(2, '0')}`;
  if (day > today) break;
  const n = { runs: 0, ok: 0, failed: 0, other: 0 };
  // One query per day: GitHub caps a filtered run list at 1000 results, and a day holds at most 288 rounds.
  for (let page = 1; ; page++) {
    const j = await get(`repos/${repo}/actions/workflows/watch.yml/runs?created=${day}&status=completed&per_page=100&page=${page}`);
    for (const r of j.workflow_runs) {
      n.runs++;
      if (r.conclusion === 'success') n.ok++;
      else if (r.conclusion === 'failure' || r.conclusion === 'timed_out') {
        n.failed++;
        faults.push(`- ${r.created_at} ${r.event} ${r.conclusion}, run ${r.id}`);
      } else n.other++;
    }
    if (j.workflow_runs.length < 100) break;
  }
  if (n.runs) rows.push(`| ${day} | ${n.runs} | ${n.ok} | ${n.failed} | ${n.other} |`);
  for (const k of Object.keys(all)) all[k] += n[k];
}

const out = [
  `# Rounds of ${month}`,
  '',
  `Counted ${new Date().toISOString()} from this repository's watch runs, scheduled and started by hand.`,
  'A failed run is a fault: two reads a minute apart both failed. Other means cancelled or skipped.',
  '',
  '| day | runs | ok | failed | other |',
  '| - | -: | -: | -: | -: |',
  ...rows,
  `| month | ${all.runs} | ${all.ok} | ${all.failed} | ${all.other} |`,
  '',
  '## Failed runs',
  '',
  ...(faults.length ? faults : ['none']),
  '',
].join('\n');
fs.mkdirSync('log', { recursive: true });
fs.writeFileSync(`log/${month}.md`, out);
console.log(`log/${month}.md: ${all.runs} runs, ${all.ok} ok, ${all.failed} failed, ${all.other} other`);
