# Findings: SSO, SCIM, branding, domains, workers, audit, retention, export

Triaged at `270e509` on 2026-11-22. `C` = `apps/control-plane/src`, `S` = `apps/console/src/screens`.

Evidence marked **server test** is a scratch vitest file on a throwaway database (`startTestApp`, a small OIDC provider, SCIM requests). **Console test** is a scratch vitest file that drew the screen over a stubbed API. Both were removed after the run. No finding rests on the shared instance except GOV-24.

## Security and data

### GOV-01 A provider's default role can be one its editor may not give, `operator_admin` included
- **Outcome:** reproduced (E10). **Severity:** security.
- **Where:** `C/kernel/sso/providers.ts:442` (`checkRole`), `C/kernel/sso/people.ts:338` (`giveRole`).
- **Evidence:** server test. A member whose only role is `sso:read, sso:write` got 403 binding `tenant_admin`, and 200 setting it as the default role. A SCIM push then made a member who held it, while the provider was off. `operator_admin` was accepted as a tenant's default role (200), where `POST /bindings` answers 400; the instance's provider takes `tenant_admin` and `operator_admin` too.
- **Fix:** `checkRole` refuses `INSTANCE_ONLY_ROLE` in a tenant, as `insertBinding` does (`C/routes/permissions.ts:1060`); setting a default role also needs `binding:write` at that scope. Check the built-in role fits the scope for an instance provider. Siblings: GOV-02, GOV-03. First failing test: `sso.test.ts`, an sso-only role sets `defaultRoleId`.
- **Size:** S. **Milestone:** M1.

### GOV-02 Mapping a provider's group needs no right over the group it fills
- **Outcome:** reproduced. **Severity:** security.
- **Where:** `C/routes/sso.ts:647` (`PUT group-maps`).
- **Evidence:** server test. The `sso:write`-only member mapped `*` to a group that holds `tenant_admin` (200). The next sign-in puts people in it.
- **Fix:** with GOV-01: `group:write` (or `end_user_group:write`) as well as `sso:write`, and `binding:write` when the group holds bindings. Ask for the same in `applyPushedGroups` settings (GOV-03).
- **Size:** S. **Milestone:** M1.

### GOV-03 "Make a group here for each pushed group" takes over a hand-made group of the same name
- **Outcome:** reproduced. **Severity:** security.
- **Where:** `C/kernel/sso/scim.ts:947` (`ensureLocalGroup`; finds by name, whatever `managed_by` is).
- **Evidence:** server test. With the setting on, a pushed group named `Administrators` put its member in the existing group of that name, which held `tenant_admin`. The setting's words say make, and its hint says nothing maps yet.
- **Fix:** adopt only a group with `managed_by = 'provider'`; otherwise do not map, and record a refusal the Provisioning tab shows. Test: `scim.test.ts`, "told to, pushed groups make groups here".
- **Size:** S. **Milestone:** M1.

### GOV-04 SCIM can suspend a tenant's only admin and disable the instance's only operator
- **Outcome:** reproduced (E12). **Severity:** security.
- **Where:** `C/kernel/sso/scim.ts:480` (`setActive`); no guard anywhere but `C/routes/identity.ts:1119`, which also counts disabled operators as others.
- **Evidence:** server test. `active: false` on the only `tenant_admin` answered 200, and their next request 403. On the only operator: 200, then 401 with the session and with the password.
- **Fix:** one shared `keepsAnAdmin` / `keepsAnOperator` check (counting only those not suspended or disabled) used by SCIM, `PATCH`/`DELETE` members, member disable and binding delete. SCIM answers 409 and it shows under Refused pushes. Siblings are in the people-and-access slice.
- **Size:** M. **Milestone:** M1.

### GOV-05 A push lifts a suspension or a disabled account that a person here made
- **Outcome:** reproduced. **Severity:** security.
- **Where:** `C/kernel/sso/scim.ts:800` and `:881`.
- **Evidence:** server test. A member suspended by hand, then pushed for the first time: `suspended_at` null. An account an operator disabled, pushed by the instance's provider: `disabled_at` null. A sign-in would have been refused (`people.ts:224`, `:307`).
- **Fix:** record who turned the person off (by hand, or the provider); a push resumes only what a push suspended. Migration on `tenant_member`, `member` and `end_user`. The existing "deleted person is suspended and can be pushed again" test must still pass. Ask: Q3.
- **Size:** M. **Milestone:** M1.

