# Run log: self-host/how-to/running/run-a-standalone-worker.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Steps 1 and 3 to 5: a credential with the pool `plant` through the API, the token in `worker-token`, `docker compose -p p31worker up -d --wait`, the log "worker started", `GET /workers` listing it with `managed:false`.

## What the page got wrong
The Compose file cannot reach `control-plane:8080` unless it joins a network that does: the run added a `networks:` block. The page says `VOLVEL_URL` is the instance's address, which is the case for another network.

## Not run
Step 2 (a script naming the pool, run on the worker), the console's Workers page, a run on the worker, `--token-stdin`.
