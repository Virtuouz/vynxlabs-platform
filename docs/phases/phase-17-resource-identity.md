# Phase 17: resource identity, two-way authoring and access as resources

Status: in progress on branch `phase-17-resource-identity`, off `main`. M0 to M4 built. M5 and M6 built except for what their sections list. Walked through on the test instance on 2026-11-18. Not pushed.
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

**Where the exit criterion stands.** Each part is covered by an automated test against a real database, and all but one were walked through, most of it on the test instance, on a tenant that was upgraded from `main` with the example already deployed. See "On the test instance" at the end.
- bring-up from the repository: `packages/cli/src/access.test.ts` releases a tenant's access with the CLI from files, and `examples.test.ts` checks the example defines what it names. On the instance the tenant already had its group and service account, so the release adopted them. An empty tenant was brought up on the image run locally: `tenant release` made the group and the service account, `deploy` made everything else, and `promote` did the same in production.
- a title changed with bindings, an approval and a row rule intact: `access-releases.test.ts`, `mcp.test.ts`, `data-access.test.ts`. Walked for bindings and for an approval that was waiting since before the upgrade. **Not walked: a row rule**, since the example has none that names a group.
- a move reported as a rename, from code and from the console, with runs, bindings, tool name and old address kept: `renames.test.ts`, `authoring.test.ts`, `git.test.ts`. Walked both ways.
- the same rename on promotion: `renames.test.ts`. Walked, there and back.

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
- **A test holds down direct lookups of a resource by path** (`path-lookups.test.ts`, added after the walk-through). It counts, per file, the queries that read the `resource` table by an exact path: 28 in 16 files, each an authoring lookup, a path taken from the bundle a run is pinned to, or a filter that already allows for former paths. A new one fails the test until it goes through `resolveResource` or is added with its reason.
- **A run pinned to an older bundle reaches a renamed resource by the path it knows.** A run that was already going when a rename was deployed asks for a variable, a connection, a connection group, a table or a data source by the path its bundle had, and what was set for it has moved. The worker's lookups were by exact path and found nothing. They now go through the path the resource has now (`pathNow` in `kernel/resolve.ts`); what a script may read is still what its own bundle declared. An event is published under the name it has now, whoever publishes it by the old one.
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

- **Two tool names made from paths cannot collide any more** (`a-b` and `a_b`, or two long paths cut at 64 characters). This was first left alone, since refusing it stops a repository that builds today. With one instance in use and none outside, the build and the upload now refuse it and say to give one an `mcp.name` or another path: an agent was offered one of the two tools and could never reach the other.
- **Removing a script counts as breaking**, which the record did not list. An agent that calls a tool that is gone fails the same way as one that calls a renamed one.
- **Only a promotion to production asks.** A direct deploy to a production workspace, and any deploy to dev, list `breaking` and go ahead.
- **The settings page's older promote dialog** lists what breaks and sends the confirmation with its Promote button. It has no separate question, and cannot allow a refused deletion: the release screen does both.

## M3: tenant resources and tenant releases

**Keys.** Migration 0071 gives a member group, a group of end users and a service account a `key`, made from its name: lower case, anything that is not a letter or a digit turned into a hyphen, a number after it where two would be the same. A row made without one, as a directory makes them, is given one by a trigger. The name stays what people read, and can now change.

**A tenant's access as resources** (`packages/manifest/src/tenant.ts`).

| Kind | Key | Body |
| --- | --- | --- |
| `tenant_role` | the role's name | `description`, `permissions` |
| `group`, `end_user_group` | its key | `title`, `description`, `membership.sso.values` |
| `service_account` | its key | `title`, `description` |
| `tenant_binding` | a name for the file | `role`, `principal { type, key }`, `workspace` |

Each is one file, `<key>.<kind>.yaml`, with the title beside the body. A file's key is its name unless it says `key:`. Where it is kept is the repository's business: the CLI finds the files by name.

