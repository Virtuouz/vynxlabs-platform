# Fact-check record: console/how-to/app-builder/lay-out-a-page

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

Checked by: second agent, 2026-11-23. The files were read at commit `87000022` (lines cited at `5ebf1c80` moved by a few lines; the claims hold at the places named unless a row says otherwise). Each label was also searched for in the console source; screen behavior was run on http://localhost:8091 as Maya Brooks, as a member with only interface:write, as a viewer and on a production workspace.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add to page: A key, groups, search placeholder, suggestions heading, preview panel, Enter, tile press | `screens/builder/AddToPage.tsx:15-21,262-434`; `PageEditor.tsx:334` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Labs tag and pack name on tiles | `AddToPage.tsx:196-231` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Drag out: mouse or pen, not touch; closes as picked up; not onto an empty page | `AddToPage.tsx:174-192`; `PageEditor.tsx:1083` | second agent, 2026-11-23 | holds (run: tile out of Add to page drops a Section; a Button dragged into a Section and out again; note '3 × 1 · col 5 · row 1'; Esc cancels) |
| "Adds to" the container; click or drag hint | `AddToPage.tsx:372-387` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Move by drag and keys: arrows, Shift+arrows, Delete, Ctrl/⌘+D, Esc | `packages/screens/src/PageView.tsx:1095-1128` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Layout numbers and limits | `kit/inspector/LayoutPanel.tsx:221-275` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Move to… lists the container places; dialog title "Move X to" | `kit/inspector/MoveTo.tsx`; `Inspector.tsx:297-326` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Section settings: Title, Caption, Holds, Style Plain/Card, Can be collapsed, Starts folded | `kit/inspector/widgets/sectionDrawer.tsx:71-113` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Tabs: 1–8 tabs, name 40, Opens first, Underline/Pills, Remember the last tab, removal options, keeps one | `widgets/tabsDrawer.tsx:29,109-142,205-262` | second agent, 2026-11-23 | holds (run: Move and remove the tab, Remove it with its widgets text, 'Adds to Tabs › First') |
| Containers one level deep; stack under 28 rem | `sectionDrawer.tsx:72`; `packages/screens/src/PageView.tsx:190-192` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Action group: Buttons (8), Line up, Show up to, Group with other buttons…, dialog and Group the buttons, Move these buttons… | `widgets/actionsDrawer.tsx:47,232-285`; `screens/builder/ButtonOffers.tsx:14-62`; `GroupButtonsDialog.tsx:36-80` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Page holds at most 30 widgets message | `PageEditor.tsx:617-621`; `containers.ts:287-289` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Size of a sheet: snap, Size in settings | `PageSettings.tsx:193-210` | second agent, 2026-11-23 | holds (code read at 87000022) |
