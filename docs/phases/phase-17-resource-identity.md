# Phase 17: resource identity, two-way authoring and access as resources

Status: in progress on branch `phase-17-resource-identity`, off `main`. M0, M1 and M2 built. Not pushed.
Last updated: 2026-11-18

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

## M1: keys and renames in place

**Three names.** Migration 0068 gives `resource` and `resource_version` a `key`, a `title` and `meta` (what a bundle says beside the body: `mcp`, `source`), and drafts and their history a `key`. Everything there was keeps its path as its key. A key is unique in its workspace and is never rewritten: `putResource` keeps the one a resource has.

**The deploy matches by key** (`matchByKey` in `kernel/execution/deploy.ts`).
- A manifest's key is the one it gives, or its path.
- The same key at another path is a rename in place. The resource keeps its ID, versions, runs, rows and bindings, and the summary says `renamed`, with `from`.
- A manifest that gives no key, and whose path is nobody's key, is the resource of its kind at that path. So a bundle in formats 1 to 3, and a resource renamed by hand, are still matched; and deploying a bundle from before a rename renames back.
- A manifest that gives no key and meets a resource of another kind at its path is a new resource in its place, as before. One that gives a key belonging to another kind is refused: `kind_changed`.
- A path this deploy does not free is refused: `path_taken`.
- Two resources can swap paths. The one in the way moves to `~swap/<id>` first, which no path can be.
- The checks for what is bound run after the renames, so a renamed production connection keeps its binding through a promotion.

**What is kept under a path comes along** (`kernel/rename.ts`). Connection bindings, variable values, data source bindings, group members, app domains, trigger pauses, health checks, webhook refusals, OAuth state, recent items and drafts are rewritten in the rename's transaction. When the new path already has a credential of its own, that one is used, the old one stays where it was, and the deploy says so. A table follows its resource with its rows: `planTable` looks for the resource's own table before it looks for the name.

**Aliases** (`kernel/resolve.ts`). A rename leaves the old path answering for 90 days.
- Through an alias: `GET …/resources/*`, starting a run or a flow run, a table's row routes, an agent's tool under the name it had, a binding's `resource`, and an app's address (308 to the new one).
- The answer carries `Deprecation`, `Sunset`, `Warning` and `Vynx-Resource-Moved`.
- An alias is never a path in use. A resource made at one ends it, and the summary lists it under `aliasesRemoved`.
- `GET …/aliases` lists them with when each was last asked for, to the hour. `DELETE …/aliases/*` ends one. Expired ones are swept.
- A request names a resource through one `parseRef`. A key in a URL would be `~<key>`, which no path can be: one branch there, and a lookup the `(workspace_id, key)` index serves.

**Runs.** `run.resource_id` and `flow_run.resource_id` are nullable (migration 0069), and no longer hold a bundle's ID. A flow run, and a step pinned to an earlier bundle, find their resource by the key that bundle gives. Runs are listed by the resource behind a path, and the same idempotency key finds its first run after a rename.

**Bundle format 4** carries `key`, `title`, `mcp` and `source` on a manifest, and is written only when one of them is there (`docs/contracts/bundle.md`). The SDK's `define*` take `key` and `title`. A reference written as text may name a moved resource by its key: the build rewrites it to the path and says so.

**Console.** Renames show as "old path to new path" in the release preview, the promotion preview and the environments dialog. The workspace's Resources tab lists old paths that still answer, with "End now".

### Findings

