# Run log: self-host/how-to/running/build-the-image.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
`docker build -t volvel/volvel:docs .` in a `git archive` copy; `docker images volvel/volvel` listed it at 905 MB; `VOLVEL_IMAGE` used by every stack.

## What the page got wrong
The first draft said the build took about 4 minutes; it was about 5. The page now says about 5 minutes.

## Not run
Building with the other base image caches absent; a build on a machine without a network.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Nothing further was run. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
