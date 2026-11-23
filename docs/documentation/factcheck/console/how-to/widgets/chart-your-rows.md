# Fact-check record: console/how-to/widgets/chart-your-rows.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Chart is under Understand data; Data shows "Reads as the number of appointments by week. Drawn as bars; 10 weeks." | `screens/builder/AddToPage.tsx:18`; run | writer, run on the instance 2026-11-23 | holds as run |
| Measures: Count, Count of different, Sum, Average, Smallest, Largest; Add another measure; a chart draws up to six. | run (Measure 2 window); `kit/inspector/measureControls.tsx:252-267,347`; `packages/widgets-core/src/index.ts:439` | writer, run on the instance 2026-11-23 | holds as run |
| For each lists columns with few values first and how many; dates by day/week/month/quarter; "Include weeks with no appointments". | run (For each window) | writer, run on the instance 2026-11-23 | holds as run |
| Split into colors; two breakdowns at most. | run (Data tab); `measureControls.tsx:536,662` | writer, run on the instance 2026-11-23 | two-breakdown limit from code only |
| Order: Bars in order As it came/By name/Biggest first/Smallest first; Show at most. | `packages/docs/generated/develop/reference/widgets/chart.md` (order) | writer | from the reference |
| Chart types Bar, Bar sideways, Pie, Line, Area, Heatmap, Scatter; grays: Line/Area "needs a date", Heatmap "needs a split", Pie "not for time", Scatter "needs a number". | `chartSpec.ts:100-117`; `chartDrawer.tsx:70`; run | writer, run on the instance 2026-11-23 | holds as run |
| Display Look: Numbers, Colors App theme/Cool/Warm/Grays, Show values on bars, Show axis titles, Legend Automatic/Never. | `chart.md` generated; run (Display tab lists Numbers, Colors, Show values on bars, Show axis titles, Legend) | writer, run on the instance 2026-11-23 | holds as run |
| Along the bottom / Up the side choose the columns; default first breakdown and first value. | `chartDrawer.tsx:577-584`; run: "Up the side: First value" shown | writer, run on the instance 2026-11-23 | "Along the bottom" row not seen (one breakdown) |
| Scatter with For each = Minutes draws three points. | run (screenshot scatter2) | writer, run on the instance 2026-11-23 | holds as run |
