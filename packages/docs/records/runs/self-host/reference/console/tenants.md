# Run log: self-host/reference/console/tenants.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as the operator `admin@example.com` with Playwright headless, at 1440 px in light for every step; 390 px (members, health, databases) as a screenshot only; no dark run and no keyboard-only run. Other writers used the instance at the same time (their tenants and members are in the lists).
- Names made for this run start with `instance`: tenants `instance-demo`, `instance-demo-2`, `instance-loc-t`, `instance-loc-2`; the member `instance-walk@example.com`; the database location `instance-walk-db`, backed by a throwaway database `instwalk_loc` made in the dev Postgres container and dropped at the end. Everything made was deleted afterwards except the member (a member cannot be deleted).

The screen was opened and read in a browser; the controls and states in the page were compared with it and with the component. What each page says was run, and what was only read from the code, is in the "Checked by" column of `docs/documentation/factcheck/self-host/reference/console/tenants.md` (`run` or `code`).

Seen: the list at 1440 px (Name, Slug, Workspaces, You, Tables kept in, Created), the inspector with the workers and history panels, **Create tenant** (a bad slug refused at the field), the **Tables kept in** filter after a location existed (the address became `/?location=instance-walk-db`), **Rename** and the console-code button present only for a tenant the operator belongs to, **Delete** (see the how-to's log). Seen at 390 px: not run for this screen.

Faults found: **Rename** and **Turn off code in the console** are not drawn for a tenant the operator is not a member of, although `PATCH /tenants/{id}` accepted a rename from the operator (200). The **You** column reads **Through a grant** for a tenant the operator is not in and holds no grant for. Opening `/` goes to the last place instead of the list.
