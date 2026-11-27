# Fact-check record: console/reference/screens/build/documentation.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Pages are changed in a dev workspace only; production lists and shows them; the editor address shows the production notice. | apps/console/src/screens/Tenant.tsx:590-604 (`editable={workspace.data.type === "dev"}`); kit/objects.tsx:171 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Without the permission the screen says "You can see … not change it. It needs `resource:write`, or doc:write alone." | D/Docs.tsx:165-170 (`useNeeds`); kit/Can.tsx:187 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Header controls New folder, New page (disabled with tooltip), Deploy N changes; the "A page goes in a folder. Make a folder first." notice. | D/Docs.tsx:583-612 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| The product-names notice and its plural. | D/Docs.tsx:613-620 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Filter pages box, Close/Open every folder, tree label Pages. | D/Docs.tsx:640-662 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Row parts: file name detail, draft marks ("Draft · not deployed", "New · not deployed", "To be removed"), Site / Site, not published / repository badges, pencil and More for menu, Keep button on a removed page. | D/Docs.tsx:113-118, 1009-1080 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Menu items and when each is offered, with the details. | D/Docs.tsx:472-560 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Duplicate is named "<title> (copy)" with `-copy`, `-copy-2` if taken; takes no topic, terms or key. | packages/docs-engine/src/ops.ts:503-540 (`planDuplicate`); run | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| New row: Page title / Folder title, File name from the title, Type select with None / Folder: / four labels, Save, Cancel; Enter and Escape. | D/Docs.tsx:1130-1290 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Limits 120 title, 80 file name; messages "A title is needed.", "A file name is needed.", "Shorten what is past its limit first.", "Use lowercase letters, numbers, - and _.", the index note and the rename hint. | D/Docs.tsx:1166-1280 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A page with a type starts from its outline; type is written only when the folder does not say it. | packages/docs-engine/src/ops.ts:126-133, 452-476 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Dragging rules and the footer text; top-level folders have no grip; messages "Put … in its new place." and "Moved … into …." | D/Docs.tsx:258-300, 680-684 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Undo on tree changes; "Undone." | D/Docs.tsx:854-894 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Move dialog text and buttons. | D/Docs.tsx:1293-1349 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Publish dialog: Site title (120), Address, default `<folder>-site`, error texts, "will be a site once deployed." | D/Docs.tsx:1467-1542, 776-811 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Feedback dialog: the table `docs-feedback`, six columns, two button labels, taken-path notice, the list of what is made. | D/Docs.tsx:1356-1442; packages/docs-engine/src/workspace.ts:44-61 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Questions for stop/publish again/remove app/turn off feedback/delete/keep and their buttons. | D/Docs.tsx:349-377, 380-390, 913-930, 933-949; kit/RemoveDraftButton.tsx:18-26 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Reader: breadcrumb, state pill, file name and " · no site publishes this page", the helpful line, four buttons and when each shows, notices. | D/Docs.tsx:1600-1710 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Empty and not-found states. | D/Docs.tsx:621-635, 699-703 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Deploy question text with and without the table; success message. | D/Docs.tsx:198-224 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| What a deploy counts: pages, apps, and feedback draft tables. | D/model.ts:73-94 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Permissions: read `resource:read` or `doc:read` alone; write needs a dev workspace and `resource:write` or `doc:write` alone; doc writer role holds `app:read, doc:*, table:read, workspace:read`. | apps/control-plane/src/routes/docs.ts:161-170; apps/control-plane/src/routes/authoring.ts:236-250; apps/console/src/builtinRoles.ts:36 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| workspace_admin also holds `doc:*`. | apps/console/src/builtinRoles.ts:50-81 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A page served by repository folder shows `repository` and cannot be edited, moved, dragged. | D/model.ts `movable`; D/Docs.tsx:1035, 1678 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Preview with drafts is at `<site>_draft/`. | apps/control-plane/src/routes/docs.ts:260-270; kernel/apps/front.ts:845-850 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| Production lists and shows pages and offers no New folder, New page or Deploy; the editor address says the production notice and links "Edit it in <dev>". | apps/console/src/kit/objects.tsx:160-180; run as tenant admin and doc writer in a production workspace (empty list; /docs/new and /docs/edit/x/y) | second agent, 2026-11-23 | holds as written |
| A doc writer in a dev workspace sees New folder, New page, the menu and Deploy; holds `doc:*`, `app:read`, `table:read`, `workspace:read`. | builtinRoles.ts:36; run as a doc writer | second agent, 2026-11-23 | holds as written |
| The notice for no permission names `resource:write`, or doc:write alone. | apps/console/src/kit/Can.tsx:180-193 | second agent, 2026-11-23 | holds as written |
| Dragging: a row into a folder ("Moved Alpha into Other." with Undo, then "Undone."), a row above another ("Put Beta in its new place." with Undo), a top-level folder cannot be dragged. | run: drag and drop with Playwright in a dev workspace | second agent, 2026-11-23 | holds as written |
| A repository page has no pencil, no menu, no grip and no Edit; it has "Open as readers see it" and the notice "This page lives in the repository, at <file>…". | run: a page deployed from a repository (`volvel deploy`) | second agent, 2026-11-23 | corrected: the page said only Edit, Rename, Move to… and the grip were missing; the whole row has no buttons |
| The keyboard: ↑ ↓ ← → Enter F2 on the tree; Enter opens the row's menu. | run, DocEditor and Docs.tsx tree | second agent, 2026-11-23 | added to the page |
| Menu of a site folder: New page here, New folder here, Rename (F2), Move to…, Duplicate, Turn on page feedback…, Stop publishing…, Remove the site's app…, Delete folder…; a plain top-level folder adds Publish as a site… | run | second agent, 2026-11-23 | holds as written |
| Stop publishing…, Publish again…: the badge changes at once (Site, not published), a deploy serves 404 and "Nothing here / There is no page at this address.", and again serves 200. | run on a console site; questions and buttons as in the table | second agent, 2026-11-23 | holds as written |
| Remove the site's app… then Deploy N changes. | run: the app's removal is not counted: with no other change the button is not there, the folder shows no Site badge and offers Publish as a site… again, and the site still answers 200 after a deploy of a page change | fault fixed (fa): the removal is a counted change and the deploy stops the site (`removedApps`), confirmed in the code and tests | corrected: the page now says Deploy counts the removal |
| Feedback dialog, deploy question with the table, Turn off page feedback and its deploy. | run on a console site | second agent, 2026-11-23 | holds as written |
| A page with a problem notice "This page has N problem(s) and would not deploy as it is." | Docs.tsx:1703-1706 | second agent, 2026-11-23 | holds; the notice appears only when a problem is an error, and N counts all problems, warnings too (not described in the page) |

