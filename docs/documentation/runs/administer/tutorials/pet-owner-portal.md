# Run log: administer/tutorials/pet-owner-portal

- Instance `http://localhost:8091`, commit `5ebf1c80`, 2026-11-23. Maya Brooks in the console (1440 x 900); the end user `tut.owner@example.com` in a 390 x 844 context. Fernhill Sandbox. Playwright headless, light.
- **Rework from the brief.** The brief had the tutorial on Fernhill's front-desk end-user groups, `fernhill.localhost:8080` and Omar and Northside. Not used: those end users' passwords are not the seeded ones for new people and the pet portal app (repository app) is not served on this instance (it needs `APPS_URL`). The tutorial uses a new end user and the App Builder app **My Fernhill account**, which is served.
- Steps run in scripts in the page's order. A second invited user (`tut.owner2`) was made to see the app before an attribute is set; the script failed on opening its row, so only **My details** was observed before an attribute (see below).

## Seen

1. `/t/<tenant>/end-users`: "The people who sign in to this tenant's portal and apps: the client's own customers. They belong to this tenant alone, separate from members, and never see the console." Columns Email, Name, Status, Groups, Last signed in; the seeded Jess Morgan, Omar Haddad, Lena Fischer (groups FRONT DESK and a clinic), and owners at `example.net`.
2. Dialog "Invite an end user / They get a link to choose their password. Inviting gives no access by itself: open an app to them under Access or in the repository." Fields Email, Name (optional), "On which address" (This instance's own address, fernhill.localhost). Button **Invite an end user**.
3. Dialog "Invitation link / Whoever opens it chooses the password for tut.owner@example.com." with `http://localhost:8091/portal/fernhill/set-password?token=…`, **Copy link**, "It was also emailed to them. It works once, until 2026-11-30 15:29:17. It is not shown again here: make a new one if it is lost." **Done**.
4. The link opened "Fernhill Veterinary Group / Welcome / Choose a password for tut.owner@example.com. / Password / Save and sign in". After it: `/portal/fernhill/` with "Apps / My Fernhill account / Your pets, your invoices, and asking for a visit. / Signed in as tut.owner@example.com. / Sign out".
5. `/apps/fernhill/sandbox/my-account/`: menu My details, My pets, My invoices; My details "Your details / There is nothing here for you yet."
6. End user panel: Name, Status, Last signed in, Added, Groups None, "ATTRIBUTES / None. A table's rules can match facts such as which customer they belong to.", buttons Rename, Attributes, Password reset link, Disable, Delete. **Attributes** dialog: "Facts about this person that a table's rules can match, such as which customer they belong to.", Name/Value rows, **Remove**, **Add an attribute**, "Names are lowercase letters, digits and underscores.", **Cancel**, **Save**. After `client_id` = `C-1001`: "ATTRIBUTES / client_id / C-1001".
7. My pets: Pepper (Cat), Shadow (Cat), Willow (Dog), each with **Request an appointment**; "Visits you have asked for / There is nothing here yet." My invoices: a list with number, clinic, date, amount, Paid/Unpaid (INV-11754 ... and `TUT-001` from another tutorial).
8. Tables > invoices > Definition: "Who sees rows / By 2 rules. / People in the group named in clinic may read the row. / People whose client_id is in client_code may read the row. / See it as ... / See it as a group ..."
9. `client_id` = `C-1005`: My pets Kiwi (Bird), Rosie (Dog); My invoices a different list, with no `TUT-001`.
- Signing in later: `/portal/fernhill/` has a **Sign in** link to `/portal/fernhill/sign-in` (Email, Password, **Sign in**).

## Not run
My pets and My invoices before an attribute is set (the second user's attempt failed); **Password reset link**; **See it as**; the repository-only pet portal app; a real phone; 768 px; dark; keyboard-only.

## Second check, 2026-11-23 (second agent)
Steps 1 to 9 in one pass on the current build, owner window 390 x 844 in dark (no overflow). The owner's pass before an attribute was seen (**My details**). Not run: **Password reset link**.
