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

## Second check, 2026-11-23 (second agent)
- Run now, the Compose way: `deploy/worker/compose.yaml` copied to a folder of its own, `.env` with `VOLVEL_IMAGE=volvel/volvel:docs` and `VOLVEL_URL=http://localhost:8091`, `worker-token` with a credential made for a pool `compose-pool` (mode 600), `docker compose up -d`. One change that a reader on another machine would not need: a second file gave the service `network_mode: host`, because the instance listens on the host's localhost. The log said `worker started`; **Workers** showed the pool "1 online" and the worker "compose-check" with version 0.5.0; the container became healthy after about a minute; `docker compose stop` ended it ("worker exiting: stopped"). The container's user is `node`, uid 1000; a file mode 600 owned by another uid is "Permission denied" to it (tried with `--user 1001`), so the page now says to give the file to uid 1000.
- Seen at 390 px in dark and 1440 px in light: **Workers** with the pool and credentials tables; no horizontal scroll.
- Not run: `--token-stdin` as a command (the image was used instead of a built `volvel-worker` on the host); a machine with `ptrace_scope` 0.
- Fault (`sso/workers`): the worker shows **Older version**, "takes no tasks" (0.5.0 < 0.6.0).
- Also noted: `self-host/how-to/running/run-a-standalone-worker` covers the same job as this page. Not mine to merge; reported.
