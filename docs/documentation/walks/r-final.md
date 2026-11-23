# Walk r-final (phase 29)

Instance localhost:8091, fresh seed. Own data: member rfinal.appmaint (app_maintainer, Sandbox), tenant `r-final tenant` (workspace rfinaldev, SSO provider with a local discovery document), draft app `rfinal-app-1440`, draft script `rfinal/draftonly`, tables rfinal1440/rfinal390. Shots: `~/.local/share/volvel-walk/shots29/r-final/`. Scripts: `~/.local/share/volvel-walk/r-final-scripts/`. 1440, 390 (768 where said), light and dark, keyboard, reload.

## 1 Roles (gate-roles): RIGHT
- doc_writer (Sam): edits a handbook page, saves a draft, reload keeps it (`r5-*`). Flows and Tables show the line naming resource:write, buttons off.
- developer (Devi): New flow (draft saved) and Create table (kept after reload) work (`r6-*`, `r7-*`). app_maintainer: Make an app works (`r7-app-*`); Flows and Tables off with the line.
- viewer (Amara): New flow, Create table, Make an app, docs New page/Edit off or absent, each with a line naming resource:write / "interface:write alone" / "doc:write alone".
- Table Definition as viewer: no Add column/Rename/Delete, line shown (`r8-def-amara-*`). Declare source: off. Runs row menu: viewer has no Run again, developer has it (`r9-*`).
- NOT WALKED: Cancel (no running run), a grant on one script only.

## 2 Save bar
- RIGHT: SSO Settings, Branding, Environments, instance Branding: bar flush (gap 0), 20-66 px clear above it at the end, Discard returns focus to the edited field, 390x800 and 1440.
- WRONG: Provisioning. Bar stays inside the settings section; scrolled to the end it sits at top 167 (gap 554) at 390x800, gap 420 at 1440 (`sb-prov-390x800-light.png`). `Provisioning.tsx:242` (SaveBar inside the `<section>`; sticky cannot leave it).
- WRONG: Retention at 1440: short page, bar rests 131 px above the bottom (`sb-retention-1440x900-light.png`). `Retention.tsx:162`, `kit/SaveBar.tsx:75`. 390 is right.

## 3 Other rows: RIGHT
Pressable Goal bar equals plain at 1440/768/390 (`g2-*`); focus returns to "Edit Species" after Esc and after Enter, Tab continues (`e2-*`); draft-only script Settings with the draft note, kept on reload (`sc2-*`); "Allowed" full width 52 px at 390/768/1440 (`ac-*`); heatmap help "Clinic along the bottom, Reason up the side" matches the chart, "3 clinics" (`hm-b-*`).

## 4 Audit
- Instance 1440: one row, RIGHT (`au-op-1440-dark.png`).
- Tenant 1440: WRONG, the search box wraps to a second row (six selects plus search are about 1200 px, room 1104) (`au-maya-1440-light.png`). `Audit.tsx:436`.
