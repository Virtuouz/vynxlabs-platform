# Phase 7: authoring in the console

Status: in progress. Built and tested locally: milestones 1 to 3, the flow editor and flows chosen by data (milestone 4), webhook intake (milestone 5), flow starts from apps, connection groups and the MCP server (milestone 7), identity (groups of end users, row rules, single sign-on), and apps made in the console with personal dashboards. Single sign-on was driven through a browser against Keycloak, and the builder, a published app and a dashboard through a browser against a running instance. Not started: custom connectors, trigger sources and nodes, the core node pack, the form trigger, and SCIM. Nothing has run in CI or on a second instance yet
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
| Licenses | Zlib joins the allowlist, for the port of zlib that the git library depends on |
| Single sign-on | Our own flows with `openid-client` and `node-saml`, built to the bar an enterprise buyer and a security review would hold it to |
| The rest of the phase | Four units, in order: apps made in the console, extensions and the node pack, SCIM, then finishing |
| Who builds screens | Members, gated by permission, so that some become maintainers with no developer. End users use what is published. This replaces "end users make personal dashboards" above: dashboards are a member's |
| Reference for screens | Grist's behavior: pages of widgets over tables, summaries, linked widgets. No formula engine. Grist is not embedded |
| Publishing a screen | Edited in a dev workspace with a live preview, deployed to publish, promoted to production |
| Dashboards | Private to the member, with optional read-only sharing with the workspace |
| Send email | The tenant's own SMTP connection |
| SCIM and members | A tenant's provider suspends the member in that tenant. The instance's provider disables the account |
| The HTTP request node | Left able to call an address given in full, with no connection. Whoever may deploy a flow can therefore make requests from the worker's network without `code:write`. To be looked at again: the other choice is to require a connection |

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
| Licenses | isomorphic-git is MIT. It depends on pako, a port of zlib, whose license is "MIT AND Zlib". Zlib is permissive and was not on the allowlist, so the license check failed from the commit that added git sync until the owner added Zlib to the list. The spike's first reading missed it |

### YAML that round-trips

Passed with the `yaml` package (ISC) at version 1.2 with no line folding. Forty awkward strings, among them `no`, `1e3`, `~`, a date, a leading space and a CEL expression over two lines, come back equal as a value, as a key and as a list item. So do 5,000 generated documents and all 28 manifests of the example. Writing the parsed result again gives the same bytes.

### Monaco in the console

Passed for the build. Monaco 0.57 (MIT) builds under Vite as chunks that load on demand, and the console's first script does not grow. The editor is 2.7 MB and the TypeScript worker 6.9 MB before compression, in 98 files. Still to check in a browser, when the script editor is built: the SDK's types in the editor, and colors taken from the tokens.

### Three ways to do single sign-on

All three passed. Each signed one person in through a Keycloak container standing in for a customer's identity provider, over OIDC and over SAML, and got the person's group out of the token or assertion.

| | A. better-auth's SSO plugin | B. Keycloak as the sign-on layer | C. Our own flows |
| --- | --- | --- | --- |
| What it is | `@better-auth/sso` inside the control plane | A Keycloak beside the platform federates to each customer's provider. The platform speaks OIDC to Keycloak only | `openid-client` and `@node-saml/node-saml` in a module of the control plane |
| OIDC and SAML | Both worked | Both worked | Both worked. A SAML response altered after signing was refused |
| Providers added while running | Yes, kept in a table of the plugin's own | Yes, through the admin API, in about 40 ms | Yes, in a table of ours |
| Members | Yes | Yes | Yes |
| End users | **No.** End users are not in better-auth, so they need a second implementation whatever is chosen here | Possible with a realm per tenant. Not tried | Yes, the same code |
| Groups from the provider | Through a hook | Through three mappers per provider and a realm setting | Read from the token or assertion |
| The provider's client secret | **Stored in plain text** in the plugin's table | Held by Keycloak | Sealed as our other secrets are |
| What a self-hoster runs | Nothing new | **A second service**: a 718 MB image that held 986 MB of memory idle, with a database of its own | Nothing new |
| Who holds the people | better-auth, as now | Keycloak keeps a copy of every person, with rules of its own. It showed its own "Update Account Information" page until those were relaxed | The platform, as now |
| Licenses | MIT, with MIT and ISC beneath | Apache-2.0, not shipped in the image | MIT |
| Other | Sign-in must begin with a POST from the browser. A second provider for an email that already signed in is refused as "not linked" until trust is configured. A version for better-auth 1.7.21 exists; 1.7.23 is what was run | The platform still needs the OIDC half of option C to talk to Keycloak | We own how SAML is configured and checked, and its upkeep. The libraries do the cryptography |

Every option needs the auth proxy to stop turning a posted form into JSON (`routes/auth.ts`), since SAML answers with a form.

In this spike the customer's provider and the broker were one Keycloak container, which cannot reach itself on its published port. Option B's token and key addresses were pointed at the container's own port and its issuer check left off to get round that. A real deployment has neither problem.

**The owner chose C, our own flows, on one condition: an institutional or enterprise buyer must find their needs met, in what it does and under a security review.** That is the bar single sign-on is built to and checked against:

| Area | What must hold |
| --- | --- |
| SAML, what is trusted | Only a signed assertion, or a signed response that covers it. The audience, the recipient, the destination and the validity window are each checked. Unsigned, expired and not-yet-valid assertions are refused |
| SAML, replay | A request is answered once: `InResponseTo` must match a request this instance made, and an assertion's ID is not accepted twice |
| SAML, algorithms | SHA-256 or stronger for signatures and digests. SHA-1 is refused unless a tenant turns it on for a provider that cannot do better, and that is audited |
| SAML, who starts it | Started by the platform by default. Sign-in started by the provider is off unless a tenant turns it on |
| SAML, options a provider may require | Signed requests, encrypted assertions, several signing certificates at once so that one can be rotated, and reading the provider's metadata from an address or a file |
| OIDC | Authorization code with PKCE, a state and a nonce per sign-in. The issuer, audience, signature and expiry of the ID token are checked against the provider's published keys |
| Who a person is | Linked by the provider's own subject, never by email alone after the first sign-in. An email is trusted for the first link only when the provider says it is verified and its domain is one the tenant has proved it owns |
| Domains | A tenant proves a domain with a DNS record before sign-in is routed by it |
| Provisioning | People are created on first sign-in when a tenant allows it, with a default role. Groups and attributes are set from the provider on every sign-in |
| Enforcing it | A tenant can require single sign-on, after which passwords are refused. One break-glass account remains |
| Secrets | Client secrets and private keys are sealed with the tenant's key, never returned and never logged |
| The record | Every sign-in, refusal, provider change and enforcement change is in the audit log, with the provider and the reason |
| For the provider's administrator | Service-provider metadata to download, the exact values to paste, and a test sign-in that shows what the provider sent before it is turned on |
| Left for a later unit, and said so | SCIM provisioning, single logout, and sign-in step-up |

