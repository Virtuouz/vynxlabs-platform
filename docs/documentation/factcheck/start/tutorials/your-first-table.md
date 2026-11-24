# Fact-check record: start/tutorials/your-first-table

Code as of commit `be324f78` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer; every row was also executed on the throwaway instance (see `docs/documentation/runs/start/tutorials/your-first-table.md`). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The rail button is **Data**, and its menu has **Tables** | `apps/console/src/nav.ts:76,141` | writer, run 2026-11-23; second agent, 2026-11-23 | holds |
| The list has a **Managed in** column that says Repository or Console | `apps/console/src/screens/Data.tsx:1654,1844` | writer, run 2026-11-23; second agent, 2026-11-23 | holds |
| **Create table** fields: Name, What it holds, First column, It holds, Who sees rows | `Data.tsx:1667-1710` | writer, run; second agent, 2026-11-23 | holds |
| Name takes "Lowercase letters, digits and dashes." | `Data.tsx:1673-1676` (hint, seen on screen) | writer, run; second agent, 2026-11-23 | holds |
| **Add another column** and the labels "Column 2" and "Column 2 holds" | `apps/console/src/screens/ColumnControls.tsx:556-575,619` | writer, run; second agent, 2026-11-23 | holds |
| The type labels (Text, Whole number, One of a list ...) | `Data.tsx:74-85` | writer, run; second agent, 2026-11-23 | holds |
| Who sees rows default is "Everyone who may use the table sees every row" | `Data.tsx:1709` | writer, run; second agent, 2026-11-23 | holds |
| Creating saves the table at once (no deploy): `PUT resources/<name>` with `ownership: "ui"`, then opens the table | `Data.tsx:1743-1756`; kind hook applies it: `apps/control-plane/src/kernel/kinds.ts:235-241` | writer, run (rows added right after); second agent, 2026-11-23 | holds |
| The sentence "<description>. 0 rows. Everyone with access. Managed in the console." is the page description, shown in the popover of the information button **About <name>** beside the table's name, not as text on the page | `Data.tsx:1844`, `apps/console/src/screens/RowRules.tsx:33-41`, `apps/console/src/kit/PageHeader.tsx:226-232`; run 2026-11-23 (button opened, text read) | second agent, 2026-11-23 | corrected: the page said "Its header reads"; it now names the button |
| "This table has no rows yet." | `Data.tsx:671` | writer, run; second agent, 2026-11-23 | holds |
| Tabs **Rows** and **Definition** | `Data.tsx:1850-1851` | writer, run; second agent, 2026-11-23 | holds |
| **Add column** button on the Definition tab; its dialog fields: Name, It holds, Values, Must every row have one?, Value when none is given | `Data.tsx:2721,3193`; `ColumnControls.tsx:253-275` and the Values field `Data.tsx:89-99` | writer, run; second agent, 2026-11-23 | holds |
| Done message "The column clinic was added." | `Data.tsx:3252` | writer, run (message seen in the run; screenshot); second agent, 2026-11-23 | holds |
| Columns table shows **Required** and the default under "When not given" | `Data.tsx:2779` | writer, run; second agent, 2026-11-23 | holds |
| **Rules** on a column: "Must every row have one?" Yes/No, Save | `ColumnControls.tsx:249-285` | writer, run; second agent, 2026-11-23 | holds |
| **Add row** sheet groups "Required" and "Optional" | `Data.tsx:1448-1470` | writer, run; second agent, 2026-11-23 | holds |
| "Row added." | `Data.tsx:1426` | writer, run; second agent, 2026-11-23 | holds |
| Footer "N rows on this page, of N that match" | `Data.tsx:714-720` | writer, run; second agent, 2026-11-23 | holds |
| Filter box per column ("Filter by minutes"), `>=20` is "greater than or equal" and applies after typing stops | `packages/ui/src/Grid.tsx:649`; `apps/console/src/screens/gridFilter.ts`; `apps/console/src/kit/addressBox.ts:17` | writer, run; second agent, 2026-11-23 | holds |
| A click on a heading sorts ascending, then descending; an arrow shows it | `Data.tsx:171-186`, `Grid.tsx` (address `sort=minutes` then `sort=-minutes` seen in the run) | writer, run; second agent, 2026-11-23 | holds |
| The saved views button is named **Saved views**; menu item **Save this view…**; dialog "Save this view" with Name and Save | `apps/console/src/kit/views.tsx:86-90,148,176` | writer, run; second agent, 2026-11-23 | holds |
| "Saved as “Long visits”. Only you see it in this menu; its link opens it for anyone." | `views.tsx:103` | writer, run; second agent, 2026-11-23 | holds |
| Choosing a saved view puts back its filter and sort | `views.tsx:64-70` (`apply` navigates to the saved query) | writer, run; second agent, 2026-11-23 | holds |
| A saved view is for a workspace table, shown only to its owner | `views.tsx:103` (text); `Data.tsx` ViewsMenu use | writer; second agent, 2026-11-23 | holds |
| A table needs `resource:write` to make; a tenant admin holds all permissions | `Data.tsx:1743` (PUT resources); `apps/console/src/builtinRoles.ts:48` (`tenant_admin: ["*:*", ...]`) | writer; second agent, 2026-11-23 | holds |
| Fernhill: Maya Brooks is the tenant admin; password `fernhill-demo-2026`; Sandbox is a dev workspace | `examples/fernhill/README.md` (sign-in table), `examples/fernhill/setup/setup.mjs:237-245` | writer, run; second agent, 2026-11-23 | holds |
| Every table has `id`, `created_at`, `updated_at` | `Data.tsx:2836-2837` | writer, run; second agent, 2026-11-23 | holds |

Checked by: second agent, 2026-11-23. Tutorial done again end to end on the instance as Maya Brooks, at 1440 px and at 390 px (names chk-vn-a, chk-vn-c; see the run log). Corrected: the table header sentence is in the **About** popover, not on the page.
