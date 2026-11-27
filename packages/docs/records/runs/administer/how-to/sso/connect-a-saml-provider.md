# Run log: administer/how-to/sso/connect-a-saml-provider.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Connect a provider**, **Protocol** SAML 2.0, **Name** "Acme Keycloak SAML", **Metadata address** `http://localhost:8180/realms/acme/protocol/saml/descriptor`. **Connect** opened the provider with the sign-in address and certificate read from the metadata.
2. **Set up** showed **Reply address (ACS)** `<instance>/api/v1/sso/<id>/acs`, **Entity ID (audience)** and **Metadata address** (the same address), and **Sign-in address**.
3. At Keycloak a SAML client was made by sending the instance's metadata to its client-description converter, with a persistent name ID and mappers for email, name and groups. The metadata (`AuthnRequestsSigned="true"`, a signing certificate) was accepted as it stood.
4. **Try signing in**, signing in as `ada`: "The provider answered", and **Show the result**: Subject `G-0aea7499-...` (Keycloak's persistent name ID), Email ada@acme.example, Email verified Not said, Name Ada, Groups finance. The result said "did not pass. The domain of ada@acme.example has not been proved for this provider."
5. **Settings** showed every field the page lists: Name, Sign-in address, Provider's entity ID, Signing certificates, Name ID format (five choices), What must be signed (four), Sign the requests sent to the provider, Ask the provider to encrypt assertions, Accept SHA-1 signatures, Accept sign-ins the provider begins, Which claims to read, Create people the first time they sign in, Role given to a new member.

## What the run could not do
- Turning a member's provider on needs a proved domain: not possible here (see the OIDC page).
- Encryption, SHA-1 and provider-begun sign-ins were not tried. The audit-log claim for the last two is from the code.
- Name ID format was left at "Not asked"; Keycloak sent a persistent id anyway. **Transient** was not tried.

## The page got wrong (and was corrected)
- A first draft told the reader to choose **Persistent** in every case. The run shows that with **Not asked** the provider chooses, and Keycloak sent a persistent one; the page says to choose **Persistent** if the provider can send one.
