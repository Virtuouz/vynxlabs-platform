# Fact-check record: develop/how-to/api/act-on-many-runs-at-once.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Batch routes and bodies: runs/batch (cancel, rerun), flow-runs/batch (cancel, retry, restart), trigger-pauses/batch, drafts/batch-discard, tenant approvals/batch. | `routes/batch.ts:108-270` | pending | pending |
| 1 to 100 items, unique ids; `MAX_BATCH` 100. | `routes/batch.ts:19,34,127,177-200,215-232,240-262` | pending | pending |
| Each item is replayed through its own route as the caller, one at a time; the answer is 200 with `results`, `done`, `failed`; a failure carries `detail`, `requestId`. | `routes/batch.ts:50-115`; run | pending | pending |
| Run: rerun of one real and one fake id answered 201 with `runId` and 404 "The run was not found." | run | pending | pending |
| The route-level permissions: run:read, flow_run:read, trigger:read, resource:read; approvals is `signedInOrKey`. | `routes/batch.ts:124,141,178,218,246` | pending | pending |
| `reason` up to 500; approval `comment` up to 2,000; items `{path,node?}` and `{workspaceId,flowRunId,node}`. | `routes/batch.ts:180-190,251-262` | pending | pending |
| Result id of an approval is `flowRunId/node`, of a draft its path. | `routes/batch.ts:23,230-235` | pending | pending |
| `POST drafts/batch` is a different batch (documentation tree, all or none). | `routes/authoring.ts:690-720` | pending | pending |
| A bad `action`: 400 `validation_failed`. | run (`stop`) | pending | pending |
| A cancel of a finished flow run: 409 "The flow run already succeeded."; a missing draft 404 "A draft at nothing/here was not found."; pausing `hooks/nope` 404 "That trigger was not found." | run | pending | pending |