### Spikes that were built instead

A webhook answered through a worker and MCP inside Fastify were each small enough that building them was the spike. Both are recorded in their own sections below.

## Findings

- **The example's bundle is 778 kB,** most of it the SDK's schema library. A console-managed section adds little to that.
- **The control plane lists the console's files once, at start.** A rebuilt console is not served until the process restarts. That is right for an image and surprising in development.
- **A deploy from the console and a test run can build the same bundle.** Bundles are stored once per digest, so a bundle first made to try a draft out is the one later deployed. Its origin is corrected when that happens.
- **A draft's source must not reach the audit log.** The entry for a saved draft records the kind and revision only.
- **Monaco's plain API module is not enough.** Its features look for services that only the whole editor registers. The console loads the whole editor, on demand.
- **jsonb reorders an object's keys.** A flow saved as a draft lost the order of its steps, and its file in the repository would have changed for no reason. Drafts are stored as `json`. A resource is still `jsonb`, so the API returns a flow's steps in the database's order; the bundle and the repository keep the author's.
- **Two builds of one repository shared an output folder.** `platform build` compiled each app into `.platform/apps/<app>`. Two builds at once could give different digests. Each build now has a folder of its own. It showed as one test failing once in the full suite.
- **The test suite is close to the development database's connection limit.** 52 suites run side by side against a server that allows 100 connections. With another instance running on the same server, a suite failed to start once. CI is unaffected, and locally the answer is not to leave an instance running.
- **The OIDC library does not check an ID token's signature by itself.** A token that comes straight from the provider's token address over TLS may be trusted without it, and the library does that. A test that signed a token with a stranger's key found it accepted. The check is now turned on for every provider.
- **A provider set up from this side's SAML metadata expects what the metadata offers.** Keycloak, reading the metadata, required signed requests and turned on encryption. Requests were unsigned and were refused. Requests are now signed unless that is turned off, and the certificate for encryption is published only when asked for.
- **Encrypted assertions are opened for one way of wrapping the key.** The decryption library that node-saml 5.2 pins opens a key wrapped with RSA-OAEP and MGF1 with SHA-1 (`rsa-oaep-mgf1p`, SHA-1 digest). Keycloak 26 wraps with `xmlenc11#rsa-oaep` and SHA-256 unless told otherwise, and that is refused with a message that says what to set. A newer version of the library opens it, and also refuses AES-CBC, which other providers use. Replacing a security library that another pins was not done here.
- **A check on routes by name caught a new route it did not mean.** The apps suite claims every route with `domains` in it. A provider's email domains are tested in the single sign-on suite, and are named as an exception there.
- **A check that passed had not run.** The command that gated every commit piped each check into `tail`, and a pipeline's result is its last command's. A lint error went into a commit unnoticed and was caught by the next run. Every gate now keeps each check's own result.
- **A correct password is refused, rarely, in the full test run. The cause is not known.** Five times so far, each in a different suite, never when a suite runs alone. The library says "Invalid password": the account is found and the check comes out different. When it last happened the harness looked again: the hash on record was whole, checking it directly gave the right answer three times, and a second sign-in over HTTP a moment later succeeded. Hashing was then run 5,760 times across eight threads at once, and across twelve processes before that, and never gave a wrong answer, so the fault is not in the hashing. The harness now uses the second sign-in and says loudly that it did, so that it is seen and counted. It matters: if it is real under load it would, once in a great while, refuse someone in production who would get in on trying again. It should be looked at before a release that people depend on.
- **A repository that uses a core node could not be built, and deploying it would have removed what was made in the console.** Both were found by putting a core node in the example. The CLI checked what flows refer to before the nodes were added. And the nodes make the bundle format 3, which a deploy took to mean that the bundle lists everything console-managed. A bundle that is format 3 only for its core nodes is now treated as saying nothing about that.
- **A test of a flow's delay counted every flow due on the instance.** It failed once under the full run, when another test's flow was still due. It now looks at its own flow.
- **The `viewer` role reads every row.** It holds `*:read`, which includes the permission to read every row of a table whatever its rules say. Sharing an app with it would have undone row rules for everyone it was shared with. Sharing uses a new role, `portal_reader`.
- **A widget dropped on another hid it.** Found by dragging one in a browser. A moved widget now pushes what it lands on down, and what is under a removed one rises.
- **What an end user may be told about a table is less than the table's own route tells.** That route gives the policy, the storage name and a count of every row. The app that draws interfaces reads a route of its own, which gives the columns and whether the caller may read and write.
- **The console was served with no compression of its own.** Monaco makes that matter. The build now leaves compressed copies and the image sends them.
- **Port 8080 was taken by an instance left running from an earlier phase,** so the image could not start there for the browser test. It was run on 8090, which the development Keycloak also allows. CI runs it on 8080.

## The console (milestone 1)

Built and checked in a browser against an instance started for the purpose, in light and dark.

- **Dialogs.** The kit has a `DialogsProvider` with a confirmation, a short answer, and a name typed out before something is destroyed. Each resolves when answered. The console used the browser's `confirm`, `prompt` and `alert` in 24 places and now uses none; a lint rule refuses them. Failures show as toasts.
- **Starting things.** A script is run and a flow started from a dialog that draws a form from the input schema when it is a flat list of fields, with JSON as the other tab.
- **Permissions.** `packages/manifest/src/permissions.ts` lists every permission with what each verb allows, where it is checked and whether an end user can hold it. `GET /permissions` serves it. A role is built from a grid of boxes, and an existing role can be changed.
- **Choices in place of typed names.** A create dialog can take its choices from the API. The operator's member, a tenant's database location, a connection, a variable, a referenced table and a data source are chosen from a searchable list.
- **Shell.** The sidebar shows a tenant's screens in a tenant and a workspace's screens in a workspace, grouped, with icons. Tenants and workspaces are switched from it. A top bar says where you are and holds the account menu and a choice of light, dark or the system's theme.
- **A run.** One panel: outcome and duration, facts, input and result as colored JSON, and a log with search, a lowest level, wrapping, following and a download.
- **A flow run.** A timeline with each step cut into waiting for a worker, running, and held on purpose. The graph is the second tab.
- **Audit log.** Narrowed by area on the server and by kind of action in the list, with the chosen entry's facts and details beside it. Entries name who acted.

