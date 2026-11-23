# Fact-check: self-host/explanation/running/sizing-and-scaling.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Slots = max(2, floor((MB - 512) / 160)); floor = max(128, 10%); critical = max(64, 5%). | `packages/worker/src/machine.ts:132-150` | writer, 2026-11-23 | holds |
| Memory is the smaller of meminfo and the cgroup limit less what the container holds. | `packages/worker/src/machine.ts:51-81` | writer, 2026-11-23 | holds |
| A script is held to `memoryMb` plus 64 MB. | `packages/worker/src/machine.ts:129` (`NODE_OVERHEAD_MB`) | writer, 2026-11-23 | holds |
| A standalone worker has no slots, floor or guard; `--concurrency` 4. | `packages/worker/src/bin.ts`; inventory HOST-24 | writer, 2026-11-23 | holds |
| Connections per replica: `DATABASE_POOL_SIZE + DATA_POOL_SIZE + 3`; dedicated adds 5 and 5, data source 4. | `docs/self-hosting.md` "Sizing: the database"; `packages/db/src/database.ts` | writer, 2026-11-23 | carried from the old guide; not re-derived |
| A request waits up to 5 s for a connection, then 503 with `Retry-After`. | `packages/db/src/database.ts:12` (`CONNECTION_WAIT_MS`) | writer, 2026-11-23 | holds for the 5 s; `Retry-After` carried from the old guide |
| 422 `too_slow` past the statement timeout; totals 5 s. | `apps/control-plane/src/kernel/data/rows.ts:776` | writer, 2026-11-23 | holds for the 5 s totals |
| Defaults: pool 10, 10, `DATA_TENANT_CONNECTIONS` a third (at least 2), timeouts 15000. | generated settings reference (Database) | writer, 2026-11-23 | holds |
| 1 GB container gets 3 slots, 2 GB gets 9. | `packages/worker/src/machine.test.ts` "a container held to 1 GB"; (2048-512)/160 = 9 | writer, 2026-11-23 | holds |
