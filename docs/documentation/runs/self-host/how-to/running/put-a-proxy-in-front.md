# Run log: self-host/how-to/running/put-a-proxy-in-front.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Nothing on the page was run: no proxy was started. `check-config` accepted `TRUSTED_PROXIES` as a number and refused `eleven`.

## What the page got wrong
Not known.

## Not run
The Caddy and nginx configurations, the stream and hook paths through a proxy, a registered hostname, `APPS_URL`.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run with a small node reverse proxy (no Caddy or nginx here): cookie `Secure` with an https PUBLIC_URL; a forged X-Forwarded-For is ignored with TRUSTED_PROXIES=1; sign-in answered 429 from the 21st attempt in a minute (`SIGN_IN_ATTEMPTS_PER_MINUTE` = 20, `auth.ts:24`); the event stream arrives unbuffered with `: ping` every 20 s (`stream.ts:10`). The Caddy and nginx files were read, not run. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
