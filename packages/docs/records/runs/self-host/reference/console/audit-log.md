# Run log: self-host/reference/console/audit-log.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as the operator `admin@example.com` with Playwright headless, at 1440 px in light for every step; 390 px (members, health, databases) as a screenshot only; no dark run and no keyboard-only run. Other writers used the instance at the same time (their tenants and members are in the lists).
- Names made for this run start with `instance`: tenants `instance-demo`, `instance-demo-2`, `instance-loc-t`, `instance-loc-2`; the member `instance-walk@example.com`; the database location `instance-walk-db`, backed by a throwaway database `instwalk_loc` made in the dev Postgres container and dropped at the end. Everything made was deleted afterwards except the member (a member cannot be deleted).

The screen was opened and read in a browser; the controls and states in the page were compared with it and with the component. What each page says was run, and what was only read from the code, is in the "Checked by" column of `docs/documentation/factcheck/self-host/reference/console/audit-log.md` (`run` or `code`).

Seen: the filters list, the area list, an entry opened (details JSON, **Everything about this**), entries of deleted tenants with the **Deleted tenant** tag, `tenant.deleted` with `tablesLeftIn`. Not run: **CSV**, **Columns**, **Between dates**, the More filters lists.