Kit additions: `DialogsProvider`, `ComboboxField`, `MultiSelectField`, `JsonView`, `LogViewer`, `Facts`, `Timeline`, a wider `Dialog`, and a `Menu` with icons, separators and a marked current item.

Still open in milestone 1: screens loaded on demand, a data cache in place of `useLoad`, group membership, resource-scoped bindings, renaming a tenant, forms for nested schemas, the triggers and deployments screens, and a suite of browser tests in CI.

## Console-managed resources (milestone 2)

**Files.** `packages/manifest/src/files.ts` writes a resource as `<path>.<kind>.yaml`, with source beside it as `<path>.<kind>.ts`, and reads them back. The path and kind come from the file name. Keys follow the kind's schema, so the same resources give the same bytes. The export a console script has in a bundle is worked out from its path and never stored in a file.

**Bundles.** Format 3 lets a manifest be console-managed. A script's manifest may carry its source, and a label, icon and category that make it a step in the flow editor. Both are optional, so older bundles stay valid.

**Composing.** `packages/compose` is used by the CLI and by the control plane, so both build the same thing. It compiles console source and appends it to the bundle's module after a marker line. `platform build` reads the `platform/` folder; a path defined both in the code and in a file is an error; a repository without the folder builds as before.

**Drafts and deploys.** A save is a row in `resource_draft`. Deploying composes the drafts with the workspace's active bundle, stores the result as a bundle of origin `compose`, and calls the same deploy as the CLI.

| Route, under a dev workspace | What it does |
| --- | --- |
| `GET /drafts`, `GET /drafts/*` | The drafts, and one with its body |
| `PUT /drafts/*` | Saves a draft. Checked against its kind. Code needs `code:write` |
| `DELETE /drafts/*` | Discards one |
| `GET /changes/preview` | What a deploy would do, found by doing it and taking it back |
| `POST /changes/deploy` | Deploys the drafts, with a message |
| `POST /test-runs` | Runs a script from a bundle made for the purpose and never deployed |

**What a deploy now means.**
- A bundle speaks for the code-managed resources, and for the console-managed ones the bundle before it carried. A console-managed resource that no bundle carried, such as a table made in the console, is left alone by every deploy.
- A deploy is the one thing that may move a resource between the repository and the console. A draft at the path of a repository's resource takes it over. A repository that defines the path again takes it back.
- A bundle in format 1 or 2 says nothing about console-managed resources. The workspace's are composed onto it before it is deployed, so an older CLI cannot remove them.
- Rollback and promotion needed no change: the composite is one bundle.

**Permissions.** `code:write` is held by `tenant_admin` and `developer`. A workspace admin may change resources and may not write code. `tenant.console_code` turns code authoring off for a tenant.

**In the console.** A script opens in Monaco, fetched on first use, with the SDK's types and the theme's colors. Beside it are its settings, with the connections, secrets and variables it may use chosen from what the workspace has, and a panel that runs the draft and shows the run. A Changes screen lists drafts, says what a deploy would do or why it cannot be done, and deploys.

Checked in a browser: a script written in the editor ran on a worker and was deployed. Compiling console code was checked inside the image as the `node` user.

Still open in milestone 2: console editors for kinds other than scripts, version history with a diff, "duplicate as console-managed", `platform pull` and `platform fmt`, and a sweep of preview bundles.

## Git sync (milestone 3)

- **Connecting.** A tenant gives an HTTPS address and an access token. The repository is reached before anything is saved. The token is encrypted under the tenant's key, never returned and never in the audit log.
- **Branches.** A dev workspace follows a branch of its own. It cannot follow the default branch, and a production workspace follows none.
- **Push.** One commit of what the workspace has deployed, as files in one folder, authored by whoever asked, on top of whatever else is on the branch. The first push starts the branch from the default branch.
- **Pull.** Deploys what changed in the folder on the branch, as a deployment whose message names the commit.
- **No clone.** Each operation fetches the tip into a scratch directory, works on git's objects, and removes it. A lease on the workspace's row keeps two from overlapping. No database connection is held while the remote is being talked to.

| Situation | What happens |
| --- | --- |
| The branch changed outside the folder | The push commits on top of it |
| The branch changed inside the folder | The push is refused, the workspace is "behind", and nothing is written |
| A resource changed on the branch only | A pull takes it |
| A resource changed on both sides | A conflict. Nothing is deployed until each is given to "mine" or "theirs" |
| "Mine" | Nothing is deployed, and the next push puts the workspace's version on the branch |
| Files on the branch that cannot be deployed | The pull fails, says why, and leaves the workspace as it was |
| A tenant that was imported | Sync is paused until its repository is saved again |

Routes: `GET|PUT|DELETE /tenants/:t/git-repository`; `GET|PUT …/git`, `POST …/git/push`, `POST …/git/pull`, `GET …/git/operations`. A new permission kind, `git`. Pulling also needs `code:write`, since a pull brings code into what workers run.

Checked in a browser against a git server on this machine: a wrong token was refused, and a change deployed in the console arrived as a commit on the branch, authored by the member who pushed it.

## Flows (milestone 4, in part)

- **Drawing a flow.** A canvas in a dev workspace, on React Flow, fetched when first opened. A palette adds steps: four ways to start, running a script or a flow, setting values, a branch, for each, join, wait, approval and fail. A branch has one way out per case and one for "otherwise". A step that can fail has a second way out for its error path. The chosen step's settings are beside the canvas, with scripts, flows and events picked from what the workspace has, drafts included. Saving makes a draft.
- **Layout travels.** A flow's body may carry where its steps sit, so the layout goes into the repository with the flow. Flows from a repository keep theirs apart, as before.
- **A flow chosen by the data.** A sub-flow step, and a foreach that runs a flow per item, may give `flowFrom`, an expression, and `allow`, the flows it may give. A flow off the list is never started. Every flow on the list is checked at build like a flow named outright, so the checks for existence, a manual trigger and loops all cover it.
- **Depth.** A flow started by a flow counts how deep it is, and the tenth refuses.

Checked in a browser: a flow was drawn, its two steps connected by dragging, saved, deployed and run.

Still open in milestone 4: starting a script or flow from inside a script, `inputs` as one expression per field, an expression editor with completion, undo and redo, and custom nodes in the palette.

