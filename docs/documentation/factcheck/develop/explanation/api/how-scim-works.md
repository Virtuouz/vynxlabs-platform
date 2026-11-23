# Fact-check record: develop/explanation/api/how-scim-works.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Address `/api/v1/scim/v2/<provider id>`, never changes. | `kernel/sso/scim.ts:363-364`; `routes/scim.ts:84-90` | pending | pending |
| Token `vxp_`, shown once, expiry 1 to 3,650 days, revocable. | `kernel/sso/scim.ts:26`; `routes/scim.ts:305-345` | pending | pending |
| Wrong, revoked, expired or other-provider token: 401 "The token is not valid for this address."; paused provider: 403. | `kernel/sso/scim.ts:100-125` | pending | pending |
| Bodies `application/scim+json`; SCIM error bodies; 1200/min. | `routes/scim.ts:49,388,410-433` | pending | pending |
| Configuration: patch yes, filter yes max 200, bulk no, sort no, changePassword no, etag no, one bearer scheme. | `routes/scim.ts:488-520` | pending | pending |
| Users: GET list/one, POST, PUT, PATCH, DELETE; Groups likewise. | `routes/scim.ts:640-1010` | pending | pending |
| User filter `userName eq`/`externalId eq` only; group filter `displayName eq`/`externalId eq`. | `kernel/sso/scim.ts:144-160`; `routes/scim.ts:640-660,836-860` | pending | pending |
| POST user: member's email must be in a proved domain; needs an email; `active` false turns off. | `routes/scim.ts:686-700`; `kernel/sso/scim.ts:629,676-686` | pending | pending |
| PATCH: add/replace/remove; `active` false disables an end user, suspends a member in the tenant, disables everywhere for the instance's provider. | `routes/scim.ts:761-775` | pending | pending |
| DELETE user turns off and removes the tie; account kept. DELETE group leaves the group, members leave it. | `routes/scim.ts:793-800,1001-1006` | pending | pending |
| Groups map by name via the provider's group map; a group is made where the provider makes its own. | `routes/scim.ts:882-890` | pending | pending |
| `startIndex` from 1, `count` max 200 default 100. | `routes/scim.ts:456-460` | pending | pending |
| A clash of userName, external ID or email: refused; last admin/operator: 409, listed under refused pushes; refused pushes keep only the reason. | `kernel/sso/scim.ts:647-657,773`; `routes/scim.ts:415-420,444-452` | pending | pending |
| Audit: made by `SCIM: <provider name>` with the token's first characters, `via: scim`. | `routes/scim.ts:430-445` | pending | pending |
| Settings `subjectFrom` externalId|userName|null, `groups` sign_in|scim, `createGroups`; needs `sso:write` (instance: `instance:write`). | `routes/scim.ts:61-75,108-111` | pending | pending |
| Not run on the instance: no identity provider was set up. | — | pending | pending |
