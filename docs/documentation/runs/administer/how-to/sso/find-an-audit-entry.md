# Run log: administer/how-to/sso/find-an-audit-entry.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Tenant > Audit log**: newest first, "Every change in this tenant, and every request an operator made under an access grant."
2. **Search** "Acme Keycloak": the entries of the three providers' names (created, updated, tested ...). **More filters** showed **Who** "admin@example.com (21)", **Action** (Identity provider updated (6), created (3), Scim token created (2), enabled (2), tested (2), test started (2), enforced (1), disabled (1), enforcement lifted (1), groups mapped (1)) and **Done to** "identity provider (21)".
3. Choosing the row of 14:27:40 opened **Entry details** with When, Who, Action `identity_provider.tested`, Kind identity provider, Name Acme Keycloak SAML, ID, From 127.0.0.1, Request, and Details `{ "ok": false, "name": ..., "reason": "domain_not_proved" }`, with **Everything about this** and **Copy a link to it**.
4. **CSV** downloaded `audit-log.csv`; its header was `occurredAt,action,actorType,actorLabel,actorId,targetType,targetLabel,targetId,workspaceId,accessGrantId,requestId,ipAddress,details` and times like `2026-11-23T21:27:40.252Z`.
5. The **Area** list was long (from **Everything** to **SQL**), and **Since** had the five options.

## What the run could not do
- **Between dates**, **Workspace**, **Columns**, saved views and **Show older entries** were not run. The copy-link toast was not read.
- A link was not opened in another session.
- Search by hostname and by email was not tried separately.
- `sso.refused` was not read: no sign-in was refused through a provider that is on. Its action and fields are from the code.

## Second check, 2026-11-23 (second agent)
- Run now (1440 px, light): **Since** > **Between dates** with **From date** and **To date** (the end before the start gives "The end date is before the start date."); **Workspace** (lists **Every workspace** and `sso-dev`); the **Columns** icon button opens a dialog (Who, What was done, To, **Show every column**, **Done**); the **Saved views** icon button opens **Save this view…** and **Copy a link to this view**; **Show older entries** took the list from 50 to 99 rows. 390 px in dark: no horizontal scroll.
- Not run: saving a view under a name; the copy-link toast.