## Webhook intake (milestone 5, in part)

- A webhook's address takes JSON, a form or text. The body is read as raw bytes on that address only.
- `input: "request"` hands the script `{ method, headers, query, body, rawBody }`. The sender's `authorization`, `cookie` and `proxy-authorization` headers are not handed on or kept.
- `verify` checks an HMAC before anything starts: SHA-256 or SHA-1, hex or base64, an optional prefix, an optional template for what was signed, and an optional timestamp header with a tolerance. The comparison is constant-time. A failure is a 401 and starts nothing.
- A deploy is refused until the secret a webhook checks against is set.
- The default is unchanged: the body alone.

Not covered by `verify`: a sender that packs several values into one header, as Stripe does. That needs a custom trigger source, which is not built yet.

## Apps, credentials and agents (milestone 7, in part)

**Flow starts from apps.** Starting a flow needs `flow_run:write` at the workspace or at the flow itself. Whoever started a flow run may read how it ended and what it gave, without its steps. The app client gains `startFlow`, `flowRun` and `runFlow`.

**Connection groups.** A new kind, `connection_group`, declared like a connection. Its members are added per workspace, each with a key, an address and a credential, and take effect on the next run with no deploy. A script lists the group in `uses.connectionGroups` and picks a member when it runs: `ctx.connections("shops").get(input.shop)`, or lists them with `.keys()`. A deploy needs no member bound. A script reaches only the groups it declared. The worker protocol gains two routes, in its contract. The console lists each group with its members on the Connections screen.

**The MCP server.** `POST /tenants/:t/workspaces/:w/mcp` speaks the Model Context Protocol over streamable HTTP, with no session. A caller with an API key is offered one tool per script and per flow it may start, the script's tool taking the script's own input schema, plus `get_run`, `get_flow_run`, and `list_approvals` and `decide_approval` for a caller that may. Tools are worked out on each request. Every call passes the same authorization check and leaves the same audit entry as the API route that does the same thing, marked `via: "mcp"`. A refusal is the tool's answer.

The spike for MCP is this build: it passed with the protocol's own client library over HTTP. It has not been tried from Claude Code or another agent product.

Still open in milestone 7: the form trigger, and an "Agent access" tab on a service account.

## Groups of end users (identity, milestone 1)

End users are a pool of each tenant's own, so they have groups of their own, apart from groups of members. A binding may name one as `end_user_group`, by ID or, in the repository, by name. The authorization check counts a group's bindings for the end users in it. An end user also has attributes: short named facts such as `customer_id`, set by staff or by the identity provider.

In the console, **End-user groups** lists the groups, and a group's people are added and removed with a picker. The same was missing for groups of members and was added. A person's attributes are edited from their row under **End users**.

## Row rules (identity, milestone 2)

A table's policy is `open`, `owner`, or a list of rules. A rule allows reading, writing or both when a condition holds: for everyone, when a column holds the person's ID, when a column names a group the person is in, or when a column equals one of the person's attributes. A person sees a row when any rule lets them, and changes it when a rule for writing does.

Rules compile to Postgres row-level security, as the owner policy does. The person's groups and attributes reach the database as two settings, set for each request beside the two there were. A group column holds the group's ID when it is `uuid` and its name when it is `text`. A script that acts as a person is held to the same rules as that person.

In the console a table's rules are built from menus, each shown as a sentence. **See it as** reads the table's rows as a chosen end user, for whoever may read every row.

## Single sign-on (identity, milestone 3)

A tenant connects an identity provider for its members or for its end users, over OIDC or SAML. The instance may have providers of its own, for the people who run it. The flows are the platform's own, in `kernel/sso/`, on `openid-client` 6 and `@node-saml/node-saml` 5.

**One sign-in, three steps.** It begins at the address the person is at, which sets a cookie and sends them to the provider. The provider answers at one fixed address, where the answer is checked and turned into a code that works once, within two minutes. The browser is then sent back to where it began, where the code and the cookie together make the session. An end user may begin at a hostname the tenant registered: the provider is still given one address, whatever the number of hostnames. A member's session is made by the authentication library, through an endpoint added to it, so the cookie and the record of the sign-in are the same as a password's.

**Who a person is.** A person is tied to a provider by the provider's subject, and found by it from then on. Email is used once, for the first tie:

| Who | An existing account is tied when | A new account is made when |
| --- | --- | --- |
| A member | The email's domain is one the provider has proved | The same, and the provider creates people |
| An end user | The domain is proved, or the tenant has said to take the provider's word and the provider says the email is verified | The provider creates people, and does not say the email is unverified |

A member is one person on the whole instance, so nothing less than a proved domain will do, and one proved domain belongs to one provider of members. A domain is proved with the same DNS record a hostname is. The instance's own providers need no proof: whoever runs the instance answers for them.

**On every sign-in** a person is put in exactly the mapped groups the provider names for them and taken out of the mapped groups it does not. A group nobody mapped is left alone. An end user's mapped attributes are set the same way. A new member is given the provider's default role, once.

**Requiring it.** A provider that is required refuses passwords: for members, those with an email in its proved domains; for end users, those in its proved domains, or everyone when it has none. Members bound at the instance keep their passwords. That is the break-glass account: a broken provider locks no operator out.

**Trying it.** A try-out goes to the provider and back and signs nobody in. It records what the provider sent, who that would be, and what would happen, worked out for real and then undone. It works while the provider is off.

### How the bar was met

| Area | How | Where it is tested |
| --- | --- | --- |
| SAML, what is trusted | The library requires a valid signature on the assertion or on the response that holds it. Issuer, audience and validity are its checks. Recipient and destination are checked here, since the library only warns | Eleven altered answers, each refused for its own reason |
| SAML, replay | The library is given a store in the database. A request is answered once, and an assertion's ID is kept until it would have run out | The same form posted twice. An answer to no request. One person's answer in another's sign-in |
| SAML, algorithms | A document is read for SHA-1 in its signatures before it is checked, and the opened assertion again | SHA-1 refused, then allowed for a provider that turns it on, which is audited |
| SAML, who starts it | An answer must name a request unless the provider is allowed to begin | An unasked answer refused, then accepted when turned on, and its replay refused |
| SAML, options | Signed requests, on unless turned off. Encrypted assertions, opened when they come. Several certificates. Metadata read from an address or pasted. A document type in any XML is refused | Each in the suite. Keycloak set itself up from this side's metadata |
| OIDC | Authorization code with PKCE, a state and a nonce. Signature, issuer, audience, expiry and nonce of the ID token | A token bent five ways, each refused. The provider in the test refuses an exchange without the PKCE verifier |
| Who a person is | The table above | A stranger claiming the operator's email. An unverified email. A second subject for one account |
| Domains | The DNS record a hostname uses. One proved domain of members per instance | A second tenant refused the same domain, record or not |
| Provisioning, groups, attributes | Above | A new member with a role and groups. Groups that follow the provider. A group mapped by nobody left alone |
| Enforcing it | Above | A password refused in the console, the portal and the API. The operator's still works |
| Secrets | A client secret and this side's private key are sealed with the tenant's key, or the instance's. Neither is returned. What is in flight is sealed or hashed | The stored bytes and the API's answers are read for the secret |
| The record | Every sign-in, refusal with its reason, password refused, provider change, and each lowering of the bar | Read in each test |
| For the provider's administrator | The addresses to copy, metadata to load, and the try-out | The console suite, and a browser against Keycloak |