**A release** (`kernel/tenant/releases.ts`) sets what is asked for against what the tenant has and changes the difference in one transaction.
- `POST …/access/plan` carries the release out and takes it back, so it says exactly what a release would do or why it would be refused.
- `POST …/access/releases` releases a whole set. What the set lacks is removed only when allowed by name (`delete_not_allowed`).
- A group or a service account that a workspace's bundle still gives access to is not removed (`principal_in_use`).
- `POST …/releases/:id/rollback` releases what an earlier release left.
- `GET …/access` gives the tenant's access as resources and as files.
- Needs `access:read` and `access:write`. The second was given to every role that could already change groups, service accounts or roles.

**Approval.** `PUT …/access/approval` turns it on, and needs two members who may release. A release then waits, 202, until someone other than its author approves it. If the tenant's access changed since it was asked for, approving is refused as stale.

**The console's and the API's changes are releases of one change.** Making, renaming and deleting a group, a service account and a tenant role, making and deleting a group of end users, and giving a role to or taking one from a group or a service account each go through `releaseOne`. They are in the same history and wait the same way. What a person is given, and anything given at one resource, is still done at once.

**A workspace's binding names a principal by key.** `{ type: "group", key: "tech-desk" }`. By name it still works, and each deploy says the key to use. A key nobody has fails the deploy with the file to add and the command to run. A binding whose row was lost is applied again by the next deploy, though its definition did not change.

**Identity providers.** A group a directory pushed is marked as the provider's: it has a key, is left out of what the tenant releases, and no release removes it. What a release said about group membership is kept on the group and given to a provider made later. Mapping claim values by hand replaces only what was mapped by hand.

**Git.** With `tenantBranch` set on the tenant's repository, every release that changed something is committed there, under `tenant/`, authored by whoever made it. Never the default branch.

**CLI.** `platform tenant plan | release | pull | releases | approve | decline | withdraw | rollback`.

**Console.** Members & access has a Releases tab: what each release did, who made and who answered it, Approve, Decline and Withdraw on one that waits, "Go back to this", and the switch for asking a second person. Groups show their key and can be renamed. A change that waits is told to whoever made it where a failure would be.

### Findings

- **No second registry was built.** The plan had `tenant_resource` and `tenant_resource_version` tables with a hook per kind projecting onto the tables access is checked by. Instead those tables are the registry: a release reads the tenant's access from them and writes the difference to them, and keeps what it asked for and what the set was afterwards. One place holds the truth, the console and a repository cannot disagree about it, and going back restores a release's snapshot. What is lost is a version number per group.
- **A binding has no key of its own.** It is what it gives to whom, and where. Two files that say the same binding are one binding, and `pull` writes a binding into the file that already says it.
- **`membership.sso` has no provider and no claim.** The values apply to every provider of the tenant that signs that kind of person in, read from the claim that provider is set up with. Group maps are per provider, and a repository should not need a provider's ID.
- **Not built: `identity_mapping`** (claim to end-user attribute) and the optional `attribute` kind. A provider's attribute map is still set on the provider. The device-lending example keeps that one step in the console, beside making the provider itself, which needs its secret.
- **The role a group is given through the console is a release only when the role is the tenant's or a built-in one.** A role one workspace defines is that workspace's to give, and such a binding is made at once.
- **Renaming a group changes what a row rule and a flow's approvers match until M4**, since both still go by name.
- **The console cannot set `tenantBranch`.** It has no control for `releaseBranch` either: both are set through `PUT …/git-repository`.
- **Deleting a role that is still bound answers as before** (409, "still bound"), and deleting a group no longer removes access a bundle gave it.
- **I overwrote `routes/access.ts` while adding the release routes**, which already held the routes that explain why someone has the access they have. It was restored from git before anything was committed, and the new routes are in `routes/access-releases.ts`.

## M4: access by ID

