# Phase 29: the product does what it says

Status: built, not merged; waiting on the end-to-end run and the owner's look, on branch `phase-29-correct-the-product`, off `phase-28-the-boards`.
Last updated: 2026-11-22

The owner asked for the platform's documentation, every screen and feature, for the console and for local development, with self-hosting and administration. Twenty readers went through the code for what must be documented ([the inventory](../documentation/inventory/)), and found more than could be described truthfully. The owner's words: fix first, then document. Phases 30 (the docs system) and 31 (the writing) follow.

**Exit criterion.** Every row of [the findings](../documentation/findings/) has an outcome: fixed with a test that failed before, refuted with what was run, or decided by the owner. Every missing part (what the API, manifest or SDK takes and no screen or command offers) is built. On `examples/fernhill`, in a browser, each changed screen is walked.

## Owner decisions

In [decisions.md](../documentation/decisions.md), D1 to D62, answered 2026-11-22. Scope: everything triage settled, in the order security, data, broken, untrue, rough, and every missing part.

## Milestones

The plan's M1 to M13 are kept as labels on the rows. The work is done in tiers, each by lanes that own files, with a merge and a walk between tiers.

| Tier | Rows | Lanes |
|---|---|---|
| 0 | Triage, 519 rows settled | Built |
| 1 | Security and data, 107 rows | acc, gov, ins, host, files, tab, dat, draft, cfg, flw, mask, trg, rel, wid, shl |
| 2 | Broken and untrue, 238 rows | bldwid, app, clirel, cfg2, flw2, ins2, opsa, opsb, dat2, gov2, tab2, host2, scr2, ext2, acc2, api2 |
| 2b | What the tier 1 walks found | walk1, mask2, t2-walk-shell, t2-walk-data, t2-walk-flow, t2-docs, t2-govb, t2-sso |
| 3 | Missing parts | t3-access, t3-account, t3-cli-docs, t3-config, t3-data, t3-flow-editor, t3-flow-ops-sdk, t3-instance, t3-tables, t3-widgets |
| 4 | Rough edges, and one vocabulary (M13) | t4-config-ext, t4-data, t4-flows-ops, t4-gov-docs, t4-instance-host, voc-flow, voc-state, voc-spell, voc-access |
| Sweep | What was left over | sweep-server, sweep-console, sweep-cols, sweep-can, sweep-build |
| Walk fixes | What the tier 3 and 4 walks found | fix-narrow, fix-gating, fix-flowops, fix-screens, fix-databuild, fix-limits, fix-last |

How a lane works: [FIXING.md](../documentation/FIXING.md). What each did: `docs/documentation/fixed/`.

## Polish gate

Answered once for the phase: every lane's entry in `docs/documentation/fixed/` answers it for its rows.

1. **Rules.** Each lane read [the rules](../polish/polish-prevention-rules.md) its rows touch and cites them in its entry. New `enforce.test.ts` rules: no British spelling a person reads (voc-spell), every count, time and duration through `kit/format.ts`, no panel drawn by hand, every list says whether it is whole.
2. **Siblings.** One piece per job, with its callers listed in the lane's entry: `kit/Can.tsx` for what a person may change (`useCan`, `Needs`, `NotAllowed`; every screen family, sweep-can and fix-gating), `ConsoleCodeButton` for code in the console (tenant overview, Tenants, Repository), `kit/DataTable.tsx` for narrow tables (fix-narrow, fix-last `wide` column), `lengthLimit()` in `packages/ui` `Fields.tsx` for limits (fix-limits), `kit/references.tsx`, `SaveBar`, `SideSheet` and the shared `Button` (busy keeps focus).
3. **Lifecycle.** The missing parts (tier 3, sweep-build) were built where the API offered what no screen did; what is still not offered is in `remaining.md` and below.
4. **States.** Each lane's entry says where loading, empty, refused and waiting are drawn for what it changed; the walks checked them.
5. **Walk.** On a throwaway instance (`localhost:8091`, database `walk29`, Fernhill seeded), never the owner's: 13 walks after tier 1 and 2 ([WALKING.md](../documentation/WALKING.md)), then 10 after tiers 3 and 4 and 3 re-walks after their fixes, at 1440, 768 and 390, light and dark, by keyboard and with a reload. Reports: `docs/documentation/walks/`; screenshots `~/.local/share/volvel-walk/shots29/` (not in git).
6. **Guards.** Typecheck (`tsc -b`, and `-p` on console, ui and screens) and touched tests after every merge. Full `pnpm test` once: 4131 of 4146 passed; 4 real failures fixed (a0d24b90), 7 timed out only under the suite's load and pass alone. `pnpm e2e`: see Findings.
7. **Left out.** Asked of the owner at the end of the phase (below).

## Findings

- **Scale.** 598 commits on the phase branch, 932 files, 17 migrations (0080 to 0096).
- **Walks found what tests did not.** Each round of walks found 4 to 11 faults per area: narrow tables overlapping, focus lost after a dialog, controls offered to people who may not use them, and a deploy that failed when a trigger's path sorted before its script (fix-flowops, now tested in `authoring.test.ts`).
- **One piece, made twice.** Lanes working in parallel built the same piece twice three times (the console-code switch, `useMay` beside `Can`, the instance audit routes); the integrator kept one each time. A lane brief now names the shared pieces other lanes are building.
- **A grant on one resource.** A role bound on one flow did not reach that flow: the shell needed the workspace, and the flow and run routes asked for the permission on the workspace only. Fixed in two steps (fix-gating, fix-last) with server tests that the grantee reaches nothing else.
- **Not walked again after the last fixes:** the SSO Settings save bar at 390 (fix-last could not make it fail; to be measured on the instance), the chart fixes (axis words, sorting by a joined breakdown, the name clash chip) and a form field's "Starts as".
- **`pnpm e2e`: not yet run.** Its instance runs on port 8080 (the Keycloak realm expects it), where the phase 28 walk instance still runs; stopping that needs the owner's word.

## Asked of the owner at the end of the phase

1. With two-person approval on, a role given straight to a member, or to every end user, applies at once: access changes cover groups, service accounts and end-user groups only. The screen now says so. Should these wait for approval too?
2. `volvel dev` for interface and docs apps (CLI-MP7): they have no source, the platform draws them. Serving them locally means pushing drafts on save, or moving the renderer into a shared package. Both are large.
3. Git sync reading `entry` and `resources` from `volvel.yaml`: the repository settings have their own folder, so the file would be a second answer to one question.

## After the owner's first look
