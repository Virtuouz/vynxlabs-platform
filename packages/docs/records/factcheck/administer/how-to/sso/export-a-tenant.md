# Fact-check record: administer/how-to/sso/export-a-tenant

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Passphrase messages | `apps/console/src/screens/Environments.tsx:833` | second agent, run, 2026-11-23 | holds |
| History option | `apps/console/src/screens/Environments.tsx:842` | second agent, run, 2026-11-23 | holds |
| Downloaded notice | `apps/console/src/screens/Environments.tsx:849` | second agent, run, 2026-11-23 | holds |
| CLI command | `packages/cli/src/commands.ts:168` | second agent, code, 2026-11-23 | holds |
| Passphrase env | `packages/cli/src/example.test.ts:565` | second agent, code, 2026-11-23 | holds |
| File not encrypted | `docs/contracts/tenant-export.md:62` | second agent, code, 2026-11-23 | holds |
| notCarried | `docs/contracts/tenant-export.md:128` | second agent, code, 2026-11-23 | holds |
| volvel tenant export prints Exported <slug> to <file> and what history holds; short passphrase and unset variable refused with the page's words; --history; the archive lists key.json, members, platform/, manifest.json last | `packages/cli/src/cli.ts:836` | second agent, run, 2026-11-23 | holds (CLI from this tree) |
