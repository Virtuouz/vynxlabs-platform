# Walk w-people (t3-access, t3-account, voc-access)

Instance localhost:8091, tenants `wpeople` and `wpeople-two` (own). Shots: ~/.local/share/volvel-walk/shots29/w-people/.

## Walked and right
- Add member (several roles, Where they work, 12-char refusal), Groups (create, Describe, Sign-in values with repeats dropped, Members, Take out asks first, focus ok), Access (Give access: What, group, duplicate gives one row), Roles dialog (dark), End users (invite link, Rename persists after reload, Disable/Enable, group create), service account (Identity, key Expires), operator access Other minutes (0 and 1441 refused, 90 accepted).
- Access changes: approval on, change from a group waits, `?release=` opens and survives reload, second person approves, Decline asks Why, Stop asking and Go back dialogs read well.
- Account: name saves and survives reload, password (mismatch, wrong current, short, success), sessions (Safari/Chrome listed, End asks, End others asks and the other session got 401, audited), API key with Expires (2027-02-20 for 90 days), What I may do here (Dana).
- No page overflow at 1440/768/390, light/dark, on all screens.

## Wrong
1. Access changes tab is inset 24px (32px at 390) from the sibling tabs, and the description line is missing (1440 light, 390 dark `s-changes-390-dark.png`, `rel-list-1440-light.png`). Cause: `apps/console/src/screens/AccessReleases.tsx:337-341`.
2. Leftover "release": "two people who may release access" `AccessReleases.tsx:357`. Entry text "Makes the access developer to group ..." reads badly (`kernel/describe.ts:57` area).
3. Account 390: API keys table text overlaps (Key over Last used, Revoke cut), `acc-full-390-dark.png`; Sessions at 390 an unknown device string runs into "Signed in", "This ses...", `acc-sessions-390-dark.png`. Cause: `Account.tsx` `keyColumns`, `Sessions`.
4. Account page title and nav say "API keys" but hold Profile, Password, Sessions.
5. After End other sessions focus drops to body (button disables), `Account.tsx` Sessions.
6. Add member: "Where they work" label/select sits lower than Role, hint wraps, Remove wraps at 390 (`add2.png`, `v-addmember-390-dark.png`); password refusal shows raw "must NOT have fewer than 12 characters" plus a generic banner (`add4-short.png`).
7. With approval on, giving a role to a member or "every end user" applied at once and made no access change; a group's waited. Intended? (`routes/permissions.ts` binding create).
8. `/t/<slug>/...` and `/t/<id>/members/groups` say "The request params is not valid."; `?release=x` says nothing.
9. Focus is not trapped in Give access and Create group sheets (Tab reaches the page behind).
10. "You have no access to this tenant" page sits flush left, no padding (`Tenant.tsx:285`); operator minutes refusal says the same thing twice.
11. End user "Added" shows time only, no date.

## Not walked
"On which address" (no enabled domains), provider-made group refusal (no IdP), member without `binding:read`, 768 dark of most screens (768 light only).
