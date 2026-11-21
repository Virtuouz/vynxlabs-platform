---
title: Building a dashboard
topic: data-dashboards-editor
description: "The editor for one dashboard: add widgets, place them, and set what each reads, with the filters that narrow them."
---

A dashboard is edited in the same editor as a page of an app, so what is said in [building an interface](../build/app-builder-editor) holds here: **Add to page**, selecting, moving and sizing by mouse and by keys, **Undo**, and the inspector with its **Data**, **Display**, **Actions** and **Rules**. **Edit** opens it, and **Done** closes it.

## What is different on a dashboard

- **Add to page** offers only widgets that read: a table, a list, a stat, a chart, a pivot and text. A widget that changes data is not offered, and on a dashboard **Actions** will only ever show or narrow what is there, never change a row.
- **Source** can be a table from menus, a **saved query**, or **SQL**. A person who may write SQL writes it in the Data tab, and binds the page's filters to its parameters: a date range fills two, `from` and `to`. A table from menus is bound to a filter by a column.
- A dashboard has **how often it asks again**, and a title and description of its own, in its settings.
- It is **shared** from the dashboards screen, and the people it is shared with see only the rows they may read.

## Filters

**Add a filter** to make a date range, a choice, a word or a number, with the value it starts with. A date range can also be what a stat or a chart is **compared** with: "Compared with the period before" uses the same length of time, ending where the range begins, and a chart draws it as a dashed line.

When a filter is added, every widget whose table has its column is bound to it, and the editor says which. For a saved query or SQL, bind the filter to the parameter by hand.

## Changing a widget

Select it, and set it in the inspector in the same words as in an app: **Value** "Sum of Fees", **Break down by** "Lent on · Monthly", **Only include**, and under Display the chart type and how numbers look. A change is on the page at once, and saved as a draft as you go.

## Not here yet

Opening the rows behind a number, and a widget that opens a record, come with the record pages of a later phase. A widget that is clicked does nothing yet.