**Approvers.** When a step begins to wait for approval, who its approvers are is resolved and kept on the step as `approverIds`, beside the names the flow gave (`kernel/flows/engine.ts`, `kernel/flows/approvers.ts`).
- A group is named in a flow by its key, or by what it is called. A role is every role of that name the workspace can see, as before.
- `isApprover` matches by ID when the step has them. A group renamed while the step waits is still its approver, and the step says who may decide by what the group is called now.
- An approver that was not there to be found, such as a group made after the step began to wait, is kept by name and still looked for, by key or name. That is what happened before, and a test relied on it.
- Migration 0073 writes the IDs for steps already waiting.
- A group that a waiting step names cannot be deleted (`principal_in_use`): nobody could decide the step.
- A deploy warns when a step names a group by its title, with the key to use, and when it names a group the tenant does not have.

**Row rules.** A person's groups are offered to a table's rules as each group's ID, key and name (`groupValues` in `kernel/data/rows.ts`). A row that holds the key keeps matching through a rename. A row that holds the name matches as long as the name is that. A group cannot be called by another group's key: it would be given the rows that hold that key.

**Apps.** The session an app reads has `groupKeys` beside `groups`. `groups` is still what the groups are called.

**Groups of end users can be renamed** (`PATCH …/end-user-groups/:g`), which M3 held back until row rules matched by key.

### Findings

- **Approvers are resolved when the step starts to wait, not at deploy.** A run is pinned to its bundle and the engine reads the step from that bundle, so IDs worked out at deploy would describe another bundle's steps. The deploy only warns.
- **A step whose approvers resolve to nobody still waits**, as it did. The plan had it fail. A group can be made, and people put in it, while it waits, which the "later" list above exists for. The deploy warning is what says so early.
- **Not built: the tenant switch that stops rows matching by name, and the scan for rows that still hold a name.** Matching by name is kept on. Reading every table with a groups rule in a tenant's own database at each deploy was judged not worth its cost while nothing depends on the answer.
- **`groups` in an app's session was never keys**, as the plan assumed: a group of end users has taken any one-line name since phase 8. So the keys are a new field and `groups` is unchanged.

## M5: two-way files

**What a file may say.** Beside `schemaVersion` and `body`: `key`, `path` and `title` (`packages/manifest/src/files.ts`). A file that says none is read and written byte for byte as before. A script's code is named in the bundle by its key, in the file reader, in compose and in a draft, so a rename leaves compiled code under the same name.

**Files anywhere in a repository.** `parseRepositoryFiles` finds resource files by name: `<name>.<kind>.yaml` for a kind there is, and the `.ts` beside one that has code. `vite.config.ts` and `orders.test.ts` are nobody's.
- A file under a root gets its path from where it is, under the longest root that holds it. The console's folder is always a root.
- A file outside every root says `path:`, or the build names the roots and stops.
- `vynxlabs.yaml` at the repository's root lists more `roots` and folders to `ignore`. `node_modules`, `dist`, `build` and dot-folders are never read. `.gitignore` is not consulted.
- `platform build` and `deploy` read this way. A resource defined in the code and in a file, by path or by key, is refused naming the file.
- A file that is not where the console would have written it travels in the bundle with `source.file`, and the resource answers with `definedIn`.

**Renaming and titling from the console.** `PUT …/drafts/<path>` with `path` moves the draft and keeps its key; with `title` it sets one. The draft says `change: "rename"` and `renamedFrom`. Deployed, it is the same resource at the new path. Drafts are composed by key. What refers to a renamed resource by its old path, which is its key, is built as the new path, in the console's compose as in the CLI's build.

**Git, across the whole repository.** Sync reads and writes resource files wherever the repository keeps them, and nothing else.

| Step | What it does |
| --- | --- |
| Read | Walks the branch's tree as the CLI's build does: every `<name>.<kind>.yaml` and the `.ts` beside a script, pruned by `vynxlabs.yaml` and the folders never read. No longer one folder |
| Compare | Resource by resource, by key. A rename on one side and an edit on the other is one conflict, not a delete and an add |
| Push | Writes each changed file at its own place and removes only files the last sync recorded. Every other entry in the tree keeps its checksum (`patchTree`) |
| Pull | Deploys what changed in any of those files. `tools/keep.variable.yaml` that says `path:` is as good as `src/lending/limit.variable.yaml` under a root |

