# Fact-check record: start/reference/whats-new.md

Written by the writer. Paths are under `packages` unless said. "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The page lists the newest entries of the changelog folder, three of them, newest first. | `docs-engine/src/changelog.ts` (`changelogOf`); `markup/src/render.ts` (case `changelog`) | writer | holds |
| Every release has its own page under `changelog/`, and "Unreleased" is one entry. | `docs/generators/changelog.mjs` (`changelogFiles`) | writer | holds |
| A feed of the entries is at `/docs/changelog.xml` on the instance. | `docs-site/src/feed.ts`; `apps/control-plane/src/routes/product-docs.ts:250` | writer; second agent, 2026-11-24 (200 application/rss+xml at /docs/changelog.xml, 404 beside the page) | page said "beside these pages"; corrected |
| Versions before 1.0 may change the API, the manifest format and the worker protocol. | `CHANGELOG.md:3` | writer | holds |
| Everything since the last release is one entry, "Unreleased", first; the page shows three (Unreleased, 0.5.0, 0.4.0) and links "3 older entries". | `docs/generators/changelog.mjs` (`changelogFiles`); `docs-engine/src/changelog.ts:85-110`; served page | Checked by: second agent, 2026-11-24 | holds; sentence added to the page |
