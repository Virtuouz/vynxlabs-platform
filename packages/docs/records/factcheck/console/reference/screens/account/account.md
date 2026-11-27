# Fact-check: console/reference/screens/account/account

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| API key shown once in a dialog | `apps/console/src/screens/Account.tsx`; run | second agent, 2026-11-23 | corrected: a notice above the table |
| Recovery codes shown to 'a tenant's owner' | `apps/control-plane/src/kernel/sso/recovery.ts:62-73` | second agent, 2026-11-23 | corrected: a member holding `tenant_admin` at the tenant by their own binding; 10 codes; seen for a tenant admin, not for a viewer |
| Password field errors live; button off; texts | `Account.tsx:225-262` | second agent, 2026-11-23 | corrected and confirmed |
| Sessions End, End other sessions, Revoke dialogs | `Account.tsx:395-445` | second agent, 2026-11-23 | holds; run |
