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
| Remove the site's app… takes effect after the next deploy. | run (see the Documentation screen record) | fault fixed (fa): the removal is a counted change (`removedApps`, model.ts:90) and the deploy stops the site, confirmed in the code and tests | corrected: the page now says Deploy counts the removal |
| A doc writer cannot make a binding. | doc_writer holds no `binding:*` (roles list from the API) | second agent, 2026-11-23 | holds |

## Phase 33, M5 (writer, instance 8097, 2026-11-24)

Lines are current at commit `661a2ceb`. Paths are under `packages/` unless stated.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Each page has **On this page**, **Previous**, **Next**. | docs-site/src/render.ts:543-556 | writer, run on 8097 | holds as written |

## Phase 33, second check, 2026-11-24

Checked by: second agent, 2026-11-24. The line "Each page has **On this page**, **Previous** and **Next**" read against `docs-site/src/render.ts:543-556` (the contents are drawn only when the page has a `##`/`###` heading; a page without one has none) and seen on a served site (the entries page has none). The publish steps were run again: the Address starts as `<folder>-site`, **Publish** says the folder will be a site once deployed, a site with no binding sends a request with no sign-in to the sign-in page. No correction.

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A binding is a file or `defineBinding`. | run on `walk6` | writer, 2026-11-24 | holds as run |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build, `pnpm docs:check` passes. Second agent, 2026-11-24. `<path>.binding.yaml` as in define-roles-and-bindings-in-code (validated and built). Holds.
