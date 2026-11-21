---
title: App Builder
topic: build-screens
description: "Apps made in the console: pages of widgets over tables, with filters that readers set."
---

An app made in the console is a set of **pages**. A page is a grid of **widgets**: a table, a list, a number, a chart, a pivot, a block of text. Each widget reads from a table (or from a saved query) and shows what the person who opened the app is allowed to see. Nobody writes code, and nobody makes a screen for each person: two people who open the same app are shown the rows their groups allow.

Apps made here and apps written in the repository are the same kind of thing once deployed. See [published apps](published-apps) for where an app is served and who may open it.

## What is on a page

- **Widgets** sit on a grid of twelve columns. Each has a place and a size. On a phone the widgets stack in one column, in the order of the page.
- **Filters** run along the top of the page: a clinic, a range of dates, a word. A person who opens the page sets them, and every widget that is bound to a filter asks again. A filter has a value it starts with, so the page always says what it is showing.
- A widget is bound to a filter on purpose. When you add a filter, or a widget, the builder binds every widget whose table has that filter's column, and says which. A widget over a table without the column is left alone.

## Making an app

**Make an app** on the App Builder screen asks for a name and an address. The address is where the app's interface is kept, and it does not change when the name does. The new app opens in [the builder](app-builder-editor) with an empty first page.

Nothing a person sees changes until the app is **published**. Until then the builder works on a draft, and a reload keeps it.

## Kinds of page

A page is one of four kinds, set in the page's own settings:

- **Page** is a page of the app, in its menu. It opens on nothing in particular.
- **Record page** is a page of its own for one record, such as one invoice. It is opened from a row, and its address names the record, so a link to it opens the same invoice. It is not in the menu.
- **Side sheet** opens beside the page it was opened from, on one record. The page stays in view behind it, which is how a table of invoices can open any one of them without losing your place. **Back** closes it, and a link to it reopens it.
- **Modal** opens over the page. It is for a short job: a form, or a question. A modal opens on one record, or on none when it makes a new one.

A record page, a side sheet and a modal that opens on a record each say the table that record is from. Everything on such a page works on the record it was opened on: **Record detail** shows it, a **Form** changes it, a **Button** acts on it.

## Showing and changing one record

- **Record detail** shows one record: a heading, a status chip, its fields in the order and the groups you choose, and **actions** along the top. Put it on a side sheet and a table can open any of its rows into it.
- **Form** makes a record or changes the one that is open. Each field's control is picked from its column's type: text, a number, a date, a choice from the column's values, and for a column that points at another table, a search over that table's rows by name. A column that is required is asked for, and the form says what is wrong beside the field. **The button says** is in the form's Display, and **When it is sent** in its Actions.
- **Button** does one thing when it is pressed. Its look is **Main**, **Plain** or **Careful**.

Add a form, a detail or a button from **Add to page**. When a page shows a table, the list suggests what goes with it: "Invoice detail", "New invoice form".

## What happens when something is pressed

A button, a row's action and a form's **When it is sent** are each written as **steps**, from the **Actions** tab. Steps run in order:

- **Ask to confirm.** A question first, in your words, with the record's own fields filled in: "Mark {number} as paid?". The question may ask for something, such as a reason, and the steps after it can use the answer.
- **Update the record.** Say which record (this one, or the one that was clicked), which fields, and what each becomes: a value you type, **Today**, **Now**, who is pressing, a field of the record, or what was asked. A step changes the fields it names and nothing else.
- **Add a row**, and **remove the record**, in the same words.
- **Run a workflow** or **run a script**, giving it what it needs from the record. It starts when the changes above are saved, so a failed update never starts it.
- **Open a page.** A side sheet, a modal or a record page, on the record that was clicked, or on this one.
- **Close** the side sheet or modal that is open.
- **Show a message**, such as "Invoice marked paid".
- **Narrow the page.** Set a filter of the page to what was clicked, such as the clinic of a bar.
- **Show the rows behind it**, for a number or a point, in a side sheet. See [dashboards](../data/dashboards).

The steps that change data are all done together or not at all. The steps that move the reader (open, close, message, narrow, show the rows) come after, in the order written. If something fails the action stops, the page says what went wrong in the words the server gave, and nothing after it runs.

### Only when it makes sense

An action can say **when** it may be pressed, as a sentence: "Status is Unpaid", "Total is more than 5000", "Paid on is empty". When there is more than one, all must be true. A button that may not be pressed is dimmed, and each row of a table shows its own. The server checks the sentence again against the record as it is when the button is pressed, so an invoice that someone else paid a minute ago is refused with "It can't be done now: Status is Unpaid".

A widget can also be **shown only when** something is true, such as "the current user is in Practice managers", from **Rules**. This changes what is drawn. It is not security: a person who isn't shown a widget can still read whatever their groups let them read. Who can read is set by the table's row rules.

## When a row is clicked

A table or a list says what a click on a row does, from **Actions**, **When a row is clicked**. The usual choice is **Open record detail**: pick the side sheet or record page to open, and the row's record goes into it. If the table has no detail yet, **Make an invoice detail** makes a side sheet with a Record detail on it, with the table's columns already in it, and opens it on click.

A table or a list can also have **row actions**: buttons at the end of each row, and in the detail of that row. Each is an action in the words above, with its own question and its own **when**. A row where the action may not be pressed doesn't offer it.

## Who can press a button

Whoever may open the app may press its buttons. The button is the permission, not the person's role:

- An action changes **only the fields it names, to the values it names**. A button that sets Status to Paid can't change the Total, whoever presses it.
- It works only on **rows the person may read**. A front-desk person at one clinic can mark their clinic's invoices paid, and is told there is no such invoice for another clinic's.
- It does **not** need the person to be allowed to change that table, or to start workflows. A front-desk account that may read invoices and may not edit them can still press **Mark paid**.
- Its **when** is checked again on the server, against the record as it is now.

In the builder, the draft's buttons are pressed only by someone who may edit the interface. A published app's buttons are the deployed ones, and the people the app is shared with press those. Each change is kept in the audit trail with the app, the page and the button's name.

Because a button is a grant, read what it names before you publish.

## Changing an app's title

**Rename** in the list of apps changes the title shown in the interface and in the app's own description. The app's address does not change, and the dialog says so: links and bookmarks keep working. Changing the address itself is not offered yet.
