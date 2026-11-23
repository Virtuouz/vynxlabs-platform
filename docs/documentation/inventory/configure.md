# Inventory: configure

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

Nothing was run; everything here is from reading code and tests.

Path prefixes (absolute): `R`=., `S`=R/apps/console/src/screens, `CP`=R/apps/control-plane/src, `E`=CP/routes/execution.ts, `K`=CP/kernel, `M`=R/packages/manifest/src, `SDK`=R/packages/sdk/src.

## (A) Pages (R/packages/docs/content)

| Path | State / topic id | Purpose |
|---|---|---|
| configure/index.md | exists | Declared in code, set per workspace |
| configure/connections.md | stub, `configure-connections` | List, object page, wizard, groups |
| configure/connection-http.md | new | HTTP fields and auth |
| configure/connection-smtp.md | new | Mail |
| configure/connection-oauth.md | new | Providers, redirect, reconnect |
| configure/connection-groups.md | new (or a section) | Members by key |
| configure/connection-health.md | new | Test, health, troubleshooting |
| configure/binding-and-deploying.md | new | Binding order, dev versus production, clone, rename |
| configure/secrets.md | stub, `configure-secrets` | Secrets |
| configure/variables.md | stub, `configure-variables` | Variables |
| configure/settings.md | stub, `configure-settings` | Workspace settings |
| configure/alerts.md | stub, `configure-alerts` | Overlaps another slice |
| configure/encryption-and-egress.md | new | Keys, masking, network reach |
| build/custom-connectors.md | new | `defineConnector` |
| operate/webhooks-and-forms.md | new or under triggers | Signing secrets, forms |

Topic map: R/apps/console/src/nav.ts:134-139. F1 opens help (R/apps/console/src/Shell.tsx:1240).

## (B) Contents

### Connections list (S/Execution.tsx:673-792)
- **Button:** "New connection".
- **Columns:** Connection, Health, Used by, Kind ("HTTP", "Mail (SMTP)", "OAuth 2.0", or a connector path), Points to (baseUrl or host; else "Not bound").
- **Row actions:**
  - Test, if bound and, for OAuth, connected
  - Set up / Change
  - Unbind: "Unbind X? Scripts that use it will fail until it is bound again.", listing affected users
- **Health** (R/apps/console/src/kit/health.tsx; Execution.tsx:643-670): "Not tested", "Reached" + "N ms · tested …", "Failed" + reason, "Not connected" + Connect, "Needs reconnecting" + Reconnect. Blank if unbound.
- **Used by:** up to 3 links, "and N more", "Nothing deployed uses it", "Could not be read" (kit/references.tsx).
- **Empty:** "No connections yet".
- **Nudges:** nav badge "N missing" (Shell.tsx:168); Overview "N connections have nothing bound here" + Configure (S/Overview.tsx:358).

### Object page (S/ObjectPages.tsx:75-148)
- **States:** "Set up here"/"Not set up here"; "Answered"/"Did not answer".
- **Button:** "Change where it points".
- **Meta:** Kind, What it is for, Credential Set/None, Declared ("Deployed" / "Only set up here, or in a draft"), Last changed, Last check.
- **Tabs:** Used by (drafts included), Where it points (raw JSON).

### Wizard (S/ConnectionWizard.tsx)
Sheet "New connection" / "Set up X".
1. **1 · What it is** (404-506)
   - Connection select, including "A new connection…"
   - Name (lowercase, digits, dashes, slashes; no underscore) and Kind (built-ins only)
   - OAuth: Provider (Google, Microsoft, Another provider), "Directory (tenant)" (default `common`), "Redirect address" with copy
   - Presets: 69-101
2. **2 · Settings**: form drawn from the connector's schema.
3. **3 · Token or key / Password / Client secret / Secret**: stored shows "Stored · set … by …" + Replace / "Keep the stored one" (kit/SecretField.tsx).
4. **4 · Save and test** or **Connect and test**
   - Saved; Connect/"Connect again"; Test/"Test again"; "Testing…"/"Waiting for a worker…"; "Change the token or key"
   - Non-OAuth tests automatically on Save; OAuth on return from the provider
   - Footer: Close, Save/"Save again"

