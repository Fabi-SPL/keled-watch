# keled-watch

We watch keled.de from here. Every five minutes a GitHub runner reads keled.de/sitemap.xml once. If that read fails, it waits a minute and reads again, and only a second failure fails the run. A failed run mails the owner of this repository.

What runs:

- `probe.mjs` is one round: no dependencies, Node 18 or newer.
- `.github/workflows/watch.yml` is the schedule.
- `.github/workflows/keep-on.yml` runs once a month. It writes the month's count of rounds into `log/`, commits it, and switches the schedule on again, because GitHub switches off the schedule of a public repository after 60 days without activity.

This repository names no address but keled.de and holds no key.

Keled · Software and AI engineering
