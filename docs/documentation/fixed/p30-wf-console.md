# Phase 30 walk-fix lane: wf-console (items 24-29)

Each test was seen failing on the code before the change.

- 24. Row actions clipped: `apps/console/src/kit/ListCollection.tsx` (actions cell is `flex flex-wrap justify-end`, marked `data-row-actions`; its column is `wide`, 14rem). Callers of `rowActions`, all checked: Instance members (`screens/Instance.tsx`), Operators (same file), Database locations (`screens/Environments.tsx`); Tenants uses ListCollection without row actions. Tests: `kit/narrow-cells.test.tsx` "item 24" (classes; happy-dom does no layout) and `e2e/polish-layout.spec.ts` "a list's row actions stay inside the table at every width" (measures each action's right edge against the table at 390/768/1280/1440; written, NOT run: the e2e runs once at the phase's end).
- 25. Own row: `screens/Instance.tsx` `MemberRowActions` offers no reset link on the operator's own row and says "Change your own password on the Account screen." Test: `MemberReset.test.tsx` "item 25".
- 26. Result dialog focus: `kit/MemberResetLink.tsx` + `kit/OneTimeSecret.tsx` (`focusCopy`) + `ListScreen.tsx` `CopyButton` (`focused`) put focus on Copy (on Done when the link was emailed); closing returns to the trigger (shared Dialog). Test: `MemberReset.test.tsx` "item 26".
- 27. Row editor "optional": `screens/Data.tsx` date, long-text and text fields use `required={column.required}`. Test: `Data.test.tsx` "item 27".
- 28. "1 rows": new shared `counted(n, one, many?)` in `kit/format.ts`, used for both row counts in `screens/Data.tsx` (no plural helper existed). Test: `Data.test.tsx` "item 28".
- 29. Four small ones.
  - Palette: `kit/CommandPalette.tsx` finds the open page's commands (and Pin) by typed words; test `CommandPalette.test.tsx` "item 29".
  - Duplicate value: `apps/control-plane/src/kernel/data/rows.ts` names the field in `errors` (the console already marks named fields); older servers still get the sentence. Test: `apps/control-plane/src/data.test.ts` "unique values and references are enforced".
  - Add row file control: button, name, Remove, as the inspector's (`screens/Data.tsx`); test `Data.test.tsx` "item 29: Add row's file column".
  - Reset link expiry shows the zone (`<Time zone>`); test `MemberReset.test.tsx` "item 29: the link's expiry".

Siblings not changed: the other bare `<input type="file">` (Environments import, Branding logo, InstanceBranding, Files) were not asked for. Found, not mine: `enforce.test.ts` "no screen draws a panel by hand" fails on `screens/docs/Served.tsx:50` (wf-docs's area).

## Screens to re-walk (1440/768/390, light and dark, keyboard, reload)
Instance: All members (own row, wide and narrow; reset link flow with Enter on Copy and on Done; expiry zone), Operators, Database locations. Tenants (list unchanged). Data: a table's Rows with a row open (required marks), Add row with a file column and a duplicate value in a unique column, a retired table with one row. Command palette on a trigger/schedule: type "fire it now".
