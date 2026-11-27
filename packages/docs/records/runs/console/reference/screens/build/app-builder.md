# Walk log: console/reference/screens/build/app-builder

- Instance: http://localhost:8091 (throwaway, Fernhill seeded), Maya Brooks (tenant admin), Sandbox workspace, 1440 px, light, Playwright headless, 2026-11-23. Reading only the texts of the screens by script; no width under 1440, no dark theme, no keyboard walk, no reload check was run.

- List: columns App, Pages, State, Address and the end column; rows for Front desk board (NOT PUBLISHED, "edited 1h ago", "Once it is published", Rename, Discard draft), Clinic operations / My Fernhill account / Clinic performance (PUBLISHED V1, address link, Rename, "Managed in the repository: the app is removed there."), and apps by other writers.
- A never-published app shows **Discard draft**, not **Remove** (seen on Front desk board and on abapp apps).
- Make an app dialog: text, Name with "12 of 100", Address, Cancel, Make the app. The "Something already exists…" text, the Rename dialog, Remove and Keep this app, the empty state, the production notice and the read-only line were not walked; they come from the code.

## Second check, 2026-11-23 (second agent)
- Instance http://localhost:8091 at commit `87000022` plus the working tree. Playwright headless. My own apps are named `chk2 …` (in Fernhill's Sandbox); no Fernhill app, table or person was changed. People: Maya Brooks (tenant admin); Abchk Maker (a member made for the check, App maintainer in Sandbox: `interface:write`, no `resource:write`); Abchk Dev (Developer in Sandbox: no `deployment:write`); Amara Okafor (viewer). Walked at 1440, 900, 768 and 390 px; light at all and dark at 1440, 768 (list, dialog, workbench) and 390 (list, workbench). A session reload was made for the rename and the page order.
- List: Make an app; Name field past 100 ("120 of 100", "Use at most 100 characters. This is 120.", then the save is refused with "The manifest is not valid. /body/title…"); Address typed as "Chk2 Alpha!!x" became `chk2-alpha-x`; a taken address showed "Something already exists at this path. Choose another, or open that one." under **Address** and made nothing.
- Rename (dialog text, "14 of 100", "The address stays chk2-alpha", Save as a draft off until the name differs), Discard draft, Remove (with the replace sentence when the app had edits), the row **Being removed** with **Keep this app**, and Keep. Keep also brought back no edits: the row returned as Published v1 with no Edits not published (the page now says so).
- Read only (a viewer): the line "You can see this workspace's apps, not change it. It needs resource:write, or interface:write alone." and **Make an app** disabled; Rename, Remove and Discard draft stayed enabled (the page now says so).
- Production (Clinics): the notice, no end column, names as plain text, addresses as links; a production workspace with no apps shows the empty text with no button.
- A member with only `interface:write`: read the list, made an app, published it (Published v1) and previewed it.
- 390 px and dark: no horizontal page scroll; the table scrolls sideways inside its frame at 390 px (the end column is out of sight until it is scrolled); colors and the dialog read in dark.
- Not run: the toast text after Rename (the console's connection notice covered the toast region); the tooltip text on a disabled Make an app (the hover could not be read by script; the words are from `Can.tsx`).
