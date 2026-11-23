# Run log: self-host/how-to/running/run-on-a-read-only-database.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
All of it, by making the database read-only with `alter database ... default_transaction_read_only = on`, restarting, and resetting. Details in the drill log.

## What the page got wrong
The first draft said writes return "within the minute"; in the run they returned about 15 seconds after the reset. The page keeps the code's wording about connections renewed each minute as the worst case.

## Not run
A database whose disk is full; an upgrade with migrations on a read-only database.
