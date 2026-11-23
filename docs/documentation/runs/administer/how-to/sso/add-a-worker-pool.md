# Run log: administer/how-to/sso/add-a-worker-pool.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Tenant > Workers > Add pool**: **Name** `sso-warehouse`, **Description** "Scripts that run in the warehouse network", **Add pool**. The row showed "No worker online / never seen", `sso-warehouse`, "No workspace yet", 0 credentials. (The page's example name is `warehouse`; the run used a name with my slice.)
2. **Create credential**: **Name** "Warehouse network", **Pool** `sso-warehouse`, **Runs code of** "Every workspace of the tenant". The credential showed once ("Copy this credential now. It is shown only once, and cannot be read again.") with the command `printf '%s\n' 'vxw_...' | volvel-worker --url http://localhost:8091 --token-stdin`. The pool then showed 1 credential.
3. Started `node packages/worker/dist/bin.js --url http://localhost:8091 --token-file ./wtoken` for 25 seconds. The log said `worker started`. The Workers screen showed under the queue "Warehouse network 0.5.0 Older version takes no tasks idle" and the pool `sso-warehouse` "1 online, 10s ago".

## What the run could not do
- A script naming the pool was not deployed, so no run was taken by the worker, and **Queue** rows for the pool were not seen.
- **Remove the pool** and **Revoke** were not run.
- The switch **Let the instance run workers** was not changed.

## Found
- **The worker built from this repository (`packages/worker`, version 0.5.0) is shown "Older version, takes no tasks" by the instance of the same commit**, whose threshold is 0.6.0 (`routes/execution.ts` `TASKS_SINCE`). A reader who builds and runs the worker from this tree sees the warning at once. The page says what the screen says.
