# Phase 6: apps

Status: built and verified locally on 2026-11-12, on two instances started from the image. Not yet run in CI or on Fly.io
Last updated: 2026-11-12

Phase 6 adds custom interfaces. An app is a resource, built from a tenant's repository and served by the instance to the tenant's staff, to its own pool of end users, or to anyone, as its bindings say, in the tenant's branding.

**Exit criterion:** a custom app serves both staff and portal users in production.

## Spec sections implemented

| Master spec section | What phase 6 delivers |
| --- | --- |
| Apps and user interface: developer-built apps | The `app` kind, built with the repository's own Vite, served by the instance |
| Apps and user interface: addresses | By path, on a second address, and at a hostname a tenant registers |
| Apps and user interface: branding | Theme tokens per tenant, overridden per workspace, and a logo |
| Apps and user interface: unified experience | The component kit grows, with charts wrapped in its styling. The app client |
| Identity and permissions: identity pools | The end-user pool per tenant, its sign-in, and guests with a rate limit |
| Identity and permissions: one authorization check | End users and app sign-ins go through the same check, capped to what apps use |
| Extensibility: interface widget | The published interface, with table, form and chart registered through it |
| Tenancy: tenant export and import | End users, app files and branding travel |

Not in this phase: generated apps, a drag-and-drop builder, single sign-on for end users, groups of end users, owners for files, policies beyond the owner rule, issuing certificates.

## Owner decisions

| Area | Decision |
| --- | --- |
| Scope | Phase 6, after fixing the stop under load found by CI. The Fly.io deploy and publishing stay open |
| Proof | The example gains a portal for staff and customers and a public page |
| App addresses | By path on the instance's address, and optionally a second address for every app |
| Hostnames of a tenant's own | Built now. One hostname serves one app at its root. Certificates are the proxy's |
| End-user sign-in | Password, with invitation and reset by one-time link. Mail optional. Sign-up per tenant, off by default |
| Charts | Vega-Lite, loaded on demand |

## Spikes

### Better Auth as a pool per tenant

Failed, on a locked choice. Better Auth 1.7 finds a person by email alone (`findUserByEmail` asks for `email = ?` and nothing else) and refuses a sign-in whose email is not an email. One configuration therefore cannot hold the same address in two tenants. The ways around it were a configuration per tenant with a query-rewriting adapter, or disguising the tenant inside the email. Both are more fragile than what they replace.

What was built instead: the control plane keeps the end-user pool itself. Passwords are hashed by Better Auth's own hasher, so members and end users have one hash format. Sessions and one-time links are random tokens stored as SHA-256 hashes, as API keys already are. Invitation links, the hand-off for staff and sessions tied to one address had to be the platform's own in any case.

This is a deviation from the kernel phase's plan, and from the spec's wording that authentication is Better Auth. The spec now records it as provisional, with a question for the owner.

### Building an app from the CLI

Passed. Vite, with the Preact and Tailwind plugins, is loaded from the tenant repository, not shipped with the CLI. Two reasons: a repository pins its build tool like any dependency, and Tailwind's compiler carries a license (MPL-2.0) that is allowed for tools and not for what ships. Built with `base: "./"`, a page's addresses are relative, and the instance adds a `<base>` element when it serves the page. One build is then served under a path and at the root of a hostname. Two builds of the same source give the same bundle digest.

### Vega-Lite under Preact and a strict policy

Passed.

| Point | Result |
| --- | --- |
| Licenses | Passed with no change to the allowlist. Vega, Vega-Lite and the interpreter are BSD-3-Clause |
| No evaluation of strings as code | A chart with a calculation, a filter, color and a tooltip draws under Node's `--disallow-code-generation-from-strings`. The same chart through Vega's default path fails under that flag, so the flag bites |
| In a browser, under `script-src 'self'` | Draws, with no policy violation reported |
| Real React | None. Vega has no React dependency, and Base UI's tabs, fields, dialog and menu pass under the compatibility layer |
| Size | The kit with Preact and Base UI is 23 kB compressed. The chart engine is about 275 kB compressed, in chunks that load only when a chart is shown |

### Carrying a member to another address

Passed. A member at the instance's address asks for a code for one tenant and one address. The code is stored hashed, works once, within a minute, and only at the address it was made for. There it becomes a sign-in for that tenant, limited to what apps use. The address must be the instance's address for apps or an enabled hostname of that tenant, so the route cannot be used to send someone elsewhere.

## Findings

