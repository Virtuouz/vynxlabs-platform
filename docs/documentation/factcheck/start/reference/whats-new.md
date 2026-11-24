# Fact-check record: start/reference/whats-new.md

Written by the writer. Paths are under `packages` unless said. "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The page lists the newest entries of the changelog folder, three of them, newest first. | `docs-engine/src/changelog.ts` (`changelogOf`); `markup/src/render.ts` (case `changelog`) | writer | holds |
| Every release has its own page under `changelog/`, and "Unreleased" is one entry. | `docs/generators/changelog.mjs` (`changelogFiles`) | writer | holds |
| A feed of the entries is at `changelog.xml` beside the pages. | `docs-site/src/feed.ts`; `apps/control-plane/src/routes/product-docs.ts` | writer | holds |
| Versions before 1.0 may change the API, the manifest format and the worker protocol. | `CHANGELOG.md:3` | writer | holds |
