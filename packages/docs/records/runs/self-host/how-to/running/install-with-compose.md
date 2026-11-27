# Run log: self-host/how-to/running/install-with-compose.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Steps 1 to 4 of the page as written, plus the three worker-user lines; the readiness and instance checks; the log line of the first operator. Details in the drill log, "Install".

## What the page got wrong
The first run failed on the worker host (empty `MANAGED_WORKER_UID`/`_GID`/`_USERS`). The page was given the three lines and a warning that says what happens. That is a product fault reported, not documented around: when it is fixed the lines stay harmless.

## Not run
Step 5 (opening the console in a browser and creating a tenant: a tenant was made through the API) and step 6 (removing the bootstrap lines and `up -d` again). 768 and 390 px and dark do not apply to a terminal page.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run again with the page's `.env` including the three worker-user lines: all four services healthy. Overlap: the tutorials inventory lists 'Install on one machine'; no such tutorial page exists (self-host/tutorials/index.md has no pages), so this how-to is the one page. fault: self-host empty MANAGED_WORKER_* in Compose. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
