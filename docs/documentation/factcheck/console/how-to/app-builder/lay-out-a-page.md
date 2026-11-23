# Fact-check record: console/how-to/app-builder/lay-out-a-page

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add to page: A key, groups, search placeholder, suggestions heading, preview panel, Enter, tile press | `screens/builder/AddToPage.tsx:15-21,262-434`; `PageEditor.tsx:334` | writer (read, run) | |
| Labs tag and pack name on tiles | `AddToPage.tsx:196-231` | writer (read) | |
| Drag out: mouse or pen, not touch; closes as picked up; not onto an empty page | `AddToPage.tsx:174-192`; `PageEditor.tsx:1083` | writer (read) | |
| "Adds to" the container; click or drag hint | `AddToPage.tsx:372-387` | writer (read) | |
| Move by drag and keys: arrows, Shift+arrows, Delete, Ctrl/⌘+D, Esc | `packages/screens/src/PageView.tsx:1095-1128` | writer (read) | |
| Layout numbers and limits | `kit/inspector/LayoutPanel.tsx:221-275` | writer (read, run) | |
| Move to… lists the container places; dialog title "Move X to" | `kit/inspector/MoveTo.tsx`; `Inspector.tsx:297-326` | writer (read, run) | |
| Section settings: Title, Caption, Holds, Style Plain/Card, Can be collapsed, Starts folded | `kit/inspector/widgets/sectionDrawer.tsx:71-113` | writer (read, run) | |
| Tabs: 1–8 tabs, name 40, Opens first, Underline/Pills, Remember the last tab, removal options, keeps one | `widgets/tabsDrawer.tsx:29,109-142,205-262` | writer (read) | |
| Containers one level deep; stack under 28 rem | `sectionDrawer.tsx:72`; `packages/screens/src/PageView.tsx:190-192` | writer (read) | |
| Action group: Buttons (8), Line up, Show up to, Group with other buttons…, dialog and Group the buttons, Move these buttons… | `widgets/actionsDrawer.tsx:47,232-285`; `screens/builder/ButtonOffers.tsx:14-62`; `GroupButtonsDialog.tsx:36-80` | writer (read) | |
| Page holds at most 30 widgets message | `PageEditor.tsx:617-621`; `containers.ts:287-289` | writer (read) | |
| Size of a sheet: snap, Size in settings | `PageSettings.tsx:193-210` | writer (read) | |
