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

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| Pages are files under the folder `volvel.yaml` names with `docs:`; the app in code with a binding; `volvel build` lists docs, app and binding. | run: `volvel init`, `docs: [docs]`, files, `volvel build` | second agent, 2026-11-23 | corrected: an app written in `src/docs.ts` is not built unless the entry file exports it, and the snippet had no import |
| `volvel build` refuses links, headings, terms, `about`, `moved_from`, a `volvel-` name. | run: build of a page with each | second agent, 2026-11-23 | holds |
| `volvel build` refuses a missing picture and the product's own topic. | run: `volvel build` passed; `volvel deploy` refused both ("The picture "img/absent.png" is not there: no file at img/absent.png.", "The topic "build-docs" is one of the product's own.") | second agent, 2026-11-23 | corrected: the page said the build checks pictures and product names; the deploy does (packages/cli/src/build.ts:507 "which a build does not know") |
| The deploy and the console's list: the pages show **repository**; the site and its picture answer 200. | run: `volvel deploy --tenant d31chk --workspace work` | second agent, 2026-11-23 | holds; the deploy refuses to delete console-made resources without --allow-delete, now in the page |
| `moved_from` paths. | packages/docs-engine/src/set.ts:487-510, among.ts:149; run: `moved_from: [t1]` on page `handbook/t1` is its own path | second agent, 2026-11-23 | corrected: the paths are inside the site, not the whole path |
