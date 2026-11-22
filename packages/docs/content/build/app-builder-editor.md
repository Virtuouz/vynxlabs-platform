---
title: Building an interface
topic: build-screens-editor
description: "The builder for one app: add widgets to a page, group them in sections and tabs, place and size them, and set each one in Data, Display, Actions and Rules."
---

The builder shows the page as the people who open the app will see it, with its search and filters. Beside it is the **inspector**, which sets whatever is selected. The page, its filters and its widgets are saved as a draft as you go. One row along the top holds the app's name (click the pencil to rename it), how many draft changes there are, the **Desktop**, **Tablet** and **Phone** switch, **View as**, **Undo** and **Redo**, **Preview** and **Publish**, which checks the app before it does anything.

## Add to page

**Add to page** opens with **suggestions** for the page's table: when the page shows invoices, it offers a search over them, a detail, a New invoice form. Click one to add it. Below the suggestions it lists the widgets by what they are for, each with a line about it, and has a search. The search reads "Find something to add, or describe what people should do": type "let people mark invoices paid" and the widgets whose name, description or **good for** examples use those words come first. Words are matched against what the builder knows, and nothing is sent anywhere. A preview beside the list shows the widget under the cursor, what it is good for, and which table it would start on. :kbd[↵] places it at the end of the page, or drag it to place it anywhere. The list:

- **Work with records**: a table, for many rows, dense and sortable; a list, for rows as cards; **Record detail**, for one record's fields and actions; a **Form**, to make or change a record.
- **Take action**: a **Button**, for one action: update, open, run a workflow; an **Action group**, for several buttons together as one toolbar; **Approvals**, for requests waiting for a decision. Say "sign off" or "review" in the search and it comes first. When the workspace has a workflow with an approval step and the page has no Approvals widget, the suggestions offer it.
- **Understand data**: a stat, for one number; a chart, for a trend or a comparison; a pivot, for a value across two breakdowns.
- **Organize**: a **Section**, to group widgets under a heading; **Tabs**, to switch between views in one place; **Search and filter**, a search box and filters for the page.
- **Content**: text, for headings, instructions and help.

A widget that comes from a pack other than the one Volvel ships says the pack's name beside its title. It is set the same way as the others. Click one to place it at the end of the page, or drag it out of the list onto the page: the list closes as you pick it up, the page shows where it would land and moves what is in the way aside, and it lands where you let go. Let it go off the page, or press :kbd[Esc], and nothing is added. When a Section or Tabs is selected, a widget you add is put into it. Near the top or bottom of the window the page scrolls, so you can reach a place out of sight.

## Selecting, moving and sizing

Everything is done on the page itself.

- **Click** anywhere on a widget to select it. :kbd[Esc] lets go.
- **Drag** a widget to move it, and by its corner to stretch it. While you do, a note says its size and place, such as "8 × 5 · col 1 · row 3", and the widgets in its way move aside as it travels.
- The **arrow keys** move the selected widget one cell. :kbd[Shift] with an arrow makes it one cell wider, narrower, taller or shorter. The change is read out for screen readers.
- Click the **title** to rename it where it is.
- :kbd[Ctrl]+:kbd[D] (:kbd[⌘]+:kbd[D] on a Mac) duplicates it. :kbd[Delete] removes it.
- **Undo** and **Redo**, and :kbd[Ctrl]+:kbd[Z], take back a move, a size, a removal or a duplicate. Each button says what it would undo, such as "Undo moving Invoices".

A widget can't be made smaller than it can be read, or larger than it can be drawn. Widgets that would lie on one another move out of the way.

Under the **⋯** of the selected widget, **Layout** sets the same numbers exactly (and the phone, see below), **Duplicate** copies it and **Remove** takes it off.

A side sheet or a modal is sized the same way: drag the edge of its frame, and it snaps to **Small**, **Medium**, **Large**, **Extra large** or **Full**. The same choice is **Size** in the page's settings. The size is the one it opens at when the app is served, and its widgets are laid out on its grid as you placed them. They stack in one column only where the screen is narrow, as on a phone.

A **Button**, and an **Action group**, sit in their own cell. The **Position** on their Display tab is a three by three picker: top, middle or bottom, by left, centre or right.

## Sections, tabs and buttons together

