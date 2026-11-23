# Fact-check record: self-host/reference/console/members

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title and description | `apps/console/src/screens/Instance.tsx:94` | writer, run | |
| Columns Name, Email, Tenants, State, Created | `apps/console/src/screens/Instance.tsx:118` | writer, run | |
| Tenants 'None' | `apps/console/src/screens/Instance.tsx:124` | writer, run | |
| State Disabled tag or Active pill | `apps/console/src/screens/Instance.tsx:130` | writer, run | |
| Inspector fields and words | `apps/console/src/screens/Instance.tsx:169` | writer, run | |
| Create member description and field hint | `apps/console/src/screens/Instance.tsx:141` | writer, run | |
| Password at least 12; 'Use at least 12 characters.' | `apps/control-plane/src/config.ts:122` | writer, run | |
| Duplicate email refused 'A member with that email already exists.' | `apps/control-plane/src/kernel/members.ts:26` | writer, run | |
| Own row texts | `apps/console/src/screens/Instance.tsx:52` | writer, run | |
| Own row: Change your own password on the Account screen. | `apps/console/src/screens/Instance.tsx:34` | writer, run | |
| Disable confirmation text | `apps/console/src/screens/Instance.tsx:62` | writer, run | |
| Disable toast and tenants without admin message | `apps/console/src/screens/Instance.tsx:76` | writer, code | |
| Enable asks nothing | `apps/console/src/screens/Instance.tsx:59` | writer, run | |
| Reset link confirmation text and button | `apps/console/src/kit/MemberResetLink.tsx:34` | writer, run | |
| Reset link: 2 hours | `apps/control-plane/src/kernel/member-reset.ts:11` | writer, code | |
| Reset link emailed where mail is configured; else shown once | `apps/control-plane/src/routes/member-resets.ts:42` | writer, run (mail captured to files: 'It was emailed to') | |
| Reset dialog texts | `apps/console/src/kit/MemberResetLink.tsx:70` | writer, code | |
| Refused for a provider with passwords off | `apps/control-plane/src/kernel/member-reset.ts:82` | writer, code | |
| Refused for a disabled member | `apps/control-plane/src/kernel/member-reset.ts:58` | writer, code | |
| A link made before stops working | `apps/control-plane/src/kernel/member-reset.ts:86` | writer, code | |
| Audit member.password_link_created, never the token | `apps/control-plane/src/kernel/member-reset.ts:96` | writer, code | |
| member.disabled / member.enabled audit | `apps/control-plane/src/kernel/members.ts:100` | writer, run | |
| Disabling ends sessions and operator grants | `apps/control-plane/src/kernel/members.ts:3` | writer, code | |
| Doing the same twice writes nothing | `apps/control-plane/src/routes/identity.ts:1102` | writer, code | |
| Disable refused for own account; last operator guard | `apps/control-plane/src/routes/identity.ts:1100` | writer, code | |
| Permissions member:read list, member:write patch/create | `apps/control-plane/src/routes/identity.ts:1082` | writer, code | |
| Search by name and email, 50 per page | `apps/control-plane/src/routes/identity.ts:1044` | writer, run | |
| Phone layout: Name and State, email under the name | `apps/console/src/screens/Instance.tsx:105` | writer, run (390 px) | |
| Needs line text | `apps/console/src/kit/Can.tsx:187` | writer, code | |
