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

## Second check, 2026-11-23 (second agent)
- Run now, against the dev Keycloak, realm `acme`: a try passed. A new active RSA key was added to the realm (priority 200). A try then did not pass: "Invalid signature" (reason `invalid_answer`). **Read the metadata** from the descriptor address ("Read the metadata again?" dialog) put two certificates in **Signing certificates**. A try passed the signature (it stopped at the domain, which was not proved then). The old certificate was removed by hand and saved: a try still passed the signature. The new key was left in the realm.
- The page got wrong: the failure row said only "The identity provider's answer could not be accepted." The console's try says "did not pass" with "Invalid signature"; the sign-in screen has the first words. Both are on the page.
- Still not run: a changed entity ID and its dialog; more than 10 certificates (from `providers.ts:398`).
