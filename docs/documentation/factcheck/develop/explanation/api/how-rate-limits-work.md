# Fact-check record: develop/explanation/api/how-rate-limits-work.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Fixed one-minute window per address, counted in Postgres, shared by replicas. | `kernel/ratelimit.ts:11-34,36-75` | pending | pending |
| 429 `rate_limited` headers `x-ratelimit-limit/remaining/reset`, `retry-after`. | run | pending | pending |
| Guests on app-facing routes 120/min, counting only non-signed-in callers. | `kernel/http.ts:80-90` (guestLimit) | pending | pending |
| Webhooks 120. | `routes/execution.ts:3718` | pending | pending |
| SCIM 1200. | `routes/scim.ts:388` | pending | pending |
| Expression value 240. | `routes/flows.ts:331` | pending | pending |
| SSO 60; app hand-off 60; OAuth callback 60. | `routes/sso.ts:155`; `routes/apps.ts:155`; `routes/execution.ts:3116` | pending | pending |
| Approval link 30. | `routes/approval-links.ts:14` | pending | pending |
| Member password-reset link 20. | `routes/member-resets.ts:15` | pending | pending |
| End-user sign-in 20, sign-up 5. | `routes/endusers.ts:132-133` | pending | pending |
| Member sign-in, sign-up, change of password or email, reset and verification mail 20/min per address and path. | `kernel/auth.ts:23-25,66-80` | pending | pending |
| No general limit on authenticated traffic. | inventory B; no `rateLimit` in `routes/` outside the list above (grep) | pending | pending |
| Guest file downloads are counted in each replica's memory. | inventory B (`docs/self-hosting.md`); not re-checked | pending | pending |
| `TRUSTED_PROXIES` default `1`, `0`, a count or networks; proxy must set `X-Forwarded-For`. | `config-vars.ts:298-303`; `app.ts:103-120` | pending | pending |
| Without a proxy and with `1`, a caller can write the last entry. | inventory B (`fixed/host.md`); reasoning from the same description | pending | pending |
| Busy 503 before 429 for heavy authenticated traffic. | `kernel/errors.ts:52`; judgment, second agent to confirm or strike | pending | pending |
