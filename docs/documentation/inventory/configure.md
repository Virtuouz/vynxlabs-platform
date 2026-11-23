# Inventory: configure

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

**Refreshed 2026-11-23** against the code on branch `phase-30-docs-system` after phase 29 (lanes cfg, cfg2, t3-config, t4-config-ext, fix-flowops, mask, mask2, host2, gate-roles, t2-walk-shell; decisions D10, D11, D17, D20, D23, D42, D44, D46, D53, D54, D57, D65). What changed in this brief:
- Every claim in (B) and (C) was read against the code again; file:line are new. Where a claim was wrong it is corrected, where phase 29 built something it is added.
- Section (A) now gives each page a collection, a Diátaxis type, a purpose and sources. Pages were added (see the notes under the table).
- Section (D) (wrong or stale) is now about the **published pages**, which phase 29 did not edit; the bugs in old (E) are all settled and are listed with their outcome.
- Vocabulary taken from the code: "Remove from here" (was Unbind), "Not set up here" (was "Not bound"), "N not set up" (nav badge), "Copy workspace" row with a **Clone workspace** button, "Run limit", "Time zone", Deploy (dev) / Versions (production), canceled, Flow.

Could not verify (nothing was run; no browser walk of this lane exists, `fixed/cfg.md` and `fixed/cfg2.md` say so): the forms' rate limit ("20/min per visitor"; I found only `MAX_FORM_BYTES = 16 KB`, kernel/apps/front.ts:111); that "Used by" on a connection page includes drafts; that `rekey` still rewraps tenant keys only (kernel/rekey.ts not re-read); the `core/send-email` and `core/http-request` node behavior beyond their registry lines; line numbers in the Alerts screen, which another inventory owns.

Path prefixes (absolute): `R`=., `S`=R/apps/console/src/screens, `C`=R/apps/console/src, `CP`=R/apps/control-plane/src, `E`=CP/routes/execution.ts, `K`=CP/kernel, `M`=R/packages/manifest/src, `SDK`=R/packages/sdk/src.

## (A) Pages

Collections: Get started, Console, Develop, Administer, Self-host. Types: tutorial, how-to, reference, explanation. Today's content is in R/packages/docs/content; "stub" means the file exists with a topic id and nothing written (see (D)).

