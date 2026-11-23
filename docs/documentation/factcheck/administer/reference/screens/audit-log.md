# Fact-check record: administer/reference/screens/audit-log

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Filters: Search placeholder, Area, Since options, Workspace, More filters (n) | `apps/console/src/screens/Audit.tsx:393` | writer, run, 2026-11-23 | holds |
| Since options | `apps/console/src/screens/Audit.tsx:91` | writer, run, 2026-11-23 | holds |
| More filters: Who, Action, Done to with counts | `apps/console/src/screens/Audit.tsx:506` | writer, run, 2026-11-23 | holds |
| Search covers action, ID, kind, names, emails, hostnames | `apps/control-plane/src/routes/identity.ts:512` | writer, code only, 2026-11-23 | holds (not run) |
| Columns When, Who, What was done, To; tags Create/Update/Delete/Execute/Read; Operator tag | `apps/console/src/screens/Audit.tsx:312` | writer, run, 2026-11-23 | holds |
| Entry details fields and Everything about this / Copy a link to it | `apps/console/src/screens/Audit.tsx:612` | writer, run, 2026-11-23 | holds |
| Link copied text | `apps/console/src/screens/Audit.tsx:609` | writer, code only, 2026-11-23 | holds (not run) |
| CSV tooltip: times in UTC ending in Z | `apps/console/src/screens/Audit.tsx:379` | writer, code only, 2026-11-23 | holds (not run) |
| CSV columns and cap 100,000, newest first | `apps/control-plane/src/routes/identity.ts:511` | writer, run, 2026-11-23 | holds |
| Page of 50 and Show older entries | `apps/console/src/screens/Audit.tsx:354` | writer, run, 2026-11-23 | holds |
| End before start message | `apps/console/src/screens/Audit.tsx:532` | writer, code only, 2026-11-23 | holds (not run) |
| Empty state Nothing recorded yet | `apps/console/src/screens/Audit.tsx:578` | writer, code only, 2026-11-23 | holds (not run) |
| Operator target name 'the tenant's API' | `apps/console/src/screens/Audit.tsx:118` | writer, code only, 2026-11-23 | holds (not run) |
| audit:read permission | `packages/manifest/src/permissions.ts:126` | writer, code only, 2026-11-23 | holds (not run) |
| Saved views menu on tenant log only | `apps/console/src/screens/Audit.tsx:374` | writer, code only, 2026-11-23 | holds (not run) |
