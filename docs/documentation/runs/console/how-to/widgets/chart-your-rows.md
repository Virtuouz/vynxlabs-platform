# Run log: console/how-to/widgets/chart-your-rows.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright, light theme, 1440 px unless said. The app is `wdg Visits` (address `wdg-visits`) made in the App Builder for these runs.
- The steps were run in pieces and the page written from what was seen; one end-to-end run of the finished text was not made.

## The steps as followed
- Add to page > Chart (Understand data). Source Appointments: Data showed Measure "Count of rows", For each "Starts at · Weekly", Split into colors Nothing, "Reads as the number of appointments by week. Drawn as bars; 10 weeks.", Order: Sorted by As they come, Show at most All weeks.
- For each window: "Good for grouping" columns with the number of values, "Other columns", "How often the dates are cut" Day/Week/Month/Quarter, "Include weeks with no appointments".
- Add another measure added "Measure 2: Count of rows" in place; its window listed Count, Count of different, Sum, Average, Smallest, Largest and, for Average, "Column it works on" Minutes / Pet weight lb.
- Display: Chart type tiles Bar, Bar sideways, Pie ("not for time" over a date), Line, Area, Heatmap ("needs a split"), Scatter; Numbers, Colors, Show values on bars, Show axis titles, Legend, Up the side "First value".
- For each = Minutes: Scatter enabled; chosen: three points (20, 40 and 60 minutes).

## The page got wrong (and was corrected)
- A first draft told the reader that Add another measure opens a window; it adds "Measure 2" in the list and its settings open when it is pressed.
- Line, Area and Pie notes are read from the screen; "Along the bottom" did not appear with one breakdown and was not run.

## Not run
Split into colors, several series, stacked and side-by-side bars, Colors, Show axis titles with the title boxes, Compare, a measure beyond two, Show at most on a chart.
