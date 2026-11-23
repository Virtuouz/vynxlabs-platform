# Run log: administer/how-to/sso/provision-people-with-scim.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Provisioning** tab of the end-user provider: **SCIM base address** `<instance>/api/v1/scim/v2/<provider id>`, "No tokens yet / Nothing can be pushed until the provider has a token."
2. A token was made through the API the dialog uses (`expiresInDays` 30). The prefix was `vxp_`. Pushes from `curl` with it: `POST /Users` with `userName` ben@acme.example, `externalId`, name and `emails` made the end user; `GET /Users?filter=userName eq "ben@acme.example"` found him; `filter=userName co "ben"` gave 400 `invalidFilter`, "Only these filters are understood: userName eq "…", externalId eq "…"."; `POST /Bulk` gave 404; `GET /ServiceProviderConfig` said patch yes, bulk no, filter maxResults 200, changePassword, sort and etag no.
3. `PATCH /Users/<id>` with `active: false` made him turned off. `POST /Users` with only a `userName` that is no email gave 400 "A user needs an email address: a work email, or a userName that is one." It showed under **Refused pushes** with Push `POST Users`, Answer 400.
4. **What has been pushed** and **People pushed** showed the one person as "Turned off"; **How pushes are taken** showed the three choices for the name.
5. A second token was made to push the second time; the first was left in place.

## What the run could not do
- The token dialog and **Revoke** were not driven in the console, only the API behind them; the texts are from the code.
- Groups pushed, a hand-made group refused with 409, a member provider's push, the tie by `externalId`, and the paused-provider 403 were not run.
- Keycloak has no SCIM sender, so the pushes were sent by hand.

## Second check, 2026-11-23 (second agent)
- Run now with curl against the end-users provider `Acme Keycloak portal`, with a token made for it: a wrong token, 401; `ServiceProviderConfig`; a user created (201) and found by `userName eq`; a filter with `co`: 400 with the page's message; no email: 400 with the page's message; `count=500` returns at most 200; a second user with the same external ID: 409 `uniqueness`; a group created with that user as a member; `active: false` by PATCH; `Bulk`: 404; the provider paused (set in the database): 403 with the page's words; a user and a group deleted (204).
- Not run: a push to a provider of members, the tie by `externalId` to a sign-in, a push for a person who runs the instance.
