# Run log: administer/how-to/sso/serve-an-app-on-your-own-hostname.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Tenant > Domains > Add a hostname**: **Workspace** `sso-dev`, **Serves** "The portal, and every app by its path", **Hostname** `portal.sso-wave.example`, **Add hostname**. The sheet opened: off, Not verified, **What it serves**, **1 · Point the name here**, **2 · Show the name agrees** with **Record name** `_vx-challenge.portal.sso-wave.example` and **Record value** `vx-domain=036872bf...`, **3 · Check and enable**.
2. **Check now**: "No TXT record _vx-challenge.portal.sso-wave.example with the value vx-domain=... was found." The list row read "On / Not verified" after the next step.
3. **Enable** as the operator admin (who holds `instance:write`): accepted. The sheet said Enabled "Serving." although the name was not verified. **Disable** put it back to off (through the API).
4. "One app, at the hostname's root" with "This workspace has no apps. Deploy one first, or choose another workspace." was seen on the sheet before choosing the portal.

## What the run could not do
- **The TXT record could not be created**, so **verified**, "Passed <time>", "Verified, record gone" and enabling by a person without `instance:write` ("This hostname is not verified yet...") were not run. The refusal text is from the code.
- **Change what it serves**, **Remove**, and the confirmation dialogs of **Disable** and **Remove** were not run in the console.
- No request was sent with the name in a Host header, so "not served here" and the 30 seconds were not run.
- The page assumes someone else holds the certificate and DNS; none was set up.

## The page got wrong (and was corrected)
- A first draft said **Enable** is refused for any name that is not verified. As an operator it was accepted; the page now says an operator may, and a tenant admin may not.
