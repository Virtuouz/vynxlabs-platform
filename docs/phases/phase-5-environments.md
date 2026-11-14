# Phase 5: environments and portability

Status: built and verified locally on 2026-11-12. Not yet run in CI or on Fly.io
Last updated: 2026-11-12

Phase 5 makes the deployment model real. Changes move between linked workspaces without a rebuild, a workspace can be cloned safely, a tenant's custom tables can live in a database of their own, and a whole tenant can be exported from one instance and imported into another.

**Exit criterion:** a tenant moves from the shared instance to a dedicated one with nothing lost.

## Spec sections implemented

| Master spec section | What phase 5 delivers |
| --- | --- |
| Environments: workspace types, promotion | Linking, promotion of the same bundle, dev-to-dev pushes, a preview |
| Environments: cloning | Clones with or without data, with the safety setting |
| Tenancy: data routing | Dedicated databases for a tenant's custom tables |
| Tenancy: tenant export and import | The export archive, import into another instance, deleting a tenant |
| System architecture: worker | Worker pools, and tenants served only by their own workers |
| Tenancy: upgrades | Tests that migrate from every earlier level |
| Open source: the promise as requirements | "You own the data" and "you own the keys" become things a tenant can do |

Not in this phase: importing an export from an older version, moving a tenant between locations in place, two-way sync of console edits to the repository, masking in clones, platform records in a dedicated database.

## Owner decisions

| Area | Decision |
| --- | --- |
| What lives in a dedicated database | The tenant's custom tables only. Platform records, the queue and sign-in stay in the instance database |
| The key in an export | Wrapped with a passphrase chosen at export and asked for at import |
| What an export carries | Configuration, data, files, secrets and the key. Members, groups, roles, bindings, service accounts and the audit log always. Run, flow and event history on request. API keys and worker credentials never |
| Clone type | Always a dev workspace, linked to its source |

## Spikes

### A login role for data requests

Run on Postgres 16 and 18, as an ordinary owner with the create-role right and no superuser.

| Point | Result |
| --- | --- |
| The owner can create a login role, set its password, and set it again at a later start | Passed |
| Signed in as that role, row policies apply, and another person's row cannot be written | Passed |
| That session cannot become the platform's role: `SET ROLE`, `SET SESSION AUTHORIZATION` and `RESET ROLE` all leave it where it is | Passed |
| It cannot read the platform's own tables, create anything, or change a policy | Passed |
| A second instance on the same database server can do the same | Failed with the shared role from phase 4, passed with a role per instance |

The design change from the last point: phase 4 made one role, `platform_data`, for the whole database server, and granted workspace tables to it. A second instance whose owner did not create that role cannot join it. So each database now gets its own login role, named after the database, and workspace tables are granted to it directly. The role's password is derived from the instance master key, so nothing new has to be configured or stored. `platform_data` is no longer used.

This removes the weakness recorded in phase 4. A data request no longer runs on a connection that can return to the platform's role.

### A deploy across two databases

Postgres cannot commit two databases together without two-phase commit, which most managed services switch off. The question was what happens when the tenant's database commits a table change and the instance database then fails to commit the deploy.

The answer is to keep the catalog of a workspace's tables in the same database as the tables themselves. A table change and its catalog entry then commit together, always. What can go out of step is only the registry: the workspace still shows the earlier bundle as active while its tables are already at the new definition. Deploying again plans from the true catalog, finds nothing left to change in the tables, and completes. No data is at risk at any point, because a deploy never drops anything.

This changes one default in the plan, which had the catalog staying in the instance database. For a tenant on the shared database nothing changes: there is one database, and a deploy is one transaction as before.

## Findings

Things the build and the verification turned up that the plan did not foresee.