**Where it falls short of the bar as written.** The bar said an email is trusted only when the provider says it is verified and its domain is proved. Two things differ, both on purpose. A provider that says nothing about verification is not refused, because Microsoft's does not say, and the proved domain is what carries the trust. And an end-user provider may be told to take the provider's word without a proved domain, because a tenant's customers sign in with addresses at domains the tenant can never prove. That is off unless turned on, and applies to the tenant's own pool only. Encrypted assertions are limited as the finding above says.

**Tried against Keycloak.** A member signed in to the console over OIDC, set up entirely from the console, with a try-out first. An end user signed in to a tenant's portal over SAML, with Keycloak configured by loading this side's metadata, and arrived in the mapped group with the mapped attribute. An encrypted assertion was opened once Keycloak was set to the supported key wrapping. Keycloak is in the development stack behind a profile, with a realm to import.

**Not built, and said so:** SCIM, single logout, step-up, and a provider shared by several tenants.

## Apps made in the console (unit A)

A member builds an app over a workspace's tables with no code: pages of widgets, where choosing a row in one widget decides what another shows. The idea is Grist's. There is no formula engine, and Grist is not embedded.

**An interface is a resource.** The new kind `interface` is pages of widgets, written as data: a table, a card, a list of cards, a chart, a form, or text. A table or a chart can show totals in place of rows. A widget can follow the row chosen in another in four ways: the row itself, the rows that refer to it, the row it refers to, and the rows behind a line of totals. An app serves an interface by naming it: `app.interface` in place of `app.entry`. Being a resource, an interface is saved as a draft in a dev workspace, deployed, promoted, rolled back and written to the repository like a flow.

**It is served by the platform's own app.** An app that points at an interface has no files. It is served a small app built with the platform into the image (`SCREENS_DIR`), at the same addresses and under the same content security policy as any app. That app reads one route, which answers for whoever may open an app that serves the interface, and then reads rows through the public API as the person using it. So a table's policy decides what each person sees, with nothing new to enforce it.

**Totals are a route of the rows API.** Counts, sums, averages, the least and the most, over all rows or over groups, with a date or a time gathered into days, weeks, months or years. They run where rows are read, under the same policy, so two people get the totals of their own rows. Apps and scripts both get the call.

**One renderer, two hosts.** `packages/screens` draws a page through the kit's widget interface, which grew for it: a chosen row, paging, editing, deleting, and what to show in place of a reference. The console's builder and the served app both use it. A link becomes a filter in a function with no state.

**The builder.** Under "Apps made here" in a dev workspace. The page is drawn from the workspace's rows as the member may read them, beside the settings of the widget being worked on, all chosen from menus. What a widget can follow is offered as a sentence for each way the page's tables allow. A widget is dragged by its heading and stretched by its corner. A change is saved as a draft a moment after it is made, and comes back with what is wrong against the tables that are really there. Publish deploys the interface and its app by name.

**Maintainers.** `interface:write` is enough to save and deploy interfaces and the apps that serve them, and nothing else: no script, no flow, no deploy of everything. The built-in role `app_maintainer` holds it with what building needs.

**Sharing.** The apps screen shares an app with every end user, a group of end users, a group of members, or anyone, to read or to read and change. The app and each table it shows are given together.

**Dashboards.** A member keeps pages of their own in a workspace: the same page, editor and renderer, saved when they say, with no deploy, in any workspace. Private until shared read-only with the workspace. Whoever looks is given the rows they may read.

**Hiding a value is not keeping it from someone.** The rows API returns whole rows. A field left off a screen is still sent to whoever may read the row. The builder says so. Row rules are what keep rows from people, and nothing yet keeps a column from them.

Tried in a browser against a running instance: an app with a table of customers, their orders following the chosen customer with the customer shown by name, a chart of totals and a form that adds an order for the chosen customer, built in the builder and published; the same app shared from the console and opened by one person of each of two groups, who saw 3 rows totalling 600 and 2 rows totalling 30; and a dashboard built, rearranged by dragging, saved and shared.

Not built: a button that starts a flow, formulas and computed columns, sorting or filtering by what a reference shows, choosing a row by pressing a chart, filters each viewer keeps for themselves, custom widgets inside a generated screen, refreshing by itself when rows change, periods in a time zone other than UTC, and keeping a column from someone who may read the row.

## Extensions and nodes (unit B)

A tenant reaches outside systems the platform does not know, and people who write no code draw flows from steps that are ready made.

**A connector is a resource.** The kind `connector` carries a schema for a connection's configuration and code that builds what a script is given for one. A connection names its connector by path, or `http` or `smtp` for the two every worker has. A worker takes a tenant's connector from the bundle the run is pinned to, so a run keeps the connector it was deployed with. A connection's configuration is checked against its connector's schema when it is bound, against the connector as deployed, as drafted, or as last uploaded, and again at deploy.

**Mail goes through the tenant's own server.** The built-in `smtp` connector sends through a mail server the tenant names, with the tenant's credential. The platform's own mail settings are for its own invitations and are not lent to tenants.

**A trigger source stands between the outside and what a trigger starts.** The kind `trigger_source` is code that runs on a worker, like a script, and is named by a webhook or a schedule. A webhook's source is handed each request and says whether anything starts, once or several times, and with what: this is where a signature in a sender's own format is checked. A schedule's source is run on each tick with where it had got to, and gives back what is new and a new place. The control plane still runs no tenant code. Nobody starts a source by hand.

