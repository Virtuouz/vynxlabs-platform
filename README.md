# Vynxlabs platform

One self-hostable foundation for custom internal apps, business workflows and system integrations. The design is in [docs/master-spec.md](docs/master-spec.md). Work is delivered in phases, each with a design doc under [docs/phases](docs/phases).

The platform is at phase 1, the kernel: tenants and workspaces, member sign-in, roles and bindings, per-tenant encrypted secrets, a resource registry, an append-only audit log, and an admin console. It does not run scripts or flows yet.

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

Open http://localhost:8080 and sign in with the bootstrap admin from `.env` (`admin@example.com` / `change-me-please`). The control plane serves the console as built by `pnpm build`.

To work on the console with hot reload, also run `pnpm dev:console`, set `PUBLIC_URL=http://localhost:5173` in `.env`, and open that address instead.

The API describes itself at http://localhost:8080/api/v1/openapi.json.

### Command line

```sh
node packages/cli/dist/bin.js login --url http://localhost:8080 --token <api key>
node packages/cli/dist/bin.js whoami
```

Create the API key in the console, under your account menu.

## Checks

| Command | What it does |
| --- | --- |
| `pnpm test` | Builds, then runs all tests. Needs `pnpm stack:up` or `TEST_DATABASE_URL` |
| `pnpm lint` | Lint and format check. `pnpm format` fixes what it can |
| `pnpm typecheck` | Type checks every package, including the console |
| `pnpm check:schemas` | Fails if `schemas/` is out of date. `pnpm emit:schemas` regenerates it |
| `pnpm check:migrations` | Fails if a locked migration changed. `pnpm lock:migrations` records new ones |
| `pnpm check:licenses` | Fails on a dependency outside the license allowlist |

## Running it on one machine

For an on-prem site or a single VPS:

```sh
cp deploy/compose/.env.example deploy/compose/.env    # then fill it in
docker compose -f deploy/compose/compose.yaml up -d --wait
```

This runs the control plane, Postgres and the object store with persistent volumes. Keep a copy of `MASTER_KEY`: without it, stored secrets cannot be read again. The control plane listens on `127.0.0.1:8080` by default. Put a reverse proxy that terminates TLS in front of it before exposing it.

For Fly.io, see [deploy/fly](deploy/fly/README.md).

## Layout

| Path | Contents |
| --- | --- |
| `apps/control-plane` | The control plane service |
| `apps/console` | The admin console, a Preact single-page app |
| `packages/ui` | The component kit and theme tokens |
| `packages/cli` | The `platform` command |
| `packages/db` | Database access, migrations, tenant routing |
| `packages/manifest` | The resource envelope, kind registry and validation |
| `schemas` | The manifest contract as JSON Schema, generated |
| `deploy` | Compose stack and Fly.io configuration |

## License

Apache 2.0, pending legal review. See [LICENSE](LICENSE).
