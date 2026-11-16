# Phase 11: holding up under load

Status: all six milestones built on branch `phase-11-load`, not yet merged. The stress test was re-run on Fly; results under Milestone 6.
Last updated: 2026-11-16

A stress test on a Fly instance, run after phase 10, found failures that come from the design, not from the size of the machines:
- the app machine (shared-cpu-2x, 2 GB);
- the database (shared-cpu-1x, 512 MB, 1 GB disk).

A bigger machine would only have moved where each one starts:

| What failed | What it looked like | Cause in the design |
| --- | --- | --- |
| Nine tenants with a few slow per-minute scripts | Within 60 s, free memory went from 1,270 MB to 0 and the app machine froze, and a restart froze it again | One worker per tenant with work, four scripts each, every script a process of its own. Nothing limited processes per machine. `memoryMb` covered only the JavaScript heap |
| 20 people browsing four large tables | 40–100% of table reads failed with 500 | Every tenant's row reads share one pool of 10. Row reads had no time limit, and a wait for a connection came back as a plain 500 |
| The database disk full | Every request failed, the app restart-looped | Startup migrations write even when there is nothing to apply |
| A per-minute flow over 1,000 items | Five runs at once, none finishing | A flow's schedule trigger had no overlap setting; each item costs a full run |
| Smaller findings | Dev workspaces ran their schedules; a clone with data slowed every tenant; heavy scripts slowed the console; recovering took SQL | Each is a milestone below |

**Exit criterion:** the same scenarios, re-run on the same instance, degrade gracefully:
- runs wait in the queue, and the machine never freezes;
- busy reads get 503 with Retry-After or 422, never 500;
- reads and sign-in keep working while the database is read-only;
- flows don't stack;
- a clone doesn't hold up the rest of the instance.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-11-load`, in six milestones. Milestones 1–3 share one commit, as their changes share files |
| `memoryMb` | Enforced on all of a script's memory, plus 64 MB for Node itself. Scripts that held more in Buffers now fail; noted in the changelog |
| Dev workspaces | New ones start with triggers paused, as clones already do |
| A flow's schedule trigger | Gets `overlap`, defaulting to `skip` |

## Milestones

| # | Milestone |
| --- | --- |
| 1 | A machine can't be run out of memory: run slots per machine, a memory floor, `memoryMb` enforced, the largest script stopped as a last resort, lower CPU priority |
| 2 | Table reads stay fair and fail clearly: a time limit on every data operation, a share of the pool per tenant, 503 and 422 instead of 500 |
| 3 | A read-only database keeps reads up |
| 4 | Triggers can't run away: overlap on flow triggers, dev workspaces paused, a backlog cap, an emergency stop, bulk cancel, faster foreach |
| 5 | Clones don't hold up the instance |
| 6 | Sizing docs, and the stress test again |

## Findings

### Milestone 1

**The limit is enforced where work is claimed, not where it runs.**
- Workers on one machine send its name and slots with each claim.
- The control plane counts the scripts running on that machine's workers under a lock per machine, in the claim's own transaction.
- A worker never holds a slot while it waits, so idle workers cost nothing.

**The worker cap is twice the slots, not the slots.** A tenant with no worker cannot even wait its turn. A worker waiting for a slot costs far less than a running script.

**Fair share counts the tenants with a live worker on the machine.** Past its share, a tenant may still take a slot that no other tenant is waiting for.

**The memory watchdog reads each script's resident memory** from `/proc` every 500 ms. A script over `memoryMb` + 64 MB is stopped and fails as having run out of memory.

**The last-resort guard runs in the parent,** the control plane or the worker host:
- It stops the largest script among its grandchildren, then waits 3 s before judging again.
- A worker reports a SIGKILL it didn't send as the machine running low on memory.
- In `process` mode with workers under their own user, the control plane may not be allowed to signal them. Then the floor and the slots are the protection.

### Milestone 2

**The tenant gate is in the process, per replica, and only on the shared database.**
- It is a counting semaphore with a first-come queue per tenant.
- A request that waits 5 s is refused as busy, before it takes a connection, so nothing was done and a retry is safe.
- Dedicated databases are the tenant's own and skip it.

