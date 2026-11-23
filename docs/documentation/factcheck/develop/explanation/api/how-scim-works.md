# Fact-check record: develop/explanation/api/how-scim-works.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Address `/api/v1/scim/v2/<provider id>`, never changes. | `kernel/sso/scim.ts:363-364`; `routes/scim.ts:84-90` | second agent, 2026-11-23 | checked |
| Token `vxp_`, shown once, expiry 1 to 3,650 days, revocable. | `kernel/sso/scim.ts:26`; `routes/scim.ts:305-345` | second agent, 2026-11-23 | checked |
| Wrong, revoked, expired or other-provider token: 401 "The token is not valid for this address."; paused provider: 403. | `kernel/sso/scim.ts:100-125` | second agent, 2026-11-23 | checked |
| Bodies `application/scim+json`; SCIM error bodies; 1200/min. | `routes/scim.ts:49,388,410-433` | second agent, 2026-11-23 | checked |
| Configuration: patch yes, filter yes max 200, bulk no, sort no, changePassword no, etag no, one bearer scheme. | `routes/scim.ts:488-520` | second agent, 2026-11-23 | checked |
| Users: GET list/one, POST, PUT, PATCH, DELETE; Groups likewise. | `routes/scim.ts:640-1010` | second agent, 2026-11-23 | checked |
| User filter `userName eq`/`externalId eq` only; group filter `displayName eq`/`externalId eq`. | `kernel/sso/scim.ts:144-160`; `routes/scim.ts:640-660,836-860` | second agent, 2026-11-23 | checked |
| POST user: member's email must be in a proved domain; needs an email; `active` false turns off. | `routes/scim.ts:686-700`; `kernel/sso/scim.ts:629,676-686` | second agent, 2026-11-23 | checked |
| PATCH: add/replace/remove; `active` false disables an end user, suspends a member in the tenant, disables everywhere for the instance's provider. | `routes/scim.ts:761-775` | second agent, 2026-11-23 | checked |
| DELETE user turns off and removes the tie; account kept. DELETE group leaves the group, members leave it. | `routes/scim.ts:793-800,1001-1006` | second agent, 2026-11-23 | checked |
| Groups map by name via the provider's group map; a group is made where the provider makes its own. | `routes/scim.ts:882-890` | second agent, 2026-11-23 | checked |
| `startIndex` from 1, `count` max 200 default 100. | `routes/scim.ts:456-460` | second agent, 2026-11-23 | checked |
| A clash of userName, external ID or email: refused; last admin/operator: 409, listed under refused pushes; refused pushes keep only the reason. | `kernel/sso/scim.ts:647-657,773`; `routes/scim.ts:415-420,444-452` | second agent, 2026-11-23 | checked |
| Audit: made by `SCIM: <provider name>` with the token's first characters, `via: scim`. | `routes/scim.ts:430-445` | second agent, 2026-11-23 | checked |
| Settings `subjectFrom` externalId|userName|null, `groups` sign_in|scim, `createGroups`; needs `sso:write` (instance: `instance:write`). | `routes/scim.ts:61-75,108-111` | second agent, 2026-11-23 | checked |
| Not run on the instance: no identity provider was set up. | — | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run with curl as an identity provider against two providers of my own tenant (an OIDC provider of end users and one of members; Keycloak's realm was reachable for the issuer, nothing signed in): `vxp_` token (expiry 3651 days 400; 30 days ok; none ok), `ServiceProviderConfig`, `ResourceTypes`, wrong token / other provider's token / none (401 "The token is not valid for this address."), a revoked token, `x-ratelimit-limit: 1200`, `POST` end user, `POST` member in an unproved domain (400 "…is not in an email domain this provider has proved."), no email (400), list, `count`, filters (`userName eq`, other 400 `invalidFilter`), `PATCH` (name, `active` false by object), `PUT`, clash (409 `uniqueness`), `active` false at creation, group `POST` with `createGroups` (group made, kept after `DELETE`), `PATCH`, `DELETE`, user `DELETE` (audit `scim.user_removed`, `end_user.disabled`), the refused pushes list, `…/Bulk` (404 problem body).
- Corrected: the audit entry. The code sets the actor name `SCIM: <provider>` but `writeAudit` does not store it: the entry has `actorType` system, no label, and `via`, `identityProvider`, `token` in its details. fault fixed (fd): `writeAudit` keeps the actor's name as `details.actorName` and the audit list's `actorLabel` falls back to it (`kernel/audit.ts`, `routes/identity.ts`), confirmed in the code; the page now says the log names the actor `SCIM: <provider name>`.
- Corrected: a call to another address is the API's 404, not SCIM's.
- Not run: a paused provider (only a tenant imported from another instance), a member push (needs a proved domain: no real DNS), the last-admin 409, an expired token, `PATCH` of a member, the instance's own provider.
