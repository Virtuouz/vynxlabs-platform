---
title: Set the phone and tablet layout
description: See a page at tablet and phone width, put a widget first, leave a widget or a table column out on phones, and give a widget a place of its own there.
subjects: [app-builder, widgets, pages]
---

## Set the phone and tablet layout

By the end you will have seen a page of a Chart, a Table and a Text at 390 px and 768 px. On a phone the Chart comes first, the Text is left out and one table column is hidden, and you will know how to take it all back.

## Before you start

- An app open in [the workbench](../../reference/screens/build/app-builder-editor) with a page that has widgets, in a dev workspace, and `resource:write` or `interface:write`. [Lay out a page](lay-out-a-page) gets you one. The steps below use a Chart, a Table and a Text.
- Nothing needs setting for the phone to work. A phone layout is made from the desktop one by itself. This page is for when you want to change it.

## See the page on a phone

:::steps
1. In the header press **Phone**, or **Tablet**. The page is drawn at 390 px or 768 px. Only **Phone** is drawn in a device frame. The tablet is drawn scaled to fit the room, and says so, for example "Drawn at 86 %". A line above the page says "Phone layout is made from the desktop one." The arrow keys move between **Desktop**, **Tablet** and **Phone**. In a narrow window the three are behind the **⋯** in the header.
2. Look at the page. On a phone the widgets are read in the order of the page and stack: a small widget (a quarter of the desktop row or less) shares a row with the next small one, and any other takes the whole row. A tablet keeps the desktop places, narrowed.
:::

## Put a widget first and leave things out

:::steps
1. Select the Chart, press **More about Chart** (**⋯**) at the top of its settings and choose **Layout**.
2. Type `5` in **Priority**. A higher number stays nearer the top when the page stacks, and a widget with none counts as 0. On the phone the Chart now comes before the Table. The line above the page says "1 widget changed by hand."
3. Press **Back to settings**. Select the Table, open **Display**, press the name of a column such as **Client code**, and turn on **Hide on phones**. On a phone the Table is drawn as a list: the first column is the title, the rest run in a line, and the hidden column is left out.
4. To leave a whole widget out, select the Text, press **⋯**, then **Layout**. Under **Smaller screens**, under **On narrow screens**, choose **Hide**. The page then shows "Text is hidden on phones" in its place while you build, and a reader on a phone does not see it. The other choices are in the table below.
:::

| **On narrow screens** | What a phone does with the widget |
| --- | --- |
| **Automatic** | A small widget shares a row with the next small one; another takes the row. |
| **Keep** | Keeps its share of the row: half the desktop's or less sits two to a row. |
| **Full** | Takes the whole row where it comes. |
| **Stack** | Takes the whole row, after everything that is not stacked. |
| **Hide** | Left out on narrow screens. |

## Give a widget a place of its own

:::steps
1. In **Layout**, under **Smaller screens**, choose **Custom** beside **Tablet** or **Phone**. The numbers start from where the widget is now. Change **Phone column**, **Phone row**, **Phone width** and **Phone height**, or drag the widget on the page. A phone has one or two columns, so a place there sets where the widget comes in the order, and half the row or less is one of the two columns.
2. The first time you move a widget by hand on a device, by dragging it or with :kbd[↑] or :kbd[↓] on the phone, the console asks "Change the phone layout by hand?" Press **Change the phone layout**. The move is made, and the console does not ask again for that device until you leave the workbench.
3. On the phone, click a widget on the page and press :kbd[↑] or :kbd[↓] to change its order. A drag on a phone changes the order only, not the size. A move gives the widget a place of its own and the **Priority** of the widget it now comes before, so it can pass a widget that has a higher number.
4. To take back what you set by hand on a device, press **All automatic** in the line above the page. It shows when there is anything to take back and says how many: "3 widgets changed by hand."
:::

**All automatic** takes back more than places. On the **Phone** it also clears **On narrow screens** and **Priority** of every widget, so the Chart and the Text above go back to the desktop order and the Text is drawn again. It does not touch a column's **Hide on phones**: that belongs to the Table's columns.

## Publish and look

Press **Publish**, then **Publish N changes**, and open the app on a phone or in a window 390 px wide. The check lists what the phone layout hides, as "Phone layout hides 1 widget", so you see it before you publish. See [Publish an app](publish-an-app).

::screenshot{name=console/widgets-phone-page alt="A published app at phone width: the Chart first, then the Table drawn as a list with a title line and a line of values for each row."}

## The result

On a phone the Chart comes first, then the Table as a list without the hidden column, and the Text is not there. On a wider screen the page keeps the desktop places and shows every column. A served app uses the room it is given, not the device: it draws the phone layout in a window narrower than 42 rem and the tablet layout under 58 rem.

## If it does not work

- **A widget you moved on the phone moved on the desktop too.** Check that you are on **Phone** in the header and not on **Desktop**: a move on **Desktop** changes the desktop layout.
- **A widget is not first.** On a phone widgets are ordered by priority, higher first, and a widget with none counts as 0. Widgets of the same priority follow the phone's own places, then the desktop's. Give the one you want first a higher number than the rest, or move it on the phone: a move takes the priority of the widget it is put before.
- **The widget is not on the phone.** It is hidden. Select it under **On this page**, open **⋯**, **Layout**, and choose another **On narrow screens**. The default for some widgets is **Hide**.
- **A column is still drawn on a phone.** **Hide on phones** is set for each column in **Column** (**Display**, press the column's name), not for the widget. To leave a whole widget out, use **Hide** under **On narrow screens**.
- **The page does not stack in the builder.** Press **Tablet** or **Phone**; **Desktop** always draws the desktop places. A page stacks below 42 rem, and a container inside it below 28 rem.
- **Nothing happens on a narrow window.** Under 1024 px the panes are sheets: open **Pages and widgets**, or choose a widget to open its settings.

## Related

- [Lay out a page](lay-out-a-page).
- [The settings pane](../../reference/app-builder/inspector): the Layout panel.
- [Building an app](../../reference/screens/build/app-builder-editor).
