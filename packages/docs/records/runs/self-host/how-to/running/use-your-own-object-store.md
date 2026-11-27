# Run log: self-host/how-to/running/use-your-own-object-store.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Not run against another store. The bundled store was used by every stack; `readyz` showed `objectStore ok`.

## What the page got wrong
Not known.

## Not run
The page's steps: an external bucket, a key with only the four rights, path style off for Amazon's S3.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run: an unknown bucket was created at start; a refused key stopped the instance with 'boot failed' and an error `UnknownError` (not naming the store): page corrected. A real external store and a key limited to four rights were not run. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
