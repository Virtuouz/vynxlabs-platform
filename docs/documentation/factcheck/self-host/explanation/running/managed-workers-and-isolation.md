# Fact-check: self-host/explanation/running/managed-workers-and-isolation.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `MANAGED_WORKERS` is `host`, `process` or `false`; default `process` in code, `host` in Compose. | `apps/control-plane/src/config.ts:258-261`; `deploy/compose/compose.yaml` `MANAGED_WORKERS: ${MANAGED_WORKERS:-host}` | writer, 2026-11-23 | holds |
| A user and group of its own: lowest free of a range from `MANAGED_WORKER_UID`/`_GID` (10001), `MANAGED_WORKER_USERS` (256) ids. | `packages/worker/src/host-bin.ts:34-62`; `packages/worker/src/host.ts` (user allocation) | writer, 2026-11-23 | holds; the log of the run says `uid 10001, gid 10001, users 256` |
| A `0700` directory that is HOME, TMPDIR and cwd, removed at exit. | `packages/worker/src/host.ts:299` | writer, 2026-11-23 | holds (mode); removal not re-run |
| Capabilities SETUID, SETGID, CHOWN, DAC_OVERRIDE, KILL, NET_ADMIN; user root. | `deploy/compose/compose.yaml:109-112` | writer, 2026-11-23 | holds |
| The host logs when it lacks `CAP_KILL`. | `packages/worker/src/host.ts:148` | writer, 2026-11-23 | holds |
| The host refuses private, loopback and link-local addresses, and the IPv6 forms; the control plane and the name servers stay open; `WORKER_EGRESS_ALLOW` opens more. | `deploy/image/volvel-worker-host`; run log: "workers may not reach private, loopback or link-local addresses, other than the control plane, the name servers and WORKER_EGRESS_ALLOW" | writer, 2026-11-23 | holds for the message; rules not exercised by a script |
| Stop: 30 s, then kill, give up after 10 s with "a worker could not be stopped and is left running"; Compose `stop_grace_period: 60s`. | `packages/worker/src/host.ts:200`; `deploy/compose/compose.yaml:85,114` | writer, 2026-11-23 | holds |
| In `process` mode a tenant whose code is written outside the operator gets no managed worker. | `apps/control-plane/src/kernel/execution/isolation.ts:30-62`; `supervisor.ts` | writer, 2026-11-23 | holds |
| `MANAGED_WORKER_USER` is `own` (default) or `same`. | `generated settings reference`; `config.ts` | writer, 2026-11-23 | holds |
| A managed worker's credential lasts 24 h; idle exit 60 s; lease wait 20 s, 25 s at most; alive 90 s. | `supervisor.ts:67,213`; `routes/worker.ts:119,297`; `kernel/execution/workers.ts:213` | writer, 2026-11-23 | holds |
| No sandbox; `kernel.yama.ptrace_scope` warning. | `SECURITY.md` section "What it does not protect against" | writer, 2026-11-23 | holds as the policy says; the warning text was not exercised |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).