### GOV-06 A stored client secret is sent to a changed issuer
- **Outcome:** reproduced. **Severity:** security.
- **Where:** `C/kernel/sso/providers.ts:541` (`updateProvider`), `C/routes/sso.ts:297`.
- **Evidence:** server test. `PATCH` with a new `issuer` and no secret: 200, `hasSecret` still true; the new provider's token address is then given the old secret.
- **Fix:** a changed issuer needs the secret again, or drops it. The same rule as a connection's or data source's changed host; use one helper.
- **Size:** S. **Milestone:** M1.

### GOV-07 Ties to people survive a changed issuer
- **Outcome:** reproduced. **Severity:** security.
- **Where:** `C/kernel/sso/people.ts:77`; `identity_link` keeps no issuer (`0025_sso.sql:59`).
- **Evidence:** server test. After `idpIssuer` was changed, the same subject with another email resolved to the same member. Subjects are only unique within one issuer.
- **Fix:** a changed OIDC issuer or SAML entity ID removes the provider's ties (they are made again by email), and the console says so first. Audit it.
- **Size:** S. **Milestone:** M1.

### GOV-08 A tenant's provider can sign in a person who runs the instance
- **Outcome:** owner decides (Q1); behavior reproduced. **Severity:** security.
- **Where:** `C/kernel/sso/people.ts:108`.
- **Evidence:** server test. A tenant's provider with the operator's email domain proved, and creating people on, resolved to the operator. `auth.ts:122` then makes a full session with instance rights.
- **Fix if decided:** refuse a tenant's provider for a member bound at the instance, with an audited reason; the same in `createScimUser`.
- **Size:** S. **Milestone:** M1.

### GOV-09 An export holds its members' instance-wide password hashes as plain rows
- **Outcome:** owner decides (Q2); confirmed by code (C10). **Severity:** security.
- **Where:** `C/kernel/tenancy/export.ts:192`.
- **Evidence:** every `tenant_member`'s hash is written, for accounts that also sign in to other tenants or run the instance. The Export screen and `docs/self-hosting.md` name rows, files and the audit log, not hashes; the contract names the column.
- **Fix if decided:** seal hashes under the tenant key (opened by the passphrase on import), format 2 reading 1. At least say it on the screen.
- **Size:** M. **Milestone:** M1.

### GOV-10 A disabled member's app sign-ins go on
- **Outcome:** confirmed by code; the people-and-access slice runs it. **Severity:** security.
- **Where:** `C/kernel/apps/sessions.ts:137` reads no `disabled_at`; `C/kernel/sso/scim.ts:559` ends only `member_session`.
- **Evidence:** the end-user branch checks `disabled_at` (`:126`), the member branch does not. Same for `PATCH /members/:id`.
- **Fix:** check in `appPrincipal`, and delete app sessions in one shared `disableMember` used by both callers.
- **Size:** S. **Milestone:** M1 (one fix with that slice).

### GOV-11 Shortening "Audit log" retention deletes replaced files, and nothing says so
- **Outcome:** confirmed by code. **Severity:** data.
- **Where:** `C/kernel/retention.ts:228` (`pruneFileHistory` with `auditDays`); `S/Retention.tsx:32`.
- **Evidence:** the next pass removes notes of replaced files older than the new period, and their bytes. The field's words and the confirmation name only entries.
- **Fix:** say it in the field's hint, the confirmation and the API's description.
- **Size:** S. **Milestone:** M2.

