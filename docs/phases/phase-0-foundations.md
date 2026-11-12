# Phase 0: foundations

Status: in progress
Last updated: 2026-11-11

Phase 0 sets up everything later phases assume. It ships no product feature.

**Exit criterion:** an empty instance boots locally and on a container host, and migrations run on start.

## Spec sections implemented

| Master spec section                               | What phase 0 delivers                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| System architecture                               | The control plane as one stateless, versioned image over Postgres and S3-compatible storage |
| Tenancy and deployment model: data routing        | The tenant routing layer, with the shared location working                                  |
| Tenancy and deployment model: single-host install | A Compose stack that runs the whole platform on one machine                                 |
| Tenancy and deployment model: upgrades            | Migrations that run on start, move forward only and tolerate skipped versions               |
| Resource model: common envelope                   | The envelope schemas, the kind registry and the emitted JSON Schema files                   |
| System architecture: one public API               | API conventions and a machine-readable description                                          |
| Licensing: dependencies                           | A license allowlist enforced in CI                                                          |
| Technology decisions                              | Control plane language and hosting provider, both now locked                                |

Not in this phase: tenants and workspaces as managed objects, identity, permissions, secrets, audit, the console, the SDK, the CLI, the queue and workers.

## Decisions

| Area                   | Choice                                                           | Notes                                                                                                              |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Runtime                | Node 24 LTS, TypeScript strict, ES modules                       | Locked in the master spec                                                                                          |
| Workspace              | pnpm workspaces, TypeScript project references, built with `tsc` | No extra build orchestrator until one is needed                                                                    |
| HTTP framework         | Fastify                                                          | MIT                                                                                                                |
| Schemas                | TypeBox                                                          | MIT. A TypeBox schema is a JSON Schema, so one definition serves manifests, API validation and the API description |
| Database access        | Kysely over the `pg` driver                                      | MIT. A typed SQL builder, so tenant routing and per-workspace schemas stay explicit                                |
| Migrations             | Plain SQL files and an in-house runner                           | Small enough to own, and it must meet rules no off-the-shelf tool meets exactly                                    |
| Lint and format        | Biome                                                            | MIT or Apache 2.0                                                                                                  |
| Tests                  | Vitest, with integration tests against a real Postgres           | No database mocks                                                                                                  |
| Logs                   | pino, structured JSON                                            | Ships with Fastify                                                                                                 |
| Object store client    | AWS SDK v3 S3 client                                             | Apache 2.0. Works with any S3-compatible endpoint                                                                  |
| Bundled object store   | SeaweedFS                                                        | Apache 2.0. Used by the Compose stack. Any S3-compatible store can replace it                                      |
| Postgres               | 16 or newer                                                      | CI tests 16 and the latest release                                                                                 |
| Hosts                  | Fly.io, and single-host Compose for VPS and on-prem              | The image has nothing provider-specific                                                                            |
| Continuous integration | GitHub Actions                                                   |                                                                                                                    |

These library choices are provisional in the master spec's sense: build on them, keep them swappable. The database driver is confined to one package and the HTTP framework to one app.

## Repository layout

```
apps/control-plane/      the control plane service
packages/db/             database access, migration runner, tenant routing
packages/manifest/       envelope schemas, kind registry, validation
schemas/                 emitted JSON Schema files, checked in
deploy/compose/          single-host stack
deploy/fly/              Fly.io configuration
docs/                    master spec and phase docs
scripts/                 repository checks
```

A package is created when the phase that needs it starts. Phase 0 creates no placeholders for the SDK, CLI or console.

## Migration framework

### Rules

- Migrations are numbered SQL files in `packages/db/migrations`, named `NNNN_description.sql`.
- They run automatically when the control plane starts, before it listens.
- They move forward only. There are no down migrations. A mistake is corrected by a new migration.
- A migration that has shipped is never edited. `packages/db/migrations.lock.json` records a SHA-256 checksum per file, and CI fails if a recorded file changes.
- Each migration runs in its own transaction.
- The runner takes a Postgres advisory lock for the whole run, so several control plane replicas starting together are safe. The losers wait, then find nothing to do.
- If the database holds a migration the image does not know, the database is newer than the image. The control plane refuses to start with a clear error.
- If an applied migration's checksum differs from the file, the control plane refuses to start.

### Skipped versions

Migrations are cumulative and ordered. A database at any earlier point reaches the current state by applying the files it is missing, in order. No migration may assume that application code from an intermediate release has run. Data backfills therefore live inside migrations.

### Schema

`platform_migration`: `version` (integer, primary key), `name`, `checksum`, `applied_at`.

## Tenant data routing

Every data access resolves through the routing layer. Phase 0 builds the layer and the shared path. Phase 1 builds tenancy on top of it. Phase 5 adds dedicated databases.

### Schema

`tenant`, created by migration 0001 and extended in phase 1:

| Column          | Type              | Notes                                                                        |
| --------------- | ----------------- | ---------------------------------------------------------------------------- |
| `id`            | uuid, primary key | UUIDv7, generated by the control plane                                       |
| `slug`          | text, unique      | Lowercase letters, digits and hyphens                                        |
| `data_location` | jsonb             | `{"kind": "shared"}` by default, or `{"kind": "dedicated", "ref": "<name>"}` |
| `created_at`    | timestamptz       |                                                                              |

