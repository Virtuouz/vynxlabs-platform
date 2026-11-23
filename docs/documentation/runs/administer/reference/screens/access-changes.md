# Run: administer/reference/screens/access-changes

Instance http://localhost:8091 (Fernhill seeded), tenant `acc-main` made by the operator for this run; members acc-ann and acc-bob (tenant admins), acc-cy (viewer); commit 5ebf1c80 plus the working tree; 2026-11-23. Browser: Playwright, headless, 1440 px, light, signed in as acc-ann for the screens named; the rest through the API with the same session cookies. Not done: 768 and 390 px, dark, keyboard, reload.

Walked the Access changes tab as acc-ann: columns #, What, Status, By, When; statuses Applied, Withdrawn, Superseded (with its quoted comment); the By cell reads "In the console, answered by <name>"; Go back to this on applied rows; the header button Ask for a second person.

Second check, 2026-11-23, by a second agent. Instance http://localhost:8091, tenant `acc2-main`, signed in as acc2-ann, Playwright headless; 1440 px light, then the screen at 390 px light and 1440 px dark: no horizontal overflow. Not done: 768 px, keyboard-only, reload. Drove the tab in the browser: the list (number, What, Status, By, When), **Ask for a second person**, a waiting change ("Waits for approval", "You asked for this. Someone else approves it.", **Withdraw** and its dialog), **Stop asking for a second person**, **Go back to this** and its dialog. Approve and Decline were run through the API in the first run, not in the browser.
