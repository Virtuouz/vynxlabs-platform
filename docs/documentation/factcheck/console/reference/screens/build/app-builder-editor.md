# Fact-check record: console/reference/screens/build/app-builder-editor

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Route and ?page= in the address | `screens/builder/AppBuilder.tsx:61-62,231-242`; run: `screens/screens/abapp-visits` | writer (read, run) | |
| Rename field: aria-label Name of the app, counter, Enter/Escape, over 100 not saved | `screens/builder/BuilderHeader.tsx:28-70` | writer (read) | |
| Pencil Rename the app; not drawn when read only | `BuilderHeader.tsx:73-85`; `AppBuilder.tsx:449-458` | writer (read) | |
| N draft changes pill opens the check; hidden under md (768 px) | `BuilderHeader.tsx:88-101`; `AppBuilder.tsx:460-467` | writer (read, run) | |
| N to fix pill and popover title | `BuilderHeader.tsx:108-130` | writer (read) | |
| Status words: Saving…, Saved. Not published yet., Published., Not saved: …; visible from xl (1280 px) | `screens/builder/EditorShell.tsx:25-29,163-169`; `AppBuilder.tsx:446` | writer (read, run) | |
| Device switch Desktop/Tablet/Phone, widths undefined/768/390, arrow keys | `BuilderHeader.tsx:16-20,133-189` | writer (read, run) | |
| Only Phone has a device frame | `screens/builder/PhoneFrame.tsx:327-353`; `PageEditor.tsx` (`on={device === "phone"…}`) | writer (read) | |
| View as: Me then groups | `BuilderHeader.tsx:192-230`; run: Me, Billing, Practice managers, Front desk, hilltop, northside, riverside | writer (read, run) | |
| View as note "Rows are yours…"; faded "Hidden for" | `PhoneFrame.tsx:357-363`; `packages/screens/src/PageView.tsx:1042` | writer (read) | |
| Undo/Redo labels and tooltips; 100 steps; 1 s coalescing; in memory | `kit/UndoRedo.tsx:26-38`; `kit/history.ts:4,6` | writer (read) | |
| Preview opens a new tab at …/preview after a save, with the page being edited when in the menu | `AppBuilder.tsx:269-281` | writer (read) | |
| Preview bar texts, switch, Open the published app, Close; draws as the viewer; error text | `screens/builder/AppPreview.tsx:41-135` | writer (read, run) | |
| Buttons run in Preview; canvas never runs actions | `AppPreview.tsx:14-20,66-70`; `packages/screens/src/PageView.tsx:720` | writer (read) | |
| Publish opens the check; off when problems or save failed | `AppBuilder.tsx:494-500`; `BuilderHeader.tsx:248-298` | writer (read, run) | |
| More ways to publish: Publish, Open the published app (tooltip), Restore an earlier draft | `BuilderHeader.tsx:299-362` | writer (read, run) | |
| Fold buttons names and states; docked from 1024 px | `EditorShell.tsx:114-130,201-230`; `kit/layout.tsx:40` | writer (read) | |
| Under 1024 px: Pages and widgets bar, Settings sheet; ⋯ More with undo/redo; under 640 px sizes and View as move behind it | `EditorShell.tsx:126-133,172-200,243-257,344-359` | writer (read) | |
| Pages list: icons, kinds, grip, arrows, + when fewer than 20 | `screens/builder/PagesList.tsx:157-269`; `pageKinds.ts:84`; `packages/widget-sdk/src/page.ts:200` | writer (read, run) | |
| On this page; "Nothing yet."; Alt+↑/↓ in the outline; foot line | `screens/builder/PageEditor.tsx:576-640`; `Outline.tsx:46,90` | writer (read, run) | |
| Add to page button off at 30 widgets with tooltip; key A | `PageEditor.tsx:334,612-625`; `kit/shortcuts.ts:78`; `page.ts:202` | writer (read) | |
| Empty page text and starts | `PageEditor.tsx:316,800-830` | writer (read, run) | |
| Overlay bar "Side sheet · Medium · 720px"; sizes; Drawn at N %; Size slider keys | `PageEditor.tsx:760-785`; `screens/builder/pageKinds.ts:25-39`; `ScaledFrame.tsx:70-89`; `SizeHandle.tsx:52-79` | writer (read) | |
| Preview of the page for a record, 25 rows offered, empty text | `screens/builder/SampleRecord.tsx:10,86-134` | writer (read) | |
| Device banner texts and All automatic | `PhoneFrame.tsx:277-321` | writer (read, run) | |
| Save 700 ms; ⌘S; navigation guard text | `AppBuilder.tsx:198-217`; `EditorShell.tsx:124,138` | writer (read) | |
| Clash notice and Load their version (no Copy what I wrote in the builder: `mine` not passed) | `kit/DraftClash.tsx:20-70`; `AppBuilder.tsx:570-591` | writer (read) | |
| Clash is a 409 draft_changed | `apps/control-plane/src/kernel/authoring.ts:292-315` | writer (read) | |
| Restore dialog: texts, 30 kept, list, preview, Restore, Not now, keys, toast with Undo | `screens/builder/DraftHistory.tsx:81-176`; `AppBuilder.tsx:300-311`; `kernel/authoring.ts:396` | writer (read, run) | |
| Shortcuts: A, Mod+S, Mod+Z, Shift+Mod+Z / Ctrl+Y; widget keys | `kit/shortcuts.ts:78-84`; `packages/screens/src/PageView.tsx:1095-1128` | writer (read) | |
| F2 rename is the docs editor's, not the builder's | `screens/docs/Docs.tsx:1770` | writer (read) | |
| Read-only line texts (production, permission) | `screens/builder/ReadOnly.tsx:32-36` | writer (read) | |
| Repository notice, Take over, taking-over notice | `AppBuilder.tsx:556-569` | writer (read, run) | |
| Removal notice and Keep this app | `AppBuilder.tsx:529-552` | writer (read) | |
| No app notice and Make an app for it prompt | `AppBuilder.tsx:592-631` | writer (read) | |
| Publish 403 words | `AppBuilder.tsx:341-346` | writer (read) | |
| Permissions: save/publish/check routes | `apps/control-plane/src/routes/authoring.ts:582,1021-1030,1113` | writer (read) | |
| Read-only decided by the workspace summary mayAuthor | `screens/builder/ReadOnly.tsx:17-29`; `apps/control-plane/src/routes/summary.ts:56-62,136` | writer (read) | |