- **A file is rewritten only when what it says changed here.** Where the workspace and the branch say the same, the branch's bytes count as the workspace's. A file written by hand keeps its comments and its order until someone edits that resource in the console; then it is written in the console's form.
- **A draft of a file outside the console's folder is saved like any other.** The `defined_in_file` refusal is gone. The manifest keeps `source.file`, so the push writes it back there.
- **A rename moves a file named for its path** (`src/lending/limit.variable.yaml` to `src/lending/cap.variable.yaml`, with `key:`). A file that says `path:` stays where it is and says the new one.
- **Before writing, a push reads the result as a build would.** If two files would then claim one key or path, nothing is written and the push says which.
- **The first push to a new branch removes nothing outside the console's folder.** The branch starts as the default branch, which may hold resource files this workspace never had. They are left, the push answers `behind` and names them, and a pull brings them in.
- **A pull now takes in every resource file on the branch**, as `platform deploy` from that branch would. A repository that holds files for more than one workspace lists what is not this one's under `ignore:` in `vynxlabs.yaml`.
- **A release branch is a mirror.** A resource file there that production does not have is removed, wherever it is.
- **Names changed in the API.** `conflicts`, `applied`, `changedOnBranch` and the keys of `resolutions` are now from the repository's root (`platform/orders/hello.script`, not `orders/hello.script`). The old form of a `resolutions` key is still taken. Compare gives each file its `resource`, and marks a conflict by resource.
- **Migration 0074** rewrites what each workspace last agreed with its branch from folder paths to repository paths, so a workspace that was synced stays synced.
- **`platform pull`** writes those files too. `GET …/resource-files` gives them apart, as `elsewhere`, and takes the repository's `roots`. A file that already says the same is left as written; one that differs and was never pulled is kept unless `--force`; only a file a pull wrote is ever removed.

**Console.** The resources list shows title, key (when moved) and where each is defined, with Rename for what the console manages, files under `src/` included. For what the repository's code defines the button is off and says how to rename it there. The release screen shows a rename as one.

**Schemas.** `schemas/files/<kind>.v1.schema.json` describes each kind's file, for an editor to complete and check: 17 workspace kinds and the 5 of a tenant's access.

### What M5 left out

The plan's M5 had eleven steps. Git sync across the repository was built after the rest, at the owner's word. These were not built, and each is a limit on what the phase delivers:

- **`ownership` is still the switch.** There are no `source_file` and `source_generated` columns, and the deploy still decides what it speaks for by `code` and `ui`. Where a file is travels in `meta.source`.
- **The console does not say which file a TypeScript definition is in.** The SDK does not record where `define*` was called, so `definedIn` is empty for code.
- **"Move to a file" is the takeover there was, now with a button.** The editor of a schedule, trigger, variable, connection or other kind without code says that the repository's code defines it, names the file it becomes, and saves the takeover draft as it is. The build then refuses the second definition by name, and a deploy from the repository that still defines it takes it back. Scripts, connectors and trigger sources keep their own takeover.
- **A draft's primary key is still its path.** It has a key, unique in the workspace, and is found by path.
- **Name and path are one dialog**, opened from the resources list and from the script, flow and resource editors: the key (read only), the path and the title. It saves a draft. An editor with unsaved changes asks for them to be saved first. An app's and an interface's title stays in their own editor. A draft that says `title: null` now takes the title away; it used to keep the old one.
- **`platform schemas`** writes each kind's file schema to `.platform/schemas/` in the repository and adds the mapping to `.vscode/settings.json` (`yaml.schemas`), keeping what is there. A settings file with comments is left alone and the mapping printed. The schemas come from the CLI, so they match what it builds. **Not built:** shipping them in the SDK package or serving them from the control plane, which the command makes unnecessary.
- **A file's comments survive an edit in the console.** A change is written into the file as its author wrote it (`ontoWritten` in `packages/manifest/src/files.ts`): comments, the order of keys, quoting and blank lines stay wherever what they sit beside is still there. A new key goes where the console's form has it among the keys present, a file's heading comment stays on top, and a key that goes takes its comment with it. The result is read back before it is used, and if it does not say exactly what was to be said the console's own form is written instead. A push, `platform pull` and `platform tenant pull` all write this way. Limits: a comment inside a list stays at its position, not with its item; a value that changes shape is written afresh; a file using anchors falls back to the console's form when a change touches one; a `.ts` file is written whole, as before.
- **Whether the workspace changed a resource is read from what it says, not from bytes** (migration 0075, `workspace_git.synced_said`). Once a file keeps its author's form, the bytes a push would write differ from the last synced bytes whenever the branch changed, so the old test called every change on the branch to a hand-written file a conflict. That was already so before comments were kept, for a file a developer changed twice: found while building this, and covered by the test now. A workspace that has not synced since the migration is compared by bytes until it does.
- **A pull cannot see TypeScript.** A definition moved from a YAML file into code on the branch reads as that file deleted. The deploy that follows is the same one a console deletion makes.
- **The folder setting still has to be the same in the repository and the CLI** (`platform` by default): the server takes it from the tenant's repository settings and the CLI from `--resources`.
- **A developer who moves a file on the branch without `key:`** makes a delete and a create, which the delete guard stops when the old one holds something. Nothing recognises the move for them.

