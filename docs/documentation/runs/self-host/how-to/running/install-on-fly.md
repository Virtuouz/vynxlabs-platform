# Run log: self-host/how-to/running/install-on-fly.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Not run: no Fly account was used.

## What the page got wrong
Not known.

## Not run
Everything.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Not run: no Fly account and no internet. The page matches deploy/fly/fly.toml and README.md line by line; the 1024 MB machine gives 3 run slots by the formula in `machine.ts:134`. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
