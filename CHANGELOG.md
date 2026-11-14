# Changelog

Versions before 1.0 may change the API, the manifest format and the worker protocol. Each entry says what an operator and a tenant developer need to do.

## Unreleased: phase 9, maturity

### For operators

- **History is no longer kept forever.** A retention pass runs every ten minutes, on one replica at a time. On the first pass after upgrading it removes runs (with their logs, steps and stored inputs and outputs) and events older than 30 days, refused webhook and SCIM requests older than 7 days, and audit entries older than 400 days. **To keep more, set `RETENTION_RUNS_DAYS`, `RETENTION_EVENTS_DAYS`, `RETENTION_REFUSALS_DAYS` or `RETENTION_AUDIT_DAYS` before upgrading.** A tenant can set its own periods, from 1 day (90 for audit) to 3650, under Retention. See "Retention" in the self-hosting guide.
- **The audit log is kept a month to a partition.** Migration 0047 moves the existing entries, in one transaction, at start. A month past every tenant's period is exported to the object store under `audit/<yyyy-mm>/` and then dropped. Entries stay append-only one by one.
- **Database changes.** Migrations 0046 (rate-limit counters) and 0047 (retention and the audit partitions) run on start.
- **Each script attempt runs in a process of its own,** ended at its time limit or when canceled, whatever it is doing, and limited to the script's `memoryMb` (512 MB by default). It never holds the worker's credential.
- **Managed workers run as a user of their own,** `vxrun` (uid 10001), where the container may switch users; Docker's defaults allow it. Where it may not, a tenant whose code is written outside the operators gets no managed worker. Set `MANAGED_WORKER_USER=same` on a development machine. See "Workers the instance starts" in the self-hosting guide.
- **Standalone workers can read their credential from standard input,** with `--token-stdin`, which keeps it out of reach of the scripts they run.
- **Rate limits are shared across replicas,** counted in the database, and each tenant has at most one managed worker however many replicas run.
- **Runs update live.** The console keeps one stream of run events open per tab (`GET /api/v1/tenants/<id>/stream`, server-sent events), and each replica one more database connection to listen for them. A proxy must not buffer that path; see the self-hosting guide. Migration 0048 adds the triggers that announce changes.
- **Runs, flow runs and steps have a `state`** beside their `status`: `queued`, `running`, `waiting_approval`, `waiting_time`, `succeeded`, `failed`, `canceled` or `skipped`. A flow waiting for a person is no longer shown as running. `status` is unchanged.
- **A run has a page of its own,** at `/t/<tenant>/workspaces/<workspace>/runs/<id>`, for script runs and flow runs alike. The old `/flow-runs/<id>` addresses send the browser there. The runs list opens a run beside it with `?run=<id>`.
- **Runs are run again from their page.** A script run, with the same input or another, on the version it ran or the active one (`POST …/runs/<id>/rerun`). A flow run, from the start, or from its failed step (`POST …/flow-runs/<id>/retry`), which keeps what already succeeded, granted approvals included, and runs the rest; `GET …/flow-runs/<id>/retry-plan` says which steps are which.
- **Runs can be searched and tagged.** `/activity` takes `q` (a path's start, a run ID, a tag, or words of the error) and `tag`, and pages with `cursor`. A script tags its run with `ctx.run.tag(...)`; a webhook, event or schedule trigger with `tags`, CEL expressions over what it was given. Migration 0049 adds the columns, and `pg_trgm` where the database allows it.
- **Moving between workspaces is no longer audited.** It is remembered, and the console opens where the member last was.

## 0.5.0, not yet released

Authoring in the console (phase 7).

### For operators

- **Database change.** Migrations 0019 to 0032 run on start.
- **The console is sent compressed.** The image carries Brotli and gzip copies of the console's files and sends them itself. A proxy in front no longer needs to compress them.
- **Old try-out bundles are removed.** A bundle made only to try a draft out is removed a week later, with the test runs that ran on it.
- **A pull from a repository has a size limit:** 2000 files and 8 MB in the repository's folder.
- **Provisioning over SCIM.** An identity provider can push people and groups to `/api/v1/scim/v2/<provider>` with a token made under the provider's Provisioning tab. The provider must be able to reach the instance. It was tested against the request shapes Entra ID and Okta send, not against a live tenant of either. See "Provisioning (SCIM)" in the self-hosting guide.
- **Members can be suspended in a tenant, and accounts disabled.** A suspended member holds nothing in that tenant until resumed. A disabled account can sign in nowhere, and its API keys are refused. A provider does both by push; an admin and an operator can by hand.
- **Removing a member from a tenant, or an end user,** now also removes their ties to the tenant's identity providers.
- **Tenants can send mail through their own mail server,** with an `smtp` connection. Workers make the outbound connection to it. The instance's `SMTP_URL` stays for the platform's own invitations and is not lent to tenants.
- **Forms are served under a tenant's portal,** at `/portal/<tenant>/forms/<token>`, to anyone given the address unless the form asks for a sign-in. They are held to the portal's rate limit for forms.
- **A webhook can be held open for up to 25 seconds** while a flow answers it. A proxy in front of the instance must allow a request that long. The answer is the tenant's own, and is sent with a sandboxing content security policy.
- **Workers run connectors and trigger sources of a tenant's own.** They are code from the tenant's bundle, like scripts, and need `code:write` to be written in the console.
- **Apps can be made in the console,** with no code, over a workspace's tables. The image carries the app that draws them, under `SCREENS_DIR`. An instance run from source needs `pnpm build`, which builds it.
- **Three new built-in roles' worth of access:** `app_maintainer` builds and deploys apps made in the console and no code; `portal_reader` opens apps and reads rows; `developer`, `workspace_admin` and `app_maintainer` may keep dashboards.
- **Sharing an app with `viewer` shows every row.** That role reads everything, a table's every row included. Share with `portal_reader` or `portal_user`, which the Share button does.
- **Single sign-on.** A tenant can connect an identity provider over OIDC or SAML, for its members or its end users, and operators can connect one for themselves under Instance. The control plane makes outbound requests to the provider. Nothing new has to run. See "Single sign-on" in the self-hosting guide.
- **The console's sign-in asks for the email first,** then for a password or the organization's sign-in.
- **A tenant can require single sign-on.** Passwords are then refused for the people a provider covers. Members bound at the instance keep theirs: keep one such account.
- **An imported tenant's identity providers arrive paused,** with their domains to be proved again.
- **End users have groups and attributes,** and a table's rows can be ruled by them. New permissions: `end_user_group` and `sso`, both held by `tenant_admin`.
- **Code can be written in the console.** Whoever holds `code:write` in a dev workspace can write a script there and deploy it, and workers run it as it is. `tenant_admin` and `developer` hold it. Set `console_code` to false on a tenant to turn it off there.
- **The control plane compiles TypeScript.** It never runs what it compiles. The image now carries esbuild.
- **A tenant can connect a git repository** over HTTPS with an access token. The control plane makes outbound requests to it.
- **Exporting a tenant** is now the permission `export:write`. Roles that held `tenant:*` are given it.
- The console is a React application. Nothing changes for an operator.

### For tenant developers

- **Apps are built with React.** Replace `preact` with `react` and `react-dom`, `@preact/preset-vite` with `@vitejs/plugin-react`, `preact/hooks` imports with `react`, and `class=` with `className=`. The kit's text, number and date fields report through `onChange`.
- **A `platform/` folder in the repository** holds resources managed in the console, one `<path>.<kind>.yaml` each, with source beside it as `<path>.<kind>.ts`. `platform build` includes them. A path defined in the code and in a file is an error.
- Code written in the console may import `@vynxlabs/sdk` and `node:` modules only.
- A bundle from an older CLI still deploys, and keeps the workspace's console-managed resources.
- `defineWebhook`, and `trigger.webhook()` in a flow, take `input: "request"` to be given headers, query, method and the raw body, and `verify` to check an HMAC signature against a workspace secret. A webhook's address also takes forms and text.
- A sub-flow step may choose its flow when it runs: `flowFrom` with `allow`.
- `@vynxlabs/app` gains `startFlow`, `flowRun` and `runFlow`. `flow_run:write` can be bound at one flow.
- **Totals.** `table().aggregate({ group, measures, filter })` in apps and `ctx.table().aggregate(...)` in scripts give counts, sums, averages, the least and the most, over rows or groups of them, under the table's row policy. `GET …/aggregate/{table}` over HTTP.
- **Settings can be made in the console.** Connections, connection groups, variables, events, schedules and triggers are made and changed under Resources in a dev workspace, and deployed like any draft.
- **A repository that uses a core node builds as bundle format 3.** Deploying it keeps what was made in the console, as a bundle of an older format does.
- **Build with the 0.5.0 SDK** to deploy to a 0.5.0 instance with new features. A bundle built with an earlier SDK, back to 0.2.0, keeps deploying.
- **Connectors.** `defineConnector({ path, configSchema, create })` says how a kind of connection reaches an outside system, and a connection names it with `connector`. `smtp` is built in beside `http`: a script is given `send({ to, subject, text })`.
- **Trigger sources.** `defineTriggerSource({ mode: "webhook" | "poll", run })` decides what a webhook's request or a schedule's tick starts. `defineWebhook`, `defineSchedule` and a flow's triggers take `source`.
- **Nodes.** `defineScript({ node: { label, category, takes } })` puts a script in the flow editor's palette, with a form made from its input schema. A step can hand it a connection, a table or an event with `with`, and give an expression per field with `inputs`.
- **Core nodes.** `core/http-request`, `core/send-email`, `core/table-read`, `core/table-write` and `core/publish-event` can be named in any flow. The build adds them. Paths under `core/` are the platform's.
- **A flow can answer its webhook.** `trigger.webhook({ respond: "flow" })` and `step.respond({ status, headers, body })`.
- **Forms.** `trigger.form({ title, fields })` in a flow, or `defineForm` for a script, makes a page the platform serves. What is sent is the input.
- `defineInterface` declares pages of widgets over tables, and `defineApp({ interface })` serves one as an app with no code. Most are made in the console instead.
- The widget interface grew: a widget can be handed the chosen row, more rows to ask for, and ways to edit and delete. `card` and `cards` are new, and `chart` takes `mark`, `x` and `y` in place of a spec. An app's own widgets keep working.
- `defineTable` takes `policy: { rules: [...] }`: a rule allows `read`, `write` or `all` when a column holds the person's ID, names a group they are in, or equals one of their attributes. `{ owner }` works as before.
- `defineBinding` can name a group of end users: `{ type: "end_user_group", name }`.
- An app that draws its own sign-in screen can list the tenant's identity providers at `GET /tenants/{id}/end-user-auth/providers` and send the browser to each one's path under the tenant's sign-in pages.
- `defineConnectionGroup` declares a set of connections of one kind. Members are added per workspace in the console with no deploy, and a script that lists the group in `connectionGroups` picks one when it runs: `await ctx.connections("shops").get(input.shop)`.

### Changed

- Bundle format 3: a manifest's `ownership` may be `ui`. A script's body may carry `source` and `node`.
- `GET /permissions` lists every permission. The audit routes take `area`, `actorId`, `target`, `from` and `to`, and entries carry `actorLabel`.
- A flow run's steps carry `pickedUpAt`.
- The worker protocol gains two routes for connection groups. A tenant's own worker must be upgraded before it runs a script that uses one.
- `POST /tenants/:t/workspaces/:w/mcp` is a Model Context Protocol server over the API: the scripts and flows a caller may start, as tools.

## 0.4.0, not yet released

Apps (phase 6): interfaces built from a tenant's repository and served by the instance, end users, the addresses apps are served at, and branding.

### For operators

- **Database change.** Migration 0018 runs on start. Upgrading from any earlier version is supported and tested.
- **Where apps are served.** By path at `PUBLIC_URL`, with nothing to set. Set `APPS_URL` to a second hostname to serve them there and keep them away from the console's address: do this on an instance with more than one tenant. A tenant can register hostnames of its own, each for one app. Your proxy holds the certificates. See the self-hosting guide.
- **Mail is optional.** `SMTP_URL` and `MAIL_FROM` let the instance send end users' invitations and password resets. Without them nothing is sent and staff pass the links on.
- **Workers.** A 0.3.0 worker keeps working. It does not tell scripts who started a run, so upgrade tenants' own workers before they deploy a script that uses `ctx.run.startedBy`.
- The proxy in front must pass the `Host` header through and set `X-Forwarded-Proto`.

### For tenant developers

- `defineApp` declares an app from a directory with an `index.html`. `platform build` compiles it with the repository's own Vite: add `vite` and `@preact/preset-vite` to `devDependencies`. `platform dev` serves it with reload against a workspace.
- `@vynxlabs/app` is the browser client: `table`, `runScript`, `useQuery`, `useSession`. `@vynxlabs/ui` is the component kit, with forms from a JSON Schema and charts from a Vega-Lite spec.
- `defineBinding` and `defineRole` say who may open an app and read a table. Principals now include `{ type: "end_users" }`, every signed-in end user of the tenant, and `{ type: "end_user", email }`. The built-in `portal_user` role opens apps and reads and writes rows under each table's policy.
- `defineTheme` sets a workspace's colors where they differ from the tenant's.
- `ctx.run.startedBy` says who started a run. `ctx.table(t).as(ctx.run.startedBy.id)` reads and writes as that person.
- A script can be started, and its run read, by someone who holds `run:write` at that script alone.
- **Rebuild to deploy apps.** A bundle with an app is format 2 and needs the 0.4.0 SDK and CLI. A repository without apps still builds as format 1, and bundles built with 0.2.0 and 0.3.0 keep deploying.

### Changed

- The claim answer of the worker protocol gained `startedBy`. A data request's `as` must now be a member or an end user of the tenant.
- A binding's `principalType` may be `end_user` or `end_users`.
- A tenant export also carries end users, the files of apps, and branding. Hostnames and sign-ins are not carried.
- `POST …/runs` and `GET …/runs/{id}` check the permission at the script as well as at the workspace.
- A request that arrives with a session cookie and changes something is refused when its `Origin` is another site.

## 0.3.0, not yet released

Environments and portability (phase 5), on top of data (phase 4) and events and flows (phase 3).

### For operators

- **Database change.** Migrations 0010 to 0017 run on start. Upgrading from any earlier version is supported and tested.
- **A new database role.** The platform now creates one sign-in per database for requests for tenants' rows. The Postgres user must be allowed to create roles. Custom tables made by an earlier version are handed over to it on start.
- **Dedicated databases.** A tenant's custom tables can live in a database registered under Instance, Database locations.
- **Tenant export and import**, and deleting a tenant.
- **Bundles keep working across the upgrade.** A bundle built with the 0.2.0 SDK still deploys, promotes and rolls back.
- A standalone worker can be run from `deploy/worker`.
- **A stop under load is fixed.** An export, a deploy or a worker asking for work could hold a database connection while waiting for another. With enough of them at once, every connection was held and the instance stopped answering. Each now uses the connection it has. A request that finds every connection busy fails after five seconds instead of waiting without limit. The queue keeps two connections of its own, so an instance opens up to two more than before.

### For tenant developers

- Tables, external data sources and files: `defineTable`, `defineDataSource`, `ctx.table`, `ctx.source`, `ctx.files`.
- Events and flows: `defineEvent`, `defineFlow`.
- `platform promote` activates a dev workspace's bundle in the workspace it is linked to. `--preview` shows what would change.
- A script can name the worker pool it runs on: `worker: "plant"`.
- A deploy lists what it changed, including what it did to the data. A deploy or a rollback never drops data.

### Changed

- The deploy summary gained `data` and `changes`.
- A workspace has `triggersPaused`. A tenant has `dataLocation` and `managedWorkers`.
- A run has `pool` and `waitingFor`.

## 0.2.0

Execution (phase 2): the SDK, bundles, deploys, workers, the queue, schedules, webhooks and the run log.

## 0.1.0

The kernel (phase 1): tenants, workspaces, members, roles, secrets, the audit log and the console.
