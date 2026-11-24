# Run log: administer/how-to/sso/require-single-sign-on.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
Run on the end-user provider, which can be turned on here.
1. With the provider On, **Require it** opened "Require single sign-on?" with the end-user sentence: "End users this provider covers can no longer sign in with a password: those in its proved domains, or everyone when it has none. Their open sessions end now." **Require it**: the header showed On and the tag **REQUIRED**, and the buttons **Stop requiring it** and **Turn off**.
2. **Stop requiring it** opened "Stop requiring single sign-on?" "The end users this provider covers can use a password again." Confirmed.
3. **Turn off** opened "Turn off Acme Keycloak portal?" with: "Nobody signs in through it until it is turned on again. It has no domain, so it signs in every end user of this tenant. Those end users can still use a password. Anyone who has no password needs one, or another provider, to get in. A directory that pushes people to it keeps pushing while it is off." Confirmed, then **Turn on** again.

## What the run could not do
- **Members**: a provider of members cannot be turned on here, so the member dialog, the recovery-code notice, the end of sessions, the operator's password and a recovery-code sign-in were not run. They are from the code.
- Recovery codes (**Account**) were not made.
- On the instance's provider (made through the API for acme.example) requiring was set and then lifted through the API; that an operator keeps a password was not tried by signing in.

## Second check, 2026-11-23 (second agent)
- Run now at 390 px in dark: a members' SAML provider (Keycloak) with a domain marked proved in the database (no DNS here), **Turn on**, then the reminder "Before you require single sign-on, owners should generate recovery codes in Account...", **Require it** with its dialog (it also says the operators keep their passwords and sessions), the tag **Required**, **Stop requiring it** with its own confirmation and "Passwords are allowed again."
- Run now: **Account**, **Make recovery codes**: ten codes in a list, **Copy all**, "Copy these codes now. They are not shown again.", **I have kept them**; **Make new codes** asks "Make new recovery codes?".
- The page got wrong: it did not say the stop is confirmed or that the dialog names the operators; added.
- Still not run: signing in with a recovery code (needs a second owner with a password), a member's open sessions ending, and the audit entry's count. The operator's password was not tried.
