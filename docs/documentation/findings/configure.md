# Findings: configure

Slice of [the inventory](../inventory/configure.md), settled at `270e509`. Paths: `CP/` = `apps/control-plane/src/`, `CO/` = `apps/console/src/`, `PK/` = `packages/`. Scratch tests (two control-plane files, one console file, one Node script) ran in the pinned tree and were removed. Nothing was run against the shared instance.

## Production before a first promotion: what is and is not possible

A new tenant's production workspace, with a dev workspace linked to it. Reproduced by scratch test.

| What | Console | API |
|---|---|---|
| Secret | yes: Secrets, "New secret" | yes |
| HTTP connection | **no**: the list is empty and "New connection" saves a draft first, 409 `production_workspace` | yes: `PUT connection-bindings/<path>` 204 |
| SMTP, OAuth or custom connection | **no** | **no** (400, checked as HTTP), unless the bundle was first uploaded to production (`POST bundles`, then 204). A refused promotion takes its copy of the bundle back, so trying to promote does not help |
| Variable with no default | **no**: "Set variable" picks only from known variables, and there are none | yes |
| Connection group member | no | no (404 until the group is deployed). Not needed: a group never blocks a promotion |
| Data source | not tried here (data slice): production also blocks on it | |

The only ways through by console alone: give the variable a default; or promote twice. A connection that is declared but that no script, flow or alert names blocks nothing, so it can be promoted alone, bound in production, and the script that uses it promoted after (that promotion succeeded). The refusal names each missing thing as plain text, with no way to it.

## Rows

### CFG-01 Renaming a connection, a connection group, or a data source makes its stored credential unreadable
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/kernel/rename.ts:30,114` moves the rows; `CP/kernel/execution/bindings.ts:14,109`, `CP/kernel/execution/oauth.ts:95` and `CP/kernel/data/sources.ts:37` seal each value under its path (`CP/kernel/crypto.ts:179`).
- **Evidence:** scratch test: bound with a credential, deployed a rename. A worker's read of the connection, and of a group member: 500. `POST connection-oauth`: 500. Data source check: ok while the pool was open, then "Unsupported state or unable to authenticate data" once pools were closed (a restart). A clone with Safety off fails with the same words. The list still says the credential is set, and saving without retyping it keeps the unreadable one. Renaming back reads it again. Every renamed production connection with a credential breaks on promotion, with no warning. `renames.test.ts` binds without a credential, so it passes.
- **Fix:** `renamePathState` opens each sealed column under the old name and seals it under the new one, in the same transaction; or seal by row id. Also `oauth_tokens`. A repair for rows already renamed: try the resource's earlier paths. Test first: `renames.test.ts` with a credential on a connection, a member, a source and an OAuth client, and a swap. Also add a 422 with words for a credential that does not open.
- **Size:** M. **Milestone:** M2

### CFG-02 An HTTP connection that is redirected to another address sends its key header and its configured headers there
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `PK/sdk/src/http.ts:112` refuses another origin; `:123` then follows redirects.
- **Evidence:** Node script with two local servers: header auth and `headers` arrived at the second origin. A bearer token did not (the platform's `fetch` drops `Authorization` only). `oauth2` uses the same client.
- **Fix:** in `httpConnector.create`, follow redirects by hand with the origin check on each (owner question 2). Siblings: `oauth2` and `core/http-request` through a connection get it; alert delivery too. Also: a caller's own `Authorization` is joined to the connection's ("Bearer other, Bearer …"): compare names without case. Test first: redirect to another origin sends neither.
- **Size:** S. **Milestone:** M1

### CFG-03 A stored credential follows a changed address
- **Outcome:** reproduced (API); owner question 3
- **Severity:** security
- **Where:** `CP/kernel/execution/bindings.ts:48,119`; `CP/kernel/execution/oauth.ts:45` (`baseUrl` is not among what forgets tokens, and the client secret is kept when `tokenUrl` changes).
- **Evidence:** bound with a credential, then `PUT` with another `baseUrl` and no credential: 204, `hasCredential` true. Whoever holds `connection:write` (the built-in developer) may so use a credential that no one may read.
- **Fix:** shared `bindConnection`/`bindGroupMember`: a new origin, host or token address without a credential in the same request drops the stored one, and the wizard asks for it. Sibling: data sources. Test first: the pair of requests above.
- **Size:** S. **Milestone:** M1

### CFG-04 Production cannot bind a new connection, or a variable with no default, before its first promotion
- **Outcome:** reproduced (table above). Inventory E1 and E10.
- **Severity:** broken
- **Where:** `CO/screens/ConnectionWizard.tsx:265-273`; `CP/kernel/authoring.ts:70`; `CP/routes/execution.ts:399-440, 2177`; `CO/screens/Execution.tsx:856`; refusal lists `CO/screens/Release.tsx:449,904`, `CO/screens/Environments.tsx` and the request review.
- **Evidence:** see the table. Wizard in production: "Resources are edited in a dev workspace and reach production by promotion." under the text "A new connection is declared in a draft, deployed with your next change."
- **Fix:** owner question 1. Recommended: the kind of a path also comes from the bundle that is waiting to arrive (active bundles of workspaces linked to this one), used by the PUT check, the list and variables ("Arrives with the next promotion"); the refusal's entries link to it, in one shared refusal list. In production the wizard never drafts. Test first: promote refused, set up each listed thing, promote succeeds, all by what the console calls.
- **Size:** L. **Milestone:** M7

### CFG-05 A connection that is bound but not deployed is shown as HTTP, whatever it is
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/routes/execution.ts:2187` (`connector ?? "http"`); same default at `:440`.
- **Evidence:** SMTP bound in production before promotion (after a bundle upload), and one whose declaration was promoted away: both listed `connector: http` with HTTP's schema. "Change" then draws an HTTP form over SMTP settings. Binding `mail` as HTTP is accepted, and only the promotion says `bindings_invalid`.
- **Fix:** one resolver of a path's connector (deployed, draft, uploaded bundles, arriving bundle) used by list and PUT; keep the kind on the binding row; unknown is said as unknown. Test first: list after removal says `smtp`.
- **Size:** M (part of CFG-04). **Milestone:** M7

