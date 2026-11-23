---
title: Lay out a page for phones
description: Check a page in the Phone view, put a widget first with its priority, make it take a whole row, and hide a table column on phones.
subjects: [widgets, app-builder]
---

## Lay out a page for phones

By the end the page of a Chart and a Table opens on a phone with the chart first and one table column left out.

## Before you start

- An app page with a Chart and a Table open in the App Builder. You need `resource:write` or `interface:write`.

## Set the phone view

:::steps
1. In the toolbar, press **Phone**. The page is drawn at phone width. **Desktop** and **Tablet** are beside it.
2. Select the Chart. Press the **More about Chart** button (⋯) at the top of its settings and choose **Layout**.
3. Under **Smaller screens**, **Tablet** and **Phone** are each **Automatic** or **Custom**. **Automatic** stacks the widgets in reading order. **Custom** gives the widget a place of its own on that device: **Column**, **Row**, **Width**, **Height**.
4. **On narrow screens** chooses what the widget does: **Automatic** (a small widget shares a row with the next small one), **Keep** (half the desktop width or less sits two to a row), **Full** (takes the whole row), **Stack** (takes the whole row after everything not stacked) or **Hide** (left out).
5. Set **Priority** to `5`. A higher number stays nearer the top when the page stacks.
6. Press **Back to settings**, select the Table, open **Display**, press a column's name, and turn on **Hide on phones**. On a phone the table is drawn as a list: the first column is the title, the rest run in a line, and the hidden column is left out.
7. Press **Publish**, then **Publish N changes**, and open the app on a phone or at 390 px wide.
:::

::screenshot{name=console/widgets-phone-page alt="A published app at phone width: the Chart first, then the Table drawn as a list with a title line and a line of values for each row."}

## The result

On a phone the Chart comes first, then the Table as a list. On a wider screen the page keeps the desktop places.

## If it does not work

- **A widget is not first.** On a phone widgets are ordered by priority, higher first, and a widget with none counts as 0. Widgets of the same priority follow the phone's own places, then the desktop's. Give the one you want first a higher number than the rest.
- **The page does not stack on a tablet or a phone in the builder.** Press **Tablet** or **Phone** in the toolbar; **Desktop** always draws the desktop places. A page stacks below 42 rem, a tablet layout below 58 rem and a container below 28 rem.
- **A column is still drawn on a phone.** **Hide on phones** is set for each column in **Column** (Display, press the column's name), not for the widget. To leave a whole widget out, use **Hide** under **On narrow screens**.
