# Fact-check record: develop/how-to/docs/keep-documentation-in-the-repository.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The folder of pages is `platform/docs` unless `volvel.yaml` `docs:` names others. | packages/manifest/src/files.ts:43-45 (`docsRoots`); docs/sdk-guide.md:238-247 | writer, read in the code 2026-11-23 | holds as written |
| A file's path under the folder is the page's path; names are lowercase letters, digits, hyphens, underscores; Markdown elsewhere is nobody's page. | packages/manifest/src/files.ts:47-54; docs/sdk-guide.md:249 | writer, read in the code 2026-11-23 | holds as written |
| The top of a page and its fields; `pages` on index.md. | packages/docs-engine/src/schema.ts:42-175 | writer, read in the code 2026-11-23 | holds as written |
| `defineApp({ path, title, docs })` and `defineBinding` with anonymous principal; a site never serves a folder inside another; nobody outside without a binding. | docs/sdk-guide.md:268-281 | writer, read in the code 2026-11-23 | holds as written |
| Pictures beside pages, relative; https allowed, not shown offline. | docs/sdk-guide.md:330; packages/cli/src/build.ts:100-150 | writer, read in the code 2026-11-23 | holds as written |
| `volvel build` refuses a workspace whose documentation does not hold together; each problem with page and line. | docs/sdk-guide.md:365-368; packages/cli/src/build.ts:8 | writer, read in the code 2026-11-23 | holds as written |
| Warnings about types are printed and do not stop; "the instance may be older". | docs/documentation/fixed/p30-m3.md | writer, read in the code 2026-11-23 | holds as written |
| A repository page is read-only in the console, labeled repository, with the notice text. | apps/console/src/screens/docs/Docs.tsx:1035-1037, 1678-1683 | writer, read in the code 2026-11-23 | holds as written |
| `key` keeps the page the same page when its file moves; `moved_from`. | packages/docs-engine/src/schema.ts:73-80, 157-165 | writer, read in the code 2026-11-23 | holds as written |
| A term or topic of the product or starting `volvel-` is refused. | packages/docs-engine/src/set.ts:422-442 | writer, read in the code 2026-11-23 | holds as written |
