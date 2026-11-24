# Fact-check record: console/reference/screens/account/sign-in.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, 1440 px, light, as Maya Brooks (member) or the operator admin where said.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Two steps, card text, host line. | `screens/SignIn.tsx:97-125,150-160`; run (STEPS "Email / How you sign in", host "localhost:8091") | writer, run | holds as run |
| Email, Continue, "Checking…", step text, failure sentence. | `screens/SignIn.tsx:130-140,234,266`; run | writer, run | holds as run |
| Step 2 controls and when each shows. | `screens/SignIn.tsx:172-262`; run (password step) | writer, run | password step run; provider and recovery from code |
| The three message sentences. | `screens/SignIn.tsx:140-148`; run (wrong password) | writer, run | holds as run for the first |
| Fourteen sso errors and the fallback; removed from the address. | `screens/SignIn.tsx:14-43` | writer | holds |
| 7 days, 12 characters, 20 a minute. | `apps/control-plane/src/config.ts:122,125`; `kernel/auth.ts:24` | writer | holds |
| `return` followed only for `/apps/`, `/portal/`, `/api/v1/app-handoffs/start`. | `App.tsx:31-39` | writer | holds |
| Sign-in only at the main address. | `routes/sso.ts` (`atMain`) | writer | not read for the password route; from the lane note |
| Password link screen texts, 12 characters, 2 hours, who makes it. | `screens/ResetPassword.tsx`; `kit/MemberResetLink.tsx:35`; `routes/member-resets.ts:48-92` | writer | holds (not run) |
| Your session ended dialog and its texts. | `SessionSheet.tsx:64-120` | writer | holds (not run) |

## Second check

Checked by: second agent, 2026-11-23. Every message and control compared with `screens/SignIn.tsx`, `screens/ResetPassword.tsx` and `SessionSheet.tsx`; run on the instance (see the how-to's record): the card with a provider and a password, the recovery form, all four recovery messages, the rate-limit message "Too many requests. Please try again later.", the password link page (heading, hint, the short and mismatch errors, **Set password**, **Your password is set**, **Nothing to set here**), the **Your session ended** dialog and its wrong-password message. The `return` rule (`/apps/`, `/portal/`, `/api/v1/app-handoffs/start`) is `App.tsx:31-41`. Corrections: the rate-limit row now quotes the message; the password link refusal now says it is for a member whose organization requires its own sign-in, with the server's words (409). Not confirmable here: **Sign in with {provider}** to a real provider and the fourteen SSO reasons arriving from one (read in code only).
