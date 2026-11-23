# Inventory: sso branding governance

**Refreshed 2026-11-23** (branch `phase-30-docs-system`, after phase 29). Read from the code as it is now, not from `270e509`; the file was first a report from reading code, and its bug list is now settled.
- Section A is a table: collection, Diátaxis type, purpose, sources. Pages added: SSO metadata and certificates, SSO permissions, SCIM tokens, worker pools, hostnames (verify and serve), audit retention, export format, plus explanation pages. Nothing is gone. Marked "not there": a role for the instance's provider, container sandboxing of workers, legal holds, a certificate service.
- Section B is corrected to the code. Line numbers all moved (`SingleSignOn.tsx` is 1652 lines now). New in the product: Name ID format and "Read the metadata again" (SAML), "Remove the stored client secret", the Sign-in address, a Save bar on Settings, Groups and "How pushes are taken", SCIM token Expires and Status, "Change what it serves", "Verified, record gone", workers' "Runs code of", Worker pool description, an operator lock on the managed-workers switch, an `unavailable` state, the instance audit log's filters, CSV and entry link, read-only notices (`Can`), and paged People lists.
- Section C keeps what is still true and says what phase 29 changed. D and E are settled: each row cites its outcome in `fixed/*.md` or says it is open.
- Not verified: I ran nothing and made no request. The IdP walkthroughs (Keycloak, Entra, Okta, Google) and the limits "10 min / 120 s / 60 s skew / 1 h" are as read, not run. I did not re-read the SCIM filter and deactivation rules line by line (`kernel/sso/scim.ts`), the icon sizes (`routes/icons.ts`), or the DNS check's behavior at a real resolver.

Vocabulary for these pages: Flow, Deploy and Versions, Access changes (the route and slug stay `releases`), Apps, canceled, American spelling (the shipped docs stubs still say "colours": phase 31 fixes that, VOC-31), Volvel. Turn on, Turn off, Require it, Stop requiring it, Untie, Revoke are the buttons' words; take every label from the code.

**Roots**
- `R` = .
- `S` = R/apps/console/src/screens
- `C` = R/apps/control-plane/src
- `D` = R/packages/docs/content

## A. Pages

Collections: **Administer** (a tenant's or the instance's administrator), **Self-host** (an operator on the machine), **Console** (a person using a screen). Today `D` has `tenant/` and `instance/` folders; where they go under the five collections is phase 30's call. The stubs below exist now, each with a topic id the console's Help opens (`R/apps/console/src/nav.ts:196-217`). Add each new page to `pages:` in its folder's `index.md`.

