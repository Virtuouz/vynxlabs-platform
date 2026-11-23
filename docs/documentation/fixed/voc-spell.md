# Lane voc-spell (American spelling)

Commit: see `git log` on p29-voc-spell ("Phase 29: every string a person reads is in American spelling").

## Done
- VOC-20, 21: Runs.tsx already said "canceled" (tier 1); nothing left there. VOC-22: Environments.tsx already said "canceled" (lines 1295, 1358).
- VOC-23: `packages/screens/src/placement.ts:523` "Move canceled." / "Resize canceled."; PageView.test.tsx updated.
- VOC-24: `packages/cli/src/cli.ts:961, 973` "Canceled N run(s)".
- VOC-25: `kernel/pages/approvals.ts:684` "its run was canceled".
- VOC-26: `routes/flows.ts:1441` prose; `api-description.ts:52` "canceling". Field `cancelled` stays.
- VOC-27: `apps/console/src/audit-words.ts` `words()` says `canceled` for `run.cancelled`, `flow_run.bulk_cancelled`; test in audit-words.test.ts. Stored action names stay.
- VOC-28..30: Gray/Grays/Grayed in columnModel.ts:17, chartDrawer.tsx:426, 471, KitDrawer.tsx:214, RulesTab.tsx:198, approvalsDrawer.tsx:191, widgets-core/src/index.ts:478, 554, setup.mjs:853; comments in about 30 files.
- VOC-32: docs/sdk-guide.md:171, 344. VOC-33: docs/self-hosting.md:556 "canceled (the label reads `cancelled`)". VOC-31 (packages/docs/content) left to phase 31.
- Fernhill model description "or canceled." (examples/fernhill/src/model.ts:112); bundle-check description backticks the stored value.

## Test
`apps/console/src/enforce.test.ts` "no string a person reads is in British spelling" reads every string and JSX text in console, control-plane, screens, ui, widgets, widget-sdk, cli, app, sdk, worker, manifest and fernhill; it failed on 19 sites before the fix. A lone lowercase word is a stored value and passes; a line says `british-ok:` to keep one (CSS color names, the SQL status mapping).

## Siblings looked at
Code names kept: `cancelled` fields and statuses, `neighbour*` identifiers, `aria-labelledby`, chartSpec local `colour` renamed to `color`.

## Walk
Chart drawer (Grays, Grayed note), column badge color list (Gray), Rules tab note, approvals drawer line, drag Esc toast, Audit log wording for a canceled run. Copy only; no states changed.

## Found
Pre-existing biome notes in widgets-core/views/chartSpec.ts:131 and table.tsx (unused suppressions); not mine.
