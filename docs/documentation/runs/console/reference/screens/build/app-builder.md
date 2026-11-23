# Walk log: console/reference/screens/build/app-builder

- Instance: http://localhost:8091 (throwaway, Fernhill seeded), Maya Brooks (tenant admin), Sandbox workspace, 1440 px, light, Playwright headless, 2026-11-23. Reading only the texts of the screens by script; no width under 1440, no dark theme, no keyboard walk, no reload check was run.

- List: columns App, Pages, State, Address and the end column; rows for Front desk board (NOT PUBLISHED, "edited 1h ago", "Once it is published", Rename, Discard draft), Clinic operations / My Fernhill account / Clinic performance (PUBLISHED V1, address link, Rename, "Managed in the repository: the app is removed there."), and apps by other writers.
- A never-published app shows **Discard draft**, not **Remove** (seen on Front desk board and on abapp apps).
- Make an app dialog: text, Name with "12 of 100", Address, Cancel, Make the app. The "Something already exists…" text, the Rename dialog, Remove and Keep this app, the empty state, the production notice and the read-only line were not walked; they come from the code.
