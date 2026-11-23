---
title: Chart your rows
description: Add a Chart, count or total rows by a column or by time, split the colors, add a second measure, choose the type and the axes, and draw a scatter.
subjects: [widgets, app-builder]
---

## Chart your rows

By the end a Chart on an app page counts Fernhill appointments, shown first as bars by week and then as a scatter of appointments by length.

## Before you start

- An app with a page, open in the App Builder of the **Sandbox** workspace. You need `resource:write` or `interface:write`.
- The list of chart types and every setting are in the [Chart reference](../../../develop/reference/widgets/chart).

## Add the chart and say what it counts

:::steps
1. Press **Add to page** and choose **Chart**, under **Understand data**.
2. On **Data**, press **Source** and choose **Appointments**. Under **What to chart** the chart reads "Reads as the number of appointments by week. Drawn as bars; 10 weeks." because it chose a date column to break down by, and a count.
3. **Measure** is what each bar works out. Press it to choose **Count**, **Count of different**, **Sum**, **Average**, **Smallest** or **Largest**, and, for the others, the column it works on. A chart draws up to six measures: press **Add another measure** to add the next, **Measure 2**.
4. **For each** is how rows are grouped. Press it and choose a column; the list puts columns with few values first and says how many each has. For a date column choose to cut it by day, week, month or quarter. **Include weeks with no appointments** shows a quiet period as zero.
5. **Split into colors** splits each group by a second column. A chart takes two breakdowns at most.
6. Under **Order**, **Bars in order** sets **As it came**, **By name**, **Biggest first** or **Smallest first** (not for a chart over time, which goes in date order), and **Show at most** keeps the first groups.
:::

## Choose the type and the axes

:::steps
1. Open **Display**. Under **Chart type** choose **Bar**, **Bar, sideways**, **Pie**, **Line**, **Area**, **Heatmap** or **Scatter**. A type the data cannot be drawn as is grayed, and says what it needs: Line and Area "needs a date", Heatmap "needs a split", Pie "not for time".
2. **Several series**, in the chart type's **More options**, stacks several measures **One on another** or sets them **Side by side**.
3. Under **Look**: **Numbers** (how values are written), **Colors** (**App theme**, **Cool**, **Warm** or **Grays**), **Show values on bars**, **Show axis titles**, and **Legend** (**Automatic** or **Never**).
4. With two or more breakdowns or values, **Along the bottom** and **Up the side** choose which column each axis draws. Left alone, the first breakdown goes along the bottom and the first value up the side. **Show axis titles** adds **Title along the bottom** and **Title up the side**.
5. For a scatter, set **For each** (on **Data**) to a number or date column of the table itself, such as **Minutes**. Then **Scatter** is no longer grayed. Choose it. Each group is a point: its place along the bottom is the value of **For each**, and its height is the measure.
:::

::screenshot{name=console/widgets-chart-scatter alt="The App Builder with a Chart selected. Chart type shows Scatter chosen and Line, Area and Heatmap grayed with their reasons; the chart shows three points."}

## The result

The chart draws the rows as you asked. In the published app it has the same download button as other widgets. A click on a bar or point can run an action: see [Run an action from a widget](run-an-action-from-a-widget).

## If it does not work

- **Scatter is grayed and says "needs a number".** **For each** is a text column, or a column that comes from **Also from**. Use a date or number column of the table itself.
- **Line says "needs a date".** The first **For each** is not a date. Choose a date column.
- **Pie says "not for time".** A pie cannot be drawn from dates.
- **Add another measure is not offered.** A chart takes six measures at most.
- **Nothing is drawn.** The source has no rows that meet **Only include**. Remove a condition to see.