A **Section** is a heading with widgets under it. It can have a line under the heading, and it can be **folded**: turn on **Can be folded**, and whoever reads the page may fold it away. A reload keeps it as they left it. **Starts folded** shows it closed the first time. **Tabs** shows one view at a time. Each tab has its own widgets, and the one that is open is in the page's address, so a link opens the same tab. Add and name the tabs in the inspector.

A Section is **Plain** or a **Card**. Tabs are drawn with an **Underline** or as **Pills**. For Tabs you can also say which tab **Opens first** (the address still wins), and **Remember the last tab**, so each person finds the tab they left on this device.

A Section and Tabs each have their own grid of twelve columns inside them. A widget in one is placed and sized there, and moves with it. They go one level deep: a Section is never put in another Section, or in a tab.

- **Drag** a widget onto a Section or onto a tab of Tabs to put it in, and out onto the page to take it out. The container shows where it would land.
- From the keyboard, **⋯ › Move to** lists the Sections and the tabs on the page, and "The page" to take it out.
- The **outline** shows what each Section and tab holds.
- A container grows with what it holds. **Duplicate** and **Remove** on a container take what it holds, and **Undo** brings it back.

An **Action group** puts related buttons in one toolbar, the first as the main one. Each button is written as any other action, with its own **when**, and has its own Display, Actions and Rules. Line them up **Left**, **Right** or **Spread**, and choose **Show up to** how many: the rest go under **⋯**, so "Mark paid, Send invoice, Edit" show and Void waits in the menu. A button's style is chosen by looking at it: **Main**, **Normal**, **Quiet** or **Danger**, and it may have an **icon**. What doesn't fit the width goes under **⋯**, on a phone too. When a Button is selected and there are buttons beside it, the builder offers to group them. An Action group is for apps: a dashboard doesn't offer it.

## The inspector: Data, Display, Actions, Rules

The inspector is the same for every widget. It is drawn from what the widget says it can do, so a widget that comes from another pack has the same tabs and the same controls. It begins with the widget's icon, its name and kind, and **⋯**. A tab with nothing in it is not shown. A tab has an orange dot only when something in it needs fixing, such as a table that is gone, an action with no steps or a group that no longer exists; point at the tab, or open it, for what is wrong. A tab with nothing to fix has no dot, however much is set in it.

Settings are grouped rows, each showing its current value. A click on a row opens a small editor for that setting, and the row shows the new value when it is closed. The ones every widget shares are the same everywhere:

- **Page filters** are chips: "Follows 4 page filters", one for each, and a dashed chip for a filter the widget doesn't follow. Click one to switch it off or on.
- **Conditions** are sentences as chips, such as "Status is Unpaid" with **+ Condition**. The editor offers the column's own words: for a choice column its values with how many rows each has; for a date, "is in the last", "is before", "is after", "is between" and "is empty".
- **Sorted by** is Newest or Oldest, with **+ Then by** and **Show at most**.
- **Numbers** are one picker wherever a number is shown: each choice shows the real number (Money, Money whole, Money short, Number, Percent, Plain), with the currency and whether the amount is kept in cents.

- **Data** is what the widget asks of the tables. Pick the **Source** (a table, or a saved query). Then, in the widget's words: **Value** ("Sum of Total", "Average of Total", "Count"), **Break down by** (a column, and for a date how often: "Issued on · Weekly"), and **Only include** ("Status is Unpaid"). Under **More options** are how it is sorted and how many it reads.
- **Display** is how the answer looks: the **Chart type**, how **Numbers look like** (a number, money, a percent, and whether the money is kept in cents), a line under a stat, a column's name and format in a table. **More options** holds the rest.
- **Actions** lists what a person can do with the widget, and what happens: "When a row is clicked", "When clicked", a form's "When it is sent", and the buttons on a record detail or at the end of a row. Each is a few **steps**, written in sentences, with a preview of what the person will be asked. See [apps made in the console](app-builder).
- **Rules** says when a widget is shown, as a sentence ("the current user is in Practice managers"), and what hiding is: it is not security. A widget that is hidden still reads whatever the person may read. What a person may read is decided by the table's own row rules, and the tab links to them. In the builder a widget that wouldn't be shown is drawn faded, with "Shown only when …".

### Pages that open on a record

A page's own settings say its kind: **Page**, **Record page**, **Side sheet** or **Modal**. The builder shows a side sheet or a modal on a sample record, chosen from the table's rows, so the detail and the form have something to show. **Pages** lists them beside the pages of the menu, with the kind under each name.

