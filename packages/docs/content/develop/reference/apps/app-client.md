---
title: The app client
description: Every export of @volvel/app, the package a code app uses to read tables, start runs, learn who is signed in and link to help.
subjects: [apps, app-client]
---

`@volvel/app` is the package a code app imports to talk to the instance that serves it. Every call goes to the instance as the person using the app, over the page's own address, with the cookie the instance set. The person's permissions decide what each call may do: the client adds none. An app that is not served by Volvel, and is not served by [`volvel dev`](../../how-to/apps/run-an-app-while-you-write-it), has no context, and the first call throws "This page was not served by the platform. Open the app at its address, or run it with: volvel dev".

## Context

| Export | What it is |
| --- | --- |
| `appContext()` | The context the instance put in the page: `{ api, tenant, workspace, app, base, portal, principal }`. `api` is `/api/v1`. `tenant` has `id`, `slug`, `name` and `logo`. `app` has `path`, `title` and, for an app made in the console, `interface` and `pages`. `base` is the path the app is served under, ending in a slash: give it to your router. `portal` is where the tenant's sign-in pages are, as a path. `principal` is who the page was served to. Throws when there is none. |
| `setAppContext(context)` | Replaces the context, or clears it with `undefined`. For tests. |
| Types `AppContext`, `Principal` | A `Principal` has `type` (`member`, `end_user`, `service_account` or `anonymous`), `id`, `name`, `email`, and, when known, `groups`, `groupKeys` and `attributes`. The page fills `groups` for a member too, and `attributes` for an end user. |

## Calling the API

| Export | What it does |
| --- | --- |
| `api.get(path)`, `api.post(path, body)`, `api.put`, `api.patch`, `api.delete` | Call any route of the [API reference](../api). Paths leave out `/api/v1`. A body is sent as JSON. The answer is parsed as JSON and typed by the generic you give. A 503 with a `Retry-After` is tried again twice, waiting the time given and at most 5 seconds each time. |
| `ApiError` | Thrown for any answer that is not a success. Has `status`, `code`, `message` and `errors`, a list of `{ path, message }` for a refused field. |

## Tables

`table<typeof orders>(path)` gives one table of the app's workspace. Import the definition as a type only, so that none of the repository's server code reaches the browser. Without a type, rows are `Record<string, unknown>`. Each call reads or writes as the person, held to the table's row rules.

| Method | What it does |
| --- | --- |
| `find(options)` | The rows, as many as `limit`. |
| `page(options)` | `{ items, nextCursor }`. Pass `nextCursor` back as `cursor`. It is null on the last page. |
| `get(id)` | The row, or `null` when there is none the person may see. |
| `insert(row)` | Adds a row and returns it. |
| `insertMany(rows)` | Adds up to 1,000 rows, all or none. |
| `update(id, changes)` | Changes the named columns and returns the row. |
| `delete(id)` | Removes the row. |
| `aggregate(options)` | Totals over the rows the person may see, in groups or in one. |

`find` and `page` take `{ filter, sort, limit, cursor }`. `sort` is a list of column names, and a leading minus sorts that column downwards. `limit` is at most 1,000 and defaults to 50. A filter is a condition or an `{ and: [...] }` or `{ or: [...] }` of them, with at most 50 conditions in all. A condition is `{ column, op, value }`, and `op` is one of:

