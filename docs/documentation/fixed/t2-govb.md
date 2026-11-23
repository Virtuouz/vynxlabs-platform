# Fixed: lane t2-govb (tier 2b)

All ten rows (GOV-17, 21, 22, 23, 24, 25/D45, 26, 27, 29, 30) were done by lane gov2: see `fixed/gov2.md`. Shown with their tests, run in this worktree and passing: console `Audit`, `Retention`, `Portal`, `Workers`; `packages/ui/src/contrast.test.ts`; `packages/manifest/src/permissions.test.ts`; `sso-governance2.test.ts`, `export-not-carried.test.ts`, `managed-workers-state.test.ts`. No migration.

## GOV-23, the same untruth on the overviews (this lane)
- Test failed before: Approvals "the first step does not say the instance starts workers where it starts none (GOV-23)"; TenantScreens "a tenant whose workers the instance starts is not told that no worker is online (SHL-10)" (second half: switch on, state `unavailable`).
- New shared piece `apps/console/src/kit/useInstanceStartsWorkers.ts`: the tenant's switch plus `/managed-workers` (host, isolated, shared). Used by `Overview.tsx` FirstRun (the "A worker to run code" step was ticked from the switch alone; its dead "instance starts workers" detail is removed) and `TenantOverview.tsx` (the "No worker is online" alert and the "Nothing needs you" sentence). Where the viewer may not read the state, the switch alone is used.
- Siblings: `Execution.tsx` Workers (already from the state); `routes/tenants.ts` and `routes/pools.ts` descriptions are API text, true as written.
- A person sees: with the switch on and no instance workers, the first step is not ticked, and the tenant overview raises "No worker is online".
- Screens: workspace Overview (new workspace), tenant Overview; at 390 px, light and dark. States: loading (no claim until read), refused read (switch), unavailable, host. Keyboard: unchanged controls. Copy unchanged.

## GOV-25 left out in gov2: "domains to fix" does not count a gone record
- Refuted: the check sets `check_error` when the record is gone, and the summary counts `check_error`. Added an assertion to `sso-governance2.test.ts` (summary `domainsToFix` > 0 after the record is gone); it passes on the unchanged code.

## Not done
- GOV-17/27: actions written through a template (`${x}.created`) are not seen by the area test; phase 30 M9's typed registry is the source.

## Found
- None new.

## Changelog and docs lines
- The tenant overview and first steps no longer say the instance starts workers where it starts none.
