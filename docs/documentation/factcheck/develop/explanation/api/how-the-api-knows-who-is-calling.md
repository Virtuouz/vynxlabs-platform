# Fact-check record: develop/explanation/api/how-the-api-knows-who-is-calling.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Credential prefixes: `vxk_` key, `vxs_` app sign-in, `vxw_` worker, `vxp_` SCIM, `vxh_`/`vxf_` webhook/form. | `kernel/principal.ts:11`; `kernel/apps/sessions.ts:15`; `kernel/execution/workers.ts:10`; `kernel/sso/scim.ts:26`; `kernel/execution/triggers.ts:155-157` | pending | pending |
| Console session cookie `vx_member.session_token`, 7 days, instance's own address. | run (cookie jar); `config.ts:125`; `kernel/auth.ts:100-106`; `kernel/principal.ts:118-135` | pending | pending |
| App sign-in cookie `vx_app_<tenant id>`; end user 30 days, member 12 hours. | `kernel/apps/sessions.ts:8-18` | pending | pending |
| Approval link 48 hours. | `kernel/flows/approval-links.ts:20` | pending | pending |
| Metrics: member or key with `instance:read`, or `METRICS_TOKEN`. | `routes/execution.ts:3997`; inventory B | pending | pending |
| Only `Bearer vxk_` accepted; others 401 even with a cookie. | `kernel/principal.ts:106-114` | pending | pending |
| Keys: hash stored with prefix and last four; refused when revoked, expired or owner disabled. | `kernel/principal.ts:13-52`; `routes/identity.ts:120-160` | pending | pending |
| `cross_site` rule for writes with a cookie. | `kernel/principal.ts:77-93` | pending | pending |
| No `access-control-*` header in the API. | inventory B (grep of `apps/control-plane/src`); not re-run | pending | pending |
| Service account refused on `signed-in` routes unless declared (`GET /me` and approvals batch). | `kernel/http.ts:28-29,56,283-289`; `routes/batch.ts:246`; `routes/identity.ts:734` | pending | pending |
| End users and app sign-ins: "This is only for a member signed in to the workspace." | `kernel/http.ts:159,283` | pending | pending |
| A service account may not approve or decline an access change. | `kernel/tenant/releases.ts:1100-1104` | pending | pending |
| A request at a tenant's registered hostname is answered for that tenant only; 404 for a scoped lookup with no standing. | `kernel/http.ts:262-270,166-170` | pending | pending |
| A service account's key reaches only its tenant. | `kernel/principal.ts:62-69` | pending | pending |