| # | Page | Collection | Type | Purpose | Sources |
|---|---|---|---|---|---|
| 1 | tenant/single-sign-on (stub, `tenant-single-sign-on`) | Administer | explanation | What a provider does, members against end users, off by default, the four steps (Connect, Prove domains, Map groups, Switch on) | S/SingleSignOn.tsx:1316-1360; B "Single sign-on" |
| 2 | tenant/sso-connect | Administer | tutorial | Connect one provider, try it, prove a domain, turn it on; end to end with the Keycloak profile | S/SingleSignOn.tsx:152-450; R/deploy/compose/compose.dev.yaml:40-44 |
| 3 | tenant/sso-oidc | Administer | how-to | Issuer, Client ID, Client secret (or none: a public client), scopes, user-info; walkthroughs for Entra, Okta, Google | S/SingleSignOn.tsx:1100-1160; C/kernel/sso/oidc.ts |
| 4 | tenant/sso-saml | Administer | how-to | Metadata address or pasted metadata; Reply address, Entity ID; signing, encryption, SHA-1, Name ID format | S/SingleSignOn.tsx:1010-1100; C/kernel/sso/saml.ts |
| 5 | tenant/sso-metadata-and-certificates (new) | Administer | how-to | "Read the metadata again"; replacing a signing certificate with both listed; what an entity ID change does to ties | S/SingleSignOn.tsx:880-935, 1010-1060 |
| 6 | tenant/sso-claims-and-groups | Administer | how-to | Claim names, dotted paths, Attributes, Groups tab, `*`, access-change rows read only | S/SingleSignOn.tsx:568-728, 1160-1185; C/kernel/sso/claims.ts |
| 7 | tenant/sso-domains | Administer | how-to | Prove an email domain with a TXT record; check; "Verified, record gone" | S/SingleSignOn.tsx:450-566; C/kernel/apps/challenge.ts:13 |
| 8 | tenant/sso-requiring | Administer | how-to | Require it, what ends (open password sessions), who keeps a password, recovery codes, lockout | S/SingleSignOn.tsx:1388-1430; C/kernel/sso/people.ts:553-600; C/kernel/sso/recovery.ts; S/Account.tsx:94 |
| 9 | tenant/sso-permissions (new) | Administer | reference | `sso:read/write`, the extra rights a default role (`binding:write`) and a group mapping (`group:write`, `end_user_group:write`) need, the read-only notice | R/packages/manifest/src/permissions.ts:180; C/routes/sso.ts; S/kit/Can.tsx |
| 10 | tenant/sso-troubleshooting | Administer | reference | Each refusal reason, in the person's words and the administrator's | C/kernel/sso/people.ts:21-36; S/SignIn.tsx:13-33; C/kernel/sso/flow.ts:461 |
| 11 | tenant/provisioning-scim | Administer | how-to | SCIM base address, token, how pushes are taken, what has been pushed, refused pushes | S/Provisioning.tsx; C/routes/scim.ts; C/kernel/sso/scim.ts |
| 12 | tenant/scim-reference (new) | Administer | reference | Supported filters, paging, limits, deactivation, what a push may not do | C/routes/scim.ts:44, 388, 488-510 |
| 13 | tenant/branding (stub, `tenant-branding`) | Administer | how-to | Portal sign-up switch, logo, theme, contrast, clear back; says it has no tenant "name" | S/Branding.tsx; C/routes/apps.ts:493-600 |
| 14 | tenant/theme-tokens | Administer | reference | The 27 tokens, light and dark, the allowed value shape, the kit's values | S/Branding.tsx:35-125; R/packages/manifest/src/kinds.ts:1302-1309 |
| 15 | tenant/domains (stub, `tenant-domains`) | Administer | how-to | Register a hostname, point it, TXT record, check, enable, change what it serves, disable, remove | S/Domains.tsx; C/routes/apps.ts:895-1000 |
| 16 | tenant/hostnames-explained (new) | Administer | explanation | Why a record proves agreement (one record per tenant and name), why no certificate is issued, what "not served here" means | C/kernel/apps/challenge.ts; C/kernel/apps/hosts.ts:130; D45 |
| 17 | tenant/workers (stub, `tenant-workers`) | Administer | how-to | Queue, pools, credentials, the instance-starts switch | S/Execution.tsx:1146-1560; C/routes/pools.ts |
| 18 | tenant/standalone-workers | Self-host | how-to | Run `volvel-worker` for a pool; `--token-stdin`, `--token-file`; compose | R/packages/worker/src/bin.ts:23-65; R/deploy/worker/compose.yaml |
| 19 | tenant/worker-pools (new) | Administer | explanation | What a pool is, `default`, `worker:` in a script, Runs code of | C/routes/pools.ts; C/kernel/execution/workers.ts |
| 20 | tenant/audit-log (stub, `tenant-audit`) | Administer | how-to | Find an entry, filters, saved views, CSV, link to an entry | S/Audit.tsx; C/routes/identity.ts:1291-1343 |
| 21 | tenant/audit-actions | Administer | reference | Every `action:` string and its area; best generated | `grep 'action: "'` in C; S/Audit.tsx:38-107 |
| 22 | tenant/retention (stub, `tenant-retention`) | Administer | reference | Four periods, defaults, bounds, what shortening removes, the audit log's own rule | S/Retention.tsx; C/config.ts:137-141, 319-323 |
| 23 | tenant/export (stub, `tenant-export`) | Administer | how-to | Export in the console or `volvel tenant export`; passphrase; history | S/Environments.tsx:771; S/Tenant.tsx:455; R/packages/cli/src/commands.ts:168 |
| 24 | tenant/export-format (new) | Administer | reference | Format 2, sealed passwords, what is and is not carried (`notCarried`) | C/kernel/tenancy/export.ts:15; R/docs/contracts/tenant-export.md |
| 25 | instance/single-sign-on (stub, `instance-single-sign-on`) | Administer | how-to | The instance's provider for operators: no Groups tab, no role, domains need no proof | S/SingleSignOn.tsx (`instance`); C/kernel/sso/providers.ts `checkRole` |
| 26 | instance/branding (stub, `instance-branding`) | Administer | how-to | "Console branding": product name, logo (also SVG), colors, no contrast check | S/InstanceBranding.tsx; C/routes/branding.ts:78-93 |
| 27 | instance/audit-log (stub, `instance-audit`) | Administer | how-to | The instance's log; entries of deleted tenants; filters, CSV, entry | S/Audit.tsx; C/routes/identity.ts:1291-1343, 1052 |

