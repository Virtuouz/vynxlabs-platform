---
title: The settings pane
description: "The pane beside the page in the App Builder: a widget's menu, its Data, Display, Actions and Rules tabs, the Layout panel, who sees a widget and who may press it, what a row click does, the steps an action takes, and Add a form."
subjects: [app-builder, pages]
---

The settings pane is on the right of [the workbench](../screens/build/app-builder-editor). It sets whatever is selected. Choosing a page, and no widget, shows [the page's own settings](pages). Choosing a widget shows the same pane for every kind of widget: it is drawn from what the widget says it can do, so a widget that comes from another pack has the same tabs and controls. What each kind of widget offers in its tabs is in the pages about the widget.

A widget is selected by clicking it on the page, or its name in **On this page**. In a window narrower than 1024 px the pane is a sheet titled **Settings**, which opens when a widget is chosen. **Hide the settings** folds it away.

::screenshot{name=console/app-builder-settings alt="The settings pane of a table: the icon, name and kind at the top, the Data, Display, Actions and Rules tabs, and under Data the table's rows and what it shows."}

## The header

The pane begins with the widget's icon, its name and its kind, such as "Table". A widget from a pack other than the one Volvel ships says the pack's name after the kind. A container adds what it holds, such as "holds 3 widgets". The **⋯** button, named "More about" and the widget's name, holds:

| Item | What it does |
| --- | --- |
| **Layout** | Opens the Layout panel below. |
| **Duplicate** :kbd[Ctrl]+:kbd[D] | Copies the widget. On a Section or Tabs it copies what it holds. |
| **Move to…** | Opens a list of the places the widget can go: the page, each Section and each tab. It is drawn when there is a place to move to. |
| **Remove** | Takes the widget off the page. On a Section or Tabs it takes what it holds. **Undo** brings it back. |

The menu is not drawn when the workbench is read only, and every field of the pane is then disabled.

A widget whose kind no pack declares shows "There is no widget called" and its type, "A pack that declares it may be missing from this workspace. Its place on the page is kept, and nothing is drawn.", with **Remove it**.

## The tabs

A widget has some of **Data**, **Display**, **Actions** and **Rules**. A tab a widget has nothing in is not drawn. A Text widget's first tab is called **Content**. A button opens on **Display**, since its **Data** tab only says "A button reads no rows. What it does is on the Actions tab."

A tab has a dot when something in it needs fixing, such as a table that is gone, an action with no steps or a group that no longer exists. Pointing at the tab gives the reason, and inside the tab a notice, **Needs fixing**, lists each. A tab with nothing to fix has no dot, however much is set in it.

Each tab is groups of rows. A row shows its value and opens a small editor. The settings that most people leave alone are under a **More … options** disclosure at the foot of the tab, such as **More data options**, with a line of their names.

| Tab | What it holds |
| --- | --- |
| **Data** | What the widget reads: the table or query and the rows it uses, filters, what it shows, and where it gets a record. |
| **Display** | How it looks: the heading, columns, labels, style and, for a button, its icon and position. The **Title**, 100 characters at most, and the **Caption**, 200 characters at most, are here. The title can also be changed by clicking it on the page. |
| **Actions** | What happens when it is pressed, clicked or sent: see below. |
| **Rules** | Who sees it and who may press it: see below. |

## Rules

The **Rules** tab is the same for every widget.

| Group | What it does |
| --- | --- |
| **Show this** widget | **Always**, or **Only when…** with a sentence of conditions joined by **And**. A condition can compare a value of the record that is open ("this record's…") or of the current user. The note says "Conditions can use the current user or the record that is open." |
| **Who can see it** | "Everyone who can open the app", or limited to groups with **Limit to a group**, then **Group**. A chip names each group, with a × to remove it, and shows "not found" in red when the group no longer exists. The picker lists the tenant's groups, marked **Team** or **End users**, and "This tenant has no groups yet. Make one under Groups." |
| **Who can edit** | For a Record detail that can be edited in place: the groups that may change its fields. |
| **Can be pressed when** | For a widget that runs an action: **Always** or **Only when…**. "Shown but grayed out otherwise, with the reason as a tooltip." |
| **Who can run it** | For a widget that runs an action: "Anyone who can open the app", or groups. "Checked on the server too: hiding the button is not what stops other people." |
| **Open row rules** | A link to the row rules of each table the widget reads, when you may go there. |

Hiding a widget is not security. The pane says so under **Who can see it**: "Hiding a widget isn’t security. What rows each person receives is decided by the" table "row rules." A person who is not shown a widget can still read what their groups let them read. **Who can run it** and **Who can edit** are checked by the server, and a person outside the groups is refused with "Only" the groups "can do this." A widget with several actions, such as an Action group, has the last two for each.

## Actions

The **Actions** tab says what a widget does when something happens: a button is pressed, a row of a table is clicked, a form is sent. An action is a list of **steps** and may ask a question first. At the foot of the tab a card summarizes the widget's rules, with **Rules** to open that tab.

### The steps

| Step | What it does |
| --- | --- |
| **Update the record** | Sets fields of a record: this one, or the clicked one. Each field takes a value you type, today, now, who is pressing, a field of the record, or what was asked. A step changes the fields it names and nothing else. |
| **Make a record** | Adds a row to a table. |
| **Remove the record** | Removes a record for good. |
| **Run a flow** | Starts a flow that can be run by hand, giving it what it needs. |
| **Run a script** | Starts a script of the workspace. |
| **Open a page** | Opens a page, a side sheet or a modal, on the clicked record or this one. |
| **Close** | Closes the side sheet or modal that is open. Not offered on a page. |
| **Show a message** | Says something in a notice. |
| **Filter the page** | Sets a page filter to what was clicked. |
| **Show the rows behind** | Opens the rows behind what was clicked, in a side sheet. |

An action can also **Ask to confirm** first, with a question in your words and the record's fields filled in, such as "Mark {number} as paid?". A flow or script input is typed by its schema. A step that is not offered where it would do nothing is not in the list.

The steps that change data are done together or not at all. The steps that move the reader come after, in the order written. If a step fails the action stops and the page says why. The canvas never runs actions; **Preview** does.

### When a row is clicked

A table or a list has **When a row is clicked**, with four choices:

| Choice | What it does |
| --- | --- |
| **Do nothing** | A click on a row does nothing. |
| **Open record detail** | Opens the **Record detail** page chosen, with the row's record. If the table has none, the editor offers to make one with the table's columns in it. **Edit its layout** shows that page in the workbench. **Opens as** is **Side sheet** ("keeps the table in view, so people can step through records"), **Full page** ("takes the whole window, with a way back to the table") or **Modal** ("sits over the table and asks for attention until it is closed"). |
| **Go to a page** | Goes to a page of the app's menu. Off when the app has no such page. |
| **Run an action** | Runs a flow or script chosen from the list. |

While the **Actions** tab of such a widget is open, the side sheet it opens is drawn over the canvas, with a stepper to move between rows.

The **Actions** tab of a table has more groups under it: **Row actions** (buttons at the end of each row, "Shown at the end of the row on hover, and in the detail sheet"), **Buttons above the table** ("The buttons move with the table") and **Selecting rows**, with **Let people select several rows** ("Adds checkboxes and lets actions run on all of them"). Each button there has the same steps. The widget pages describe them.

## The Layout panel

**⋯**, then **Layout**, replaces the pane with the widget's place. **Back to settings** returns. The header reads the kind, then "Layout".

| Group | Fields |
| --- | --- |
| **On desktop** | **Column**, **Row**, **Width** and **Height**, in cells of the page's twelve columns. The note gives the widget's limits, such as "A button is 2 to 12 wide and 1 to 2 high, on twelve columns", and says the fields are for exact placement and for keyboards. A number past a limit is kept at the limit, and the pane says so. Inside a Section or a tab the columns are the container's own. |
| **Smaller screens** | **Tablet** and **Phone**, each **Automatic** or **Custom**. **Custom** starts from the place the widget has now and shows four numbers. **On narrow screens**: **Automatic**, **Keep**, **Full**, **Stack** or **Hide**, with a line that says what the choice does. |
| **Priority** | A number. "Higher stays nearer the top when the page stacks on a phone." Empty is automatic. |
| **Name in the outline** | Only for a widget with no frame, such as a button: its name in **On this page**. "It isn't drawn on the page: a button says what its label says." |

See [Set the phone and tablet layout](../../how-to/app-builder/set-the-phone-layout) for what each choice does.

## Add a form

**Add a form** is a dialog that makes a form over a table. It opens when you choose **Form** in **Add to page**, or the suggestion for a new record's form, on a page of an app.

| Field | What it takes |
| --- | --- |
| **What should this form do?** | **Create a record** ("Adds a new" record) or **Edit a record** ("Changes the" record "that is open"). |
| **Table** | The table the form writes to. |
| **Fields** | A checkbox for each column, in order, with **Set automatically** shown for `id`, `created_at` and `updated_at`. "Choose at least one field." when none is checked. A field can be moved with Alt and the up or down arrow. |
| **Opens as** | **Modal** with the form's title, or **On this page**. |
| **After saving** | For a modal, **Close and say** a message or **Just close**; on the page, **Say** a message or **Say nothing**. **Message after saving**, 200 characters at most, is the message. |
| **Title** | **Title of the modal and its button** for a modal, else **Title**. Required, 60 characters at most. When a page of the app already has that name, a hint says so. |

A preview on the right draws the form. Under it: "Required marks and checks come from the table. Labels, help text and sections can be changed after." The footer says where the form's button goes. **Create form** makes it, and **Cancel** closes the dialog.

## Text on the page

A Text widget is written where it is: double-click it, or press **Edit on the page** in its settings. **Done** keeps what was written as one change to undo. **Cancel** or :kbd[Esc] leaves the text as it was. Leaving with changes asks **Keep writing** or **Discard**.

## Related

- [Pages and their settings](pages).
- [Lay out a page](../../how-to/app-builder/lay-out-a-page): Add to page, Section, Tabs and Action group.
- [Building an app](../screens/build/app-builder-editor).
