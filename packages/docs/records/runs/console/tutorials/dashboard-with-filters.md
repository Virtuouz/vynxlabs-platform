# Run log: console/tutorials/dashboard-with-filters

- Instance `http://localhost:8091`, commit `5ebf1c80`, 2026-11-23. Maya Brooks, Fernhill Sandbox, Playwright headless, 1440 x 900, light. Dashboard `tut Visit mix`.
- Done in scripts, each continuing the one dashboard (made, stat, filters, chart and table, view, filters used). Not one continuous script.

## Seen

1. Data > Dashboards: list (Dashboard, Whose, Seen by, Changed) with the seeded "Visits by clinic". **New dashboard** > dialog "It is yours alone until you choose to share it." Name, **Make the dashboard**. URL `.../dashboards/<id>?edit=1`; "Saved.", "Refreshes" menu (Never by itself, Every minute, Every 5 minutes, Every 15 minutes, Every hour), **Share**, **Done**, "Nothing on this page yet".
2. **Add to page** > Stat > **Source** > Appointments: 3,708; settings Data tab "WHAT IT SHOWS / Value / Count of rows".
3. Stat > Data tab > **Add Search and filter**: outline "Search and filter, Stat"; FILTERS "Search / Looks in Number".
4-5. **+ Filter** dialog "Add a filter" (A search box, then columns with types: Starts at Date range, Clinic Text ...). Rows "Starts / Date range · Last 30 days" and "Clinic / Text · Any".
6. Chart: Source Appointments; "Follows 3 page filters · click to switch one off / Search / Starts / Clinic"; Measure "Count of rows"; For each defaulting to Starts at, Weekly.
7. **For each** dialog "Good for grouping" listing Clinic (3 values), Minutes, Species, Vet, Status, Reason ...; Clinic chosen; "Reads as the number of appointments for each clinic. Drawn as bars; 3 clinics."
8. Table, Source Appointments, "Follows 3 page filters". Outline: Search and filter, Stat, Chart, Table.
9. **Done**: URL without `?edit=1`; "Yours. Seen by: only you." / Share / Edit / "Last refreshed … Refreshes every 5 minutes" / Refresh now; controls Search, Starts (select, value `last_30_days`), Clinic (text); Stat 1,690.
10. Starts > All time: Stat 3,708; URL `?f=%7B%22starts_at%22%3Anull%7D`.
11. Clinic `riverside` + Enter: Stat 1,381; URL `?f={"starts_at":null,"clinic":"riverside"}`.
12. Reload of that URL: Stat 1,381, Clinic `riverside`, Starts All time.

## What the page got wrong, and was corrected
Nothing found wrong in the page as written; the order of steps 3-5 was taken from the run (the filter widget is added from the Stat's own Data tab).

## Not run
Whether the chart redraws to one bar under the clinic filter (the figure did; the chart was not read). **Share**. 768 and 390 px; dark; keyboard-only.

## Second check (2026-11-24)
Walked again in one pass as `chk Visit mix`, 1440 light; no step differed. Reload of the filtered address restored it. 390 px dark: dashboard has no sideways scroll. Not run: **Share**; whether the chart shows one bar under the clinic filter.
