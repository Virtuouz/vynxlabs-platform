# Run log: self-host/how-to/instance/deleting-a-tenant.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as the operator `admin@example.com` with Playwright headless, at 1440 px in light for every step; 390 px (members, health, databases) as a screenshot only; no dark run and no keyboard-only run. Other writers used the instance at the same time (their tenants and members are in the lists).
- Names made for this run start with `instance`: tenants `instance-demo`, `instance-demo-2`, `instance-loc-t`, `instance-loc-2`; the member `instance-walk@example.com`; the database location `instance-walk-db`, backed by a throwaway database `instwalk_loc` made in the dev Postgres container and dropped at the end. Everything made was deleted afterwards except the member (a member cannot be deleted).

## The steps as followed
1. **Instance > All tenants** (reached from the Operators screen: opening `/` jumped to the workspace the operator was last in). Made `instance-demo-2` with **Make me a member, as tenant admin** off, so the row said **Through a grant** (no grant open); the inspector showed **Open** and **Delete** only.
2. Chose the row, pressed **Delete**. Dialog "Delete Instance Demo Two Renamed?" (the name had been changed by an API call first) with the text and "Type instance-demo-2 to confirm". **Delete tenant** was disabled empty and with `wrong`, enabled with the slug.
3. **Delete tenant**: the dialog closed, the inspector closed and the list reloaded without the tenant. No toast was seen by the script.
4. The instance audit log then showed `tenant.deleted` ("DELETE Tenant deleted", To: the tenant's name). Its details held the name, slug, workspaces, tables and files.
5. Second confirmation: registered a location (`instance-walk-db`), made `instance-loc-t` in it and deleted it with the location reachable: it went straight through, because the tenant had no workspace (nothing to drop). Then made `instance-loc-2` with one workspace through the API, dropped the backing database and deleted it: the second dialog opened, "Delete Instance Loc Two without dropping its tables?" with the database's own error, **Delete anyway**. The entry `tenant.deleted` had `tablesLeftIn: instance-walk-db` and `schemas`.
6. After a delete, entries of the deleted tenant (`tenant.created`, `tenant.exported`, `tenant.updated`) were in the instance log with the tag **Deleted tenant**.

## The page got wrong (and was corrected)
- The inventory put the second confirmation after any unreachable database; the code and the run show it only when the tenant has workspaces. The page says "and the tenant has workspaces".
- The delete dialog uses the tenant's current name, so a rename shows in it.

## Not run
- Deletion refused while runs are queued or running (the text is from the code, `remove.ts`).
- A dark-theme or keyboard-only pass, and a 768 px or 390 px pass of the dialogs.
