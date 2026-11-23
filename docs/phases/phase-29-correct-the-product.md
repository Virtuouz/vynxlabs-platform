# Phase 29: the product does what it says

Status: built, not merged; waiting on the owner's look, on branch `phase-29-correct-the-product`, off `phase-28-the-boards`.
Last updated: 2026-11-23

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
| Closing | Rows with no outcome; the owner's D65; what the end-to-end run and the last walks found | fix-close, yaml-folder, e2e-a to e2e-e, gate-roles, fix-final, fix-bars, fix-pad |

How a lane works: [FIXING.md](../documentation/FIXING.md). What each did: `docs/documentation/fixed/`.

## Polish gate

Answered once for the phase: every lane's entry in `docs/documentation/fixed/` answers it for its rows.

1. **Rules.** Each lane read [the rules](../polish/polish-prevention-rules.md) its rows touch and cites them in its entry. New `enforce.test.ts` rules: no British spelling a person reads (voc-spell), every count, time and duration through `kit/format.ts`, no panel drawn by hand, every list says whether it is whole.
2. **Siblings.** One piece per job, with its callers listed in the lane's entry: `kit/Can.tsx` for what a person may change (`useCan`, `Needs`, `NotAllowed`; every screen family, sweep-can and fix-gating), `ConsoleCodeButton` for code in the console (tenant overview, Tenants, Repository), `kit/DataTable.tsx` for narrow tables (fix-narrow, fix-last `wide` column), `lengthLimit()` in `packages/ui` `Fields.tsx` for limits (fix-limits), `kit/references.tsx`, `SaveBar`, `SideSheet` and the shared `Button` (busy keeps focus).
3. **Lifecycle.** The missing parts (tier 3, sweep-build) were built where the API offered what no screen did; what is still not offered is in `remaining.md` and below.
4. **States.** Each lane's entry says where loading, empty, refused and waiting are drawn for what it changed; the walks checked them.
5. **Walk.** On a throwaway instance (`localhost:8091`, database `walk29`, Fernhill seeded), never the owner's: 13 walks after tier 1 and 2 ([WALKING.md](../documentation/WALKING.md)), then 10 after tiers 3 and 4 and 3 re-walks after their fixes, at 1440, 768 and 390, light and dark, by keyboard and with a reload. Reports: `docs/documentation/walks/`; screenshots `~/.local/share/volvel-walk/shots29/` (not in git).
6. **Guards.** Typecheck (`tsc -b`, and `-p` on console, ui and screens) and touched tests after every merge. Full `pnpm test` once: 4131 of 4146 passed; 4 real failures fixed (a0d24b90), 7 timed out only under the suite's load and pass alone. Full `pnpm e2e` (on a throwaway instance on port 8080, Fernhill seeded): first run 167 of 181; the 13 failures were 10 specs out of date with intended changes, one stale seed, and two product faults (the audit filter bar, and the doc writer locked out of Docs by the new gating); a second full run after the fixes, 214 of 215, the one failure the component kit's picture, which showed two more faults (the kit's save bar example clipped, every long page's bottom padding lost) — fixed, and the screenshot and layout specs pass. New guards: `GateRoles.test.tsx` (every gated control as every built-in role), `builtin-roles.test.ts` (the console's role table against the database), `enforce.test.ts` rules for spelling, counts and panels.
7. **Left out.** Asked of the owner at the end of the phase (below).

## Findings

- **Scale.** 598 commits on the phase branch, 932 files, 17 migrations (0080 to 0096).
- **Walks found what tests did not.** Each round of walks found 4 to 11 faults per area: narrow tables overlapping, focus lost after a dialog, controls offered to people who may not use them, and a deploy that failed when a trigger's path sorted before its script (fix-flowops, now tested in `authoring.test.ts`).
- **One piece, made twice.** Lanes working in parallel built the same piece twice three times (the console-code switch, `useMay` beside `Can`, the instance audit routes); the integrator kept one each time. A lane brief now names the shared pieces other lanes are building.
- **A grant on one resource.** A role bound on one flow did not reach that flow: the shell needed the workspace, and the flow and run routes asked for the permission on the workspace only. Fixed in two steps (fix-gating, fix-last) with server tests that the grantee reaches nothing else.
- **New gating, checked against the server.** The permission piece first asked, on several screens, for a broader permission than the route checks (a doc writer could not edit docs; a developer could not make a flow). Lane gate-roles compared every gated control with its route; 15 mismatches were fixed and a table-driven test now holds them.
- **A save bar that reaches the bottom edge** moved three times (fix-final, fix-bars, fix-pad); the third found that the page wrapper shrank to the screen, so long pages lost their bottom padding. Every caller was walked (r-final) and the screenshot specs hold it.
- **One stale resource blocks every deploy.** A deploy checks the whole workspace, so a resource stored before a schema change (a chart legend value, a renamed widget) refuses deploys of unrelated paths, and the publish check names it. No back-compat is owed (2026-11-19), and the instances were reseeded. Asked of the owner below.
- **The component kit's picture depends on the tests before it** in `e2e/redesign.spec.ts`: alone, its accent renders a little bluer than inside the whole spec. The reference is taken within the whole spec, as CI runs it.
- **Walks of the last fixes** (r-last, r-final): all right but those fixed after (fix-final, fix-bars, fix-pad). Not walked: the Repository page's "Set in volvel.yaml" state (a repository cannot be connected without the internet; `git.test.ts` and `Git.test.tsx` hold it).

## Asked of the owner at the end of the phase

Answered 2026-11-22 ([decisions.md](../documentation/decisions.md) D63 to D65). One question is new since:

1. A role given straight to a member or to every end user does not wait for a second person (D63). The screen says it applies at once.
2. `volvel dev` for interface and docs apps is built in phase 30, after M1, drawing them locally with the instance's own packages (D64).
3. `volvel.yaml`'s `resources` wins over the Repository page's folder; `entry` stays for the CLI (D65). Built in this phase.
4. **Open:** should one resource that no longer passes its checks block deploying everything else in its workspace? Today it does, and the publish check names it.

## After the owner's first look