### CFG-06 "Set up" on an unbound OAuth connection shows Google chosen and every field empty
- **Outcome:** reproduced (console test)
- **Severity:** broken
- **Where:** `CO/screens/ConnectionWizard.tsx:189-191, 226` (the preset is applied only with no `row`); also `onChange` of the Connection select empties the settings while the kind stays OAuth.
- **Evidence:** Provider "google", Authorization address "". Choosing Google again does nothing, since it is already chosen. Through "New connection" the same one is filled.
- **Fix:** apply the preset whenever the settings are empty and the kind is OAuth, keyed by path. Test first: the case above.
- **Size:** S. **Milestone:** M7

### CFG-07 "Change where it points" opens nothing
- **Outcome:** reproduced (console test, no dialog). E2.
- **Severity:** broken
- **Where:** `CO/screens/ObjectPages.tsx:98`; `CO/screens/Execution.tsx:673-700` never reads `item`.
- **Fix:** open `ConnectionWizard` on the object page itself (and keep `?item=` working on the list, as the other lists do). See missing part 1. Test first: pressing it opens the sheet for that path.
- **Size:** S. **Milestone:** M7

### CFG-08 A connection drafted and not yet bound is nowhere in Connections, and making it again answers "taken"
- **Outcome:** reproduced. E3.
- **Severity:** broken
- **Where:** `CP/routes/execution.ts:2177` (drafts are read but their paths left out); variables and groups list theirs.
- **Evidence:** draft `crm` saved: not in the list, `GET connection-bindings/crm` 404, creating it again 409 `path_taken`. A wizard whose draft saved and whose settings were refused ends here once closed.
- **Fix:** add undeleted draft paths and a `draft` state like the siblings'; schema from drafted connectors too (`deployedConnectors` only today; a connection on a drafted custom connector would show HTTP's, by code). Test first: the list holds `crm` with `draft: "new"`.
- **Size:** S. **Milestone:** M7

