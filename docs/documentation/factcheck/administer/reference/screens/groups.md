# Fact-check: administer/reference/screens/groups

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer; a second agent has not yet checked it.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Columns, row buttons, Create group fields | `apps/console/src/screens/Groups.tsx:60-380 (Groups)` | writer, 2026-11-23 (second agent pending) | holds as read |
| Members dialog, Take out confirm | `apps/console/src/screens/Groups.tsx:40-130` | writer, 2026-11-23 (second agent pending) | holds as read |
| Sign-in values: 50, 200 chars; off for provider groups | `apps/control-plane/src/routes/tenants.ts:106; apps/console/src/screens/Groups.tsx:130-170` | writer, 2026-11-23 (second agent pending) | holds as read |
| Description 500 | `apps/control-plane/src/routes/tenants.ts:971; apps/control-plane/src/kernel/..ACCESS_DESCRIPTION_MAX in manifest/tenant.ts:50` | writer, 2026-11-23 (second agent pending) | holds as read |
| Permissions group:read/write | `apps/control-plane/src/routes/tenants.ts:886-1196` | writer, 2026-11-23 (second agent pending) | holds as read |
