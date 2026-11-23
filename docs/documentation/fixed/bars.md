# Lane fix-bars

## R-final item 4: tenant audit filter bar wrapped at 1440
- Fixed: `apps/console/src/screens/Audit.tsx` (toolbar, `moreShown`/`moreSet`). The first row is Search (fixed 256 px, first), Area, Since, dates when custom, Workspace, and one "More filters (n)" button. Who, Action and Done to sit in a second row behind it; it opens by itself when any is set. All filters stay in the address. The instance audit uses the same piece. At 768 and 390 the row may wrap.
- Test: `Audit.test.tsx` "R-final: the first row holds search..." (also two older tests now open the panel first).
- Siblings: the instance audit shares `AuditTable`. No other list has a filter bar of this kind.
- Not measured in a browser (no walk allowed): sized by arithmetic, about 900 px of 1104.
- Walk: /audit and tenant audit at 1440, 768, 390; open More filters, set one, reload.

## R-final item 2: save bar
- Provisioning: `SaveBar` moved out of the section to the end of the page (`Provisioning.tsx`).
- Short pages: `Shell.tsx` page div is `flex min-h-full flex-col`, `ListScreen.tsx` `Page` is `flex-1`, `SaveBar` has `mt-auto` instead of `mt-2`, so the bar rests on the bottom edge for every caller whose bar is a direct child of the page's column.
- Test: `ReadOnly.test.tsx` "R-final: a page with a save bar fills the scroll container...".
- Siblings: the other 7 `<SaveBar` callers; those nested in a wrapper keep their old spacing (auto margin has no free space there).
- Walk: Retention, Provisioning at 1440 and 390, bar dirty, scrolled to end.
