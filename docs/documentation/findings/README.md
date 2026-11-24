# Findings: how each is settled

One file per slice of [the inventory](../inventory/). Triage settles what a report only read. Nothing here is fixed by triage.

## A row

`### <SLICE>-<NN> <one line: what a person or program sees go wrong>` followed by:

- **Outcome:** `reproduced` (ran and saw it), `confirmed by code` (the path is certain, and running it would show nothing more), `not a bug` (say why), `already fixed`, `missing part`, or `owner decides`.
- **Severity:** `security`, `data` (loses or corrupts), `broken` (a thing on screen does not work), `wrong` (says something untrue), `rough`.
- **Where:** `file:line` at `270e509`.
- **Evidence:** the command, scratch test or request, and what it answered. Short.
- **Fix:** the shared piece to change, the siblings that share the fault (POLISH-013), and the test that should fail first. Two or three lines.
- **Size:** S (under half a day), M, L. **Milestone:** M1 to M13 of phase 29.

## Missing parts

A missing part is something the API, manifest or SDK already supports that has no console or CLI control, or a control that is there and incomplete. It is not a new capability. Each has: what the API takes (`file:line`), where the control belongs, siblings, permissions, size.

## Owner decides

Only what cannot be settled from the spec, the phase documents, or the code: two reasonable products differ. Each has the question in one sentence, the options, and a recommendation.
