# Fact-check: self-host/how-to/running/use-your-own-postgres.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Postgres 16 or later; CI 16 and 18. | `.github/workflows/ci.yml:20` | writer, 2026-11-23 | holds |
| The user needs `CREATEROLE`, not superuser. | `docs/self-hosting.md`; `databases.md` screen text | writer, 2026-11-23 | holds as the screen words it |
| `pg_trgm` optional. | `packages/db/migrations/0049_runs_search.sql:35-37` | writer, 2026-11-23 | holds |
| No transaction pooler. | inferred (LISTEN, session locks, role sign-in) | writer, 2026-11-23 | INFERRED, not tested |
| `COMPOSE_PROFILES` without `postgres`. | `deploy/compose/compose.yaml` profiles; `.env.example` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Run: role with CREATEROLE (not superuser) owning an empty database: migrations, first operator, tenant, workspace, table and row all worked. Without CREATEROLE: 'Boot failed while migrating the database: Migration 12 (data) failed and was rolled back: permission denied to create role'. Wrong password: 'password authentication failed'.