- **The catalog moved beside the tables.** See the spike above. The plan had it staying in the instance database.
- **One database role per database, not one per server.** See the spike above.
- **Export and import are a stream, not a stored job.** The plan had an export written to the object store and offered for download. It is instead written straight into the response, piece by piece, and an import is read from the request. No copy of a tenant's export is ever left on the instance, and nothing has to fit in memory.
- **An upgrade would have stranded every deployed bundle.** A bundle states the range of cores its SDK knew of, and a newer core is outside it by definition. Moving the core to 0.3.0 would have refused every bundle built with the 0.2.0 SDK: no redeploy, no promotion, no rollback, until each tenant rebuilt. The core now also states the oldest bundles it still runs (`OLDEST_SUPPORTED_BUNDLE_CORE`, 0.2.0), and accepts a bundle past its stated range as long as it is no older than that. Raising that number is the breaking change, and is the owner's decision.
- **A tenant that never stored a secret had no key, so its export's passphrase was never checked.** Found in the browser, when a wrong passphrase imported a small tenant. Nothing was exposed, because nothing in that export was encrypted. Every export now carries a key, made on first export if need be, so a wrong passphrase is always refused.
- **An export is not encrypted as a whole.** Only secrets are. Rows, files, the audit log and history are plain, which is what "standard formats" means. History includes each run's input, so whatever a caller sent to a webhook is in it. On the Compose stack the example's webhook, which takes a shared secret in its request body, put that value into the export this way. The format document, the self-hosting guide, the console and the CLI now all say that the file must be kept like a database backup. The example's design, a secret in a request body, is the weakness, and is left as it is for now.
- **A tenant that comes back finds its audit entries waiting.** An instance keeps a deleted tenant's audit entries. Importing the same tenant again brings entries that are already there. They are the same entries, so those are skipped, and the count check allows more audit entries than the export brought.
- **A clone dialog outlived its workspace.** In the console, "Open the copy" left the dialog open over the new workspace. Found in the browser, and fixed.
- **The CLI crashed on a refused upload.** Node cannot retry a request whose body is a stream, so a key that was refused while a file was being sent surfaced as a broken connection. The CLI now checks the key before it sends the file.
- **A paused workspace still finishes what is queued.** Pausing stops triggers. A run that is already queued, including one waiting out its retries, still runs. Deleting a workspace or a tenant is refused while runs are in progress, so such runs have to be canceled or waited for.
- **Clones copy the current definition only.** Retired columns and tables stay with the source.
- **Sign-in is rate limited, and scripts that sign in repeatedly run into it.** Working as intended. Automation should use an API key.

## Links, promotion and pushes

- A dev workspace links to one workspace in the same tenant: production, or another dev workspace such as QA. Links cannot loop. A production workspace links to nothing.
- `POST …/workspaces/{w}/promotions` activates, in the linked workspace, the bundle that is active here. The bundle is found there by digest, or copied there as its next version. It is then an ordinary deploy in that workspace: bindings are checked and tables changed. The deployment records the workspace it was promoted from.
- `GET …/workspaces/{w}/promotion-preview` carries the promotion out inside a transaction and takes it back. What it reports is therefore exactly what the promotion would do: the resources it would create, change and remove, what it would do to the data, or the reason it would be refused.
- Promoting needs `deployment:read` here and `deployment:write` there.
- A deployment's summary now lists the resources it changed (`changes`), up to 500, beside the counts.
- CLI: `platform promote`, with `--preview`.

## Cloning, pausing and deleting

- **Pausing.** `triggersPaused` on a workspace. While it is set, schedules do not fire, webhooks answer 503 `workspace_paused`, and events are stored but start no subscriber. Runs started by hand still work. A schedule that came due while paused fires once on resuming. Pausing and resuming are audited.
- **Cloning.** `POST …/workspaces/{w}/clones` with a name, a slug, `withData` and `safe`. The clone is a dev workspace, linked to its source, with its triggers paused. The copying runs after the request is answered, in one transaction, and its record says how it went.

| | Safety on (default) | Safety off |
| --- | --- | --- |
| The active bundle and its resources | Copied | Copied |
| Resources made in the console, flow layouts, variables | Copied | Copied |
| Rows and files, when asked for | Copied. Rows keep their IDs, files get new ones | The same |
| Connection and data source bindings, secret values | Not copied | Copied, sealed again for the new workspace |
| Webhook addresses | New | New |
| Triggers | Paused | Paused |
| Runs, events, audit entries, API keys | Never | Never |

  Cloning needs `workspace:write` in the tenant. Copying data also needs `data_all:read` and `file:read` in the source. Turning safety off also needs `secret:write` and `connection:write` there, and is recorded in the audit log as `safety: off`.
- **Deleting a workspace.** Dev workspaces only, with the slug sent as confirmation. Its rows in every platform table, its custom tables and its stored objects go. Workspaces linked to it are left unlinked. Its audit entries stay with the tenant.
- **Deleting a tenant.** Operators only, with the slug as confirmation. Everything it owns on the instance goes. Its audit entries stay, and so do its members' accounts, which belong to the instance.
- One list, `kernel/tenancy/tables.ts`, names every table whose rows belong to a tenant, in the order they can be inserted. Deleting, exporting and importing all work from it, and a test fails if a table in the database is in neither that list nor the list of instance tables.

## Dedicated databases

- `database_location`: a name and a connection string encrypted with the instance master key. Operator routes under `/instance/database-locations` register, list and remove them. Registering connects first and prepares the database. Listing says whether each one answers. The user and password are never returned.
- A tenant's record names its location. It is set when the tenant is created or imported, and not changed afterwards.
- What lives there: the tenant's workspace schemas and the catalog that describes them (`data_table`, `data_column`). Everything else stays in the instance database.
- `kernel.data` resolves a tenant to its store. A store has two connections: the owner's, for structure, the catalog and counts, and the restricted one for rows.
- Inside a write, `kernel.data.within(trx, tenantId)` gives the connection to use. For the instance database it is the same transaction. For a dedicated one it is a transaction there, committed just before the instance's.
- A deploy that fails between the two commits leaves the tables changed and the registry on the earlier bundle. Deploying again completes it. A test forces exactly that.