- **Hostnames need an owner check, not a reachability check.** The plan had a check that the name resolves and answers. On a shared instance that proves nothing about whose name it is: a tenant could register another tenant's name before they do. A registration now carries a DNS TXT record that only the name's owner can create, and is enabled once that is found. An operator may enable a name without it, for names that exist only inside a network.
- **A `signedIn` route is a member's own account.** `/me`, the tenant list and API keys are open to anyone signed in. A member's sign-in at an app's address would have been able to make an API key for that member, which is the whole of their access. Those routes now refuse app sign-ins. Found by the test that walks what such a sign-in can reach.
- **Paths are unique across kinds.** An app and a table cannot both be `orders`. The example's app is `portal`.
- **A table's owner rule does not make a table safe to bind widely by itself.** `portal_user` holds `data:read` and `data:write`. Bound at the workspace it reaches every table there, including tables with no owner rule. The example binds it at the app and at one table.
- **Anonymous bindings make every caller "related" to a tenant.** A tenant with anything public answers 403, not 404, to a member of another tenant. That was so before this phase and only shows now that public things exist.
- **Guests cannot own rows.** A row written by someone not signed in has no owner, and an owner rule then hides it from everyone but staff. A public form should start a script.
- **Guests cannot read a run.** Whoever started a run may read it, and a guest is nobody. A guest may be allowed to start a script, and cannot wait for its answer.
- **The rate limit for guests is per replica.** It is kept in memory. Three replicas allow three times as much.
- **The link to a registered hostname assumes the default port.** It is built from the scheme of `PUBLIC_URL` and the name. Behind a proxy on 443 that is right.
- **Format 1 is still written.** A repository without apps builds the bundle it always did, so it keeps deploying to an instance that has not been upgraded.
- **A stop under load, found before this phase began.** See the changelog for 0.3.0. Every control plane and CLI test, including this phase's, also passes with the instance held to a single database connection.

## The app kind and its files

- `app`: `title`, `description`, `entry` (the page among its files) and `fallback` (whether an address under the app that names no file answers with the page, default true).
- Bundle format 2 adds `assets`: for each file, the app's path, the file's path, its SHA-256, size and content type. The digest covers them. Format 1 is hashed as before, and its digests do not change.
- `PUT …/workspaces/{w}/bundle-assets/{sha256}` takes one file. `GET` on the same address says whether the tenant has it. Files are stored once per tenant, under `assets/<tenant>/<sha256>`, with a row in `bundle_asset`.
- A bundle is refused with 409 `assets_missing` until every file it lists is there. So a deployed bundle always has something to serve, and promotion moves nothing.
- Unreferenced files are not collected. They go when the tenant does.

## Serving

Everything that is not the API and not the console is served before routing, by `kernel/apps/front.ts`, because what a path means depends on the name the request came to.

| Address | What is there |
| --- | --- |
| `PUBLIC_URL` | The console, the API, `/apps/<tenant>/<workspace>/<app>/` and `/portal/<tenant>/` |
| `APPS_URL`, when set | Apps and portal pages at the same paths, and the API. No console. `PUBLIC_URL` redirects apps here |
| A registered hostname | Its app at `/`, portal pages under `/_/`, and the API for that tenant only |

- An app is served to whoever holds `app:read` at it. Someone not signed in is sent to the sign-in page and back. Someone signed in without it gets a page that says so.
- The page gets a `<base>` element, the workspace's theme stylesheet, and its context in an element browsers do not run: the API's path, the tenant, workspace and app, where the sign-in pages are, and who the page was served to.
- Every app response carries a content security policy: scripts and connections from the same address only, no inline script, no objects, no framing by others. Styles may be inline, because components set them on elements.
- A file whose name carries a hash may be kept by the browser for a year. Others are revalidated. Both are private to the person they were served to.
- The sign-in, sign-up, set-password, forgot-password and start pages are rendered by the control plane with no script, styled from the same tokens.

## Signing in

| Who | Where | With |
| --- | --- | --- |
| A member | The instance's own address | Better Auth's session, as before |
| An end user | Any address apps are served at | A sign-in to one tenant's apps: a cookie per tenant, good at the address it was made at |
| A member, at another address | `APPS_URL` or a registered hostname | The same kind of sign-in, reached by the hand-off, limited to that tenant and to what apps use |
| A script, a worker, the CLI | Anywhere | An API key or worker credential, as before |