### GOV-12 A wrong password costs a recovery code
- **Outcome:** reproduced (C3), and deliberate (D18: kept, and the form says so; the same fault as SHL-16, settled the same way, in `fixed/gov2.md`). **Severity:** rough.
- **Where:** `C/kernel/auth.ts:181`; `docs/phases/phase-8-console-redesign.md:89`.
- **Evidence:** server test. Wrong password with a code: 401; the same code with the right one: 403 `sso_required`; 9 left. Nobody without a code can spend one, so it is not a way to use them up. It is a typing mistake that costs, unannounced.
- **Fix:** check the password first inside the hook (the library's verify), then spend the code in the same transaction as the sign-in; racing sign-ins still meet `useRecoveryCode`'s single update. If not changed, the sign-in screen says it.
- **Size:** S. **Milestone:** M1.

## Broken

### GOV-13 A public OIDC client can be connected and never turned on
- **Outcome:** reproduced (E1). **Severity:** broken.
- **Where:** `C/kernel/sso/providers.ts:475`; `S/SingleSignOn.tsx:263` says "Leave empty for a public client".
- **Evidence:** server test. Create 201, turn on 409 `secret_needed`. The rest supports it: `C/kernel/sso/oidc.ts:27` uses `client.None()` with PKCE.
- **Fix:** remove the check. A secret once stored also cannot be cleared: accept `clientSecret: null`.
- **Size:** S. **Milestone:** M9.

### GOV-14 The Scopes field drops a typed space
- **Outcome:** reproduced (E2). **Severity:** broken.
- **Where:** `S/SingleSignOn.tsx:811`.
- **Evidence:** console test. Typing `openid groups` a key at a time gave `openidgroups`.
- **Fix:** keep the text, split on save, as Certificates and Attributes do.
- **Size:** S. **Milestone:** M9.

### GOV-15 An issuer with a path and a trailing slash cannot be connected
- **Outcome:** reproduced (E3). **Severity:** broken.
- **Where:** `C/kernel/sso/providers.ts:362`.
- **Evidence:** server test. A provider that publishes `…/app/slash/`: 400 "discovered metadata issuer does not match the expected issuer". Without the slash: 201. A typed slash on a provider that publishes none works today and must keep working.
- **Fix:** keep what was typed; on a mismatch that differs only by the slash, store what the provider published.
- **Size:** S. **Milestone:** M9.

### GOV-16 After an edit, the header still says On when the last domain turned the provider off
- **Outcome:** reproduced (E6), in the case reported. **Severity:** wrong.
- **Where:** `S/SingleSignOn.tsx:1192`.
- **Evidence:** console test. Require it, then remove the last domain: "Turn off", "Stop requiring it" and "On and required" all stay. Without an earlier edit it is right (the list reloads after a write). `Domains.tsx` has the same `fresh` pattern.
- **Fix:** drop `fresh` once the list has loaded again; one helper for both screens.
- **Size:** S. **Milestone:** M9.

### GOV-17 Audit filters can show the previous filter's entries
- **Outcome:** reproduced. **Severity:** wrong.
- **Where:** `S/Audit.tsx:211` (`load` has no cancel).
- **Evidence:** console test. Area set to Secrets while the first page was still loading: the list ended on `run.started`. "Show older entries" has the same race.
- **Fix:** ignore an answer whose query is no longer the one asked. Look for other hand-written `load` functions.
- **Size:** S. **Milestone:** M9.

### GOV-18 Attributes and group mappings that are not well formed are dropped, and the save says it worked
- **Outcome:** reproduced. **Severity:** broken.
- **Where:** `S/SingleSignOn.tsx:699` (attributes), `:597` (mappings).
- **Evidence:** console test. `customer_id = urn:x?a=b` and `region: r` were not sent; a mapping with no group was not sent. Both said saved.
- **Fix:** split on the first `=`; show a line or row that is not complete as an error and do not save.
- **Size:** S. **Milestone:** M9.

### GOV-19 Group mappings from an access release show a remove button that does nothing
- **Outcome:** reproduced (E5). **Severity:** broken.
- **Where:** `C/routes/sso.ts:688`, `:99` (`GroupMapView` does not say who manages it); `S/SingleSignOn.tsx:581`.
- **Evidence:** server test. `PUT` with an empty list: 200, and the released row comes back.
- **Fix:** add `managedBy` to the view; draw those rows read only with a link to the release, as Groups does.
- **Size:** S. **Milestone:** M9.

### GOV-20 An unverified hostname blocks every other tenant from registering it
- **Outcome:** reproduced (E9). **Severity:** security (one tenant can hold another's name; nothing is served).
- **Where:** `C/routes/apps.ts:727`; `hostname … unique` in `0018_apps.sql:81`.
- **Evidence:** server test. Tenant A registers, unverified: 201. Tenant B, the owner: 409, with no way through but an operator.
- **Fix:** unique only where verified or enabled, as `identity_domain_members_idx` does; verifying one answers 409 when another tenant has it verified. Migration.
- **Size:** M. **Milestone:** M1.

## Says something untrue

### GOV-21 Adding an instance domain says to prove it with a record that is not there
- **Outcome:** reproduced (E4). **Severity:** wrong. **Where:** `S/SingleSignOn.tsx:460`.
- **Evidence:** console test: "ops.example is added. Prove it is yours with the record shown." The row is already Proved. The stepper says "Prove domains" there too.
- **Fix:** words from what came back (`record === null`). **Size:** S. **Milestone:** M9.

### GOV-22 The contrast check passes colors it cannot read
- **Outcome:** reproduced (E7). **Severity:** wrong. **Where:** `S/Branding.tsx:278`, `packages/ui/src/contrast.ts:34`.
- **Evidence:** console test. Every token `white`: "Every pair checked is easy to read." The same for `hsl()` and 8-digit hex; `rgba(0,0,0,0.05)` ink is judged as solid black.
- **Fix:** read any CSS color (the browser's computed value), lay an alpha color over its ground, and say which pairs were not checked. Siblings: Instance branding, `Badge`.
- **Size:** S. **Milestone:** M9.

### GOV-23 Workers says the instance starts workers when it starts none
- **Outcome:** reproduced. **Severity:** wrong. **Where:** `S/Execution.tsx:1149` (reads the switch, not the state).
- **Evidence:** console test. With state `off` (the instance runs none) and `refused`, it says "The instance starts workers for the default pool when there is work"; with `refused` directly under "so it starts none for this tenant". The state is also not reloaded after the switch.
- **Fix:** word it from `/managed-workers`; tell "off here" from "off on the instance" (the API merges them in `off`); reload both.
- **Size:** S. **Milestone:** M9.

### GOV-24 A hostname that is not enabled serves the console, where Domains says it serves nothing
- **Outcome:** reproduced. **Severity:** wrong. **Where:** `C/kernel/apps/hosts.ts:94`; `S/Domains.tsx:237`.
- **Evidence:** `curl -H "Host: …" http://localhost:8091/` for a name not enabled: 200, `<title>Console`. Deliberate for an address the instance does not know.
- **Fix:** a registered and verified but disabled hostname answers "not served here"; for an unverified one change the words only, so that nobody can switch off a name they do not own.
- **Size:** S. **Milestone:** M9.

### GOV-25 A check that finds no record leaves the name Verified, beside "No TXT record was found"
- **Outcome:** reproduced (C7). **Severity:** wrong. **Where:** `C/routes/apps.ts:816`, `C/routes/sso.ts:439`; `S/Domains.tsx:222`.
- **Evidence:** server test. Record removed, checked again: still verified, still can be enabled, with the problem text. The step reads "Record created and found". Each passing check also rewrites "Verified <when>".
- **Fix:** a third state, "Verified on X; the record is gone since Y", in both lists; keep the first date. Whether it should stop anything is Q4.
- **Size:** S. **Milestone:** M9.

### GOV-26 Retention says audit entries are removed within minutes and cannot be brought back
- **Outcome:** confirmed by code (E11, C9). **Severity:** wrong. **Where:** `S/Retention.tsx:85`, `:118`; `C/routes/tenants.ts:427`.
- **Evidence:** `auditSelect` hides by period at once (`C/routes/identity.ts:250`); rows leave with their month (`retention.ts:379`); lengthening shows them again. `retention.test.ts:364` holds exactly this.
- **Fix:** a sentence of its own for the audit log, in the confirmation and the page. With GOV-11. **Size:** S. **Milestone:** M9.

### GOV-27 The audit area list lacks most areas
- **Outcome:** confirmed by code (E8). **Severity:** wrong. **Where:** `S/Audit.tsx:35`.
- **Evidence:** actions are written that no area reaches: `identity_provider`, `identity_domain`, `identity_link`, `sso`, `scim`, `scim_token`, `instance`, `promotion`, `access`, `operator`, `trigger`, `schedule`, `approval`, `alert`, `worker_pool`, `end_user_group`, `group_member`, `git_repository`, `workspace_git`, `dashboard`, `page_action`, `connection_group`, `sql`, `tenant_import`, `database_location`, `bundle_asset`. "Operator access" does not hold `operator.access`.
- **Fix:** the typed action registry of phase 30 M9 is the source; until then a test that every written action has an area. The instance log gets its own areas.
- **Size:** S. **Milestone:** M9.

### GOV-28 An expired SCIM token looks live
- **Outcome:** reproduced (E12). **Severity:** wrong. **Where:** `S/Provisioning.tsx:144`.
- **Evidence:** server test. An expired token answers 401 and is listed as any other with `expiresAt` in the past; the table has no expiry column. A refused token leaves no refusal either.
- **Fix:** an Expires column with a state, as API keys have. With part P1. **Size:** S. **Milestone:** M9.

### GOV-29 Worker permission words claim the managed-workers switch
- **Outcome:** confirmed by code (D). **Severity:** wrong. **Where:** `packages/manifest/src/permissions.ts:176`; the switch needs `tenant:write` (`C/routes/tenants.ts:307`).
- **Fix:** change the words. Moving the switch to `worker:write` would widen who can put code beside the control plane. **Size:** S. **Milestone:** M9.

### GOV-30 The export's list of what is not carried leaves out SCIM tokens and more
- **Outcome:** confirmed by code (D). **Severity:** wrong. **Where:** `C/kernel/tenancy/export.ts:13`.
- **Evidence:** no line for provisioning tokens and refused pushes, webhook refusals, recovery codes, saved views, approval links, retention settings, or the audit log's cut at its period. An importer reads this list to know what to make again.
- **Fix:** complete it from the tables left out, with a test that every tenant table is carried or named. Retention settings should travel. **Size:** S. **Milestone:** M9.

### GOV-31 Two ways to say one thing about a paused provider
- **Outcome:** reproduced (C2). **Severity:** rough. **Where:** `C/kernel/sso/providers.ts:577`.
- **Evidence:** server test. Any `PATCH`, a rename included, sets `paused: false`; for an enabled provider of members it answers 409 `domain_needed`, so it cannot even be renamed first. The API documents "saving turns it back on"; the console's notice says "then turn it on".
- **Fix:** resume only on `enabled: true` or changed `config`. Update the contract's sentence. **Size:** S. **Milestone:** M9.

## Rough

### GOV-32 Audit search does not find a name, email or hostname
- **Outcome:** reproduced (C11). **Severity:** rough. **Where:** `C/routes/identity.ts:239`.
- **Evidence:** server test. `alice@…` and a hostname: 0, beside entries that show them in Who and To. The placeholder does say "An action, an ID or a kind".
- **Fix:** resolve the text to IDs through `TARGET_NAMES` first and match those. **Size:** M. **Milestone:** M9.

### GOV-33 SSO settings, mappings and provisioning are lost without a word when left unsaved
- **Outcome:** confirmed by code. **Severity:** rough. **Where:** `S/SingleSignOn.tsx:634`, `:538`, `S/Provisioning.tsx`.
- **Evidence:** no `SaveBar` or guard; Branding and Retention beside them have both. Field errors are one notice, not at the field.
- **Fix:** `SaveBar` on the three. **Size:** S. **Milestone:** M9.

### GOV-34 Lists stop at a limit without saying
- **Outcome:** confirmed by code. **Severity:** rough. **Where:** group picker 200 (`S/SingleSignOn.tsx:540`), People and People pushed 1000 (`C/routes/sso.ts:552`, `C/routes/scim.ts:231`). The chips count the loaded rows while "What has been pushed" counts all.
- **Fix:** page the two routes; search in the pickers. **Size:** M. **Milestone:** M9.

### GOV-35 Turning off a hostname or the instance's workers asks nothing
- **Outcome:** confirmed by code. **Severity:** rough. **Where:** `S/Domains.tsx:283`, `S/Execution.tsx:1155`.
- **Evidence:** an app stops answering, or every run of the default pool waits, on one press. Turning off a provider asks.
- **Fix:** confirm, saying what stops and, for workers, whether a credential serves the default pool. **Size:** S. **Milestone:** M9.

### GOV-36 The worker command shown puts the credential in the process list
- **Outcome:** confirmed by code (D). **Severity:** rough. **Where:** `S/Execution.tsx:1257`; the guide recommends `--token-stdin`.
- **Fix:** show the `--token-stdin` form. **Size:** S. **Milestone:** M9.

### GOV-37 Controls show to people who may not use them
- **Outcome:** confirmed by code (B). **Severity:** rough. **Where:** every screen of this slice; no permission is read before a control is drawn. The server refuses.
- **Fix:** the shared gate the instance slice needs, then these screens. **Size:** M. **Milestone:** M9 (shared with M10).

### GOV-38 A pool can be called "default", and the queue then shows two alike
- **Outcome:** confirmed by code. **Severity:** rough. **Where:** `C/routes/pools.ts:10`, `S/Execution.tsx:986`.
- **Fix:** reserve the name. **Size:** S. **Milestone:** M9.

## Not bugs

| Claim | Why |
|---|---|
| C1 SCIM ignores "Create people…" | Documented: a pushed person "is found by email or made" (`docs/self-hosting.md`, Provisioning). Whether off should stop pushes is Q5 |
| C4 only the subject after the first sign-in; transient name IDs refused | Documented, and the rule that makes it safe |
| C5 no Groups tab for an instance provider | Instance has no groups. The missing role is part P4 |
| C6 a member's email and name do not follow pushes | Documented, tested (`scim.test.ts:590`) |
| C8 disabling a hostname keeps sign-ins | A sign-in counts only at its host, which is not served. Turning it back on is not a sign-out |
| C10 the browser holds the whole file; the audit log is cut at its period | The screen sends a large tenant to the CLI; the cut is documented |
| C12 a deleted pushed group leaves its local group | Documented and tested (`scim.test.ts:1012`). The code comment "will remove it" (`scim.ts:979`) is wrong |
| C13 one record for an email domain and a hostname | Documented. Bound to the tenant |
| C14 a reachable, public provider address | The egress guard, by design |
| Stepper and "Turn off" text stale after proving a domain | Refuted by test: reads reload after a write |
| Recovery codes only for a direct `tenant_admin` | Master spec: "an owner"; a group's admin has the owner |

**Documents only (phase 31):** "colours", the tenant "name" in `tenant/branding.md`, "Instance → Branding", hostnames for the portal, a deleted tenant's audit, `tenant-export.md` on two snapshots and its Always and Never lists. `export.ts:59` repeats "one moment".

## Missing parts

| # | What the API takes | Where it belongs | Permission | Size |
|---|---|---|---|---|
| P1 | SCIM token `expiresInDays` 1-3650 (`C/routes/scim.ts:306`) | "Make a token": a form with Name and Expires; a column. Sibling: API keys | `sso:write` / `instance:write` | S |
| P2 | SAML `nameIdFormat` (`providers.ts:396`) | Settings, SAML, with the usual formats | `sso:write` | S |
| P3 | `metadataUrl` / `metadataXml` by `PATCH` (`providers.ts:369`) | Settings, SAML: "Read the metadata again". The form must leave out `certificates`, `entryPoint` and `idpIssuer`, which win | `sso:write` | S |
| P4 | `defaultRoleId` on an instance provider (`C/routes/sso.ts:118`) | Instance, Settings: New people. After GOV-01 | `instance:write`, `binding:write` | S |
| P5 | `addresses.start` (`C/routes/sso.ts:68`) | Set up: "Sign-in address", for a tile or a bookmark | `sso:read` | S |
| P6 | Hostname `PATCH` `app` (`C/routes/apps.ts:848`) | Domains, details: Change what it serves | `domain:write` | S |
| P7 | Worker credential `workspaceId` (`C/routes/execution.ts:3025`) | Create credential: Workspace; a column | `worker:write` | S |
| P8 | Instance log filters `action`, `actorId`, `targetType`, `target`, `to` (`C/routes/identity.ts:1149`) | Instance audit: Who, Action, Done to. CSV, facets and one entry have tenant routes only (instance: 404), so they are small routes on the shared `auditSelect` | `audit:read` at the instance | M |
| P9 | Tenant log `to`, `target`, `workspaceId` (`C/routes/identity.ts:168`) | Audit: a date range, Workspace, and "Everything about this" in the inspector. The CSV honors them | `audit:read` | S |

## Owner decides

1. **Q1 (GOV-08) May a tenant's identity provider sign in someone who runs the instance?** (a) yes, if the domain is proved, as now; (b) no: operators use a password or the instance's provider; (c) yes, but the session holds nothing at the instance. Recommended: b.
2. **Q2 (GOV-09) May a tenant's admin take its members' password hashes away in an export?** (a) as now; (b) sealed under the passphrase; (c) only for members who belong to no other tenant and not to the instance, the rest reset on import. Recommended: b and c together.
3. **Q3 (GOV-05) When a person here suspended someone and the directory says active, who wins?** (a) the directory, as now; (b) the hand, until lifted by hand. Recommended: b.
4. **Q4 (GOV-25) Should a verified name be checked again by itself?** (a) never; (b) a failed check, by hand or weekly, is shown and audited and stops nothing; (c) it stops new ties and enabling after a grace time. Recommended: b.
5. **Q5 (E13, C1) What do "Require it" and "Turn off" end?** Now neither ends a session or an API key, and pushes go on while a provider is off (both reproduced). (a) as now, and the confirmations say so; (b) requiring also ends password sessions of those it covers, with keys left; (c) off also stops pushes. Recommended: b for requiring (exempting whoever presses it), and a for off.
