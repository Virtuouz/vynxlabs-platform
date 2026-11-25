# Run log: develop/how-to/widget-data-and-events.md

- Instance: http://localhost:8462 (lane b6, commit `aabf96af` plus the docs), Fernhill seeded with `--reset`; Devi Shah on the profile `b6devi`; the scratch copy `examples/fernhill-scratch`. Playwright headless, 1440 px, light.
- The YAML block of the page was cut out of the page's file and written to `platform/boards/clinic-load.dashboard.yaml` unchanged (after `volvel pull`). `volvel deploy --tenant fernhill --workspace sandbox` printed "Deployed version 7 to sandbox (dev): 1 created, 0 updated, 0 deleted, 104 unchanged." and `created  dashboard  boards/clinic-load`.
- The dashboard in Sandbox, Data, Dashboards, Clinic load: two gauges ("Northside today" 26 of 30, 87% busy; "Riverside today" 21 of 20, 105% full) and the Visits table. Pressing Riverside (a click in the first pass; focus and Enter on the second) set Clinic to `riverside`, the **Clear** button appeared and the table listed riverside visits only.
- Failure shown: pointing a gauge's `clinics` input at the appointments table left that gauge blank (more than one page of rows); put back.
- The dev preview's log for the same widget: "clicked"/"clinicChosen passed the host's checks" with `{"group":{"clinic":"northside"}}`.
- Not run: a payload the page drops (the page's reasons are from the code, the preview's log shows `dropped` for them in its tests); 390 px and dark of this dashboard (Clinic load on another dashboard was walked at both).
