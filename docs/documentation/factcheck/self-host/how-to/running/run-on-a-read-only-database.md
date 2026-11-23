# Fact-check: self-host/how-to/running/run-on-a-read-only-database.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Starts and serves reads; `readyz` `readOnly: true`; log line. | `main.ts:155-161`; run | writer, 2026-11-23 | holds |
| New sign-ins and changes answer 503 `read_only`. | run: sign-in 503 `read_only` | writer, 2026-11-23 | holds; `Retry-After` not read |
| The check every 10 s; log "the database takes writes again: starting the queue and background work". | `writer.ts:11`; run | writer, 2026-11-23 | holds |
| Writes within about a minute. | run: sign-in and write worked about 15 s after the reset | writer, 2026-11-23 | holds (shorter than the page's "within the minute") |
| Migrations check by reading alone when there are none to apply. | `docs/self-hosting.md` | writer, 2026-11-23 | carried |

## Second check (2026-11-23)

Run: with a tenant member, reads (me, tenants, workspaces, runs, resources, rows, stream) 200 and a write or new sign-in 503 read_only. An operator reading inside a tenant under an access grant got 503 (each request under a grant is audited): added to the page.
