# Fact-check record: console/how-to/widgets/chart-your-rows.md

Code as of the working tree of branch `phase-31-write-the-docs`, 2026-11-23. Paths are under `apps/console/src` unless they start with `packages` or `apps/control-plane`. Second check: every row below was read in the code and, where it says run, done on http://localhost:8091.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add to page > Chart under Understand data; Source Appointments; "Reads as the number of appointments by week. Drawn as bars; 10 weeks." | `screens/builder/AddToPage.tsx:18`; `chartDrawer.tsx:340-360` | second agent, 2026-11-23 | holds as run |
| Measure window: Count, Count of different, Sum, Average, Smallest, Largest; Add another measure adds Measure 2; a chart draws up to six measures | `kit/inspector/measureControls.tsx`; `packages/widgets-core/src/index.ts:523` | second agent, 2026-11-23 | holds as run; six from code |
| For each lists columns with few values first and how many; date cut Day/Week/Month/Quarter; "Include weeks with no appointments" | run | second agent, 2026-11-23 | holds as run |
| Split into colors; two breakdowns at most (breakdowns max 2) | `widgets-core/src/index.ts:523` | second agent, 2026-11-23 | holds as run; limit from code |
| Order group: Sorted by always; Bars in order (As it came, By name, Biggest first, Smallest first) only when the first breakdown is not a date; Show at most (a number, empty = all) | `chartDrawer.tsx:366-405` | second agent, 2026-11-23 | corrected: Sorted by added; run |
| Chart types Bar, Bar sideways, Pie, Line, Area, Heatmap, Scatter; grays: needs a date, needs a split, not for time, needs a number | `chartDrawer.tsx:62-80`; `chartSpec.ts:100-117` | second agent, 2026-11-23 | holds as run |
| Several series (One on another / Side by side) sits under Chart type for bars with a second breakdown | `chartDrawer.tsx:478-492` | second agent, 2026-11-23 | corrected: the page said More options |
| Look: Numbers, Along the bottom / Up the side (only with two or more breakdowns or values), Colors App theme/Cool/Warm/Grays, Show values on bars (bars), Show axis titles with a help line, Legend Automatic/Never (pie, heatmap, several breakdowns or values); Over time: compare, smooth, mark each point | `chartDrawer.tsx:495-575,590-620` | second agent, 2026-11-23 | corrected: no "Title along the bottom" boxes exist; run |
| Scatter with For each = Minutes is available and draws points | `chartDrawer.tsx:83-86` | second agent, 2026-11-23 | holds as run (earlier run: three points) |
| A click on a point is set on the Actions tab, "When someone clicks a point" | run | second agent, 2026-11-23 | corrected: the page did not say where |
| Published chart has the same download button as other widgets | `Frame.tsx:320-340`; served phone app showed it | second agent, 2026-11-23 | holds as run |

Checked by: second agent, 2026-11-23