`eq` (the default), `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `not_contains`, `is_null`.

`aggregate` takes `{ group, measures, filter, sort, limit }`.

| Option | Value |
| --- | --- |
| `group` | Up to 3 columns. A date or a time can be gathered into periods: `"created_at:month"`, with `day`, `week`, `month` or `year`. |
| `measures` | Up to 5 of `"count"`, `"count:column"`, `"sum:column"`, `"avg:column"`, `"min:column"`, `"max:column"`. Without any, rows are counted. |
| `sort` | The names as they come back, a group's or a total's. A leading minus sorts downwards. |
| `limit` | Groups to return, at most 1,000, default 200. |

It answers `{ items: [{ by, values }], truncated }`, where `truncated` is true when there were more groups than `limit`. `values` is keyed by the measure as asked, for example `"sum:total"`. A count, a sum and an average are numbers, or null when no row had a value; a least or a most is a value of its column. `totalOf(result, measure)` adds one measure over every group and counts a missing value as 0.

A statement that takes too long is stopped and answers 422 `too_slow`, which an `ApiError` carries. Working out totals is stopped after 5 seconds. Narrow the filter, or add an index on the columns it uses.

## Scripts and flows

| Export | What it does |
| --- | --- |
| `runScript(script, input, { timeoutMs, idempotencyKey })` | Starts a script as the person and waits for what it returns. `timeoutMs` defaults to 60,000. Throws `RunError` when the run fails, is canceled, or has not ended in time (then the run goes on). Needs `run:write` at the script. |
| `scriptRun(id)` | One run the person started: `{ id, status, output, error }`. `status` is `queued`, `running`, `succeeded`, `failed` or `cancelled` (the stored value; the word is "canceled"). |
| `RunError` | Has the `run`. Its message is the run's error. |
| `startFlow(flow, input, { idempotencyKey })` | Starts a flow from its manual trigger and returns the flow run at once. Needs `flow_run:write` at the flow. |
| `flowRun(id)` | One flow run: `{ id, flow, status, output, error }`. `status` is `running`, `succeeded`, `failed` or `cancelled`. |
| `runFlow(flow, input, { timeoutMs, idempotencyKey })` | Starts a flow and waits, for one that ends in seconds. Throws `FlowRunError` (with `flowRun`) when it fails, is canceled or has not ended in time. |

A person who is not signed in cannot start a script or a flow: the instance answers 403, "Sign in to start a script. A run started by someone who is not signed in cannot be read back." (and "a flow"). A form on a page can still start a run for a guest. See [Follow a run from an app](../../how-to/apps/follow-a-run-from-an-app).

## Following a run

| Export | What it does |
| --- | --- |
| `useRun(id)` | Follows a script run: `{ data, error, ended, live }`. `data` is `undefined` until the first answer. It reads the run again each time the instance says it changed, and every 2 seconds while no stream is connected, until it ends. `live` says whether changes arrive as they happen. |
| `useFlowRun(id)` | The same for a flow run, read again as it and its steps change. |
| `runStream` | The page's one connection to `/tenants/<tenant>/stream`, shared by everything that follows a run. `runStream.connected` says whether it is open. |
| `changeOf(id, ms)` | Waits until the run `id` changes, or `ms` pass. |

The stream carries only what the person may read: runs where they hold `run:read`, flow runs where they hold `flow_run:read`, and their own runs. Someone who may read no runs follows only their own, on at most 2 streams. Everyone else may have 5. Past that the instance answers 429 `too_many_streams`. A guest gets 401. In both cases the hooks look every 2 seconds, and a refused stream is not tried again on that page. There is no subscription to row changes.

## Who is using the app

| Export | What it does |
| --- | --- |
| `session()` | `{ principal, signUp }` from the instance. An end user's `groups` and `attributes` are filled in. `signUp` says whether people may make their own account. |
| `useSession()` | `{ principal, signedIn, groups, attributes, refresh }`. It starts from who the page was served to, so the first draw is right, and `refresh` asks the instance again. |
| `signInUrl(returnTo)` | The address of the tenant's sign-in page, which sends the person back to where they are now (or to `returnTo`). |
| `staffSignInUrl(returnTo)` | The address that signs a member of staff in to this app. |
| `signOut()` | Ends the person's sign-in to the tenant's apps. A member's console session is left alone. |
| `logoUrl()` | The address of the tenant's logo, or `null` when it has none. |

## Queries and help

| Export | What it does |
| --- | --- |
| `useQuery(load, deps)` | `{ data, error, loading, reload }`. Runs `load` when a value in `deps` changes and when `reload` is called. What was loaded stays on screen while the next answer comes, and an answer that arrives after a newer question is dropped. |
| `terms()` | The workspace's glossary terms, what its tables, columns, scripts and flows are for, and the pages of documentation that go with them, as far as the person may know them. |
| `helpUrl(topic)` | Where the page of the workspace's documentation with that `topic` is served, or `null` when no page has it or the person may not open it. |
| `useHelp(topic)` | `{ title, url, framed }`, `null` when there is none for this person, `undefined` until that is known. `framed` is true when the page is served at the app's own address and can be shown inside it. |
| `<HelpPanel topic children className>` | A button, default text "Help", and the page it opens beside the app's own. It draws nothing when there is no page. A page at another address opens in a new tab. The sheet has **Open in a new tab** and **Close**; Escape or a press elsewhere closes it. |

## Related

- [Write an app as code](../../how-to/apps/write-an-app)
- [Follow a run from an app](../../how-to/apps/follow-a-run-from-an-app)
- [How access to an app works](../../explanation/apps/app-access)
