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

## Interface

- The console and client apps use components from `packages/ui`. Do not style with raw colours or sizes: use the theme tokens, through the Tailwind utilities generated from them.
- The interface runs on Preact. `react` and `react-dom` resolve to Preact's compatibility layer, so that Base UI works. Do not add a dependency that needs real React.
- The console calls only the public API.

## Resource kinds

A new kind is one `register` call on the kind registry with a JSON Schema for its body. If adding a kind seems to need a change to permissions, audit or sync, stop: the envelope is missing something, and that is a spec question.

## Code style

Biome formats and lints. TypeScript is strict. Tests use a real Postgres, not a mock.
