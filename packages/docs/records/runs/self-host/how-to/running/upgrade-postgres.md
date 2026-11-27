# Run log: self-host/how-to/running/upgrade-postgres.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Not run as a major-version move; the restore it relies on was run (see restore-an-instance).

## What the page got wrong
Not known.

## Not run
Everything specific to this page.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run: bundled postgres:16 to postgres:18 (pg_dump with the 18 client over the Compose network, volume removed, image changed, restore --no-owner, start): 5 expected `vxd_` errors, exit 1; the control plane logged the policies again; the 3 rows read. Page's 'written from the code' notice removed; the dump command corrected (new client over the network). 17 to 18 not run (no 17 image). fault: self-host restore exit status. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
