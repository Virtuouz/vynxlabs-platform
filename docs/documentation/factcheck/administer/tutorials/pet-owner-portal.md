# Fact-check record: administer/tutorials/pet-owner-portal

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| End users is a Tenant screen; **Invite an end user**; columns Email, Name, Status, Groups, Last signed in | `apps/console/src/screens/EndUsers.tsx`, run | writer, run | holds |
| The invitation link opens `/portal/<slug>/set-password?token=`, works once, is shown once | `EndUsers.tsx`, `Branding.tsx:553`, run | writer, run | holds |
| An end user signs in at `/portal/<slug>/sign-in` | run | writer, run | holds |
| **Attributes**: name/value pairs, names lowercase letters, digits, underscores | `EndUsers.tsx`, run | writer, run | holds |
| The invoices table's rule: client_id equals client_code | `examples/fernhill/src/model.ts:146-149`, run | writer, run | holds |
| "My Fernhill account" is open to every end user and App Builder-made | Apps list row, run | writer, run | holds |
| Changing the attribute changes the rows the app shows | run | writer, run | holds |
| Inviting needs the tenant admin role | `packages/docs/generated` permissions | writer | not looked up |
