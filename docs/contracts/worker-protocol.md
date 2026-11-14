# Worker protocol

Version 1. Last updated: 2026-11-12

This is one of the platform's two language-neutral contracts. The other is the manifest format in `schemas/`. A worker written in any language that follows this document can run a workspace's code. The control plane needs no change for it.

The machine-readable form of every route below is in the API description at `/api/v1/openapi.json`, under the tag "worker protocol".

## Rules

- **The worker always calls.** Every exchange is an HTTPS request from the worker to the control plane. The control plane never opens a connection to a worker, so a worker can sit inside a private network.
- **JSON** request and response bodies. Errors are RFC 9457 problem details.
- **Delivery is at-least-once.** A run may be attempted more than once, and two attempts can overlap for a moment after a worker is presumed lost. Code must be safe to run twice. Each run carries an idempotency key that is the same on every attempt.
- **A run reaches what its script declared, and what its flow step handed it.** Added in 0.5.0. A step of a flow can hand its script connections, tables and events with `with`, when the script says in `node.takes` that it takes such things. Where a route below answers only for something the script declared, it answers for these too, for that run alone. A worker needs to do nothing for this.
- **An attempt is identified by the run ID and an attempt number.** Every report names both. A report for an attempt that is no longer in progress is refused with 409 and changes nothing.

## Credentials

A worker sends `Authorization: Bearer <credential>` on every request. Credentials start with `vxw_`.

A credential is scoped to one tenant, and optionally to one workspace in it. A worker is only ever offered, and can only ever read, what its credential covers. Anything else answers 404.

A credential may also be made for one pool. A script can name the pool it runs on, for work that must happen in a particular place, such as inside a client's network. A worker whose credential has a pool is offered only the runs of scripts that name that pool. A worker whose credential has none is offered only the runs of scripts that name none. The worker itself does nothing different: the pool is a property of its credential. Pools were added after version 1 was published.

401 means the credential is not valid, is revoked or has expired. A worker should stop.

## Routes

All under `/api/v1/worker`.

### `POST /claim`

Asks for the next job. The control plane holds the request for up to `waitSeconds` (at most 25) and answers as soon as there is a job.

Request: `workerId` (a UUID the worker chooses once, at start), optional `version`, optional `waitSeconds`.

Response: `{"job": null}`, or a job:

| Field | Meaning |
| --- | --- |
| `runId`, `attempt` | Identify this attempt in every later request |
| `workspaceId` | The workspace the run belongs to |
| `script.path`, `script.entry` | The script, and the name it is exported under in the bundle's code. Since 0.5.0 this may be a trigger source: it is run exactly as a script is, and what it returns is its output |
| `input` | The script's input |
| `bundle.id`, `bundle.digest` | The bundle this run is pinned to |
| `timeoutSeconds` | How long this attempt may take |
| `heartbeatSeconds` | Send a heartbeat at least this often |
| `idempotencyKey` | The same on every attempt of this run |
| `trigger` | What started the run |
| `startedBy` | Who started the run: `type` (`member`, `end_user`, `service_account`, or `system` for a schedule, a webhook or an event) and `id`. Absent from a control plane older than 0.4.0 |

If the worker disconnects while waiting, nothing is claimed for it.

### `GET /bundles/{id}`

Returns the bundle: see `schemas/bundle.schema.json`. A worker must check that the content matches `digest` before running it, and should cache bundles by digest. A bundle never changes.

### `POST /runs/{runId}/heartbeat`

Request: `attempt`, optional `workerId`.

Response: `{"cancelled": false}` while the attempt is this worker's. `{"cancelled": true}` means stop: the run was canceled, or the attempt was taken back. Stop the script and report nothing further.

A worker that sends no heartbeat for 30 seconds loses the job. The job is then offered again, as the next attempt, if the run has attempts left.

### `POST /runs/{runId}/logs`

Request: `attempt`, and `entries`: up to 500 of `{time, level, message, fields}`. `level` is `debug`, `info`, `warn` or `error`. Send logs in batches, not one request per line.

### `GET /runs/{runId}/secrets/{name}?attempt=N`

### `GET /runs/{runId}/variables/{path}?attempt=N`

### `GET /runs/{runId}/connections/{path}?attempt=N`

Read what the running script needs. Each answers only for a name the script declared in its manifest, and 403 otherwise.

- A secret or variable returns `{"value": "..."}`.
- A connection returns `{"connector", "config", "credential"}`. `credential` is absent when the connection has none.
- `connector` is `http` or `smtp`, which a worker builds itself, or, since 0.5.0, the path of a `connector` resource in the run's bundle. For those the worker calls the export named by that connector's `entry` as `create(config, credential, signal)` and hands the script what it returns. A worker that does not know a connector must fail the run with a message that names it.

Fetch these when the script asks, not ahead of time. Do not write the values to logs or to disk.

### `GET /runs/{runId}/connection-groups/{path}?attempt=N`

