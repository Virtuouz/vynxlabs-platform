# Volvel

[![CI](https://github.com/volveldev/volvel/actions/workflows/ci.yml/badge.svg)](https://github.com/volveldev/volvel/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@volvel/cli?label=%40volvel%2Fcli)](https://www.npmjs.com/package/@volvel/cli)
[![Docker](https://img.shields.io/docker/v/volvel/volvel?label=volvel%2Fvolvel&sort=semver)](https://hub.docker.com/r/volvel/volvel)

Volvel is one self-hostable foundation for custom internal apps, business flows and system integrations. The design is in [docs/master-spec.md](docs/master-spec.md), and the decisions that shaped it are in [docs/adr](docs/adr).

**Status: pre-release.** What a version promises, until 1.0 and after, is in [Versions, support and license](packages/docs/content/self-host/reference/running/versions-and-support.md). What is being worked on, and in what order, is on the [roadmap](https://github.com/orgs/volveldev/projects) and the [milestones](https://github.com/volveldev/volvel/milestones). Questions go to [Discussions](https://github.com/volveldev/volvel/discussions); bugs and feature requests to [Issues](https://github.com/volveldev/volvel/issues/new/choose).

A developer defines scripts, flows, tables, data sources and apps in a tenant's repository and deploys them. An app is served by the instance to the tenant's staff, to its own pool of end users, or to anyone, as its bindings say, with the tenant's branding. Changes move from a dev workspace to production as the same bundle, a tenant's data can live in a database of its own, and a whole tenant can be exported from one instance and imported into another.

## Documentation

Every instance serves its documentation at `/docs`, with no sign-in, and the pages are also exported as plain files for a website. It has five collections:

| Collection | For |
| --- | --- |
| Get started | A first look: a first app, script and approval flow |
| Console | Everyone who uses the console: each screen and what to do with it |
| Develop | Writing a tenant repository, the `volvel` command, the API and extensions |
| Administer | A tenant's administrators: access, single sign-on, releases, export |
| Self-host | Running an instance: install, upgrade, back up, monitor and secure it |

The old guides, `docs/self-hosting.md` and `docs/sdk-guide.md`, are lists of where their sections moved. The pages are in `packages/docs/content`.

## Install

From 0.6.0, the first public release, Volvel is on Docker Hub and npm:

- **An instance, with Docker:** `docker pull volvel/volvel:0.6.0` ([Docker Hub](https://hub.docker.com/r/volvel/volvel)). Run the Compose stack in `deploy/compose` with `VOLVEL_IMAGE=volvel/volvel:0.6.0`; see `/docs/self-host/how-to/running/install-with-compose`.
- **The command line and SDK, with npm:** `npm install --global @volvel/cli` ([npm](https://www.npmjs.com/package/@volvel/cli)), and `@volvel/sdk` in a repository; see `/docs/develop/how-to/cli/install-the-cli`.
- **From source:** the steps below build the image (`/docs/self-host/how-to/running/build-the-image`) and the command (`/docs/develop/how-to/cli/install-from-source`).

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
alias volvel="node $PWD/packages/cli/dist/bin.js"

volvel login --url http://localhost:8080 --token <api key>   # create the key in the console, under your account menu
cd examples/acme
volvel build                                    # lists what the repository contains
volvel deploy --tenant <slug> --workspace <slug>
volvel runs --tenant <slug> --workspace <slug>
```

The first deploy tells you which connections and secrets the workspace still needs. Bind them in the console, under the workspace's Connections and Secrets tabs, then deploy again.

The example also has a flow, `orders/handle`. Publish an `orders/received` event, or start it by hand under the workspace's Flows tab, and watch it move across its graph. A large order waits on the tenant's Approvals page.

The example also defines a table, `orders`, and the flow writes each order it sends to it. Browse it under the workspace's Tables tab. Change the table in `src/index.ts` and deploy again, and the platform works out what to change: a column you add is added, one you rename with `renamedFrom` keeps its data, and one you remove is retired with its data kept. To move a table, or any resource, to another path, give it `key` set to the path it had: it stays the same resource, with its rows and its history, and the old path keeps answering for 90 days. Only "Delete for good" in the console drops anything.

An existing Postgres database can be connected under the workspace's Data sources tab, then browsed there and used by scripts through `ctx.source(...)`.

The example has two apps. After a deploy, the workspace's Apps page lists them with their addresses: a portal at `/apps/<tenant>/<workspace>/portal/`, where staff see every order and a customer sees their own, and a public page of notices. Invite a customer under the tenant's End users page and open the link it gives you. To work on an app with reload, against a workspace's real data:

```sh
volvel dev portal --tenant <slug> --workspace <slug>
```

An app is a directory with an `index.html`, named by `defineApp` in `src/index.ts`. It uses `@volvel/app` for rows, scripts and the session, and `@volvel/ui` for its components. Who may open it, and whose rows it shows, is said with `defineBinding` in the same file.

To move a change between environments, link a dev workspace to the one it promotes to, deploy to dev, and run `volvel promote --tenant <slug> --workspace <dev slug> --preview` to see what would change, then without `--preview` to do it. The same bundle is activated: nothing is rebuilt.

`volvel init <directory>` writes a starter repository, and `volvel run <script>` runs one script on your machine.

### Working from a terminal

```sh
volvel pull --tenant <slug> --workspace <dev slug>       # what was made in the console, drafts included, into platform/ and the files it changed elsewhere
volvel run orders/handle --remote --tenant <slug> --workspace <dev slug> --input '{"id":"A-1"}'
volvel logs <run id> -f --tenant <slug> --workspace <slug>
```

- **`pull`** writes every resource made in the console as files under `platform/`, with its drafts, and remembers what it wrote. A file you changed since is kept, and pull exits 1 until you keep your change or pass `--force`. `platform/` holds the workspace's whole console set: a deploy of the repository replaces the set with it, and clears the drafts the pull took. So pull, edit, deploy, and nothing is left on the console's Changes screen.
- **`run --remote`** builds the repository, uploads the build as a preview that is never deployed, and runs the script or flow from it in a dev workspace, with the logs as they are written. It exits 0 when the run succeeded and 1 when it failed.
- **`logs -f`** follows a run, or a flow run step by step with each step's logs, until it ends. Ctrl+C stops following and leaves the run going.

The control plane starts a worker for a tenant when it has work. To run one yourself, for example inside a client's network, create a credential under the tenant's Workers page and start `node packages/worker/dist/bin.js --url <instance> --token <credential>`.

## Checks

| Command | What it does |
| --- | --- |
| `pnpm test` | Builds, then runs all tests. Needs `pnpm stack:up` or `TEST_DATABASE_URL` |
| `pnpm lint` | Lint and format check. `pnpm format` fixes what it can |
| `pnpm typecheck` | Type checks every package, including the console, the kit, the app client and the example |
| `pnpm check:schemas` | Fails if `schemas/` is out of date. `pnpm emit:schemas` regenerates it |
| `pnpm check:migrations` | Fails if a locked migration changed. `pnpm lock:migrations` records new ones |
| `pnpm check:licenses` | Fails on a dependency outside the license allowlist |
| `node scripts/third-party-notices.mjs` | Writes `THIRD_PARTY_NOTICES.md`; with `--check`, fails on a shipped dependency with no license text |

## Running it on one machine

For an on-prem site or a single VPS:

```sh
cp deploy/compose/.env.example deploy/compose/.env    # then fill it in
docker compose -f deploy/compose/compose.yaml up -d --wait
```

This runs the control plane, the worker host that starts managed workers (it needs `WORKER_HOST_TOKEN` in `.env`), Postgres and the object store with persistent volumes. Take Postgres or the object store out of `COMPOSE_PROFILES` in `.env` to use your own. Keep a copy of `MASTER_KEY`: without it, stored secrets cannot be read again. The control plane listens on `127.0.0.1:8080` by default. Put a reverse proxy that terminates TLS in front of it before exposing it.

The full guide, including TLS, backups, upgrades, dedicated databases, workers in another network and moving a tenant, is the Self-host collection of the documentation, at `/docs/self-host/` on an instance and in [`packages/docs/content/self-host`](packages/docs/content/self-host).

For Fly.io, see [deploy/fly](deploy/fly/README.md).

## Layout

| Path | Contents |
| --- | --- |
| `apps/control-plane` | The control plane service |
| `apps/console` | The admin console, a React single-page app |
| `packages/ui` | The component kit and theme tokens |
| `packages/cli` | The `volvel` command: build, deploy, run |
| `packages/sdk` | What a tenant repository imports to define scripts and other resources |
| `packages/worker` | The worker that runs a tenant's scripts |
| `examples/acme` | A sample tenant repository |
| `docs/contracts` | The worker protocol, the bundle and the tenant export format |
| `docs/adr` | Architecture decision records |
| `docs/engineering` | The rules a change to the interface is held to |
| `packages/docs` | The documentation: five collections of pages, served at `/docs` |
| `packages/db` | Database access, migrations, tenant routing |
| `packages/manifest` | The resource envelope, kind registry and validation |
| `schemas` | The manifest contract as JSON Schema, generated |
| `deploy` | Compose stack, a standalone worker, and Fly.io configuration |

## License

Apache 2.0, pending legal review. See [LICENSE](LICENSE).

The licenses of the third-party packages Volvel distributes are in `THIRD_PARTY_NOTICES.md`: at `/app/THIRD_PARTY_NOTICES.md` in the image and at the root of each npm package. It is generated by `node scripts/third-party-notices.mjs`.
