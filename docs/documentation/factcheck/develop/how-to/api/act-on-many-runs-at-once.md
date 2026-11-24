# Fact-check record: develop/how-to/api/act-on-many-runs-at-once.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Batch routes and bodies: runs/batch (cancel, rerun), flow-runs/batch (cancel, retry, restart), trigger-pauses/batch, drafts/batch-discard, tenant approvals/batch. | `routes/batch.ts:108-270` | second agent, 2026-11-23 | checked |
| 1 to 100 items, unique ids; `MAX_BATCH` 100. | `routes/batch.ts:19,34,127,177-200,215-232,240-262` | second agent, 2026-11-23 | checked |
| Each item is replayed through its own route as the caller, one at a time; the answer is 200 with `results`, `done`, `failed`; a failure carries `detail`, `requestId`. | `routes/batch.ts:50-115`; run | second agent, 2026-11-23 | checked |
| Run: rerun of one real and one fake id answered 201 with `runId` and 404 "The run was not found." | run | second agent, 2026-11-23 | checked |
| The route-level permissions: run:read, flow_run:read, trigger:read, resource:read; approvals is `signedInOrKey`. | `routes/batch.ts:124,141,178,218,246` | second agent, 2026-11-23 | checked |
| `reason` up to 500; approval `comment` up to 2,000; items `{path,node?}` and `{workspaceId,flowRunId,node}`. | `routes/batch.ts:180-190,251-262` | second agent, 2026-11-23 | checked |
| Result id of an approval is `flowRunId/node`, of a draft its path. | `routes/batch.ts:23,230-235` | second agent, 2026-11-23 | checked |
| `POST drafts/batch` is a different batch (documentation tree, all or none). | `routes/authoring.ts:690-720` | second agent, 2026-11-23 | checked |
| A bad `action`: 400 `validation_failed`. | run (`stop`) | second agent, 2026-11-23 | checked |
| A cancel of a finished flow run: 409 "The flow run already succeeded."; a missing draft 404 "A draft at nothing/here was not found."; pausing `hooks/nope` 404 "That trigger was not found." | run | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run on the instance: `approvals/batch` (approve with one real and one missing item; reject without a comment, 400 per item; a service account's key with `approval:write` rejects with a comment; one without it, 403 per item; the same approval twice, second 409; 101 items 400 "must NOT have more than 100 items"), `runs/batch` with a duplicate id (400), a service account's key on `runs/batch` (201), `drafts/batch` (create two, a stale revision refused with 409 `draft_changed` and nothing saved, a move needs the draft's revision), `drafts/batch-discard`.
- Corrected: duplicates are refused in `ids` and `paths` only; a repeated approval is tried twice.
- Added: reject needs a comment; service account without `approval:write`.