Not built, say so: a role given to people an instance provider makes (D7: nothing but `operator_admin` is bound at the instance, and a provider may not give it; GOV-P4 in `fixed/t3-account.md:31`); saved views and "Copy a link to it" on the instance log; legal holds on retention; a certificate service for hostnames; a DNS-zone feature (`C/kernel/zones.ts` is time zones); SCIM bulk, sort, etag and password change; container sandboxing of scripts (D1, later).

## B. Inventory

**Permissions** (R/packages/manifest/src/permissions.ts: `export` :67, `audit` :126, `portal` :153, `domain` :163, `worker` :170, `sso` :180)
- Kinds: `sso`, `portal`, `domain` and `worker` (:read/:write), `audit:read`, `export:write`.
- Retention and the managed-workers switch use `tenant:read/write` (C/routes/tenants.ts); Retention also accepts an operator's instance binding (`gate-roles.md` row 7).
- Instance screens use `instance:read/write`, or `audit:read` at the instance.
- Worker `write` words: "Create and revoke worker credentials, and make and remove worker pools" (permissions.ts:176). It no longer claims the managed-workers switch (GOV-29).
- Controls: a person who may only read sees "You can see X, not change it. It needs `perm`. Ask ..." and the controls are disabled (`S/kit/Can.tsx`, GOV-37). Applied on Single sign-on (all tabs; `sso:write`, or `instance:write` at the instance), Domains (`domain:write`), Workers (`worker:write`), Retention (`tenant:write`), tenant Branding (`portal:write`). Not applied on the instance's Branding and Audit, Environments export/import (`fixed/t4-gov-docs.md` GOV-37). The server decides again.
- A default role needs `binding:write` too; PUT group mapping needs `group:write` (`end_user_group:write` for end users), and `binding:write` when a mapped group holds a binding; emptying a mapping needs only `sso:write` (C/routes/sso.ts, GOV-01/02).

