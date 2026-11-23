# Run: develop/how-to/access/call-the-access-api

Instance http://localhost:8091 (Fernhill seeded), tenant `acc-main` made by the operator for this run; members acc-ann and acc-bob (tenant admins), acc-cy (viewer); commit 5ebf1c80 plus the working tree; 2026-11-23. Browser: Playwright, headless, 1440 px, light, signed in as acc-ann for the screens named; the rest through the API with the same session cookies. Not done: 768 and 390 px, dark, keyboard, reload.

Ran the script of the page (extended with the tenant's other resources, because the set is the whole set): plan 200 `possible: true`, then release 201, access change 9. A first plan without acc-ops answered `possible:false` and named `group/acc-ops` for `--allow-delete`.
