# Run log: self-host/how-to/sso/connect-an-identity-provider-for-operators.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
Through the API the screen uses, on the instance's own provider (and deleted afterwards):
1. **Instance > Single sign-on** showed "Identity providers for the people who run this instance. A tenant connects its own under its settings.", "No identity providers", **Connect a provider**.
2. An OIDC provider "sso-wave operators" for `http://localhost:8180/realms/acme` was made (no `audience` choice), and the domain `acme.example` added: the answer had `verified: true`, no record: "Proved" at once.
3. **Turn on** was accepted without a domain proof. **Require it** was accepted and lifted again at once.
4. In a new browser, the provider's sign-in address `/api/v1/sso/<id>/start`, signing in at Keycloak as `ada`: the console's sign-in screen came back with "There is no account here for you yet. Ask your administrator for one."
5. The provider was turned off and deleted.

## What the run could not do
- The screen was seen empty only; the sheet and the tabs of an instance provider were not walked in a browser. The differences in the table of the screen page are from the code.
- Creating people on first sign-in (and that they have no access) was not run.
- That an enabled operator admin keeps a password after **Require it** was not tried.