**Single sign-on** (S/SingleSignOn.tsx; C/routes/sso.ts; C/kernel/sso/*)
- List (:1557): Name, For (Members/End users), Protocol, State (on/off/paused; tag "Required"). Action **Connect a provider**. Empty: "No identity providers" ("People sign in with a password until a provider is connected and turned on."). URL `?provider=&tab=`. Instance page text: "Identity providers for the people who run this instance. A tenant connects its own under its settings."
- Sheet "Connect an identity provider" (:152-300): Who signs in through it (tenant only), Protocol (OpenID Connect (OIDC) / SAML), Name (max 80; "What the sign-in button says: Sign in with this name."), OIDC: Issuer, Client ID, Client secret ("Leave empty for a public client"); SAML: Metadata address or Metadata (the pasted one wins). Always created off. An OIDC issuer is read before saving, so a wrong address is said at once (routes/sso.ts POST description).
- Header (:1375-1480): **Remove** (type the name), **Require it / Stop requiring it** (only when on), **Turn on / Turn off** (turning off asks, naming the domains it covers; "A directory that pushes people to it keeps pushing while it is off"). Turning off also clears Require (providers.ts:591).
  - Require it: members with an email in the provider's proved domains lose passwords; end users, those in proved domains or everyone if none. Open sessions end now, except the caller's (D12; count in the `identity_provider.enforced` audit entry). Sessions the provider itself made also end: those people sign in again with it.
  - A notice before requiring (members, on, not required): owners should make recovery codes in Account. A paused provider (imported tenant) shows a notice and must be turned on by hand (GOV-31: a rename no longer resumes it).
- Stepper (:1481): Connect, Prove domains, Map groups (tenant only), Switch on.
- **Set up** tab (:310): "1. Enter these at the provider": Redirect address (OIDC); Reply address (ACS), Entity ID (audience), Metadata address (SAML). Members' providers also show **Sign-in address**, for a tile or bookmark; it works once the provider is on. "2. Try it": **Try signing in**, then **Show the result**; facts Subject, Email, Email verified, Name, Groups, Attributes; "Everything the provider sent". The try changes nothing and works while off (flow.ts). "3. Turn it on."
- **Domains** tab (:450): Email domain, **Add domain**, **Check now** (only while it has a record), **Remove**; pills Proved / Not proved / "Proved <date>; record gone since <date>". An unproved domain shows Record name `_vx-challenge.<domain>` and Record value `vx-domain=<40 hex>` (C/kernel/apps/challenge.ts:13). Instance domains: "needs no proof here". Members: one proved domain per instance-wide provider (R/packages/db/migrations/0025_sso.sql:55). Removing the last proved domain turns a member provider off and clears Require (routes/sso.ts:562). A gone record keeps the name verified, audits `identity_domain.record_gone` once, and stops nothing (D45).
- **Groups** tab (tenant only, :568): Group at the provider, Group here (searched on the server, "Showing the first N groups", Load more), **Add a mapping**, trash per row, Save bar. `*` means everyone. API max 500. A half-filled row is refused with "Row N is not complete". Rows from an access change show read only with a link to `/t/<id>/releases` and the tag "Access change".
- **Settings** tab (:748): Save bar, leave guard, Ctrl/Cmd+S, errors at the field.
  - Name (max 80).
  - SAML: **Read the metadata again** (address or pasted; asks first; replaces sign-in address, entity ID and certificates; a changed entity ID removes the ties), Sign-in address, Provider's entity ID, Signing certificates (PEM, 1-10), Name ID format (Not asked / Email address / Persistent / Transient / Unspecified), What must be signed (either/assertion/response/both), Sign the requests sent to the provider (default on), Ask the provider to encrypt assertions (RSA-OAEP with MGF1 and SHA-1; Keycloak's defaults differ), Accept SHA-1 signatures, Accept sign-ins the provider begins (the last two are audited).
  - OIDC: Issuer (a changed issuer asks "Change the issuer?"), Client ID, Client secret, **Remove the stored client secret** (a public client: PKCE alone), Scopes (default openid email profile; separated by spaces; max 20; openid forced), Also read the user-info address.
  - Which claims to read: Subject, Email, Name, Groups. Dotted names reach nested claims (claims.ts:5). Usual names are the placeholders (oidc: sub, email, name, groups; saml: the name ID, email/mail, name/displayName, groups/memberOf).
  - End users: Attributes (`attr = claim`, one a line, split at the first `=`, max 50), Take the provider's word on emails.
  - New people: Create people the first time they sign in; **Role given to a new member** (tenant members only; the instance's provider has none).
  - A changed issuer origin drops the stored secret unless a new one is sent (409 `secret_needed` if the provider is on); a changed OIDC issuer or SAML entity ID deletes the ties and audits `identity_provider.links_removed` (GOV-06/07).
  - API only now: `clientSecret: null` (the checkbox sends it), nothing else from the old list.
- **People** tab (:1228): Person, Email at the provider, Subject, Last signed in, **Untie**. Paged: 50, "Showing the first N people", Load more (the old cut at 1000 is gone).
- **Provisioning** tab: see below.
- Turn-on errors: `domain_needed`, `secret_needed` (only for the changed-origin case now). Others: `domain_taken`, `sso_required`.
- Addresses: members `/api/v1/sso/<id>/…`; end users `/portal/<slug>/sso/<id>/…` on the apps address only, even when sign-in starts at a custom hostname (providers.ts:236-250).
- Sign-in screen: `GET /sso/providers?email=` (members) and `GET /tenants/:t/end-user-auth/providers` (end users, for an app that draws its own screen): C/routes/sso.ts:846-915.
- Limits: 10 min to answer (saml.ts:9, flow.ts:21); 120 s to finish (flow.ts:23); 60 s SAML skew, 1 h assertion age (saml.ts:44-45); metadata 2 MB (metadata.ts:5).
- Rate limits: 60/min on member routes (routes/sso.ts:155); end users 30 starts and 300 answers per 60 s (kernel/apps/front.ts:607-609).
- Refusal reasons (people.ts:21-36): provider_off, provider_error, invalid_answer, replayed, expired, no_subject, no_email, email_unverified, domain_not_proved, email_not_trusted, no_account, not_in_tenant, disabled, runs_instance; plus `wrong_browser` (flow.ts:461). Member wording: S/SignIn.tsx:13-33. `runs_instance`: a tenant's provider does not sign in a person who holds any instance binding (D2).

**Requiring and recovery**
- Members: only emails in proved domains. Only an enabled `operator_admin` keeps a password (people.ts:553-580); any other role bound at the instance does not.
- End users: those in proved domains, or everyone if none are proved (people.ts:587-610).
- Recovery codes: S/Account.tsx:94 (`RecoveryCodes`); 10 codes, `xxxxx-xxxxx`, single use (recovery.ts:6-20). Owners with a direct `tenant_admin` binding only (recovery.ts:62). Sign-in link "Use a recovery code"; field "Recovery code"; button "Sign in with the recovery code" (S/SignIn.tsx:217-260). Header `x-recovery-code`. The code is spent before the password is checked, so a wrong password costs it; the form says so (auth.ts:252-262; D18).

**Provisioning (SCIM)** (S/Provisioning.tsx; C/routes/scim.ts; C/kernel/sso/scim.ts) a tab of the provider
- SCIM base address `<PUBLIC_URL>/api/v1/scim/v2/<provider>` (scim.ts:363), with **Copy the address**.
- Tokens (`vxp_`): Name, Begins, Made, Expires, Last used, Status, **Revoke**; **Make a token** asks Name and Expires (Never, In 30 days, In 90 days, In a year; `S/kit/expiry.ts`), shown once. API accepts `expiresInDays` 1-3650 (routes/scim.ts:322). An expired token shows as expired, not live.
- "How pushes are taken" (Save bar): "The name the provider signs a person in by is pushed as" (not pushed / externalId / userName); "A person's groups come from" (What each sign-in says / The groups the provider pushes; tenant only); "Make a group here for each pushed group that nothing maps yet". A pushed group adopts only a group the provider manages; a hand-made group of the same name is refused with a 409 in Refused pushes (GOV-03).
- "What has been pushed": People, Of them turned off, Groups, Last change.
- People pushed: All/Active/Turned off; paged (200 a page, Load more). Refused pushes: When, Push, Answer, Why; newest 50.
- Protocol: `attr eq "…"` filters only; page 100, max 200 (scim.ts:44); 1200 req/min (:388); no bulk, sort, etag or password (:504-508).
- Deactivation: end user disabled and app sessions deleted; member suspended in the tenant; instance provider disables the account and deletes sessions. What a person here turned off by hand, a push does not turn on (GOV-05, D6). A push that would leave a tenant with no admin, or the instance with no operator, is refused (409, GOV-04).
- A person who runs the instance is not pushed by a tenant's provider (403, GOV-08).

**Branding** (S/Branding.tsx; C/routes/apps.ts:493-600; C/kernel/apps/theme.ts)
- Page "Branding": "How this tenant's portal and apps look to its end users, and whether people may create their own account there." Portal: link, mail note (mail sent, or links passed on by hand), **People may create their own account** (default off). Save bar, Ctrl/Cmd+S, leave guard. Needs `portal:write`.
- Theme: 27 tokens (Branding.tsx:35-62), Light and Dark; **Clear back to the kit's values** (asks). Dark lengths and fonts follow light; dark colors fall back to the kit's dark ones.
- Values: 1-200 characters of `A-Za-z0-9#(),.%"' -`; url, image, expression, var(, env( and attr( are refused (R/packages/manifest/src/kinds.ts:1302-1309).
- Contrast (Branding.tsx:247-300): 23 pairs, text 4.5 and edges 3. Reads names, `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `hsl()`, `transparent`; pairs it cannot read are listed ("could not be checked"). Warns, never blocks. Tenant branding only.
- Logo: PNG/JPEG/WebP, 512 KB (Branding.tsx:131), saved at once, outside the save bar; **Remove logo**. Icons 32/180/192/512 drawn by the browser from the logo (routes/icons.ts). CSS cached 60 s, logo 300 s (apps.ts:604, 665).
- Workspace `theme` resource overrides; the first by path wins (kernel/apps/theme.ts:115-133).
- Instance, page "Console branding" (S/InstanceBranding.tsx; C/routes/branding.ts): Product name (max 60; empty uses the default; shown in the rail, sign-in screen and window title), logo (PNG/JPEG/WebP/SVG, 512 KB), same tokens, no contrast check. "Production is always marked in the attention color, so keep it clearly amber."

**Domains** (S/Domains.tsx; C/routes/apps.ts:647-1000)
- Page "Domains". Columns: Hostname, Serves, State (on/off, Verified, "Verified, record gone"), Last check, details. URL `?hostname=`.
- Sheet "Add a hostname": Workspace, Serves ("One app, at the hostname's root" / "The portal, and every app by its path"), App, Hostname ("The name alone, without https:// or a path").
- Details: State; **Change what it serves** (PATCH `app`); 1 Point the name here (CNAME or address, and a certificate wherever TLS ends); 2 Show the name agrees (Record name, Record value); 3 Check and enable, with step states; **Remove**, **Disable/Enable** (disabling asks: it stops answering and sign-ins end), **Check now**.
- The check is TXT (verifies), plus an advisory fetch of `/api/v1/domain-check` (5 s; apps.ts:905-915).
- `domain_not_verified` (409). An operator of the instance (`instance:write`) may enable an unverified name; the tenant may enable it again (D48).
- A proved, disabled hostname answers 404 "not served here"; an unproved one is left as it was (hosts.ts:130, GOV-24). A hostname is unique only while it is proved or enabled, so an unproved one no longer blocks other tenants (GOV-20).
- No certificates are issued. Other replicas follow within 30 s (hosts.ts:29). Whatever terminates TLS holds the certificate.

**Workers** (S/Execution.tsx:1146-1560; C/routes/pools.ts; C/routes/execution.ts)
- Page "Workers" (`worker:write`). Queue (QueuePanel): Workspace, Pool, Waiting, Oldest, Later, Running; a backlog notice; "Workers online" with each worker's version and "outdated, takes no tasks" below 0.6.0 (execution.ts:102).
- Pools table: State, Pool (tags Instance-run, Not made), Runs code of, Credentials; **Add pool** (Name: lowercase letters, digits, dashes, max 40; Description max 300); `default` is refused (GOV-38). **Remove the pool** (refused while credentials serve it).
- Switch line and button: **Run only on our own workers** (asks, saying whether a credential serves the default pool) / **Let the instance run workers**. States of `/managed-workers`: off, unavailable (the tenant allows it, the instance starts none), host, isolated, shared, refused. If an operator turned it off: "An operator turned this off. Only an operator can turn it on again." (D16).
- Credentials: Name, Credential, Pool, Runs code of, Created, Status; **Create credential** (Name, Pool, Runs code of: every workspace or one), **Revoke**. The command shown: `printf '%s\n' '<token>' | volvel-worker --url <url> --token-stdin`.
- CLI: `volvel-worker --url`, `--token`, `--token-stdin`, `--token-file <path>`, `--concurrency` (default 4), `--idle-exit` (R/packages/worker/src/bin.ts:23-65). The overviews no longer say "the instance starts workers" from the switch alone (GOV-23).

**Audit log** (S/Audit.tsx; C/routes/identity.ts:1291-1343; C/routes/permissions.ts)
- Columns: When (always shown), Who, What was done, To. Kind tags Create/Update/Delete/Execute/Read. "Operator" tag.
- Filters: Search ("An action, name, email or host": also finds a target by its name), Area, Since (Any time/Last 24 hours/Last 7 days/Last 30 days/Between dates), Workspace; behind **More filters (n)**: Who (Anyone), Action (Any action), Kind (Anything), Done to. Columns menu, saved views (tenant), **CSV** (tenant and instance), **Show older entries** (50), inspector with **Copy a link to it** (tenant), "Everything about this".
- CSV: max 100,000 rows (identity.ts:511), honours filters, times in UTC.
- Areas: the lists are `TENANT_AREAS` and `INSTANCE_AREAS` (Audit.tsx:38-106); a test requires every literal `action:` to have an area. Actions written through a template are not covered (remaining.md).
- Instance log: also shows the entries of deleted tenants (D47); no saved views and no entry link.

**Retention** (S/Retention.tsx; C/config.ts:137-141, 319-323)
- Runs, Events 30 days (1-3650); Refused requests 7 (1-3650; webhook requests and SCIM pushes); Audit log 400 (90-3650). Empty = default.
- Shorter asks "Save and remove older history". Runs, events and refusals go within minutes. The audit log is hidden at once and left out of the export; its rows go with their month, and return if the period is lengthened. Replaced files and files of deleted rows older than the audit period go too (GOV-11, D22). Pass every 10 min.
- Fixed: finished tasks 7 days. No legal holds exist.

**Export** (S/Environments.tsx:771 `TenantExport`, shown by S/Tenant.tsx:455; C/routes/portability.ts; C/kernel/tenancy/{export,tables}.ts)
- Passphrase (12-500; "Use at least 12 characters." shown at the field), Passphrase again, "Run, flow and event history" Leave it out/Include it, **Export tenant**. CLI `volvel tenant export --tenant <slug> --out <file> [--history]` with `VOLVEL_EXPORT_PASSPHRASE`.
- Format 2 (export.ts:15): members' passwords sealed under the passphrase, left out for people who also belong elsewhere or hold an instance binding; format 1 still imports. `notCarried` lists everything left out (GOV-30).
- Dedicated database: same file.

## C. Gotchas
1. SCIM ignores "Create people..." and works while the provider is off; only `paused` blocks it (403). Settled as documented (findings "Not bugs"); the Turn off confirmation says so.
2. After import a provider is paused. A rename no longer resumes it (GOV-31); only Turn on or a changed config does, and an enabled member provider first fails with `domain_needed`.
3. A wrong password still spends a recovery code (D18, kept; the form says so).
4. Email is matched once; afterwards only the subject. Transient SAML name IDs are refused.
5. Instance providers have no Groups tab and give no role (D7; not built on purpose).
6. Members' emails and names don't follow pushes; end users' do.
7. A verified domain or hostname stays verified after the record is removed; it is now shown ("record gone since") and audited once (D45).
8. Disabling a hostname serves nothing and keeps the sign-ins; removing ends them.
9. Shortening audit retention hides entries at once, but rows go only when their month passes every tenant's period (the month is exported whole to the object store first). It also sets how long replaced files are kept.
10. Exports now seal members' password hashes under the passphrase (format 2). The browser buffers the whole file. The audit log is cut at retention.
11. The audit search covers action, target ID and kind, and now the names, emails and hostnames of targets and actors (GOV-32).
12. A deleted pushed group leaves its local group in place.
13. The TXT record is derived from AUTH_SECRET, tenant and name; one record serves email domain and hostname. Changing `AUTH_SECRET` changes every record.
14. Saving OIDC config needs a reachable, public provider address; private ones are refused unless EGRESS_ALLOW covers them.
15. A tenant's provider never signs in a person who holds an instance binding (`runs_instance`).

## D. Stale or missing (settled)
- tenant/branding.md still promises a "name" and says "colours"; tenant branding has no name (only the instance has a product name). Open for phase 31 (VOC-31, `fixed/voc-spell.md`).
- R/docs/self-hosting.md:548 now says "Instance -> Console branding" (fixed, `fixed/ins2.md`). Hostnames: :425 still says "for one app"; :450 mentions the portal. It says (:397) a deleted tenant's audit "stays", and the instance log now reads it (D47, `fixed/t4-instance-host.md`): say how in the page.
- Worker permission text claims the managed-workers switch: fixed (GOV-29).
- The UI worker command uses `--token-stdin`: fixed (GOV-36); `--token-file` exists in the CLI (host.md).
- R/docs/contracts/tenant-export.md: `notCarried` and the "Never" list were extended (GOV-30). "One moment" is still said at :132 and export.ts:121 while a dedicated database gets a second snapshot (export.ts:86): open.
- retention.md covers only shortening; the audit log's own sentences are now in the screen (GOV-26): copy them.
- The SSO PATCH description and the contract do not yet mention `clientSecret: null` (`fixed/gov2.md` Found).

## E. Findings (settled by phase 29)
Every row is in `fixed/gov.md`, `fixed/gov2.md`, `fixed/t4-gov-docs.md`, `fixed/t2-sso.md`, `fixed/t3-account.md`; the tests are named there.
1. Public client cannot be turned on: fixed, GOV-13 (`gov2.md`).
2. Scopes drops a typed space: fixed, GOV-14.
3. Issuer with a trailing slash: fixed, GOV-15 (either spelling connects; the stored issuer stays as typed).
4. "Prove it is yours" with no record: fixed, GOV-21 (worded from `verified`).
5. Group maps from an access change show a trash button: fixed, GOV-19 (read only, with a link).
6. Header "On" after the last domain is removed: fixed, GOV-16 (`kit/useOpenRow.ts`).
7. Contrast skips named and hsl colors: fixed, GOV-22.
8. Audit areas lack most actions: fixed, GOV-17/27 (templated actions open: remaining.md, phase 30 M9).
9. An unverified hostname blocks other tenants: fixed, GOV-20.
10. `sso:write` can set `tenant_admin` as the default role: fixed, GOV-01/02 and D7.
11. "Cannot be brought back" for audit entries: fixed, GOV-26.
12. SCIM can suspend the last admin: fixed, GOV-04 (`acc.md`). Expired tokens look live: fixed, GOV-28.
13. Requiring SSO ends sessions: now yes, for those it covers (D12); API keys stay.
Also settled: GOV-03 hand-made group taken over, GOV-05/D6, GOV-06/07/D10, GOV-08/D2, GOV-09/D5, GOV-10, GOV-11, GOV-12/D18, GOV-23, GOV-24/25/D45, GOV-29, GOV-30, GOV-31..38, missing parts P1-P3, P5-P9 built; P4 refused by decision. Open: the role picker in provider Settings is cut at 200 roles without saying; field errors on the client secret are a notice, not at the field (`t4-gov-docs.md`, `sweep-can.md`).

## F. Screenshots and examples
- Provider Set up with a passed try; proved, unproved and "record gone" domain; Groups mapping with an access-change row; SAML Settings; Provisioning with a refusal and a token with Expires; sign-in screen (SSO button, recovery code).
- Branding preview with a contrast warning and an unreadable-color note; Domains details; Workers with "Not made", an operator lock and backlog; Audit with More filters and the inspector; Retention confirm (audit paragraph); Export; read-only notice (`Can`).
- Walkthroughs: Keycloak (runnable: R/deploy/compose/compose.dev.yaml profile `sso`; note its encryption defaults); Entra OIDC (`externalId` = object ID; group GUIDs) and SAML; Okta OIDC/SAML/SCIM; Google Workspace. Entra and Okta are tested on recorded shapes only.
- Examples: portal hostname via Caddy and Fly, internal hostname enabled by an operator; `warehouse` pool with `worker:` and compose; reading an exported audit month (R/docs/self-hosting.md "The audit log"); a minimal dark/light theme.
