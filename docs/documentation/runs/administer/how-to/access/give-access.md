# Run: administer/how-to/access/give-access

Instance http://localhost:8091 (Fernhill seeded), tenant `acc-main` made by the operator for this run; members acc-ann and acc-bob (tenant admins), acc-cy (viewer); commit 5ebf1c80 plus the working tree; 2026-11-23. Browser: Playwright, headless, 1440 px, light, signed in as acc-ann for the screens named; the rest through the API with the same session cookies. Not done: 768 and 390 px, dark, keyboard, reload.

Gave acc-cy `acc_reader` (member, direct) and Acc Finance `acc_reader` (group) through `POST /bindings`. The Give access sheet opened in the browser with Who, Where, Role and the Give access button. The steps through the sheet's choices (What, Anyone) were not clicked through; `end_users` and `anonymous` bindings were made through the API and applied at once.
