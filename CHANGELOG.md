# Changelog

Versions before 1.0 may change the API, the manifest format and the worker protocol. Each entry says what an operator and a tenant developer need to do.

## 0.5.0, in progress

Authoring in the console (phase 7). This entry grows as the phase is built.

### For operators

- **Database change.** Migrations 0019 to 0025 run on start.
- **Single sign-on.** A tenant can connect an identity provider over OIDC or SAML, for its members or its end users, and operators can connect one for themselves under Instance. The control plane makes outbound requests to the provider. Nothing new has to run. See "Single sign-on" in the self-hosting guide.
- **The console's sign-in asks for the email first,** then for a password or the organisation's sign-in.
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
- `defineTheme` sets a workspace's colours where they differ from the tenant's.
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
