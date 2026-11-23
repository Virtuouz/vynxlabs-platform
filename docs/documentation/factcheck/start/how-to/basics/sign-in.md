# Fact-check record: start/how-to/basics/sign-in.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks, 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The card is titled Sign in with the steps Email and How you sign in; Continue reads "Checking…" while it asks. | `screens/SignIn.tsx:97-125,234`; run | writer, run | holds as run |
| The check is by the address's domain and says nothing of whether the person exists. | `apps/control-plane/src/routes/sso.ts:851-877` | writer | holds |
| A failed check says "We could not check how this address signs in. {reason} Press Continue to try again." | `screens/SignIn.tsx:138` | writer | holds (not run) |
| Password, eye button "Show what you typed"/"Hide what you typed"; "Sign in", or "Sign in with a password" beside a provider. | `screens/SignIn.tsx:202,247`; run | writer, run | holds as run |
| A provider button "Sign in with {name}" carries the page's address back. | `screens/SignIn.tsx:73-75` | writer | holds (not run: no provider on the instance) |
| Change goes back to the email step and forgets password and code. | `screens/SignIn.tsx:160-170`; run | writer, run | holds as run |
| Opening the root address returns to the last workspace overview or tenant, on opening only. | `App.tsx:105-135`; run (Maya landed in her last workspace) | writer, run | holds as run |
| Account menu: Sign out; asks "Leave without saving?" with Stay and Leave first. | `Shell.tsx:701`, `ask.tsx:25-31`, `App.tsx:177-190`; run (Branding with an edit) | writer, run | holds as run |
| A failed sign-out says "You could not be signed out. Check your connection and try again." and stays signed in. | `App.tsx:187` | writer | holds (not run) |
| Signing out clears this browser's settings, pins and reads; the instance keeps the settings. | `clearSession.ts:9-19`; `prefs.ts` (settings are sent to the instance) | writer | holds |
| A reset link is made by a tenant admin with `member:write` under Members & access, for a member of that tenant and no other; by an operator in All members. | `kit/MemberResetLink.tsx:16-62`; `screens/Members.tsx:336-340`; `screens/Instance.tsx:37-41`; `apps/control-plane/src/routes/member-resets.ts:48-92` | writer | holds (not run: the instance sends no mail and the link was not opened) |
| The link works once, runs out in 2 hours, ends other sign-ins; set with at least 12 characters; "Set password". | `kit/MemberResetLink.tsx:35`; `screens/ResetPassword.tsx:55-135`; `apps/control-plane/src/config.ts:122` | writer | holds (not run) |
| Refused for a member who signs in only through an identity provider. | `routes/member-resets.ts:53,83` | writer | holds |
| `recover-operator <email>` enables the account, makes it operator admin, prints a new password once. | `apps/control-plane/src/commands.ts:30` | writer | holds |
| "Your organization requires its own sign-in. There is no password to enter here."; Use a recovery code; Back to your organization's sign-in; Sign in with the recovery code. | `screens/SignIn.tsx:228,238,260` | writer | holds (not run: needs SSO required) |
| A recovery code works once and is spent by a wrong password too; 10 codes like `k3x9q-7mzt2`; only a `tenant_admin` can make them. | `kernel/sso/recovery.ts:6,14-19,62-73`; `kernel/auth.ts:276-291`; `routes/identity.ts:595-620` | writer | holds |
| Session 7 days; password at least 12; 20 attempts a minute from one address. | `config.ts:122,125`; `kernel/auth.ts:24,98` | writer | holds |
| "That email and password do not match an account." for a wrong password, no account or an account turned off. | `screens/SignIn.tsx:142`; `kernel/auth.ts:255-272`; run (wrong password) | writer, run | holds as run |
| "That recovery code is not right, or was already used. Each code works once." | `screens/SignIn.tsx:144` | writer | holds (not run) |
| Your session ended card; the page keeps what you typed. | `SessionSheet.tsx:64-120` | writer | holds (not run) |
