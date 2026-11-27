# S1: Process per attempt, hard timeouts, worker isolation

Roadmap item (the 2026 roadmap, in volvel-internal): P0-1. Priority P0. Complexity M.

## Problem (verified)

- `packages/worker/src/worker.ts:202-221` writes the bundle to `<cache>/<digest>.mjs` and `import()`s it into the worker process. Up to 4 runs (default concurrency) share that process.
- A timeout or cancel calls `abort.abort()` and `Promise.race` rejects (`worker.ts:426-430`). The script's promise keeps running, and so do its timers, sockets and loops.
- The module map `#modules` never evicts. ES modules cannot be unloaded.
- Script code runs in the same process as `PLATFORM_WORKER_TOKEN` (in `process.env`), which is the tenant-scoped worker credential.
- Managed workers are children of the control plane, as the same uid, in the same container (`kernel/execution/supervisor.ts:64-96`). **Inferred:** tenant code can read `/proc/<ppid>/environ` (`MASTER_KEY`, `DATABASE_URL`, `AUTH_SECRET`).

## Design

```
worker (parent, holds credential)          runner (child, one per attempt)
  claim job ───────────────────────────────▶ fork(runner.js, {env: {}, execArgv: [--max-old-space-size=M]})
  send {bundlePath, entry, input, run} ────▶ import(bundle) → script.execute(input, ctxProxy)
  ◀──────────────── {call: id, op, args}     ctxProxy.* → IPC request
  #call(...) → control plane                 
  ────────────────▶ {reply: id, result|error}
  ◀──────────────── {log: entry}             ctx.log → IPC (parent buffers and flushes, see P0-3)
  ◀──────────────── {done: output} | {failed: error}
  timeout/cancel → child.kill('SIGTERM'), +5 s → SIGKILL
```

- **Runner** (`packages/worker/src/runner.ts`) is about 150 lines: it receives one job, builds a `ctx` whose methods send IPC requests, and runs the script.
- **The child's environment is empty** except `NODE_OPTIONS` for memory. The credential never enters the child.
- **Memory:** a new optional `memoryMb` on the script kind (`packages/manifest/src/kinds.ts`), default 512, maximum 4096. Exceeding it crashes the child, and the run fails with "ran out of memory (512 MB)".
- **Cancel or timeout:** the parent kills the child, then reports `fail` with `timed_out` or `canceled`. A run reported "timed out" has really stopped.
- **Bundle on disk:** the bundle file stays cached by digest on disk and is evicted in least-recently-used order beyond 50 files. Each child imports it fresh, so memory growth disappears.
- **Managed workers (owner decision, 2026-11-14):**
  - The image adds an unprivileged `vxrun` user. The supervisor starts managed workers as that user via `spawn({uid, gid})` (configurable as `MANAGED_WORKER_UID`/`MANAGED_WORKER_GID`), which needs `CAP_SETUID` and `CAP_SETGID` on the container. As another user, script code can neither read the control plane's `/proc/<pid>/environ` nor signal it.
  - At startup the supervisor checks whether it can switch users. If it cannot, it refuses to start managed workers for any tenant whose `code:write` is held by anyone outside the operator. It logs this, and Workers says: "This tenant's code runs on standalone workers only."
  - The compose files and `docs/self-hosting.md` show the `cap_add` setting.
- **Docs:** `SECURITY.md` and `docs/self-hosting.md` state the new boundary.

## Not in scope

Syscall sandboxing (P3-1) and warm runner pools. Measure first; add a pool of 2 pre-forked runners only if p50 run start rises more than 150 ms.

## Acceptance criteria

1. A script containing `while (true) {}` with `timeoutSeconds: 2` is reported `failed` with a timeout within 7 s, and **no CPU is used by it** afterward. Check: the process count returns to its baseline.
2. A script that allocates without bound fails with an out-of-memory message, and other runs on the same worker succeed.
3. Inside a script, `process.env.PLATFORM_WORKER_TOKEN` is `undefined`.
4. Canceling a running run kills its child within 5 s, and the run shows `canceled`.
5. Every existing control-plane suite that runs the worker in-process (`execution`, `flows`, `runtime`, `authoring` and others) passes unchanged.
6. New `packages/worker` tests cover criteria 1–4 and log delivery over IPC.
7. With the capability, a managed worker runs as `vxrun`, and a script cannot read the control plane's `/proc/<pid>/environ`.
8. Without it, under `MANAGED_WORKERS=true`, a tenant with an outside `code:write` holder gets no managed worker, and the Workers screen explains why.

## Dependencies and risks

- **Dependencies:** none.
- **Risk: start-up latency.** Measure with the e2e suite.
- **Risk: `ctx` features that pass functions or streams.** `ctx.files.put` with a stream needs chunked IPC. Start with Buffer only, as today's API takes.
