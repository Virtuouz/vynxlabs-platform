# Phase 5: environments and portability

Status: in progress
Last updated: 2026-11-11

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

## Links, promotion and pushes

To be written as built.

## Cloning, pausing and deleting

To be written as built.

## Dedicated databases

To be written as built.

## Export and import

To be written as built.

## Hybrid workers

To be written as built.

## Upgrades

To be written as built.

## Check against the master spec

To be completed when the build is verified.

## Proposed deviations

None.