### CFG-09 A group of SMTP or custom connections cannot be given a member in the console, and changing a member silently drops how its credential is sent
- **Outcome:** reproduced. E4 (Basic is also absent: confirmed).
- **Severity:** data
- **Where:** `CO/screens/Execution.tsx:1308-1462`.
- **Evidence:** the dialog's body for an SMTP group: 400 "must have required property 'host'". Re-adding key `one` (bearer, one header) with a new address sent `config: {baseUrl}`: auth and headers are gone and the credential is kept but never sent. "A key that is already there is replaced" does not say so. "Points to" is blank for SMTP.
- **Fix:** the wizard's settings and secret sections (`SchemaForm` with the group's `configSchema`, `SecretField`) as one shared form for a connection and a member, opened from a row's "Change" with what it holds. Test first: both cases above.
- **Size:** M. **Milestone:** M7

### CFG-10 Members of a removed group stay, unseen, and block the group's return with another kind
- **Outcome:** reproduced; owner question 4
- **Severity:** broken
- **Where:** `CP/routes/execution.ts` group list (groups only), `CP/kernel/execution/deploy.ts:589` (checks all members).
- **Evidence:** after the group left the bundle: list empty, rows and sealed credentials remain. A bundle declaring it again as HTTP: 409 `bindings_invalid` about a member that no screen or list shows. `DELETE` by key still works if you know it.
- **Fix:** list leftover groups ("Not declared") with Remove, as connections do. Test first: list after removal.
- **Size:** S. **Milestone:** M7

### CFG-11 A clone with Safety off leaves group members behind, and says everything was copied
- **Outcome:** reproduced. Gotcha C10.
- **Severity:** wrong
- **Where:** `CP/kernel/tenancy/clone.ts:34-125`; words `CO/screens/Environments.tsx:421,499`.
- **Evidence:** one member before, zero in the clone; the dialog says "Its connections and secrets were copied: it can reach the same systems". Neither text names data sources, nor that OAuth connections must be connected again.
- **Fix:** copy members, resealed; report `connectionGroupMembers`; say what must be connected. Test first: `environments.test.ts`.
- **Size:** S. **Milestone:** M2

### CFG-12 Settings say a clone "gets no connection, data source or secret value", with Safety off it does
- **Outcome:** confirmed by code. E9.
- **Severity:** wrong
- **Where:** `CO/screens/Environments.tsx:125`.
- **Fix:** "unless you turn safety off"; check the API summary and docs. Also `:248` says "delete a dev workspace" while production has the button, and the docs page `configure/settings.md` says "its limits" (missing part 4).
- **Size:** S. **Milestone:** M7

### CFG-13 "Review and promote" promotes to the saved target while the field shows another
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/screens/Environments.tsx:569, 633` (`workspace.linkedWorkspaceId`, not `linked`).
- **Evidence:** in settings, choosing "Promotes to" changes the draft only; the button beside it still reviews the old target (its name is in the dialog's title).
- **Fix:** on an unsaved link, hide the button or ask to save first. Test first: changed link, no promote button.
- **Size:** S. **Milestone:** M8

### CFG-14 A production deploy or promotion does not check what a trigger source needs
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/kernel/execution/deploy.ts:31` (scripts only); `PK/manifest/src/bundle-check.ts:194` also checks `uses` for scripts only. `CP/kernel/references.ts:88` does count them.
- **Evidence:** promotion with a source using an unbound connection and an unset secret: 201, no warning.
- **Fix:** both loops take `trigger_source` through `asScript`. Test first: promotion answers `bindings_missing`.
- **Size:** S. **Milestone:** M4

### CFG-15 "Used by" and the unbind question leave out connection groups and the workspace's default alert
- **Outcome:** reproduced. E5.
- **Severity:** wrong
- **Where:** `CP/kernel/references.ts:14, 88-95`.
- **Evidence:** `references?kind=connection` with `failureAlert.notify: alerts` lists no use of it: the list says "Nothing deployed uses it". `kind=connection_group`: empty while a script names the group.
- **Fix:** add both (target kind `connection_group`; by: workspace settings, linking to Alerts). Group removal's confirmation then lists users. Test first: `references` in each case.
- **Size:** S. **Milestone:** M7

