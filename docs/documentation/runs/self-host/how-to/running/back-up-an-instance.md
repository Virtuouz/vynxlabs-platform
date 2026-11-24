# Run log: self-host/how-to/running/back-up-an-instance.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Steps 1 and 2 and 4 (no dedicated database): `pg_dump --no-owner -Fc` and the tar of the object store's volume with the store stopped, then the restore of both.

## What the page got wrong
None found in the commands. The run stopped the control plane before the dump as well; the page does not ask for that.

## Not run
The S3 copy, the tenant export, a scheduled backup.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Nothing further was run. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