### `GET /runs/{runId}/connection-group-members/{key}/{path}?attempt=N`

Added in 0.5.0. A connection group is a set of connections of one kind whose members are added per workspace with no deploy, so that a script can choose a credential by data. Both answer only for a group the script declared in `uses.connectionGroups`, and 403 otherwise.

- The first returns `{"items": [{"key", "label"}]}`: the members the group has in the run's workspace, with no credentials.
- The second returns one member as a connection does: `{"connector", "config", "credential"}`. It answers 404 when the group has no member with that key, and the script should fail with that message.

A worker that predates these routes still runs every script that does not use a connection group. Give a script the group through its context only if the worker implements both.

### `POST /runs/{runId}/events`

Publishes an event on behalf of the running script.

Request: `attempt`, `event` (the event's name), `payload`.

Response: `{"eventId", "started"}`, where `started` is how many subscribers were started. The event is stored and its subscribers are started before the response is sent.

Answers only for an event the script declared in its manifest, and 403 otherwise. 400 means the payload does not match the event's schema.

This route was added after version 1 was published. A worker that does not offer event publishing to scripts needs no change.

### `POST /runs/{runId}/data`

Reads or writes rows for the running script: in one of the workspace's own tables, or in a table of an external data source.

Request:

| Field | Meaning |
| --- | --- |
| `attempt` | As everywhere |
| `table` | The table's path. For an external source, the table's name there |
| `source` | Optional. The path of an external data source. Without it, `table` is a workspace table |
| `op` | `find`, `get`, `insert`, `update`, `delete` or `aggregate` |
| `args` | For `find`: `filter`, `sort`, `limit`, `offset`. For `get` and `delete`: `id`. For `insert`: `rows`, 1 to 1,000 of them. For `update`: `id` and `patch`. For `aggregate`: `group` (up to three of `column` or `column:day|week|month|year`), `measure` (up to five of `count`, `count:column`, `sum:column`, `avg:column`, `min:column`, `max:column`), `filter`, `sort`, `limit` |
| `as` | Optional. The ID of a member or an end user of the tenant, usually the run's `startedBy.id`. The table's row policy then applies as it would to that person. An ID that is neither is refused with 400. Without it the script acts as the workspace and reaches every row. Ignored for an external source |

Response: `{"result": ...}`.

| `op` | `result` |
| --- | --- |
| `find` | `{"items": [...], "nextOffset": number or null}` |
| `get` | The row, or `null` |
| `insert` | The inserted rows. Either all are inserted or none |
| `update` | The row as it now is |
| `delete` | `null` |
| `aggregate` | `{"items": [{"by": {...}, "values": {...}}], "truncated": boolean}`, one item for each group, or one item when there are no groups |

A filter is `{"column", "op", "value"}`, or `{"and": [...]}`, or `{"or": [...]}`. Operators: `eq` (the default), `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `is_null`. No field accepts SQL.

`aggregate` was added after version 1 was published. A worker that does not offer it to scripts needs no change. A date or a time is gathered into periods that begin at midnight UTC. 422 means the totals took longer than five seconds to work out.

Answers only for a table or a source the script declared in its manifest, and 403 otherwise. 400 means a value does not fit its column, with the column named. 404 means the table or the row is not there. 409 means a value that must be unique is already taken. 502 means an external source could not be reached or refused the request.

### `POST /runs/{runId}/files`

Stores a file in the workspace.

Request: `attempt`, `name`, `base64` (the bytes), and optionally `contentType`. At most 25 MB.

Response: the stored file: `{"id", "name", "contentType", "sizeBytes", "createdAt"}`. The `id` is what a `file` column holds.

### `GET /runs/{runId}/files/{fileId}?attempt=N`

Response: the stored file as above, plus `base64`. 404 when the workspace has no such file.

The data and file routes were added after version 1 was published. A worker that does not offer them to scripts needs no change.

### `POST /runs/{runId}/complete`

Request: `attempt`, `output`. The run succeeds. 409 means the attempt was no longer in progress and the output was not recorded.

### `POST /runs/{runId}/fail`

Request: `attempt`, `error`: `{message, stack}`.

Response: `{"final": false}` when the run will be retried, `{"final": true}` when it has no attempts left.

## What a worker must do

1. Claim. On `null`, claim again.
2. Get the bundle for the job, by digest, from its cache or the control plane.
3. Start sending heartbeats.
4. Run the script named by `script.entry` with `input`, giving it a way to read its declared secrets, variables and connections, a logger, the run's details, and a signal that fires on cancellation or when `timeoutSeconds` has passed.
5. Send any remaining logs, then report `complete` or `fail`.
6. On `cancelled: true` or a 409, stop and report nothing.

## Changes to this contract

Additions that old workers can ignore, such as a new optional field, do not change the version. Anything else is a new version of the protocol under a new path, with the old one kept for a deprecation period.
