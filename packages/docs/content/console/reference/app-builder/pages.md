---
title: Pages and their settings
description: "The four kinds of page an app has, the Add a page dialog and its starts, a page's own settings, how pages are ordered and removed, and the limits."
subjects: [app-builder, pages]
---

An app is a set of pages. A page holds widgets on a grid of twelve columns. A page is one of four kinds, and the kind decides how it is reached and whether it is in the app's menu. This page lists the kinds, the dialog that adds a page, the settings a page has of its own, and what the builder does to the pages around one that is removed. The widgets on a page are set in [the settings pane](inspector).

The pages are on the left of [the workbench](../screens/build/app-builder-editor), under **Pages**. Choosing one shows it on the canvas and its own settings in the pane on the right, with the page's name and kind at the top.

::screenshot{name=console/app-builder-page-settings alt="The settings of a side sheet page: the four page type tiles with Side sheet chosen, its title, its size and its help topic, with Display and Data tabs above."}

## The four kinds

| Kind | Where it appears | Opens on |
| --- | --- | --- |
| **Page** | In the app's menu, with its **Icon**. | Nothing in particular. |
| **Record page** | Not in the menu. It is opened from a row, or by an action, and its address names the record. | One record of a table. |
| **Side sheet** | Beside the page that opened it, which stays in view. Its address keeps the page it is over. | One record of a table. |
| **Modal** | Over the page that opened it. | One record of a table, or none, for a modal that makes a new record. |

The words under the tiles say: "Record pages, side sheets and modals open on one record, passed in by whatever opened them." Everything on a page that opens on a record works on that record. A page has no filters, rules or visibility of its own: filters are widgets, and who sees what is set on a widget.

A served app's address names the page and the record: a page is `<page>`, a record page `<page>/<record>`, and a side sheet or a modal is in the query as `?sheet=<page>&record=<id>` or `?modal=<page>`. A link to any of them opens the same view.

## Add a page

The **+** beside **Pages** (**Add a page**) opens a dialog of that name. It is drawn while the app has fewer than 20 pages. An empty page offers the same choices as buttons in the middle of the canvas, from the table the app reads most or else the first table.

| Field | What it takes |
| --- | --- |
| **Start from** | One of the three starts below. With no tables in the workspace only **A blank page** is offered. |
| **Table** | For the two starts from a table: the table to start from. Offered when the start is not blank. |
| **Name of the page** | Required, 100 characters at most, with a counter. It is filled from the start, "Appointments" for a list of appointments, and can be changed. |

| Start | What it makes |
| --- | --- |
| **A blank page** | "Start from nothing and add what you need." One empty page. |
| **A list of** the table, such as **A list of Appointments** | "A search, the table, a side sheet that shows a row, and a button that adds one." A **Search and filter** with a search over the table's text columns, when it has any; a **Table** of its rows, 25 to a page, whose row click opens the table's detail side sheet; a button on the table's heading line that opens a modal with a form. It makes the side sheet, with a Record detail on it, and the modal with a **Form**, unless the app already has them for that table. |
| **An** table's row **record page**, such as **An Appointment record page** | "One record's details, and the rows of each table that refers to it." A page of kind **Record page** on the table, with a **Record detail** and, for each table that has a column pointing at it, a **Table** of those rows filtered to this record. At most 6 related tables. |

**Add the page** is off while the name is empty or a table's definition is being read. When the start would make more pages than the app has room for, the dialog says "This makes N pages, and the app has room for M. Remove a page first." If the tables could not be read, the dialog says "The tables could not be read, so a page cannot start from one yet:" and the reason, and that you may ask a tenant admin whether you may read the workspace's tables. A start is one change: **Undo** takes it back whole, and a notice says what was made. When a start is made on an empty page, that page becomes the start's first page.

## A page's settings

Choosing a page, and not a widget, shows its settings with a **Display** tab and, for a record page, side sheet or modal, a **Data** tab. There is no **Actions** or **Rules** tab: a page has no rules of its own.

### Display

| Setting | What it does |
| --- | --- |
| **Page type** | Tiles for **Page**, **Record page**, **Side sheet** and **Modal**. Changing the kind keeps the title and, where it applies, the size and the table of the record. A page made a record page or a side sheet is given the table its widgets read most, else the first table. A page made a modal keeps its own table, or opens on none. |
| **Title in the app menu**, or **Title** for the other kinds | The page's title, required, 100 characters at most. The hint under **Title** reads "A record page, side sheet or modal is not in the menu." |
| **Icon** | Only for a **Page**. **No icon**, or one of 22 icons: Banknote, Boxes, Calendar, Chart, Checklist, File, Document, Folder, Health, Home, Inbox, Mail, Package, Paw, Receipt, Settings, Cart, Stethoscope, Truck, People, Wallet and Tools. Drawn beside its title in the app's menu. |
| **Size** | Only for a **Side sheet** or **Modal**. How big it opens: **Small** 480 px, **Medium** 720 px (the default), **Large** 960 px, **Extra large** 1200 px, **Full**. The edge of its frame on the canvas changes it too. |
| **Help topic** | **Choose a document** opens a picker of the documentation pages of the workspace; **Change** and **Clear** replace and remove it. "None: this page has no Help button." The hint says: "A page of your documentation. Whoever uses the app, and may open that documentation, gets a Help button that shows it." |

A record page has no **Size**, because it fills the page.

### Data

For a record page, side sheet or modal. **Opens on** has one field, **Table of its record**, with the hint "The record it opens on is a row of this table." For a modal it also offers "None: it opens on no record", and the hint is "A modal that makes a new record opens on none."

## Order and removal

- **Reorder.** Drag a row by its grip, or point at it or focus it and use the arrows. The order is the order of the app's menu. The arrows are not drawn with one page, and not while the workbench is read only.
- **Remove a page.** **⋯** at the top of the page's settings, then **Remove page**. It is not offered when the page is the only one. It asks "Remove the page" and its name: "Its widgets go with it. Nothing in any table is touched." If a button or a row click on another page opens this page, the question names each ("Mark paid, on Money") and says it will open nothing until you change it, with a link to each that takes you there. The publish check also fails an action that opens a page that is gone.
- **Undo.** Adding, moving and removing a page are each one change.

## Limits

| Limit | Value |
| --- | --- |
| Pages in an app | 20 |
| Widgets on a page | 30 |
| Filters on a page | 8 |
| Title of an app or a page | 100 characters |
| Related tables on a record page made by a start | 6 |

## Related

- [Building an app](../screens/build/app-builder-editor): the workbench.
- [The settings pane](inspector): what a widget has.
- [Lay out a page](../../how-to/app-builder/lay-out-a-page).
