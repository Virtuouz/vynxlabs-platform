# Fact-check record: console/reference/app-builder/inspector

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Header: icon, name, kind, pack name, holds; ⋯ menu Layout, Duplicate (Ctrl+D), Move to…, Remove | `kit/inspector/Inspector.tsx:200-318` | writer (read, run) | |
| Duplicate takes a container's contents | `screens/builder/containers.ts:278-296` | writer (read) | |
| Unknown widget text and Remove it | `Inspector.tsx:184-198` | writer (read) | |
| Tabs Data, Display, Actions, Rules; Text's first tab Content | `packages/widget-sdk/src/index.ts:121-132`; `kit/inspector/custom.ts:163` | writer (read) | |
| Button opens on Display; text of its Data tab | `Inspector.tsx:165-169`; `Inspector.tsx:524-531` | writer (read, run) | |
| Dot and Needs fixing notice; More … options disclosure | `Inspector.tsx:328-358,542-555` | writer (read) | |
| Title 100, Caption 200 | `kit/inspector/heading.tsx:55-84` | writer (read) | |
| Rules groups: Show this, Who can see it (+ Limit to a group), Who can edit, Can be pressed when, Who can run it, row rules link, security note | `kit/inspector/RulesTab.tsx:196-423` | writer (read) | |
| Group picker: Team / End users, empty text, not found chip | `RulesTab.tsx:36-122` | writer (read) | |
| Server refusal "Only … can do this." | `apps/control-plane/src/kernel/pages/who.ts:94-105` | writer (read) | |
| Steps and their titles | `kit/inspector/actionModel.ts:70-81` | writer (read) | |
| Steps offered: update and delete need a record; Close not on a page; dashboard differs | `actionModel.ts:88-106` | writer (read) | |
| Update values: value, today, now, user, record, asked | `apps/control-plane/src/kernel/pages/act.ts:486-491` | writer (read) | |
| The canvas does not run actions; Preview does | `packages/screens/src/PageView.tsx:720`; `AppPreview.tsx:14-20` | writer (read) | |
| When a row is clicked: four choices, Opens as, Edit its layout, lines | `screens/builder/RowClickEditor.tsx:67-86,160-290` | writer (read) | |
| Layout panel: header, Back to settings, Name in the outline, On desktop note, Smaller screens, narrow words, Priority | `kit/inspector/LayoutPanel.tsx:56-63,181-332` | writer (read, run) | |
| Limits note, e.g. A button is 2 to 12 wide and 1 to 2 high | `LayoutPanel.tsx:221-224`; run | writer (read, run) | |
| Add a form: modes, Table, Fields, Opens as, After saving, Title 60, Message 200, Create form, preview text | `screens/builder/AddFormDialog.tsx:94-246,412-421` | writer (read) | |
| Add a form opens from Form in Add to page or the suggestion | `screens/builder/PageEditor.tsx:376-385,1076-1081` | writer (read) | |
| Text widget on the page: Done, Cancel/Esc, Keep writing, Discard; Edit on the page | `screens/builder/TextOnPage.tsx:42-118`; `kit/inspector/widgets/textDrawer.tsx:122` | writer (read) | |
