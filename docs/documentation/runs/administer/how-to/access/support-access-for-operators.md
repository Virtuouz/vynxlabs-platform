# Run: administer/how-to/access/support-access-for-operators

Instance http://localhost:8091 (Fernhill seeded), tenant `acc-main` made by the operator for this run; members acc-ann and acc-bob (tenant admins), acc-cy (viewer); commit 5ebf1c80 plus the working tree; 2026-11-23. Browser: Playwright, headless, 1440 px, light, signed in as acc-ann for the screens named; the rest through the API with the same session cookies. Not done: 768 and 390 px, dark, keyboard, reload.

As the operator: opened two grants on acc-main (viewer, then tenant_admin, 240 minutes) with the reason "Docs run: acc pages": 201 each. The tenant page strip and End access were not driven.

Second check, 2026-11-23, by a second agent. Instance http://localhost:8091 (Fernhill seeded), tenant `acc2-main` made for this check (members acc2-ann and acc2-bob, tenant admins; acc2-cy, viewer; workspace `acc2-dev`), commit 5ebf1c80 plus the working tree. Playwright, headless, signed in as acc2-ann. Walked at 1440 px light, then the screen at 390 px light and at 1440 px dark: no horizontal overflow, controls reachable, nothing cut off. Not done: 768 px, keyboard-only, reload on every screen. Drove both sides in the browser (see the operator-access screen log): the operator's dialog, strip, **Hide**, the header mark and its menu, and the tenant admin's list and **End access**.
