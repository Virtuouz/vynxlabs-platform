# Fact-check: self-host/explanation/running/security-hardening.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Two rules: no tenant code in the control plane; named list behind an egress guard. | `SECURITY.md:11-14` | writer, 2026-11-23 | holds |
| The what-it-protects and does-not-protect lists. | `SECURITY.md` | writer, 2026-11-23 | copied in summary; each line is the policy's |
| Checklist item: Compose listens on `127.0.0.1:8080`. | `deploy/compose/compose.yaml` `VOLVEL_BIND:-127.0.0.1:8080` | writer, 2026-11-23 | holds |
| `METRICS_TOKEN` at least 32 characters. | `apps/control-plane/src/config.ts:270` | writer, 2026-11-23 | holds |
| Bootstrap settings removed after first start. | `apps/control-plane/src/kernel/bootstrap.ts:13-30` (does nothing once there is a member) | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).

## Decision 0008 (apps isolation), 2026-11-28

The page was changed for decision 0008 (`docs/adr/0008-apps-written-as-code-are-sandboxed.md`). Lines are those of the working tree of branch `feat/apps-isolation`, before its commit. Read in code, not run.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A sandboxed page has no origin, cookie or storage; the API ignores a cookie sent with `Origin: null`. | `packages/manifest/src/app-policy.ts`; `kernel/principal.ts:124` | writer, read in code, not run, 2026-11-28 | holds |
| A member's app token is app-only also at the console's address; the token is signed, 10 minutes, checked on each use. | `kernel/apps/tokens.ts:20,128-178`; `kernel/principal.ts` | writer, read in code, not run, 2026-11-28 | holds |
| An app's files are served without a sign-in at a name made from their content. | `kernel/apps/front.ts:128,1569-1625,1779-1785` | writer, read in code, not run, 2026-11-28 | holds |