**The time limit rides on the `set_config` that `withData` already runs:** one more argument, no extra round trip. Totals still lower it to 5 s inside their own statement.

**Pool timeouts carry no error code.** pg-pool throws a plain `Error`, so `isPoolTimeout` in `@vynxlabs/db` recognises it by message. A statement timeout (57014) outside a data request is also a 503 `busy`. Inside one it is 422 `too_slow`, because the request itself is the problem.

**Retries are only for 503s that say when to try again.** Those were refused before doing anything. A worker's own log and heartbeat calls are unchanged: they already try again.

### Milestone 3

**Three writes stood between a read-only database and a started instance:**
- the migration table's `create table if not exists`;
- the instance secret's insert, which made it on every start;
- the data role's setup.

Each is now read first, or skipped when the database takes no writes. pg-boss starts only once it does.

**Connections keep the defaults they were opened with.** Postgres sets `default_transaction_read_only` per database (as postgres-flex does), and that reaches only new connections. Checked locally:
- with every pool holding old connections, the instance saw the database as read-only long after it took writes again;
- pools now renew connections every 60 seconds, and recovery took under a minute.

**Sign-in needs writes.** It makes a session. The authentication library answers a failure with a bare 500, so a 500 from it while the database is read-only is answered 503 `read_only`.

**API key and SCIM token "last used" notes no longer fail the request** when they can't be written.

**Checked locally, booting the built instance against the dev database set read-only:**

| Step | Result |
| --- | --- |
| `/readyz` | 200, `readOnly: true` |
| Reading tenants with an existing session | 200 |
| Creating a tenant | 503 `read_only` |
| Signing in | 503 |
| After the database was made writable again | "the database takes writes again" logged, and creating a tenant was 201 |

### Milestone 4

**Overlap on a flow's schedule trigger defaults to `skip`. Schedule resources keep `allow`:**
- A flow is the case that piled up in the test.
- Changing a schedule resource's default would silently change scripts that run on purpose beside each other.
- `stillGoing` already handled flow targets, so only the registration changed.

**The backlog cap counts at most `limit` rows,** with a `count(*)` over a `limit`ed subquery, so a huge queue is no slower to check than a short one. Each pass is recorded on the trigger as `lastSkipReason`, `overlap` or `backlog`, next to the existing `lastSkippedAt`.

**The instance-wide pause sits beside each workspace's pause** in every place that checks one:
- schedules, which keep their due time;
- a source's relay, forms and webhooks, which are refused as paused;
- events, which are kept but start nothing.

It is read at most every 2 seconds, inside the caller's transaction where there is one, so a pool of one connection cannot deadlock on it.

**Bulk cancel goes through the same cancel as one run,** a batch of 200 to a transaction. Flow runs go one to a transaction, as each takes its flow run's lock. A run that ends meanwhile is passed over, not counted.

**Foreach throughput was measured first.** 150 items, one at a time, a trivial script, on a development machine:

| | Per item, median | Items a minute |
| --- | --- | --- |
| Before | engine 1 ms, claim 362 ms, process 95 ms | 151–271 (two runs) |
| After | engine 1 ms, claim 13 ms, process 94 ms | 533 |

The time went to claiming: a waiting claim looked again only every 500 ms. It is now woken by the database's own announcement of the tenant's runs and tasks, which the stream hub already listened to, and looks every second besides, for retries that come due. The engine's own work, re-reading every step, was 1 ms an item even at 150 items, so it was left as it is. A new process per item, about 95 ms, is now the floor; reusing processes is outside this phase.

**A claim whose worker had hung up could take a task** once claims were woken by new work. Runs already checked for this, but tasks did not. The claim loop now checks before each look, which the faster wake made necessary.

**Existing tests and the e2e walk exercise triggers in dev workspaces.** They now create them with `triggersPaused: false`. Under the full suite, one flow test, "an approval that was refused is asked again", once missed its 20-second wait; it passed alone, twice.

**Walked at 1440 and 390 px:**
- Instance → Triggers, running and paused, with the reason;
- a new dev workspace's overview saying why its triggers are paused.

No page errors, and nothing scrolls sideways. The runs list's **Cancel queued runs** was checked by the API tests and type-checking, not walked.

