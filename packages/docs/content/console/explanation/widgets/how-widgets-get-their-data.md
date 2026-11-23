---
title: How widgets get their data
description: What a widget reads and in what shape, where the reading happens and as whom, what the console's Data tab decides, and what the reader's clock, limits and refreshes do.
subjects: [widgets, app-builder]
---

A widget on an app page draws rows, a number, a record or a queue of approvals. It does not hold any of them. This page explains where they come from, as whom they are read, and what the builder decides and what the reader's side decides. To do it, follow [Choose what a widget shows](../../how-to/widgets/choose-what-a-widget-shows). Every widget and its settings are in the [generated widget reference](../../../develop/reference/widgets/index).

## The idea

A widget declares what it needs, not where it comes from. A Table needs **rows**. A Chart needs a **summary**: rows gathered into groups with a value worked out for each. A Record detail needs one **record**. Approvals needs the **approvals** waiting for a person. The author of the page fills each need under **Rows it uses** on the widget's **Data** tab, and the page remembers the choice as part of the app.

When someone opens the page, each widget asks the instance for its own data and draws what comes back. The page does not carry the rows. This is why a page saved by one person shows different rows to two readers.

## Where a widget may read from

The **Source** is a table of the workspace, a saved query, or, on a dashboard only, SQL typed into the widget. A widget that needs one record may read the record the page is open on, the row chosen in a Table or List on the same page, or the signed-in person's own row of a table. An app page may read a saved query. It may not hold SQL of its own.

- A visual source (a table) gets all of **Only include**, **Sorted by**, **Show at most** and **Also from**.
- A saved query or SQL widget sets the query's own parameters in **Data**. A required one with no value answers "Choose" and the parameter's name.
- A table of an external data source is listed, but it cannot be totaled.

## As whom a widget reads

A reader's browser asks, and the instance reads **as the reader may**. The table's row rules decide which rows come back. Two readers of one page can see different rows, and a widget with nothing for one reader draws its empty state.

Two permissions are asked at two times:

- **When the page is saved or published.** The person who saves a page that names a table from an external data source needs `data_source:read`. A person who types SQL into a dashboard widget needs `sql:read`.
- **When the page is read.** A reader needs `data:read`.

Hiding a widget is not security. **Show this widget** and **Who can see it** in **Rules** decide what is drawn. They do not decide which rows a person receives: the table's row rules do. The **Rules** tab says so beside the Appointments table in the Fernhill example: "What rows each person receives is decided by the Appointments row rules."

## The reader's clock and the limits of a read

- **The reader's time zone** is sent with every read and every action. "Today", "last 7 days", named ranges and the day a time falls on use it. When none is sent, UTC is used.
- **Rows.** A read returns 1,000 rows unless the widget asks for fewer, and never more than 10,000 or about 5 MB. A Table reads 25 at a time and offers **Show 25 more**. A download of a widget's rows takes up to 10,000.
- **Choices.** A search box, a filter's choices and a condition's values list at most 200.
- **Numbers and dates** are written in the reader's language and region. The words the instance itself writes stay in English.

## What a widget says when it has nothing

A widget is never left blank without saying why. In the builder, a widget with no source says "Choose what it shows in Data." and the **Data** tab says "Needs fixing". On a published page the same widget says "Nothing is set up here yet." Others say "Open a record to see it here." when a record page is not open on one, "Choose a row in <the widget> to see it here." when it follows a row nobody has chosen, "You may not see this." with a reason when the reader is refused, and a notice with **Try again** when the read failed. A widget that is reading again keeps the old rows, faded, until the new ones arrive.

## How a page stays current

A page reads again after every action a person runs from it. When the action started a flow or a script, it reads again after one, three and eight seconds. A dashboard refreshes by itself every 5 minutes unless it says 1, 15 or 60, or never, and it does not while it is being edited.

## What is not there

- An app page cannot read SQL, only a saved query or a table.
- Pivot takes up to three breakdowns and a Chart up to six measures. A Form or a Record detail cannot go on a dashboard. A Form cannot take a file: add it to the row in the table.
- End users do not have dashboards.
