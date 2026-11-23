# Fact-check record: administer/how-to/sso/connect-an-oidc-provider

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Menu path Tenant > Single sign-on | `apps/console/src/nav.ts:196` | writer, code only, 2026-11-23 | holds (not run) |
| Connect sheet creates the provider off | `apps/console/src/screens/SingleSignOn.tsx:181` | writer, run, 2026-11-23 | holds |
| Issuer read before saving; wrong address refused | `apps/control-plane/src/kernel/sso/oidc.ts:54` | writer, code only, 2026-11-23 | holds (not run) |
| Redirect address on Set up | `apps/console/src/screens/SingleSignOn.tsx:328` | writer, run, 2026-11-23 | holds |
| Web application with authorization code flow | `apps/console/src/screens/SingleSignOn.tsx:348` | writer, code only, 2026-11-23 | holds (not run) |
| Try signing in; Show the result | `apps/console/src/screens/SingleSignOn.tsx:387` | writer, run, 2026-11-23 | holds |
| A try can show 'did not pass' for an unproved domain | `apps/control-plane/src/kernel/sso/people.ts:115` | writer, run, 2026-11-23 | holds |
| domain_needed text | `apps/control-plane/src/kernel/sso/providers.ts:497` | writer, code only, 2026-11-23 | holds (not run) |
| Turn on | `apps/console/src/screens/SingleSignOn.tsx:1475` | writer, run, 2026-11-23 | holds |
| Private issuer refused unless EGRESS_ALLOW | `apps/control-plane/src/kernel/egress.ts:5` | writer, code only, 2026-11-23 | holds (not run) |
| Public client: PKCE alone | `apps/control-plane/src/kernel/sso/oidc.ts:28` | writer, code only, 2026-11-23 | holds (not run) |
| Scopes max 20 | `apps/control-plane/src/kernel/sso/providers.ts:365` | writer, code only, 2026-11-23 | holds (not run) |
| Change the issuer dialog | `apps/console/src/screens/SingleSignOn.tsx:940` | writer, code only, 2026-11-23 | holds (not run) |
| Paused after import | `apps/console/src/screens/SingleSignOn.tsx:1495` | writer, code only, 2026-11-23 | holds (not run) |
| Import pauses providers | `docs/contracts/tenant-export.md:86` | writer, code only, 2026-11-23 | holds (not run) |
