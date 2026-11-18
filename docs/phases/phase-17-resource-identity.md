# Phase 17: resource identity, two-way authoring and access as resources

Status: in progress on branch `phase-17-resource-identity`, off `main`. M0 built. Not pushed.
Last updated: 2026-11-17

This phase carries out [Decision 0002](../evolution/decisions/0002-resource-identity-and-authoring.md). Today a resource's path is its identity, its address and its folder at once, so:

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Renames | Moving `requests/submit` cuts its run history, breaks its URLs and removes an agent's MCP tool | The deploy matches by path: a missing path is deleted and a new one created (`kernel/execution/deploy.ts`) |
| Two authors | A resource is edited from the repository or from the console, never both | A repository resource is the output of running TypeScript, which the console cannot edit |
| Access | Groups, service accounts and roles cannot be renamed, and a repository cannot bring up its own tenant | They are database state that code names by display name |
| Silent loss | Two files exporting the same name through `export *` both vanish from the build, and the deploy deletes the script | esbuild drops the clash without a warning; nothing compares what was defined with what was exported |

**Exit criterion:**
- `examples/higher-ed-devices` comes up in an empty tenant from its repository alone, with `platform tenant release` and `platform deploy`;
- renaming the Tech Desk group's title leaves bindings, a waiting approval and a row rule working;
- moving `requests/submit` to `lending/requests/file`, in code and separately in the console, is reported as a rename, keeps runs, bindings and the MCP tool name, and leaves the old URL answering with a warning;
- promoting that to production does the same rename there.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-17-resource-identity`, milestones M0 to M6 one after another, several commits each `Phase 17: …` |
| Files | Declarative files anywhere in the repository, found by suffix |
| Path | A file's location is its path unless it sets `path:`. The path is relative to the nearest resource root: `platform/` and `tenant/` by default, more by configuration. Outside a root, `path:` is required |
| File shape | `{schemaVersion, body}` stays, with optional top-level `key`, `path` and `title`. Existing files stay valid |
| Keys | Never change. "That was a terrible name" is accepted |
| Aliases | 90 days by default, with a warning in the API's response headers |
| Key URLs | Not built, but left easy to add |
| Tenant releases | Approval optional per tenant. Plan and approval, no test stage |
| Merging | Stays per resource: mine or theirs |
| SCIM groups | Adopted as provider-managed tenant resources. A release never deletes them. A `tenant/` file with the same key takes over title and description |
| Console edits to access | Each is a one-change tenant release, committed to a tenant branch, never the default branch |

## Milestones

| # | Milestone | Size |
| --- | --- | --- |
| M0 | Safeguards: the delete guard, defined but not exported, changes listed by the CLI | S |
| M1 | Keys and renames in place: `key`, deploy by key, path-keyed state carried, aliases, bundle format 4 | L |
| M2 | Public names: `mcp.name`, breaking changes named at deploy and promotion | S |
| M3 | Tenant resources and tenant releases | L |
| M4 | Access by ID: approvers and row rules | M |
| M5 | Two-way files: `source`, discovery anywhere, git sync by key, Move to file | L |
| M6 | Examples and documentation | M |

## Where the decision record and the code disagree

Found while planning, verified in the code. Each changes what a milestone contains.

- `run.resource_id` and `flow_run.resource_id` exist already, and fall back to the bundle's ID when the script is not in the registry (`kernel/execution/runs.ts`, `kernel/flows/engine.ts`). M1 repairs the fallback.
- More state is keyed by path than the record lists: connection bindings, variable values, data source bindings, connection group members, OAuth state, app domains, health checks, trigger pauses, webhook refusals, table names, recent items, draft history. A rename has to carry all of it.
- `planTable` matches a table by name. A rename without `renamedFrom` would make an empty table.
- The build does not check `schedule.flow`, `binding.resource`, `app.reads` or an interface action's target.
- The CLI's `deploy` cannot ask a question. "Stops and asks" is a refusal, and `--allow-delete`.
- Flows are MCP tools already. Tool names are cut at 64 characters and nothing detects two that collide.
- The flow engine reads approvers from the run's immutable bundle, so IDs resolved at deploy have nowhere to be kept.
- The registry requires a workspace, and the kind names `role` and `binding` are taken.
- The examples' scripts import `./model.ts`, which the console's import lock-down forbids. "Move to file" covers kinds without code.
- Neither `higher-ed-devices` nor `fernhill` is built in CI.

## M0: safeguards

**Defined but not exported.** The SDK's `resource()` notes each definition, by kind and path, in a list the build makes on `globalThis` before it loads the repository's code. The list is on `globalThis` because the build loads a copy of the SDK that esbuild bundled into the repository's code, not the one the CLI imports. The build compares the list with what the entry file exports, by count, and fails naming each one missing. A repository on an SDK from before this notes nothing, and the check passes. Workers never make the list, so nothing is kept at run time.

**The delete guard.** `deployBundle` refuses, with 409 `rename_suspected`, a deploy that would delete a resource holding something and create another of the same kind. "Holding something" is:
- a script or flow with runs;
- a table with rows, unless a created table names it in `renamedFrom`;
- any resource with access given to it by hand. Access a bundle gives is given again by the bundle, so it does not count.

Each refusal names the path and what it holds. `allowDelete` lets a path through, on:
- `POST …/deployments` and `platform deploy --allow-delete <path>`;
- `POST …/promotions`, `GET …/promotion-preview?allowDelete=a,b`, a promotion request's decision, and `platform promote --allow-delete <path>`;
- `POST …/git/pull`.

A deploy of console drafts is not held: each removal there was a delete of one resource by name.

**Changes listed.** `platform deploy` lists what it created, updated and deleted, as `promote` already did. Above 30 changes it lists only what was deleted and counts the rest, since the bundle's contents were printed just before.

### Findings

- The guard cannot yet name a key to add, as the record says, because keys arrive in M1. Until then the advice is `renamedFrom` for a table and "keep the old path" for anything else. M1 rewrites the message.
- The console has no control to allow a deletion when a promotion or a pull is refused: it shows the refusal. The API takes `allowDelete` on both. The promotion's confirm step comes with M2, and the pull's with M5.
- The table test met the guard for a second reason. `customers` had access given by hand as well as rows, and the refusal names both.
