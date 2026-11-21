---
title: Building an interface
topic: build-screens-editor
description: "The builder for one app: add widgets to a page, place and size them on it, and set each one in Data, Display, Actions and Rules."
---

The builder shows the page as the people who open the app will see it, with its filters. Beside it is the **inspector**, which sets whatever is selected. The page, its filters and its widgets are saved as a draft as you go, and **Publish** says what it would do before it does it.

## Add to page

**Add to page** lists the widgets by what they are for, each with a line about it, and has a search:

- **Work with records**: a table, for many rows, dense and sortable; a list, for rows as cards; **Record detail**, for one record's fields and actions; a **Form**, to make or change a record.
- **Take action**: a **Button**, for one action: update, open, run a workflow.
- **Understand data**: a stat, for one number; a chart, for a trend or a comparison; a pivot, for a value across two breakdowns.
- **Content**: text, for headings, instructions and help.

A widget that comes from a pack other than the one Volvel ships says the pack's name beside its title. It is set the same way as the others. Click one to place it at the end of the page, or drag it out of the list onto the page: the list closes as you pick it up, the page shows where it would land and moves what is in the way aside, and it lands where you let go. Let it go off the page, or press :kbd[Esc], and nothing is added. Near the top or bottom of the window the page scrolls, so you can reach a place out of sight.

## Selecting, moving and sizing

Everything is done on the page itself.

- **Click** anywhere on a widget to select it. :kbd[Esc] lets go.
- **Drag** a widget to move it, and by its corner to stretch it. While you do, a note says its size and place, such as "8 × 5 · col 1 · row 3", and the widgets in its way move aside as it travels.
- The **arrow keys** move the selected widget one cell. :kbd[Shift] with an arrow makes it one cell wider, narrower, taller or shorter. The change is read out for screen readers.
- Click the **title** to rename it where it is.
- :kbd[Ctrl]+:kbd[D] (:kbd[⌘]+:kbd[D] on a Mac) duplicates it. :kbd[Delete] removes it.
- **Undo** and **Redo**, and :kbd[Ctrl]+:kbd[Z], take back a move, a size, a removal or a duplicate. Each button says what it would undo, such as "Undo moving Invoices".

A widget can't be made smaller than it can be read, or larger than it can be drawn. Widgets that would lie on one another move out of the way.

Under the **⋯** of the selected widget, **Layout** sets the same numbers exactly, **Duplicate** copies it and **Remove** takes it off.

## The inspector: Data, Display, Actions, Rules

The inspector is the same for every widget. It is drawn from what the widget says it can do, so a widget that comes from another pack has the same tabs and the same controls. A tab with nothing in it is not shown, and a tab with something to look at says how many.

- **Data** is what the widget asks of the tables. Pick the **Source** (a table, or a saved query). Then, in the widget's words: **Value** ("Sum of Total", "Average of Total", "Count"), **Break down by** (a column, and for a date how often: "Issued on · Weekly"), and **Only include** ("Status is Unpaid"). Under **More options** are how it is sorted and how many it reads.
- **Display** is how the answer looks: the **Chart type**, how **Numbers look like** (a number, money, a percent, and whether the money is kept in cents), a line under a stat, a column's name and format in a table. **More options** holds the rest.
- **Actions** lists what a person can do with the widget, and what happens: "When a row is clicked", "When clicked", a form's "When it is sent", and the buttons on a record detail or at the end of a row. Each is a few **steps**, written in sentences, with a preview of what the person will be asked. See [apps made in the console](app-builder).
- **Rules** says when a widget is shown, as a sentence ("the current user is in Practice managers"), and what hiding is: it is not security. A widget that is hidden still reads whatever the person may read. What a person may read is decided by the table's own row rules, and the tab links to them. In the builder a widget that wouldn't be shown is drawn faded, with "Shown only when …".

### Pages that open on a record

A page's own settings say its kind: **Page**, **Record page**, **Side sheet** or **Modal**. The builder shows a side sheet or a modal on a sample record, chosen from the table's rows, so the detail and the form have something to show. **Pages** lists them beside the pages of the menu, with the kind under each name.

Most changes are a few choices. To make "Invoiced by week" a line of the sum of Total by the week of Issued on: Data, Source Invoices, Value Sum of Total, Break down by Issued on · Weekly; Display, Chart type Line.

### Filters of the page

**Add a filter** on the page makes a **date range**, a **choice** (from a column's values), a **word** or a **number**, each with the value it starts with. A widget takes a filter only where it is bound to it. If a widget should always be narrowed, say to unpaid invoices, put that under its own **Only include**, where it adds to the filters of the page.

## Text, in Markdown

A **Text** widget is written in Markdown, with the components the documentation uses: alerts, steps, tabs and folds. Display has an editor, a preview, and a menu of the components it may use.

```
:::alert[In dollars]{type=info}
Every amount here is in dollars, as the clinics invoice.
:::
```

A line that can't be drawn is said in words, beside the line. See [components](../reference/docs/components) for what each takes.

## Pages

An app has one or more pages, shown as tabs above the page. Add, rename, reorder and remove them from the page's own menu. A page can name a page of the workspace's documentation as its **help**, and the app then shows that page.

## Publishing

**Publish** lists what will change, and then deploys the app and its interface. Before that, the draft is only yours. The people who open the app see the published version, and the rows their groups allow.

See [App Builder](app-builder) for what an app is, and what the builder does not do yet.
