# Changelog

Versions before 1.0 may change the API, the manifest format and the worker protocol. Each entry says what an operator and a tenant developer need to do.

## 0.3.0, not yet released

Environments and portability (phase 5), on top of data (phase 4) and events and flows (phase 3).

### For operators

- **Database change.** Migrations 0010 to 0017 run on start. Upgrading from any earlier version is supported and tested.
- **A new database role.** The platform now creates one sign-in per database for requests for tenants' rows. The Postgres user must be allowed to create roles. Custom tables made by an earlier version are handed over to it on start.
- **Dedicated databases.** A tenant's custom tables can live in a database registered under Instance, Database locations.
- **Tenant export and import**, and deleting a tenant.
- **Bundles keep working across the upgrade.** A bundle built with the 0.2.0 SDK still deploys, promotes and rolls back.
- A standalone worker can be run from `deploy/worker`.

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