## A separate connection for rows

- Every database with custom tables has a login role named after it, `vxd_` and a hash of the database's name. Workspace tables and policies are granted to it. Its password is derived from the master key and the database's name.
- `withData` runs every request for rows on a pool signed in as that role. It no longer switches role.
- On start, tables and policies made for the earlier role, `platform_data`, are handed to the new one.
- The Postgres user the platform runs as must be allowed to create roles.

## Export and import

The format is in [docs/contracts/tenant-export.md](../contracts/tenant-export.md).

- `POST /tenants/{t}/exports`, permission `tenant:export`, with a passphrase of at least 12 characters and `history`. The answer is the archive. An operator has that permission only through an access grant.
- `POST /instance/tenant-imports`, operators only. The request body is the archive, the passphrase is in a header, and `slug` and `dataLocation` may be given.
- Both are audited. The passphrase is never stored or logged.
- CLI: `platform tenant export` and `platform tenant import`, with the passphrase read from the environment.

## Hybrid workers

- A script may name a pool: `worker` in its manifest and in `defineScript`.
- A worker credential may be made for one pool.
- Each workspace has a queue for the default pool and one for each named pool. A worker claims only from the queue of its credential's pool, so it is never offered a run it must not take.
- A queued run with no worker connected that could take it says what it is waiting for (`waitingFor`).
- `managedWorkers` on a tenant. When false, the instance starts no worker for it.
- `deploy/worker/compose.yaml` runs a worker by itself.

## Upgrades

- `upgrade.test.ts`: for every earlier migration level, a database is migrated that far, given real data cut down to what existed then, and handed to the application.
- Bundles from earlier supported versions keep deploying. See Findings.
- Version 0.3.0 for the core, SDK, CLI and worker.

## Schemas

Migrations 0014 to 0017.

| Change | Purpose |
| --- | --- |
| `deployment.promoted_from_workspace_id` | Where a promoted bundle came from |
| `workspace.triggers_paused` | The pause switch |
| `database_location` | Dedicated databases |
| `data_table` loses its foreign keys to `tenant`, `workspace` and `resource` | The catalog may be in another database |
| `workspace_clone` | The record of each clone |
| `worker_credential.pool`, `run.pool`, `tenant.managed_workers` | Worker pools |

## Tests

| Area | Where |
| --- | --- |
| Links, promotion, preview, pausing, cloning, deleting, database locations, worker pools, the table list | `environments.test.ts` |
| The whole phase 4 data suite, again on a dedicated database. An interrupted two-database deploy. Attempts to leave the restricted connection | `data.test.ts`, run a second time by `data-dedicated.test.ts` |
| The catalog bootstrap against the migrations. The hand-over from the earlier role | `packages/db/src/datastore.test.ts` |
| The archive format, read back and by the system `tar` | `kernel/tenancy/tar.test.ts` |
| The exit criterion between two instances. Refusals. A failed import leaves nothing. The way back | `portability.test.ts` |
| Upgrades from every earlier level | `upgrade.test.ts` |
| Bundle compatibility | `packages/manifest/src/compat.test.ts`, `execution.test.ts` |
| CLI: promote, tenant export and import | `packages/cli/src/example.test.ts` |
| Console screens | `apps/console/src/Environments.test.tsx` |

## Check against the master spec

Checked on 2026-11-12 against the build on the `phase-5-environments` branch.

### Guiding principles

| Principle | Result |
| --- | --- |
| 1. One platform, one experience | Met. Promotion, cloning, export and import use the same identity, permission check, audit path, API, CLI and console |
| 2. Everything is a resource | Met. Nothing new is a resource: this phase moves resources between places |
| 3. Code first, git as the source of truth | Met. Promotion deploys the bundle built from the repository, unchanged. A clone keeps the ownership of every resource it copies |
| 4. Language-neutral core | Met. The export is JSON Lines and plain files. A pool is a name in the manifest and a property of a credential, and a worker in any language needs no change |
| 5. Same software everywhere | Met. A dedicated database, a hybrid worker and a move between instances are configuration. One image ran every part of the verification |
| 6. Minimal footprint | Met. No container and no service was added. A dedicated database is optional |
| 7. No central dependency | Met. Nothing new calls out. An export and an import need only the two instances and a file |
| 8. Tenant portability | Delivered. This is the phase that makes it real |
| 9. The core uses its own SDK | Met where it applies. The console and the CLI use only the public API |
| 10. Reuse libraries and engines, not applications | Met. No dependency was added. The archive is tar, written and read by about a hundred lines |
| 11. Keep the end-user version possible | Not affected |
| 12. Kernel before features | Met. No sync, no masking, no in-place move |

