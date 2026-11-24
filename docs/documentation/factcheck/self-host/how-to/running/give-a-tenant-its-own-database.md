# Fact-check: self-host/how-to/running/give-a-tenant-its-own-database.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Register under Instance, Database locations; fields; messages. | `packages/docs/content/self-host/reference/console/databases.md` (screen walked by its writer) | writer, 2026-11-23 | holds as cited |
| Needs `instance:write`. | openapi `PUT /instance/database-locations/{name}` | writer, 2026-11-23 | holds |
| `volvel tenant import ... --location`. | `docs/self-hosting.md`; `packages/cli` | writer, 2026-11-23 | carried; not run |
| A location is chosen once; a move is export, delete, import. | `docs/self-hosting.md` | writer, 2026-11-23 | carried; not run |
| Commit order in a deploy. | `docs/self-hosting.md` | writer, 2026-11-23 | carried; not run |

## Second check (2026-11-23)

Run by API: registering the instance's own database refused with the page's words; a wrong user: 'That database could not be prepared. password authentication failed...'; a new database registered, shown reachable with tenants 0, then 1 after a tenant was created with `dataLocation`; its table lives in that database; import of an existing tenant: 'This tenant is already on this instance.' Console screen walked at 390 and dark: no horizontal overflow.