**The core nodes are scripts.** Five come with the platform, in `packages/nodes`: an HTTP request, send email, read rows, write a row, publish an event. They live under the reserved path prefix `core/`. When a bundle is composed, by the control plane or by the CLI, the nodes its flows use are compiled in with it, and any it carried are replaced by the platform's current ones. Bundle format 3 did not change.

**A step hands its script what it works on.** A generic node declares no connection of its own. A step gives it one with `with`, for that run alone, and the worker's routes answer for what a script declared or what its step handed it. The script must say in `node.takes` that it takes such a thing, and what is handed over must exist: both are checked when the bundle is. A core node started by hand reaches nothing. A step can also give an expression per field with `inputs`.

**A tenant's own script becomes a node** by carrying a label. Its input schema becomes the step's form.

**A flow can answer the request that started it.** A webhook trigger of a flow may say `respond: flow`. The request is held open for up to 25 seconds and a `respond` step answers it. The answer is kept on the flow run, because the flow may run on another process than the one holding the request. It is a tenant's answer sent from the platform's address, so it carries a sandboxing content security policy and may not set a cookie.

**A trigger can be a form.** A title, up to thirty fields of seven plain types, and who may send it. The platform serves it as a page of the tenant's portal with no script on it. It reuses the portal's own defenses, adds a field that only machines fill in, and a key that makes sending one page twice start one run.

**In the console.** The flow editor's palette lists the core nodes and the workspace's own. A step's form is drawn from the script's input schema, and choosing a connection, a table or an event in it hands that thing to the step. A webhook has its settings, a form trigger a designer, and an Answer step its status, body and headers. The code editor writes connectors and trigger sources as it writes scripts, from a new Extensions screen. A connection of a kind other than HTTP is set up with a form drawn from its connector's schema.

Tried in a browser against a running instance, with a mail server standing in: a mail connection set up from its form; a flow drawn in the editor from a form trigger, "Write a row" and "Send email", joined by dragging; the form filled in by someone with only its address; the row written and the mail delivered; a webhook answered by a flow in 0.4 seconds with a count read from the table; and a connector saved from the console's editor. The walk found three faults, all mended: a setting left out of the mail form, short fields drawn as tall boxes, and a core node shown with an empty script box.

Not built: a core node as the step of a for-each with a form of its own (a for-each takes `with` and one expression); an answer from a flow started by another flow; a file upload in a form; a form's answers checked by anything beyond each field's type; custom nodes offered across workspaces; and a form for a connector whose configuration is nested, which the HTTP connector's own form still covers by hand.

## Provisioning over SCIM (unit C)

An identity provider pushes the people and groups it holds, and says when someone has left, without waiting for them to sign in.

**A provider has an address and tokens.** `/api/v1/scim/v2/<provider>` speaks SCIM 2.0: users and groups, the three lookups a provider reads first, filters by one attribute, paging, and PATCH. A token is made for one provider, opens that provider's address and nothing else, is kept as a hash, and can expire and be revoked. Refusals are said in SCIM's own shape. There is no bulk, no sorting and no password sync.

**A push follows the rules of a first sign-in.** A pushed person is found by email or made. A member is made only for an email in a domain the provider has proved, and joins the tenant with the provider's default role. An end user who already exists is taken over only on a proved domain or when the tenant has said the provider's word on emails is taken. What was pushed is kept as sent, in tables of its own, beside who it stands for here.

**Tying a pushed person to their sign-in.** A setting names the pushed field that holds the subject the provider signs people in by. With it, a person is tied when pushed and their first sign-in finds them by subject. Without it, the first sign-in ties them by email as before.

**Leaving.** `active: false`, and a delete, turn the person off here. An end user is disabled and their sessions end. A member is suspended in the provider's tenant: a new state, in which no binding or group of theirs counts there, while their account, what they hold elsewhere and what they held here are kept. For the instance's own provider the account is disabled, also new: its sessions end, its API keys are refused and its password is no way in, in the words a wrong password gets. A delete also removes the tie. A push never deletes an account. An admin can suspend, and an operator disable, by hand.

**Groups.** By default a person's groups still come from what a sign-in says. A provider can be told that pushed groups decide. The provider's group map then reads pushed group names, a pushed group can make its own group here, a renamed group keeps its mapping, and turning the setting on takes in what was pushed before.

**Read as Entra ID and Okta send it.** Operations in any case, true and false as text, a work email named in a path, a group member named in a path, attributes sent as one object with no path, a whole user sent with PUT, and attributes that are not kept passed over without complaint. A change that asks for what already holds is a success and writes nothing.

**In the console.** A provider has a Provisioning tab: the address, tokens, how pushes are taken, and what has been pushed. Members can be suspended and resumed, and accounts disabled and enabled.

Tried against a running instance with `curl` standing in for a directory and Keycloak as the provider: a token made in the console; a person pushed who had never been here; that person signing in through Keycloak and being found by the pushed subject; turned off in Entra's form, with their open session ending at once and a fresh sign-in through Keycloak refused; turned on again and signing in; and deleted. A push for an email outside the proved domain, and one with no token, were refused.

**Not tried against a live Entra ID or Okta tenant.** The suite replays the request shapes each is documented to send. Their own validators have not been run against this.

Not built: bulk operations, sorting, ETags, password sync, attributes for end users from a push, a change of a member's email from a push, and groups for the instance's own provider.

## Finishing (unit D)

**Settings are made in the console.** Connections, connection groups, variables, events, schedules and triggers are made and changed from the Resources screen, as drafts like everything else. A trigger is a webhook, an event or a form, with the settings and the designer the flow editor has.

**What an agent would be offered.** A service account's screen shows the address an agent connects to in a workspace, settings to paste into the agent, and the tools the account would be offered there, worked out for the account by the code that answers an agent.

**The console loads less and is sent compressed.** The code editor's screens, the screen builder, dashboards and single sign-on are fetched when first opened. What every visit loads went from 820 kB to 471 kB, and to 121 kB as sent: the build leaves Brotli and gzip copies and the control plane sends them, with files named by their content kept by the browser for good.

**Tidying.** A bundle made only to try a draft out is removed a week later with its test runs. A pull takes in at most 2000 files and 8 MB from the repository's folder. The steps that come with the platform are marked as such and cannot be changed.

**The example** has a contact form: a form trigger and a flow of two core nodes, with no script of its own.

