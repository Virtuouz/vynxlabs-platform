# Vynxlabs platform

One self-hostable foundation for custom internal apps, business workflows and system integrations. The design is in [docs/master-spec.md](docs/master-spec.md). Work is delivered in phases, each with a design doc under [docs/phases](docs/phases).

The platform is at phase 3, events and flows: on top of scripts that run on a schedule, a webhook or a manual start, a developer can now publish events and chain steps into flows, which are graphs of steps the platform runs durably, with branches, loops, waits and approvals. Custom tables and apps come in later phases.

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

### Deploy something

`examples/acme` is a sample tenant repository: an order sync between a shop and an ERP.

```sh
alias platform="node $PWD/packages/cli/dist/bin.js"

platform login --url http://localhost:8080 --token <api key>   # create the key in the console, under your account menu
cd examples/acme
platform build                                    # lists what the repository contains
platform deploy --tenant <slug> --workspace <slug>
platform runs --tenant <slug> --workspace <slug>
```

The first deploy tells you which connections and secrets the workspace still needs. Bind them in the console, under the workspace's Connections and Secrets tabs, then deploy again.

The example also has a flow, `orders/handle`. Publish an `orders/received` event, or start it by hand under the workspace's Flows tab, and watch it move across its graph. A large order waits on the tenant's Approvals page.

The example also defines a table, `orders`, and the flow writes each order it sends to it. Browse it under the workspace's Tables tab. Change the table in `src/index.ts` and deploy again, and the platform works out what to change: a column you add is added, one you rename with `renamedFrom` keeps its data, and one you remove is retired with its data kept. Only "Delete for good" in the console drops anything.

An existing Postgres database can be connected under the workspace's Data sources tab, then browsed there and used by scripts through `ctx.source(...)`.

`platform init <directory>` writes a starter repository, and `platform run <script>` runs one script on your machine.

The control plane starts a worker for a tenant when it has work. To run one yourself, for example inside a client's network, create a credential under the tenant's Workers page and start `node packages/worker/dist/bin.js --url <instance> --token <credential>`.

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
| `packages/cli` | The `platform` command: build, deploy, run |
| `packages/sdk` | What a tenant repository imports to define scripts and other resources |
| `packages/worker` | The worker that runs a tenant's scripts |
| `examples/acme` | A sample tenant repository |
| `docs/contracts` | The worker protocol |
| `packages/db` | Database access, migrations, tenant routing |
| `packages/manifest` | The resource envelope, kind registry and validation |
| `schemas` | The manifest contract as JSON Schema, generated |
| `deploy` | Compose stack and Fly.io configuration |

## License

Apache 2.0, pending legal review. See [LICENSE](LICENSE).
