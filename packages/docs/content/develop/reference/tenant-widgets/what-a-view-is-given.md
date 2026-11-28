---
title: What a widget view is given
description: "The props a tenant's widget view receives, what each data shape holds, and which parts of a page's widget are the view's and which are the page's."
subjects: [widgets, widget-frame]
---

A view is given `config`, `data`, `state`, `size` and `theme`, and nothing else. This page says what is in each. How the props reach the view is on [The widget frame](the-widget-frame). The fields of the definition that declares them are on [the widget kind](../kinds/widget).

## Config

`config` holds the widget's settings by name. The definition's `config` is a JSON Schema, and each property has an `x-volvel` hint that says how the inspector draws it: its `tab` (`data`, `display`, `actions` or `rules`), an optional `group`, a `control`, a `label`, and optionally `help`, `choices` and `order`. A page's `config` is checked against the schema when the page is saved and when the bundle is deployed.

A widget added in the builder starts with the definition's `defaults`. A setting a page does not give is not filled from the schema's own `default`: put the value in `defaults` too, or have the view handle it.

## Data

`data` holds each input the definition declares, by name, in the shape the input declares. The server reads each input for the viewer and applies the table's rules, so a viewer's data holds the rows they may read. The view has no other source.

| Shape | Fields |
| --- | --- |
| `rows` | `columns` and `rows`. |
| `summary` | `columns`, `breakdowns` (the names of the columns that are breakdowns), `values` (the names of the value columns), `rows`, and where the input has them `previous`, `measures`, `buckets`, `span` and `trend`. |
| `record` | `columns`, and `record`: one row or `null`. |
| `approvals` | `waiting` and `decided` (each step with its flow, fields and whether the viewer may decide it), `more`, and `decideIn`, which an instance that decides requests in the console would send. This instance does not send it: requests are decided in the app. |

A column in `columns` has a `name`, a `label`, and a `type` (`text`, `integer`, `number`, `boolean`, `date`, `timestamp`, `enum`, `reference`, `json` or `uuid`), and may have a `description`, the `values` of an enum with their colors, `required`, `default` and, for a reference, the `references` table.

In a `summary`, a row of the result has one key for each breakdown and each value, named by `breakdowns` and `values`: for Fernhill's `visits` input, `{ clinic: "northside", visits: 25 }`. A date breakdown arrives as the day.

A `rows` input arrives as one page, with `total` (how many rows there are in all, when there is a next page) and, when there is one, `more()`: it asks the page for the next page, and the view is given the rows so far again. `sortBy(sort)` asks for the rows in the order of a column, read over all of them and not only the page; `sortBy(undefined)` asks for the order they come in, and `sorted` says which order the rows are in. Both are functions in the view, and in the frame they send a request to the page, which answers by giving the props again. The page only answers for an input the definition declares as `rows`, for a column the rows have, and at most four requests a second; it drops the rest. The page's rows are limited by its own rule, so a view that needs every row should read a summary.

## State

`state.status` is `ready`, `loading`, `empty`, `failed` or `forbidden`; the last three carry a `message`. On a page, the view is given the state of the page's read of its data: `loading` before the first rows arrive, `empty` (with the page's words) when the inputs read nothing, `failed` or `forbidden` (each with a message the viewer may see) when the read did not work or the viewer may not see it, and `ready` otherwise. The view stays in its cell through each, and draws them; for a failed or forbidden read the page also draws a **Try again** button under it. `volvel dev --widgets` posts the state you choose, so a view can be tried with each.

## Size

`size.w` and `size.h` are the cell in grid cells (12 columns, rows of 40 pixels), and `size.narrow` is true when the page is a phone's width or so. The view is drawn in the cell's own box. Size what you draw by the box, not the window.

## Not given to a view

| What | Why |
| --- | --- |
| A session, token or cookie | The frame has none: it has no origin of its own. |
| The API, or any way to fetch | The frame's policy has no network. |
| Another widget's data or the page's filters | Only the widget's own inputs are sent. A filter reaches a view through the input it narrows. |
| Actions (`act`, `can`) and `refresh` | A view raises an event; the page decides what it does. |
| Functions | Props cross the frame as data. |

## What the page owns

| Part | Who sets it |
| --- | --- |
| The inputs: which table, query or conditions | The builder, in the **Data** tab, or the page's file. |
| The title, subtitle, size, rules and phone layout | The builder. |
| What an event does | The builder, in the **Actions** tab, or `on` in the page's file. |
| The look inside the cell | The view. |

## Related

- [The widget frame](the-widget-frame)
- [The widget kind](../kinds/widget)
- [Give a widget data and events](../../how-to/widget-data-and-events)