**The exit criterion is walked in a browser.** `e2e/exit-criterion.spec.ts` does all of it on a fresh instance: a member signs in through Keycloak, writes a script, draws a flow that a signed webhook starts and that starts one of two flows by the data, deploys from the Changes screen, finds the commit on the branch under her own name, promotes to production once production has its own secret, builds and publishes an app that people of two groups see differently, and has a developer's pushed change pulled in. It fails if a browser dialog opens or a page throws. A CI job builds the image and runs it. It passes against the image in fifteen seconds. The CI job has not yet run on GitHub.

**Two instances, from the image.** The tenant the browser test built on one instance was exported and imported into a second with a different master key. On the second: both workspaces had every resource, the core node among them; the orders were there; the member suspended on the first was suspended; the people and the group a provider had pushed were there under the same IDs, and the provider was paused, its old token refused and a new one refused until the provider was saved again; the workspace's triggers arrived paused, and once resumed a webhook signed with the secret that traveled started the flow, which wrote its row; and two end users signed in with the passwords they had set on the first instance and saw three rows and two, totalling 30 for the second. A wrong passphrase was refused.

**Version 0.5.0.** Every package, the SDK's range of cores, the worker and the CLI's local project. The oldest bundle taken stays 0.2.0.

Not done, and said so: TanStack Query and a route table in the console; `platform pull` and `platform fmt`; a history of versions with a difference between them; editors for a theme and a data source beyond the screens they already have; compression of the app that draws interfaces, which is small; and a form drawn from any kind's schema, in place of which each kind has a form of its own.

## Schemas

Migrations 0019 to 0032. Bundle format 3. Version 0.5.0.

| Change | Purpose |
| --- | --- |
| `export:write` added to roles that hold `tenant:*` | Exporting a tenant was checked as `tenant:export`, which no role could list |
| `resource_draft` | A resource as last saved in the console, with a revision that goes up on each save |
| `bundle.origin` | Uploaded, composed by the control plane, or composed to try a draft out |
| `deployment.message` | What whoever deployed said about it |
| `tenant.console_code` | Whether code may be written in the console for the tenant |
| `code:write` added to `developer` | Writing code in the console is given on purpose |
| `git_repository` | A tenant's repository and its encrypted token |
| `workspace_git` | The branch a dev workspace follows, what it last agreed with it at, and a lease |
| `git_operation` | Each push and pull, with its outcome |
| `resource_draft.body` becomes `json` | A draft is kept as written, so a flow's steps keep their author's order |
| `connection_group_member` | A member of a connection group in one workspace, with its encrypted credential |
| `end_user_group`, `end_user_group_member` | Groups of a tenant's end users |
| `end_user.attributes` | Facts about an end user that a row rule can match |
| `binding.principal_type` gains `end_user_group` | A role given to a group of end users |
| A table's policy gains `rules` | Rules by person, group and attribute. In the manifest, not a migration |
| `identity_provider` | A provider, its settings, and its sealed secrets |
| `identity_domain` | An email domain a provider signs in, and whether it is proved |
| `identity_link` | Who a provider's subject is here |
| `identity_group_map` | A group at the provider and the group here |
| `sso_state` | One sign-in on its way to a provider and back, as hashes |
| `sso_assertion` | Each SAML assertion accepted, until it would have run out |
| The kind `interface`, and `app.interface` | Pages of widgets over tables, and an app that serves them. In the manifest |
| The role `app_maintainer` | Builds and deploys interfaces and the apps that serve them, and no code |
| The role `portal_reader` | Opens apps and reads rows, held to each table's policy |
| `member_dashboard` | A member's own pages in a workspace |
| Permissions `interface` and `dashboard` | Building apps in the console, and keeping dashboards |
| The kinds `connector` and `trigger_source` | A tenant's own way to reach an outside system, and to decide what a trigger starts. In the manifest |
| `trigger_state.cursor` | Where a polling trigger source had got to |
| A script's `node.takes`, a step's `inputs` and `with` | What a step may hand a script, and an expression per field. In the manifest |
| The step `respond`, and `respond` on a flow's webhook trigger | A flow answers the request that started it. In the manifest |
| `flow_run.response` | What a flow answered, for the process holding the request to find |
| The trigger type `form`, and `trigger_state.type` widened | A form the platform serves, which starts a script or a flow |
| `scim_token` | A token a provider pushes with, as a hash |
| `scim_user`, `scim_group`, `scim_group_member` | What a provider pushed, as it sent it, and who each person is here |
| `identity_provider.scim` | How a provider's pushes are taken |
| `tenant_member.suspended_at` | A member who may not act in the tenant for now |
| `member.disabled_at` | An account that can sign in nowhere |

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
| Resources as files | `packages/manifest/src/files.test.ts` |
| Composing, and what console source cannot read | `packages/compose/src/compose.test.ts` |
| Building a repository with a `platform/` folder | `packages/cli/src/build.test.ts` |
| Drafts, test runs, deploys, takeover, rollback, promotion | `apps/control-plane/src/authoring.test.ts`, with a real worker |
| Git sync | `apps/control-plane/src/git.test.ts`, against git's own HTTP backend and a developer's clone |
| The changes screen and the repository screens | `apps/console/src/Authoring.test.tsx`, `apps/console/src/Git.test.tsx` |
| What a drawn flow is missing | `apps/console/src/FlowEditor.test.tsx` |
| A flow chosen by data, and starting one flow and no other | `apps/control-plane/src/flows.test.ts` |
| Webhook bodies, the whole request, signatures | `apps/control-plane/src/webhooks.test.ts` |
| The app client's flow calls | `packages/app/src/app.test.tsx` |
| Connection groups, with a worker and a stand-in for the outside system | `apps/control-plane/src/runtime.test.ts`, `apps/console/src/ConnectionGroups.test.tsx` |
| The MCP server, with the protocol's own client | `apps/control-plane/src/mcp.test.ts` |
| Groups of end users, and bindings to them | `apps/control-plane/src/apps.test.ts`, `apps/console/src/Groups.test.tsx` |
| Row rules: each condition, read against write, a script acting as a person | `apps/control-plane/src/data-access.test.ts`, `apps/console/src/RowRules.test.tsx` |
| Single sign-on, against an OIDC and a SAML provider made for the test, so that answers can be bent | `apps/control-plane/src/sso.test.ts` |
| A tenant with providers, exported and imported into a second instance | `apps/control-plane/src/sso.test.ts` |
| The single sign-on screen and the console's sign-in | `apps/console/src/SingleSignOn.test.tsx` |
| Totals: each function, groups and periods, refusals, and that they are of the caller's rows | `apps/control-plane/src/data.test.ts`, `apps.test.ts`, `data-access.test.ts` |
| The interface kind: limits, links, what each widget may name | `packages/manifest/src/interface.test.ts` |
| An app that serves an interface, what its route gives away, the maintainer role, dashboards | `apps/control-plane/src/interfaces.test.ts` |
| Each link as a filter, totals as rows, settling a layout | `packages/screens/src/links.test.ts`, `layout.test.ts` |
| A page drawn against a stand-in client: linked widgets, forms, editing, missing tables, reference lookups, dragging | `packages/screens/src/Renderer.test.tsx` |
| The widgets' new abilities | `packages/ui/src/widgets.test.tsx` |
| The builder, sharing an app, and dashboards in the console | `apps/console/src/Interfaces.test.tsx`, `Dashboards.test.tsx` |
| Connectors, mail against a stand-in server, trigger sources, the core nodes, what a step hands over, a flow's answer, the form trigger | `apps/control-plane/src/extensions.test.ts`, with a real worker |
| The step forms: a node's inputs, a webhook's settings, the form designer | `apps/console/src/FlowSteps.test.tsx` |
| The Extensions screen and a connection's form | `apps/console/src/Extensions.test.tsx` |
| SCIM: tokens, people and groups as Entra ID and Okta send them, suspension and disabling, and that a suspended member holds nothing | `apps/control-plane/src/scim.test.ts` |
| The Provisioning tab | `apps/console/src/Provisioning.test.tsx` |
| The editor for settings, and what an agent would be offered | `apps/console/src/ResourceEditor.test.tsx`, `AgentAccess.test.tsx`, `apps/control-plane/src/mcp.test.ts` |
| The console's files: compressed copies, and what a browser may keep | `apps/control-plane/src/console-files.test.ts` |
| Old try-out bundles swept, and the limit on a pull | `apps/control-plane/src/authoring.test.ts`, `git.test.ts` |
| The example's contact form, sent and handled | `packages/cli/src/example.test.ts` |
| The exit criterion, in a browser against the image | `e2e/exit-criterion.spec.ts`, run by `pnpm e2e` and by CI |