## Phase 33, M5 (writer, instance 8097, 2026-11-24)

Lines are current at commit `661a2ceb`. Paths are under `packages/` unless stated.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| **Type** lists None, Tutorial, How-to guide, Reference, Explanation and **Changelog entry**. | apps/console/src/screens/docs/Docs.tsx:1279 | writer, run on 8097 (select options read) | holds as written |
| The hint of **Changelog entry**; the date at the start of **File name**; a typed name used as typed; the page made in the `changelog/` folder of the top-level folder, or in the `changelog` folder the chosen folder is inside. | Docs.tsx:1190-1214,1283; packages/docs-engine/src/ops.ts:147-167 | writer, run on 8097 (chosen folder was the site's folder; the inside-a-changelog case is code only) | holds as written |
| "There is already an entry named <name>. Change its title or its name." | packages/docs-engine/src/ops.ts:163 | code only; not provoked | not run |
| The page beside the tree draws `::changelog` with the page's own site's entries. | Docs.tsx:1755; model.ts:377-393 | writer, run on 8097 (read view showed the entries) | holds as written |

## Phase 33, second check, 2026-11-24

Checked by: second agent, 2026-11-24. Run on 8097 (Sandbox, 1440 light and 390 dark) and read against `Docs.tsx`, `ops.ts`.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| **Type** ends with **Changelog entry**; hint text; date at the start of **File name**, a typed name used as typed; no `type:` written; outline of a sentence, What is new, What to do. | Docs.tsx:1279-1288; ops.ts:137-167; run | second agent, 2026-11-24 | holds |
| The page goes in the `changelog/` folder of the top-level folder, or in the `changelog` folder the chosen folder is inside. | ops.ts:147-153; run for both | second agent, 2026-11-24 | holds |
| "There is already an entry named <name>. Change its title or its name." | ops.ts:163; run | second agent, 2026-11-24 | holds |
| The page beside the tree draws `::changelog` with the page's own site's entries. | Docs.tsx:1755; model.ts:377-393 | second agent, 2026-11-24 | holds |
