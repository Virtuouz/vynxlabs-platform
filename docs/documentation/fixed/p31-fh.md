# Fixed: lane fh of phase 31 (the end-of-phase browser run's four failures after lane fg)

Migration: none. Contract: none. Browser specs run on this lane's build at port 8080 (the e2e instance, Fernhill seeded).

1-2. **`phase-28-look-inspector.spec.ts:372` and `:411`, "Esc put it where it was" (14 px).** Not the settings-sheet change and not the drag code: Esc did put the row back to its slot. The builder bar's second line changed height when a save finished: lane fg's `PageHeader` change lets the heading block wrap, and "Saving…" fits beside the name at 1440 but "Saved. Not published yet." wraps under it (bar 60 px, then 74 px), so the settings pane below the bar moved 14 px down during the drag's own draft save. Fix: `screens/builder/EditorShell.tsx`, the Saving and Saved words keep one width (`min-w-[min(100%,12rem)]`), so both wrap alike and the bar does not change height. Test: `builder-sheet.test.tsx` "round 6". Siblings: `EditorShell` is the one shell of the app builder and the dashboard editor.
3. **`polish-layout.spec.ts:75`, the kit at 390 px: "Succeeded" is 73 px wide in 71 px.** The state column of a `DataTable` sits in a cell that may break anywhere (`overflow-wrap:anywhere`), so its minimum width is nothing and the table gave the nowrap label 2 px less than its word. `kit/status.tsx` `StatePill`: a one-word label is `shrink-0 whitespace-nowrap` (a label of several words still wraps at its spaces, `min-w-0`). Test: `status.test.tsx` "round 4 and 5". Callers: every `StatePill`.
4. **`redesign.spec.ts:167`** see below.

4. **`redesign.spec.ts:167`, every screen fits a phone in light.** Two screens differed; both are lane fg's intended changes, none a regression. Looked at expected, actual and diff.
   - `light-phone-runs`: the gap between the title and its description is 6 px smaller (the header's rows now wrap with `gap-y-1`/`gap-y-2` and no fixed gap), and the filters and list move up with it. Nothing is cut or moved sideways. Updated.
   - `light-phone-tenant`: each workspace row is 1 to 2 px taller (the state pill's icon aligns to its first line, as the label may now wrap). Updated.
   - Updating also rewrote the dark phone Runs and Tenant, dark tablet and light tablet Runs, and the two kit pictures, which differ in the same ways (kit: the state pills). Looked at kit-light and dark-tablet-runs: sound.
