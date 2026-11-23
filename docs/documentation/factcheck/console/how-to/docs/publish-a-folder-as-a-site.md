# Fact-check record: console/how-to/docs/publish-a-folder-as-a-site.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Publish as a site… is in the menu of a top-level folder with no site; Top-level folders only. | D/Docs.tsx:495-505 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Dialog: Site title (120), Address, default `<folder>-site`, error texts, Publish, Cancel. | D/Docs.tsx:1467-1542 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| "<folder> will be a site once deployed."; badge Site, not published until deployed. | D/Docs.tsx:792, 1031 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Served at `/apps/<tenant>/<workspace>/<address>/`. | run; apps/control-plane/src/routes/docs.ts:155-160 (`appUrl`) | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Preview at `_draft/`: members with doc:read or resource:read; others get "not there"; noindex; answers not kept; deployed pictures; message text. | apps/control-plane/src/kernel/apps/front.ts:1334-1420 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Stop publishing / Publish again / Remove the site's app: questions, buttons, details, effects, Undo. | D/Docs.tsx:347-424, 528-551 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Who may open a site is decided by bindings; the screen makes none. | docs/sdk-guide.md:277-281; D/Docs.tsx (no binding calls) | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A site never serves a folder inside another. | docs/sdk-guide.md:277 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Home page lists collections and recently updated; contents, Previous, Next, Copy as Markdown, Last updated. | packages/docs-site/src/render.ts:248-330, 486-549, 627-640 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| "Something already has that path." and the address pattern text. | D/Docs.tsx:1487-1492 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| Publish dialog, "<folder> will be a site once deployed.", deploy, the served site; Stop publishing / Publish again served 404 then 200. | run in a dev workspace as a doc writer | second agent, 2026-11-23 | holds as written; the 404 page's words are now quoted |
| Remove the site's app… takes effect after the next deploy. | run (see the Documentation screen record) | fault: docs deploy of the app's removal | corrected: the page no longer says it is deployed by the next deploy |
| A doc writer cannot make a binding. | doc_writer holds no `binding:*` (roles list from the API) | second agent, 2026-11-23 | holds |
