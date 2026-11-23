# Run log: console/how-to/app-builder/set-the-phone-layout.md (merged with the former widgets/lay-out-a-page-for-phones)

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`. Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright. Second check, 2026-11-23.
- The finished text was run end to end once on a new app `wdg Phones Two` (Table, Chart, Text on Appointments) at 1440 px, light: Phone and Tablet (the tablet said "Drawn at 86 %"), the arrow keys between sizes, Priority 5 on the Chart (Chart first, "1 widget changed by hand"), Hide on phones for Client code, Hide for the Text ("Text is hidden on phones", "2 widgets changed by hand", publish check "Phone layout hides 1 widget"), Custom for the Table (Phone column, row, width, height), a mouse drag and a click-then-arrow-key move (both asked "Change the phone layout by hand?"; pressing Change the phone layout made the move), All automatic (banner back to no count, Text drawn again, Priority empty, Hide on phones kept).
- Served result of `wdg Phones` (published): at 390 px light and dark the Chart first then the Table as a list without Client code; at 768 and 1440 the desktop places with every column.
- Walked at 390 px: the sizes are behind the header's ⋯ (a radio group "Screen size"); Pages and widgets opens as a sheet; the Layout panel fits the settings sheet. In dark at 1440: the Layout panel and the "Text is hidden on phones" placeholder read well.

## What the run changed on the page
- A move on the phone takes the priority of the widget it is put before (the page had said a move did not pass a higher priority).
- All automatic on the phone also clears On narrow screens and Priority (the page had said only places).
- The two source pages were merged; the widgets page was removed.

## Not run
Tablet Custom places, Keep and Stack as results on a served phone, a widget that defaults to Hide.
