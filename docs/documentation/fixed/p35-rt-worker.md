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

## Round three: large tenants

The owner asked whether exporting and importing from the command line is the way around the export limits, and whether it should be the recommended way for a large tenant.

### What was established first

1. **The CLI already had `volvel tenant export --tenant <slug> --out <file> [--history]` and `volvel tenant import <file> [--slug] [--location]`.** Both call the same HTTP routes as the console: `POST /tenants/:id/exports`, and `POST /instance/tenant-imports` (the direct route). The export was piped from the response to a file as it arrived (never a slow reader, never in memory); the import streamed the file from disk with its length. Export needs a key with `export:write` in the tenant; import needs an operator's key (`tenant:write` at the instance). The passphrase is read from `VOLVEL_EXPORT_PASSPHRASE` and never printed. It had no progress, did not wait on a 429, left a cut-off file under its final name, and the import neither showed what the file held nor asked.
2. **Import on the server.** The archive is the request body, streamed to a file in the temporary folder (`receive` in `routes/portability.ts`, and the staged folder `STAGE_DIR` in `kernel/tenancy/staging.ts`), never held whole. The only size limit is `MAX_IMPORT_BYTES`, 50 GiB, counted as it arrives; no `bodyLimit` applies to these routes, and I found no request timeout set in the app. A 5 GB archive meets the disk of the temporary folder first; a 50 GB one is at the 50 GiB refusal and the same disk. The import is one database transaction. **Export** is one streamed response made inside one `repeatable read` snapshot (two for a tenant with a database location), with rows read through a cursor 500 at a time and written as parts of about 4 MB.
3. **Rate.** The stress test's figure, a 20 MB archive in 2.1 to 2.6 s on one dedicated CPU (about 8 to 10 MB/s), is the only one: the walks in the test suite are too small to give a second. At that rate 30 minutes is about 15 GB of archive, if the rate holds at that size, which was not measured.

### What holds memory in proportion to the tenant

- **Export, a stored object read whole.** `exportTenant` (`kernel/tenancy/export.ts`, the loop over `entry.stored`) does `kernel.storage.get(stored)` and writes the whole object, with its checksum: one object at a time, bounded by the largest file or bundle (25 MB, 20 MB). Not changed: it would need the object store to stream a read.
- **Export, the members list** (`members.rows`) and the list of object keys of one column are read whole: their size is the number of members and of stored objects, not of rows.
- **Import, every new object held at once** (`importTenant`, the `fresh` list). It read each new object and kept it until all were written: memory in proportion to the stored files of the tenant. **Fixed**: the objects are now checked one at a time against what is stored, and the new ones read again when they are written. Nothing is written until all agree, as before.
- **Import, the ids of rows seen** (`seen`, for tables in `REMEMBERED`) are a set of strings per table, in proportion to the rows of those tables. Not changed.
- **Import, one part at a time** (about 4 MB) is read and split, and `check` reads each file whole to hash it: bounded.

So no table is read whole and no file is read whole beyond one at a time. What limits a very large tenant is not memory: it is the time (30 minutes by default, now a setting), the temporary disk for an upload, the 50 GiB refusal, and one long snapshot for the export and one long transaction for the import.

### A. The limits are settings (done)

`EXPORTS_AT_ONCE` (3), `EXPORTS_PER_TENANT` (1), `EXPORT_STALL_SECONDS` (60), `EXPORT_MAX_MINUTES` (30; 0 is no limit): `config.ts`, `config-vars.ts` (the settings reference is drawn from it), `deploy/compose/compose.yaml` and `.env.example`, and `configuration.md`. `exportLimits` in `routes/portability.ts` stays the one place they are held; it is filled from the config when the routes are made. A tenant's place is now a count, so more than one export per tenant is possible. Tests: `config.test.ts` "how many tenant exports are written at once...", `export-readers.test.ts` "a tenant may be given more than one export at once", "with no time limit...", "the limits are the instance's settings".

### B. The command line fits a large tenant (done)

`packages/cli/src/tenant-move.ts` (the commands moved out of `cli.ts`, as `access.ts` is). Export: the tenant as `--tenant <slug>` or as the first argument; writes `<file>.part` and renames it when it ends as an archive does (two empty blocks); progress on a terminal (bytes, MB/s, time); a 429 is waited for by its `Retry-After` and tried again, 10 tries; an export that stops says so, with the setting if it was the time limit (the response now carries `x-export-limits: max-minutes=N; stall-seconds=N` so the command can say which), and removes the part file. Import: sent as a stream through `POST /instance/tenant-imports/staged`, shows what the routes report (tenant, rows, members, workspaces, history, unfinished runs), refuses and throws the upload away when the route says it cannot come in, asks (`io.confirm`), or needs `--yes` where nobody can be asked, then `staged/:id/import`. `Io` gained `progress` and `sleep` (bin.ts sets progress on a terminal). Tests: `tenant-move.test.ts` (11, against a stand-in instance) and `example.test.ts` "tenant export writes the archive..." (the real routes; its expected line now includes the rate).

### D. Documentation (done)

`moving-a-tenant.md` (a section "A large tenant": why the command line, the four settings, what size the defaults suit, what a large tenant meets, and a pointer to dump and restore for a whole instance), `configuration.md`, `flags-and-exit-codes.md`, `back-up-an-instance.md`.

### Left

- The limit for a very large tenant is the time of one snapshot and one transaction. A tenant whose export takes hours holds a snapshot open that long (vacuum cannot clean what it sees) and cannot be resumed; an import that fails near its end starts again from the beginning. Exports in pieces (per workspace, or per table, each in its own snapshot) would be a change of format and of the guarantee that an export is one moment: not done.
- Not measured: an export or an import of more than 20 MB.
- A stored object is still read whole on export (25 MB at most).
