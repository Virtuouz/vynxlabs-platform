# Fact-check record: console/reference/app-builder/inspector

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

Checked by: second agent, 2026-11-23. The files were read at commit `87000022` (lines cited at `5ebf1c80` moved by a few lines; the claims hold at the places named unless a row says otherwise). Each label was also searched for in the console source; screen behavior was run on http://localhost:8091 as Maya Brooks, as a member with only interface:write, as a viewer and on a production workspace.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Header: icon, name, kind, pack name, holds; ⋯ menu Layout, Duplicate (Ctrl+D), Move to…, Remove | `kit/inspector/Inspector.tsx:200-318` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Duplicate takes a container's contents | `screens/builder/containers.ts:278-296` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Unknown widget text and Remove it | `Inspector.tsx:184-198` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Tabs Data, Display, Actions, Rules; Text's first tab Content | `packages/widget-sdk/src/index.ts:121-132`; `kit/inspector/custom.ts:163` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Button opens on Display; text of its Data tab | `Inspector.tsx:165-169`; `Inspector.tsx:524-531` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Dot and Needs fixing notice; More … options disclosure | `Inspector.tsx:328-358,542-555` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Title 100, Caption 200 | `kit/inspector/heading.tsx:55-84` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Rules groups: Show this, Who can see it (+ Limit to a group), Who can edit, Can be pressed when, Who can run it, row rules link, security note | `kit/inspector/RulesTab.tsx:196-423` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Group picker: Team / End users, empty text, not found chip | `RulesTab.tsx:36-122` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Server refusal "Only … can do this." | `apps/control-plane/src/kernel/pages/who.ts:94-105` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Steps and their titles | `kit/inspector/actionModel.ts:70-81` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Steps offered: update and delete need a record; Close not on a page; dashboard differs | `actionModel.ts:88-106` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Update values: value, today, now, user, record, asked | `apps/control-plane/src/kernel/pages/act.ts:486-491` | second agent, 2026-11-23 | holds (code read at 87000022) |
| The canvas does not run actions; Preview does | `packages/screens/src/PageView.tsx:720`; `AppPreview.tsx:14-20` | second agent, 2026-11-23 | holds (code read at 87000022) |
| When a row is clicked: four choices, Opens as, Edit its layout, lines | `screens/builder/RowClickEditor.tsx:67-86,160-290` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Layout panel: header, Back to settings, Name in the outline, On desktop note, Smaller screens, narrow words, Priority | `kit/inspector/LayoutPanel.tsx:56-63,181-332` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Limits note, e.g. A button is 2 to 12 wide and 1 to 2 high | `LayoutPanel.tsx:221-224`; run | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Add a form: modes, Table, Fields, Opens as, After saving, Title 60, Message 200, Create form, preview text | `screens/builder/AddFormDialog.tsx:94-246,412-421` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Add a form opens from Form in Add to page or the suggestion | `screens/builder/PageEditor.tsx:376-385,1076-1081` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Text widget on the page: Done, Cancel/Esc, Keep writing, Discard; Edit on the page | `screens/builder/TextOnPage.tsx:42-118`; `kit/inspector/widgets/textDrawer.tsx:122` | second agent, 2026-11-23 | holds (code read at 87000022) |
