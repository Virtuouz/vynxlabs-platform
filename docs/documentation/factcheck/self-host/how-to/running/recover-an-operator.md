# Fact-check: self-host/how-to/running/recover-an-operator.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Command and output text. | `apps/control-plane/src/commands.ts:29-31`; `main.ts:111-130`; run | writer, 2026-11-23 | holds |
| Enables, binds the operator admin role, new password, ends earlier sign-ins. | `kernel/bootstrap.ts:68-120`; run: old session 401, old password refused, new password 200 | writer, 2026-11-23 | holds |
| Errors and exit codes 1 and 2. | `main.ts:118-125`; `bootstrap.ts:78`; run | writer, 2026-11-23 | holds |
| Audited. | `bootstrap.ts` (`mutate`) | writer, 2026-11-23 | holds (mutate writes the audit); entry not read |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).
