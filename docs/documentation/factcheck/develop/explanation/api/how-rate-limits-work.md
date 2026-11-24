# Fact-check record: develop/explanation/api/how-rate-limits-work.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Fixed one-minute window per address, counted in Postgres, shared by replicas. | `kernel/ratelimit.ts:11-34,36-75` | second agent, 2026-11-23 | checked |
| 429 `rate_limited` headers `x-ratelimit-limit/remaining/reset`, `retry-after`. | run | second agent, 2026-11-23 | checked |
| Guests on app-facing routes 120/min, counting only non-signed-in callers. | `kernel/http.ts:80-90` (guestLimit) | second agent, 2026-11-23 | checked |
| Webhooks 120. | `routes/execution.ts:3718` | second agent, 2026-11-23 | checked |
| SCIM 1200. | `routes/scim.ts:388` | second agent, 2026-11-23 | checked |
| Expression value 240. | `routes/flows.ts:331` | second agent, 2026-11-23 | checked |
| SSO 60; app hand-off 60; OAuth callback 60. | `routes/sso.ts:155`; `routes/apps.ts:155`; `routes/execution.ts:3116` | second agent, 2026-11-23 | checked |
| Approval link 30. | `routes/approval-links.ts:14` | second agent, 2026-11-23 | checked |
| Member password-reset link 20. | `routes/member-resets.ts:15` | second agent, 2026-11-23 | checked |
| End-user sign-in 20, sign-up 5. | `routes/endusers.ts:132-133` | second agent, 2026-11-23 | checked |
| Member sign-in, sign-up, change of password or email, reset and verification mail 20/min per address and path. | `kernel/auth.ts:23-25,66-80` | second agent, 2026-11-23 | checked |
| No general limit on authenticated traffic. | inventory B; no `rateLimit` in `routes/` outside the list above (grep) | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |
| Guest file downloads are counted in each replica's memory. | inventory B (`docs/self-hosting.md`); not re-checked | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |
| `TRUSTED_PROXIES` default `1`, `0`, a count or networks; proxy must set `X-Forwarded-For`. | `config-vars.ts:298-303`; `app.ts:103-120` | second agent, 2026-11-23 | checked |
| Without a proxy and with `1`, a caller can write the last entry. | inventory B (`fixed/host.md`); reasoning from the same description | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |
| Busy 503 before 429 for heavy authenticated traffic. | `kernel/errors.ts:52`; judgment, second agent to confirm or strike | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run: a webhook loop of 125 requests: 429 after 120 with `x-ratelimit-limit: 120`, `x-ratelimit-remaining: 0`, `x-ratelimit-reset`, `retry-after`, body "Rate limit exceeded, retry in N seconds"; SCIM `x-ratelimit-limit: 1200`; `busy` 503 reached by exhausting the database pool (see the error page's run).
- Not re-checked: guest file downloads counted in replica memory, `TRUSTED_PROXIES` behavior, the other limits (read from the code lines cited).
