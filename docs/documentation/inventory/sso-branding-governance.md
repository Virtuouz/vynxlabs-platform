# Inventory: sso branding governance

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

I read the code and the contract docs in full; tests by name, plus the SSO recovery and import cases. I ran nothing. Every bug in E comes from reading the code.

**Roots**
- `R` = .
- `S` = R/apps/console/src/screens
- `C` = R/apps/control-plane/src
- `D` = R/packages/docs/content

## A. Pages
Existing stubs to fill (topic id):
- D/tenant/single-sign-on.md (tenant-single-sign-on)
- branding.md (tenant-branding)
- domains.md (tenant-domains)
- workers.md (tenant-workers)
- audit-log.md (tenant-audit)
- retention.md (tenant-retention)
- export.md (tenant-export)
- D/instance/{single-sign-on,branding,audit-log}.md (instance-single-sign-on, instance-branding, instance-audit)

New pages:
- tenant/sso-oidc.md and tenant/sso-saml.md: fields and IdP walkthroughs
- tenant/sso-claims-and-groups.md: claims, groups and attributes
- tenant/sso-requiring.md: enforcement, recovery codes, lockout
- tenant/sso-troubleshooting.md: refusal reasons
- tenant/provisioning-scim.md
- tenant/theme-tokens.md: 27 tokens
- tenant/audit-actions.md: best generated from `action:` strings
- tenant/standalone-workers.md: pools, CLI flags, compose

Add each to `pages:` in D/tenant/index.md.

## B. Inventory

**Permissions** (R/packages/manifest/src/permissions.ts:60-185)
- Kinds: `sso`, `portal`, `domain` and `worker` (:read/:write), `audit:read`, `export:write`.
- Retention and the managed-workers switch use `tenant:read/write` (C/routes/tenants.ts:405,422,307).
- Instance screens use `instance:read/write`, or `audit:read` at the instance.
- I saw no permission checks around controls in these screens. The server refuses.

