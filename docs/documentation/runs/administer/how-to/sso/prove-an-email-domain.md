# Run log: administer/how-to/sso/prove-an-email-domain.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Domains** tab of the member provider, **Email domain** `acme.example`, **Add domain**: the domain showed "Not proved" with **Record name** `_vx-challenge.acme.example` and **Record value** `vx-domain=bf44e107...` (40 hex), each with a copy button.
2. **Check now**: the notice "No TXT record _vx-challenge.acme.example with the value vx-domain=... was found." stayed under the domain.

## What the run could not do
- **The record could not be created**: there is no DNS zone here. So "Proved", "record gone", removing a proved domain, and "Another provider of members has already proved <domain>" were not run. Their text is from the code.
- The same domain on the operators' provider (instance) shows "Proved" at once; that was run on the instance page: see the operators' page.
