# Run log: administer/how-to/sso/map-claims-and-groups.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. The result of a try (see the OIDC page) shows Groups `finance` and Attributes "None mapped".
2. On the end-user provider: **Groups > Add a mapping**, **Group at the provider** `finance`, **Group here** `sso-finance` (found by typing in the box), **Save**. The steps bar read "1 mapped". After ada signed in through the portal, the end-user group `sso-finance` had 1 member.
3. **Settings** showed the four claim fields with the usual names as placeholders, and for an end-user provider **Attributes** with the placeholder `customer_id = customerId` and **Take the provider's word on emails**.

## What the run could not do
- A mapping that removes a person from a group (a group named by the provider no longer) was not run.
- `*` was not tried. A half-filled row ("Row N is not complete") and a bad **Attributes** line were not tried; the texts are from the code.
- Dotted claim names were not tried against a nested claim.
- The access-change rows were not run (no repository in this tenant).
- "Also read the user-info address" was not tried.

## Second check, 2026-11-23 (second agent)
- Not run again: a mapping that removes a person from a group, and the access-change rows (no repository). The limits (1,000 groups of up to 500 characters, 50 attributes, 20 scopes) were matched to `claims.ts:31`, `providers.ts:327` and `providers.ts:365`.