- The cookie is `vx_app_<tenant id>`, HTTP-only, `SameSite=Lax`, and secure when the request came over HTTPS. Thirty days for an end user, twelve hours for a carried-over member.
- A request that arrives with a cookie and changes something must have come from a page of that address.
- `end_user` and `end_users` are principals. `end_users` is every signed-in end user of the tenant, bound without an ID, as `anonymous` is.
- An end user, and a member signed in at an app's address, hold only permissions of the kinds `app`, `data`, `data_all`, `file`, `run`, `script`, `table` and `theme`, whatever they are bound to.
- `portal_user` is built in: `app:read`, `data:read`, `data:write`.

## End users

- `POST /tenants/{t}/end-users` adds one and answers with an invitation link. `…/{id}/links` makes a new invitation or a reset. `PATCH` renames, disables and enables. `DELETE` removes the account, its sign-ins and its bindings, and leaves its rows.
- A link works once. Invitations last seven days, resets two hours. A new link of a kind ends the earlier one. Setting a password from a link ends every sign-in the person had.
- `…/end-user-auth/sign-in`, `sign-out`, `sign-up`, `password-links`, `passwords` and `password` are the same things for an app that wants its own screens.
- A wrong email and a wrong password take the same time and give the same answer. Asking for a reset says the same for any email.
- With `SMTP_URL` and `MAIL_FROM`, links are mailed. Without, the person who made the link is shown it.
- `GET /tenants/{t}/session` says who is calling, to anyone.

## Hostnames

- `POST /tenants/{t}/domains` registers a hostname for one app of one workspace. A name is unique on the instance, and the instance's own names are refused.
- `…/{id}/checks` looks for the TXT record `_vx-challenge.<hostname>`, whose value is derived from the tenant and the name, and asks the instance for its check address through the name. The first verifies. The second is advice.
- `PATCH` enables, disables, or points the name at another app. Enabling needs a verified name, or an operator.
- A change takes effect in the process that made it at once, and in other replicas within thirty seconds.

## Branding

- `theme` kind: `tokens` and `dark`, each a set of the kit's token names with plain values. A workspace has at most one.
- `PUT /tenants/{t}/portal` sets the tenant's own tokens and whether people may sign up. `PUT` and `DELETE …/portal/logo` set and remove a PNG, JPEG or WebP of up to 512 KB.
- `GET /tenants/{t}/theme.css` and `…/workspaces/{w}/theme.css` are public stylesheets: the kit's values, then the tenant's, then the workspace's.
- A value may be letters, digits, spaces and `# ( ) , . % " ' -`, up to 200 characters, and may not contain `url`, `image`, `expression`, `var(`, `env(` or `attr(`. It is checked when stored and when written out.

## Scripts and apps

- A run records who started it, and the claim answer carries it as `startedBy`. `ctx.run.startedBy` in the SDK.
- A data request's `as` must be a member or an end user of the tenant.
- `POST …/runs` needs `run:write` at the workspace or at the script. `GET …/runs/{id}` is open to whoever started the run.

## The kit, the client and the CLI

- `@vynxlabs/ui` gains tabs, toasts, pagination, checkbox, number, date and text-area fields, a form drawn from a JSON Schema, a page frame and a chart. It can be built and published. Workspace consumers still read its sources.
- The interface widget extension point is `InterfaceWidget` in the SDK: a name, a JSON Schema for its configuration, and a render function. The kit's table, form and chart are registered through `registerWidget`.
- `@vynxlabs/app` is the browser client: `table`, `runScript`, `session`, `signOut`, `useQuery`, `useSession`. It reads the page's context and calls the public API.
- SDK: `defineApp`, `defineTheme`, `defineRole`, `defineBinding`.
- CLI: `build` compiles apps, `deploy` uploads the files the tenant lacks and then the bundle, and `dev` serves an app from its source with reload, against a workspace, as the developer.
- Console: a workspace's Apps tab, and End users, Branding and Domains for a tenant. It shows a tenant's colors while that tenant is open.

## Schemas

Migration 0018.

| Change | Purpose |
| --- | --- |
| `bundle_asset` | The files of apps, once per tenant |
| `end_user`, `end_user_token` | The pool, and one-time links |
| `app_session`, `app_handoff` | Sign-ins to a tenant's apps, and the code that carries a member over |
| `app_domain` | Hostnames registered for apps |
| `tenant_portal` | A tenant's tokens, logo and sign-up switch |
| `binding` accepts `end_user` and `end_users` | The new principals |
| Role `portal_user`. `workspace_admin` gains `app:*` and `theme:*` | Roles |

