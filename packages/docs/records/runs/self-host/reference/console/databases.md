# Run log: self-host/reference/console/databases.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as the operator `admin@example.com` with Playwright headless, at 1440 px in light for every step; 390 px (members, health, databases) as a screenshot only; no dark run and no keyboard-only run. Other writers used the instance at the same time (their tenants and members are in the lists).
- Names made for this run start with `instance`: tenants `instance-demo`, `instance-demo-2`, `instance-loc-t`, `instance-loc-2`; the member `instance-walk@example.com`; the database location `instance-walk-db`, backed by a throwaway database `instwalk_loc` made in the dev Postgres container and dropped at the end. Everything made was deleted afterwards except the member (a member cannot be deleted).

The screen was opened and read in a browser; the controls and states in the page were compared with it and with the component. What each page says was run, and what was only read from the code, is in the "Checked by" column of `packages/docs/records/factcheck/self-host/reference/console/databases.md` (`run` or `code`).

Seen: the empty state, **Register database** (a refused connection gave "That database could not be prepared. connect ECONNREFUSED 127.0.0.1:1"; a real throwaway database worked and said "Created."), the row (**Reached**), the inspector, **Edit** (dialog read), a tenant placed in it (the **Remove** button then missing), and the row after the database was dropped (**Failed**, `database "instwalk_loc" does not exist`). **Remove** worked once the tenants were gone.

Fault found: the second delete question prints the database's error with no full stop before "If you go on".
