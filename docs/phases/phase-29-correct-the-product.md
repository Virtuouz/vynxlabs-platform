# Phase 29: the product does what it says

Status: in progress, on branch `phase-29-correct-the-product`, off `phase-28-the-boards`.
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
| 3 | Missing parts | |
| 4 | Rough edges, and one vocabulary (M13) | |

How a lane works: [FIXING.md](../documentation/FIXING.md). What each did: `docs/documentation/fixed/`.

## Findings

## After the owner's first look
