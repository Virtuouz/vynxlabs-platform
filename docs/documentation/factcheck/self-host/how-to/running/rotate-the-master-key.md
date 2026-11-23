# Fact-check: self-host/how-to/running/rotate-the-master-key.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps for one replica: new as primary, old as secondary, status, `rekey`, remove. | run on the restored stack: fingerprints changed, `secondaryRemovable: true`, `rekey` exit 0 | writer, 2026-11-23 | holds |
| The `rekey` output keys. | run output; `main.ts:93-101` | writer, 2026-11-23 | holds |
| Several replicas: add the new as secondary first. | `docs/self-hosting.md`; reasoning in `kernel/rekey.ts` | writer, 2026-11-23 | carried; not run (one replica only) |
| `rekey --data-role` with replicas stopped; output `dataRole: changed`; message text. | run; `main.ts:103-106` | writer, 2026-11-23 | holds |
| Errors: "MASTER_KEY_SECONDARY is the same as MASTER_KEY", "MASTER_KEY must be 32 bytes, base64 encoded." | `config.ts:209,220` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Run with two replicas (second one `compose run`): both with old/new, then A swapped while B stayed: B still read tenant rows; tenant key counted under current after a secret was written; `rekey` printed zero rewrapped, exit 0.
