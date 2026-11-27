# Fact-check record: self-host/reference/console/operators

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title and description | `apps/console/src/screens/Instance.tsx:191` | writer, run | |
| Columns Member (Disabled tag), Role, Since | `apps/console/src/screens/Instance.tsx:188` | writer, run | |
| Add operator: Member picker, placeholder | `apps/console/src/screens/Instance.tsx:217` | writer, run | |
| Empty submit gives the server's text | `apps/control-plane/src/routes/identity.ts:1147` | writer, run | |
| Remove confirmation | `apps/console/src/screens/Instance.tsx:239` | writer, run | |
| Remove yourself confirmation | `apps/console/src/screens/Instance.tsx:239` | writer, run | |
| Last operator refusal text | `apps/control-plane/src/kernel/administer.ts:101` | writer, run | |
| Last-operator guard also stops SCIM disable | `apps/control-plane/src/kernel/sso/scim.ts:558` | writer, code | |
| Only operator_admin can be bound at the instance | `apps/control-plane/src/routes/identity.ts:1208` | writer, code | |
| Disabled account cannot be made operator | `apps/control-plane/src/routes/identity.ts:1219` | writer, code | |
| Removing a binding ends the operator's grants | `apps/control-plane/src/routes/identity.ts:8` | writer, code | |
| operator_admin permissions | `packages/db/migrations/0005_permissions.sql:20` | writer, code | |
| Permissions binding:read / binding:write | `apps/control-plane/src/routes/identity.ts:1191` | writer, code | |
| Roles and permissions line | `apps/console/src/kit/Can.tsx:231` | writer, code | |

Checked by: second agent, 2026-11-23. Instance http://localhost:8091 as the operator `admin@example.com`, Playwright headless: 1440 px light (text of every screen compared with the page), 390 px dark (no horizontal scroll on any instance screen; keyboard Tab order reaches the page's controls with a visible focus ring on each), and the controls named below. Tenants, members, a database and a database location made for the check were deleted afterwards (`instance-chk2`, `instance-chk3`, `inst-chk-db`, the throwaway database `instchk_loc`); the member `inst-chk@example.com` stays (a member cannot be deleted). Run: **Add operator** dialog (Member field, "Showing the first of many. Type to search."), **Add operator** with nothing chosen (shows "The request body is not valid. must have required property 'memberId'"), adding `inst-chk@example.com` and **Remove** ("Remove EMAIL as an operator?", dialog title "Remove?"), **Remove yourself** shown on the own row. Not run: removing the last operator who can sign in (the instance has several now). The description is folded behind **About Operators**. fault fixed (fb 4): Add operator with nobody chosen is refused at the field, "Choose one." (ListScreen.tsx:246), confirmed in the code; the page says so.