## Proposed deviations

### From the approved plan

| Plan | Done | Why |
| --- | --- | --- |
| Run nine spikes before building | Six ran first. Three run at the start of their milestones | Each of the three needs its feature half built to measure anything |
| React as milestone 1, after the spikes | The move was the spike, and is committed | Proving it meant doing it |
| Migration 0019 is `authoring` | 0019 is `permissions`. Authoring takes 0020 | The permission rename was needed first |
| TanStack Query and a route table in milestone 1 | Not yet done | The visible work came first. They change no behavior |
| The preview of a deploy is a `POST` | It is a `GET` | It changes nothing, and every `POST` that succeeds must leave an audit entry |
| Git operations run as queued jobs | They run inside the request, under a lease, holding no database connection | Simpler, and the person asking sees the outcome. A queue is still the right place for a slow remote |
| A push follows every deploy by itself | A deploy marks the workspace "ahead", and a person pushes | A push that fails after a deploy needs somewhere to be seen and retried, which the panel is |
| `git:write` to pull | Pulling needs `deployment:write` and `code:write` | A pull deploys, and can bring code in |
| A connection group's member is read at `/connection-groups/{path}/members/{key}` | `/connection-group-members/{key}/{path}` | A path has slashes in it, so it has to come last |
| The webhook, single sign-on and MCP spikes run before their milestones | Webhooks and MCP were built and tested directly | Each was small enough that building it was the spike |
| Extensions are tested in `runtime.test.ts`, `webhooks.test.ts` and `flows.test.ts` | They have a suite of their own, `extensions.test.ts` | They share a worker and a stand-in mail server |
| `connector` and `trigger_source` carry a `configSchema` each | Only a connector does. A trigger source lists what it reads, as a script does | A source is configured by the trigger that names it, which already has settings |
| The core pack is added by `packages/compose` and `packages/cli` | By `composeBundle` alone, which both call | One place, so both build the same thing |
| SCIM tokens are API keys bound to one purpose | They are a table of their own, on the pattern of worker credentials | A token belongs to a provider, not to a person, and must open nothing else |
| The console's provisioning routes sit under `/identity-providers` | They are under `/provisioning/<provider>` | So that each suite's check of its own routes stays whole |
| One editor drawn from each kind's schema, with `Form` taking nested schemas | A form for each of six kinds | They read better, and reuse the flow editor's webhook settings and form designer |
| The browser test starts the image with Compose | It runs the image on the host's network beside the development stack | The instance, the browser, Keycloak and the test's git server must all reach each other at `localhost`, as Keycloak's realm expects |
| Single sign-on is tested against Keycloak in the development stack | The suite uses providers made for the test. Keycloak was driven by hand, through a browser | A tampered or replayed answer has to be made, and Keycloak will not make one. CI also stays without a 700 MB image |
| Group maps name a group by type and ID in one column | Two columns, one per kind of group | Each can then refer to its table, and a deleted group takes its mapping with it |
| A member's sign-in starts at `/auth/sso/start` | It starts at `/sso/:id/start`. Only the last step is in the authentication library | Only making the session needs the library |
| A provider's SAML metadata is read by a route of its own | It is read when the provider is saved | A route that changes nothing cannot be a `POST` here, and the metadata is only wanted on a save |
| The identity provider answers at the address the person began at | It answers at one address, and the person is sent back with a one-time code | A provider is then given one address, and a SAML answer, which a browser posts from another site, needs no cookie |
| An end user's email is trusted on the same terms as a member's | A tenant may take the provider's word for its own end users | See "Where it falls short of the bar as written" |
| End users make personal dashboards | Dashboards are a member's | The owner's decision, taken when this unit was planned |
| The route for an interface's view ends in `/view` | It is `GET …/interfaces/{path}` | A path has slashes in it, so nothing can follow it |
| A widget type `button` | Not built | A form adds rows and the form trigger will start flows. A button that runs something for an end user needs a design for what it may run |
| An interface is checked when it is deployed | A bundle checks it against the tables the bundle carries. A draft is checked against the tables that are really in the workspace, and the builder will not publish with problems. A deploy from the Changes screen does not make the second check | A table made in the console is in no bundle. The renderer says so in the widget when a table or a column is gone |
| Migration 0026 is dashboards | 0026 and 0027 are two built-in roles. Dashboards are 0028 | Each role was needed where its step was built |
| Drag and resize after everything else | Built, with a layout that settles | A browser check showed overlapping widgets hide each other |
