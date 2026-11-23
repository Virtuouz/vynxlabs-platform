# Fact-check record: administer/how-to/sso/connect-an-oidc-provider

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Menu path Tenant > Single sign-on | `apps/console/src/nav.ts:196` | second agent, code, 2026-11-23 | holds |
| Connect sheet creates the provider off | `apps/console/src/screens/SingleSignOn.tsx:181` | second agent, run, 2026-11-23 | holds |
| Issuer read before saving; wrong address refused | `apps/control-plane/src/kernel/sso/oidc.ts:54` | second agent, code, 2026-11-23 | holds |
| Redirect address on Set up | `apps/console/src/screens/SingleSignOn.tsx:328` | second agent, run, 2026-11-23 | holds |
| Web application with authorization code flow | `apps/console/src/screens/SingleSignOn.tsx:348` | second agent, code, 2026-11-23 | holds |
| Try signing in; Show the result | `apps/console/src/screens/SingleSignOn.tsx:387` | second agent, run, 2026-11-23 | holds |
| A try can show 'did not pass' for an unproved domain | `apps/control-plane/src/kernel/sso/people.ts:115` | second agent, run, 2026-11-23 | holds |
| domain_needed text | `apps/control-plane/src/kernel/sso/providers.ts:497` | second agent, code, 2026-11-23 | holds |
| Turn on | `apps/console/src/screens/SingleSignOn.tsx:1475` | second agent, run, 2026-11-23 | holds |
| Private issuer refused unless EGRESS_ALLOW | `apps/control-plane/src/kernel/egress.ts:5` | second agent, code, 2026-11-23 | holds |
| Public client: PKCE alone | `apps/control-plane/src/kernel/sso/oidc.ts:28` | second agent, code, 2026-11-23 | holds |
| Scopes max 20 | `apps/control-plane/src/kernel/sso/providers.ts:365` | second agent, code, 2026-11-23 | holds |
| Change the issuer dialog | `apps/console/src/screens/SingleSignOn.tsx:940` | second agent, code, 2026-11-23 | holds |
| Paused after import | `apps/console/src/screens/SingleSignOn.tsx:1495` | second agent, code, 2026-11-23 | holds |
| Import pauses providers | `docs/contracts/tenant-export.md:86` | second agent, code, 2026-11-23 | holds |
| A public client: Remove the stored client secret then a try passes with PKCE alone | `apps/console/src/screens/SingleSignOn.tsx:1134` | second agent, run, 2026-11-23 | holds |
