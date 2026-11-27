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
