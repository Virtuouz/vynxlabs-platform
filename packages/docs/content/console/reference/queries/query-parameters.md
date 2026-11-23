---
title: Query parameters
description: "The five fields of a query's parameter, its six types, how a value is read and checked, and how a saved query is run by name."
subjects: [queries, sql]
---

A query takes values each time it is run. In SQL they are written `$1`, `$2` and so on. A saved query describes each one: its name, its type, its label, its default and whether it is needed. This page is the whole of that description. To use it, see [Write and run a query](../../how-to/queries/write-and-run-a-query).

## The fields of a parameter

A query lists its parameters in the order of its `$n`: the first parameter is `$1`. A query has at most 20. The console writes the list from **What each parameter is** on the [Queries](../screens/data/queries) screen. In a repository the same list is `parameters` in the query's file (see [Data as code](../../../develop/reference/queries/data-as-code)).

| Field | In the console | Takes | Limits |
| --- | --- | --- | --- |
| `name` | **Name of parameter n** | What whoever runs the query calls it, and what a saved query is run by. | Required. Lowercase letters, digits and underscores, starting with a letter; at most 55 characters; no two parameters share one. |
| `type` | **Type of parameter n** | One of the six types below. | Required. |
| `label` | **Label of parameter n** | What the field is called where a person is asked for the value. The name when empty. | 1 to 100 characters. An empty label is not saved. |
| `default` | **Default of parameter n** | The value used when none is given. | Must fit the type. An empty default is not saved. |
| `required` | **Parameter n is needed** | Whether a run with no value for it is refused. | A false value is not saved. |

Until a parameter is named, the console calls it `$1`, `$2`, and saves it as `p1`, `p2`.

## The types

| Type | A value must be | In the console |
| --- | --- | --- |
| `text` | text | A text field. |
| `integer` | a whole number | A text field with the hint `integer`. |
| `number` | a number | A text field with the hint `number`. |
| `boolean` | true or false | A menu: **Not set**, **Yes**, **No**. |
| `date` | a day written `2026-01-31` | A date field. |
| `timestamp` | a date and time, such as `2026-01-31T09:30:00Z` | A text field with the hint `timestamp`. |

The words of a refusal are "must be" and one of: text, a whole number, a number, true or false, a date such as 2026-01-31, or a date and time such as 2026-01-31T09:30:00Z. The console, the API and a dashboard's widgets use the same words. In SQL, give the value a cast so the database knows the type: `$1::date`.

## How a value is read

**In the console.** What you type is read as the parameter's type before anything is sent:

- Empty is no value (null).
- A **number** or **integer** is read as a number if it looks like one, such as `12`, `-3.5`, `.5` or `1e3`. Anything else is kept as typed and refused as "Must be a whole number." or "Must be a number."
- A **boolean** menu sends true or false, and **Not set** sends no value.
- A parameter you did not type into starts with its default. A parameter marked needed has no default to fall back on: it says "A value is needed." until you give one.

Values you typed are kept by place, so renaming a parameter keeps the value.

**By name, through the API.** `GET queries/saved/<path>` takes `params`, a JSON object of values by name, and `limit`:

```bash
curl -G "$BASE/api/v1/tenants/$TENANT/workspaces/$WORKSPACE/queries/saved/reports/vet-workload" \
  -H "Authorization: Bearer $KEY" \
  --data-urlencode 'params={"from":"2026-09-28","to":"2026-09-30"}' \
  --data-urlencode 'limit=100'
```

For each declared parameter, a value that is missing or null becomes the default, and then null. A needed parameter with no value is refused ("A parameter is missing."). A value that does not fit is refused as "A parameter does not fit." with the parameter's name and "must be …". A name the query does not declare is refused: "The query has no such parameter." `params` is at most 8,000 characters and must be JSON ("The parameters must be JSON.") and an object ("The parameters must be an object, by name.").

**In SQL run directly.** `POST queries/run` takes `params`, a list of values in the order of `$1`, at most 50. It must be as long as the highest `$n` in the text: "The query takes 2 parameters, $1 to $2, and 1 was given." or "The query takes no parameters, and some were given." This route checks no types: the database does.

**From a widget.** A widget on a dashboard or in an app that reads a saved query gives each parameter a value from a page filter bound to it, or from a fixed value written in the widget. A needed parameter with no value is refused as "Choose <label>.", using the label, else the name. A value that does not fit names the parameter. A name the query does not declare is refused.

## Running a query by name

A deployed query can be run by name without `sql:read`: the text is the workspace's, so writing SQL is not asked. Each table the query reads needs `data:read` for the person who runs it, and its row rules apply. A query that reads no table needs `data:read` on the workspace. Running by name is a read and is not written to the audit log.

On the screen this is offered for a deployed query that has no draft and no unsaved change. Any other query needs `sql:read`.

## Optional parameters

A parameter with no default and not needed arrives as null. A query that should ignore it says so:

```sql
select vet, count(*) as visits
from appointments
where ($1::date is null or starts_at::date >= $1::date)
group by vet
```

## Related

- [Queries](../screens/data/queries): the screen.
- [SQL reference](../../../develop/reference/queries/sql-reference)
- [Visual queries](visual-queries): a question built from menus, with no `$n`.
