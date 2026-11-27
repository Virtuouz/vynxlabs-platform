# Fact-check record: console/tutorials/dashboard-with-filters

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" for the rows below: second agent, 2026-11-24.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Data menu has Dashboards; **New dashboard** asks only a Name | `apps/console/src/nav.ts` (Data group), run | writer, run | holds |
| A new dashboard is yours alone | dialog text "It is yours alone until you choose to share it.", run | writer, run | holds |
| Stat default Value is Count of rows | run | writer, run | holds |
| Widgets follow page filters by default ("Follows 3 page filters") | run | writer, run | holds |
| Filter types: Starts at is a date range with Last 30 days by default; Clinic is text | run | writer, run | holds |
| Filters are kept in the address as `f` | run | writer, run | holds |
| A dashboard shows the rows the reader may read | Dashboards screen header text, run | writer, run | holds (text) |
| Reading needs `data:read` | `packages/docs/generated` permissions | writer | unchecked beyond Sam Reyes's refusal text in the invoices run |
| Steps 1-12 in one pass as `chk Visit mix`: labels, the filter list texts, "Follows 3 page filters", "Reads as the number of appointments for each clinic. Drawn as bars; 3 clinics." | instance walk | second agent, run | holds |
| Stat with the Last 30 days default is 1,690 on 2026-11-23, All time 3,708, riverside 1,381; URL `?f={"starts_at":null,"clinic":"riverside"}` and the reload restore them | instance walk | second agent, run | holds; "the walk saw 1,690" removed from the page (it depends on the day) |
| Frontmatter subjects `[dashboards, queries]`, both shared with other pages | `pnpm docs:check` | second agent | holds |
| 390 px dark: no sideways scroll | instance walk | second agent, run | holds |

Checked by: second agent, 2026-11-24.
