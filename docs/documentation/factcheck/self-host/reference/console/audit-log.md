# Fact-check record: self-host/reference/console/audit-log

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title and description | `apps/console/src/screens/Instance.tsx:255` | writer, run | |
| 50 per page, Show older entries | `apps/console/src/screens/Audit.tsx:354` | writer, run | |
| CSV button, columns, 100,000, UTC | `apps/control-plane/src/routes/identity.ts:511` | writer, code | |
| CSV tooltip | `apps/console/src/screens/Audit.tsx:379` | writer, code | |
| Search placeholder | `apps/console/src/screens/Audit.tsx:393` | writer, run | |
| Areas of the instance log | `packages/manifest/src/audit.ts:297` | writer, run | |
| Since choices | `apps/console/src/screens/Audit.tsx:94` | writer, code | |
| Backwards range text | `apps/console/src/screens/Audit.tsx:532` | writer, code | |
| More filters Who / Action / Done to | `apps/console/src/screens/Audit.tsx:521` | writer, code | |
| Everything about NAME / Show everything | `apps/console/src/screens/Audit.tsx:540` | writer, code | |
| Address parameters | `apps/console/src/screens/Audit.tsx:143` | writer, code | |
| No workspace filter or saved views at the instance | `apps/console/src/screens/Audit.tsx:184` | writer, code | |
| Column words and kind tags | `apps/console/src/screens/Audit.tsx:66` | writer, code | |
| Operator tag for accessGrantId | `apps/console/src/screens/Audit.tsx:322` | writer, run | |
| Deleted tenant tag | `apps/console/src/screens/Audit.tsx:325` | writer, run | |
| Entry inspector fields | `apps/console/src/screens/Audit.tsx:630` | writer, run | |
| Done by an operator under an access grant. | `apps/console/src/screens/Audit.tsx:634` | writer, code | |
| Details JSON, Nothing more was recorded. | `apps/console/src/screens/Audit.tsx:639` | writer, run | |
| Everything about this button | `apps/console/src/screens/Audit.tsx:600` | writer, run | |
| Inspector opens on first entry on a wide window | `apps/console/src/screens/Audit.tsx:263` | writer, code | |
| Entry by address; 404 once not kept | `apps/control-plane/src/routes/identity.ts:1329` | writer, code | |
| Instance log holds the entries of deleted tenants | `apps/control-plane/src/routes/identity.ts:1297` | writer, run (tenant.created of a deleted tenant is in it) | |
| Empty text Nothing recorded yet | `apps/console/src/screens/Audit.tsx:578` | writer, code | |
| Retention 400 days, never under 90 | `apps/control-plane/src/config-vars.ts:255` | writer, code | |
| audit:read | `apps/control-plane/src/routes/identity.ts:1293` | writer, code | |
| Actions recorded: member.*, binding.*, tenant.deleted, tenant_import.*, database_location.*, instance.*, operator.recovered | `apps/control-plane/src/kernel/bootstrap.ts:136` | writer, code | |

Checked by: second agent, 2026-11-23. Instance http://localhost:8091 as the operator `admin@example.com`, Playwright headless: 1440 px light (text of every screen compared with the page), 390 px dark (no horizontal scroll on any instance screen; keyboard Tab order reaches the page's controls with a visible focus ring on each), and the controls named below. Tenants, members, a database and a database location made for the check were deleted afterwards (`instance-chk2`, `instance-chk3`, `inst-chk-db`, the throwaway database `instchk_loc`); the member `inst-chk@example.com` stays (a member cannot be deleted). Seen: toolbar (CSV, Search placeholder "An action, name, email or host", **Area** with the 15 areas listed by the page, in the same order, **Since**, **More filters**), the list with the Operator and kind tags. Corrected: "A **Operator** tag" to "An". The description is folded behind **About Instance audit log**. Not run: the CSV download, **Between dates** errors, an entry of a deleted tenant (seen in the writer's run).