| Path | Collection · type | Purpose | Sources |
|---|---|---|---|
| configure/index.md (exists) | Console · explanation | What is declared in code (a name, a kind) and what is set per workspace (address, credential, value). The five screens. | C/nav.ts:147-153 |
| configure/connections.md (stub, `configure-connections`) | Console · reference | The Connections list, a connection's page, every state and control, who may use each. | S/Execution.tsx:784-950; S/ObjectPages.tsx:69-197; C/kit/health.tsx |
| configure/set-up-a-connection.md (new) | Console · how-to | New connection wizard, step by step; Save and test; in production, set up one that "arrives". | S/ConnectionWizard.tsx; fixed/cfg.md CFG-04 |
| configure/connection-http.md (new) | Console · reference | HTTP fields, auth, empty path, redirects. | SDK/http.ts:55-99, 112-175 |
| configure/connection-smtp.md (new) | Console · reference + how-to | Mail fields, ports and security, what Test does, `ctx.connection(...).send`. | SDK/smtp.ts:46-64; R/packages/worker/src/smtp.ts:42-44 |
| configure/connection-oauth.md (new) | Console · how-to; plus an explanation section | Register an app, redirect address, Connect, Reconnect, Google and Microsoft. How tokens are kept. | S/ConnectionWizard.tsx:81-110, 430-480; K/execution/oauth.ts |
| configure/connection-groups.md (new) | Console · how-to + reference | A group, its members, Add a member and Change, leftover members. | S/Execution.tsx:1574-1713; S/GroupMemberSheet.tsx |
| configure/connection-health.md (new) | Console · reference (states) + how-to (troubleshoot) | What Test asks, the five health words, what clears them, common refusals. | C/kit/health.tsx; E:3005-3066 |
| configure/binding-and-deploying.md (new; title "Setting up what a deploy needs") | Console · explanation | Declared in code, set up per workspace; dev deploy warns, production and promotion refuse; "arrives with the next promotion"; rename and clone keep it. | K/execution/deploy.ts:32-110, 620-670; fixed/cfg.md CFG-04 |
| configure/secrets.md (stub, `configure-secrets`) | Console · reference + how-to | Make, replace, delete, who reads one, what is never shown. | S/Tenant.tsx:903-975; S/ObjectPages.tsx:273-380; CP/routes/workspaces.ts:524-700 |
| configure/variables.md (stub, `configure-variables`) | Console · reference + how-to | Set, change, empty value, use default; default in code; not secret. | S/Execution.tsx:958-1090; S/VariableSheet.tsx; S/ObjectPages.tsx:200-272 |
| configure/settings.md (stub, `configure-settings`) | Console · reference | Name, promotion target, time zone, run limit, pause, copy, delete, access. | S/Environments.tsx:60-205, 207-380, 486-640 |
| configure/alerts.md (stub, `configure-alerts`) | Console · reference | Default failure alert and a script's `onFailure`; owned with the operate inventory. | S/Alerts.tsx:129-234 |
| configure/who-can-change-what.md (new) | Administer · reference | `connection|secret|variable:read/write`, what else a button needs, what a read-only member sees. | CP/routes/workspaces.ts:320-366; C/kit/Can.tsx:111-150; C/builtinRoles.ts |
| configure/encryption-and-egress.md (new) | Administer · explanation | Keys, sealing, masking, what the control plane and workers may reach. Links to Self-host for `EGRESS_ALLOW` and `WORKER_EGRESS_ALLOW`. | K/execution/sealed.ts; K/crypto.ts; K/execution/redact.ts; CP/config-vars.ts:292, 331 |
| build/custom-connectors.md (new) | Develop · how-to + reference | `defineConnector`: `configSchema`, `create`, `test`; declare, deploy, Test. | SDK/index.ts:580-612; M/kinds.ts:799-830 |
| build/connections-in-scripts.md (new) | Develop · reference | `uses`, `ctx.connection`, `ctx.connections(group)`, `ctx.secret`, `ctx.variable`; `defineConnection`, `defineConnectionGroup`, `defineVariable`; YAML file names; flows' `with`; nodes. | SDK/index.ts:614-660; SDK/context.ts:36-56; M/kinds.ts:195-260, 888-910 |
| build/set-up-from-a-script.md (new; D53) | Develop · how-to | Bind connections, secrets and variables through the API from a script, since the CLI has no such command. | E:2910, 3327; CP/routes/workspaces.ts:566; R/examples/fernhill/setup/setup.mjs:285-300 |
| start/call-an-api.md (new) | Get started · tutorial | A connection, a secret and a variable used by one script, deployed and run. Based on the acme example. | R/examples/acme/src/index.ts:22-29 |
| operate/webhooks-and-forms.md (new, or under triggers) | Console · how-to | Signing secrets (`verify`), what the sender sees, what the operator sees. Forms: owned with the operate inventory. | M/kinds.ts:357-408; K/execution/triggers.ts:1342-1365 |

Not there, and the pages should say so: secret versions, history, rollback or expiry; renaming a secret; a `defineSecret` or a YAML kind for a secret; a CLI command to bind a connection, a secret or a variable (D53: YAML for access, "the API with a documented script" for bindings); offering a connection to an agent (S/OfferToAgent.tsx covers scripts and flows only); a custom connector in the wizard's Kind list; a group member's credential cannot be removed (only replaced) and a group cannot hold an `oauth2` connector (M/bundle-check.ts:314); a way to read a secret back, for anyone.

Topic map: C/nav.ts:147-153. F1 opens help (tooltip "Help for this page", C/Shell.tsx:1285).

## (B) Contents

### Connections list (S/Execution.tsx:784-950)
- **Button:** "New connection"; in production "Set up a connection" (:828-837). Offered with `connection:write`, and outside production also `resource:write` (:789-791). In production, when every row is bound, it says in a toast "Nothing waits to be set up here. A connection is declared in a dev workspace and arrives here with a promotion." and opens nothing.
- **Columns:** Connection, Health, Used by, Kind, Points to. The Connection cell can carry "Arrives with the next promotion" (declared by the linked dev workspace, not deployed here; no page, shown as code), "Draft, never deployed", "Draft" or "Removing".
- **Kind:** "HTTP", "Mail (SMTP)", "OAuth 2.0", a connector path, or "Not declared anywhere" for a binding no deployed, drafted, arriving or uploaded declaration speaks for (S/ConnectionWizard.tsx:59-65; E:2420-2550; the 200 newest uploaded bundles are read, E:448-455).
- **Points to:** `baseUrl` or `host`; else the pill "Not set up here" (kit/status.tsx:109).
- **Row actions:**
  - Test, if bound, and for OAuth connected, and the member holds `run:read` (:926)
  - Change (bound) / Set up (not bound)
  - **Remove from here**: "Remove X from here? Scripts that use it will fail until it is set up again.", listing affected users; says what it does not know while uses are loading or unreadable (CFG-16)