### CFG-16 "Nothing deployed uses it", and a removal that lists no users, while the uses are loading or could not be read
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/kit/references.tsx:29, 51` (`[]` until loaded); `RemoveButton` is given `usersOf([])` after a failure too.
- **Fix:** in the shared hook: `loaded`, a pending cell, and a confirmation that says its uses could not be read. Siblings: secrets, variables, events, every `UsedBy`. Test: failed references, Unbind text.
- **Size:** S. **Milestone:** M7

### CFG-17 Renaming the connection of the workspace's default alert silences it
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/kernel/execution/alerts.ts:117-176` and `CP/routes/alerts.ts:172` read by path; `CP/kernel/rename.ts` does not carry `workspace.failure_alert`.
- **Evidence:** default `hook`, renamed to `ops/hook`: settings still say `hook`, a test alert through it answers "The connection \"hook\" is not bound."
- **Fix:** rename `failure_alert.notify` and `.script` in `renamePathState`, or resolve with `pathNow` as workers do. Test first: alert after rename.
- **Size:** S. **Milestone:** M2

### CFG-18 An alert may name a connection that is missing, or not HTTP, and fails only when a run fails
- **Outcome:** reproduced (alerts slice owns it). Gotcha C12.
- **Severity:** wrong
- **Where:** `CP/routes/workspaces.ts` PATCH `failureAlert` (any path: 200); `onFailure.notify` on SMTP deployed: 201; `PK/worker/src/runner.ts:130` refuses.
- **Fix:** refuse a non-HTTP `notify` in `bundle-check` and in the PATCH, and an unknown path in the PATCH. Test first: both.
- **Size:** S. **Milestone:** M7

### CFG-19 A provider's refusal can end on the home page with nothing said, or as raw JSON
- **Outcome:** reproduced (API), confirmed by code (console)
- **Severity:** broken
- **Where:** `CP/routes/execution.ts:2741-2762`; only `CO/screens/Execution.tsx:679` reads `oauth_error`.
- **Evidence:** unknown state, or another member: 302 to `/?oauth_error=…`, which no screen there reads. Binding removed while away: 404 problem JSON in the browser.
- **Fix:** the shell shows and clears `oauth_error` anywhere; the route turns any refusal into a redirect. Test first: the shell at `/?oauth_error=x`; callback after unbind is 302.
- **Size:** S. **Milestone:** M7

### CFG-20 The wizard refuses names with an underscore, which the platform allows
- **Outcome:** reproduced (console: no request sent; API: draft `my_crm` 200). E6.
- **Severity:** rough
- **Where:** `CO/screens/ConnectionWizard.tsx:104` against `PATH_PATTERN` (`PK/manifest/src/envelope.ts:4`).
- **Fix:** use the shared pattern; show the error on the field. Grep the console for other copies of it. Custom kinds: missing part 2.
- **Size:** S. **Milestone:** M7

