# Fact-check record: console/how-to/app-builder/set-the-phone-layout

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Device sizes 768, 390; only Phone framed; banner text | `BuilderHeader.tsx:16-20`; `PhoneFrame.tsx:277-353` | writer (read, run) | |
| Automatic rules: quarter of the row, keep, full, stack, hide | `packages/screens/src/narrow.ts:5-17,38-52`; `LayoutPanel.tsx:57-63` | writer (read, run) | |
| Hide: placeholder "X is hidden on phones" | `packages/screens/src/PageView.tsx:1866` | writer (read, run) | |
| Custom: Phone column, row, width, height; banner 1 widget changed by hand; All automatic | `LayoutPanel.tsx:118-180`; `PhoneFrame.tsx:277-321` | writer (read, run) | |
| Ask on first hand move: title, text, action | `AppBuilder.tsx:288-298` | writer (read) | |
| Phone ↑/↓ steps the order | `PageView.tsx:1100-1109,967-972` | writer (read) | |
| Priority | `LayoutPanel.tsx:314-332` | writer (read) | |
| Served: phone under 42 rem, tablet under 58 rem | `PageView.tsx:186-188` | writer (read) | |
| Publish check: Phone layout hides N | `screens/builder/publishCheck.ts:359-372` | writer (read, run) | |
| Some widgets default to Hide on a phone | `packages/screens/src/narrow.ts:27-31` | writer (read) | |
| Under 1024 px panes are sheets | `EditorShell.tsx:126-131` | writer (read) | |