### Connector fields
All schemas set additionalProperties false.
- **http** (SDK/http.ts:55-99): `baseUrl`* "Address" (`^https?://`); `headers` "Headers sent with every request" (not for credentials); `auth` "How the credential is sent": "Authorization: Bearer"; "In a header of your choice" (`name` "Header name"); "HTTP Basic" (`username` "User name"). Omit `auth` and the credential is never sent. Requests outside the origin throw (SDK/http.ts:112). Test is GET of baseUrl, below 400 passes.
- **smtp** (SDK/smtp.ts:46-64): `host`* "Mail server" (max 253), `port` 1-65535 (587), `security` starttls (default)/tls/none, `from`* "Sent from" (3-320), `username`. Test connects and signs in, sends nothing. Timeouts 15 s/15 s/60 s (R/packages/worker/src/smtp.ts). Client: `send({to,cc,bcc,replyTo,subject,text,html})` → `{messageId}`; text or html required.
- **oauth2** (SDK/oauth2.ts:43-73): `baseUrl`* "API address", `authorizeUrl`* "Authorization address", `tokenUrl`* "Token address", `clientId`* "Client ID" (max 150), `scopes` (max 50), `authorizeParams` "Extra authorization parameters", `clientAuth` body (default)/basic, `headers`, `testPath` "What Test asks for".

### OAuth runtime (K/execution/oauth.ts)
- Redirect `<PUBLIC_URL>/api/v1/oauth/connections/callback`, one per instance. Authorization code + PKCE S256; 10-minute, single-use state; the same signed-in member must finish.
- Reserved parameters override `authorizeParams`. Token timeout 10 s. Refreshes 2 minutes ahead under a per-connection lock; rotated refresh tokens kept.
- 5xx/429/unreachable: transient, current token used while valid. Other refusals → `needs_reconnect`.
- Workers get only the access token and settings, never the refresh token or client secret.
- Changing `authorizeUrl`, `tokenUrl`, `clientId` or `scopes` drops tokens (:45).
- Audit: `connection.oauth_started`, `oauth_connected`, `oauth_refresh_failed`.

### Connection groups (S/Execution.tsx:1308-1462)
- **"Add a member":** Key, Name, Address, "How the credential is sent" (No credential / Authorization: Bearer / In a header of your choice), Header name, Credential.
- **Columns:** Key, Name, Points to, Credential Set/None, Remove.
- **Draft:** "Draft, never deployed" + "Open the draft"; "Removing"; "Draft".
- **Key:** `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`; label max 200. Re-adding a key replaces it.
- **oauth2 refused:** M/bundle-check.ts:224. `keys()` returns at most 1000.

### API and permissions
E:2089-2780. Under `/tenants/:t/workspaces/:w`:
- `connection-bindings[/path]` (GET; PUT `{config,credential?}`, null clears, omitted keeps; max 65,536; DELETE), `connectors`, `connection-groups`, `connection-group-members/:key/*`, `connection-tests` (202 task), `connection-oauth`, `variable-values`, `secrets`, `references`.
- `connection|secret|variable:read/write`. A new wizard connection also needs `resource:write`; following a Test needs `run:read` (E:2769).
- Built-in `developer` has these writes; `viewer` `*:read`. `workspace_admin` is extended by migrations after 0005; check current content. The console does not appear to hide Configure buttons by permission.

