# Fact-check record: start/tutorials/your-first-app

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Rail button **Build** and its menu item **App Builder** | `apps/console/src/nav.ts:125` | writer, run | holds |
| **Make an app** asks Name and Address and starts one empty page | `apps/console/src/screens/` (App Builder list), run | writer, run | holds |
| **Add to page** lists the Table widget under WORK WITH RECORDS | `apps/console/src/kit` add-to-page dialog, run | writer, run | holds |
| "Where it reads from" lists tables and queries | run; `e2e/phase-28.spec.ts:691` | writer, run | holds |
| Columns are hidden with an eye named "Hide <column>" and counted "N of M shown" | run | writer, run | holds |
| The publish check text and "Publish N changes" | `e2e/phase-28.spec.ts:1818-1824`, run | writer, run | holds |
| An app is served at `/apps/<tenant>/<workspace>/<address>/` | run (Apps list address) | writer, run | holds |
| Publishing needs `deployment:write`, making needs `resource:write` | `packages/docs/generated/administer/reference` permissions list | writer | unchecked against the route; the second agent confirms |
| "Staff only" is the default of a new app | Apps list shows "Staff only" for the other apps | writer, run (Apps list row: Staff only, APP BUILDER) | holds |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Walked as Maya in Fernhill Sandbox with the name 'tut Visits 2' (tut Visits existed, being removed). Corrected: the Title field opens holding 'Table', so typing Visits gives TableVisits: select all first (fault fixed (ff): the Title field selects its default text on first focus; the step now just says type Visits). Published app opened at 1440, 390 (rows as cards, no headings) and dark; 'Showing 25 of 3,708'.
