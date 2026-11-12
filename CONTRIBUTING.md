# Contributing

Read [docs/master-spec.md](docs/master-spec.md) first. Every change must be consistent with it. If a change needs to contradict the spec, raise it with the owner and change the spec first.

Outside contributions are not accepted yet. A contributor agreement must be in place first.

## Before you push

```sh
pnpm lint
pnpm test
pnpm check:schemas
pnpm check:migrations
pnpm check:licenses
```

CI runs the same checks, on the oldest supported Postgres and the newest.

## Dependencies

Everything that ships in the image must carry an Apache-compatible license. The allowlist is in `scripts/check-licenses.mjs`. Development tools are never distributed, so MPL-2.0 and CC-BY-4.0 are also accepted for them.

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

## API

Every route follows the conventions in [docs/phases/phase-0-foundations.md](docs/phases/phase-0-foundations.md): the `/api/v1` prefix, a TypeBox schema for the request and every response, problem-details errors and cursor pagination. A route without a response schema fails the tests. There are no private routes.

## Access and audit

- Every route declares its access rule in its `config`. A route without one fails the tests and fails at run time.
- Permission checks go through `ctx.authorize` and nowhere else.
- Every change goes through `ctx.mutate`, which writes the audit entry in the same transaction. A change that records no entry is rolled back.
- Never put a secret value, password or key in an audit entry or a log line.
- A new route that changes something must be called in the test suite. A test fails if any such route is not exercised, or succeeds without leaving an audit entry.

## The two contracts

The control plane knows nothing about TypeScript. It depends on the manifest format in `schemas/` and the worker protocol in `docs/contracts/worker-protocol.md`.

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
- Anything that can make a flow run ready to move must be findable by the sweep in `advanceDueFlows`. A direct call to advance is an optimisation, never the only way.
- Expressions are CEL and are only ever evaluated through the sandbox in `kernel/flows/expressions.ts`. Never evaluate one in the main thread, and do not add custom functions: the language must stay the published one.
- Large data does not go through flow state. A step's output over the size limit is stored as a file, and expressions see a note in its place.

## Tenant data

- A deploy never drops a table or a column. What leaves a definition is retired. The purge route is the only code that may drop tenant data, and it must stay explicit and audited.
- No route, and no worker call, accepts SQL. Every statement on tenant data is built from names checked against the catalog (or, for an external source, against what the source reports) and from bound values. Row-level security guards against our own mistakes. It does not contain an injection.
- Everything that reads or writes rows of a workspace table goes through `withData` in `kernel/data/rows.ts`, which switches to the restricted database role and states who is asking. Never query a workspace table on the platform's own role outside the code that changes its structure.
- A table change must be worked out by the pure planner in `kernel/data/plan.ts` and tested there without a database. Applying a plan must stay inside the deploy's transaction.
- The platform never changes the structure of an external data source.
- Reads and writes of rows are not audited one by one. Changes to definitions, bindings and purges are.

## Interface

- The console and client apps use components from `packages/ui`. Do not style with raw colours or sizes: use the theme tokens, through the Tailwind utilities generated from them.
- The interface runs on Preact. `react` and `react-dom` resolve to Preact's compatibility layer, so that Base UI works. Do not add a dependency that needs real React.
- The console calls only the public API.

## Resource kinds

A new kind is one `register` call on the kind registry with a JSON Schema for its body. If adding a kind seems to need a change to permissions, audit or sync, stop: the envelope is missing something, and that is a spec question.

## Code style

Biome formats and lints. TypeScript is strict. Tests use a real Postgres, not a mock.
