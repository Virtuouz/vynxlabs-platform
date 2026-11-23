# Fact-check: self-host/how-to/running/give-a-tenant-its-own-database.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Register under Instance, Database locations; fields; messages. | `packages/docs/content/self-host/reference/console/databases.md` (screen walked by its writer) | writer, 2026-11-23 | holds as cited |
| Needs `instance:write`. | openapi `PUT /instance/database-locations/{name}` | writer, 2026-11-23 | holds |
| `volvel tenant import ... --location`. | `docs/self-hosting.md`; `packages/cli` | writer, 2026-11-23 | carried; not run |
| A location is chosen once; a move is export, delete, import. | `docs/self-hosting.md` | writer, 2026-11-23 | carried; not run |
| Commit order in a deploy. | `docs/self-hosting.md` | writer, 2026-11-23 | carried; not run |
