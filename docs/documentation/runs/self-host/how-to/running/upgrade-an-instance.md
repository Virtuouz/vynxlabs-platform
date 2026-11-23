# Run log: self-host/how-to/running/upgrade-an-instance.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
`GET /instance`, `migrate` ("The database is up to date, at level 99.").

## What the page got wrong
Not known.

## Not run
An upgrade to a newer image, `up -d --build`, going back by restore with an older image.
