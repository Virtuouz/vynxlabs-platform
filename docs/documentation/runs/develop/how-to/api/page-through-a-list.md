# Run log: develop/how-to/api/page-through-a-list.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- `page.mjs` (the page's script) with `limit=2&sort=pet` over `api-visits` (6 rows): 3 requests, printed `Biscuit, Juno, Miso, Moose, Olive, Pickle`. First answer `nextCursor` a base64url string; the last null.
- A cursor `zzz`: 400 "The cursor is not valid." `limit=500` on runs: 400 "must be <= 200"; `limit=1001` on rows: "must be <= 1000".
- `GET runs?limit=2` answered a `nextCursor`.

## The page got wrong (and was corrected)
- None found in this run.

## Not run
A list that answers `{items}` with no cursor (clones, bundles, deployments, promotion requests, files): the caps on the page are copied from the inventory and the code's `listOf` calls, not read from an answer. A table with no key or a multi-column sort (offset cursor).