When a table says what a click does, choose **Open record detail** and the detail's own **Opens as**: **Side sheet**, **Full page** or **Modal**. The table's heading then reads "Click opens Invoice detail", and the detail's footer steps through the records it was opened from.

Most changes are a few choices. To make "Invoiced by week" a line of the sum of Total by the week of Issued on: Data, Source Invoices, Value Sum of Total, Break down by Issued on · Weekly; Display, Chart type Line.

### What each widget offers

Display shows only what fits the data, and says why when something doesn't.

- **Chart.** Data asks three plain questions: **Measure**, **For each** and **Split into colors**, then **Order** ("Biggest first", "Smallest first", "By name") and **Show at most**. A chart type that can't work with the data is greyed, with what it would need. Display has **Numbers**, **Colors** (the app's theme, or a palette), **Show values on bars** and **Show axis titles**. A chart over time also offers **Compare with the period before** (a dashed line, by the page's date range), **Smooth the line** and **Mark each point**; for a date, "For each" offers day, week, month or quarter, and **Include periods with nothing** draws the empty ones as zero.
- **Stat.** **Compare with the period before** is one switch, followed by **Show change as** a percent or an amount, and **Going up is** Good or Bad, which sets the change's colour.
- **Goal.** **Value**, **Goal** (a fixed amount, or a column of the result), **Show the percentage**, and **When reached, the bar** turns green.
- **Table.** Display lists the columns as rows: an eye hides one, a handle moves it, and a click opens it, as does a click on its heading on the page. A column has its **heading**, whether it is shown as text or as a **badge** (a chip with a dot, in a colour for each value), **alignment**, **width**, **Sort by clicking the heading**, **Show a total at the bottom** and **Hide on phones**. Under it are the **row height** (Comfortable or Compact), **rows at a time**, what an empty table says, and **striped rows**. Actions holds what a row click does, the **row actions** (each says when it may be pressed), **buttons above the table**, which replace a separate Action group there, and **Let people select several rows**: with it on, a row action runs on every row selected.
- **List.** A sample row shows the places: **Title**, **Under the title**, **Right**, **Badge** and **Picture**, each filled with a column. A list is drawn as a **List** or as **Cards**.
- **Pivot.** **Measure**, **Rows** and **Columns**, with a small preview, **Shade cells by size**, and totals for each row and column.
- **Record detail.** Its record is the one the page was opened with, **the row selected in a table on the page** (the detail follows as people click rows), or **the current user's own record**, matched by email against a column of the table. Fields are a list in sections, **1, 2 or 3 across**, and **Let people edit fields in place** lets a person change what is shown on the page, on the server's terms as an action's.
- **Approvals.** Data is **Which requests**: the workflows to ask of, as chips with their real titles (none chosen is every workflow with an approval step, including those made later), and **Whose**: **Theirs to decide**, or **Every one, theirs or not**. Display is **Looks like** (rows, cards or a queue), what a click opens (a side sheet, a modal or nothing), **What each shows** (the step's own details as a list: drag to reorder, the eye to hide; left alone, the first four) and **Decided ones** (a Waiting and Decided switch, with who decided and why, and what it says when nothing waits). Actions is **Deciding**: what the two buttons say, **Ask why** (never, when rejecting, or always), **Ask before approving**, and **Go to the next one**. **Who may decide is set on the workflow's step**, not here; the drawer says so and links to the workflow. While you build, the buttons don't run, and a page with nothing waiting shows a sample, marked as one.
- **Form.** Fields and sections with what each requires, what **Submit says**, and **After saving**.
- **Button.** What it **says**, an **icon**, its style, **Full width**, and its position. Its actions are shown collapsed, one line per step.
- **Search and filter.** Every filter is in one list, each with a line on what it does ("Search invoices: looks in Number, Client code, Payment ref"). A filter's editor sets its label, kind and starting value, and which widgets it narrows, as checkboxes. **Filters sit** in a row, or behind a "Filters" button.
- **Text.** See below.

### Who can run it, and who can see it

The Rules tab has two kinds of sentence.

**Who can run it** is for anything that acts: a button, a row action, a button of an Action group, a form's submit, and a chart's click. Name one or more groups, of members or of end users. Left empty, anyone who may open the app may run it, as before. With groups named, **the server refuses everyone else**, a call made straight to the API too. Someone outside them sees the button greyed, with "Only Billing can do this". It only narrows: the rows a person may read, the fields the action names and its conditions still hold. A named group that no longer exists runs for nobody, and the publish check says so. **Can be pressed when** is separate: it is about the record, not the person.

**Who can see it** shows a widget only to members of some groups. It decides only what is drawn, so it is not security: a person who isn't shown a widget can still read whatever the table's row rules let them. The tab says so, and links to the rules. In the builder a widget shown only to some carries a small tag.

To hide a button instead of greying it, use **Show this button** under **Only when**.

### Search and filter

A page's search and filters are a widget: **Search and filter**, from **Add to page**, wherever you want the bar. A page can have more than one; each filter's name is used once on the page, and the page has at most eight.

In its Data tab, **Add a filter** makes one of:

- a **search**, for words typed into a box. Pick the table's text columns it looks in ("Number, Client, Payment reference"): a row is kept when any of them has the words;
- a **choice**, from a column's values, such as the Status;
- a **date range**, a **word** or a **number**, each with the value it starts with.

**Offer "Clear"** in Display puts a button on the bar that sets every filter back to how it starts.

Every widget whose table has the column follows a filter, and the inspector says which. A widget over a table without the column is left alone, and a widget takes a filter only where it is bound to it. If a widget should always be narrowed, say to unpaid invoices, put that under its own **Only include**, where it adds to the filters. The reader's words and choices are in the page's address, so a reload or a shared link keeps them.

## Text, in Markdown

A **Text** widget is written in Markdown, with the components the documentation uses: alerts, steps, tabs, folds, terms, keys and fields. Choose how it looks by looking at the tiles: **Plain**, **Note**, **Warning** or **Tip**. A note, a warning or a tip is drawn with a rail and an icon.

The editor is the same one the documentation uses. **Source** shows the Markdown, **Preview** what readers will see, and the **Insert** menu adds a component (an alert, steps, tabs, a fold) with help for what it takes. A line that can't be drawn is said in words beside the line. **Edit on the page** opens the editor in place, so you write over what readers will see.

```
:::alert[In dollars]{type=info}
Every amount here is in dollars, as the clinics invoice.
:::
```

See [components](../reference/docs/components) for what each takes.

## Pages

An app has one or more pages, shown as tabs above the page. Add, rename, reorder and remove them from the page's own menu. **Pages** is on the left with a **+**, each page one row: its icon, its title and its kind. A page's settings give its **kind** (four tiles), its **title in the app's menu**, an **icon** from the app's set, and, for a sheet or a modal, its **size**. **+ Page** offers starters made from a table: "A list of Invoices" is a search, a table, a detail sheet and a New invoice form, already joined up; "An Invoice record page" is one invoice, with its actions. A page can name a page of the workspace's documentation as its **help**, and the app then shows that page.

## The phone

Switch the builder to **Phone** (or **Tablet**) to see the page as it will be drawn there, in a device frame. A banner says "Phone layout is made from the desktop one", and how many widgets were changed by hand.

By default each screen is **automatic**: the phone page is made from the desktop one, with no work. Widgets are stacked in the order of the page, and a table is drawn as a list (a column can be left out there with **Hide on phones**). The filters collapse behind "Filters" and a count. From **⋯ › Layout**, a widget can be set by hand for **Tablet** or **Phone**: the place on the grid, as four number fields. For narrow screens, a widget can be **Full width**, **Stack below** or **Hide**, and has a **priority**: a higher one is kept nearer the top when the page stacks. A widget that is hidden is a dashed place with its name ("By clinic is hidden on phones"), so it isn't forgotten.

## Publishing

**Publish** opens **Ready to publish**, which checks the app and says in words what is missing:

- data sources that can't be found, or tables that have lost a column;
- actions that are not complete, and forms that are not valid;
- a group that **Who can run it** names and that no longer exists;
- a warning for widgets hidden on a phone.

Below the checks is what it will publish ("3 changes"). **Try as Billing first** opens the app **as a group sees it**. Then **Publish** deploys the app and its interface. Before that, the draft is only yours. The people who open the app see the published version, and the rows their groups allow.

### View as

**View as** in the header shows the page, its widgets, rules and actions as a group sees them: widgets that group may not see are gone, and buttons it may not run are greyed with the reason. It changes what you see, and **View as Me** brings you back.

### Earlier drafts

**History** in the header lists the earlier drafts that were kept. Pick one, and **Restore** it as the current draft. Restoring doesn't publish it.

See [App Builder](app-builder) for what an app is, and what the builder does not do yet.
