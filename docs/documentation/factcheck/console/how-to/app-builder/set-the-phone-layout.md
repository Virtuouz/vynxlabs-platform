# Fact-check record: console/how-to/app-builder/set-the-phone-layout.md (merged with the former console/how-to/widgets/lay-out-a-page-for-phones.md, removed)

Code as of the working tree of branch `phase-31-write-the-docs`, 2026-11-23. Paths are under `apps/console/src` unless they start with `packages` or `apps/control-plane`. Second check: every row below was read in the code and, where it says run, done on http://localhost:8091.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Header Desktop/Tablet/Phone are radios (arrow keys move); tablet 768 drawn scaled with "Drawn at N %"; only Phone framed; below 640 px they are behind the ⋯ | `screens/builder/BuilderHeader.tsx:16-20,132-172`; `ScaledFrame.tsx:83`; `EditorShell.tsx:126-131` | second agent, 2026-11-23 | holds as run at 1440 and 390 |
| Banner "Phone layout is made from the desktop one." and "N widget(s) changed by hand" with All automatic | `PhoneFrame.tsx:7-50`; `packages/screens/src/narrow.ts:252-259` | second agent, 2026-11-23 | holds as run (1, 2, 3 widgets) |
| Automatic rules: quarter of the row shares, Keep half, Full, Stack after the rest, Hide; table of five sentences | `narrow.ts:5-17,38-52`; `kit/inspector/LayoutPanel.tsx:57-63` | second agent, 2026-11-23 | holds; sentences seen on screen |
| More about <widget> ⋯ opens Layout; Layout panel: On desktop, Smaller screens (Tablet, Phone: Automatic/Custom), On narrow screens, Priority (empty = Automatic); Back to settings | `LayoutPanel.tsx:124-340` | second agent, 2026-11-23 | holds as run |
| Priority: higher nearer the top, none counts as 0, ties follow the phone's places then the desktop's; Chart with 5 came first at 390 px, served and in the builder | `narrow.ts:104-125` | second agent, 2026-11-23 | holds as run |
| Hide: placeholder "Text is hidden on phones" while building; publish check "Phone layout hides 1 widget" with "Text, on wdg Phones" | `packages/screens/src/PageView.tsx:1866`; `screens/builder/publishCheck.ts:359-372` | second agent, 2026-11-23 | holds as run |
| Hide on phones is per column (Display, press the column name); served phone table is a list, first column the title, hidden column left out; 768 and 1440 keep the column | `widgets/ColumnEditor.tsx:238` | second agent, 2026-11-23 | holds as run served at 390 (light and dark), 768, 1440 |
| Custom phone: fields Phone column/row/width/height start from where the widget is; places set the order, half a row or less is one of two columns | `LayoutPanel.tsx:124-176`; `narrow.ts:35-47,90-100` | second agent, 2026-11-23 | holds as run |
| First drag or key move asks "Change the phone layout by hand?"; pressing Change the phone layout makes the move; asked once per device until the workbench is left | `screens/builder/AppBuilder.tsx:288-298` | second agent, 2026-11-23 | holds as run (mouse drag up on the phone; a key press after a click) |
| Phone ↑/↓ on a widget steps its order; a drag changes order only | `PageView.tsx:967-972,1098-1109` | second agent, 2026-11-23 | holds as run |
| A move takes the priority of the widget it is put before (so it can pass a higher number) | `narrow.ts:131-155` (phoneMoved) | second agent, 2026-11-23 | holds as run: Table moved before the Chart that had priority 5 |
| All automatic on the phone also clears On narrow screens and Priority of every widget (Text drawn again, Chart priority empty); a column's Hide on phones stays | `narrow.ts:276-289`; run | second agent, 2026-11-23 | holds as run |
| Served: phone layout below 42 rem, tablet below 58 rem, container below 28 rem | `PageView.tsx:185-190` | second agent, 2026-11-23 | code; 390 and 768 seen served |
| Some widgets default to Hide on a phone | `narrow.ts:27-31` | second agent, 2026-11-23 | code only |
| Under 1024 px the panes are sheets (Pages and widgets bar, settings sheet) | `EditorShell.tsx:126-131` | second agent, 2026-11-23 | holds as run at 390 px |
| The move question says "Go back to automatic" in its Layout undoes that; the Layout has no control of that name (it has Automatic, and All automatic in the banner) | `AppBuilder.tsx:295` | second agent, 2026-11-23 | fault fixed (fb): the question names the Layout's own words (`ALL_AUTOMATIC`), confirmed in the code; the page does not repeat it |

Checked by: second agent, 2026-11-23

Run on 2026-11-23: the page was followed end to end on the app `wdg Phones Two` (1440 px, light) and the served result of `wdg Phones` seen at 390 px light and dark, 768 and 1440. Both source pages' claims are merged; nothing from the removed page's text was lost (priority, Hide on phones, **Hide** per widget, the 42/58/28 rem sizes, the troubleshooting lines).
