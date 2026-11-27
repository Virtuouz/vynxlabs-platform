# Run: administer/reference/screens/access

Instance http://localhost:8091 (Fernhill seeded), tenant `acc-main` made by the operator for this run; members acc-ann and acc-bob (tenant admins), acc-cy (viewer); commit 5ebf1c80 plus the working tree; 2026-11-23. Browser: Playwright, headless, 1440 px, light, signed in as acc-ann for the screens named; the rest through the API with the same session cookies. Not done: 768 and 390 px, dark, keyboard, reload.

Walked the Access tab as acc-ann: filter chips with counts (Everyone 5, Members 4, Groups 1, Service accounts 0, End users 0), columns Who, Role, Where, Remove; Whole tenant shown for tenant bindings.

Second check, 2026-11-23, by a second agent. Instance http://localhost:8091, tenant `acc2-main`, signed in as acc2-ann, Playwright headless; 1440 px light, then the screen at 390 px light and 1440 px dark: no horizontal overflow. Not done: 768 px, keyboard-only, reload. Drove the tab in the browser: the list and its columns (Who with the kind under it, Role, Where, Remove, From repository), **Give access** (Who search with the two fixed choices, Where, Role) for a group and a service account, **Remove** ("Remove the acc2_reader role from <group>?"). Not run: the filter counts for every kind, `?binding=`, a role refused for Anyone.