- **Health** (C/kit/health.tsx:20-48; Execution.tsx:750-782): "Not tested", "Reached" + "N ms · tested …", "Failed" + the reason in full under it, "Not connected" + Connect, "Needs reconnecting" + Reconnect. Blank if not bound. Connect and Reconnect need `connection:write`.
- **Used by** (kit/references.tsx:55-77): up to 3 links, "and N more", "Nothing deployed uses it", "Could not be read", "Reading…". It now counts connection groups and the workspace's default alert (a use by "settings") (CFG-15, K/references.ts).
- **Empty:** "No connections yet".
- **Read-only:** someone without `connection:write` sees the list, no buttons, and "You can read this list. Changing it needs the connection:write permission: ask an administrator of this workspace." (ListScreen `needs`, ListScreen.tsx:155, 404; CFG-26).
- **Query parameters:** `?setup=<path>` or `?item=<path>` open that connection's sheet (a refused promotion's "Set up" links and the object page use them); an unknown path says "There is no connection X here to set up."; after OAuth, `?oauth=connected|…&connection=` (Execution.tsx:812-845). `oauth_error` is said on any screen (CFG-19, C/App.tsx `useOAuthReturn`).
- **Nudges:** nav badge "N not set up" (Shell.tsx:177); Overview "N connection(s) has/have nothing bound here" + Configure (S/Overview.tsx:385).
- **Narrow screens:** headers do not wrap, the table scrolls sideways (WLK-17a).

### Object page (S/ObjectPages.tsx:69-197)
- **States:** "Set up here" / "Not set up here", plus the same health as the list (so also Connect / Reconnect and "Needs reconnecting"). The page's old "Answered / Did not answer" is gone.
- **Buttons** (with `connection:write`): Test (also `run:read`), "Change where it points" or "Set up", "Remove from here" (same confirmation as the list). They open the same wizard sheet as the list.
- **Meta:** Kind, What it is for, Credential Set/None, Declared ("Deployed" / "In a draft, never deployed" / "Only set up here"), Connected (OAuth), Last changed, Last check (only when it failed).
- **Tabs:** Used by, "Where it points" (raw JSON of the settings; "Not set up in this workspace yet." when empty).

