# Fact-check record: administer/reference/screens/single-sign-on

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Connect sheet title, description and fields (Who signs in through it, Protocol, Name max 80, Issuer, Client ID, Client secret, Metadata address, Metadata) | `apps/console/src/screens/SingleSignOn.tsx:180` | writer, run, 2026-11-23 | holds |
| Client secret hint: kept sealed, empty for a public client | `apps/console/src/screens/SingleSignOn.tsx:272` | writer, run, 2026-11-23 | holds |
| List columns Name, For, Protocol, State; Required tag | `apps/console/src/screens/SingleSignOn.tsx:1635` | writer, run, 2026-11-23 | holds |
| Empty state 'No identity providers' | `apps/console/src/screens/SingleSignOn.tsx:1617` | writer, run, 2026-11-23 | holds |
| Remove asks to type the name; text about domains, mapping and ties | `apps/console/src/screens/SingleSignOn.tsx:1395` | writer, run, 2026-11-23 | holds |
| Require it / Stop requiring it only while on; dialog texts | `apps/console/src/screens/SingleSignOn.tsx:1422` | writer, run, 2026-11-23 | holds |
| Turn off dialog names the domains and the SCIM sentence | `apps/console/src/screens/SingleSignOn.tsx:1466` | writer, run, 2026-11-23 | holds |
| Steps bar Connect / Prove domains / Map groups / Switch on and their details | `apps/console/src/screens/SingleSignOn.tsx:1325` | writer, run, 2026-11-23 | holds |
| Recovery codes notice before requiring (members, on, not required) | `apps/console/src/screens/SingleSignOn.tsx:1489` | writer, code only, 2026-11-23 | holds (not run) |
| Paused notice after import | `apps/console/src/screens/SingleSignOn.tsx:1495` | writer, code only, 2026-11-23 | holds (not run) |
| Set up: Redirect address, Reply address (ACS), Entity ID (audience), Metadata address, Sign-in address | `apps/console/src/screens/SingleSignOn.tsx:331` | writer, run, 2026-11-23 | holds |
| Try signing in / Show the result; facts Subject, Email, Email verified, Name, Groups, Attributes; Everything the provider sent | `apps/console/src/screens/SingleSignOn.tsx:428` | writer, run, 2026-11-23 | holds |
| A try that did not pass: 'The last try, <time>, did not pass.' | `apps/console/src/screens/SingleSignOn.tsx:396` | writer, run, 2026-11-23 | holds |
| Domains tab: Email domain, Add domain, Check now, Remove; Proved / Not proved / record gone pills | `apps/console/src/screens/SingleSignOn.tsx:513` | writer, run, 2026-11-23 | holds |
| Instance domains need no proof | `apps/console/src/screens/SingleSignOn.tsx:469` | writer, code only, 2026-11-23 | holds (not run) |
| Domain remove dialog text | `apps/console/src/screens/SingleSignOn.tsx:536` | writer, code only, 2026-11-23 | holds (not run) |
| Groups tab: description, `*`, Group at the provider, Group here, Add a mapping, row incomplete message | `apps/console/src/screens/SingleSignOn.tsx:606` | writer, run, 2026-11-23 | holds |
| Rows made by an access change are read only with tag Access change | `apps/console/src/screens/SingleSignOn.tsx:655` | writer, code only, 2026-11-23 | holds (not run) |
| Settings fields: Name max 80; Sign-in address; Provider's entity ID; Signing certificates; Name ID format; What must be signed; Sign the requests; Ask the provider to encrypt; Accept SHA-1; Accept sign-ins the provider begins | `apps/console/src/screens/SingleSignOn.tsx:1097` | writer, run, 2026-11-23 | holds |
| Name ID formats and What must be signed options | `apps/console/src/screens/SingleSignOn.tsx:738` | writer, code only, 2026-11-23 | holds (not run) |
| OIDC settings: Issuer, Client ID, Client secret, Remove the stored client secret, Scopes, Also read the user-info address | `apps/console/src/screens/SingleSignOn.tsx:1134` | writer, code only, 2026-11-23 | holds (not run) |
| Changing the issuer / entity ID asks and removes ties | `apps/console/src/screens/SingleSignOn.tsx:937` | writer, code only, 2026-11-23 | holds (not run) |
| Claims fields Subject, Email, Name, Groups; usual names as placeholders | `apps/console/src/screens/SingleSignOn.tsx:1161` | writer, code only, 2026-11-23 | holds (not run) |
| Attributes (end users) and Take the provider's word on emails | `apps/console/src/screens/SingleSignOn.tsx:1179` | writer, code only, 2026-11-23 | holds (not run) |
| Attributes line refusal text | `apps/console/src/screens/SingleSignOn.tsx:958` | writer, code only, 2026-11-23 | holds (not run) |
| Create people the first time they sign in; Role given to a new member (tenant members only) | `apps/console/src/screens/SingleSignOn.tsx:1205` | writer, code only, 2026-11-23 | holds (not run) |
| People tab columns, Untie text, Nobody yet | `apps/console/src/screens/SingleSignOn.tsx:1262` | writer, run, 2026-11-23 | holds |
| People list pages 200 | `apps/console/src/screens/SingleSignOn.tsx:1229` | writer, code only, 2026-11-23 | holds (not run) |
| Provisioning: SCIM base address; tokens table columns; Make a token; How pushes are taken; What has been pushed; People pushed chips; Refused pushes columns | `apps/console/src/screens/Provisioning.tsx:153` | writer, run, 2026-11-23 | holds |
| Token Status expired/active | `apps/console/src/screens/Provisioning.tsx:164` | writer, code only, 2026-11-23 | holds (not run) |
| Pushed people page 200 | `apps/console/src/screens/Provisioning.tsx:299` | writer, code only, 2026-11-23 | holds (not run) |
| Read-only notice and disabled controls | `apps/console/src/kit/Can.tsx:187` | writer, code only, 2026-11-23 | holds (not run) |
| sso:read / sso:write meanings | `packages/manifest/src/permissions.ts:180` | writer, code only, 2026-11-23 | holds (not run) |
| Group mapping needs group:write / end_user_group:write / binding:write | `apps/control-plane/src/routes/sso.ts:750` | writer, code only, 2026-11-23 | holds (not run) |