### Secrets (S/Tenant.tsx:790-855; ObjectPages 199-300; CP/routes/workspaces.ts:392-545)
- **List:** Name, Used by, Last set (… by …); Delete ("Delete the secret X? Anything that uses it will fail.").
- **"New secret":** Name (`^[A-Za-z_][A-Za-z0-9_]*$`, max 127), Value (1-65,536). POST refuses a taken name; PUT upserts.
- **Page tabs:** Value (Replace → "Replace the value"; read "from its next run"), Used by.
- Workspace-scoped only. **No versions, history, rollback or expiry.**
- No API returns a value, to anyone. Readers: a run whose script declares it (CP/routes/worker.ts:562), webhook signature checks, unsafe clone.
- A secret is not a resource: no `defineSecret`, no YAML kind.

### Variables (S/Execution.tsx:794-875; ObjectPages 150-197)
- **Columns:** Variable (draft tags), Read by, For, Value here ("Default: …").
- **Button:** "Set variable" (Variable picker, Value). **Row:** "Use default".
- **Strings only**, max 65,536. Not secret: shown to readers, and the value is in the audit log (E:2943).
- Made in All resources → New → Variable ("What it is for"; "Value when a workspace sets none (optional)").

### Workspace settings (S/Environments.tsx:52-330)
- **Saved together (bar):** Workspace name (max 200; slug fixed), "Promotes to" (dev only), Zone.
- **At once:** Pause/Resume triggers; "Clone workspace" (Name, Slug, "Rows and files", "Safety"); "Delete workspace" (type slug; production needs `workspace_production:write`; refused while runs are in progress).
- **API-only:** `concurrencyLimit` 1-1000. `failureAlert` is on Alerts.

### From code
- `defineConnection`, `defineConnectionGroup`, `defineVariable`, `defineConnector` (SDK/index.ts:535-638); connector defaults to `http`. YAML: `<name>.connection.yaml`, `.connection_group.yaml`, `.variable.yaml`, `.connector.yaml` (+ `.ts`).
- Script `uses: {connections, connectionGroups, secrets, variables}`. `ctx.connection(path)`, `ctx.connections(group).get(key)/.keys()`, `ctx.secret(NAME)`, `ctx.variable(path)` (SDK/context.ts).
- Flow steps hand over connections/tables/events with `with`, not secrets or variables (M/kinds.ts:530). Nodes `core/http-request`, `core/send-email` (R/packages/nodes/src/index.ts:50,154).
- Local: `.platform/local.json` `{connections,secrets,variables}` (R/packages/cli/src/local.ts). The CLI appears to have no bind/secret command.
- MCP/agents: "Offer to an agent" covers only scripts and flows (S/OfferToAgent.tsx). Connections are not offered.

### Webhooks, forms, mail
- `verify`: scheme hmac-sha256/sha1, header, secret, encoding, prefix, signed, timestampHeader, toleranceSeconds 300 (M/kinds.ts:357-408). `/hooks/:token`: 120 per minute; paused 503; bad signature 401 (E:3285).
- Forms: `/portal/<tenant>/forms/<token>` (16 KB); types text, textarea, email, number, date, select, checkbox; access anyone/signed_in. self-hosting says 20/min per visitor.
- Tenant mail never uses `SMTP_URL`; approval mail does.

### Encryption
Master key wraps one key per tenant; AES-256-GCM binds each value to tenant, workspace and name (K/crypto.ts, tenant-keys.ts). Master rotation rewraps tenant keys only.

