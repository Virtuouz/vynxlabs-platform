---
title: Set the phone and tablet layout
description: See a page at tablet and phone width, let the builder stack it automatically, and change the order, size or visibility of a widget there by hand.
subjects: [app-builder, pages]
---

## Set the phone and tablet layout

By the end you will have seen your page at 390 px and 768 px, and have left one widget out of the phone layout, or put it in a place of its own.

## Before you start

- An app open in [the workbench](../../reference/screens/build/app-builder-editor) with a page that has widgets, in a dev workspace, and `resource:write` or `interface:write`. [Lay out a page](lay-out-a-page) gets you one.
- Nothing needs setting for the phone to work. A phone layout is made from the desktop one by itself. This page is for when you want to change it.

## Steps

:::steps
1. In the header press **Phone**, or **Tablet**. The page is drawn at 390 px or 768 px. Only **Phone** is drawn in a device frame. A line above the page says "Phone layout is made from the desktop one." The arrow keys move between **Desktop**, **Tablet** and **Phone**.
2. Look at the page. On a phone the widgets are read in the order of the page and stack: a small widget (a quarter of the desktop row or less) shares a row with the next small one, and any other takes the whole row.
3. To leave a widget out on a phone, select it, press **⋯**, then **Layout**. Under **Smaller screens**, **On narrow screens**, choose **Hide**. The page then shows "Appointments is hidden on phones" in its place, and a reader on a phone does not see it. The other choices are in the table below.
4. To give a widget a place of its own on one device, choose **Custom** under **Tablet** or **Phone**. The numbers start from where the widget is now. Change **Phone column**, **Phone row**, **Phone width** and **Phone height**, or drag the widget on the page. The first time you drag on a device, the console asks "Change the phone layout by hand?" Press **Change the phone layout** to go on. It asks once for each device until you leave the workbench.
5. On the phone, :kbd[↑] and :kbd[↓] on a selected widget change its order. A drag on a phone changes the order only, not the size.
6. To set a priority, type a number in **Priority**. A higher number stays nearer the top when the page stacks.
7. To take back every place you set by hand on a device, press **All automatic** in the line above the page. It shows when there is anything to take back and says how many: "1 widget changed by hand."
:::

| **On narrow screens** | What a phone does with the widget |
| --- | --- |
| **Automatic** | A small widget shares a row with the next small one; another takes the row. |
| **Keep** | Keeps its share of the row: half the desktop's or less sits two to a row. |
| **Full** | Takes the whole row where it comes. |
| **Stack** | Takes the whole row, after everything that is not stacked. |
| **Hide** | Left out on narrow screens. |

## The result

On the phone and tablet sizes the line above the page says how much is by hand. A widget that is hidden shows a placeholder only while you build; a person who uses the app does not see it. A served app uses the room it is given, not the device: it draws the phone layout in a window narrower than 42 rem and the tablet layout under 58 rem. The publish check lists what the phone layout hides, as "Phone layout hides 1 widget", so you see it before you publish. See [Publish an app](publish-an-app).

## If it does not work

- **A widget you moved on the phone moved on the desktop too.** Check that you are on **Phone** in the header and not on **Desktop**: a move on **Desktop** changes the desktop layout.
- **The widget is not on the phone.** It is hidden. Select it under **On this page**, open **⋯**, **Layout**, and choose another **On narrow screens**. The default for some widgets is **Hide**.
- **Tablet shows no device frame.** Only **Phone** has one. The tablet is drawn at 768 px as it is.
- **Nothing happens on a narrow window.** Under 1024 px the panes are sheets: open **Pages and widgets**, or choose a widget to open its settings.

## Related

- [Lay out a page](lay-out-a-page).
- [The settings pane](../../reference/app-builder/inspector): the Layout panel.
- [Building an app](../../reference/screens/build/app-builder-editor).
