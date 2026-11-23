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