Version 0.4.0 for the core, SDK, CLI, worker, kit and app client.

## Tests

| Area | Where |
| --- | --- |
| Bundles with apps, serving at each kind of address, end users, pool isolation, the cap on what an app sign-in reaches, the hand-off, hostnames, branding, the guest limit, a tenant moved with its end users and apps | `apps/control-plane/src/apps.test.ts` |
| The example's portal through a real worker. `platform dev`. Deploy with files | `packages/cli/src/example.test.ts`, `build.test.ts` |
| The app client | `packages/app/src/app.test.tsx` |
| Kit components, the chart without code evaluation, the widget interface | `packages/ui/src/*.test.tsx` |
| Console screens | `apps/console/src/screens/*.test.tsx` |
| Upgrades from every earlier level, with the new migration | `upgrade.test.ts` |
| Nothing holds one connection while waiting for another | `pool.test.ts`, and the whole suite on one connection |

## Check against the master spec

Checked on 2026-11-12 against the build on the `claude/modest-johnson-9fi53e` branch.

### Guiding principles

| Principle | Result |
| --- | --- |
| 1. One platform, one experience | Met. Apps use the same permission check, audit path, API and kit as the console. End users are principals like any other |
| 2. Everything is a resource | Met. `app` and `theme` are kinds. Who may open an app is a binding |
| 3. Code first, git as the source of truth | Met. An app, its theme and its bindings are defined in the repository and arrive by deploy |
| 4. Language-neutral core | Met. The control plane serves files a bundle lists and never builds one. `startedBy` is a field in the protocol |
| 5. Same software everywhere | Met. Path, second address and registered hostname are configuration and data. One image ran all three |
| 6. Minimal footprint | Met. No container was added. Mail is optional |
| 7. No central dependency | Met. Nothing calls out unless mail or a hostname check is asked for. No fonts or scripts from elsewhere |
| 8. Tenant portability | Met. End users, app files and branding travel. Hostnames and sign-ins do not, and the export says so |
| 9. The core uses its own SDK | Met where it applies. The kit's widgets register through the published interface. The console does not yet use `@vynxlabs/app` |
| 10. Reuse libraries and engines, not applications | Met. Vega-Lite is an engine wrapped in the kit's styling. Nodemailer is a library |
| 11. Keep the end-user version possible | Met. Forms, tables and charts are drawn from JSON descriptions through the widget interface, which is what generated screens need |
| 12. Kernel before features | Met. No generated apps, no builder, no single sign-on for end users |

### Ownership promise

| Promise | Result |
| --- | --- |
| You own the code | Unchanged. An app is built with public tools from the tenant's repository |
| You own the data | Extended. The end-user pool and app files are in the export, in the same plain formats |
| You own the keys | Unchanged |
| No lock-in | Not weakened. A staff member's reach from an app's address is narrower than from the console, and is audited |
| Any location | Extended. A hostname may be one that exists only inside a client's network |

### Verification

| Check | Result |
| --- | --- |
| Lint, type check, schema, migration and license checks | Passed |
| Every test on Postgres 16 | Passed: 39 files, 483 tests. Postgres 18 was not run here, and is left to CI |
| The control plane and CLI tests with the instance held to one database connection | Passed |
| The image, built from the Dockerfile | Built, and both instances below ran from it. The build here added this machine's proxy certificate and took the base image from a mirror, because Docker Hub refused the pull. The Dockerfile's own steps were otherwise unchanged |
| **Exit criterion.** Instance A at `http://localhost:8080`, apps by path. The example deployed to a dev workspace with the CLI and promoted to production | Passed. Twelve app files were uploaded with the deploy to dev. Promotion activated the same bundle in production and uploaded none |
| Staff, in a real browser | Passed. A member signed in to the console, saw both apps with their addresses and who they are open to, invited a customer and was shown the link to pass on, since the instance sends no mail. In the portal the member saw every order and published a notice |
| Portal users | Passed. The customer opened the invitation, chose a password, and asked for an order. A script on a managed worker wrote it as theirs and it appeared, with the chart. A second customer saw none of it, was answered 404 for the row by its ID and for a change to it, 403 for writing a row as the first, and 403 for the tenant's members, end users, secrets and runs |
| Guests | Passed. Anyone read the public page and its notices. Reading orders and writing notices answered 401, and the portal sent them to sign in. Of 140 requests in a row, 120 were answered and 20 refused with 429, while a signed-in customer was not limited |
| Branding | Passed. The tenant's colors and logo showed on the sign-in page and in the console. The app showed the workspace's theme over the tenant's |
| Policy | Passed. Apps ran under `script-src 'self'` with the chart drawn. No page reported an error or a policy violation. The first run did report one: the platform's own pages carried an inline style their policy forbids. Fixed, and a test now holds it |
| Moving the tenant | Passed. Exported from A and imported into B with the CLI. On B the customer signed in with the password they had and saw their order |
| Instance B behind Caddy with TLS, `APPS_URL` set | Passed. The instance's own address sent apps to the second address. The console and member sign-in answered 404 there. The customer's cookie was secure, HTTP-only and for that host alone. A member signed in at the console was not signed in there |
| The hand-off | Passed. "Staff sign-in" carried the member over. From the app's address the tenant's members, end users and secrets answered 403, and `/me`, the tenant list and making an API key answered 401 |
| A hostname of the tenant's own, `portal.acme.test` on B | Passed. Unverified, the tenant's admin could not enable it. An operator could. The customer then signed in at `/_/sign-in` and used the app at the root, with a secure cookie for that name. Another tenant's API answered 404 there, a console path was the app's own, and staff were carried over to it. From there `/me` and making an API key answered 403 |
| The new console screens | Apps, End users, Branding and Domains loaded and were used as above. Screenshots were read |
| The self-hosting guide | Its settings were used to bring both instances up. Its Caddy lines were used as written, with Caddy's own certificate authority in place of a public one. Its Fly.io lines were not run |

