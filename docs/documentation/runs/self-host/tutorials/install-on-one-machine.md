# Run log: self-host/tutorials/install-on-one-machine

- Machine: the walk machine (WSL2, Docker 29.8). Commit `5ebf1c80`, 2026-11-23. Run in `deploy/compose` with a throwaway project name `tut-install` (`docker compose -p tut-install --env-file <folder of mine>/.env -f compose.yaml`) so the owner's own `volvel-dev` containers were untouched. The page writes the plain command without `-p` and `--env-file`, which does the same with a `.env` beside the compose file.
- **Image.** No image is published, and building from source needs `pnpm install` from the internet. The run used the locally built image `volvel/volvel:docs` (built 2 hours earlier from this branch) with `VOLVEL_IMAGE` and `--pull never`. The stock build (`docker compose up -d` with no image) was not run. `postgres:18` and `chrislusf/seaweedfs:4.53` were already local.
- Port 8095 in place of the default 8080. The page says so.
- Playwright headless, 1440 x 900, light, on `http://localhost:8095`.

## Seen

1-2. `.env` made from `.env.example`, secrets from `openssl rand` as the page lists, `PUBLIC_URL` and `VOLVEL_BIND` on 8095, bootstrap operator `owner@example.com`.
3. `up -d`: containers `tut-install-postgres-1`, `-objectstore-1`, `-control-plane-1`, `-worker-host-1` created, started and waited on healthy.
4. `ps`: control-plane "Up 10 seconds (healthy) 127.0.0.1:8095->8080/tcp", objectstore and postgres healthy, worker-host "health: starting". `readyz`: `{"status":"ready","checks":{"database":{"ok":true,"readOnly":false,"latencyMs":3},"objectStore":{"ok":true}}}`.
5. `node dist/main.js --help` listed `check-config`, `migrate`, `rekey [--data-role]`, `recover-operator <email>`. `check-config`: "The settings are valid." exit 0.
6. `/`: "Console / Email / How you sign in / Sign in / Email / Continue / We check which ways of signing in your address has. Nothing is sent to you yet." Sign-in as `owner@example.com` landed on "Tenants / Create tenant / Every client organization on this instance. … / No tenants yet / A tenant is one client organization. Create the first one to start adding workspaces and members."
7. `/instance/health`: "Health / Whether this replica is ready, its keys, and what it is set to." **Check again**; "Ready / This replica takes requests. Checked just now."; Answers Database 4 ms, Object store; Version 0.5.0; Migration level 99; MASTER KEY fingerprint `7ff98ab84b1a4428`; MASTER_KEY_SECONDARY Not set; "A fingerprint is the start of a hash of the key…"; Workers "Started in a worker host"; Run slots, Memory floor, Most workers alive "Not set: worked out from this machine"; Database pools; Time limits; Schedule backlog "A schedule skips its time past 200 queued runs"; Triggers; Kept: runs 30 days, events 30 days, refusals 7 days, audit log 400 days; Address `http://localhost:8095`; Apps "Not served yet: set APPS_URL".
8. A tenant, a dev workspace and the starter script as in the first-script tutorial (steps 1-7): "A worker to run code" was done on its own; test pane **Succeeded** "waited 1.0 s · ran 216 ms", log "Added up {"count":3,"total":49.75}".
9. `pg_dump -U platform platform > backup.sql`: 261,898 bytes, 110 `CREATE TABLE` lines, no error output.
10. The two bootstrap lines removed and `up -d` again recreated the control plane; `readyz` ready; signing in as `owner@example.com` with the same password worked and opened where the operator was.
11. `volvel status` with `VOLVEL_URL=http://localhost:8095`: "http://localhost:8095 / Version 0.5.0, migration level 99 / Ready".
- The worker host logged "workers may not reach private, loopback or link-local addresses, other than the control plane, the name servers and WORKER_EGRESS_ALLOW" and "worker host started … users 256", "this machine's share … slots 96".

## Not run
The stock image build from source; a restore from the backup; the object store's backup; TLS and a proxy; the bundled `MANAGED_WORKERS=host` containers for a tenant's workers (the run used the default, which started the worker through the host); 768/390 px; dark; keyboard. The throwaway project was taken down with `docker compose -p tut-install … down -v` after the run.
