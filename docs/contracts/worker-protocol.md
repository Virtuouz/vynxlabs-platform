# Worker protocol

Version 1. Last updated: 2026-11-11

This is one of the platform's two language-neutral contracts. The other is the manifest format in `schemas/`. A worker written in any language that follows this document can run a workspace's code. The control plane needs no change for it.

The machine-readable form of every route below is in the API description at `/api/v1/openapi.json`, under the tag "worker protocol".

## Rules

- **The worker always calls.** Every exchange is an HTTPS request from the worker to the control plane. The control plane never opens a connection to a worker, so a worker can sit inside a private network.
- **JSON** request and response bodies. Errors are RFC 9457 problem details.
- **Delivery is at-least-once.** A run may be attempted more than once, and two attempts can overlap for a moment after a worker is presumed lost. Code must be safe to run twice. Each run carries an idempotency key that is the same on every attempt.
- **An attempt is identified by the run ID and an attempt number.** Every report names both. A report for an attempt that is no longer in progress is refused with 409 and changes nothing.

## Credentials

A worker sends `Authorization: Bearer <credential>` on every request. Credentials start with `vxw_`.

A credential is scoped to one tenant, and optionally to one workspace in it. A worker is only ever offered, and can only ever read, what its credential covers. Anything else answers 404.

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
| `script.path`, `script.entry` | The script, and the name it is exported under in the bundle's code |
| `input` | The script's input |
| `bundle.id`, `bundle.digest` | The bundle this run is pinned to |
| `timeoutSeconds` | How long this attempt may take |
| `heartbeatSeconds` | Send a heartbeat at least this often |
| `idempotencyKey` | The same on every attempt of this run |
| `trigger` | What started the run |

If the worker disconnects while waiting, nothing is claimed for it.

### `GET /bundles/{id}`

Returns the bundle: see `schemas/bundle.schema.json`. A worker must check that the content matches `digest` before running it, and should cache bundles by digest. A bundle never changes.

### `POST /runs/{runId}/heartbeat`

Request: `attempt`, optional `workerId`.

Response: `{"cancelled": false}` while the attempt is this worker's. `{"cancelled": true}` means stop: the run was cancelled, or the attempt was taken back. Stop the script and report nothing further.

A worker that sends no heartbeat for 30 seconds loses the job. The job is then offered again, as the next attempt, if the run has attempts left.

### `POST /runs/{runId}/logs`

Request: `attempt`, and `entries`: up to 500 of `{time, level, message, fields}`. `level` is `debug`, `info`, `warn` or `error`. Send logs in batches, not one request per line.

### `GET /runs/{runId}/secrets/{name}?attempt=N`

### `GET /runs/{runId}/variables/{path}?attempt=N`

### `GET /runs/{runId}/connections/{path}?attempt=N`

Read what the running script needs. Each answers only for a name the script declared in its manifest, and 403 otherwise.

- A secret or variable returns `{"value": "..."}`.
- A connection returns `{"connector", "config", "credential"}`. `credential` is absent when the connection has none.

Fetch these when the script asks, not ahead of time. Do not write the values to logs or to disk.

### `POST /runs/{runId}/events`

Publishes an event on behalf of the running script.

Request: `attempt`, `event` (the event's name), `payload`.

Response: `{"eventId", "started"}`, where `started` is how many subscribers were started. The event is stored and its subscribers are started before the response is sent.

Answers only for an event the script declared in its manifest, and 403 otherwise. 400 means the payload does not match the event's schema.

This route was added after version 1 was published. A worker that does not offer event publishing to scripts needs no change.

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
