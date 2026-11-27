# Fact-check record: administer/how-to/sso/brand-the-portal

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| kit default placeholders | `apps/console/src/screens/Branding.tsx:185` | second agent, run, 2026-11-23 | holds |
| Dark: lengths and fonts follow light | `apps/console/src/screens/Branding.tsx:185` | second agent, code, 2026-11-23 | holds |
| Logo size | `apps/console/src/screens/Branding.tsx:131` | second agent, code, 2026-11-23 | holds |
| Save toast | `apps/console/src/screens/Branding.tsx:522` | second agent, run, 2026-11-23 | holds |
| Contrast listing | `apps/console/src/screens/Branding.tsx:295` | second agent, run, 2026-11-23 | holds |
| Clear back confirm | `apps/console/src/screens/Branding.tsx:379` | second agent, run, 2026-11-23 | holds |
| CSS 60 s | `apps/control-plane/src/routes/apps.ts:604` | second agent, code, 2026-11-23 | holds |
| Logo 300 s | `apps/control-plane/src/routes/apps.ts:665` | second agent, code, 2026-11-23 | holds |
| Workspace theme overrides | `apps/control-plane/src/kernel/apps/theme.ts:108` | second agent, code, 2026-11-23 | holds |
| No tenant name field | `apps/console/src/screens/Branding.tsx:26` | second agent, code, 2026-11-23 | holds |
| Upload a logo: "The logo is replaced."; Replace the logo; Remove logo and its confirmation; svg and files over 512 KB refused with the page's words; logo served with cache 300 s | `apps/console/src/screens/Branding.tsx:418` | second agent, run, 2026-11-23 | holds (run in sso-wave at 390 px dark: PNG accepted, SVG and a 600 KB file refused) |
