# Run log: administer/how-to/sso/replace-a-saml-certificate.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Settings** of the SAML provider. **Signing certificates** held one certificate (960 characters).
2. **Metadata address** under **Read the metadata again**, `http://localhost:8180/realms/acme/protocol/saml/descriptor`; **Read the metadata** opened "Read the metadata again?" with the sentence the page quotes; confirming gave "The metadata was read. The sign-in address and certificates are as it says." The certificate, the entity ID `http://localhost:8180/realms/acme` and the sign-in address `http://localhost:8180/realms/acme/protocol/saml` were as before.
3. By hand: the same certificate typed twice in **Signing certificates**, **Save**: "The provider was saved." Then back to one, saved.

## What the run could not do
- A real change of certificate was not made: Keycloak's realm key was not rotated, so "reading it again" returned what was there. That a sign-in signed by the old or the new certificate passes was not tried.
- A changed entity ID, with its dialog and the removal of ties, was not run; the page's sentence is from the code and the audit action name.
- The limit of 10 certificates was not tried.