### CFG-21 When the kinds cannot be read, the wizard shows "Loading" for ever, with an empty Kind
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CO/screens/ConnectionWizard.tsx:175, 452` (`kinds.error` unread).
- **Fix:** `Pending of={kinds}` (the kit's). Test: 500 from `/connectors` offers a retry.
- **Size:** S. **Milestone:** M7

### CFG-22 A connection's page says "Answered", its list "Reached", and the page has no OAuth state
- **Outcome:** reproduced (console test: an OAuth row that needs reconnecting shows only "Set up here"). E7.
- **Severity:** wrong
- **Where:** `CO/screens/ObjectPages.tsx:88-93` against `CO/kit/health.tsx`, `CO/screens/Execution.tsx:643` (`ConnectionHealth`). Kind shows `oauth2`, the list "OAuth 2.0". Other uses of the words: data sources (M13 list).
- **Fix:** the page uses `ConnectionHealth` and `CONNECTOR_NAMES`. Actions: missing part 1. Test: page of a row that needs reconnecting.
- **Size:** S. **Milestone:** M7 (words M13)

### CFG-23 Setting a variable answers "Created.", and an empty value cannot be given
- **Outcome:** confirmed by code (console); API takes `""` and returns it. E8.
- **Severity:** rough
- **Where:** `CO/screens/Execution.tsx:856-874` (no `done`; `value` is required).
- **Fix:** with missing part 3: `done` names the variable, `required: false`, and the cell says "Empty". Siblings of "Created.": `CreateDialog` default (`CO/ListScreen.tsx:243`), also the group member dialog.
- **Size:** S. **Milestone:** M7

### CFG-24 A replaced secret leaves the form asking for a new one
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `CO/kit/SecretField.tsx:39` (`replacing` is never put back); seen in `ReplaceSecret` and the wizard after Save.
- **Fix:** in `SecretField`, when `setAt` changes, show the stored line again. Siblings: sources, SSO, mail. Test: save shows "Stored · set just now".
- **Size:** S. **Milestone:** M7

### CFG-25 A webhook whose secret is not set is recorded as "The signature does not match."
- **Outcome:** confirmed by code. Gotcha C8.
- **Severity:** wrong
- **Where:** `CP/kernel/execution/triggers.ts:976-983`.
- **Evidence:** the sender must not be told, but the refusal kept for the operator says the same, and sends them to the sender.
- **Fix:** record "The secret X is not set in this workspace", answer the sender as now. Test: `webhook_refusal.reason`.
- **Size:** S. **Milestone:** M7

### CFG-26 Configure offers every change to someone who may only read
- **Outcome:** confirmed by code; API refuses (403 "This needs the connection:write permission." reproduced)
- **Severity:** rough
- **Where:** `CO/screens/Execution.tsx:673-875,1308`, `CO/screens/Tenant.tsx:790`, `CO/screens/ObjectPages.tsx`, `CO/screens/Environments.tsx:52` (settings, pause, clone, delete). Same class as SHL-11.
- **Fix:** gate on the permission in `ListScreen` create and row actions, so every list follows. A person with `connection:write` and no `resource:write` gets no "A new connection…"; one without `run:read` cannot follow a Test.
- **Size:** M. **Milestone:** M7

### CFG-27 Texts that promise `EGRESS_ALLOW` limits scripts and connections
- **Outcome:** confirmed by code. D, C4.
- **Severity:** wrong
- **Where:** `CP/config-vars.ts:283`; `PK/manifest/src/errors.ts:109`; generated `settings.md`, `errors.md`. `guardedFetch` is called by the control plane only (OAuth token address, IdP, Git, domains, data sources).
- **Fix:** say what it guards, at the two sources; regenerate. Test: none beyond the generated check.
- **Size:** S. **Milestone:** M12

### CFG-28 "Each must be bound before a deploy" is untrue for dev
- **Outcome:** confirmed by code, and reproduced (dev 201 with warnings). D.
- **Severity:** wrong
- **Where:** `PK/manifest/src/kinds.ts:208`; `bindings_missing`'s own detail, "Bind each one, then deploy again", is also shown for a promotion.
- **Fix:** "before a deploy to production or a promotion". Docs pages: `variables.md` and `index.md` say scripts and flows read variables (scripts and trigger sources do); `settings.md` promises limits.
- **Size:** S. **Milestone:** M7 (docs text: phase 31)

### CFG-29 A Test, and every alert, needs a worker of the default pool
- **Outcome:** confirmed by code; owner question 5. C5.
- **Severity:** rough
- **Where:** `CP/kernel/execution/tasks.ts:124` (`pool is not distinct from`); no caller gives `pool`.
- **Evidence:** where a connection is reachable only from a named pool the Test speaks for the wrong network, and with no default worker it ends after 2 minutes; an alert after an hour. `docs/evolution/07-roadmap.md:335` says "on the workspace's pool".
- **Fix:** by the answer. **Size:** M. **Milestone:** M7

### CFG-30 Custom connections' Test fails before the first deploy
- **Outcome:** not a bug. The connector's code is in no bundle until it is deployed (`CP/routes/execution.ts:2624`). Document it.

## Not bugs

| Item | Why |
|---|---|
| C1, C2, C3 (lookup), C6, C7 (headers readable), C13, C14 | as designed; document. `connection_unusable` is 422 on purpose (`oauth.ts`, "Not a 409"). The headers hint already says not for credentials. The HTTP fallback in C3 is CFG-04/05 |
| C4, worker reach | runs are the tenant's code; only the text is wrong (CFG-27) |
| C9, no redaction of logs | master-spec:599 masks payloads where shown. Logs are what the script wrote. Document |
| C10, variables always copied; OAuth tokens not copied | as designed (tokens belong to one workspace's authorization); say so (CFG-11) |
| C11, "rename keeps bindings" | refuted for anything with a credential: CFG-01 |
| A secret's POST racing another | refuted: four at once gave 201, 409, 409, 409 |
| `workspace_admin` may lack Configure rights | refuted: it has `connection:*`, `secret:*`, `variable:*` |
| `workspace_production` permission text | true as far as it goes (`PK/manifest/src/permissions.ts:211`); explain in settings docs |
| A variable set by a mistyped path | API only; listed, and "Use default" clears it |
| Variable values in the audit log | variables are not secret; document |
| E10, groups before promotion | nothing is needed: a group never blocks. Members are added after (table above) |

## Missing parts

1. **A connection's page does nothing.** The API has PUT, DELETE, `connection-tests`, `connection-oauth` (`CP/routes/execution.ts:2533-2716`). On the object page: Set up/Change, Test, Connect/Reconnect, Unbind, and `credentialSetAt/By`, `oauth.connectedBy/connectedAt/expiresAt/scopes` (all returned, none shown there; `connectedBy` nowhere). Siblings: list row actions, data source page. `connection:write`. **M**
2. **Custom connectors in the wizard's Kind.** `GET connectors` returns them with a schema (`:2267`) and a draft may name one; the wizard filters to built-ins (`ConnectionWizard.tsx:384`). Also `description` ("What it is for", manifest) on a new one. `resource:write`. **S**
3. **Set a variable where it is.** `PUT/DELETE variable-values/*` (`:2895`): a row "Set value"/"Change" and the same on the page, prefilled, multi-line; today the page is read-only and the list retypes. Siblings: secret page, group member. `variable:write`. **S**
4. **The workspace's run limit.** `concurrencyLimit` 1-1000 on PATCH, returned on GET (`CP/routes/workspaces.ts:39`); no control and not shown. In Workspace settings with the save bar, beside the machine's limits. `workspace:write`. **S**
5. **Remove a stored credential.** `credential: null` (connections and members) has no control; only "Replace". In `SecretField`, so sources get it if their API does. `connection:write`. **S**
6. **Change a group member.** PUT takes any config, label and credential; the console retypes and covers two of four auths (CFG-09). Also shows no `credentialSetAt/By`, and a name cannot be cleared. `connection:write`. **M** (with CFG-09)

Total 6: S 4, M 2.

## Owner questions

1. **How does production get a new connection or variable before a promotion?** (a) Setting up what the linked workspace is about to send, offered from the refused preview and listed in production as "Arrives with the next promotion"; (b) let a promotion through with warnings, as dev does; (c) API only, documented. Recommend (a): it keeps master-spec's rule that production refuses, and gives the right form for SMTP and OAuth.
2. **An HTTP connection answered with a redirect to another address:** refuse it ("A connection can only call its own base URL", as the code says for paths), or follow without the credential and configured headers. Recommend refusing, with the address in the error.
3. **Changing a connection's address:** drop the stored credential (and OAuth tokens) unless it is given again, or keep it as now. Recommend dropping it when the origin changes.
4. **Members of a group that is no longer declared:** list them as leftovers with Remove, or delete them with the group. Recommend leftovers: a removal by mistake would destroy credentials.
5. **Which pool runs a Test and posts an alert:** the default only (and say so on the screen), or the pool of a script that uses the connection. Recommend the second for Test, and for alerts the pool of the run that failed.
6. **Bindings from the CLI:** it has none (the README's "console or CLI" is met by the console). Recommend leaving it to the API, with a documented script.