One full run of the tests, out of five, failed seven tests in `execution.test.ts`, all of them about workers and timing. It did not happen again and its output was not kept. It may be load on this machine, or it may be the five-second wait for a connection added before this phase. It is listed below.

### Known gaps

- Postgres 18, CI and Fly.io. None was run for this phase. CI runs on a pull request, and none is open.
- The seven worker tests that failed once. See above.
- The owner's confirmation of the end-user pool. See Proposed deviations.
- Single sign-on for end users, and for members.
- Groups of end users. A binding names one end user or all of them.
- Owners for files. End users are given no access to files.
- Policies beyond the owner rule.
- A custom hostname is verified by a public DNS record. A name inside a network needs an operator.
- The DNS record was not exercised for real: the verification's names do not exist in DNS. The tests cover a missing record and an operator enabling without one.
- Mail was exercised through a stand-in for the transport, not against a mail server.
- The guest limit is per replica and by address.
- Files of apps that no bundle lists any more are kept until the tenant is deleted.
- The console keeps its own API client. It does not use `@vynxlabs/app`.
- The console's picker for one end user in Access shows the first 200.
- The start page of a portal lists production's apps only. A dev workspace's app is reached by its address.
- `platform dev` acts as the developer, with an API key. It does not show the app as an end user would see it.
- A link to a registered hostname assumes the default port.
- Charts take their categorical colors from five tokens, three of which mean a status. More than five series repeat.
- Generated apps and a builder: phase 7.
- Nothing is published: no image, no package. The Fly.io deploy from phase 0 and the production exit check from phase 2 are still open.
- The address for security reports, and default retention for runs and audit entries.

## Proposed deviations

From the master spec, for the owner:

| Spec | Built | Why |
| --- | --- | --- |
| Authentication is Better Auth. The kernel phase reserved a second Better Auth configuration for end users | The end-user pool is kept by the control plane, with Better Auth's password hashing | Better Auth cannot hold one email in two tenants. See the spike |

From the approved plan:

| Plan | Built | Why |
| --- | --- | --- |
| Tables `end_user_account`, `end_user_session`, `end_user_verification` | `end_user`, `end_user_token`, `app_session`, `app_handoff` | They followed Better Auth's shapes, which are not used |
| A hostname is checked by resolving it and asking it a challenge path | Verified by a DNS TXT record. Reaching it is advice | Reaching a name says nothing about whose it is |
| Groups of end users | Not built. One end user, or all of them | Not needed for the exit criterion. Listed as a gap |
| `ctx.caller` | `ctx.run.startedBy` | It is a fact about the run, and schedules and webhooks have one too |
| The app SDK generates typed table access | Types come from the table's definition, imported as a type | Nothing to generate, and no server code reaches the browser |
| The console moves onto `@vynxlabs/app` | It keeps its own small client | The console is not served as an app and has no app context. Listed as a gap |
| `portal_user` includes files | It does not | A file has no owner |
| A chart of volume in the example | A chart of orders by status | The example's table has the data for it |
