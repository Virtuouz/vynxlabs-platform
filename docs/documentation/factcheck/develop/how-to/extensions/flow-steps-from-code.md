# Fact-check record: develop/how-to/extensions/flow-steps-from-code

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. `Au` = `screens/Authoring.tsx`, `CS` = `screens/CodeSettings.tsx`. Written by the writer; "Checked by" is for the second agent. Run log: `docs/documentation/runs/develop/how-to/extensions/flow-steps-from-code.md`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Settings group Use as a flow step: Step name (max 60, hint), Icon (None and list), Group (max 40, placeholder This workspace's), A step may hand it (A connection, A table, An event). | `Au:649-715` | writer, run | holds as run |
| Emptying the name drops node; typing it again restores icon and group. | `Au:522-534, 649-715` | writer, code | holds in code |
| Palette groups Core, the step's Group or This workspace's, Scripts. | `screens/FlowEditor.tsx:990-1010`; run (Core, Scripts, Fernhill steps seen) | writer, run | holds as run |
| defineScript node: label, icon, category, takes. | `SDK:220-230` | writer | holds |
| node label 1-60, icon pattern, category | `packages/manifest/src/kinds.ts:319-345` | writer | holds |
| x-pick connection/table/event offers the workspace's things; form uses title, description, enum, default. | `screens/FlowSteps.tsx:36-50, 86-96, 222`; `.meta` carries x-pick: run with zod | writer, run | holds as run |
| Its input: Field by field / As one expression. | `screens/FlowSteps.tsx:199-205` | writer | holds |
| step.script with { tables: [...] } hands exactly that. | `SDK:858-897`; `apps/control-plane/src/extensions.test.ts:1127-1150` | writer | holds |
| Deploy errors "which does not take one"; "not a table in this repository". | `packages/manifest/src/bundle-check.ts:436-450, 226` | writer | holds |
| Paths under core/ kept for the platform. | `packages/manifest/src/bundle-check.ts:161-168` | writer | holds |
| Core steps: labels, paths, takes, time allowed, limit 1-1000 default 50, required fields, failOnError default. | `packages/nodes/src/index.ts:50-340` | writer | holds |
| A bundle carries only the core steps a flow uses. | `packages/nodes/src/index.ts:1-10` | writer | holds |
| Code sample type-checks against the SDK. | run: `tsc --noEmit -p examples/fernhill` with the sample added | writer, run | holds as run |
