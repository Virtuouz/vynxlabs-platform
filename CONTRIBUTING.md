# Contributing

Read [docs/master-spec.md](docs/master-spec.md) first. Every change must be consistent with it. If a change needs to contradict the spec, raise it with the owner and change the spec first.

Outside contributions are not accepted yet. A contributor agreement must be in place first. Bug reports and feature requests are welcome in [Issues](https://github.com/volveldev/volvel/issues/new/choose), and questions in [Discussions](https://github.com/volveldev/volvel/discussions). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## How work is tracked

- **Issues** hold the work: one per bug, feature or task, with its acceptance criteria. Planned work uses the *Milestone task* form.
- **Milestones** group the issues of one body of work, such as a release or one of the steps in [docs/before-publicizing.md](docs/before-publicizing.md). The [project board](https://github.com/orgs/volveldev/projects) shows what is next and what is in progress.
- **Labels** say the type (`type: bug`, `type: feature`, `type: docs`, `type: chore`, `type: security`), the area (`area: console`, `area: worker`, …), the priority (`priority: p0` to `p2`) and the state (`status: needs-triage`, `status: blocked`).
- **A pull request** closes its issue (`Closes #123`) and is squash-merged. Its title is a [conventional commit](https://www.conventionalcommits.org): `feat(console): …`, `fix(worker): …`, `docs: …`, with `!` for a breaking change. CI checks the title.
- **A change a person would notice adds a changeset** (`pnpm changeset`): how big it is, and what to tell people about it, in the words of the changelog. Tests, CI and refactors need none. See [.changeset/README.md](.changeset/README.md).
- **Releases** gather the changesets. A "chore: release" pull request stays open with the next version and its `CHANGELOG.md` section, and merging it tags `vX.Y.Z`, which publishes the release: the image is pushed, and the packages are only staged on npm, so the owner approves each staged package on npmjs.com with 2FA before anyone can install it. The GitHub release shows the changesets' words first, then every merged pull request grouped by its `type:` label. Before 1.0, `minor` is something new or anything that breaks what worked, and `patch` a fix.
- **Design** stays in the repository: the [spec](docs/master-spec.md), the [contracts](docs/contracts), and a new [architecture decision record](docs/adr) for a decision that later work must follow.

## Before you push

```sh
pnpm lint
pnpm test
pnpm check:schemas
pnpm docs:check
pnpm check:migrations
pnpm check:licenses
```

## How CI runs

CI has two speeds, so that a small change is checked in minutes. One check, **CI passed**, sums up the rest, and it is the one a pull request needs.

| What | When | What runs |
|---|---|---|
| **Nothing** | A pull request that changes only `docs/`, `.changeset/`, issue templates and Markdown at the root | The summary |
| **Fast** | Any other pull request | Lint, types, the build, the checks above, the image, and the unit tests the change reaches (`vitest --changed`, which follows imports), on the newest Postgres. Browser tests only if `e2e/` changed |
| **Full** | Every push to `main`, every night, the release pull request, a pull request that changes dependencies, migrations, `ci.yml` or the build settings, and any pull request labeled `full-ci` | Every unit test in four shards on the oldest supported Postgres and the newest, and every browser test |

- **`main` may break; a release may not.** A bug that only an unrelated test catches is found on `main` after the merge. When `main` or the nightly run fails, CI opens an issue titled "main is failing" (or adds to it). The release pull request always runs the full suite, so nothing ships that has not passed it.
- **To run the full suite on a pull request**, add the `full-ci` label, then re-run the workflow (or push). Do it for a change whose reach imports do not show: configuration read at run time, SQL, a change to something many screens share.
- **Locally**, `pnpm test` is the full unit suite. `pnpm exec vitest run --changed origin/main` is the fast lane's.

## Dependencies

Everything that ships in the image must carry an Apache-compatible license. The allowlist is in `scripts/check-licenses.mjs`. Development tools are never distributed, so MPL-2.0 and CC-BY-4.0 are also accepted for them. A few packages are accepted by name under a license that is not on the list, each for one term of its license and with the reason beside it (`BY_NAME`): elkjs, mermaid's graph layout, under EPL-2.0, unmodified. Accepting a package by name does not accept its license for anything else.

Before adding a dependency, check that:

- its license is on the allowlist, including what it pulls in;
- it makes no network call the operator did not configure: no telemetry, update check or license check;
- it is a library or an engine, not an application with its own interface or user system.

Adding a license to the allowlist is a decision for the owner.

## Database

- Only `packages/db` talks to Postgres. Everything else goes through the tenant router: `router.platform()` for instance-level tables, `router.forTenant(id)` for anything that belongs to a tenant.
- A schema change is a new file in `packages/db/migrations`, named `NNNN_description.sql` with the next number. Run `pnpm lock:migrations` to record it.
- Migrations move forward only. Never edit one that has merged. Fix a mistake with a new migration.
- A migration must work on a database from any earlier release, so it cannot rely on application code having run in between. Put data backfills in the migration.
- Inside a transaction, use that transaction for every query. Work that holds one connection and waits for another from the same pool stops the instance once enough of it runs at once. Look things up before the transaction opens, or pass it down. The queue has connections of its own for this reason. `pool.test.ts` runs an instance on a single connection to catch it.

## API

Every route follows these conventions. A route without a response schema fails the tests.

- **Prefix and version.** All routes live under `/api/v1`. A breaking change means a new prefix.
- **Description.** OpenAPI 3.1 at `/api/v1/openapi.json`, generated from the routes' TypeBox schemas, one for the request and one for every response.
- **No private routes.** The console and apps use this API and nothing else.
- **Bodies.** JSON, with camelCase field names.
- **Identifiers.** UUIDv7 strings.
- **Timestamps.** ISO 8601 in UTC, for example `2026-11-11T17:05:00.000Z`.
- **Errors.** RFC 9457 problem details with content type `application/problem+json`. Fields: `type`, `title`, `status`, `detail`, `instance`, plus `code` (a stable machine-readable string) and `requestId`. Validation errors add an `errors` array of `{path, message}`.
- **Lists.** Cursor pagination. Request: `limit` (default 50, maximum 200) and `cursor`. Response: `{"items": [...], "nextCursor": "..." | null}`. Cursors are opaque.
- **Request IDs.** Every response carries `x-request-id`. An incoming value is kept if it is well formed.
- **Logs.** One structured JSON line per request, with the request ID.

## Access and audit

- Every route declares its access rule in its `config`. A route without one fails the tests and fails at run time.
- Permission checks go through `ctx.authorize` and nowhere else.
- Every change goes through `ctx.mutate`, which writes the audit entry in the same transaction. A change that records no entry is rolled back.
- Never put a secret value, password or key in an audit entry or a log line.
- A new route that changes something must be called in the test suite. A test fails if any such route is not exercised, or succeeds without leaving an audit entry.

## The two contracts

The control plane knows nothing about TypeScript. It depends on the manifest format in `schemas/` and the worker protocol in `docs/contracts/worker-protocol.md`.

- A third contract, of the same standing, is the tenant export format in `docs/contracts/tenant-export.md`.
- What each bundle format adds, and what a reader and a writer owe each other, is in `docs/contracts/bundle.md`.
- The control plane never imports or runs a tenant's code. Only the CLI (at build time) and the worker do.
- A change to a kind's schema, the bundle format or a worker route is a change to a contract. Update the schema or the protocol document in the same commit, and keep old bundles and old workers working.
- The execution tests build bundles by hand and speak the protocol over plain HTTP on purpose. Keep them free of the SDK.

## Runs

- A run started by a person or an API key is audited. A run started by a schedule or a webhook is recorded on the run itself.
- Delivery is at-least-once. Anything that reacts to a run must be safe to see it twice.
- A secret value or a credential must never reach a log line, a run record or an audit entry. `execution.test.ts` checks this.

## Flows

- A flow is data. The engine reads nodes, edges and expressions from the manifest and nothing else.
- Advancing a flow run must stay safe to repeat. It acts only on what the tables say, inside one transaction, under the lock for that flow run. Never keep flow state in memory.
- Anything that can make a flow run ready to move must be findable by the sweep in `advanceDueFlows`. A direct call to advance is an optimization, never the only way.
- Expressions are CEL and are only ever evaluated through the sandbox in `kernel/flows/expressions.ts`. Never evaluate one in the main thread, and do not add custom functions: the language must stay the published one.
- Large data does not go through flow state. A step's output over the size limit is stored as a file, and expressions see a note in its place.

## Tenant data

- A deploy never drops a table or a column. What leaves a definition is retired. The purge route is the only code that may drop tenant data, and it must stay explicit and audited.
- No route, and no worker call, accepts SQL. Every statement on tenant data is built from names checked against the catalog (or, for an external source, against what the source reports) and from bound values. Row-level security guards against our own mistakes. It does not contain an injection.
- Everything that reads or writes rows of a workspace table goes through `withData` in `kernel/data/rows.ts`, which switches to the restricted database role and states who is asking. Never query a workspace table on the platform's own role outside the code that changes its structure.
- A table change must be worked out by the pure planner in `kernel/data/plan.ts` and tested there without a database. Applying a plan must stay inside the deploy's transaction.
- The platform never changes the structure of an external data source.
- Reads and writes of rows are not audited one by one. Changes to definitions, bindings and purges are.

## Tenancy and portability

- A new table that holds anything of a tenant's goes in the list in `kernel/tenancy/tables.ts`, in the place its foreign keys allow, with a decision on whether an export carries it. A test fails until it is there. Deleting, exporting and importing a tenant all work from that list.
- An export must stay readable. A change to what it contains or how is a change to `docs/contracts/tenant-export.md`, and a format that old files do not fit is a new format version.
- Anything a workspace can start by itself must respect `triggers_paused`. A clone and an imported tenant rely on it.
- A tenant's custom tables and their catalog may be in another database. Reach them through `kernel.data`, never through `kernel.db`. Inside a write, use `kernel.data.within(trx, tenantId)`, so that the change commits with the rest.
- The catalog exists in two places: the platform's migrations and the bootstrap in `packages/db/src/datastore.ts`. Change both. A test holds them to each other.
- A migration must work on a database from any earlier release, with data in it. `upgrade.test.ts` tries every level. If a migration needs rows to look a certain way, it makes them so itself.
- Raising `OLDEST_SUPPORTED_BUNDLE_CORE` strands tenants' deployed bundles. It is the owner's decision and needs a deprecation period.

## Interface

- The console and client apps use components from `packages/ui`. Do not style with raw colors or sizes: use the theme tokens, through the Tailwind utilities generated from them.
- The interface runs on React. The console, the kit and tenant apps share one copy of it. Keep the kit small: tenant apps ship everything it imports.
- The console calls only the public API.
- An app calls only the public API too, through `@volvel/app`. If an app needs something the API lacks, the API grows.

## The polish gate

- A change to anything a person sees is not done until the **Polish gate** of its pull request is answered: the seven steps of [the gate](docs/engineering/milestone-polish-quality-gate.md), checked against [the rules POLISH-001 to 015](docs/engineering/polish-prevention-rules.md), with a browser walk on a throwaway instance seeded with `examples/fernhill`.
- A fix goes in the shared piece, not only where the symptom was seen, and lists the other places that use it (POLISH-013).
- `apps/console/src/enforce.test.ts` fails on a navigation section that `e2e/polish-setup.ts` neither measures nor lists in `NOT_MEASURED`. More guards from the gate come with the fixes that make them pass.

## Apps, end users and addresses

- What a request may reach depends on the address it came to. Ask `kernel.hosts.place(request)`. Never compare the `Host` header yourself, and never accept a member's console session anywhere but the instance's own address.
- Callers are resolved in one place, `resolvePrincipal`. A new way to be signed in goes there.
- An end user, and a member signed in at an app's address, hold only what apps use. The list is `APP_FACING` in `kernel/authorize.ts`. Adding a kind to it gives it to every portal user who is bound widely enough: do it on purpose.
- A route declared `signedIn` is a member's own account. It is refused to app sign-ins. A new route that acts on the member behind a session must do the same.
- Everything outside `/api` that is not the console is served by `kernel/apps/front.ts`, before routing. An app's page gets its content security policy there. Do not serve tenant-supplied bytes from a route of your own.
- The platform's own pages for apps carry no script. Keep it so: their policy allows none.
- A theme value is written into a stylesheet. It is checked by `isThemeValue` when stored and again when written. Do not loosen the pattern without thinking through what it could then load.
- An app's files are developer code, like a script. They are named by checksum and never change, so they may be cached, but only for the person they were served to.
- Tables for end users go in `kernel/tenancy/tables.ts` like any other. Sign-ins and one-time links never travel in an export.
- The control plane never builds an app. The CLI does, with the tenant repository's own tools.

## Resource kinds

A new kind is one `register` call on the kind registry with a JSON Schema for its body. If adding a kind seems to need a change to permissions, audit or sync, stop: the envelope is missing something, and that is a spec question.

## Code style

Biome formats and lints. TypeScript is strict. Tests use a real Postgres, not a mock.
