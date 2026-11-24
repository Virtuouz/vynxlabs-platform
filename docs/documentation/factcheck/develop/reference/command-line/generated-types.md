# Fact-check record: develop/reference/command-line/generated-types

Lines are current at commit `d619bfbd` plus the working tree (branch p34-a7, with lane a5 merged), 2026-11-24. Paths are from the repository root. Written by the A7 writer. Checked by: second agent (pending).

Run: instance on lane a7's build, database a734, port 8712, Fernhill seeded by `examples/fernhill/setup/setup.mjs` and its tenant `fernhill`; workspaces made for the run (`walk1` to `walk6`, `try-it`, `apps-docs`, `cli-start-dev`, `cli-start-live`). The CLI is `packages/cli/dist/bin.js` of the lane. Repositories made for the run are in `examples/a7*` (untracked, deleted at the end).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The file `.platform/volvel-env.d.ts`, its header and content. | `packages/manifest/src/env-types.ts:11`; run: `volvel types` on `examples/a7walk` | writer, 2026-11-24 | holds as run |
| Interfaces and what they type; `row`/`insert` rules. | `packages/manifest/src/env-types.ts:120-135,184`; `packages/sdk/src/context.ts:40-130` | writer, 2026-11-24 | holds as read |
| Unknown names untyped; `ctx.variable`/`ctx.connection` complete only. | `packages/sdk/src/context.ts:59-65,83`; run: a misspelt variable compiled, a wrong column and a wrong event payload did not | writer, 2026-11-24 | holds as run |
| Who writes it: build, types, dev, convert; unchanged file not rewritten. | `packages/cli/src/cli.ts:286,296,668`; `dev-site.ts:165`; `convert.ts:1256`; `types.ts:11-23` | writer, 2026-11-24 | holds as read |
| `volvel types` output text. | `packages/cli/src/cli.ts:297` | writer, 2026-11-24 | holds as run |
| tsc error text for `petz`. | run: `tsc --noEmit -p .` in `examples/a7walk` | writer, 2026-11-24 | holds as run |
| `Row`, `Insert`, `TableOf`. | `packages/sdk/src/context.ts:41-58`; run: `tsc` passed on the snippet | writer, 2026-11-24 | holds as run |
| Console editor reads `GET .../types.d.ts` with `script:read`; loaded on open; silent failure. | `apps/control-plane/src/routes/execution.ts:1108-1110`; `docs/documentation/fixed/p34-a3.md` | writer, 2026-11-24 | holds as read; a3 looked at the editor in a browser |
| tsconfig `include` is `["scripts", ".platform/*.d.ts"]` from init. | `examples/fernhill-cli/tsconfig.json` (run of `volvel init`) | writer, 2026-11-24 | holds as run |
