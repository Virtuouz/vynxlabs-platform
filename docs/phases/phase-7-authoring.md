# Phase 7: authoring in the console

Status: in progress. The interface has moved to React and six spikes have run. Nothing else is built yet
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
- **The console is served with no compression of its own.** Monaco makes that matter. The self-hosting guide says to put a proxy in front; the image should compress by itself.

## Proposed deviations

### From the approved plan

| Plan | Done | Why |
| --- | --- | --- |
| Run nine spikes before building | Six ran first. Three run at the start of their milestones | Each of the three needs its feature half built to measure anything |
| React as milestone 1, after the spikes | The move was the spike, and is committed | Proving it meant doing it |