A dedicated location holds a reference name, never a connection string. The credentials behind it are a secret, which arrives with phase 1 secrets and phase 5 routing.

### Interface

- `router.platform()` returns a handle for instance-level tables: `platform_migration` and `tenant` itself.
- `router.forTenant(tenantId)` looks up the tenant's data location and returns a tenant-scoped handle. The handle carries the tenant ID, and exposes the database for that location.
- For a shared location the handle uses the platform database.
- For a dedicated location the router raises `DedicatedLocationNotSupportedError` until phase 5.
- An unknown tenant raises `TenantNotFoundError`.

### No bypass

- `packages/db` does not export its connection pool.
- No other package may import the `pg` driver or construct a Kysely instance. A lint rule and a repository check enforce this.

## Manifest envelope

### Two schemas

The master spec lists eight envelope fields. Files name a resource by path only, and the control plane assigns the internal ID and the version. So there are two schemas:

| Field           | Authored manifest | Stored resource | Notes                                     |
| --------------- | ----------------- | --------------- | ----------------------------------------- |
| `kind`          | yes               | yes             | Lowercase, for example `script`           |
| `schemaVersion` | yes               | yes             | Positive integer, per kind                |
| `path`          | yes               | yes             | See the grammar below                     |
| `workspace`     | yes               | yes             | The workspace's slug in a manifest        |
| `ownership`     | yes               | yes             | `code` or `ui`                            |
| `body`          | yes               | yes             | Validated by the kind's own schema        |
| `id`            | no                | yes             | UUIDv7, immutable                         |
| `version`       | no                | yes             | Positive integer, assigned on each change |

The authored manifest is what the build emits and what a bundle contains. The stored resource is what the registry holds from phase 1.

### Path grammar

A path is one or more segments joined by `/`. A segment starts with a lowercase letter or digit and continues with lowercase letters, digits, `_` or `-`. A path is at most 255 characters. Examples: `sync_orders`, `billing/invoices/send-reminder`.

### Kind registry

A kind is registered with its name, its schema version and a JSON Schema for its body. Validation checks the envelope, then looks up the kind and version and checks the body. Adding a kind is one registration and touches nothing else, which is what keeps permissions, audit and sync kind-agnostic.

Phase 0 registers no real kinds. Each kind arrives with the phase that implements it.

### Emitted schemas

`pnpm emit:schemas` writes the envelope schemas to `schemas/`. They are checked in. `pnpm check:schemas` fails if the checked-in files differ from the code. These files are the language-neutral manifest contract: an SDK in another language validates against them.

## Public API conventions

These apply to every route in every phase.

- **Prefix and version.** All routes live under `/api/v1`. A breaking change means a new prefix.
- **Description.** OpenAPI 3.1 at `/api/v1/openapi.json`, generated from the route schemas. A route without a schema fails the build's tests.
- **No private routes.** The console and apps use this API and nothing else.
- **Bodies.** JSON, with camelCase field names.
- **Identifiers.** UUIDv7 strings.
- **Timestamps.** ISO 8601 in UTC, for example `2026-11-11T17:05:00.000Z`.
- **Errors.** RFC 9457 problem details with content type `application/problem+json`. Fields: `type`, `title`, `status`, `detail`, `instance`, plus `code` (a stable machine-readable string) and `requestId`. Validation errors add an `errors` array of `{path, message}`.
- **Lists.** Cursor pagination. Request: `limit` (default 50, maximum 200) and `cursor`. Response: `{"items": [...], "nextCursor": "..." | null}`. Cursors are opaque.
- **Request IDs.** Every response carries `x-request-id`. An incoming value is kept if it is well formed.
- **Logs.** One structured JSON line per request, with the request ID.

### Routes in phase 0