### Ownership promise

| Promise | Result |
| --- | --- |
| You own the code | Unchanged |
| You own the data | Delivered. A tenant's admin can export everything at any time, in formats that open without the platform, with no operator involved |
| You own the keys | Delivered. The tenant's key travels in the export, wrapped with a passphrase the tenant chose. The instance master key never leaves the instance |
| No lock-in | Strengthened. An operator cannot export a tenant without an access grant the tenant can see. Leaving an instance needs nothing from that instance but the export |
| Any location | Delivered. The same tenant ran on a shared database and on a dedicated one, and a worker ran in a network that reaches nothing but the control plane |

### Verification

| Check | Result |
| --- | --- |
| Lint, type check, schema, migration and license checks | Passed |
| Every test on Postgres 16 and 18 | Passed |
| Promotion from the CLI on the Compose stack: preview, promote, promote again | Passed |
| A clone of production with its data, safety on | Passed. Its webhook had a new address and answered 503, an event started nothing, and in eight seconds it ran nothing and called nothing. Resumed but unbound, its script failed saying the connection was not found. Bound to a test address, it called that address and no other |
| **Exit criterion.** Two instances side by side with separate databases, object stores and master keys. A tenant with the example deployed, orders written by the flow, an approval, a file, secrets, three members and run history was exported from the first with the CLI and imported into the second, onto a dedicated database owned by an ordinary user that is not a superuser | Passed. All 24 platform tables and all 5 custom tables matched by row count and by a checksum of every row. The structure of the custom tables matched. The file was identical byte for byte. On the second instance the tenant's tables were only in the dedicated database |
| Using the tenant where it arrived | Passed. Members signed in with the passwords they had. Each ordinary member saw the same rows as before and only their own. The webhook kept its address, answered 503 until triggers were resumed, then ran a script that checked a secret which only decrypts with the tenant's key. A new order went through the flow to the stub beside the second instance |
| Completing the move | Passed. The other tenant on the first instance was untouched. The moved tenant was deleted there, leaving one audit entry |
| Deleting a tenant from a dedicated database, and importing it again | Passed. The dedicated database was left with no schema and no catalog row |
| A worker in a network of its own, from `deploy/worker` | Passed. A script naming the pool waited, saying why, then ran on that worker. The worker published no port and could resolve only the control plane. A script naming no pool ran on the instance's own worker |
| Upgrading real instances. One made with the phase 2 image (database level 9) and one with the phase 3 image (level 11), each with that version's example deployed by that version's CLI and real runs, restarted on the current image over the same volumes | Passed for both. Earlier runs unchanged, sign-in with the old password, webhook address unchanged, the bundle built by the 0.2.0 SDK ran on the new worker and redeployed, the old flow still ran, the current example then deployed and its flow wrote to the new table |
| The new console screens in a real browser | Passed, after the two fixes under Findings. No page errors |
| The self-hosting guide | The stacks above were brought up with its commands, with a project name and an env file path added so that two could run on one machine. Its worker section was followed as written |

### Known gaps

- Importing an export made at another database level. Both instances must be at the same version.
- Moving a tenant between locations in place.
- An export is one request. A very large tenant needs the connection to stay open for as long as it takes, and an import needs temporary disk space for the file, up to 50 GB.
- The first commit of a two-database deploy cannot be taken back if the second fails. It is completed by deploying again, not undone.
- A clone, a deletion and an import each hold one long transaction.
- A clone that is interrupted by a restart is marked failed an hour later, not at once.
- Retired columns and tables are not cloned.
- Two-way sync of console edits to the repository. The spec describes it. Its phase 5 scope does not list it.
- Masking of personal data in clones.
- Platform records in a dedicated database.
- The end-user pool in exports. It arrives with phase 6, and the table list is where it will be added.
- Default retention for runs and audit entries. A deleted tenant's audit entries are kept indefinitely.
- The address for security reports, and a response time, in `SECURITY.md`.
- Nothing is published: no image, no package, no branch pushed. CI has never run. The Fly.io deploy from phase 0 and the production exit check from phase 2 are still open.

## Proposed deviations

None from the master spec.

From the approved plan, for review:

| Plan | Built | Why |
| --- | --- | --- |
| The catalog stays in the instance database | It lives beside the tables | A table change and its catalog entry must commit together |
| One restricted role | One per database | Two instances on one server could not share it |
| Export is a background job that writes to the object store | Export and import are streams in the request | No copy left behind, and no size held in memory |
| Import applies table definitions through the deploy code | Import rebuilds tables from the exported catalog | Retired columns, renamed columns and their exact names in the database have to survive |
| Not in the plan | The core states the oldest bundles it still runs | Without it, the version bump in the plan would have stranded deployed bundles |
