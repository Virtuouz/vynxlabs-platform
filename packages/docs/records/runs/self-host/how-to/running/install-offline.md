# Run log: self-host/how-to/running/install-offline.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Not run across two machines. The Compose file's `build`, `pull` and `up --no-build` forms were read, not run.

## What the page got wrong
Not known.

## Not run
Everything specific to this page.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run on one machine: `docker save` of the three images (609 MB), `docker load`, `up -d --wait --no-build` started the services from loaded images (control plane stopped only on a port clash with another stack). Two-machine transfer not run. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
