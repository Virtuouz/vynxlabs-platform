# Fact-check: self-host/how-to/running/change-auth-secret.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `AUTH_SECRET` signs cookies and the `_vx-challenge` records; at least 32 characters. | `config.ts:203`; `docs/self-hosting.md` | writer, 2026-11-23 | carried for the records; not run |
| Everyone signs in again; API keys, bundles, secrets and runs are not affected. | `docs/self-hosting.md` | writer, 2026-11-23 | carried; not run |

## Second check (2026-11-23)

Run: new value, restart: the old cookie answered 401, a new sign-in 200; a short value: 'AUTH_SECRET must be at least 32 characters.' Page corrected: end users' and apps' sessions are random tokens stored hashed (`kernel/apps/sessions.ts`), not signed with AUTH_SECRET, so they stay signed in; `authSecret` is used only in `kernel/auth.ts` and `kernel/apps/challenge.ts`.
