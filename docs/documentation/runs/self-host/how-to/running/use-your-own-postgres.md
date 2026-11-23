# Run log: self-host/how-to/running/use-your-own-postgres.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Not run as a different server: the bundled Postgres of the stacks was used. The SQL and the `DATABASE_URL` form were not run.

## What the page got wrong
Not known.

## Not run
Everything on this page: a second Postgres, `CREATEROLE` as a non-superuser, `sslmode=require`. The role the bundled Postgres uses is a superuser (`POSTGRES_USER=platform`).
