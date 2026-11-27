# Fact-check record: develop/explanation/api/how-the-api-knows-who-is-calling.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Credential prefixes: `vxk_` key, `vxs_` app sign-in, `vxw_` worker, `vxp_` SCIM, `vxh_`/`vxf_` webhook/form. | `kernel/principal.ts:11`; `kernel/apps/sessions.ts:15`; `kernel/execution/workers.ts:10`; `kernel/sso/scim.ts:26`; `kernel/execution/triggers.ts:155-157` | second agent, 2026-11-23 | checked |
| Console session cookie `vx_member.session_token`, 7 days, instance's own address. | run (cookie jar); `config.ts:125`; `kernel/auth.ts:100-106`; `kernel/principal.ts:118-135` | second agent, 2026-11-23 | checked |
| App sign-in cookie `vx_app_<tenant id>`; end user 30 days, member 12 hours. | `kernel/apps/sessions.ts:8-18` | second agent, 2026-11-23 | checked |
| Approval link 48 hours. | `kernel/flows/approval-links.ts:20` | second agent, 2026-11-23 | checked |
| Metrics: member or key with `instance:read`, or `METRICS_TOKEN`. | `routes/execution.ts:3997`; inventory B | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |
| Only `Bearer vxk_` accepted; others 401 even with a cookie. | `kernel/principal.ts:106-114` | second agent, 2026-11-23 | checked |
| Keys: hash stored with prefix and last four; refused when revoked, expired or owner disabled. | `kernel/principal.ts:13-52`; `routes/identity.ts:120-160` | second agent, 2026-11-23 | checked |
| `cross_site` rule for writes with a cookie. | `kernel/principal.ts:77-93` | second agent, 2026-11-23 | checked |
| No `access-control-*` header in the API. | inventory B (grep of `apps/control-plane/src`); not re-run | second agent, 2026-11-23 | checked |
| Service account refused on `signed-in` routes unless declared (`GET /me` and approvals batch). | `kernel/http.ts:28-29,56,283-289`; `routes/batch.ts:246`; `routes/identity.ts:734` | second agent, 2026-11-23 | checked |
| End users and app sign-ins: "This is only for a member signed in to the workspace." | `kernel/http.ts:159,283` | second agent, 2026-11-23 | checked |
| A service account may not approve or decline an access change. | `kernel/tenant/releases.ts:1100-1104` | second agent, 2026-11-23 | checked |
| A request at a tenant's registered hostname is answered for that tenant only; 404 for a scoped lookup with no standing. | `kernel/http.ts:262-270,166-170` | second agent, 2026-11-23 | checked |
| A service account's key reaches only its tenant. | `kernel/principal.ts:62-69` | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run: `Basic` header with a cookie 401, no `access-control-*` in an OPTIONS answer, a service account's key refused on `/api-keys` and `/tenants` ("This is only for a person signed in, not for a service account's key."), cross-site write 403 `cross_site` (see the key page's run). Session 7 days, end user 30 days, member app 12 hours and the approval link 48 hours read from `config.ts:125`, `kernel/apps/sessions.ts:8,10`, `kernel/flows/approval-links.ts:20`.
