# Fact-check record: administer/how-to/sso/find-an-audit-entry

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Search | `apps/console/src/screens/Audit.tsx:393` | second agent, run, 2026-11-23 | holds |
| More filters | `apps/console/src/screens/Audit.tsx:477` | second agent, run, 2026-11-23 | holds |
| Entry details | `apps/console/src/screens/Audit.tsx:630` | second agent, run, 2026-11-23 | holds |
| Show everything | `apps/console/src/screens/Audit.tsx:540` | second agent, run, 2026-11-23 | holds |
| Link copied | `apps/console/src/screens/Audit.tsx:609` | second agent, code, 2026-11-23 | holds |
| CSV cap | `apps/control-plane/src/routes/identity.ts:511` | second agent, run, 2026-11-23 | holds |
| sso.refused | `apps/control-plane/src/kernel/sso/flow.ts:297` | second agent, code, 2026-11-23 | holds |
| Empty state | `apps/console/src/screens/Audit.tsx:578` | second agent, code, 2026-11-23 | holds |
| Between dates with the end-before-start message, Workspace, Columns dialog, Saved views menu, Show older entries (50 more) | `apps/console/src/screens/Audit.tsx:354` | second agent, run, 2026-11-23 | holds |
