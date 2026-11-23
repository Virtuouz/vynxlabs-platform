# Run log: self-host/how-to/running/stop-triggers-and-clear-a-backlog.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
`GET`, `PUT paused:true`, `PUT paused:false` on `/instance/triggers`.

## What the page got wrong
Not known.

## Not run
The console's **Pause every trigger** and **Resume triggers**, `TRIGGERS_PAUSED`, `volvel instance triggers`, `volvel runs cancel`, **Cancel N queued**, a backlog.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run: CLI `volvel instance triggers`, `pause --reason`, `resume`; with TRIGGERS_PAUSED=true the API keeps answering paused/byEnvironment true; `volvel runs cancel --queued` canceled 3 queued runs, `--older-than` 0, `--all` 0 and 0 flow runs. Console buttons exist (`InstanceTriggers.tsx`, `Runs.tsx:410`). A refused webhook was not run. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