## (C) Gotchas
1. Dev deploys warn on missing bindings; production and promotions get 409 `bindings_missing`. A variable with a default, and connection groups, need nothing bound. `bindings_invalid` blocks dev too (K/execution/deploy.ts:570-605). Script `onFailure.notify` counts.
2. Bindings are read live, but `uses` comes from the bundle the run is pinned to.
3. Undeclared connections validate as HTTP; lookup is deployed → drafts → last 5 bundles (E:381-440).
4. Connections reach out from **workers**, so "localhost" is the worker's. Egress guard covers only the control plane: OAuth token address, IdP, Git, data sources, domains. `core/http-request` without a connection is also unguarded.
5. A test waits 2 minutes for a worker; `queueTask` is given no pool, so it runs in the default pool, not a script's pool. Custom connectors test with the active bundle, so fail before deploy.
6. Health is the last Test only, with no schedule, but a refused OAuth refresh also writes it. It is forgotten on change, unbind or reconnect; saving the same settings keeps it.
7. Config, including `headers`, is readable with `connection:read`. Changing baseUrl keeps the stored credential: `connection:write` can send it elsewhere.
8. A missing webhook secret reads as "The signature does not match."
9. Masking covers payloads only, by key or schema `writeOnly`/`format: password`/`x-secret` (K/execution/redact.ts). I found no redaction of run **logs**; stored payloads are unmasked.
10. Clone always copies variable values. Safety off copies secrets, connections and data sources, not OAuth tokens (Connect again) or group members (K/tenancy/clone.ts:34).
11. Rename keeps bindings, values and group members (K/rename.ts). Secrets cannot be renamed.
12. Failure alerts need an http connection; others fail at delivery (R/packages/worker/src/runner.ts:130).
13. `connection_unusable` is 422, so the attempt fails and retries may apply.
14. Microsoft needs `offline_access`; Google `access_type=offline` + `prompt=consent`; otherwise it dies with its first token. Presets do both.

## (D) Wrong or stale
- variables.md and index.md say "scripts and flows read"; scripts and trigger sources only.
- generated/settings.md:117 and errors.md `egress_refused` claim EGRESS_ALLOW limits scripts and connections. False; self-hosting.md:297-299 is right. Fix at source: CP/config-vars.ts:284, M/errors.ts:109.
- M/kinds.ts:208 "Each must be bound before a deploy": untrue for dev.
- settings.md says "its limits"; the screen has none. The page description says "delete a dev workspace" though production has the button.
- Permission text for `workspace_production` is narrower than the docs need; explain it in settings.md.
- Operator docs exist (self-hosting OAuth/Mail sections); nothing exists for tenants.

## (E) Likely bugs and questions
1. **Production catch-22:** "New connection" PUTs a draft first, which production refuses (`production_workspace`, K/authoring.ts:70); the list omits undeployed connections. First binding before a promotion seems API-only. Same for a default-less variable: the picker lists only known ones.
2. "Change where it points" goes to `?item=`, which Connections never reads (Execution.tsx:673-700): opens nothing.
3. Drafted-but-unbound connections are missing from the list (E:2181 omits drafts), unlike variables and groups; creating one in the wizard answers "taken".
4. Group dialog hardcodes `baseUrl` and bearer/header: smtp and custom-connector groups cannot be filled, and there is no Basic. Its "Change" is retyping.
5. References ignore connection groups and the workspace-default alert's connection, so Unbind understates impact.
6. Wizard Name rejects underscores that M/envelope.ts allows; custom connectors are not in Kind (use All resources → New).
7. "Reached/Failed" versus "Answered/Did not answer"; the object page has no OAuth state or Test.
8. Variables: no per-row edit, page cannot set a value, empty string not enterable, toast says "Created."
9. Settings' clone text says it gets no connection, though Safety off copies them.
10. If group or variable binding is meant to work in production before promotion, what is the supported path?

## (F) Screenshots and examples
- **Screenshots:** list with all five health states; wizard (HTTP; OAuth with redirect address; after Connect); 401 test result; groups with the dialog; secret Value tab; variables with default versus value; settings with save bar; clone dialog with Safety; `bindings_missing` on promotion.
- **Examples:** Google Sheets and Microsoft Graph end to end; Slack webhook via empty path (`post("")`); Gmail/465 vs 587 SMTP; `ctx.connections("shops").get(input.shop)`; GitHub/Slack/Shopify `verify`; `defineConnector` with `test`; `.variable.yaml` (R/examples/higher-ed-devices/platform/loans/days.variable.yaml); R/examples/acme/src/index.ts:22-29; API binding script (R/examples/fernhill/setup/setup.mjs:290); `.platform/local.json`.
