# Fact-check record: develop/reference/apps/content-policy.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The policy directives. | `packages/manifest/src/app-policy.ts:8-26` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (header read from volvel dev) |
| nosniff and same-origin referrer policy; page no-store. | `kernel/apps/front.ts:1025-1026,1079` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Docs policy differs in img-src and font-src. | `packages/docs-site/src/policy.ts` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (header read) |
| Fallback and dot rules. | `front.ts:1016-1019` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Cache headers and the hashed name rule. | `front.ts:104-110,1084-1088` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| What is injected into the page. | `kernel/apps/pages.ts:374-392`; `front.ts:1031-1065` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (context element read in dev) |
| Rate limits 600, 1,200, 120. | `front.ts:179-181`; `kernel/http.ts:83-90` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| 403 cross_site for non-GET from another origin. | `kernel/principal.ts:85-92` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| WebAssembly is not allowed. | `app-policy.ts` (no wasm-unsafe-eval) | writer, read in code, not run; second agent, 2026-11-23 | holds |

## Second check, 2026-11-23 (Checked by: second agent, 2026-11-23)

- Policy directives: `packages/manifest/src/app-policy.ts:6-23`; docs-site policy (img `https:`, font `'self'`): `packages/docs-site/src/policy.ts:2-15`. Dev nonce and `ws://` sources: `packages/cli/src/dev.ts:122`; run (policy header seen on the page; remote stylesheet refused). fault fixed (fa): the dev nonce is for the dev server's scripts only and `ws://[::1]:*` is gone from the dev policy (`cli/dev.ts`), confirmed in the code; the dev paragraph now says so.
- Headers `nosniff`, `same-origin`, caching rules and the hash test: `kernel/apps/front.ts:95-110,1019-1030,1075-1090`.
- Fallback rule (HTML accepted, or no dot): `front.ts:1012-1020`.
- Rate limits: `front.ts:179-181`, `kernel/http.ts:86-91`; the 429 answer read in code, not run.
- `<base>`, `vx-context`, icons, theme stylesheet: `pages.ts:366-380`; read in code.

## Decision 0008 (apps isolation), 2026-11-28

The page was changed for decision 0008 (`docs/adr/0008-apps-written-as-code-are-sandboxed.md`). Lines are those of the working tree of branch `feat/apps-isolation`, before its commit. Read in code, not run.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The `sandbox` directive on every code app page, without `allow-same-origin`. | `packages/manifest/src/app-policy.ts` (`CODE_APP_SANDBOX`, `codeAppPolicy`); `kernel/apps/front.ts:1109` | writer, read in code, not run, 2026-11-28 | holds |
| App files at `/_apps/<tenant>/<workspace>/<hash>/<file>`, public and immutable; the ordinary path redirects (302). | `kernel/apps/front.ts:128,1011-1015,1569-1625,1779-1785` | writer, read in code, not run, 2026-11-28 | holds |
| `vx-context` carries `token` for a code app. | `kernel/apps/front.ts:1160` | writer, read in code, not run, 2026-11-28 | holds |