### Milestone 5

**A clone waits in the process that was asked, not in the background loop as planned.** It acts as the member who asked, and their principal exists only in that request. So a waiting clone cannot be picked up again by another process. One that is waiting when its instance restarts fails, as a running one already did, with the same "the instance restarted" message, and the member clones again.

**The turn is a row, not a lock:** at most one clone with data is `running` across the instance.
- A waiting clone looks every 2 seconds, under an advisory lock, and takes the turn when none is running, or when the one running is over an hour old and so died with its process.
- It gives up after an hour.
- Clones without data take no turn: they copy no rows.

**Rows go in pages of 5,000 by `id`, with 50 ms between pages,** through `insert … select … where id > $last order by id limit … returning id`. Still inside the one transaction, so a failed clone leaves nothing half-copied, as before. Tested with a 12,001-row table: three pages.

### Milestone 6: the stress test again

Re-run on 2026-11-16 on `vynxlabs-platform-test`, the same machines as before: the app on shared-cpu-2x with 2 GB, now with 512 MB of swap; the database on shared-cpu-1x with 512 MB and a 1 GB disk. The stress tenants were deleted afterwards.

| Scenario | Before | Now |
| --- | --- | --- |
| Slow per-minute scripts in many tenants: 12 tenants, 156 runs a minute, about 55 needing to run at once | 9 tenants froze the machine within 60 s; a restart froze it again | Scripts held at the machine's 9 slots, an even share for every tenant, the rest queued; free memory never under 170 MB. Readiness 57–84 ms throughout, console p95 85–104 ms, with the fix below |
| Recovering from that backlog | SQL | Instance → Triggers paused everything; 1,140 queued runs were cancelled through the API in 8 s |
| `hog` holding 700 MB under `memoryMb` 512 | Succeeded | Failed: "The script ran out of memory (512 MB)." 300 MB succeeded |
| 20 people browsing four 200k-row workspaces | 40–100% of table reads were 500 | No 500. Two in three table reads were 503 `busy` or 422 `too_slow`; runs and tenant lists stayed at p50 58 ms |
| Two clones with data at once, 200k rows each | 30 s and 87 s; other calls 1.2–1.5 s | The second waited as `queued`, then ran: 40 s and 58 s. Other calls 58–319 ms. Reads of the table being cloned took up to 16 s, three past the 15 s limit (422) |
| A per-minute flow over 1,000 items | 5 flow runs at once, about 40 items a minute | One flow run; later ticks skipped with `lastSkipReason: overlap`. 210 items in the first minute, then 23–35 a minute |
| The database's disk full | Every request failed; the app restart-looped | Reads and readiness 60–190 ms, changes and sign-in 503 `read_only`. A restart came back healthy with `readOnly: true`. With the disk freed, writes, sign-in and the background loop came back in 26 s with no restart |
| Deleting the 14 stress tenants | 0.2–0.8 s each | 0.3–0.5 s each; readiness at most 78 ms meanwhile |

**Claims for a full machine took every connection the app had.** Found in the first multi-tenant run:
- Twelve workers, four claims each, all took a connection and then waited for the machine's lock.
- All 10 platform connections were held, with up to 36 requests waiting for one.
- Readiness timed out for about 2 minutes, and bulk cancel took up to 24 s a workspace, while both machines were idle.

Fixed in `2d456b0`:
- A machine's claims now wait their turn in the process, holding nothing.
- A machine found full is remembered for 250 ms, so woken claims return without asking the database.
- A test reproduces it: 40 claims at once left 34 requests waiting for a connection before the fix, and none after.

**What the rest comes down to is the machines' shared CPUs:**
- **The table readers:** the database's one shared CPU sat at load 4 with 14 queries running, sorting and searching tables that have no indexes on those columns. The per-tenant share and the time limit turn that away clearly, but cannot make it faster. A performance CPU for the database, or the trigram indexes left out of this phase, would.
- **The foreach:** after the first minute, the app machine's CPU was 52% stolen by the host: Fly's burst credit for a shared CPU was spent. Each item's new Node process, about 190 ms of CPU, then took 1.5–2 s. Reusing runner processes, left out of this phase, is the part on our side.
