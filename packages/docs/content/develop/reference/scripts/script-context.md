---
title: The script context
description: "Every member of ctx, the second argument of a script: connections, secrets, variables, tables, files, events, the log and the run."
subjects: [scripts, sdk]
---

A script's function is called with its input and a `ctx`: what the run is allowed to reach and what it knows about itself. The type is `ScriptContext` from `@volvel/sdk`. A script reaches only what it declared: asking for anything else fails. Every call to the instance goes over the worker's own channel and is limited to the run's own connections, secrets, variables, data, files, events and tags.

This page is the same for a script written in the console, whose function is `export default async function (given, ctx)`, and for one made with [`defineScript`](define-script), whose function is `run(input, ctx)`.

## Members

| Member | What it gives |
| --- | --- |
| `ctx.connection<Client>(path)` | A client for a connection the script declared. An `http` or `oauth2` connection gives an `HttpClient`; a connector of your own gives what its `create` returns. |
| `ctx.connections(group)` | `.get(key)` is a client for the member of a connection group with that key, and throws when the group has none. `.keys()` is the members, as `{ key, label }`, at most 1,000. |
| `ctx.secret(name)` | The value of a secret the script declared, as a string. |
| `ctx.variable(path)` | The value of a variable the script declared. Always a string. |
| `ctx.table(table)` | A `TableClient` for a table the script declared. Typed when given the table's definition. |
| `ctx.source(path).table(name)` | A `TableClient` for a table of a data source the script declared. `as` has no effect there. |
| `ctx.files` | `put(name, content, contentType?)` stores a file in the workspace and gives `{ id }`, at most 25 MB. `get(id)` gives `{ name, contentType, content }`. |
| `ctx.events.publish(event, payload)` | Publishes an event the script declared, with a payload checked against the event's schema. Its subscribers are started before the call returns. |
| `ctx.log` | `debug`, `info`, `warn` and `error`, each `(message, fields?)`. Each line is kept with the run. |
| `ctx.run` | What the script knows about its run. See below. |
| `ctx.signal` | An `AbortSignal` that aborts when the run is canceled or runs out of time. Pass it to anything slow. |

`console.log`, `console.info`, `console.debug`, `console.warn`, `console.error` and `console.trace` are also written to the run's log.

### `ctx.run`

| Member | What it holds |
| --- | --- |
| `id` | The run's ID. |
| `attempt` | 1 on the first attempt. A retry is a new attempt of the same run. |
| `idempotencyKey` | The same across all attempts of one run. Pass it to systems you call so that a retry does not repeat what the first attempt did. |
| `trigger` | `{ type, … }`: what started the run, such as `manual`. |
| `startedBy` | `{ type, id }`: `member`, `end_user` or `service_account` with their ID, or `system` for a schedule, a webhook or an event. |
| `tag(...tags)` | Labels the run so it can be found by them. At most 10 per run, each 1 to 64 characters of `a-z`, `0-9` and `_.:-`. A step of a flow labels its flow run too. |

### A table client

`ctx.table(…)` gives these methods. Without `.as(...)` a script acts as the workspace and reaches every row.

| Method | What it does |
| --- | --- |
| `find(options?)` | Rows that match. `filter`, `sort` (column names, a leading minus sorts down), `limit` (default 50, at most 1,000) and `offset`. |
| `get(id)` | The row with that ID, or null. |
| `insert(row)` | Adds a row and gives it. |
| `insertMany(rows)` | Adds 1 to 1,000 rows. Either all are added or none. |
| `update(id, changes)` | Changes a row and gives it. |
| `delete(id)` | Removes a row. |
| `aggregate(options?)` | Counts, sums, averages, least and most, over the rows or over groups. `group` up to 3 columns (a date can be gathered with `created_at:month`, `day`, `week` or `year`), `measures` up to 5 (`count`, `count:column`, `sum:column`, `avg:column`, `min:column`, `max:column`), `filter`, `sort`, and `limit` (default 200, at most 1,000). Gives `{ items, truncated }`. |
| `as(principalId)` | The same table as one person sees it: its row rules apply as they would to that person. Use `ctx.table(orders).as(ctx.run.startedBy.id)` in a script started from an app. |

A filter is a condition `{ column, op?, value? }` or `{ and: [...] }` or `{ or: [...] }`. `op` is `eq` (the default), `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `has`, `contains`, `not_contains` or `is_null`.

### An `HttpClient`

A connection of the `http` or `oauth2` kind gives an `HttpClient`:

| Method | What it does |
| --- | --- |
| `request(path, options?)` | A request with `method`, `headers`, `query`, `json`, `body` and `allowFailure`. |
| `get(path, options?)` | A GET. |
| `post(path, json?, options?)` | A POST of `json`. A `body` in `options` is ignored. |

A response that is not successful throws an `HttpError` with `status` and `response`, whose message is `GET https://… answered 401.` The query is left out of the message so that a key in it is not written to the log. With `allowFailure: true` the response is returned instead. A connection reaches only its own address: a redirect to another origin is refused, and at most 5 redirects are followed. The client has no `put`, `patch` or `delete` method; use `request` with `method`.

## What does not exist

| Not there | Use |
| --- | --- |
| `ctx.query`, `ctx.rows` | `ctx.table(…).find(…)` |
| `ctx.sources` | `ctx.source(path).table(name)` |
| `ctx.http`, `ctx.smtp`, `ctx.oauth2` | A connection: `ctx.connection(path)` gives an `HttpClient`, a mail client or an OAuth client. |
| `ctx.state` | A table. |
| `ctx.idempotency` | `ctx.run.idempotencyKey` |
| `ctx.logging` | `ctx.log` |

## What a run is limited to

- A script sees an environment of `PATH`, `TZ`, `LANG`, `TMPDIR` and `NODE_EXTRA_CA_CERTS`, and no credential of the worker.
- A script written in the console may import `@volvel/sdk` and `node:` modules only.
- Without `.as()`, a script reaches every row of a table it declared.
- A script is trusted with files: it may read a file of the workspace by its ID, declared or not.

## Related

- [Scripts in code](define-script)
- [Test scripts in code](../../how-to/scripts/test-scripts-in-code)
- [How scripts run](../../explanation/scripts/how-scripts-run)
- [The generated SDK reference](../sdk/sdk)
