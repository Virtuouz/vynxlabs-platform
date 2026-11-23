# fix-final: the "Wrong" of walks/r-last.md

No migration. No contract changed. Tests seen failing first on the code before the fix.

## WID-27 Goal pressable bar 16 px shorter
- Fix: `packages/widgets-core/views/goal.tsx:66`: a pressable goal is `w-[calc(100%+1rem)]` (pays for `-m-2`), a plain one `w-full`.
- Test: `packages/screens/src/goal.test.tsx` "a pressable goal is as wide as a plain one". Class-level only: happy-dom has no layout.
- Siblings: Stat (`stat.tsx:63`) has no `w-full`, so `-m-2` widens it already; no other `w-full` + negative margin pair found.
- Walk: a Goal with a click, 1440/768/390, bar edges equal to a plain Goal's; Enter and focus ring still fit the card.
- Left out: the polish-gate answers for states and copy do not change.

## WID-31 focus after Esc on an editable detail field
- Fix: `packages/widgets-core/views/detail.tsx` (DetailView, `leaving` ref and effect): when an editor stops (Esc, or after a save), focus goes to its field's button.
- Test: `packages/screens/src/widget-options.test.tsx` "after Escape, focus goes back to the field's button".
- Siblings: `FieldEditor` is used only here. Other inline editors (table cells) not touched.
- Walk: Esc, and Enter-to-save, on each field type; keyboard order continues from the field.

## MP-1 script Settings and drafts
- Fix: `apps/console/src/screens/ObjectPages.tsx` (ScriptSettings): reads the draft (`readDraft`) beside the deployed resource; a draft shows its own settings with a note ("This script has a draft..." or "...only a draft and is not deployed yet"); a deployed 404 is an error only when there is no draft. Production reads no draft.
- Tests: `apps/console/src/ObjectPages.test.tsx` three "R-last" tests (draft only, draft over deployed, neither).
- Siblings: other kinds' settings pages not looked at for the same pattern; see Found.
- Walk: a draft-only script (Settings tab), a script after "Save as a draft" and a reload, Clinics in production, 390 px, dark.

## ACC-27 "Allowed" cut to "A"
- Fix: shared `StatePill` (`apps/console/src/kit/status.tsx`): a state of one word (no children, no detail, no space) keeps its width (`whitespace-nowrap`, no `min-w-0`); longer words still truncate with the full text on hover. `screens/Access.tsx:190`: the check row wraps (`flex-wrap`).
- Test: `apps/console/src/kit/status.test.tsx` "a state of one word is not cut". Class-level.
- Siblings: 121 `<StatePill` call sites (tables, run lists, health). A one-word pill can now widen a narrow table cell by up to its word; walk run lists, Access, Environments at 390.

## Chart help for a heatmap
- Fix: `chartDrawer.tsx`: the "Show axis titles" help names the column split into rows as the side of a heatmap (`side`); `figures().count` counts distinct values of the first breakdown, not result rows.
- Tests: `apps/console/src/kit/inspector/widgets/charts.test.tsx` "a heatmap's help names its side title", "the count in 'Drawn as' is of distinct values".
- Siblings: `readsAs` and `ChartData` use `count` only for the noun line; pivot and stat drawers have their own.
- Left out: the plural of "status" is "status" (`plural()` keeps words ending in s). See Found.

## Save bar floats 24 px above the bottom
- Fix: shared `apps/console/src/kit/SaveBar.tsx:34`: `-mb-6` takes back the page's bottom padding (`py-6` in `Shell.tsx`).
- Test: `apps/console/src/ReadOnly.test.tsx` "the save bar reaches the window's bottom". Class-level.
- Callers: SingleSignOn, Provisioning, Branding, Environments, InstanceBranding, Retention, KitSheet. Walk each with a long form at 390 and 1440 at the end of the scroll.
- Found: the workbench/editor wrapper uses `py-4`, so a bar there would sit 8 px low; no caller in the editor.

## Found
- `plural()` in `chartDrawer.tsx` gives "6 status" for "status".
- After Discard on SSO Settings focus falls to body (walk note); not fixed here.
- Other screens that read a resource may show "Could not load" for something that only has a draft.

## Lines for docs
- None for CHANGELOG beyond: "A script's Settings tab shows its draft's settings, and says when there is a draft."

## Follow-up (coordinator)
- Save bar: `kit/SaveBar.tsx` margin is `mb-[calc(var(--page-pad-b,0px)*-1)]`; `Shell.tsx` sets `--page-pad-b` with each wrapper (1.5rem for `py-6`, 1rem for the editor's `py-4`). Where no page sets it (dialogs, sheets) it is 0. Test: `ReadOnly.test.tsx`. Callers (SSO, Provisioning, Branding, Environments, InstanceBranding, Retention, KitSheet): walk the end of the scroll.
- Focus: SaveBar remembers the element focused before it and returns focus there after Discard or Save (else the form's first field). Test: `ReadOnly.test.tsx`.
- `plural()` in `chartDrawer.tsx` is exported: "status" gives "statuses". Test: `chartAxes.test.tsx`. Replaces the earlier "-mb-6" note and the two Found items.
