---
title: Lay out a page
description: Add widgets to a page, drag and size them, group them in a Section or Tabs, put buttons in an Action group and place a widget by number.
subjects: [app-builder, pages]
---

## Lay out a page

By the end you will have added widgets to a page, put them where you want them and grouped some under a heading, in a tab or in a toolbar.

## Before you start

- An app open in [the workbench](../../reference/screens/build/app-builder-editor), in a dev workspace, and `resource:write` or `interface:write` there. The page can be empty. [Make an app](make-an-app) gets you one.
- A page holds at most 30 widgets. **Add to page** is grayed out when it holds 30, and its tooltip says "A page holds at most 30 widgets.".

## Add a widget

:::steps
1. Press **Add to page** at the foot of the left pane, or press :kbd[A] when focus is not in a field. A dialog opens with a search, "Find something to add, or describe what people should do", and the widgets grouped as **Work with records**, **Understand data**, **Take action** and **Organize and explain**. A widget from a pack other than the one Volvel ships says the pack, and one from the Labs pack says **Labs**.
2. When the page shows a table, the dialog starts with **Suggested for this page**: a search over that table, its detail, a form for a new record, and so on. Press one to add it with the table already chosen.
3. Or type what people should do, such as "mark paid". The tiles whose name, description or examples use those words stay. Point at a tile to see it drawn in the panel on the right, what it is good for and the table it would start on.
4. Press a tile to place the widget at the end of the page, or :kbd[Enter] to place the highlighted one. The arrow keys walk the tiles. To place it where you want it, drag the tile onto the page with a mouse or pen. The dialog closes as you pick it up, a dashed place shows where it lands, and the widgets in the way move aside. Let it go off the page, or press :kbd[Esc], and nothing is added. A finger scrolls the dialog instead, so on a touch screen press the tile and drag the widget afterward.
:::

A widget placed is selected, and its settings are on the right. A **Form** asks first what it should do: see [Add a form](../../reference/app-builder/inspector).

## Move and size a widget

:::steps
1. Click the widget on the page, or its name under **On this page**. The widget is selected.
2. Drag it to move it, and drag its corner to stretch it. A note says its size and place, such as "8 × 5 · col 1 · row 3". The widgets in its way move aside, and :kbd[Esc] puts it back.
3. Or use the keyboard. With the widget selected, the arrow keys move it one cell, and :kbd[Shift] with an arrow makes it one cell wider, narrower, taller or shorter. :kbd[Delete] removes it, and :kbd[Ctrl]+:kbd[D] (:kbd[⌘D]) duplicates it.
4. To type exact numbers, press **⋯** in the settings, then **Layout**. **Column**, **Row**, **Width** and **Height** take the place in cells of twelve columns. A number past the widget's limit is kept at the limit, and the pane says so. **Back to settings** returns.
:::

A widget cannot be made smaller than it can be read, or larger than it can be drawn: a table is 4 to 12 wide and 4 to 40 high, a button 2 to 12 wide and 1 to 2 high. Widgets that would lie on one another move out of the way. **Undo** and :kbd[Ctrl]+:kbd[Z] take back a move, a size, a removal or a duplicate; the button says which, such as "Undo Moved Search and filter".

A side sheet or modal is sized by the edge of its frame on the canvas, which snaps to **Small**, **Medium**, **Large**, **Extra large** or **Full**, or by **Size** in the page's settings.

## Group widgets under a heading or in tabs

:::steps
1. Press **Add to page** and choose **Section** for a heading over widgets, or **Tabs** for views that show one at a time. A Section is **Plain** or a **Card**. Turn on **Can be collapsed** to let a reader fold it, and **Starts folded** to show it closed first.
2. Put widgets in it. Drag a widget onto the Section or onto a tab's name, and drag one out onto the page to take it out. Or select the widget, press **⋯**, then **Move to…**: the dialog lists the page, each Section and each tab, and you choose where it goes. A widget added from **Add to page** while a Section or Tabs is selected goes into it. The dialog says "Adds to" the container.
3. For Tabs, add and name the tabs in its settings: 1 to 8 tabs, each name up to 40 characters. **Opens first** says which tab shows when the address and memory say nothing. Tabs are drawn with an **Underline** or as **Pills**, and **Remember the last tab** makes each person find the tab they left on this device.
4. To remove a tab that holds widgets, choose it in the settings. It asks where they go: **Move and remove the tab**, with **Move them to**, or **Remove it with its widgets**. Tabs keeps at least one tab.
:::

A Section and Tabs each have a grid of twelve columns inside, and a widget in one is placed and sized there. A Section or Tabs goes one level deep: it cannot be put in another. **Duplicate** and **Remove** on a container take what it holds, and **Undo** brings it back. The outline under **On this page** shows what each Section and tab holds. A container stacks what it holds when it has less than 28 rem of room.

## Put buttons in a toolbar

:::steps
1. Add an **Action group** from **Take action**, or select a **Button** that has other buttons on the page and press **Group with other buttons…** under **Buttons together**. The dialog lists the other buttons of the page, those on the same row first, marked "(on the same row)" and already checked. Check the ones to join: **Group the buttons** is off until one is checked. Each button keeps its label, look and action, and the group, named **Actions**, takes the place of the button you started from. **Undo** takes the grouping back as one step.
2. In the Action group's settings, add buttons to **Buttons**, up to 8. Each button has its own **Display**, **Actions** and **Rules**. Drag to reorder them.
3. Under **Look**, choose **Line up** as **Left**, **Right** or **Spread**, and **Show up to** how many buttons show before the **⋯** menu, which holds the rest.
:::

A Record detail that has buttons of its own offers **Move these buttons to an Action group above it** under **Buttons together**.

## The result

The page is saved as you work. **On this page** lists what you placed, in the order of the outline, and the page in the middle shows it as a reader will see it. A page that looks right at desktop width may stack differently on a phone: see [Set the phone and tablet layout](set-the-phone-layout).

## If it does not work

- **A widget will not drop where you let go.** Another widget or a limit is in the way. The dashed place shows where it would land. If the note says it could not be moved, use **Move to…** or the **Layout** numbers.
- **"A page holds at most 30 widgets."** Remove one, or put some on another page. A container and what it holds each count.
- **Dragging out of Add to page does nothing on a touch screen.** The drag is for a mouse or a pen. Press the tile, then drag the widget on the page.
- **Dragging out of Add to page does nothing on an empty page.** Press the tile instead.
- **A Section would not go into a Section.** Sections and Tabs hold widgets, not other Sections or Tabs.

## Related

- [Building an app](../../reference/screens/build/app-builder-editor): the keys and the panes.
- [The settings pane](../../reference/app-builder/inspector): the Layout panel and the rules of a widget.
