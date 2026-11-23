# Fact-check record: administer/explanation/sso/how-retention-and-the-audit-log-work

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Entry in same transaction | `apps/control-plane/src/routes/tenants.ts:275` | writer, code only, 2026-11-23 | holds (not run) |
| Deleted tenants in instance log | `apps/console/src/screens/Audit.tsx:325` | writer, code only, 2026-11-23 | holds (not run) |
| Audit min 90 | `apps/control-plane/src/config.ts:141` | writer, code only, 2026-11-23 | holds (not run) |
| Longest period | `apps/control-plane/src/kernel/retention.ts:143` | writer, code only, 2026-11-23 | holds (not run) |
| Month exported then dropped | `apps/control-plane/src/kernel/retention.ts:399` | writer, code only, 2026-11-23 | holds (not run) |
| Dialog audit text | `apps/console/src/screens/Retention.tsx:101` | writer, code only, 2026-11-23 | holds (not run) |
| Files kept for audit period | `apps/console/src/screens/Retention.tsx:35` | writer, code only, 2026-11-23 | holds (not run) |
