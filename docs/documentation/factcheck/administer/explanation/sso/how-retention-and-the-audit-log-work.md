# Fact-check record: administer/explanation/sso/how-retention-and-the-audit-log-work

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Entry in same transaction | `apps/control-plane/src/routes/tenants.ts:275` | second agent, code, 2026-11-23 | holds |
| Deleted tenants in instance log | `apps/console/src/screens/Audit.tsx:325` | second agent, code, 2026-11-23 | holds |
| Audit min 90 | `apps/control-plane/src/config.ts:141` | second agent, code, 2026-11-23 | holds |
| Longest period | `apps/control-plane/src/kernel/retention.ts:143` | second agent, code, 2026-11-23 | holds |
| Month exported then dropped | `apps/control-plane/src/kernel/retention.ts:399` | second agent, code, 2026-11-23 | holds |
| Dialog audit text | `apps/console/src/screens/Retention.tsx:101` | second agent, code, 2026-11-23 | holds |
| Files kept for audit period | `apps/console/src/screens/Retention.tsx:35` | second agent, code, 2026-11-23 | holds |
