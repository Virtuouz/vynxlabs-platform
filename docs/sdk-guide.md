# Writing a tenant repository: names, files and access

Last updated: 2026-11-18. Covers what phase 17 added. The SDK's types document each option, and `schemas/` holds the machine-readable form of everything here.

## A resource has three names

| Name | What it is | Changes? |
| --- | --- | --- |
| `key` | The resource's identity | Never |
| `path` | Its address and folder | Yes: that is a rename |
| `title` | What people read | Freely |

Most resources never say a key: it is the path they were made at.

### Moving a resource

Change `path`, and say `key`: the path it had.

```ts
export const submit = defineScript({
  path: "lending/requests/file",
  key: "requests/submit",
  title: "Submit a device request",
  // …
});
```

The deploy reports `renamed script requests/submit -> lending/requests/file`. It is the same resource: its run history, its rows if it is a table, what the workspace bound to it and what it was given access to all stay. `requests/submit` keeps answering for 90 days, with `Deprecation`, `Sunset` and `Vynx-Resource-Moved` on the answer.

Without `key` a new path is a delete and a create. The instance refuses that when the old resource holds runs, rows or access given by hand, and tells you the key to add. `--allow-delete <path>` is for when you mean it.

A key is unique in the workspace and is never reused while its resource lives. Something new at a path a moved resource had must say a key of its own; the build tells you.

### References

Pass the definition where you can: `tables: [items]`, `script: submit`. It carries the path, so a rename needs nothing more.

A reference written as text is a path. If it is the key of a resource that has moved, the build uses the new path and prints a note, so old text keeps building while you tidy up.

## The name of an agent's tool

A script, and a flow with a manual trigger, are tools an agent can call over MCP. By default the name is made from the path: `run_requests__submit`. Choose one for anything an agent is configured to call:

```ts
defineScript({ path: "requests/submit", mcp: { name: "submit_device_request" }, … });
```

The agent sees exactly that, and it does not change when the path does. Changing a chosen name, or choosing one for a script that already has a tool, changes what the agent must call at once: the deploy lists it under "Breaking", and promoting it to production has to be confirmed (`--confirm-breaking`).

## TypeScript or YAML

A resource has one owner: the code that defines it, or a file. Which one decides who may change it.

| | Defined in TypeScript | Kept as a file |
| --- | --- | --- |
| Changed by | Editing the code and deploying the repository | Editing the file, or editing it in the console |
| In git sync | No. Sync never reads or writes TypeScript | Yes |
| Right for | Tables, scripts and flows that share code | What has no code: apps, screens, themes, variables, schedules, triggers, connections |

The console cannot edit TypeScript. Saving a draft of something the code defines, and deploying it, **takes it over**: it becomes a file the console owns, with the same key, history and bindings. The definition is still in your code, so the next `platform deploy` takes it back, and so on until you remove it from one side. A script the code defines cannot be taken over at all, because its code leans on the rest of yours: the console can only replace it with one written there, at the same path.

Keep what the console should edit as files from the start and none of this comes up.

Write resources in TypeScript when you have many, want types, or generate them with code. Write one as a file when someone will also edit it in the console.

A file is `<name>.<kind>.yaml`:

```yaml
# platform/lending/limit.variable.yaml
title: Lending limit
schemaVersion: 1
body:
  default: "5"
```

- A script, connector or trigger source keeps its code beside the file, as `<name>.<kind>.ts`. That code may import only `@vynxlabs/sdk` and `node:` modules.
- Files can be kept anywhere. Under `platform/`, or under a folder listed in `vynxlabs.yaml`, a file's path is where it is. Anywhere else it says `path:`.
- A file may say `key:` and `title:` beside its body.
- Write comments in these files and order them as you like. When the console changes one, only what it changed is rewritten; your comments and your order stay. A comment inside a list stays at its position in the list.
- `platform schemas` makes your editor complete and check these files as you type. It writes each kind's schema to `.platform/schemas/` and adds the mapping to `.vscode/settings.json`, for the YAML extension of VS Code. Run it again after upgrading the CLI.
- In the console, the editor of a resource that code defines offers "Move to a file" for the kinds without code. Once that is deployed, remove the definition from the code: a deploy that still has it takes the resource back.

```yaml
# vynxlabs.yaml, at the repository's root
roots: [src]
ignore: [vendor]
```

The console edits these files wherever you keep them. With git sync, a change made in the console is committed to the file it came from, on the workspace's branch; a rename moves the file, or changes its `path:` if it says one. A resource made in the console is written under `platform/`.

- A file is rewritten only when the resource was changed in the console. It is then written in the console's form, so comments in it are lost.
- Without git sync, `platform pull` writes the console's changes into the same files. It does not overwrite one you changed and never pulled unless you pass `--force`.
- Code is different. A resource made by `define*` in TypeScript is not a file the console can write, and the console shows it read-only.

A resource is defined once. The build refuses one that is both in the code and in a file, by path or by key, and names both places.

## A tenant's access

Groups, service accounts, the tenant's own roles and what each is given can live in the repository, as files named for their kind:

```
tenant/
  groups/tech-desk.group.yaml
  end-user-groups/students.end_user_group.yaml
  service-accounts/helpdesk-assistant.service_account.yaml
  roles/device_lender.tenant_role.yaml
  bindings/desk-lends.tenant_binding.yaml
```

```yaml
# tenant/groups/tech-desk.group.yaml
title: Tech Desk
schemaVersion: 1
body:
  description: Staff who decide device requests.
  membership:
    sso:
      values: [it-tech-desk]   # whoever signs in with this in the provider's groups claim
```

```yaml
# tenant/bindings/desk-lends.tenant_binding.yaml
schemaVersion: 1
body:
  role: device_lender
  principal: { type: group, key: tech-desk }
  workspace: devices          # leave out for the whole tenant
```

The file's name is the key. Who is in a group is never in the repository: people belong to the identity provider.

```sh
platform tenant plan --tenant <slug>      # what a release would change
platform tenant release --tenant <slug>
platform tenant pull --tenant <slug>      # write what the tenant has now
```

A release makes the tenant's access what the files say. It removes what the files lack only with `--allow-delete <kind>/<key>`, and never while a workspace's bundle still gives the group or service account access. If the tenant asks for a second person, the release waits until someone else approves it (`platform tenant approve <number>`).

Then name them by key in the workspace's code, so that what they are called can change:

```ts
defineBinding({ path: "access/desk", role: "viewer", principal: { type: "group", key: "tech-desk" } });
step.approval("Lend a device", { approvers: { groups: ["tech-desk"] } });
```

A row that belongs to a group should hold the group's key. A text column checked with `in: "groups"` matches the key, and still matches what the group is called.

## What the build stops

- **A definition that is not exported.** `defineScript(…)` that the entry file does not export is refused by name. Two files exporting the same name through `export *` cancel each other out: export each by name.
- **Two tools with one name**, chosen or made from the path, and a chosen name that is one of the tools every agent has. A name made from a path writes `-` as `_` and stops at 64 characters, so `desk/look-up` and `desk/look_up` are one name: give one an `mcp.name`.
- **A reference to something that is not there**, including a schedule's `flow`.
