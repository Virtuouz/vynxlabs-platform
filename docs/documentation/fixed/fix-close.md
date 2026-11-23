# fix-close: rows with no outcome (phase 29)

Lane `fix-close`, branch `p29-fix-close`. One outcome line per row; each line starts with the ID. No migration. No browser walk was run: screens to walk are at the end.

## Outcomes

- **WID-27** fixed. `packages/widgets-core/views/goal.tsx`: the Goal is a `role="button"` (with `press`, `PRESSABLE`) only when `listensTo(props, "click")`, as the Stat is; otherwise a plain block. Test: `goal.test.tsx` "is not a button when nothing listens to its click (WID-27)" (failed before: a button was drawn). The old test "a click is raised" now passes a `listens`. Siblings: Stat (already did this); no other view draws a button that nothing listens to (Button, Actions are buttons by purpose).
- **WID-28** fixed. `chartSpec.ts`: the legend is `"auto" | "hidden"` (schema `widgets-core/src/index.ts`, drawer `chartDrawer.tsx`, the three `legend: "shown"` in `examples/fernhill/src/operations.ts` now say `auto`); a heatmap's `color.scale.range` takes a ramp for the chosen palette (`RAMPS`, exported). Test: `widgetOptions.test.tsx` "the heatmap's scale takes the palette; the legend is Automatic or Never (WID-28)" (failed before). Siblings: bars and pie already took `colors`; scatter has no palette (not changed). A stored `legend: "shown"` is a value the schema no longer takes (no back-compat owed).
- **WID-29** fixed. `Frame.tsx`: the Download menu is built once (`downloads`); with no heading, and not bare or in a container, it sits in a quiet corner (`absolute top-1 right-1`, 60% opacity, full on hover or focus) and takes no row. Test: `PageView.test.tsx` "a table with no heading still offers its rows as a file (WID-29)" (failed before: no Download). Siblings: the heading's own copy uses the same element; building still offers none (unchanged test).
- **WID-30** fixed. `actionsDrawer.tsx`: with Right or Spread "Where it sits in its place" is Top, Middle, Bottom (keeps the stored column); with Left it is the 3 by 3 grid. Test: `records.test.tsx` "with Right or Spread the position is a row, not a grid whose columns do nothing (WID-30)" (failed before: nine places offered). The existing "lines up" test now picks Left before a grid place.
- **WID-31** fixed. `detail.tsx`: the field's wrapper is no longer a `role="button"`; a native `<button>` sits inside the `dd`, its name is the sr-only "Edit {label}: " plus the value. Test: `core-actions.test.tsx` "an editable field is a button inside its value, named by its label and value (WID-31)" (failed before). Existing tests that looked for the exact name "Edit Total" now match the start of the name. Left out: a value that is itself a link sits inside the button, as it sat inside the role before.
- **API-07** left to phase 30 M9 (the docs generator filters the merged auth description by an allow-list); the row's milestone line says so. Not docs-generator work done here.
- **API-13** fixed for the declarations (P29's half). The hooks route (`consumes` json, form, text), the event stream (`produces: text/event-stream`), and the uploads (files, app assets, logo, icons, tenant import) now declare their content types and a body that is read as bytes (`body: Type.Unknown()`). Test: `app.test.ts` "API-13: the event stream, the webhook and the uploads say their content types" (failed before). Left: MCP (JSON-RPC, the written page is the answer, as the row says); the links to the written pages are phase 30 M9.
- **API-16** already fixed by api2 (D50): `platform/run-finished` carries `status: cancelled`; `runs.ts:645, 680`. Test: `flows.test.ts` trigger `on-not-succeeded` on `platform/run-finished` (the events registry is phase 30 M9).
- **SHL-16** reproduced and deliberate (D18); the row and GOV-12 now say the same thing and point to `fixed/gov2.md`. The code reads: the code is spent before the password is checked (`auth.ts:180-182`); the form says so. Test: `Account.test.tsx` "a wrong password with a recovery code says the code is spent (GOV-12, D18)".
- **GOV-12** same as SHL-16.
- **MP-1** built. The script page's Settings tab (`ObjectPages.tsx` `ScriptSettings`) now has "Change the settings": the editor's own fields (timeout, tries and wait, backoff, uses of connections, secrets, variables, tables, data sources, events, connection groups, worker pool, memory, runs at once and its lane key, what happens on a last failure), saved as a draft over the draft there is (its revision) or over what is deployed. Shared piece: new `screens/CodeSettings.tsx` (`LimitsFields`, `useCodeChoices`), moved out of `Authoring.tsx`, which now uses it. Tests: `ObjectPages.test.tsx` "MP-1: a script's settings are changed on its page, and saved as a draft" and "...in production, or for a script a repository holds, the settings are read only"; `Authoring.test.tsx` passes unchanged. Not on this page: the flow-step block ("Use as a flow step") and the schema, which stay in the editor. Siblings: connector and trigger-source Settings still read the shared fields through the editor; no other page edits them.
- **ACC-27** (others' operator grants) settled. A grant to someone else is not a source of this member, and the server lists only the member's own (`authorize.ts` `granted`, `principal.id`): nothing to say on their screen, refuted for that half. The own half was silent: an Allowed answer that only operator access gives now says "It comes only from operator access, which ends when the grant does." (`Access.tsx`). Test: `AccessLane2.test.tsx` "ACC-27: a permission only operator access gives is allowed, and says where it comes from" (failed before).
- **WLK-17** done: a to h each have their write-up and test in `fixed/t2-walk-shell.md` (a `Connections.test.tsx`, b `ConnectionGroups.test.tsx`, c `FlowEditorWalk.test.tsx`, d `Docs.test.tsx`, e `PageHeader.test.tsx`, f `Environments.test.tsx`, g `Connections.test.tsx`, h `Git.test.tsx`); `remaining.md` says so (i is the shell lane's).
- **WID-M10** built by lane sweep-build (`fixed/sweep-build.md`, three "WID-M10" tests in `rows-it-uses.test.tsx`); `remaining.md` says so.
- **VOC-31** is the docs content (`packages/docs/content`): left to phase 31 (the files are not edited in phase 29).
- **CLI-MP7** asked of the owner: `volvel dev` for file apps, interfaces and docs; no decision answers it.

## For packages/docs/content and CHANGELOG (not edited here)

- Script page: Settings tab changes the settings, saved as a draft.
- OpenAPI: the webhook, the uploads and the event stream carry content types. Chart legend: Automatic or Never (the value `shown` is gone).

## Siblings looked at

- `useChoices` had one copy (Authoring); it is now `CodeSettings.tsx` and Authoring imports it.
- `Frame` Download: heading and corner share one element. `PageView` Download tests kept.
- Every `PositionPicker` caller: `buttonDrawer.tsx` (a button's own place, no line up) and `KitDrawer.tsx` unchanged.

## Found

- A widget whose stored config has `legend: "shown"` is now outside the schema; nothing in the repository other than Fernhill used it.
- The other upload routes (portability bundle, SCIM) have no requestBody beyond what is listed above.

## Screens to walk

At 1440, 768 and 390, light and dark, by keyboard, with a reload:
- A dashboard with a Goal (with and without a click action), a heatmap with Colors set to Warm and Cool, a table with no heading (Download in the corner; does it cover the first row's content at 390?), a detail with Edit on (Tab to a field, Enter opens, a screen reader names it "Edit Total: ...").
- The builder: an Action group's Look with Left, Right and Spread; a chart's Legend.
- A script's page, Settings tab: Change the settings, Save as a draft, in dev, in production, and in a script a repository holds.
- A member's Access with an operator grant, checking a permission.

Polish gate for the script Settings form: states: loading (draft read), saving (button loading), refused (message and field errors under fields), saved (notice with a link to the draft); lifecycle: it ends at a draft the editor deploys; keyboard: native fields, Enter submits, Cancel; copy: says it is a draft and that it runs this way once deployed.