- **A tenant export needed no new format.** An import already refuses any export not written at its own database level (`kernel/tenancy/import.ts`), so new columns travel as they are. The plan's "export format 2 with a version 1 reader" was not needed.
- **The idempotency constraints were left alone.** The plan replaced the unique on `(workspace_id, script_path, idempotency_key)` with two partial ones. Instead the lookup also tries the paths the resource had, read from its aliases. The same request finds its run across a rename, and no index on `run` is rebuilt. Two requests racing across the moment of a rename could both start: accepted.
- **Copying a body's title into the manifest would have put every repository with an app in format 4**, and so stopped it deploying to an older instance. An app's, an interface's and a form's title stays in the body. The deploy reads the resource's title from there, and migration 0070 fills it in for what is deployed.
- **A new resource at the path a moved one had must say a key of its own.** Its path is the moved one's key. The build refuses it by name: "its key is also the key of …".
- **The delete guard still fires when a whole bundle is swapped for another** with scripts that have runs. One test did this and now says which paths it deletes.
- **`binding.resource`, `app.reads` and an interface action's target are still not checked at build.** A console-made resource is in no uploaded bundle, so a strict check would refuse valid uploads. A schedule's `flow` is now checked, as its `script` was. A binding finds its resource through an alias, and the build rewrites a reference by key.
- **`platform deploy` now prints a deploy's warnings**, which it never did: in a dev workspace, what is not bound yet.
- **Not built:** the test that would stop new direct lookups of a resource by path. Most of the fifty or so that exist are authoring lookups that should stay strict, so a count to hold down says little.
- **The console's promotion screen still cannot allow a deletion** the guard refuses. That comes with M2's confirm step.

## M2: public names

**A script or a flow says the name of its tool.** `mcp: { name }` on `defineScript` and `defineFlow`, carried on the manifest and kept in the resource's `meta`. The agent sees that name as it is, with no `run_` or `start_` in front. Without it the name is made from the path, as before.

**A chosen name is one tool's.** The build and the upload refuse a name that another script's or flow's tool has, one of the four every agent has (`get_run`, `get_flow_run`, `list_approvals`, `decide_approval`), and `mcp` on any other kind.

**Breaking changes are named.** A deploy's summary has `breaking`, one sentence each:
- a chosen name changed or dropped;
- a name made from the path replaced by a chosen one, with the path unchanged, so no alias keeps the old name;
- a script or a flow removed, and its tool with it;
- a script or a flow made at a path that still answered for one renamed away from it.

A rename alone is not breaking: the alias keeps the old name answering.

**Promoting them to production is confirmed.** Without `confirmBreaking: true` the promotion is refused with 409 `breaking_changes`, listing them. The preview shows them and is not refused. `platform promote` stops and asks for `--confirm-breaking`. The console lists them above the promote button and in the question it asks, and sends the confirmation.

**The console can allow a deletion the guard refused** (left over from M0). When a promotion preview is refused with `rename_suspected`, "Delete them anyway" asks, then previews again with those paths allowed.

### Findings

- **Two tool names made from paths can still collide** (`a-b` and `a_b`, or two long paths cut at 64 characters). That was always so, and refusing it now would stop repositories that build today. Only a clash that involves a chosen name is refused.
- **Removing a script counts as breaking**, which the record did not list. An agent that calls a tool that is gone fails the same way as one that calls a renamed one.
- **Only a promotion to production asks.** A direct deploy to a production workspace, and any deploy to dev, list `breaking` and go ahead.
- **The settings page's older promote dialog** lists what breaks and sends the confirmation with its Promote button. It has no separate question, and cannot allow a refused deletion: the release screen does both.

## What was run, and what was not

- After each milestone: `pnpm test` (build and every unit and integration test, against Postgres), `pnpm typecheck`, `biome check` on `apps`, `packages` and `docs`, `pnpm check:migrations` and the schema check.
- **Three or four tests of managed workers in `execution.test.ts` fail in some full runs and pass every time the file is run alone** (49 of 49). They wait on timing that a machine running every suite at once does not always give. They failed in the same way before and after M2's changes.
- `biome check .` at the repository root reports errors in `temp/`, which is not part of the repository, and one older warning in `e2e/wide.spec.ts`.
- **The browser tests (`pnpm e2e`) were not run.** They need the built image serving on port 8080 with its stack, which was not up. The console changes of M1 and M2 are covered by component tests only.
