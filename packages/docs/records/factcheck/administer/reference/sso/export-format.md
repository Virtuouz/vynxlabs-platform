# Fact-check record: administer/reference/sso/export-format

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Manifest fields incl notCarried, authentication | `docs/contracts/tenant-export.md:128` | second agent, code, 2026-11-23 | holds |
| Format version 2 and layout | `docs/contracts/tenant-export.md:3` | second agent, code, 2026-11-23 | holds |
| The file as a whole is not encrypted | `docs/contracts/tenant-export.md:62` | second agent, run, 2026-11-23 | holds |
| Never list | `docs/contracts/tenant-export.md:140` | second agent, code, 2026-11-23 | holds |
| Import steps | `docs/contracts/tenant-export.md:150` | second agent, code, 2026-11-23 | holds |
| Paused providers and unproved domains after import | `docs/contracts/tenant-export.md:86` | second agent, code, 2026-11-23 | holds |
