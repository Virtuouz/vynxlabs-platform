# Run log: administer/how-to/sso/connect-an-oidc-provider.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Tenant > Single sign-on > Connect a provider**: for **Members**, **OpenID Connect (OIDC)**, **Name** "Acme Keycloak", **Issuer** `http://localhost:8180/realms/acme`, **Client ID** `sso-docs-oidc`, **Client secret**. **Connect** opened the provider, state Off, "OIDC, for members", the steps bar at "Enter the addresses, then try it".
2. **Set up** showed **Redirect address** `<instance>/api/v1/sso/<id>/callback` and **Sign-in address** `<instance>/api/v1/sso/<id>/start`. The redirect address was added to my Keycloak client.
3. **Try signing in** opened a tab at Keycloak's `/auth` with `scope=openid email profile`, `code_challenge_method=S256`. After signing in as `ada` the tab showed "The provider answered / Close this tab and look at the result in the console." **Show the result** gave: "The last try, 14:23:56, did not pass. The domain of ada@acme.example has not been proved for this provider." with Subject `4067a663-...`, Email ada@acme.example, Email verified Yes, Name Ada Lovelace, Groups finance, Attributes None mapped.
4. **Domains**: **Add domain** `acme.example` gave "Not proved", **Record name** `_vx-challenge.acme.example`, **Record value** `vx-domain=` and 40 hex. **Check now**: "No TXT record _vx-challenge.acme.example with the value vx-domain=... was found."
5. **Turn on** (by API, to read the text): 409 `domain_needed`, "Prove at least one email domain before turning this provider on. Members are signed in only by an email in a domain the provider has proved."
6. The same steps for **End users** (provider "Acme Keycloak portal", made through the API with the same fields the sheet sends; then **Groups** and **Settings** in the console): the **Groups** tab saved a mapping `finance` to the end-user group `sso-finance` ("1 mapped"), **Create people the first time they sign in** was checked and saved, **Turn on** made the provider On. At `/portal/sso-wave/` the sign-in page showed a "Sign in with Acme Keycloak portal" button; signing in at Keycloak as `ada` returned to the portal: "Signed in as ada@acme.example." The provider's **People** tab listed Ada Lovelace with her subject, and the group `sso-finance` had 1 member.
7. **Read the metadata again** and the other SAML/OIDC options: see their pages.

## What the run could not do
- **A member's provider could not be turned on**: a domain of members needs a DNS TXT record, and no DNS the instance reaches can carry one here. So the page's step 8 and 9 for members were not run to the end; the end-user provider ran end to end.
- The walkthroughs of Microsoft Entra ID, Okta and Google Workspace were not run (no such provider offline), and the page describes none of their screens.
- A public client (no secret) and **Remove the stored client secret** were not run.
- A private issuer refused for want of `EGRESS_ALLOW`: not run; this instance allows loopback.

## The page got wrong (and was corrected)
- It first said nothing about a try that reads everything right and still says "did not pass" because the domain is not proved. The run showed it, and the page now says so under "What a try tells you".
