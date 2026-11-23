# Run log: self-host/how-to/running/restore-an-instance.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
All steps on a fresh project, with the first attempt (`--exit-on-error`) and the second, and the checks in step 6 through the API. Details in the drill log, "Restore".

## What the page got wrong
The first draft said to restore with `--exit-on-error`. It stops at the first policy and leaves tables with no policies. The page says not to, and says the 5 errors are expected.

## Not run
Under another database name (`restore.test.ts` holds it), a rotated key, a dedicated database, the Health screen in a browser.
