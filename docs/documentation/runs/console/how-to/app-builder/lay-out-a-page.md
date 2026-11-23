# Run log: console/how-to/app-builder/lay-out-a-page.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs) plus the working tree of the wave.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run. Apps made for the runs are named `abapp …`.
- The steps were run in pieces (several scripts), then the page was written from what was seen. A single end-to-end run of the finished text was not made.

## The steps as followed
- **Add to page** (button at the foot of the pane): dialog with the search "Find something to add, or describe what people should do", **Suggested for this page** (Approvals, "Reorder asks for a decision"), **Work with records** (Table, List, Record detail, Form), **Understand data** (Stat, Chart, Pivot, Goal), **Take action** (Button, Action group, Approvals), **Organize and explain** (Section, Tabs, Search and filter, Text), the foot line "Click to place at the end of the page, or drag onto the grid. Form fields come from the table, so they aren't listed here." and the preview panel with **Good for**.
- A Button placed from the dialog: settings opened on **Display** with Says, Icon, Style (Main, Normal, Quiet, Danger), Full width, Position. A Section placed: settings "Section · holds nothing yet", tabs Display and Rules, Title, Caption, **Holds** "Nothing in it yet.", Style Plain/Card, Can be collapsed.
- **⋯** on the table: Layout, Duplicate (Ctrl+D), Move to…, Remove. **Move to…** opened a dialog "Move Appointments to" listing **Section**; choosing it put the table under Section in **On this page**.
- **Tabs** placed: tabs First and Second (each "Empty" and **Opens first**), **+ Tab**, "Click a tab on the page to fill it. Rename one by choosing it here.", Style Underline/Pills, **Remember the last tab**, "Per person, on this device.".
- **Action group** placed: one button "Do it" (Main), **+ Button**, "Each button opens its own Display, Actions and Rules. Drag to reorder.", Line up Left/Right/Spread, **Show up to** "3 buttons, the rest in ⋯".
- **⋯ > Layout** of a button: Name in the outline, On desktop (Column, Row, Width, Height) with "A button is 2 to 12 wide and 1 to 2 high, on twelve columns." and, for the table, "A table is 4 to 12 wide and 4 to 40 high".

## Not run
Dragging (a tile out of Add to page, a widget on the page, into a Section or onto a tab), the arrow keys on a selected widget, **Group with other buttons…**, removing a tab that holds widgets, the touch case. These steps come from the code (`AddToPage.tsx`, `PageView.tsx`, `ButtonOffers.tsx`, `tabsDrawer.tsx`) and the page says so only through its record. The page is not presented as finished until a second pair of eyes has dragged.
