# Fact-check record: administer/reference/sso/permissions

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| sso, portal, domain, worker, audit verbs | `packages/manifest/src/permissions.ts:180` | second agent, code, 2026-11-23 | holds |
| export:write | `packages/manifest/src/permissions.ts:67` | second agent, code, 2026-11-23 | holds |
| default role needs binding:write; group mapping needs group:write | `apps/control-plane/src/routes/sso.ts:278` | second agent, code, 2026-11-23 | holds |
| Can notice words | `apps/console/src/kit/Can.tsx:187` | second agent, code, 2026-11-23 | holds |
