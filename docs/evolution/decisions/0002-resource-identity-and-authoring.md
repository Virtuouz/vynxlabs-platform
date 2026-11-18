# Decision 0002: resource identity, two-way authoring, and access as resources

Status: **proposed**. Nothing is implemented. The open decisions are listed at the end.
Date: 2026-11-17.
Prompted by: the developer-ergonomics test that built `examples/higher-ed-devices` on the test instance, and the owner's review of what renaming costs.

## Summary

A resource's path is its identity, its address and its folder at the same time. Every rename is therefore a delete and a create: history is cut off, outside addresses break, and an agent's MCP tool disappears. The master spec promised otherwise ("A rename changes the path and keeps the ID", `docs/master-spec.md:203`), but only tables were built that way.

Ownership has the same root. A resource is managed either from the repository or from the console, never both (`docs/master-spec.md:207`). The reason is that a repository resource is the *output* of running TypeScript, and the console cannot edit that source. Groups, service accounts and roles are not resources at all. Code refers to them by display name, and none of them can be renamed.

This record proposes five changes that together make renaming routine and let the console and the repository edit the same things:

1. **Three names per resource.** A permanent **key**, a changeable **path**, and a free **title**. The key is readable and defaults to the path the resource was created under.
2. **One file format that both sides edit.** Declarative YAML, typed by the kinds' JSON Schemas, merged by key. TypeScript that generates definitions stays available as a repository-only option.
3. **Tenant-scoped resources for access.** Member groups, end-user groups, service accounts, custom roles, tenant bindings and SSO mappings become resources a repository can create. Who is *in* a group stays state.
4. **Public names chosen deliberately.** MCP tool names set by the author, aliases for old paths, and changes to public names flagged as breaking.
5. **Safeguards.** A deploy that would silently destroy history stops and asks. A definition that is defined but not exported is a build error.

**Guiding principle (owner, 2026-11-17):** what code can do, the console can do too, within reasonable limits. Fully custom apps, and code that imports the repository's own modules or npm packages, stay repository-only.

## Context

### Path is identity today

| Where | What it keys on | Evidence |
| --- | --- | --- |
| Registry | `unique (workspace_id, path)` across every kind | `packages/db/migrations/0004_resources.sql:14` |
| Path grammar | lowercase segments joined by `/` | `packages/manifest/src/envelope.ts:4` |
| Deploy | matches by path. A missing path is deleted, a new one is created | `apps/control-plane/src/kernel/execution/deploy.ts:261`, `:294` |
| References in bodies | a flow step's script, a widget's table, an app's interface, a script's `uses` | `packages/manifest/src/kinds.ts` |
| Run history and idempotency | `run.script_path`, `flow_run.flow_path`, `unique (…, script_path, idempotency_key)`, `trigger_state.target_path`, health, operations | `0008_execution.sql`, `0010_events_flows.sql`, `0034_operations.sql`, `0038_health.sql` |
| Console drafts | primary key `(workspace_id, path)` | `0020_authoring.sql:21` |
| Console files in git | `platform/<path>.<kind>.yaml` | `docs/phases/phase-7-authoring.md:57` |
| MCP tool names | path with `/` → `__` and `-` → `_` | `apps/control-plane/src/routes/mcp.ts:47` |
| URLs | `/rows/<path>`, `/apps/<tenant>/<workspace>/<path>/` | routes |

These are already keyed by ID, and would survive a rename that kept the ID:
- bindings (`resource_id`, `principal_id`, `role_id`);
- version history (`resource_version.resource_id`);
- SSO group maps;
- API keys;
- webhook URLs, which use a token (`/hooks/<token>`).

**What exists for renames:**
- `putResource` accepts `renameFrom` (`kernel/resources.ts:52`), but the deploy never passes it.
- Tables, and the columns within them, have `renamedFrom`, which keeps their data (`kernel/data/plan.ts:123`).

### Ownership, and why it exists

Repository resources are read-only in the console. Console resources are drafts, written to `platform/` on push.

A deploy speaks for:
- every repository resource;
- every console resource that the previous bundle carried.

A draft at a repository resource's path takes it over, and defining the path in code again takes it back (`docs/phases/phase-7-authoring.md:226-228`).

The split exists for four reasons:
1. **The console can't edit repository source.**
   - The CLI builds the repository and then *imports* the result to read its definitions (`packages/cli/src/build.ts:252`, `:269`).
   - The console only ever sees the manifest. An edit there would be overwritten by the next build.
   - Building on the server would mean running tenant code in the control plane, which Decision 0001 rule 1 forbids.
