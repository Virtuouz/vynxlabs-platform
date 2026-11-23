# Run log: self-host/how-to/sso/run-a-standalone-worker.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
- `volvel-worker --url http://localhost:8091 --token-file ./wtoken` was run from `packages/worker/dist/bin.js` for 25 seconds against the instance. The log said `{"level":"info","message":"worker started",...}` and the Workers screen showed the worker online (see the pool page's run).

## What the run could not do
- **`--token-stdin`** was not run by me; it is the form the console shows, and its text is from the code.
- **The Compose file** was not run: no image of the instance is built here. Its options and the `worker-token` secret are from the files `deploy/worker/compose.yaml` and `.env.example`.
- `--concurrency`, `--idle-exit` and the `ptrace_scope` warning were not seen (the machine's setting was not read).
- The worker in this tree is 0.5.0 and the instance shows it as "Older version": see the pool page's run.