## M6: examples and documentation

- **`examples/higher-ed-devices` brings up its own access.** `tenant/groups/tech-desk.group.yaml` and `tenant/service-accounts/helpdesk-assistant.service_account.yaml` define what its bindings and its review flow name, now by key. The README's "create these first" step is `platform tenant release`.
- **`examples/fernhill`** names its groups and its agent by key and defines them under `tenant/`. Its setup script still makes them through the API, with the same keys.
- **Both are built in CI** (`packages/cli/src/examples.test.ts`): each builds under the new checks, says nothing that needs format 4, defines in `tenant/` everything it names by key, and has no binding left that goes by a title. Both are in the root `typecheck`.
- **`docs/sdk-guide.md`** is new: the three names, moving a resource, tool names, TypeScript or YAML, a tenant's access, and what the build stops. `docs/master-spec.md` says how identity works now. `docs/contracts/bundle.md` and `tenant-export.md` were written in M1.

### What M6 left out

- **`src/scripts.ts` is not split** in either example (726 and 917 lines). The build check that made splitting safe is there, and the guide says how to export from several files.
- **`examples/higher-ed-devices` keeps two resources as YAML files** beside its TypeScript: the `loans/days` variable and the schedule that marks loans overdue, under `platform/loans/`. The script that reads the variable names it by path. `fernhill` is all TypeScript still.
- **The device-lending example was walked through on the test instance** after this was written: see "On the test instance".
- **`docs/phases/phase-7-authoring.md` still has its stale notes** (that `platform pull` is not built, and "Changes screen").

## What was run, and what was not

- After each milestone: `pnpm test` (build and every unit and integration test, against Postgres), `pnpm typecheck`, `biome check` on `apps`, `packages` and `docs`, `pnpm check:migrations` and the schema check.
- **Three or four tests of managed workers in `execution.test.ts` fail in some full runs and pass every time the file is run alone** (49 of 49). They wait on timing that a machine running every suite at once does not always give. They failed in the same way before and after M2's changes.
- `biome check .` at the repository root reports errors in `temp/`, which is not part of the repository, and one older warning in `e2e/wide.spec.ts`.
- **The browser tests (`pnpm e2e`) were run on 2026-11-18** against the built image: see below.

## On the test instance

On 2026-11-18 the branch's image was deployed to the test instance, the only instance there is. Its database was at migration 67 with four tenants. One of them, `higher-ed`, had this phase's example deployed from `main` in a dev and a production workspace, with an approval waiting in production. A dump was taken first, and migrations 68 to 74 were run on a copy of it before the deploy.

**What held:**

