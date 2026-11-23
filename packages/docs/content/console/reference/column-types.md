---
title: Column types
description: The twelve types a table's column can have, with what each stores, how it is filtered and edited, and its limits.
---

A table's column has one of twelve types. The console names them as below. **Create table**, **Add column** and **Change type** all offer these names. In a definition written in code, the type is the word in the second column.

| Console name | In a definition | Stored in Postgres as |
| --- | --- | --- |
| **Text** | `text` | `text` |
| **Whole number** | `integer` | `bigint` |
| **Number** | `number` | `double precision` |
| **Yes or no** | `boolean` | `boolean` |
| **Date and time** | `timestamp` | `timestamptz` |
| **Date** | `date` | `date` |
| **JSON** | `json` | `jsonb` |
| **ID** | `uuid` | `uuid` |
| **Row of another table** | `reference` | `uuid`, with a foreign key to the other table |
| **File** | `file` | `uuid`, naming a stored file |
| **One of a list** | `enum` | `text`, held to the column's values by a check |
| **Several of a list** | `enum_list` | `text[]`, held to the column's values by a check |

Every table also has three columns it fills in: `id` (**ID**), `created_at` and `updated_at` (**Date and time**). A definition cannot declare them. Each has the same filter and sort as its type, and none can be edited.

## What each type stores

| Type | What a value is | A value is refused when |
| --- | --- | --- |
| **Text** | Any text. | It holds the character with code 0. |
| **Whole number** | A whole number between -9,007,199,254,740,991 and 9,007,199,254,740,991. | It has a fraction or is larger. The console says "Enter a whole number." |
| **Number** | A finite number. | It is not a number. The console says "Enter a number." |
| **Yes or no** | `true` or `false`. In the console, `true`, `yes`, `y` or `1`, and `false`, `no`, `n` or `0`. | The console says "Enter yes or no." |
| **Date and time** | A moment, stored in UTC. The API takes it as ISO 8601 with a zone, such as `2026-01-31T09:30:00Z`. The console takes it in your own clock, such as `2026-06-01 09:00`, or with a zone as written. | The moment does not exist (31 February, 25:00). The console says "Enter a date and time that exists, such as 2026-06-01 09:00." |
| **Date** | A day, as `2026-01-31`, with no time zone. | The day does not exist. The console says "Enter a day that exists, such as 2026-06-01." |
| **JSON** | Any JSON value. | It is not valid JSON ("Enter valid JSON."), or holds the character with code 0. |
| **ID** | A UUID. | It is not one. |
| **Row of another table** | The ID of a row of the table the column points to. | It is not an ID, or no such row exists. |
| **File** | The ID of a file stored in the workspace. A file is up to 25 MB; its name is kept to 255 characters. | It is not an ID, or a file the person may not already read. |
| **One of a list** | One of the column's values. | It is not one of them. A row may keep a value the list no longer offers. |
| **Several of a list** | Any number of the column's values, each once, in the order given. | One is not among them. |

A whole number or a number that a database outside the product holds and the console cannot show exactly is shown as the text the database wrote.

## How each type is filtered

Each column has a filter box under its heading, except **JSON**. What the forms mean is in [Filter syntax](filter-syntax). This table says what a plain value does for each type.

| Type | A plain value | Also |
| --- | --- | --- |
| **Text** | Finds text that contains it, ignoring case. | `!x` is not exactly x. `!~x` is text that does not contain x. |
| **Whole number**, **Number** | Equals. | `>`, `>=`, `<`, `<=`, and ranges `10..20`, `10..`, `..20`. |
| **Date and time**, **Date** | Equals. | Comparisons and ranges, such as `2026-01-01..2026-03-31`. |
| **Yes or no**, **ID**, **File** | Equals. | |
| **Row of another table** | The row's ID. A name is refused. | `empty`, and `!` with an ID. |
| **One of a list** | Equals the value, spelled out. | |
| **Several of a list** | The row has this value in its list. A retired value is still found. | `!x` is refused: "A list cannot be searched with not. Search for a value it has." |
| **JSON** | No filter box. | |

`!~x` is for **Text** alone: any other column says "Only text can be searched with !~." A row with no value matches `!~x`.

## How each type is edited

In the grid, a cell is edited by double-clicking it, or by pressing Enter or F2. The **Row** inspector and the **Add row** sheet have a field for each type.

| Type | In the grid | In the inspector and Add row |
| --- | --- | --- |
| **Text**, **Whole number**, **Number**, **ID**, **JSON** | Typed in the cell. | A text box; a larger box for **JSON**. |
| **Yes or no** | Enter, F2 or a double-click toggles it. Where it may be empty it goes yes, no, empty. | A choice. |
| **Date and time**, **Date** | A small dialog with a date field. | A date field, with a time for **Date and time**, in your own clock. |
| **Row of another table** | A small dialog with the picker. | The picker: type to find a row. It offers the first 50. |
| **One of a list** | A select of the column's values. | A select. |
| **Several of a list** | A small dialog with a multi-select. | A multi-select. |
| **File** | Not edited. The cell shows **Download**. | **Choose a file** when adding. In the inspector, **Replace** (shown when the row has no file too, where it adds one) and, when there is a file, **Remove**, each asking first. |

`id`, `created_at` and `updated_at` are not edited anywhere.

## What each type allows

| Type | Sort | **No two rows alike** | A value when none is given | Can stand for a row |
| --- | --- | --- | --- | --- | --- |
| **Text**, **Whole number**, **Number**, **Yes or no**, **Date and time**, **Date**, **ID**, **One of a list** | Yes | Yes | Yes | Yes |
| **JSON** | No | No | Yes | No |
| **Several of a list** | No | No | Yes | No |
| **Row of another table** | Yes | Yes | No | Yes |
| **File** | Yes | No | No | No |

A value given when none is given must fit the type: a day that exists, an ID, a moment, one of the column's values. **Can stand for a row** is the choice under **What stands for a row** on a table's **Definition** view.

A **Row of another table** column also has **On delete**: **Refuse the deletion**, **Empty this column** or **Delete this row too**.

## Changing a type

**Change type** offers only the changes that keep every value:

| From | To |
| --- | --- |
| **Whole number** | **Number**, **Text** |
| **Number** | **Text** |
| **Yes or no**, **ID**, **Date**, **Date and time**, **One of a list** | **Text** |
| **Text** | **One of a list**, when every row already holds one of the values you give |
| **JSON**, **File**, **Several of a list** | Nothing. The dialog says to add a new column, copy the values across in a script, then retire the old one. |
| **Row of another table** | **Change table** points it at another table. |

## Limits

| What | Limit |
| --- | --- |
| A column's name | Lower-case letters, digits and underscores, starting with a letter; 55 characters. |
| Columns in a table | 1 to 200, not counting `id`, `created_at` and `updated_at`. |
| Values of a list column | 1 to 200, each 1 to 100 characters, with no comma and no line break. |
| A value's label | 100 characters. |
| A value's color | One of nine names (gray, red, orange, amber, green, teal, blue, violet, pink) or `#rrggbb`. |
| A description of a table or a column | 500 characters. |
| Indexes in a table | 20, each of 1 to 5 columns. |
| Rules for who sees rows | 20. |
| A file | 25 MB. |

The full list of a definition's fields is in the generated reference for the table kind, under Develop.
