# Fact-check record: develop/how-to/api/call-the-api-with-a-key.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A key is `Authorization: Bearer vxk_...`; any other Authorization header is refused with 401 "The Authorization header must be: Bearer <api key>.", even with a valid cookie. | `kernel/principal.ts:11,106-114`; run: `Basic abc` answered 401 with that text | pending | pending |
| A key is refused when revoked, expired, or its owner member is disabled: 401 "The API key is not valid." | `kernel/principal.ts:27-31,45-52` | pending | pending |
| No credential: 401 "Sign in or send an API key." | `kernel/errors.ts:45`; run | pending | pending |
| A key acts as its owner, with no scopes of its own. | `kernel/principal.ts:33-69` | pending | pending |
| `GET /me` answers the principal, instance permissions and the tenants (id, slug, name). | `routes/identity.ts:734`; run | pending | pending |
| A key is made in **Account**, section **API keys**, button **Create API key**, field **Name**; a row has **Revoke** with the confirmation `Revoke the key "<name>"? Anything using it stops working.`; columns Last used, Expires, Status. | `apps/console/src/screens/Account.tsx:40-75,508-535` | pending | pending |
| `POST /api-keys` takes `name` and optional `expiresAt` (must be in the future: 400 "expiresAt must be in the future."); the answer has `token`, `id`, `prefix`, `suffix`. | `routes/identity.ts:93-100,145,957-985`; run | pending | pending |
| `GET /api-keys` lists the member's keys without the value; `DELETE /api-keys/:id` answers 204 and audits `api_key.revoked`. | `routes/identity.ts:933-1011`; run | pending | pending |
| `last_used_at` is written at most once a minute. | `kernel/principal.ts:33-42` | pending | pending |
| Sign-in is `POST /api/v1/auth/sign-in/email` with email and password; the cookie is `vx_member.session_token`. | run (cookie jar); `api-description.ts:98-104` | pending | pending |
| A write with a cookie and a foreign `Origin` is refused 403 `cross_site` "This request came from another site."; reads and writes without `Origin` pass. | `kernel/principal.ts:77-93`; run | pending | pending |
| A service account's key: made with `POST /tenants/:t/service-accounts/:id/api-keys`, revoked with `DELETE …/api-keys/:keyId`; needs `service_account:write`. | `routes/tenants.ts:1259,1397,1424,1466` | pending | pending |
| A service account is created with `POST /tenants/:t/service-accounts` (`name`, optional `description`), with 201, or 202 `waiting` when the tenant asks for approval. | `routes/tenants.ts:1259-1280`; run (201) | pending | pending |
| A binding is `POST /tenants/:t/bindings` (`workspaceId`, `resourceId`, `principalType`, `principalId`, `roleId`); at the tenant or a workspace for a service account it is an access change and may answer 202; at one resource it applies at once. | `routes/permissions.ts:431-520,1005-1050`; run (201 at a resource) | pending | pending |
| A service account's key is refused on a signed-in route: 403 "This is only for a person signed in, not for a service account's key."; `/me` accepts it. | `kernel/http.ts:56,283-289`; run | pending | pending |
| A service account's key reaches only its own tenant. | `kernel/principal.ts:62-69` (tenantId on the principal); inventory B | pending | pending |
| `sso_required` 403 for a tenant that signs in through its provider. | `packages/manifest/src/errors.ts` (sso_required); `kernel/endusers.ts:177` | pending | pending |
| Every answer carries `x-request-id`. | `app.ts:125-128`; run | pending | pending |