2. **Two kinds of author.** Phase 7's exit criterion is a member who never opens a terminal, working beside a developer in git.
3. **Everything goes live as a bundle.** Runs are pinned to bundles, rollback points at an earlier one, and promotion copies the same one. So a console save is a draft, not a live change.
4. **The repository stays a complete record.** The server writes only `platform/`, so it never has to merge with a developer's code.

Reasons 2 to 4 stay valid. Reason 1 is the one this record addresses: it's a fact about TypeScript, not about the platform.

### Tenant state is referenced by name

| Item | Rename possible | Referred to by name in |
| --- | --- | --- |
| Member group | no (create, list, delete, members) | bindings in code (`kernel/kinds.ts:117-136`, resolved on every deploy); flow approvers (`kernel/flows/approvers.ts:42`, matched by name while a step waits); `in: "groups"` row rules on text columns (`packages/manifest/src/table.ts:19`, `kernel/data/apply.ts:427`) |
| End-user group | no | bindings in code; row rules |
| Service account | no (`PATCH` changes the description only, `routes/tenants.ts:923`) | bindings in code |
| Custom role | no (`PATCH` changes description and permissions, `routes/permissions.ts:204`) | flow approvers |

Because bindings name principals that only exist in the database, a repository can't bring up its own tenant. The device-lending example needs a manual step before its first deploy (`examples/higher-ed-devices/README.md:17`).

### Found in the ergonomics test

- Renaming a script changes its MCP tool name. An agent configured with `run_requests__submit` breaks.
- Two files that both export `submit`, re-exported from `index.ts` with `export *`, are **both dropped** by esbuild with no warning (reproduced 2026-11-17). The build never sees the script, and the deploy deletes it.
- `examples/*/src/scripts.ts` are 700 to 900 lines. Splitting them is already possible (any layout works if the entry re-exports the definitions), but nothing tells a developer so, and the hazard above makes splitting risky.

## Guiding star: what enterprises expect

From general knowledge of these products, not checked against their documentation for this record:

| Platform | Never changes | Technical name | Label |
| --- | --- | --- | --- |
| ServiceNow | `sys_id` (generated) | table and field names | label |
| Salesforce | record ID | API name, rarely changed, with warnings | label |
| Power Platform | ID | schema name, fixed after creation | display name |

The common pattern: identity never changes, labels change freely, and technical names change rarely and on purpose. Three other expectations shape this record:
- **The identity provider owns membership.** Who is in a group comes from SCIM or SSO claims.
- **Access changes are reviewed.** Governance wants access as reviewed, audited changes, with an emergency path in the console.
- **Two-way change sets.** Changes made in the UI and in source control end up in one reviewable history.

This is a guide, not a rule. Where it conflicts with simplicity for a small tenant, simplicity wins unless a large customer would be blocked.

## Decision (proposed)

### 1. Three names per resource

| Name | Purpose | Changes? | Example |
| --- | --- | --- | --- |
| **key** | identity. Matches a resource across bundles, workspaces, the console and the repository | never. Changing it means a different resource | `requests/submit` |
| **path** | address and folder: URLs, the console tree, the file's location | yes. The old path becomes an alias | `lending/requests/file` |
| **title** | what people read | freely | "Submit a device request" |

- **The key uses the path grammar** and is unique per scope: per workspace for workspace resources, per tenant for tenant resources.
- **It defaults to the path at creation.** In most files it's never written. A developer writes `key:` only to keep an old identity after moving something, so keys stay readable and copy-paste rarely collides.
- **Every kind gets an optional `title`.** Some already have one, such as interfaces and forms.
- **Internally, the per-workspace UUID stays the row's identity.**
  - History tables gain `resource_id`, backfilled from the path. A run belongs to one workspace, so that workspace's UUID is enough.
  - The key exists for matching *across* things: bundle and registry, dev and production, repository and console.
- **The deploy matches by key.**
  - Same key with a new path: a rename. The path is updated in place, and the UUID, history and bindings are kept.
  - Same key with a different kind: refused.
  - A path swap between two resources in one deploy: allowed, with path uniqueness checked at commit.
- **References in bodies keep using paths.** Renames are rare, and the build already checks that every reference resolves, so a stale one is a build error. References passed as SDK objects (`resource: borrow`) update themselves. A reference written as a string can also use the key; the build resolves both.

### 2. One file format that both sides edit

