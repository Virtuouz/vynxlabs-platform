# Run log: self-host/how-to/running/change-auth-secret.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Not run.

## What the page got wrong
Not known.

## Not run
Everything on this page. The effect on cookies is the library's: changing the value invalidates cookies signed with the old one.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run: new value, restart: the old cookie answered 401, a new sign-in 200; a short value: 'AUTH_SECRET must be at least 32 characters.' Page corrected: end users' and apps' sessions are random tokens stored hashed (`kernel/apps/sessions.ts`), not signed with AUTH_SECRET, so they stay signed in; `authSecret` is used only in `kernel/auth.ts` and `kernel/apps/challenge.ts`. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
