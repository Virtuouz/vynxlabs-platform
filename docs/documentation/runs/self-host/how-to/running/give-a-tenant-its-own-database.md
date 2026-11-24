# Run log: self-host/how-to/running/give-a-tenant-its-own-database.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Nothing run: the screen is walked on its own reference page (`reference/console/databases`).

## What the page got wrong
Not known.

## Not run
Everything on this page.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run by API: registering the instance's own database refused with the page's words; a wrong user: 'That database could not be prepared. password authentication failed...'; a new database registered, shown reachable with tenants 0, then 1 after a tenant was created with `dataLocation`; its table lives in that database; import of an existing tenant: 'This tenant is already on this instance.' Console screen walked at 390 and dark: no horizontal overflow. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
