# p35-rt-worker: what a worker, a query and an export may take

Five findings of the phase 35 red team, from lanes 07, 08, 10 and 15.

## B12: a worker names any machine (RT-10-1)

**The hole.** A claim carries `machine: { name, slots, availableMb, floorMb, scripts }` and the control plane believed all of it from any worker credential. A tenant's own worker could name a machine other tenants share (or the control plane's own), mark it full for everyone, count its jobs against its slots, or reserve and release its memory.

**Proof before.** `worker-machine-trust.test.ts`, "naming a shared machine with one slot" (`expected null not to be null`: the victim's claim found the machine full) and "with 1000 slots" (three jobs of the attacker took the victim's three slots).

**Fix.** `resolveWorker` now carries `managed` from the credential row in `WorkerScope`. `machineOf(scope, machine)` (`kernel/execution/workers.ts`) keeps a managed worker's name as it is and puts any other worker's under `tenant:<tenant id>/`, in the one place the claim route reads it (`routes/worker.ts`), before the slot count, the `starting` and `planned` maps, the `worker.machine` column and the queries see it. Workers of one tenant's own credentials still share a machine's slots between them (third test).

**Left.** The machines page and the `machine` metric label show the namespaced name for a tenant's own worker. Worker hosts and the managed workers the control plane starts use managed credentials and are unchanged (`machine-slots`, `machine-memory`, `supervisor-stop` pass).

## C5: a script publishes `platform/` events (RT-10-2)

**The hole.** `POST /worker/runs/:id/events` let a script that declared `platform/run-finished` publish it with any payload. The people's route already refused the name; `publishEvent` did not.

**Proof before.** `worker-platform-events.test.ts` got 200.

**Fix.** `publishEvent` (`kernel/flows/events.ts`) refuses a `platform/` name unless the source is the platform: 400 for every caller. Checked: the only other callers are the people's route and the platform's own `emit` (source `platform`).

## C6: any worker of the tenant can report on a run (lane 10)

**The hole.** `activeRun` and `heldTask` checked tenant, run and attempt, not who holds the job. Another worker credential of the tenant could heartbeat, complete, fail or read the variables of a run it was not given. `completeRun` also released the run's memory reservation before checking.

**Proof before.** `worker-run-holder.test.ts`: the other credential's heartbeat answered 200.

**Fix.** The protocol carries no worker id in these requests, so the check is by credential: `mustHold` (`kernel/execution/workers.ts`) compares the credential of the worker row named by `run.worker_id` / `task.worker_id` with the caller's, and answers 409. It is applied in `activeRun`, `heldTask` and the heartbeat. `completeRun` and `failRun` release the reservation after the check.

**Left.** Two workers of the same credential still can report on each other's runs: closing that needs the worker id in every request, a protocol change an older worker does not satisfy. A job whose worker row is gone is not checked. Test change: `execution.test.ts`'s `protocol()` helper gave every credential the same worker id, so two credentials were one worker; its default worker id is now per token.

## B7: a query result is bounded in rows, not bytes (RT-08-1)

**The hole.** `runQuery` cut a result at 5 MB only after the control plane held every row (up to 10,001) as text.

**Proof before.** `query-result-size.test.ts`: the proof's query took 27 s, and one row of 6 MB answered 200.

**Fix.** The cap is 5 MB of JSON per result (`QUERY_BYTES`, already in decision 0003), now applied in the database: a running sum of row sizes, and no row past 5 MB is sent. A result cut there says `truncated: true`; a first row that is alone over 5 MB answers 422 "too large to return". The control plane holds at most about 5 MB of one result. Stated in the API description of `queries/run` only. Saved queries and widget data go through the same `runQuery`.

**Left.** The database still works out the rows it does not send, up to the statement timeout (15 s by default): the proof's query takes about 10 s of database time, not 23 s of memory in Node. No `temp_file_limit` was added; the sum is a streaming window, but a database setting is the owner's to choose.

## A6: slow export readers take the connections (RT-15-7)

**The hole.** An export holds a snapshot connection until the reader has read the last byte, with no limit on how many.

**Proof before.** `export-readers.test.ts`: four tenants' exports read by nobody all answered 200.

**Fix.** `routes/portability.ts`: at most 3 exports at once on an instance and 1 per tenant (429 `rate_limited` with `retry-after: 30`), and an export whose reader has taken nothing for 60 s while data waits is destroyed, which runs the export's `finally` and rolls back its snapshot. The limits are in `exportLimits`.

**Left.** The limits are per process (one control plane). No setting for them yet. The test proves the places and the stall end, not the pool count itself.

## Round two

### A6 again: a reader that takes a chunk now and then held its place for ever (unproven in the report; reproduced)

**The hole.** The stall check ended an export only when nothing had been pulled for 60 s while data waited. A reader taking one chunk every 59 s never stalled and kept an export place (three on an instance) for as long as it liked.

**Proof before.** `export-readers.test.ts` "a reader that takes a chunk every so often, never stalling, is still ended after the export's total time": the place was never given back. This is a test of the stream directly (`readerBoundStream`, now exported); a real archive of the test tenant is too small to be held this way.

**Fix.** `routes/portability.ts`: `exportLimits.totalMs` (30 minutes): an export is ended after that long however it is read. Commit `99084d9c`.

**Left.** The 30 minutes is a guess for the largest tenants; a tenant whose export takes longer must be exported another way, and the number belongs in a setting when there is one.

### C6 again: the run's logs route did not check that the credential holds the run (low)

**Proof before.** `execution.test.ts` "another credential of the tenant cannot add log lines to a run it was not given": a second credential's lines were stored (204).

**Fix.** `routes/worker.ts`: `mustHold` after the run is found, as in the other run routes (409). Commit `3120b010`.

**Left.** Nothing. The worker routes that take a run now all call `mustHold`.

### B12 again: the per-machine lists were never pruned (reproduced as growth)

**The hole.** A tenant's own worker may name a machine it makes up in every claim; `starting`, `fullUntil`, `shareUntil` (and the name itself) were kept for each, for the life of the process.

**Proof before.** `machine-memory.test.ts` "a worker that names a new machine in every claim keeps a few names...": 3,000 distinct machine names for one tenant.

**Fix.** `kernel/execution/workers.ts`: a tenant's own worker has at most 32 machine names (the rest are one name, `(others)`, of its own); and when a list passes 256 entries, entries with nothing held (no memory spoken for, not found full, no share to wait out) are dropped. Managed workers are unchanged, and nothing was changed for the control plane's own machine (`MANAGED_WORKER_USER=same`). Commit `5fa4f7fa`.

**Left.** The names a tenant has used are kept (32 per tenant, in a set), so the memory is bounded by tenants times 32, not by claims.
