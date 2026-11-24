# Fact-check record: administer/reference/screens/audit-log

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Filters: Search placeholder, Area, Since options, Workspace, More filters (n) | `apps/console/src/screens/Audit.tsx:393` | second agent, run, 2026-11-23 | holds |
| Since options | `apps/console/src/screens/Audit.tsx:91` | second agent, run, 2026-11-23 | holds |
| More filters: Who, Action, Done to with counts | `apps/console/src/screens/Audit.tsx:506` | second agent, run, 2026-11-23 | holds |
| Search covers action, ID, kind, names, emails, hostnames | `apps/control-plane/src/routes/identity.ts:512` | second agent, code, 2026-11-23 | holds |
| Columns When, Who, What was done, To; tags Create/Update/Delete/Execute/Read; Operator tag | `apps/console/src/screens/Audit.tsx:312` | second agent, run, 2026-11-23 | holds |
| Entry details fields and Everything about this / Copy a link to it | `apps/console/src/screens/Audit.tsx:612` | second agent, run, 2026-11-23 | holds |
| Link copied text | `apps/console/src/screens/Audit.tsx:609` | second agent, code, 2026-11-23 | holds |
| CSV tooltip: times in UTC ending in Z | `apps/console/src/screens/Audit.tsx:379` | second agent, code, 2026-11-23 | holds |
| CSV columns and cap 100,000, newest first | `apps/control-plane/src/routes/identity.ts:511` | second agent, run, 2026-11-23 | holds |
| Page of 50 and Show older entries | `apps/console/src/screens/Audit.tsx:354` | second agent, run, 2026-11-23 | holds |
| End before start message | `apps/console/src/screens/Audit.tsx:532` | second agent, code, 2026-11-23 | holds |
| Empty state Nothing recorded yet | `apps/console/src/screens/Audit.tsx:578` | second agent, code, 2026-11-23 | holds |
| Operator target name 'the tenant's API' | `apps/console/src/screens/Audit.tsx:118` | second agent, code, 2026-11-23 | holds |
| audit:read permission | `packages/manifest/src/permissions.ts:126` | second agent, code, 2026-11-23 | holds |
| Saved views menu on tenant log only | `apps/console/src/screens/Audit.tsx:374` | second agent, code, 2026-11-23 | holds |
| Columns dialog and Saved views menu words, Show older entries adds 50 | `apps/console/src/kit/views.tsx:176` | second agent, run, 2026-11-23 | holds; page corrected |
