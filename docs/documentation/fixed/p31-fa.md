# Phase 31, lane fa: server, CLI and self-host faults

Tests were written or changed first and seen failing, except where noted. Commits are "Phase 31: ..." on p31-fa.

- agent_runner for a whole workspace: now enough to connect to MCP (`mayStartHere` in routes/mcp.ts, three sites); test mcp.test.ts "the agent_runner role given for the whole workspace".
- Tenant files with `title`: role and binding bodies take `title` (manifest/tenant.ts, schemas re-emitted); a file's title for them is set aside on reading; a schema refusal now names the file (`tenant role x (roles/x.tenant_role.yaml): ...`). tenant.test.ts.
- validation_failed help says `errors` (manifest/errors.ts); vocabulary-access.test.ts.
- MCP server name is `volvel:<slug>`; mcp.test.ts.
- Waiting access change: one 202 shape `{waiting, release:{id,number,status,summary}, detail}` for releases and rollback, as bindings and service accounts (routes/access-releases.ts, cli/access.ts); access-lane2 and access-releases tests. Contract change: clients read `release.*` on 202.
- Webhook 401 echoing its token: `publicPath()` in problem.ts replaces the token of /hooks, /member-password-links and /approval-links in `instance`, the 404 detail, trace `url.path` and the request log serializer; webhooks.test.ts.
- Sessions list cap: the library's page is 100 rows with no cursor; API description says so and the Account panel says "Showing the first 100 sessions" and that End other sessions ends all; Account.test.tsx.
- `volvel promote` on refusal: reads `summary.breaking` after the `possible` check; cli.test.ts.
- Rollback wording: "runs what version N had, as version M" when the new version differs; `--json` gains `restoredFrom`; cli.test.ts.
- Deploy "0 updated" for a changed script body: `kernel/execution/code-slices.ts` compares each unchanged manifest's export in the previous and new code; counted as updated. Limit: a change only in a shared helper outside an export's own statement is not seen. execution.test.ts counts changed (greet and slow now update on version 2); code-slices.test.ts.
- `volvel run --remote`: intended (runs this build as a preview, nothing deployed; the CLI output already said so). Help line now says "not the deployed version"; commands.test.ts. Console run page not changed (not in this lane).
- `volvel dev`: app.title is the app's title (build.ts AppSource.title); the dev CSP no longer lists `ws://[::1]:*` (no valid IPv6 host source exists; 'self' covers it); the app's own inline script no longer gets the nonce (`nonceToolingScripts` in dev.ts). Tests: dev-policy.test.ts, example.test.ts. The inline refusal was not seen in a browser; unit-tested only. Walk: `volvel dev` an app with an inline script.
- TASKS_SINCE: a worker is outdated only if older than the lower of 0.6.0 and the control plane's own version; workers-outdated.test.ts.
- Unverified hostname enabled by an operator: the front door does serve it (hosts.ts `domain()` filters on `enabled` only; D48), so "Serving." was true; the sheet now says it serves though the name is not verified, and why. Portal.test.tsx.
- Compose empties: worker host reads an empty setting as unset (host-bin.ts `setting`), and compose passes 10001/10001/256 defaults for UID, GID and USERS; host-bin.test.ts, compose-vars.test.ts.
- Documented restore exiting 1 on `vxd_` role errors: NOT DONE. Needs a throwaway Postgres to run pg_dump/pg_restore; docker exec was refused here and there is no local pg_dump. Suggested: dump with `--no-owner --no-privileges` and rely on the open-time policy and grant repair (HOST-01), then check the exit code.
- Metrics reference path: generator text and metric-list.ts say `/api/v1/metrics`; generators.test.ts.
- HTTP connection Test: any answer is "reached" with the status (a message says the base answered it); only 401, 403 and 407 fail (sdk/http.ts); http.test.ts. OAuth2's test is unchanged (its test path is the author's).
- Docs site: `GET /docs` gains `removedApps`; the console counts a removed app as a change and sends its path, so Deploy appears for the removal alone and a folder deletion beside it deploys; deploying the removal stops the site (docs-apps.test.ts, model.test.ts).
- Mail connection not deployed yet: `boundConnection` uses the binding's own connector before defaulting to http (routes/worker.ts, bindings.ts); the runner no longer shows a TypeError/RangeError as a finding (runner.ts). connections.test.ts.
- diataxis.ts: "says it is an explanation"; diataxis.test.ts.
- Canceled flow runs: `platform/flow-run-finished` is now published with `cancelled` (single cancel, bulk cancel, flows canceled by an ending parent), as `platform/run-finished` is for scripts; reference text says so; flows.test.ts.
- Service account keys and `--tenant`: `GET /tenants` accepts a key (routes/tenants.ts `signedInOrKey`) and answers its own tenant; release.test.ts runs deploy, promote --preview and runs with a service-account key.

## Found, not fixed
- packages/worker tests "ends a script that ignores its time limit" and "ends a canceled run's process" failed in my one full run of that package; not examined (environment, MANAGED_WORKER_USER).
- cli.test.ts "login warns about a plain http address" failed before and after my change.
- example.test.ts "once bound, deploy activates the bundle" timed out at 5 s under load; dev-site.test.ts needs a built screens runtime.
