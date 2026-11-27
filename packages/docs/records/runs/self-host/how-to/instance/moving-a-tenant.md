# Run log: self-host/how-to/instance/moving-a-tenant.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as the operator `admin@example.com` with Playwright headless, at 1440 px in light for every step; 390 px (members, health, databases) as a screenshot only; no dark run and no keyboard-only run. Other writers used the instance at the same time (their tenants and members are in the lists).
- Names made for this run start with `instance`: tenants `instance-demo`, `instance-demo-2`, `instance-loc-t`, `instance-loc-2`; the member `instance-walk@example.com`; the database location `instance-walk-db`, backed by a throwaway database `instwalk_loc` made in the dev Postgres container and dropped at the end. Everything made was deleted afterwards except the member (a member cannot be deleted).

## The steps as followed
1. Made `instance-demo` (as a member). In the tenant, **Export**: a 5-character passphrase gave "Use at least 12 characters."; two passphrases that differed gave "The two do not match."; with matching ones **Export tenant** downloaded `instance-demo-2026-11-23.tar` (14 KB) and the page said "The export was downloaded. API keys and worker credentials are never in an export: make new ones wherever the tenant goes."
2. **Instance > Import a tenant**, with the tenant still here: chose the file, **Upload and check**. The Check step showed Instance Demo, Exported time, From version 0.5.0, Workspaces "None", Rows 7, Members 1, Run history "Left out of the export", and the long **Not carried** list. **Can it come in**: version passes, passphrase and signature "not checked yet", "This tenant is on this instance already". **Import tenant** was disabled. After typing the passphrase the check ran again by itself and read "The passphrase opens it" and "Its list of contents is signed with its key, and the signature is right"; **Import tenant** stayed disabled.
3. After a reload of the page, **Uploads that wait** listed the upload (name, size, kept until) with **Open** and **Throw away**.
4. Deleted the tenant (see the delete page's log). **Open** on the waiting upload, typed the passphrase: "The tenant is not here yet" and "Its slug is free here"; **Import tenant** enabled. Typed a slug `instance-demo-b`: the button went disabled until the check ran again (about 600 ms), then enabled. **Import tenant**: "Instance Demo was imported: 7 rows and 0 stored objects. Members created: 0. Members linked to accounts already here: 1.", the tables "in the instance's own database", "All 0 workspaces arrived with their triggers paused. Resume each one when the instance it came from has stopped." and a "Not carried:" line for each item, with **Open the tenant** and **Import another**.
5. The tenant list then had `instance-demo-b` with a new slug (the ID is the same as the exported tenant's, seen in the audit entries). The `tenant.exported` and `tenant.imported` entries were in the instance log (the tenant's own log had been deleted with it, so they carry the **Deleted tenant** tag after it was deleted again).
6. Deleted `instance-demo-b` afterwards.

## The page got wrong (and was corrected)
- The refusal on an import while the tenant is here reads "Delete it here first if it should be replaced." (a first draft left out "here").
- The screen has no `Can` guard on the import: the page says the server refuses a person without `tenant:write`.

## Not run
- The command-line export and import (`volvel tenant export`, `volvel tenant import`) and a second instance. The "after" list is from the code and from `docs/self-hosting.md`, not run.
- An import into a database location, a member without a password, a format 1 export, a file over 50 GiB, "staged elsewhere" (one replica only), a wrong passphrase.
- A dark-theme, keyboard-only or phone-width pass.

## Second check, 2026-11-23 (second agent)
- Ran what the first pass listed as not run: an import into a database location (a throwaway database `instchk_loc` registered as `inst-chk-db`: the result said "Its custom tables are in the database location "inst-chk-db"." and the row on **All tenants** said `inst-chk-db` under **Tables kept in**) and a wrong passphrase ("The passphrase does not open it"; **Import tenant** stayed disabled). The workspace line was singular ("The workspace arrived with its triggers paused. Resume it when the instance it came from has stopped."). The deleted and imported tenants were removed again and the location and its database dropped.
- Still not run: the command line export and import, a second instance, a format 1 export, a member created without a password, a file over 50 GiB, "staged elsewhere".
- 390 px in dark and keyboard on **Import a tenant**: no horizontal scroll, Tab reaches the file input, the passphrase and the buttons with a visible focus ring.
