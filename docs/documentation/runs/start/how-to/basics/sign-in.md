# Run log: start/how-to/basics/sign-in.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-24. Playwright, headless Chromium.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) at 390 px (phone) and 1440 px, light. No dark theme, 768 px or keyboard-only pass was run.
- The steps were run in pieces, then the page was written from what was seen. A single end-to-end run of the finished text was not made.

## The steps as followed
- Opened `/`: card **Sign in**, steps "Email" and "How you sign in", the line "We check which ways of signing in your address has. Nothing is sent to you yet.", and the host line `localhost:8091`.
- Email `maya.brooks@fernhill.example` and **Continue**: step 2 showed the address with **Change**, **Password**, **Sign in** and "Use the account your administrator created for you, or your organization's sign-in." No provider button.
- Wrong password: "That email and password do not match an account." (390 px). **Show what you typed** turned the field to text and the button to **Hide what you typed**. **Change** went back to the empty email step.
- An address with no account (`nobody@nowhere.example`) also went on to the password step: the check does not tell whether the person exists.
- Right password: the console opened on the last workspace overview Maya had been in (a workspace of another run), not on the tenant list, as the page says.
- Operator `admin@example.com`: opened on the last tenant they are a member of; **Instance** in the rail went to the tenant list.
- Phone: **Open the menu**, the account button in the drawer, **Sign out**: the sign-in card came back.
- 1440 px: with an unsaved edit on Branding, **Sign out** asked "Leave without saving? Your changes to this tenant's branding are not saved." with **Stay** and **Leave**; **Stay** kept the page.

## The page got wrong (and was corrected)
- The first draft put **Make a password reset link** "on the member's page"; it is in the member inspector under **Members & access** (code).

## Not run
- A provider's sign-in, a recovery code and a required single sign-on: the instance has none set up.
- A password reset link: the instance sends no mail and the link was not opened. The refusal for a provider-only member was read in code.
- "You could not be signed out" and the **Your session ended** card.
- `recover-operator`.
