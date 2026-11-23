# Fact-check: self-host/explanation/running/architecture.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The image runs three programs: the control plane (`volvel-start dist/main.js`, port 8080, user `node`), `volvel-worker-host`, and the standalone worker. | `Dockerfile:56-70` (CMD, EXPOSE, USER, COPY of both scripts); `deploy/worker/compose.yaml` (command `node node_modules/@volvel/worker/dist/bin.js`) | writer, 2026-11-23 | holds |
| `volvel-start` runs the control plane on `node-cp` and falls back to plain node. | `deploy/image/volvel-start:8-11` | writer, 2026-11-23 | holds |
| The image sets `CONSOLE_DIR=/app/console` and `SCREENS_DIR=/app/screens`. | `Dockerfile` ENV lines | writer, 2026-11-23 | holds |
| Compose has two networks, `data` (Postgres, object store, control plane) and `execution` (control plane, worker host). | `deploy/compose/compose.yaml` `networks:` of each service | writer, 2026-11-23 | holds; seen in the run (`docker compose ps`, the control plane listened on two container addresses) |
| Each background step has its own timer and flag, ticks every 2 s, one past 60 s is logged late. | `apps/control-plane/src/kernel/execution/background.ts` (`startBackground` intervalMs 2000), `STEP_LIMIT_MS = 60_000` line 92 | writer, 2026-11-23 | holds |
| Retention is taken by one replica at a time. | `apps/control-plane/src/kernel/execution/background.ts:27-45` (`pruneOnce` returns `busy`) | writer, 2026-11-23 | holds |
| Start order: command word, settings, migrate, read-only check, app, rekey/recover-operator, bucket, bootstrap, rotation, listen, loop, then `writer.watch`. | `apps/control-plane/src/main.ts:12-171` | writer, 2026-11-23 | holds |
| The writer rechecks whether the database takes writes every 10 s. | `apps/control-plane/src/writer.ts:11` (`WRITABLE_CHECK_MS = 10_000`) | writer, 2026-11-23 | holds |
| Only the control plane joins `data`; a script cannot reach the database. | `deploy/compose/compose.yaml` (worker-host `networks: [execution]`) | writer, 2026-11-23 | holds |
