# Fact-check record: administer/reference/screens/single-sign-on

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Connect sheet title, description and fields (Who signs in through it, Protocol, Name max 80, Issuer, Client ID, Client secret, Metadata address, Metadata) | `apps/console/src/screens/SingleSignOn.tsx:180` | second agent, run, 2026-11-23 | holds |
| Client secret hint: kept sealed, empty for a public client | `apps/console/src/screens/SingleSignOn.tsx:272` | second agent, run, 2026-11-23 | holds |
| List columns Name, For, Protocol, State; Required tag | `apps/console/src/screens/SingleSignOn.tsx:1635` | second agent, run, 2026-11-23 | holds |
| Empty state 'No identity providers' | `apps/console/src/screens/SingleSignOn.tsx:1617` | second agent, run, 2026-11-23 | holds |
| Remove asks to type the name; text about domains, mapping and ties | `apps/console/src/screens/SingleSignOn.tsx:1395` | second agent, run, 2026-11-23 | holds |
| Require it / Stop requiring it only while on; dialog texts | `apps/console/src/screens/SingleSignOn.tsx:1422` | second agent, run, 2026-11-23 | holds |
| Turn off dialog names the domains and the SCIM sentence | `apps/console/src/screens/SingleSignOn.tsx:1466` | second agent, run, 2026-11-23 | holds |
| Steps bar Connect / Prove domains / Map groups / Switch on and their details | `apps/console/src/screens/SingleSignOn.tsx:1325` | second agent, run, 2026-11-23 | holds |
| Recovery codes notice before requiring (members, on, not required) | `apps/console/src/screens/SingleSignOn.tsx:1489` | second agent, code, 2026-11-23 | holds |
| Paused notice after import | `apps/console/src/screens/SingleSignOn.tsx:1495` | second agent, code, 2026-11-23 | holds |
| Set up: Redirect address, Reply address (ACS), Entity ID (audience), Metadata address, Sign-in address | `apps/console/src/screens/SingleSignOn.tsx:331` | second agent, run, 2026-11-23 | holds |
| Try signing in / Show the result; facts Subject, Email, Email verified, Name, Groups, Attributes; Everything the provider sent | `apps/console/src/screens/SingleSignOn.tsx:428` | second agent, run, 2026-11-23 | holds |
| A try that did not pass: 'The last try, <time>, did not pass.' | `apps/console/src/screens/SingleSignOn.tsx:396` | second agent, run, 2026-11-23 | holds |
| Domains tab: Email domain, Add domain, Check now, Remove; Proved / Not proved / record gone pills | `apps/console/src/screens/SingleSignOn.tsx:513` | second agent, run, 2026-11-23 | holds |
| Instance domains need no proof | `apps/console/src/screens/SingleSignOn.tsx:469` | second agent, code, 2026-11-23 | holds |
| Domain remove dialog text | `apps/console/src/screens/SingleSignOn.tsx:536` | second agent, code, 2026-11-23 | holds |
| Groups tab: description, `*`, Group at the provider, Group here, Add a mapping, row incomplete message | `apps/console/src/screens/SingleSignOn.tsx:606` | second agent, run, 2026-11-23 | holds |
| Rows made by an access change are read only with tag Access change | `apps/console/src/screens/SingleSignOn.tsx:655` | second agent, code, 2026-11-23 | holds |
| Settings fields: Name max 80; Sign-in address; Provider's entity ID; Signing certificates; Name ID format; What must be signed; Sign the requests; Ask the provider to encrypt; Accept SHA-1; Accept sign-ins the provider begins | `apps/console/src/screens/SingleSignOn.tsx:1097` | second agent, run, 2026-11-23 | holds |
| Name ID formats and What must be signed options | `apps/console/src/screens/SingleSignOn.tsx:738` | second agent, code, 2026-11-23 | holds |
| OIDC settings: Issuer, Client ID, Client secret, Remove the stored client secret, Scopes, Also read the user-info address | `apps/console/src/screens/SingleSignOn.tsx:1134` | second agent, code, 2026-11-23 | holds |
| Changing the issuer / entity ID asks and removes ties | `apps/console/src/screens/SingleSignOn.tsx:937` | second agent, code, 2026-11-23 | holds |
| Claims fields Subject, Email, Name, Groups; usual names as placeholders | `apps/console/src/screens/SingleSignOn.tsx:1161` | second agent, code, 2026-11-23 | holds |
| Attributes (end users) and Take the provider's word on emails | `apps/console/src/screens/SingleSignOn.tsx:1179` | second agent, code, 2026-11-23 | holds |
| Attributes line refusal text | `apps/console/src/screens/SingleSignOn.tsx:958` | second agent, code, 2026-11-23 | holds |
| Create people the first time they sign in; Role given to a new member (tenant members only) | `apps/console/src/screens/SingleSignOn.tsx:1205` | second agent, code, 2026-11-23 | holds |
| People tab columns, Untie text, Nobody yet | `apps/console/src/screens/SingleSignOn.tsx:1262` | second agent, run, 2026-11-23 | holds |
| People list pages 200 | `apps/console/src/screens/SingleSignOn.tsx:1229` | second agent, code, 2026-11-23 | holds |
| Provisioning: SCIM base address; tokens table columns; Make a token; How pushes are taken; What has been pushed; People pushed chips; Refused pushes columns | `apps/console/src/screens/Provisioning.tsx:153` | second agent, run, 2026-11-23 | holds |
| Token Status expired/active | `apps/console/src/screens/Provisioning.tsx:164` | second agent, code, 2026-11-23 | holds |
| Pushed people page 200 | `apps/console/src/screens/Provisioning.tsx:299` | second agent, code, 2026-11-23 | holds |
| Read-only notice and disabled controls | `apps/console/src/kit/Can.tsx:187` | second agent, code, 2026-11-23 | holds |
| sso:read / sso:write meanings | `packages/manifest/src/permissions.ts:180` | second agent, code, 2026-11-23 | holds |
| Group mapping needs group:write / end_user_group:write / binding:write | `apps/control-plane/src/routes/sso.ts:750` | second agent, code, 2026-11-23 | holds |