| Route                      | Purpose                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/healthz`      | Liveness. Returns 200 whenever the process is serving                                                  |
| `GET /api/v1/readyz`       | Readiness. 200 when Postgres and the object store are reachable, 503 with the failing checks otherwise |
| `GET /api/v1/instance`     | Core version and migration level                                                                       |
| `GET /api/v1/openapi.json` | The API description                                                                                    |

## Configuration and boot

Configuration comes from environment variables only. A bad or missing value stops the boot with one clear line per problem.

| Variable               | Required | Default     | Meaning                                              |
| ---------------------- | -------- | ----------- | ---------------------------------------------------- |
| `DATABASE_URL`         | yes      |             | Platform Postgres connection string                  |
| `S3_ENDPOINT`          | no       | AWS default | Object store endpoint URL                            |
| `S3_REGION`            | no       | `us-east-1` |                                                      |
| `S3_BUCKET`            | yes      |             | Bucket for platform files                            |
| `S3_ACCESS_KEY_ID`     | yes      |             |                                                      |
| `S3_SECRET_ACCESS_KEY` | yes      |             |                                                      |
| `S3_FORCE_PATH_STYLE`  | no       | `true`      | Path-style addressing, which self-hosted stores need |
| `HOST`                 | no       | `0.0.0.0`   |                                                      |
| `PORT`                 | no       | `8080`      |                                                      |
| `LOG_LEVEL`            | no       | `info`      |                                                      |

Boot order: load configuration, connect to Postgres, run migrations, create the bucket if it is missing, listen. On SIGTERM or SIGINT the server stops accepting requests, finishes the ones in flight and closes the pool.

The control plane makes no network call other than to Postgres and the object store. There is no telemetry, license check or update check.

## Deployment

- **Image.** One multi-stage `Dockerfile` produces the image for every mode. It runs as a non-root user.
- **Single host.** `deploy/compose/compose.yaml` runs the control plane, Postgres and SeaweedFS with named volumes and health checks. It serves on-prem sites and a VPS.
- **Local development.** `deploy/compose/compose.dev.yaml` runs only Postgres and SeaweedFS. `pnpm dev` runs the control plane on the host with reload.
- **Fly.io.** `deploy/fly/fly.toml` runs the same image. Postgres and the bucket are supplied through the same environment variables.

## Dependency and license policy

Every dependency of the core, including transitive ones that ship in the image, must carry an Apache-compatible license. `pnpm check:licenses` reads the production dependency tree and fails on any license outside the allowlist: Apache-2.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, BlueOak-1.0.0, CC0-1.0, Unlicense and Python-2.0. Development-only tools are never distributed, so they are checked against the same list plus MPL-2.0, a file-level copyleft license. One build tool pulled in by the test runner carries it.

Services that run as separate containers, such as Postgres and the object store, are not linked into the core. The bundled ones are still chosen to be permissive.

## Tests

| Area          | Test                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Migrations    | Apply to an empty database                                                                                 |
| Migrations    | Apply from each earlier migration point (skipped versions)                                                 |
| Migrations    | Two runners racing apply each migration once                                                               |
| Migrations    | A changed checksum stops the run. An unknown newer version stops the run                                   |
| Routing       | Shared location resolves. Dedicated location raises the typed error. Unknown tenant raises the typed error |
| Routing       | No package other than `packages/db` imports the driver                                                     |
| Manifest      | Envelope accepts and rejects the right shapes. Path grammar cases                                          |
| Manifest      | Registry validates a body against a fixture kind, and rejects an unknown kind or version                   |
| Manifest      | Emitted schema files match the code                                                                        |
| API           | Each route's happy path. Problem-details shape for 404 and validation errors. Request ID echo              |
| API           | Every route appears in the API description                                                                 |
| Configuration | Missing and malformed values produce clear errors                                                          |
| Smoke         | The Compose stack boots from clean and `/api/v1/readyz` returns 200. A restart applies nothing             |

Integration tests need a Postgres. They read `TEST_DATABASE_URL` and create a throwaway database per test file.

## Check against the master spec

Checked on 2026-11-11 against the build on the `phase-0-foundations` branch.

### Guiding principles

| Principle | Result |
| --- | --- |
| 1. One platform, one experience | Not applicable yet. The one API and its conventions are in place |
| 2. Everything is a resource | Met. One envelope and one registry for every kind |
| 3. Code first, git as the source of truth | Not applicable yet |
| 4. Language-neutral core | Met. The manifest contract is plain JSON Schema in `schemas/` |
| 5. Same software everywhere | Met. One image ran locally and in the Compose stack, configured only by environment variables |
| 6. Minimal footprint | Met. The stack is the control plane, Postgres and an S3-compatible store. It booted on a network with no internet access |
| 7. No central dependency | Met. The control plane makes no outbound call beyond Postgres and the object store. Telemetry in the bundled object store is switched off |
| 8. Tenant portability | Not weakened. Data location is on the tenant record and every access resolves through the router |
| 9. The core uses its own SDK | Not applicable yet |
| 10. Reuse libraries and engines, not applications | Met. Dependencies are libraries. The object store is a separate, replaceable service with no user-facing interface |
| 11. Keep the end-user version possible | Met. Kinds are described by JSON Schema, which can drive forms later |
| 12. Kernel before features | Met. No placeholder packages or speculative features |

### Ownership promise

| Promise | Result |
| --- | --- |
| You own the code | Not weakened. The repository builds with public dependencies only |
| You own the data | Not weakened. Export arrives in phase 5. Nothing here blocks it |
| You own the keys | Not applicable yet. Secrets arrive in phase 1 |
| No lock-in | Met. No license check, call home or kill switch. The license allowlist is enforced in CI |
| Any location | Met for local and single-host. The Fly.io deploy is the remaining check |

### Exit criterion

| Check | Result |
| --- | --- |
| Boots locally with `pnpm dev`, migrations run on start | Passed |
| Boots as the Compose stack from clean, migrations run on start | Passed |
| A restart applies no migration twice | Passed |
| Boots with no internet access | Passed |
| Tests pass on Postgres 16 and 18 | Passed |
| Boots on Fly.io | Not run yet. Needs the owner's Fly account |

## Proposed deviations

None.
