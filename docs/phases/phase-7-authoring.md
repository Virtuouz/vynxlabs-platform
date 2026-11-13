# Phase 7: authoring in the console

Status: in progress. Built so far: the move to React, six spikes, and most of the console's polish (milestone 1). Milestones 2 to 10 are not started
Last updated: 2026-11-13

Phase 7 makes the console the place where work is done. Scripts, flows and other resources are edited there and synced to the tenant's git repository. Flows are drawn on a canvas from a generic core node pack. Connectors, trigger sources and nodes can be written in the repository or in the console. Members and end users can sign in through their identity provider. Members build screens over tables without code.

**Exit criterion (proposed, the spec left it open):** on a fresh instance, a member who signs in through single sign-on and never opens a terminal can write a script, build a flow from core nodes that a signed webhook starts and that starts a second flow chosen by data, deploy it and see the commit on the connected repository's branch, promote it to production, and publish a generated app over a table that two groups of end users see differently. A developer who edits the same files in an editor and pushes sees the change pulled into the workspace. No screen uses a browser dialog.

## Spec sections implemented

| Master spec section | What phase 7 delivers |
| --- | --- |
| Resource model: ownership mode | Console-managed resources of every kind, as drafts that a deploy makes live |
| Environments: sync with the repository | The server commits to a connected repository and pulls from it |
| Flows: visual editing | A canvas editor, dynamic calls between flows, starts from scripts |
| Extensibility: trigger, step, connector | Connectors, trigger sources and nodes loaded from a bundle, and written in the console |
| Execution: triggers | Form-encoded webhooks with headers, the raw body and a signature check. A form trigger |
| Execution: connections | Connection groups whose members are bound without a deploy |
| Identity and permissions | Single sign-on for both pools. Groups of end users. A list of every permission |
| Data: row policies | Rules by group and by attribute |
| Apps and user interface | The interface on React, a larger kit, generated apps, personal dashboards |
| Deferred: a core automation node pack | HTTP request, send email, table read and write, publish event, respond |

Also in this phase, and new to the spec: an MCP server over the API for agents.

Not in this phase: SSH deploy keys, a GitHub App, merging inside a file, npm packages in console-authored code, a sandbox, SCIM, traces, service logs, memory peak per run, metric history, software-specific nodes, end users building whole apps.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One plan for every item, on one branch, `phase-7-authoring`, with one pull request |
| Frontend | Everything moves to React: console, kit, app client, the CLI's app build, the example |
| Git | The server pushes to a connected repository. HTTPS tokens only |
| Single sign-on | OIDC and SAML, for members and for end users |
| Generated screens | Members build them in the console. End users make personal dashboards |
| Extensions | Connectors, trigger sources and nodes can all be written in the console |
| Code authoring | A new permission, `code:write`, held by `tenant_admin` and `developer` only, and a switch per tenant that an operator can turn off |

## Design in brief

- **A save is a draft. A deploy makes it live.** A flow run reads its definition from the bundle it is pinned to, so an edit cannot take effect on save without breaking rollback and promotion. A deploy composes a new bundle from the repository's code and the console-managed set, and calls the same deploy as the CLI.
- **Source travels in the manifest.** A script, connector or trigger source written in the console keeps its TypeScript in `body.source`. It then moves through versions, bundles, promotion, clones and exports with no new storage.
- **Console code imports `@vynxlabs/sdk` and `node:` modules only.** The server has no `node_modules` for the tenant's repository and must not install one.
- **A custom node is a script with a label, an icon and a category.** The engine's own node types stay a closed list.
- **Files live under `platform/`,** one `<path>.<kind>.yaml` per resource, with source in a sibling `.ts`.
- **One commit per deployment,** authored by the member, on a branch per dev workspace. The server never writes to the default branch.

## Spikes

### The interface on React

Passed. The console, the kit, the app client and the example build and pass their tests on React 19 with Base UI and Vega unchanged. The change was mechanical: imports, `className`, the entry points, and six SVG and input attributes. The kit's text, number and date fields now report through `onChange`, as its select and checkbox already did.

| Point | Result |
| --- | --- |
| Tests | 483 pass, as before the move |
| The example portal's script | 94 kB before, 291 kB after, uncompressed. The plan guessed about 40 kB compressed; the real cost is nearer 60 kB |
| The console's script | 344 kB before, 558 kB after, uncompressed. Screens are not yet loaded on demand |
| Lint | Biome turns on its React rules. Five effects that depend on a counter by design carry a note. Components defined inside a test are allowed |

### Composing console code into a bundle

Passed. Console source is compiled as CommonJS and wrapped in one function appended to the bundle's module after a marker line. Each resource becomes one more export with the shape the worker already calls, so a worker that predates this phase runs it unchanged.

| Point | Result |
| --- | --- |
| A repository script and a console script in one module | Both load and run |
| Composing twice | The second pass strips the first section. The output is identical |
| A failure in console code | The stack names the function and a line in the composed module, not in the source. Good enough to find it; a source map is future work |
| Size | The section for one script that imports the SDK's version is under 2 kB |

### Keeping the compiler away from the server's disk

Passed. One esbuild plugin answers every import. It allows the generated entry, the sources handed to it, `node:` modules, and `@vynxlabs/sdk` with whatever the SDK itself imports. Everything else is an error.

| Attempt from console source | Result |
| --- | --- |
| A relative path, an absolute path, `require`, a dynamic `import` | Refused |
| Another installed package | Refused |
| A file inside the SDK's package | Refused |
| An import with a `text` attribute | Refused |
| A `tsconfig.json` in the working directory that remaps the SDK | Ignored. The build passes an empty configuration |
| `new URL("./file", import.meta.url)` | Builds, and inlines nothing |