**Single sign-on** (S/SingleSignOn.tsx; C/routes/sso.ts; C/kernel/sso/*)
- List, 1249: Name, For (Members/End users), Protocol, State (on/off/paused, tag "Required"). Action **Connect a provider**. Empty: "No identity providers". URL `?provider=&tab=`.
- Sheet "Connect an identity provider", 143-297:
  - Who signs in through it (tenant only), Protocol, Name (max 80)
  - OIDC: Issuer, Client ID, Client secret
  - SAML: Metadata address or Metadata (the pasted one wins)
  - Always created off. An OIDC issuer is fetched on save (sso.ts:730).
- Header, 1019-1109: **Remove** (type the name), **Require it / Stop requiring it** (only when on), **Turn on / Turn off**. Turning off also clears Require (providers.ts:562).
- Stepper, 961: Connect, Prove domains, Map groups, Switch on.
- **Set up** tab, 301: Redirect address; or Reply address (ACS), Entity ID (audience), Metadata address. **Try signing in**, then **Show the result**. Facts: Subject, Email, Email verified, Name, Groups, Attributes, "Everything the provider sent".
  - The try runs the sign-in in a transaction and rolls it back; works while off (flow.ts:329).
- **Domains** tab, 432: Email domain, **Add domain**, **Check now**, **Remove**; Proved/Not proved.
  - Record `_vx-challenge.<domain>` TXT `vx-domain=<40 hex>` (C/kernel/apps/challenge.ts).
  - Members: one proved domain per instance-wide provider (R/packages/db/migrations/0025_sso.sql:55).
  - Removing the last proved domain turns a member provider off (sso.ts:487).
  - Instance domains are proved automatically.
- **Groups** tab (tenant only), 538: Group at the provider, Group here, **Add a mapping**, **Save mapping**. `*` means everyone. API max 500.
- **Settings** tab, 634:
  - SAML: Sign-in address; Provider's entity ID; Signing certificates (1-10); What must be signed (either/assertion/response/both); Sign the requests (default on); Ask to encrypt; Accept SHA-1; Accept sign-ins the provider begins
  - OIDC: Issuer, Client ID, Client secret, Scopes (default openid email profile; max 20; openid forced), Also read the user-info address
  - Claims: Subject, Email, Name, Groups. Dotted names reach nested claims (claims.ts:4). Usual names: oidc.ts:130, saml.ts:217.
  - End users: Attributes (`attr = claim`, max 50), Take the provider's word on emails
  - New people: Create people the first time they sign in; Role given to a new member (tenant-wide roles)
  - API only: `nameIdFormat`; re-reading `metadataUrl`/`metadataXml` by PATCH (providers.ts:369)
- **People** tab, 883: Person, Email at the provider, Subject, Last signed in, **Untie**. Max 1000.
- Turn-on errors: `domain_needed`, `secret_needed`. Others: `domain_taken`, `sso_required`.
- Addresses: members `/api/v1/sso/<id>/…`; end users `/portal/<slug>/sso/<id>/…` on the apps address only, even when sign-in starts at a custom hostname (providers.ts:235; front.ts ~590).
- Limits: 10 min to answer; 120 s to finish; 60 s SAML skew; 1 h assertion age; metadata 2 MB.
- Rate limits: 60/min (member routes); end users 30 starts and 300 answers per 60 s.
- Refusals: people.ts:20 plus `wrong_browser`. Member wording: S/SignIn.tsx:15.

**Requiring and recovery**
- Members: only emails in proved domains. Members bound *directly* at the instance are exempt (people.ts:531).
- End users: those in proved domains, or everyone if none are proved (people.ts:547).
- Recovery codes: S/Account.tsx:75; 10 codes, shape `xxxxx-xxxxx`, single use. Owners with a direct `tenant_admin` binding only (recovery.ts:62). Sign-in link "Use a recovery code". Header `x-recovery-code`.

**Provisioning (SCIM)** (S/Provisioning.tsx; C/routes/scim.ts; C/kernel/sso/scim.ts)
- SCIM base address `<PUBLIC_URL>/api/v1/scim/v2/<provider>`.
- Tokens (`vxp_`): Name, Begins, Made, Last used, **Revoke**; **Make a token** (shown once). API-only `expiresInDays` 1-3650.
- "How pushes are taken": subject field (none/externalId/userName); A person's groups come from; Make a group here for each pushed group.
- "What has been pushed": People, Of them turned off, Groups, Last change.
- People pushed: All/Active/Turned off; max 1000. Refused pushes: When, Push, Answer, Why; newest 50.
- Protocol: `attr eq "…"` filters only; page 100, max 200; 1200 req/min; no bulk, sort, etag or password.
- Deactivation: end user disabled and app sessions deleted; member suspended in the tenant; instance provider disables the account and deletes sessions.

**Branding** (S/Branding.tsx; C/routes/apps.ts:423-600; C/kernel/apps/theme.ts)
- Portal: link, mail note, **People may create their own account** (default off).
- Theme: 27 tokens (33-61), Light and Dark; "Clear back to the kit's values". Dark lengths and fonts follow light; dark colours fall back to the kit.
- Values: 1-200 characters of `A-Za-z0-9#(),.%"' -`; url, image, expression, var(, env( and attr( are refused (R/packages/manifest/src/kinds.ts:1268).
- Contrast: 23 pairs, text 4.5 and edges 3. Warns, never blocks.
- Logo: PNG/JPEG/WebP, 512 KB, saved at once, outside the save bar. Icons 32/180/192/512 drawn by the browser (256 KB each).
- Save bar: Save, Discard, Ctrl/Cmd+S, leave guard. CSS cached 60 s, logo 300 s.
- Workspace `theme` resource overrides; the first by path wins.
- Instance (S/InstanceBranding.tsx): Product name (max 60), logo also SVG, same tokens.

**Domains** (S/Domains.tsx; apps.ts:647-941)
- Columns: Hostname, Serves, State (on/off and verified/unverified), Last check, Details.
- Sheet "Add a hostname": Workspace, Serves (One app / The portal, and every app), App, Hostname.
- Details: three steps, then **Remove**, **Enable/Disable**, **Check now**. URL `?hostname=`.
- The check is TXT (verifies), plus an advisory fetch of `/api/v1/domain-check` (5 s).
- `domain_not_verified`; operators may enable unverified. API only: PATCH `app`.
- No certificates are issued. Other replicas follow within 30 s.
- C/kernel/zones.ts is *time* zones; there is no DNS-zone feature.

**Workers** (S/Execution.tsx:888-1287; C/routes/pools.ts; C/routes/execution.ts:2990)
- Queue: Workspace, Pool, Waiting, Oldest, Later, Running; then workers online (90 s), "outdated, takes no tasks" below 0.6.0.
- Pools: State, Pool (tags Instance-run, Not made), Runs code of, Credentials; **Add pool** (lowercase, digits, dashes, max 40); **Remove the pool** (refused while credentials serve it).
- Switch: **Run only on our own workers** / **Let the instance run workers**. States: off, host, isolated, shared, refused.
- Credentials: Name, Credential, Pool, Created, Status; **Create credential**, **Revoke**. API only: `workspaceId`.
- CLI: `--url`, `--token`, `--token-stdin`, `--concurrency` (default 4), `--idle-exit` (R/packages/worker/src/bin.ts).

**Audit log** (S/Audit.tsx; C/routes/identity.ts:145-417; C/routes/permissions.ts:740-970)
- Columns: When (always shown), Who, What was done, To. Kind tags Create/Update/Delete/Execute/Read. "Operator" tag.
- Filters: area, Any time/24 hours/7 days/30 days, Anyone, Any action, Anything, search. Columns, saved views, **CSV**, **Show older entries** (50), inspector, **Copy a link to it**.
- CSV: max 100,000 rows, 13 columns, honours filters. API also takes `to`, `target`, `workspaceId`.
- Instance log: no Who/Action/Done-to filters, CSV, views or links.

**Retention** (S/Retention.tsx; C/config.ts:125,299)
- Runs, Events 30 days (1-3650); Refused requests 7 (1-3650); Audit log 400 (90-3650). Empty = default.
- Shorter asks "Save and remove older history". Pass every 10 min.
- Fixed: finished tasks 7 days. No legal holds exist.

**Export** (S/Environments.tsx:759, *not* Tenant.tsx; C/routes/portability.ts; C/kernel/tenancy/{export,tables}.ts)
- Passphrase (12-500), Passphrase again, history Leave it out/Include it, **Export tenant**. CLI `volvel tenant export --tenant --out [--history]` with `VOLVEL_EXPORT_PASSPHRASE`.
- Dedicated database: same file.

## C. Gotchas
1. SCIM ignores "Create people…" and works while the provider is off; only `paused` blocks it (403).
2. After import, *any* PATCH, even a rename, resumes a paused provider. An enabled member provider first fails with `domain_needed`.
3. A wrong password still spends a recovery code (auth.ts:181).
4. Email is matched once; afterwards only the subject. Transient SAML name IDs are refused.
5. Instance providers have no Groups tab, and the UI omits the default role (the API accepts it).
6. Members' emails and names don't follow pushes; end users' do.
7. A verified domain or hostname stays verified after the record is removed.
8. Disabling a hostname keeps sign-ins; removing ends them.
9. Shortening audit retention hides entries at once, but rows go only when their month passes every tenant's period. It also sets how long replaced files are kept (retention.ts:228).
10. Exports hold password hashes in plain rows. The browser buffers the whole file. The audit log is cut at retention.
11. The audit search covers action, target ID and kind, not names, emails or details.
12. A deleted pushed group leaves its local group in place.
13. The TXT record is derived from AUTH_SECRET, tenant and name; one record serves email domain and hostname.
14. Saving OIDC config needs a reachable, public provider address; private ones are refused unless EGRESS_ALLOW covers them.

## D. Stale or missing
- tenant/branding.md promises a "name"; tenant branding has none (only instance does). "colours" vs console "colors".
- R/docs/self-hosting.md calls "Instance → Branding" what the nav calls "Console branding", and mentions hostnames for one app only (the portal is possible). It says a deleted tenant's audit stays, but not how to read it.
- Worker permission text claims it covers managed workers; that needs `tenant:write`.
- The UI command shows `--token`; self-hosting recommends `--token-stdin`.
- R/docs/contracts/tenant-export.md: "one moment", but a dedicated database gets a second, later snapshot (export.ts:86). "Always" omits retention settings, pools and the audit cut-off. "Never" omits SCIM tokens and refusals, webhook refusals, saved views, approval links, recovery codes. The manifest's `notCarried` omits SCIM tokens too.
- retention.md covers only shortening; nothing says audit rows are hidden first.

## E. Likely bugs and questions
1. "Leave empty for a public client" cannot be turned on: `secret_needed` (providers.ts:475).
2. Scopes field drops a typed space (SingleSignOn.tsx:806): "profile groups" becomes "profilegroups". Paste works.
3. Issuer trailing slash is stripped (providers.ts:362). Issuers with a path and trailing slash (Authentik's default) should fail discovery's exact match. Root issuers (Auth0) are fine.
4. Adding an instance domain toasts "Prove it is yours with the record shown"; there is no record.
5. Group maps from an access release show a trash button, but saving keeps them (sso.ts:683).
6. Header can stay "On" after the last domain is removed, when the provider was just edited (`fresh` wins, 1191).
7. Contrast skips named and hsl colours, then says every pair is easy to read.
8. Audit areas lack identity_provider, sso, scim, worker_pool, trigger, promotion, instance and more.
9. An unverified hostname blocks every other tenant (apps.ts:727).
10. `sso:write` can set `tenant_admin` as default role with no binding check in the code I read (providers.ts:442). Intended?
11. Refusal text "cannot be brought back" is untrue for audit entries (C9).
12. SCIM can suspend the last admin; I found no guard. Expired tokens look live.
13. Does requiring SSO end existing sessions? I found nothing that does.

## F. Screenshots and examples
- Provider Set up with a passed try; proved and unproved domain; Groups mapping; SAML Settings; Provisioning with a refusal; sign-in screen (SSO button, recovery code).
- Branding preview with a contrast warning; Domains details; Workers with "Not made" and backlog; Audit with inspector; Retention confirm; Export.
- Walkthroughs: Keycloak (runnable: R/deploy/compose/compose.dev.yaml profile `sso`; note its encryption defaults); Entra OIDC (`externalId` = object ID; group GUIDs) and SAML; Okta OIDC/SAML/SCIM; Google Workspace. Entra and Okta are tested on recorded shapes only.
- Examples: portal hostname via Caddy and Fly, internal hostname enabled by an operator; `warehouse` pool with `worker:` and compose; reading an exported audit month (self-hosting, "The audit log"); a minimal dark/light theme.
