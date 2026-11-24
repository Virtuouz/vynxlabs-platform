# Fact-check record: console/reference/screens/data/dashboards

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| List columns Dashboard, Whose, Seen by, Changed; Resource tag; pills; Renamed from; description | DB:195-285 | writer, run | holds |
| New dashboard dialog text, Make the dashboard, 100 characters, 20 per member | DB:145-180; rd:14,285-320 | writer, run | holds (limit not hit) |
| Empty state and no-permission text | DB:200-210 | writer, code | holds |
| Page titles for member vs resource; whose line | DB:830-860 | writer, run | holds |
| Freshness line, Refresh now, "N widgets could not be read" | DB:868-895 | writer, run | holds |
| Share dialog, groups, 50, no group:read text | DB:640-660,1000-1055 | writer, run | holds (groups listed) |
| ⋯ menu: Name and description…, Keep it as a resource…, Delete…; resource: Description… | DB:570-640 | writer, run | holds |
| Description dialog titles and 500/100 | DB:960-1000 | writer, run | holds |
| Keep it as a resource dialog and saved notice | DB:578-615 | writer, run | holds |
| Delete confirm text | DB:608-625 | writer, code | holds |
| Resource buttons Edit, Name and path, Discard draft/Remove/Keep this dashboard | DB:770-830 | writer, run | holds |
| Notices: defined by the repository; removing; reads what the workspace lacks; Nothing on it yet | DB:835-905 | writer, code | holds (not all run) |
| Refresh options and 5 min default; stops while editing; tab hidden | DB:440-450,688-695; `apps/console/src/kit/every.ts` | writer, run | holds |
| Download menu names, 10,000 rows, text of cap | `packages/screens/src/Frame.tsx:233,310-340`; `packages/screens/src/useWidgetData.ts:32` | writer, run | holds |
| Help topics data-dashboards and data-dashboards-editor | DB:408; `apps/console/src/nav.ts:140-145,319` | writer, code | holds |
| Addresses dashboards/<id>, dashboards/at/<path>, ?edit=1, ?f= | DB:96-100,215 | writer, run | holds |
| Permissions: dashboard:read list/view; dashboard:write create/save/delete; members only | rd:238-300,344-500 | writer, code | holds |
| Members only; kept dashboards open to whoever has dashboard:read | rd:67-72,155-175 | writer, code | holds |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Confirmed on the instance (tenant qry31chk): New dashboard dialog and its texts; the name over 100 characters says "Use at most 100 characters. This is 101." and the button is off (page corrected); the 21st dashboard of a member is refused "A member can keep 20 dashboards in a workspace. Delete one first." (API 409 `limit_reached`, and in the dialog); Share lists the groups, a group is chosen at once and "Seen by" follows; ticking everyone hides the groups; the refresh timer (Every minute) re-read the widgets (Stat 3 to 4) while the tab was open; a reload kept the editor's changes; a member with `dashboard:read` only (Vic) sees the list note, "Making one takes the dashboard:write permission…", and a dashboard shared with everyone as "Ann Qry's, shared with you. You see the rows you may read." with no Share, Edit or menu.
- fault fixed (fc): the names are kept as written, confirmed in the code; the page no longer says lower case.
- Kept as a resource, removed ("Removing" and the notice), kept again, renamed (Name and path, page moved to the new address with "A draft renames … to …"), and a draft clash in the editor ("Not saved: someone else saved this dashboard"; **Copy what I wrote** and **Load their version** are offered in the dashboard editor).
- Walked at 390 and dark: list, dashboard, Share and editor have no horizontal overflow.