Not yet checked: that esbuild's binary runs in the image as the `node` user after `pnpm deploy --prod`. It is checked when the control plane first depends on it.

### Git without a binary

Passed against a local remote served over HTTP by `git http-backend`. Not run against GitHub, GitLab or Bitbucket: that needs a token for each, which the owner has to supply.

| Point | Result |
| --- | --- |
| Shallow fetch of one branch with no checkout | 74 ms for a 300-file repository. The whole tip is downloaded, so a size limit is needed |
| A commit built from blobs and trees | Replaces `platform/` and keeps every other file. The author is the member and the committer is the platform |
| Push with a token | Accepted. A wrong token is a 401 |
| Push after the remote moved | Refused, with an error the server can tell apart |
| Reading one file at the remote's tip | Works with no working tree |
| Licences | isomorphic-git is MIT. Its dependencies are MIT, ISC and Apache-2.0 |

### YAML that round-trips

Passed with the `yaml` package (ISC) at version 1.2 with no line folding. Forty awkward strings, among them `no`, `1e3`, `~`, a date, a leading space and a CEL expression over two lines, come back equal as a value, as a key and as a list item. So do 5,000 generated documents and all 28 manifests of the example. Writing the parsed result again gives the same bytes.

### Monaco in the console

Passed for the build. Monaco 0.57 (MIT) builds under Vite as chunks that load on demand, and the console's first script does not grow. The editor is 2.7 MB and the TypeScript worker 6.9 MB before compression, in 98 files. Still to check in a browser, when the script editor is built: the SDK's types in the editor, and colours taken from the tokens.

### Spikes that run when their milestone starts

A webhook answered through a worker, single sign-on against Keycloak, and MCP inside Fastify each need most of their feature to exist before they prove anything. They run first in their own milestones and are recorded here then.

## Findings

- **The example's bundle is 778 kB,** most of it the SDK's schema library. A console-managed section adds little to that.
- **The control plane lists the console's files once, at start.** A rebuilt console is not served until the process restarts. That is right for an image and surprising in development.
- **The console is served with no compression of its own.** Monaco makes that matter. The self-hosting guide says to put a proxy in front; the image should compress by itself.

## The console (milestone 1)

Built and checked in a browser against an instance started for the purpose, in light and dark.

- **Dialogs.** The kit has a `DialogsProvider` with a confirmation, a short answer, and a name typed out before something is destroyed. Each resolves when answered. The console used the browser's `confirm`, `prompt` and `alert` in 24 places and now uses none; a lint rule refuses them. Failures show as toasts.
- **Starting things.** A script is run and a flow started from a dialog that draws a form from the input schema when it is a flat list of fields, with JSON as the other tab.
- **Permissions.** `packages/manifest/src/permissions.ts` lists every permission with what each verb allows, where it is checked and whether an end user can hold it. `GET /permissions` serves it. A role is built from a grid of boxes, and an existing role can be changed.
- **Choices in place of typed names.** A create dialog can take its choices from the API. The operator's member, a tenant's database location, a connection, a variable, a referenced table and a data source are chosen from a searchable list.
- **Shell.** The sidebar shows a tenant's screens in a tenant and a workspace's screens in a workspace, grouped, with icons. Tenants and workspaces are switched from it. A top bar says where you are and holds the account menu and a choice of light, dark or the system's theme.
- **A run.** One panel: outcome and duration, facts, input and result as coloured JSON, and a log with search, a lowest level, wrapping, following and a download.
- **A flow run.** A timeline with each step cut into waiting for a worker, running, and held on purpose. The graph is the second tab.
- **Audit log.** Narrowed by area on the server and by kind of action in the list, with the chosen entry's facts and details beside it. Entries name who acted.

Kit additions: `DialogsProvider`, `ComboboxField`, `MultiSelectField`, `JsonView`, `LogViewer`, `Facts`, `Timeline`, a wider `Dialog`, and a `Menu` with icons, separators and a marked current item.

Still open in milestone 1: screens loaded on demand, a data cache in place of `useLoad`, group membership, resource-scoped bindings, renaming a tenant, forms for nested schemas, the triggers and deployments screens, and a suite of browser tests in CI.

## Schemas

Migration 0019. Version 0.5.0 is not yet set.

| Change | Purpose |
| --- | --- |
| `export:write` added to roles that hold `tenant:*` | Exporting a tenant was checked as `tenant:export`, which no role could list |

## Tests

| Area | Where |
| --- | --- |
| The kit's dialogs | `packages/ui/src/Dialogs.test.tsx` |
| Log, JSON, facts, timeline | `packages/ui/src/views.test.tsx` |
| Roles and the permission grid | `apps/console/src/Roles.test.tsx` |
| The shell and the theme choice | `apps/console/src/Shell.test.tsx` |
| The audit screen | `apps/console/src/Audit.test.tsx` |
| Every route's permission is listed | `apps/control-plane/src/app.test.ts` |
| Audit filters and actor names | `apps/control-plane/src/kernel.test.ts` |

## Proposed deviations

### From the approved plan

| Plan | Done | Why |
| --- | --- | --- |
| Run nine spikes before building | Six ran first. Three run at the start of their milestones | Each of the three needs its feature half built to measure anything |
| React as milestone 1, after the spikes | The move was the spike, and is committed | Proving it meant doing it |
| Migration 0019 is `authoring` | 0019 is `permissions`. Authoring takes 0020 | The permission rename was needed first |
| TanStack Query and a route table in milestone 1 | Not yet done | The visible work came first. They change no behaviour |
