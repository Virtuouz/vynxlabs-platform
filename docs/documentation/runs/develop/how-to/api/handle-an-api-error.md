# Run log: develop/how-to/api/handle-an-api-error.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- A bad filter operator, a non-JSON filter, a bad cursor, `limit=1001` on rows and `limit=500` on runs: 400 with the bodies the page quotes (`validation_failed` with `errors` and `bad_request`).
- 122 posts to `/hooks/vxh_nope`: 120 answered 404, then 429 `rate_limited` with `x-ratelimit-limit: 120`, `x-ratelimit-remaining: 0`, `x-ratelimit-reset: 59`, `retry-after: 59` and the problem body.
- Two saves of a draft without `revision`: the first 200 (revision 1), the second 409 `draft_changed` with the page's text. With `revision: 99` also 409; with `revision: 1` 200 and revision 2. `create: true` over an existing path: 409 `path_taken` "old/name is the path of a script. Choose another path, or open that one."
- A paused webhook: 503 `trigger_paused` "This webhook is paused, so it started nothing. Try again later."
- `x-error-codes` in `GET /api/v1/openapi.json`: 61.

## The page got wrong (and was corrected)
- The reference text of `validation_failed` says the response lists values "under `issues`"; the body uses `errors`. The page says `errors` (see the report: product wording).
- A first draft said `busy` gives 2 seconds; the code gives 2 for a pool timeout and 5 for a statement timeout.

## Not run
`busy`, `read_only`, `workspace_paused`, 413, 415, a 5xx.
