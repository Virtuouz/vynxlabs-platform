# Run log: develop/how-to/api/follow-runs-live.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- `curl -N` of `GET /tenants/<t>/stream` for 12 seconds while starting `appointments/free-times`: the head `retry: 3000`, `event: ready`, then `run` events with `s` queued, running, succeeded for the new run (`flow: null`, `p: appointments/free-times`); the run of the flow started earlier also sent 202 `run`, 64 `step`, 7 `log` and 1 `flow_run` events. `data` as on the page; an event `id` is a millisecond time.
- With `last-event-id: 1`: `event: snapshot`, `data: {}` in place of `ready`.
- The headers: `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`, `x-accel-buffering: no`.

## The page got wrong (and was corrected)
- None found in this run.

## Second check (2026-11-23, second agent)

The instance was http://localhost:8091 (a tenant of my own, `api-check2`, with a workspace `agent-ws`; keys and tokens revoked at the end).

- Run now: the `: ping` (seen between the events of a 26-second run), `too_many_streams`.
- Not run: an end user's own-runs stream, rights changing mid-stream (read from `routes/stream.ts`).

The console key screen, the Agent tools tab and Members & access were walked at 1440 px, at 390 px and in dark (the key screen: create, one-time key, revoke; Agent tools: workspace choice, address, settings, Tools offered, Try): no overflow at 390 px, the settings block scrolls inside itself, dark has no contrast fault.

## Not run (before the second check)

The 20-second `: ping` (the run was 12 seconds), `too_many_streams`, an end user's own-runs stream, rights changing mid-stream.
