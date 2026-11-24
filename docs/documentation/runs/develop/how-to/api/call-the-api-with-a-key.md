# Run log: develop/how-to/api/call-the-api-with-a-key.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
1. `POST /api/v1/auth/sign-in/email` with Maya's email and demo password: 200, a cookie `vx_member.session_token` in the jar.
2. `POST /api/v1/api-keys` `{"name":"api-docs-run"}` with the cookie: 201, body with `id`, `prefix` `vxk_hO_YE6db`, `suffix`, `token`, `ownerType` member.
3. `GET /me` with `Authorization: Bearer <key>`: 200, principal Maya Brooks, `instancePermissions: []`, one tenant (`fernhill`). `GET /tenants/<id>/workspaces`: Clinics (production) and Sandbox (dev).
4. Refusals: `Bearer vxk_nope` 401 "The API key is not valid."; `Basic abc` 401 "The Authorization header must be: Bearer <api key>."; none 401 "Sign in or send an API key."; cookie plus `Origin: https://evil.example` on `POST /api-keys` 403 `cross_site` "This request came from another site."; `expiresAt` in 2020 400 "expiresAt must be in the future."
5. A key with `expiresAt` tomorrow (`api-docs-expiring`) was made: 201, `expiresAt` echoed.
6. Service account: `POST /tenants/<t>/service-accounts` `{"name":"api-docs-agent",...}` 201; binding `agent_runner` at the script `hooks/echo` (workspace `api-docs`, `resourceId`) 201; `POST …/service-accounts/<id>/api-keys` 201. With that key `GET /me` 200 (principal `service_account`); `GET /api-keys` 403 "This is only for a person signed in, not for a service account's key."; `GET …/workspaces/<api-docs>/runs` 403 "This needs the run:read permission."
7. `GET /api-keys` lists the keys with prefix, suffix, lastUsedAt, expiresAt, revokedAt.
8. Revoke: `DELETE /api-keys/<id>` for the three keys made for the run: 204 each, then `GET /me` with the revoked key 401.

## The page got wrong (and was corrected)
- A first draft said a role given to a service account always waits for approval; the code and the run show it waits only at the tenant or a workspace, not at one resource.

## Second check (2026-11-23, second agent)

The instance was http://localhost:8091 (a tenant of my own, `api-check2`, with a workspace `agent-ws`; keys and tokens revoked at the end).

- Run now: the console's **Create API key** and **Revoke** buttons.
- Not run: a key made through an `Origin`-less browser, `sso_required`, a disabled owner, a binding at the workspace scope with approval on (the access run covers a tenant-scope binding).

The console key screen, the Agent tools tab and Members & access were walked at 1440 px, at 390 px and in dark (the key screen: create, one-time key, revoke; Agent tools: workspace choice, address, settings, Tools offered, Try): no overflow at 390 px, the settings block scrolls inside itself, dark has no contrast fault.

## Not run (before the second check)

The console's **Create API key** and **Revoke** buttons, a key made through an `Origin`-less browser, `sso_required`, a disabled owner, a binding at the workspace scope with approval on.
