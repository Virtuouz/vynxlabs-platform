# Fact-check record: develop/reference/apps/content-policy.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The policy directives. | `packages/manifest/src/app-policy.ts:8-26` | writer, run on the instance 2026-11-23; second agent pending | holds as run (header read from volvel dev) |
| nosniff and same-origin referrer policy; page no-store. | `kernel/apps/front.ts:1025-1026,1079` | writer, read in code, not run; second agent pending | holds |
| Docs policy differs in img-src and font-src. | `packages/docs-site/src/policy.ts` | writer, run on the instance 2026-11-23; second agent pending | holds as run (header read) |
| Fallback and dot rules. | `front.ts:1016-1019` | writer, read in code, not run; second agent pending | holds |
| Cache headers and the hashed name rule. | `front.ts:104-110,1084-1088` | writer, read in code, not run; second agent pending | holds |
| What is injected into the page. | `kernel/apps/pages.ts:374-392`; `front.ts:1031-1065` | writer, run on the instance 2026-11-23; second agent pending | holds as run (context element read in dev) |
| Rate limits 600, 1,200, 120. | `front.ts:179-181`; `kernel/http.ts:83-90` | writer, read in code, not run; second agent pending | holds |
| 403 cross_site for non-GET from another origin. | `kernel/principal.ts:85-92` | writer, read in code, not run; second agent pending | holds |
| WebAssembly is not allowed. | `app-policy.ts` (no wasm-unsafe-eval) | writer, read in code, not run; second agent pending | holds |
