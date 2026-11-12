# Vynxlabs platform

One self-hostable foundation for custom internal apps, business workflows and system integrations. The design is in [docs/master-spec.md](docs/master-spec.md). Work is delivered in phases, each with a design doc under [docs/phases](docs/phases).

The platform is at phase 0: an empty instance that boots, migrates its database and answers health checks.

## Requirements

- Node 24
- pnpm 9
- Docker

## Local development

```sh
pnpm install
pnpm stack:up            # Postgres and an S3-compatible store, in Docker
cp .env.example .env
pnpm dev                 # the control plane on http://localhost:8080, with reload
```

Then:

```sh
curl localhost:8080/api/v1/readyz
curl localhost:8080/api/v1/instance
curl localhost:8080/api/v1/openapi.json
```

## Checks

| Command | What it does |
| --- | --- |
| `pnpm test` | Builds, then runs all tests. Needs `pnpm stack:up` or `TEST_DATABASE_URL` |
| `pnpm lint` | Lint and format check. `pnpm format` fixes what it can |
| `pnpm check:schemas` | Fails if `schemas/` is out of date. `pnpm emit:schemas` regenerates it |
| `pnpm check:migrations` | Fails if a locked migration changed. `pnpm lock:migrations` records new ones |
| `pnpm check:licenses` | Fails on a dependency outside the license allowlist |

## Running it on one machine

For an on-prem site or a single VPS:

```sh
cp deploy/compose/.env.example deploy/compose/.env    # then set the two secrets
docker compose -f deploy/compose/compose.yaml up -d --wait
```

This runs the control plane, Postgres and the object store with persistent volumes. The control plane listens on `127.0.0.1:8080` by default. Put a reverse proxy that terminates TLS in front of it before exposing it.

For Fly.io, see [deploy/fly](deploy/fly/README.md).

## Layout

| Path | Contents |
| --- | --- |
| `apps/control-plane` | The control plane service |
| `packages/db` | Database access, migrations, tenant routing |
| `packages/manifest` | The resource envelope, kind registry and validation |
| `schemas` | The manifest contract as JSON Schema, generated |
| `deploy` | Compose stack and Fly.io configuration |

## License

Apache 2.0, pending legal review. See [LICENSE](LICENSE).
