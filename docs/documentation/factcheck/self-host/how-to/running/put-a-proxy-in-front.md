# Fact-check: self-host/how-to/running/put-a-proxy-in-front.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `TRUSTED_PROXIES`: a number 0-10 or networks; default 1. | `apps/control-plane/src/config.ts:419-445`; `app.ts:103-117` | writer, 2026-11-23 | holds |
| Sign-in limits 20 a minute per address and path, 429 on the 21st. | `kernel/auth.ts:24`; `proxy-trust.test.ts:50-57` | writer, 2026-11-23 | holds |
| The stream is `text/event-stream` with `x-accel-buffering: no`; heartbeat 20 s. | `routes/stream.ts:10,112` | writer, 2026-11-23 | holds |
| A webhook response waits up to 25 s. | `kernel/flows/engine.ts:487` | writer, 2026-11-23 | holds |
| Unrecognized hostnames act as the console address; `APPS_URL` host differs from `PUBLIC_URL`'s. | `kernel/apps/hosts.ts:91-96`; `config.ts:233-241` | writer, 2026-11-23 | holds |
| `APPS_ON_CONSOLE_ADDRESS` serves code apps on `PUBLIC_URL` when there is no `APPS_URL`. | `hosts.ts` `runsCodeApps` | writer, 2026-11-23 | holds |
| Cookies Secure by the `PUBLIC_URL` scheme. | `kernel/auth.ts:131` | writer, 2026-11-23 | holds |
| The Caddy and nginx examples. | not code | writer, 2026-11-23 | NOT RUN: no proxy was started |
