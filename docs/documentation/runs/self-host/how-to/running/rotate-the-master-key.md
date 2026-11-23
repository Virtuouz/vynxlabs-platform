# Run log: self-host/how-to/running/rotate-the-master-key.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
One replica, all steps, then `rekey --data-role`. Details in the drill log.

## What the page got wrong
None: the page was written after the run.

## Not run
Several replicas; a tenant that holds its own secrets.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run with two replicas (second one `compose run`): both with old/new, then A swapped while B stayed: B still read tenant rows; tenant key counted under current after a secret was written; `rekey` printed zero rewrapped, exit 0. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
