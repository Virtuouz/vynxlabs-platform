# Fact-check: self-host/reference/running/configuration.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Required variables and the 12-character, 32-character rules. | `config.ts:122,203-230,296` | writer, 2026-11-23 | holds |
| Compose passes all but five; empty reads as unset. | `compose-vars.test.ts`; run (blank values accepted by the control plane) | writer, 2026-11-23 | holds |
| Groups as in the generated settings reference. | `packages/docs/generated/self-host/reference/settings.md` headings | writer, 2026-11-23 | holds |
| Standalone worker and worker host flags. | `packages/worker/src/bin.ts`, `host-bin.ts` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).

## Decision 0008 (apps isolation), 2026-11-28

The page was changed for decision 0008 (`docs/adr/0008-apps-written-as-code-are-sandboxed.md`). Lines are those of the working tree of branch `feat/apps-isolation`, before its commit. Read in code, not run.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `APPS_URL` is optional; `APPS_ON_CONSOLE_ADDRESS` is not a setting. | `apps/control-plane/src/config-vars.ts`; `pnpm docs:generate` output | writer, read in code, not run, 2026-11-28 | holds |
