# Fact-check record: administer/reference/screens/branding

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Portal switch People may create their own account, default off, hint | `apps/console/src/screens/Branding.tsx:557` | second agent, run, 2026-11-23 | holds |
| Mail note texts | `apps/console/src/screens/Branding.tsx:553` | second agent, code, 2026-11-23 | holds |
| 27 tokens, each --vx-<name> | `apps/console/src/screens/Branding.tsx:62` | second agent, code, 2026-11-23 | holds |
| Clear back to the kit's values and its confirm | `apps/console/src/screens/Branding.tsx:379` | second agent, run, 2026-11-23 | holds |
| Contrast check: 23 pairs, 4.5 and 3, messages | `apps/console/src/screens/Branding.tsx:288` | second agent, run, 2026-11-23 | holds |
| Unreadable colors listed 'could not be checked' | `apps/console/src/screens/Branding.tsx:311` | second agent, run, 2026-11-23 | holds |
| Logo types PNG/JPEG/WebP and 512 KB; refusal texts | `apps/console/src/screens/Branding.tsx:418` | second agent, code, 2026-11-23 | holds |
| Logo replaced at once; icons made from it; Remove logo confirm | `apps/console/src/screens/Branding.tsx:451` | second agent, code, 2026-11-23 | holds |
| Save toast | `apps/console/src/screens/Branding.tsx:522` | second agent, run, 2026-11-23 | holds |
| Server refusal: 'must be a plain color, length or font list' and 'That is not a theme.' | `apps/console/src/screens/Branding.tsx:374` | second agent, run, 2026-11-23 | holds |
| Needs portal:write; read-only line | `apps/console/src/screens/Branding.tsx:536` | second agent, code, 2026-11-23 | holds |
| portal verbs | `packages/manifest/src/permissions.ts:153` | second agent, code, 2026-11-23 | holds |