### Wizard (S/ConnectionWizard.tsx; sheet "New connection" / "Set up X")
Description: "What is set here applies to this workspace only: dev and production can point to different places."
1. **1 · What it is**
   - Connection select: what is declared and nothing has bound yet (in production, what the next promotion brings), plus "A new connection…" outside production. In production a new one is never offered: "Nothing waits to be set up here…" (D23).
   - New: Name (hint "What scripts call it by."; the platform's path pattern, so lowercase letters, digits, dashes, underscores and slashes; refusal "Name it with lowercase letters, digits, dashes and underscores, such as crm or google/sheets.") and Kind: built-ins only (HTTP, Mail (SMTP), OAuth 2.0), :423-432. A new connection is first declared in a draft and deployed with the next change (:299-310). While the kinds load, the area has a Try again (CFG-21).
   - OAuth: Provider (Google, Microsoft, Another provider), "Directory (tenant)" (default `common`, Microsoft), "Redirect address" with Copy (:134, 470-473). Google is applied to an OAuth connection with empty settings however the sheet was reached (CFG-06). Presets: :81-110.
2. **2 · Settings**: a form drawn from the connector's schema.
3. **3 · Token or key / Password / Client secret / Secret** (:66-80, 499-520). A notice "The address changed. Saving removes the stored …, which was given for the old one: enter it again to keep using this connection." appears when the origin, host, port or token address changes and nothing new is typed (D10, `addressChanged`, :140-155). The field shows "Stored · set … by …" with **Replace** and **Remove** (a pending removal says "The stored … will be removed when you save." with "Keep the stored one") (C/kit/SecretField.tsx; CFG-MP5, sends `credential: null`). After a Save the stored line shows again (CFG-24).
4. **4 · Save and test** or **Connect and test**
   - Saved; Connected / "Not connected yet" / "Needs connecting again"; Connect / "Connect again"; Test / "Test again"; "Testing…" / "Waiting for a worker…"; "Change the token or key"
   - Non-OAuth tests automatically on Save; OAuth on return from the provider
   - Footer: Close, Save / "Save again"
- API: a draft is PUT first (`resource:write`), then `PUT connection-bindings/<path>` `{config, credential}` where `credential` omitted keeps, `null` removes, 1-65,536 characters (E:2910-2960).

### Connector fields
All schemas set additionalProperties false.
- **http** (SDK/http.ts:55-99): `baseUrl`* "Address" (`^https?://`); `headers` "Headers sent with every request" (not for credentials); `auth` "How the credential is sent": "Authorization: Bearer"; "In a header of your choice" (`name` "Header name"); "HTTP Basic" (`username` "User name"). Omit `auth` and the credential is never sent.
  - A request outside the origin throws "A connection can only call its own base URL, not X." (:157-160). An empty path (`post("")`) means the address exactly as given.
  - **Redirects (D11, CFG-02):** followed by hand, at most 5, each checked against the connection's origin; another origin throws, naming both and saying the request was not sent there (:174-185). A caller's header of another case does not join the connection's.
  - `HttpError` messages carry no query, fragment or credentials (:41-49).
  - Test is GET of the address, below 400 passes (:208-220).
- **smtp** (SDK/smtp.ts:46-64): `host`* "Mail server" (max 253), `port` 1-65535 (587), `security` starttls (default)/tls/none, `from`* "Sent from" (3-320), `username`. Test connects and signs in, sends nothing. Timeouts 15 s / 15 s / 60 s (R/packages/worker/src/smtp.ts:42-44). Client: `send({to,cc,bcc,replyTo,subject,text,html})` → `{messageId}`; text or html required. It runs only in a worker: a local run says "Mail connections live in a workspace…" (CLI-05, fixed/clirel.md).
- **oauth2** (SDK/oauth2.ts:36-73): `baseUrl`* "API address", `authorizeUrl`* "Authorization address", `tokenUrl`* "Token address", `clientId`* "Client ID" (max 150), `scopes` (max 50), `authorizeParams` "Extra authorization parameters", `clientAuth` body (default)/basic, `headers`, `testPath` "What Test asks for".

### OAuth runtime (K/execution/oauth.ts)
- Redirect `<PUBLIC_URL>/api/v1/oauth/connections/callback`, one per instance. Authorization code + PKCE S256 (:175); state lasts `STATE_MINUTES` (10), single use; the same signed-in member must finish.
- Reserved parameters override `authorizeParams`. Token timeout 10 s (:27). Refreshes 2 minutes ahead (:25) under a per-connection lock; rotated refresh tokens kept.
- 5xx/429/unreachable: transient, current token used while valid. Other refusals → `needs_reconnect` (:512).
- Workers get only the access token and settings, never the refresh token or client secret.
- Changing `authorizeUrl`, `tokenUrl`, `clientId` or `scopes` drops tokens (:46); a changed origin of the token address also drops the client secret unless typed again (D10).
- A provider's refusal, or a connection removed on the way, ends in a redirect with `oauth_error`, never JSON or a blank page (CFG-19).
- Audit: `connection.bound`, `connection.rebound`, `connection.unbound`, `connection.tested`, `connection.oauth_started`, `oauth_connected`, `oauth_refresh_failed` (E:2935-3060; oauth.ts:310, 516).

### Connection groups (S/Execution.tsx:1574-1713; S/GroupMemberSheet.tsx; shown under the list, S/Tenant.tsx:781-785)
- **Header:** "A group holds many connections of one kind, and a script picks one by its key when it runs. Add a member for each customer or account. It is used from the next run, with no deploy."
- **"Add a member" / "Change X"** (sheet; description "To <group>. It is used from the next run, with no deploy."): Key (cannot change after; "Add another member to use a new one"), Name, then the group's own connector form (HTTP: Address, headers, "How the credential is sent" including HTTP Basic; SMTP: host, port, security, from, user) and Credential (stored shows "Stored · set … by …", Replace; no Remove). Change opens with what the member holds (CFG-09). The same notice as the wizard when the address changes (WLK-17b).
- **Columns:** Key, Name, Points to (`baseUrl`, `host` or `url`), Credential Set/None, Change and Remove. Remove: `Scripts that ask <group> for "<key>" will fail until it is added again.`
- **Group states:** "Draft, never deployed" + "Open the draft" (no member can be added yet), "Removing", "Draft"; "Not declared" for members left by a removed group: a sentence, Remove per member, no Change or Add (D46, CFG-10). Empty: "No groups here…", "No members yet. A script that asks this group for a key will fail until one is added."
- **Key:** `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`; label max 200 (E:2810-2830). Re-adding a key replaces it.
- **Limits:** a group cannot hold `oauth2` (M/bundle-check.ts:314-316). `keys()` returns the members as `{key,label}` (SDK/context.ts:48).
- **Needs:** `connection:write`. Group lists do not yet use `needs`, so a read-only member is still offered the buttons (t4-config-ext "Left").

### API and permissions
E:2579-3110. Under `/tenants/:t/workspaces/:w`:
- `connection-bindings[/path]` (GET, `connection:read`; PUT `{config,credential?}`, DELETE; `connection:write`), `connectors`, `connection-groups`, `connection-group-members/:key/*` (GET/PUT/DELETE), `connection-tests` (202 task; `connection:write`), `connection-oauth` (`connection:write`), `variable-values`, `secrets`, `references`, and `GET allowed?permissions=a,b` (signed in; answers about the caller only; CP/routes/workspaces.ts:320-366).
- List items gain `arrives`, `draft`, and `connector: "unknown"`; groups gain `declared` (cfg2).
- `connection|secret|variable:read/write`. A new wizard connection also needs `resource:write`; following a Test also needs `run:read`. The console now hides or disables Configure controls by these (`useMay`, `ListScreen needs`, CFG-26); a server refusal still speaks if the answer cannot be had.
- Built-in roles (C/builtinRoles.ts, held to the migrations by `builtin-roles.test.ts`): `developer` holds `connection:write`, `secret:write`, `variable:write`, `resource:write`, `run:write`, `*:read`; `viewer` `*:read`; `workspace_admin` holds `connection:*`, `secret:*`, `variable:*`, `resource:*`, `workspace:*`, `run:*` and (D57) `interface:*`, `doc:*`, `git:*`; none holds `workspace_production:write`.

### Secrets (S/Tenant.tsx:903-975; S/ObjectPages.tsx:273-380; CP/routes/workspaces.ts:524-700)
- **List:** Name, Used by, Last set (… by …); row action **Delete** ("Delete the secret X? Anything that uses it will fail."). Empty: "No secrets yet. Store API keys and passwords here. Resources refer to a secret by its name." The list's description: "Values are encrypted with this tenant's own key. A value can be replaced but never read back here."
- **"New secret":** Name (`^[A-Za-z_][A-Za-z0-9_]*$`, max 127; hint "Letters, digits and underscores."), Value (1-65,536). POST refuses a taken name; PUT upserts. Done: "The secret X is made. Name it in a script's uses to read it." with an "Open X" link. `?setup=<name>` opens the form (from a refused deploy).
- **Page:** meta Value ("Encrypted. It can be replaced, never read back here."), Last set; tabs Value ("Replace the value"; "Replaced the value of X. What uses it reads the new value from its next run."; without `secret:write`: "Replacing the value needs the secret:write permission: ask an administrator of this workspace.") and Used by.
- Workspace-scoped only. **No versions, history, rollback or expiry. Secrets cannot be renamed.**
- No API returns a value, to anyone. Readers: a run whose script declares it (CP/routes/worker.ts:605-628), webhook signature checks (K/execution/triggers.ts:1342), a clone with Safety off (K/tenancy/clone.ts:69+).
- A secret is not a resource: no `defineSecret`, no YAML kind. Audit: `secret.created`, `secret.updated`, `secret.deleted`.

### Variables (S/Execution.tsx:958-1090; S/VariableSheet.tsx; S/ObjectPages.tsx:200-272; E:3248-3380)
- **Columns:** Variable (draft and "Arrives with the next promotion" tags), Read by, For, Value here ("Default: …", "Empty", or the value).
- **Buttons:** "Set variable" (Variable picker, which offers what the next promotion brings; Value, optional: "Leave it empty to give the variable an empty value."). Done: "Set X in this workspace." or "Set X to an empty value in this workspace."
- **Row:** "Set" / "Change" (sheet "Set X" / "Change X": Value as several lines, prefilled, shows the default; Cancel, Save), and "Use default" ("Clear the value of X in this workspace?"). A draft-new or removed variable gets neither (CFG-MP3).
- **Page:** "Change value" / "Set value"; meta What it is for, Value here (or "Empty"), Default, Last set; tab Used by.
- **Strings only**, max 65,536. An empty string is a value; a script reading it gets `""`, not the default (CFG-23). Not secret: shown to readers, and the value is in the audit log (`variable.set` has `{value}`, E:3355; `variable.cleared`).
- Made in All resources → New → Variable ("What it is for"; "Value when a workspace sets none (optional)"). Its default lives in code (`defineVariable`, `.variable.yaml`).
- Gated by `variable:write` (`needs`).

### Workspace settings (S/Environments.tsx:60-380, 486-640; nav label "Workspace settings")
- Page description: "Pause what starts by itself, make a copy, or delete the workspace: these act at once. Its name, where it promotes to and its time zone are saved together, from the bar that appears below." Fields need `workspace:write` (`Can`).
- **Saved together (SaveBar):** Workspace name (max 200; hint says the slug does not change), "Promotion target" (dev only; saved before "Review and promote" works: "Save the new target to review a promotion to it.", CFG-13), Time zone, **Run limit** ("Runs at once", whole number 1-1000, "How many runs of this workspace may be in progress at once. The rest wait their turn."; API `concurrencyLimit`, CP/routes/workspaces.ts:412) (CFG-MP4 = REL-MP5).
- **At once ("Workspace actions"):**
  - Pause triggers / Resume triggers (states "Triggers are on", "Triggers are paused", "Triggers are paused by the instance")
  - Row "Copy workspace", button **Clone workspace**: sheet "Clone X" with Name, Slug, "Rows and files" (Leave them behind: empty tables / Copy them), "Safety" (On / Off). Progress: queued, "Copying…", failed ("The clone failed, and nothing was copied."), then "Copied N resources, N rows in N tables and N files." and what it carries over. "Open the copy".
  - Delete workspace: type the slug. Production: needs `workspace_production:write`, which "no role has until it is added to one by name: an administrator does not have it either", and a link "Export the tenant first". Refused while runs are in progress (CP/routes/environments.ts:243-262).
- **Access** section (Give access, `binding:write`) is the same screen.
- `failureAlert` is on Alerts, not here.

### From code
- `defineConnection`, `defineConnectionGroup`, `defineVariable`, `defineConnector` (SDK/index.ts:580-660); connector defaults to `http`; a group's connector is `http`, `smtp` or your own. YAML: `<name>.connection.yaml`, `.connection_group.yaml`, `.variable.yaml`, `.connector.yaml` (+ `.ts`).
- Script `uses: {connections, connectionGroups, secrets, variables, events, tables, sources}`; trigger source `uses: {connections, secrets, variables}` (M/kinds.ts:195-260, 853-865). `ctx.connection(path)`, `ctx.connections(group).get(key)/.keys()`, `ctx.secret(NAME)`, `ctx.variable(path)` (SDK/context.ts:36-56). In the console, a script's Settings tab edits `uses`, memory, concurrency, worker pool and `onFailure` (SCR-08).
- Flow steps hand over connections/tables/events with `with`, not secrets or variables (M/kinds.ts:273). Nodes `core/http-request`, `core/send-email` (R/packages/nodes/src/index.ts:50, 154).
- Local: `.platform/local.json` `{connections, groups, secrets, variables}`; `groups` is `{ "<group>": { "<key>": {config, credential?, label?} } }` (R/packages/cli/src/local.ts:11-17). A custom connector runs from the repository; `smtp` does not run locally. The CLI has no bind or secret command (D53).
- MCP/agents: "Offer to an agent" covers only scripts and flows (S/OfferToAgent.tsx). Connections are not offered.

### Webhooks, forms, mail
- `verify`: scheme hmac-sha256/sha1, header, secret, encoding, prefix, signed, timestampHeader, toleranceSeconds (default 300) (M/kinds.ts:357-408; K/execution/triggers.ts:205-240). `/hooks/:token`: 120 per minute (E:3711-3717); paused 503 (`workspace_paused`, `trigger_paused`); bad signature 401 `signature_invalid` (E:3760-3790).
- A webhook whose secret is not set tells the sender "The signature does not match."; the refusal kept for the operator says "The secret X is not set in this workspace." (CFG-25, triggers.ts:1342-1365).
- Forms: `/portal/<tenant>/forms/<token>` (16 KB, kernel/apps/front.ts:111, 498); types and access are owned by the operate inventory. Rate limit unverified.
- Tenant mail never uses `SMTP_URL` (config.ts:248, config-vars.ts:225); approval mail does.

### Encryption and masking
- Master key wraps one key per tenant; AES-256-GCM, with context bound in (K/crypto.ts:18-31, tenant-keys.ts). A secret is bound to its tenant, workspace and name. A connection's credential, its OAuth tokens, a group member's credential and a data source's password are sealed under the **row ID**, so a rename, a promotion or a clone cannot make them unreadable (CFG-01, K/execution/sealed.ts). An old row sealed under its path opens once and is sealed again. A credential nothing opens answers 422 `connection_unusable` ("The stored … cannot be read. Someone with connection:write has to enter it again."), and saving without retyping is refused the same way. Master rotation rewraps tenant keys only (not re-read; K/rekey.ts).
- **Masking (SCR-01, WLK-13, WLK-14, D13, D44):** K/execution/redact.ts hides, by value and in URL-encoded, JSON-escaped and base64 forms, every secret, credential, OAuth token and group credential a run was given. It covers logs (`/logs`, run reads), errors, the alert and `onFailure` input, platform events, flow step errors, the flow run page, the editor's Last test panel, approval details (queue, widget, mail, link page), MCP reads of another's work. `console.log` in a script goes to the run's log, masked. A masked field in an expression preview is not computed ("This reads a secret, which a preview does not show, so it cannot be previewed here."). A field is also masked by key name or schema (`writeOnly`, `format: password`, `x-secret`). Not covered: an approval's title, a flow-level expression error on the run list, event-filter refusals that quote a payload; lines stored before the change are masked on read by the values the run was given, but a secret rotated since is not found (fixed/mask.md, mask2.md).
- Worker limits: logs 4 MB per request, output 10 MB; a line's fields over 32 KB are cut with a note.

## (C) Gotchas
1. Dev deploys warn on missing bindings; production and promotions get 409 `bindings_missing` (K/execution/deploy.ts:628-646). What is needed: each script's connections, secrets, variables and data sources, `onFailure.notify`, a trigger source's connections, secrets, variables, a webhook's `verify.secret`, and connections a flow step hands over. A variable with a default, and connection groups, need nothing set up. `bindings_invalid` blocks dev too (:648-670). A refusal is a title, a sentence and a list; each entry has "Set up" into the right workspace (`?setup=`), in the Deploy screen, the DeployMenu dialog, Environments and request review (CFG-04, C/kit/RefusalList.tsx). In production a new connection or variable is set up from the refused preview and listed as "Arrives with the next promotion" (D23).
2. Bindings are read live, but `uses` comes from the bundle the run is pinned to.
3. Undeclared connections validate as HTTP; lookup is deployed → drafts → arriving → the 200 newest uploaded bundles (E:425-460). A binding older than that reads as its old kind (cfg2 limit; `remaining.md`).
4. Connections reach out from **workers**, so "localhost" is the worker's. The control plane's own reach (OAuth token address, IdP, Git, data sources, domains) is limited by `EGRESS_ALLOW`, never a script's. A script's reach is limited by the worker host's firewall: no private, loopback or link-local address unless `WORKER_EGRESS_ALLOW` lists it; needs `NET_ADMIN` (D20, CP/config-vars.ts:292, 331).
5. A test waits 2 minutes for a worker. It now goes to the pool of the script or trigger source that uses the connection (or names it in `onFailure.notify`), and an alert of a failed run to the run's pool; a flow run has no pool, so the default (D42, K/execution/tasks.ts `poolOfConnection`). Custom connectors test with the active bundle, so fail before deploy.
6. Health is the last Test only, with no schedule, but a refused OAuth refresh also writes it. It is forgotten on change, unbind or reconnect; saving the same settings keeps it.
7. Config, including `headers`, is readable with `connection:read`. A changed address at another origin drops the stored credential unless typed again (D10, same for group members, data sources and Git); a path change at the same origin keeps it. The response says `credentialDropped`.
8. A missing webhook secret reads as "The signature does not match." to the sender (the operator's record names the secret).
9. Run logs are masked now (see Encryption and masking). Stored payloads are masked by key and schema, not unmasked.
10. Clone always copies variable values. Safety off also copies secrets, connections, data sources and group members (resealed), not OAuth tokens (Connect again) (K/tenancy/clone.ts:44-110; CFG-11, CFG-12). The sheet says what was copied.
11. Rename keeps bindings, values, group members and the workspace's default alert (K/rename.ts; CFG-17). Secrets cannot be renamed.
12. A failure alert needs an HTTP connection: PATCH refuses an unknown or non-HTTP `notify`, and a bundle check refuses `onFailure.notify` naming one (CFG-18).
13. `connection_unusable` is 422, so the attempt fails and retries may apply.
14. Microsoft needs `offline_access`; Google `access_type=offline` + `prompt=consent`; otherwise it dies with its first token. Presets do both.
15. Deleted: the old "Unbind" label. The screen says "Remove from here". Old text in the published pages may still say Unbind (see (D)).

## (D) Wrong or stale in the published pages (R/packages/docs/content/configure)
Phase 29 did not edit these pages; phase 31 writes them anew.
- `variables.md` and `index.md` say "scripts and flows read"; scripts and trigger sources read (flows hand a connection to a step with `with`).
- `settings.md` says "its limits": the screen has one, the Run limit. It says "clone": the row is titled "Copy workspace", the button reads "Clone workspace". Its description says "delete a dev workspace": any workspace may be deleted, production with `workspace_production:write`.
- Lines for settings.md (cfg2 CFG-11): "With Safety on a clone gets no connection, data source, group member or secret value; with Safety off it gets this workspace's, resealed. OAuth connections are copied without their tokens: connect each again."
- The generated `settings.md` and `errors.md` now say what `EGRESS_ALLOW` covers (CFG-27); check the regenerated pages before quoting. `bindings_missing`'s text and the `uses` description (kinds.ts:208) now say that dev warns.
- Permission text for `workspace_production` is explained in the screen; explain it in settings.md.
- Operator docs exist (self-hosting OAuth/Mail sections); nothing exists for tenants.

## (E) Findings: settled
All ten items of the old list are settled. Outcomes, from `fixed/cfg.md`, `cfg2.md`, `t3-config.md`, `t4-config-ext.md`, `t2-walk-shell.md`:
1. Production catch-22: built, D23 / CFG-04 (arriving connections, variables, data sources, `?setup=`, "Set up" in refusals). In production the wizard never offers a new connection.
2. `?item=`: CFG-07, now read. The object page changes, tests and unbinds (CFG-07, CFG-22, CFG-MP1).
3. Drafted connections in the list: CFG-08.
4. Group dialog: CFG-09 (the connector's own form, Change). Group member credentials still cannot be removed, only replaced.
5. References ignore groups and the default alert: CFG-15.
6. Underscores in Name: CFG-20 / EXT-16. Custom connectors are still not in Kind (use All resources → New).
7. Words on page and list: CFG-22.
8. Variables: CFG-MP3 (Change on the row and page), CFG-23 (empty value, "Empty", names the variable in the toast).
9. Clone text: CFG-11, CFG-12.
10. Supported path in production: D23 (set up from the refused preview).
Also done: D10 stored credential does not follow a changed address (CFG-03); D11 (CFG-02); sealing by row (CFG-01); health and Test pool (D42); read-only members (CFG-26); webhook refusal names the secret (CFG-25); `console.log` to the run's log (D44).
Left on purpose (say so on the page or not at all): the run limit is set only on the settings screen and API; a repository-only `volvel.yaml` `resources` matters for Git sync (D65, see releases inventory); `Tenant.tsx` clone/pause/delete and the data source and group lists do not yet gate by `useMay` (t4-config-ext "Left"); the data source page has no Change or Test beside its row (cfg2 "Found"); a binding older than the 200 newest uploads reads as its old kind; `CreateDialog`s with no `done` still say "Created."; the repository form cannot show the stored user name.

## (F) Screenshots and examples
- **Screenshots:** list with all five health states; the "Arrives with the next promotion" and draft tags; wizard (HTTP; OAuth with redirect address; after Connect; the address-changed notice); 401 test result; a connection's page; groups with the member sheet and a "Not declared" group; secret Value tab; variables with default versus value versus Empty, and the Change sheet; settings with save bar and the Run limit; clone sheet with Safety; `bindings_missing` on promotion with "Set up" links; a read-only member's list.
- **Examples:** Google Sheets and Microsoft Graph end to end; Slack webhook via empty path (`post("")`); Gmail/465 vs 587 SMTP; `ctx.connections("shops").get(input.shop)`; GitHub/Slack/Shopify `verify`; `defineConnector` with `test`; `.variable.yaml` (R/examples/higher-ed-devices/platform/loans/days.variable.yaml); R/examples/acme/src/index.ts:22-29; API binding script (R/examples/fernhill/setup/setup.mjs:285-300); `.platform/local.json` with `groups`.
