# Fact-check: self-host/how-to/running/put-a-proxy-in-front.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `TRUSTED_PROXIES`: a number 0-10 or networks; default 1. | `apps/control-plane/src/config.ts:419-445`; `app.ts:103-117` | writer, 2026-11-23 | holds |
| Sign-in limits 20 a minute per address and path, 429 on the 21st. | `kernel/auth.ts:24`; `proxy-trust.test.ts:50-57` | writer, 2026-11-23 | holds |
| The stream is `text/event-stream` with `x-accel-buffering: no`; heartbeat 20 s. | `routes/stream.ts:10,112` | writer, 2026-11-23 | holds |
| A webhook response waits up to 25 s. | `kernel/flows/engine.ts:487` | writer, 2026-11-23 | holds |
| Unrecognized hostnames act as the console address; `APPS_URL` host differs from `PUBLIC_URL`'s. | `kernel/apps/hosts.ts:91-96`; `config.ts:233-241` | writer, 2026-11-23 | holds |
| Cookies Secure by the `PUBLIC_URL` scheme. | `kernel/auth.ts:131` | writer, 2026-11-23 | holds |
| The Caddy and nginx examples. | not code | writer, 2026-11-23 | NOT RUN: no proxy was started |

## Second check (2026-11-23)

Run with a small node reverse proxy (no Caddy or nginx here): cookie `Secure` with an https PUBLIC_URL; a forged X-Forwarded-For is ignored with TRUSTED_PROXIES=1; sign-in answered 429 from the 21st attempt in a minute (`SIGN_IN_ATTEMPTS_PER_MINUTE` = 20, `auth.ts:24`); the event stream arrives unbuffered with `: ping` every 20 s (`stream.ts:10`). The Caddy and nginx files were read, not run.

## Decision 0008 (apps isolation), 2026-11-28

The page was changed for decision 0008 (`docs/adr/0008-apps-written-as-code-are-sandboxed.md`). Lines are those of the working tree of branch `feat/apps-isolation`, before its commit. Read in code, not run.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Code apps are served at the console's address when there is no `APPS_URL`; `APPS_ON_CONSOLE_ADDRESS` is not read. | `kernel/apps/hosts.ts` (`hasAppsAddress`, line 60); `routes/instance.ts:67`; `config-vars.ts` | writer, read in code, not run, 2026-11-28 | holds |
| Every page of an app written as code is served sandboxed, with no `allow-same-origin`. | `packages/manifest/src/app-policy.ts` (`CODE_APP_SANDBOX`, `CODE_APP_POLICY`); `kernel/apps/front.ts:1109` | writer, read in code, not run, 2026-11-28 | holds |
| An app with an enabled and proved hostname is redirected (308) from the shared address to the hostname. | `kernel/apps/front.ts:960-990` | writer, read in code, not run, 2026-11-28 | holds |
| The app token lasts 10 minutes. | `kernel/apps/tokens.ts:20` | writer, read in code, not run, 2026-11-28 | holds |
