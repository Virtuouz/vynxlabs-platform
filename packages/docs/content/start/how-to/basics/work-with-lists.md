---
title: Filter, sort and save a list
description: "Filter and sort a list, choose its columns and row density, save the view, check rows and run a batch on them, using Runs as the example."
subjects: [saving, shortcuts]
---

## Filter, sort and save a list

By the end you have narrowed the Runs list, put it in an order, kept that view under a name, and acted on several rows at once. The same controls work on the other lists that offer them.

## Before you start

- You are signed in and a workspace is open. The example is **Runs** under **Operate**; it needs `run:read` (see the [workspace overview](../../../console/reference/screens/home/workspace-overview) for who has it).
- Saved views are kept per member, so they need your own sign-in, not an API key. They are offered on **Runs**, **Events**, a tenant's **Audit log** and a table's rows. **Columns** is offered on **Runs**, the audit log and a table's rows, and **Row density** on **Runs**. A table's rows sort and filter in their own way: see the [filter syntax](../../../console/reference/filter-syntax).
- To act on rows you need the permission of the action. On Runs, **Cancel** and **Run again** are offered to a person who holds `run:write` or `flow_run:write`.

## Narrow and order the list

:::steps
1. Open **Operate**, then **Runs**. Type in the **Search** box, which takes a path, a run ID, a tag or an error. The list follows when you stop typing. The address changes with every filter, so a reload or a link keeps it.
2. Choose a **Kind** (**Scripts and flows**, **Scripts** or **Flows**), a **When** window (**Last hour**, **Last 24 hours**, **Last 7 days**, **Between…**, which adds a **From** and a **To** date, or **Everything kept**) and a **Status**: one of the buttons **All**, **Failed**, **Running**, **Waiting for approval**, **Waiting for a time**, **Queued**, **Succeeded** or **Canceled**, each with its count. A filter that came from a link, such as one script's runs or one tag, shows as a button with a name like "Stop showing only runs tagged …"; press it to remove the filter.
3. Press the header **Started** or **Duration**. The first press sorts up (▲), the second down (▼), the third puts the list back in its own order (↕). Other columns do not sort on Runs.
4. Press **Columns**. Check a column to show it, and uncheck it to hide it. Move one with its arrows or by dragging. **Show every column** puts them all back, and **Done** closes the dialog. The first column stays.
5. Press the **Row density** button and choose **Compact**, **Standard** or **Comfortable**. Runs start **Compact**.
:::

## Keep the view

:::steps
1. Press the bookmark button, **Saved views**, and choose **Save this view…**.
2. Name it in the box **Name** and press **Save**. A notice says "Saved as “{name}”. Only you see it in this menu; its link opens it for anyone."
3. Change the filters and press the bookmark again. Its menu lists your views. Choose one to open it. When the filters differ from the view you last chose, **Save over “{name}”** keeps the changes under the same name; a notice says "“{name}” now shows this." While a view is the one showing, its name is on the bookmark button, and **Rename “{name}”…** and **Delete “{name}”** change or remove it. Delete asks "Delete the view “{name}”?" first.
4. Choose **Copy a link to this view** to send what you see to someone else. The link holds the filters, so it still works after you delete the view. It opens for anyone who may open the list.
:::

You can keep 50 views for one list, each with a name of up to 80 characters that no other of your views for that list has.

## Act on several rows

:::steps
1. Check the box at the start of a row, or move to it with :kbd[j] and :kbd[k] and press :kbd[x] or :kbd[Space]. :kbd[⇧J] and :kbd[⇧K] check the rows as you move, and :kbd[⌘A] checks every row shown. The bar above the list says "{n} selected".
2. Press an action in that bar. On Runs they are **Cancel** and **Run again**. A question names a few of the runs and asks you to confirm: **Cancel {n} runs?** or **Run {n} runs again?**.
3. When every item was done, a notice says so; after a cancel it also counts the runs that had already finished: "3 runs canceled, 2 left alone because they had finished." When some were not, the dialog **Canceling runs** says "{n} done, {m} not done" and lists those with the reason and the request ID of each. **Retry the {m} not done** (**Retry the one not done** for a single item) tries only those again. A cancel leaves a run that had already ended as it is: the dialog adds ", {k} left alone because they had finished" to its count and does not list that run among those not done.
4. **Clear**, or :kbd[Esc], unchecks the rows.
:::

Runs shows the first 100 rows and **Load more** adds the next. More than 100 checked rows are sent in groups of 100, one after the other, and the answers are added up.

Two more buttons cancel runs by a rule instead of by row. **Cancel by age…** cancels the flow runs or script runs that have gone or waited longer than a length of time you set. **Cancel {n} queued** appears while script runs are queued.

## The result

The list shows what you narrowed it to, in the order you chose. Your view is in the **Saved views** menu on any browser you sign in on.

## If it does not work

| You see | Because | Do this |
| --- | --- | --- |
| "Nothing matches these filters" | The filters or the search leave no row. | Press **Clear filters**, or widen **When**. |
| "Nothing matches" with "Try fewer or other words." | On a list that has its own search box, such as Members, a search found nothing. | Use fewer words. |
| "Could not load {the list}." with a Request ID | The list did not load. | Press **Try again**. A refusal that says you lack a permission has no retry: ask an owner or an administrator. |
| The bar has no action | You may not run the action on these rows. | Ask for the permission the question names. |
| The keys :kbd[j], :kbd[k] and :kbd[x] do nothing | Single-key shortcuts are off, or the focus is outside the table. | Turn them on in **Keyboard shortcuts**, and press :kbd[Tab] into the table. |