- **The upgrade.** Seven migrations applied. Resources got keys, the group and the service account got `tech-desk` and `helpdesk-assistant`, and the waiting approval got its approvers by ID.
- **Access from the repository.** `platform tenant plan` and `release` adopted the group and the service account that were there (two updated, none made), and a second plan found nothing to do. The deploy that followed updated the flow and eight bindings to name them by key.
- **A group renamed.** The Tech Desk group was renamed to "IT Service Desk" through the API, as the console does. The approval that had waited since before the upgrade, on a run pinned to a bundle that names "Tech Desk", was still listed for the group's member, said the new name, and was approved; the flow finished.
- **A move in code without a key** was refused by the delete guard, naming both paths and the key to give.
- **A move in code with the key** was a rename: eight runs listed under either path, the agent's access carried, `run_requests__submit` still offered beside `run_lending__requests__file` and marked with its end date, and a run started at the old path answered with `Deprecation`, `Sunset`, `Warning` and `Vynx-Resource-Moved`.
- **Promotion** did the same rename in production.
- **A move in the console.** A script made in the console, deployed and run, was renamed and titled by a draft: one rename, its run kept, the old path answering. A deploy from the repository afterwards left it alone, as something the repository never had.
- **Going back.** Deploying the repository as committed renamed the script back, and promotion did the same in production.

**What it found, each fixed with a test:**

| Found | Cause | Fix |
| --- | --- | --- |
| `POST …/promotions` with no body answered 400. The browser tests caught it; every other test sends `{}` | M2 gave the route a body, and a route with a body schema refuses none | The route takes no body as an empty one |
| Renaming something back was reported as breaking, and promoting it to production needed `--confirm-breaking` | The path taken back was the resource's own alias, and ending any alias counted as cutting a caller off | Only an alias of another resource counts |
| `platform tenant plan` did not say that it would undo a change made in the console | The plan's notice was never built: `warnings` was always empty | A release of the whole set names each resource last changed by a one-change release since the last whole one, and says to pull first |

**What the walk-through did that it should not have.** Deploying the test script with `POST …/changes/deploy` and no `paths` also deployed two drafts the operator had left on `screens/borrow` and `screens/desk` in the dev workspace. A deploy from the repository put the screens back, and the two drafts were saved again from the dump, as they were. They are now authored by the developer account at revision 1, and their undo history is gone. Nothing of it was promoted.

**The browser tests:** 47 tests. The first run passed 43, failed the promotion above, and did not run the 3 after it in the same file. With that fixed, 45 passed, and one failed on its own expectation: a pull names what it applied from the repository's root now (`platform/orders/small.flow`), which the test still spelled the old way. With the test corrected its file passes.

**Also found:** the CLI read only the first 200 tenants when looking one up by slug, so an operator of an instance with more could be told they had no access to a tenant they had. It reads every page now. This is not covered by a test.

**Git sync against a hosted repository** was run on 2026-11-18, from the image on a developer's machine against a new public repository on GitHub, with a file written by hand under `src/` and `roots: [src]`:

- the first push made the workspace's branch with the console's script under `platform/`, left the file under `src/` alone, and answered `behind`; the pull that followed brought that file in;
- a value changed in the console was one line changed on GitHub, with the file's comments, blank line and trailing comment as written;
- a developer's commit was pulled; a change on both sides refused the push as behind and the pull as a conflict, the comparison showed both versions, and keeping the workspace's then pushed it;
- a rename in the console was a rename on GitHub (`limit.variable.yaml` to `cap.variable.yaml`, with `key:` and the heading comment kept); a delete removed both files of the script;
- a promotion made `release/main` with what production runs;
- each commit is authored by the person who asked and committed by "Platform".

Two things it showed:

- **A repository that was just made could not be connected, and was told "The branch was not found".** It is now told that it is empty and to make a first commit on the default branch, and a default branch that goes by another name is told the branches there are. Starting a branch in an empty repository is not built.
- **A pull before the workspace's branch exists takes nothing**, though the default branch may hold resource files. The first push makes the branch and answers `behind`, and the pull after it brings them in. This is as designed, and is one step more than it could be.

A file on a release branch keeps the comments that branch had, which came from the default branch, not the ones the workspace's branch has.

