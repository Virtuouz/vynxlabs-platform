# Run log: console/how-to/widgets/chart-your-rows.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`. Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright. Second check, 2026-11-23.
- App `wdg Chart` (address `wdg-chart`), a Chart on Appointments, 1440 px light: Measure window, Add another measure (Measure 2), For each window (cuts, Include weeks with no appointments), Split into colors, the Order group (Sorted by, Bars in order for Clinic, Show at most), Display: chart type tiles with their reasons, Several series with a second breakdown, Colors (App theme, Cool, Warm, Grays), Along the bottom, Show axis titles, Legend, Over time group, the Actions tab; Scatter with For each = Minutes available; with Pet weight lb (Also from) still "needs a number".

## What the page got wrong, and the correction
- Several series is under Chart type (not More options) and needs a second breakdown.
- There are no title boxes; Show axis titles shows a line saying what is along the bottom and up the side.
- Order has Sorted by as well as Bars in order.
- The click on a point is on the Actions tab.

## Not run
A published scatter; stacked versus side-by-side drawn in the served app; Compare with the period before (needs a date filter).