The canonical form of every declarative resource becomes a YAML file in the repository. Both the console (through git sync) and developers (in an editor) edit it, and changes merge by key.

```yaml
# platform/lending/requests/file.script.yaml (file location gives the path; see open decision 2)
key: requests/submit          # written only because the file moved; otherwise implied
title: Submit a device request
mcp: { name: submit_device_request }
description: A student asks to borrow a kind of device.
input: { … JSON Schema … }
uses: { tables: [students, requests, devices] }
# code in the sibling file.script.ts
```

**What can be edited where:**

| How it's defined | In the repository | In the console | Kinds |
| --- | --- | --- | --- |
| Declarative file | yes. Editors complete fields from the published JSON Schemas | yes | table, flow, interface, schedule, trigger, event, variable, connection, connection group, data source, theme, role, binding, and the tenant kinds in section 3 |
| Self-contained script, connector or trigger source (declarative file plus one `.ts` importing only `@vynxlabs/sdk` and `node:`) | yes | yes, in Monaco as today | most scripts |
| TypeScript that generates definitions (the SDK's `define*` in a module, with loops, helpers, shared code) | yes | **read-only**, with "Move to file" | resources a developer prefers to generate |
| Code that imports the repository's modules or npm packages, and apps with their own code | yes | no | fully custom apps; scripts with dependencies |

- **The limit comes from the file, not a mode.** The console edits what it can round-trip and says plainly why it can't edit the rest ("Defined by `src/scripts.ts`, which runs code to produce it"). The existing compose lock-down (`packages/compose`: imports limited to the SDK and `node:`) is what makes a script round-trippable.
- **"Move to file"** writes the resource's current manifest as a declarative file on the workspace's branch. The build then reports the TypeScript definition as a duplicate of that key until a developer deletes it. No tenant code runs on the server: the manifest is data (Decision 0001).
- **Ownership stops being a mode.** The registry records which file defines each resource (`source: { file, generated: boolean }`) instead of `ownership: code | ui`. Takeover and hand-back become moving a definition between files.
- **Merging.** Git sync today resolves at the level of a whole resource, keeping "mine" or "theirs" (`docs/phases/phase-7-authoring.md:251-252`). Declarative files allow a three-way merge per field, with the last synced commit as the base. A conflict then only arises when both sides changed the same field. See open decision 7.
- **What doesn't change:**
  - drafts (now keyed by key);
  - "a save is a draft, a deploy makes it live";
  - production changes only through deploy or promotion;
  - the server writing only the declarative folder.
- **The SDK stays first-class.** `defineTable({ … })` in TypeScript is still the most productive way to write a lot of resources, with types. The declarative form is what it compiles to, and what the console writes.

### 3. Tenant-scoped resources for access

New resources belonging to the tenant, not a workspace:

| Kind | Body (resource) | State (stays in the database) |
| --- | --- | --- |
| `group` | key, title, description, how membership is filled (`manual`, `sso` claim values, `scim` group) | who is in it |
| `end_user_group` | same | who is in it |
| `service_account` | key, title, description | its API keys, which never go in a repository |
| `role` | permissions. Custom roles today, which already exist per tenant or per workspace | — |
| `binding` (tenant scope) | role, principal by key, scope | — |
| `identity_mapping` | claim → attribute, claim value → group, per identity provider | the provider's secrets and certificates |
| `attribute` (optional) | the name and type of an end-user attribute, such as `student_id` | each user's values |

- **Where they live:** a `tenant/` folder in the tenant's repository, as declarative files. They are edited in the console under tenant settings.
- **How they go live:** a tenant release, separate from workspace bundles because these are shared by every workspace.
  - It has the same plan, diff, history and rollback.
  - It needs a new permission, `access:write`.
  - The tenant can require a second person's approval (open decision 5).
  - It is never applied by a workspace deploy or a promotion.
- **Bindings refer to principals by key.**
  - `{ type: "group", key: "tech-desk" }`. The title "Tech Desk" can change freely.
  - Workspace bundles keep their bindings, and the deploy resolves them against tenant resources.
  - A bundle that names a group which isn't in the tenant release fails with a message naming it. The repository adds it under `tenant/`, and the setup step disappears.
- **Approvers are resolved to IDs at deploy**, not by name while a step waits. The waiting step stores group and role IDs, and the console shows their current titles.
- **Row rules** with `in: "groups"` on a text column match the group's **key**, which never changes, instead of its name. During migration they match either, and the deploy warns about tables whose rows still hold names.
- **The built-in roles** (`tenant_admin`, `developer` and the like) stay owned by the platform and are referenced by their fixed names.
- **People stay state.** Members, end users and memberships are never resources. SCIM and SSO keep owning them.

### 4. Public names chosen deliberately

- **`mcp: { name }`** on scripts, and on flows if they become tools. The tool name no longer follows the path. If none is given, the derived name is used as today.
- **Aliases.** A rename keeps the old path answering in URLs, the API and derived MCP names for a fixed period (open decision 4). The console shows the aliases, and they can be removed by hand.
- **Breaking changes are named.** The deploy summary lists changed public names (`mcp.name`, an alias removed or expired) as breaking. Production promotion asks to confirm them.

### 5. Safeguards (independent; can ship first)

- **The delete guard.**
  - A deploy that would delete a resource with runs, bindings or rows, and create one of the same kind, stops.
  - It asks whether this is a rename and names the key to add.
  - `--allow-delete <path>` lets a deletion through deliberately.
- **Defined but not exported.**
  - Each `define*` call registers itself when the SDK loads.
  - The build compares what was registered with what the entry file exported, and fails on any difference.
  - This catches the silent `export *` clash and a definition someone forgot to export.
- **Renames are shown as renames** in the deploy summary, the Changes screen, audit and git commit messages.

## Worked example: the device-lending tenant

**Bringing it up from the repository alone:**

```
tenant/
  groups/tech-desk.group.yaml            title: Tech Desk, membership: { sso: { claim: groups, values: [it-tech-desk] } }
  groups/students.end_user_group.yaml    membership: { sso: { claim: eduPersonAffiliation, values: [student] } }
  service-accounts/helpdesk-assistant.service_account.yaml
  identity/lakeshore-sso.identity_mapping.yaml   attributes: { student_id: studentNumber }
src/ … (as today, bindings name principals by key)
```

The tenant release creates the groups and the service account, and the workspace deploy binds them. The README's "create these first" step goes away.

**The Tech Desk is renamed "IT Service Desk":**
- An admin edits the title in the console, and a tenant release is made.
- The key `tech-desk` is unchanged, so bindings, waiting approvals and row rules are unaffected.
- The YAML change is committed to the repository.

**`requests/submit` moves to `lending/requests/file`:**
- In code, the developer moves the file and adds `key: requests/submit`.
- In the console, a member changes the path. The server commits the moved file with the key written in.
- Either way:
  - the deploy reports `renamed script requests/submit → lending/requests/file`;
  - runs, bindings and the agent's tool `submit_device_request` are unchanged;
  - `/…/scripts/requests/submit` keeps working as an alias;
  - promotion does the same rename in production, whenever it happens.

## Migration

- **Keys.**
  - Every resource gets `key = path`, as does every draft.
  - Bundles in formats 1 to 3 have no keys, so the key is taken from the path on deploy. Older CLIs and repositories keep working unchanged.
  - Bundle format 4 carries `key`, `title`, `mcp` and `source`.
- **History.** `resource_id` is added to run, flow run, trigger state, health and operations, backfilled by joining on workspace and path. Rows for deleted resources stay null and keep their path.
- **Ownership.** `ownership: code` becomes `source.generated = true` with its file. `ui` becomes a declarative file in `platform/`. Files already in `platform/` gain `key` on their next push.
- **Tenant resources.**
  - Existing groups, end-user groups, service accounts and custom roles become tenant resources, each keyed by a slug of its name, with a suffix if two clash. Their current names become titles.
  - The first tenant release is created from what is in the database, and can be pulled into the repository.
- **Code that names principals by name** (`{ type: "group", name: "Tech Desk" }`) is still accepted. It resolves through the title, with a deprecation warning that gives the key.
- **Approvers.** Waiting steps are rewritten from names to IDs. Flow manifests may give either, and the deploy resolves names to keys with a warning.
- **Row rules.** Text columns checked by `in: "groups"` match the name or the key during a transition period. The deploy lists tables whose rows hold names.

## Consequences

**Gains:**
- Renaming and reorganising stop being breaking changes, in code and in the console.
- The console can edit most of what a repository defines, and the repository can define everything the console can, including access. This meets the owner's principle.
- A tenant can be brought up, reviewed and audited from its repository alone, which is what governance teams expect.
- Agents get stable tool names the author chose.

**Costs:**
- This is the largest change to the platform's foundations since phase 7. It touches:
  - the resource model, bundle format and deploy;
  - git sync, drafts and the console's editors;
  - permissions and the flow engine.
- A new concept, the tenant release, with its own approval and history.
- Two ways to write the same resource (TypeScript or YAML) need clear documentation of when to use which.
- Field-level merging, if chosen, is new code in a sensitive path.

**Unchanged:**
- Decision 0001: the control plane handles data and never executes tenant code.
- Bundles stay immutable and runs stay pinned to them.
- Promotion copies the same bundle.

## Alternatives considered

- **Path stays the identity, with renames declared (`renamedFrom` on every kind, aliases, `mcp.name`).** About a third of the work, and it fixes renames made in code. Rejected as the end state:
  - the console can't write `renamedFrom` into TypeScript, so it can't rename what a repository defines;
  - a forgotten declaration is still a delete and a create;
  - a workspace that skips releases loses renames;
  - edits from the console and a branch to the same resource under two paths look like two resources.

  Its pieces (aliases, `mcp.name`, the delete guard) are kept in this design.
- **Generated opaque IDs, like ServiceNow's `sys_id`.** Renames are completely free. Rejected because the IDs can't be read in a repository, copy-pasting a definition copies its identity, and a console-made resource would need an ID written back before code could refer to it. A readable key that defaults to the path gets almost all of the benefit.
- **Layers, like Power Platform's managed and unmanaged customisations.** Console edits sit on top of definitions from code. Rejected: which layer wins is hidden, and reviewing what is actually live becomes hard. That is the confusion governance teams complain about.
- **The server builds the repository's TypeScript, so the console could edit it.** Rejected: reading definitions means importing the built module (`packages/cli/src/build.ts:252`), which is executing tenant code in the control plane (Decision 0001 rule 1). It also couldn't rewrite arbitrary TypeScript safely.
- **Members and end users as resources.** Rejected: people belong to the identity provider and to SCIM, and personal data doesn't belong in a repository.

## Proposed plan

| Milestone | Contents | Depends on | Size |
| --- | --- | --- | --- |
| M0 Safeguards | Delete guard; build check for defined-but-not-exported; renames shown as renames | — | S |
| M1 Keys and renames in place | `key` on resources and drafts; deploy matches by key; `resource_id` on history tables; path aliases; bundle format 4; migration `key = path` | M0 | L |
| M2 Public names | `mcp.name`; breaking public-name changes flagged at deploy and promotion | M1 | S |
| M3 Tenant resources | groups, end-user groups, service accounts, roles, tenant bindings, identity mappings; tenant releases with `access:write` and optional approval; bindings by key; migration of existing principals | M1 | L |
| M4 Access by ID | approvers resolved at deploy; row rules by group key; migration of waiting steps | M3 | M |
| M5 Two-way files | declarative format for every kind, published schemas, console editors writing it, "Move to file", `source` replacing `ownership`, three-way merge if chosen | M1 | L |
| M6 Examples and docs | `examples/higher-ed-devices` and `fernhill` split into files and brought up with no setup step; SDK guide on TypeScript or YAML | M3, M5 | M |

M0 is useful on its own and can ship now. M2 can follow M1 directly. M3 and M5 are independent of each other and could run in parallel.

## Open decisions for the owner

1. **Where declarative files live:** only under `platform/` and `tenant/` (as today, simple for the server), or anywhere in the repository by file suffix (`*.script.yaml`), which suits developers who organize by feature.
Answer: anywhere in the repository.
2. **Whether the file's location is its path**, so renaming means moving the file, or the path is a field inside the file and location is free. Location-as-path is more intuitive. Path-as-field allows any folder layout.
Answer: location-as-path as the default when no path-as-field is set
3. **Whether a key can ever change.** For example, an admin "re-key" that rewrites references and history in one step. Or "never; create a new resource".
Answer: No, the risk of "that was a terrible name" is accepted.
4. **How long aliases live:** a fixed period (such as 90 days), until removed by hand, or forever, with a warning in the API's response headers.
Answer: fixed period by default (90 days), with a warning in the API's response headers
5. **Approval for tenant releases:** optional per tenant, required for production-tier tenants, or always two people for changes to access.
Answer: optional
6. **Whether tenant resources need a test stage before they apply**, like dev → production, or plan and approval is enough.
Answer: plan and approval
7. **Merge granularity for git sync:** stay per resource ("mine" or "theirs"), or per field with a three-way merge.
Answer: stay per resource
8. **Whether URLs can use keys** (`/rows/~requests-submit`) as a stable form beside the readable path.
Answer: No, but leave this in a state such that if it is needed in teh future it is easy to add.
