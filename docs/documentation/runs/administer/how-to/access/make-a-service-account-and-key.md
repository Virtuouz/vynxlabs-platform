# Run: administer/how-to/access/make-a-service-account-and-key

Instance http://localhost:8091 (Fernhill seeded), tenant `acc-main` made by the operator for this run; members acc-ann and acc-bob (tenant admins), acc-cy (viewer); commit 5ebf1c80 plus the working tree; 2026-11-23. Browser: Playwright, headless, 1440 px, light, signed in as acc-ann for the screens named; the rest through the API with the same session cookies. Not done: 768 and 390 px, dark, keyboard, reload.

Made service account acc-agent and a key with a 90-day expiry (`expiresAt` 2027-02-21): the answer has prefix `vxk_`, suffix, `expiresAt`, and the token once. Revoke and the console dialogs were not driven.
