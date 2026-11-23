---
title: Filter syntax
description: What a filter box under a column heading takes, how boxes combine, and what a box that cannot be read does.
---

Each column of a table's **Rows** view has a filter box under its heading, except a **JSON** column. This page lists what the box takes. The same forms are listed in the **Keys** popover of the toolbar.

What is typed is applied about 300 ms after you stop typing. It is kept in the address as `filter`, so a link or a saved view opens the same filtering. Changing a filter returns the table to its first page.

## The forms

| Type this | It finds | For which columns |
| --- | --- | --- |
| `x` | A **Text** column: text that contains x, ignoring case. A **One of a list** column: that value. A **Several of a list** column: rows whose list holds that value. Any other column: rows equal to x. | All |
| `> 100`, `>= 100`, `< 100`, `<= 100` | Rows greater than, at least, less than or at most the value. | **Whole number**, **Number**, **Date**, **Date and time** |
| `10..20` | Rows from 10 to 20, both ends included. | **Whole number**, **Number**, **Date**, **Date and time** |
| `10..` | Rows of 10 or more. | the same |
| `..20` | Rows of 20 or less. | the same |
| `!x`, or `not x` | Rows that are not exactly x. | All except **Several of a list** and **JSON** |
| `!~x`, or `not containing x` | Rows whose text does not contain x. A row with no text matches. | **Text** |
| `a \| b` | Rows that are a or b. | All |
| `empty`, or `null` | Rows with no value. | All |
| `!empty`, or `!null`, `not empty`, `not null` | Rows with any value. | All |

Dates are written `2026-01-31`, and a range of days `2026-01-01..2026-03-31`. A moment is written in your own clock, such as `2026-06-01 09:00`, or with a zone. A **Yes or no** column takes `yes`, `true`, `y` or `1`, and `no`, `false`, `n` or `0`.

A **Row of another table** column is found by the ID of the row it points to, or `empty`, or `!` with an ID. A name is refused. Open the row to copy its ID.

## Alternatives with `|`

`a | b` splits the box at each bar. When every part is a plain value that is compared whole, such as `open | done` on a **One of a list** column or `1 | 2` on a **Whole number** column, the filter is one test, "is one of", of up to 200 values. When a part is something else, such as `< 5 | > 100`, or the column is **Text** (where each part finds text that contains it) or **Several of a list**, the filter is "any of these".

## Several boxes: every or any

Boxes in different columns combine. By default a row must satisfy every box. When two or more boxes are in use, **Rows must match** appears in the toolbar with two choices:

| Choice | A row is shown when |
| --- | --- |
| **every filter** | It satisfies every box. |
| **any filter** | It satisfies at least one box. |

The choice is in the address as `match=any`.

## When a box cannot be read

A box that cannot be read as its column's type is named in a red notice, with the column and the reason. The box is marked invalid, no rows are asked for or shown, and **CSV** is disabled, so that nothing is shown or exported as if it were filtered. Fix or clear the box. Examples of what the notice says:

| Typed | Column type | The notice says |
| --- | --- | --- |
| `abc` | **Number** | "Enter a number." |
| `1.5` | **Whole number** | "Enter a whole number." |
| `!~x` | not **Text** | "Only text can be searched with !~." |
| `!x` | **Several of a list** | "A list cannot be searched with not. Search for a value it has." |
| a name | **Row of another table** | "A reference is found by its row's ID, or by empty. Open the row to copy its ID." |

## What is not there

- `!~x` is for text alone. There is no "does not contain" for other types.
- A **JSON** column has no filter box, and a **Several of a list** column cannot be filtered with `!x`.
- Inside one box, `|` is the only way to join tests. There is no `and`, no brackets, and no way to compare one column with another.
- A filter does not reach rows the table's rules for who sees rows do not let you see.

## Related

- [Tables](screens/data/tables): the Rows view, its toolbar and its saved views.
- [Column types](column-types): what each type stores.
