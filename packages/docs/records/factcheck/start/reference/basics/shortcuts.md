# Fact-check record: start/reference/basics/shortcuts.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks (or the operator admin where said), 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Every shortcut and its label is the list. | `kit/shortcuts.ts:29-142`; run (the sheet read back) | writer, run | holds as run |
| ? opens the sheet; also from the account menu and the palette. | `kit/CommandPalette.tsx:962,566`; `Shell.tsx:694`; run | writer, run | holds as run |
| / focuses the list's search, else opens the palette. | `Shell.tsx:640-652,600-612`; run (focus went to "Search") | writer, run | holds as run |
| g then a letter within 1 second; g o r f s t need a workspace; g a needs a tenant. | `kit/keys.ts:89`; `Shell.tsx:621-638`; run (g r) | writer, run | holds as run |
| List keys j k arrows, Home End (with Ctrl or Cmd: first/last row), Page keys, Enter, Ctrl+Enter new tab, x Space, Shift+J/K, Ctrl+A, Esc. | `kit/DataTable.tsx:285-360` | writer | holds (not run) |
| Esc closes what is open beside the list. | `kit/layout.tsx:264` | writer | holds |
| Editors: a, Ctrl+S, Ctrl+Enter (script only), F2, undo, redo. | `kit/shortcuts.ts:77-90`; `screens/Authoring.tsx:423-426`; `screens/builder/PageEditor.tsx:335`; `screens/docs/Docs.tsx:1770` | writer | holds |
| Flow editor: Ctrl+D, Ctrl+C X V, Shift+F10. | `kit/shortcuts.ts:93-110` | writer | holds |
| Palette: Ctrl+P and Backspace are not on the sheet. | `kit/CommandPalette.tsx:773-790` | writer | holds |
| Single-key checkbox; "(off)" and "(single keys off)" marks; Enter, Space, arrows, Home, End, Page, Shift+F10 stay on. | `kit/CommandPalette.tsx:973-1010`; `kit/keys.ts:66-80` | writer | holds (not run) |
| A single key is ignored in a text field. | `kit/keys.ts:104-130` | writer | holds; run: ? in the Search box typed "?" and did not open the sheet |
| Keys show as ⌘ ⇧ ⌥ on a Mac and Ctrl, Shift, Alt elsewhere. | `kit/keys.ts:190-238`; run (sheet read "Ctrl+K", "Shift+J") | writer, run | holds as run |

## Second check

Checked by: second agent, 2026-11-23. Compared with `kit/shortcuts.ts` row by row (every key and label), with `kit/keys.ts` for single keys (`isSingle`, `turnsOff`; the chord window `CHORD_MS = 1000`) and with `kit/DataTable.tsx:283-360` for the list keys (Home/End with ⌘ go to the first and last row, PageUp/PageDown, Enter, ⌘↵ new tab). Run at 390 px dark: `?` opened the sheet; its scopes and labels match; with **Single-key shortcuts** off the sheet marked "Search this list (off)", "Overview (off)" and "Move down or up the list (single keys off)" as the page says; `g` then `r` went to Runs with it on. Correction: the page said Enter, Space, arrows, Home, End, Page keys and Shift+F10 stay on; Esc and the function keys F1, F2 and Shift+F10 also stay on (`keys.ts:isSingle`). The sheet's own sentence names "?, /, j, k, x and the g shortcuts"; `a` is also a single key (the page keeps `a`).
