# Vynxlabs platform: master specification

Last updated: 2026-11-11

## How to use this document

This is the master specification: every phase design doc and every implementation choice must be consistent with it.

- **Audience.** A coding agent, and any human developer, building the platform from scratch.
- **Level.** It states decisions, requirements and boundaries. It contains no code. Schemas, API shapes and file layouts belong in phase docs.
- **Workflow.** For each phase: write a phase design doc, check it against this spec, build, then verify the phase's exit criterion.
- **Conflicts.** If a phase doc needs to contradict this spec, stop and raise it with the owner. Change this spec first, then proceed. Never diverge silently.
- **Wording.** "Must" is required. "Should" is the default unless a phase doc justifies otherwise.
- **Decision status.** The technology decisions section labels each choice as locked, provisional or open. Provisional choices may be built on, but keep them easy to swap.

## Purpose and scope

The platform is one self-hostable foundation on which Vynxlabs builds custom internal apps, business workflows and system integrations for client businesses.

### What it must serve

All of these run on the same platform and share its identity, permissions, run history and interface:

- **Custom internal apps** for a business.
- **Business workflows**, from simple to complex.
- **Integrations** between a client's systems.
- **Data pipelines and ETL jobs**, built on the workflow engine.

The smallest case must stay economical. A single script that makes one system talk to another must run with full run history and alerts, without a deployment of its own.

### Who operates it

- **Vynxlabs** is the primary operator, running it for its own clients.
- **Other agencies** may use it by hosting their own instance. The platform is not designed as a hosted service for agencies that will not run it themselves.
- **Clients** may host it themselves, in their cloud or on-prem.

### Current focus

The developer-focused version comes first. A developer authors scripts, flows and apps in code. The end-user-editable version (visual editors, spreadsheet-style app building) is deferred, but nothing in the design may rule it out.

### Ownership promise

Vynxlabs sells this as: "Custom software where you own the keys and the code. Whether it's our cloud, your cloud, or on-prem." The platform must make that statement literally true. The licensing section turns it into requirements.

### Business model

Vynxlabs charges for implementation, and for hosting when the client does not host. There are no license fees and no per-seat or per-worker charges.

### Non-goals

- A hosted service shared by several agencies.
- A general no-code product for the public.
- Running untrusted code from unknown authors.
- More than one authoring language at launch.
- A spreadsheet formula engine.
- A drag-and-drop app builder in the early phases.

## Guiding principles

These twelve rules settle design disputes. When two options both satisfy the requirements, pick the one that fits more of them.

1. **One platform, one experience.** Every feature shares identity, permissions, run log, audit log and interface.
2. **Everything is a resource.** Scripts, flows, tables, connections, apps and permissions are all the same kind of managed object.
3. **Code first, git as the source of truth.** Production changes arrive from a repository through a deploy.
4. **Language-neutral core.** The control plane depends only on the manifest format and the worker protocol, never on the authoring language.
5. **Same software everywhere.** Shared, dedicated, client-cloud and on-prem deployments run the same image. Differences are configuration.
6. **Minimal footprint.** Containers, Postgres and S3-compatible file storage are the only requirements. The platform must run offline.
7. **No central dependency.** No license check, no call home, no kill switch.
8. **Tenant portability.** Any tenant can be exported from one instance and imported into another.
9. **The core uses its own SDK.** Built-in features are implemented through the same extension points as custom ones.
10. **Reuse libraries and engines, not applications.** Third-party code that ships its own interface or its own user system is not embedded.
11. **Keep the end-user version possible.** Resources are declarative and schema-described so visual editors can be added later.
12. **Kernel before features.** Build the shared core first, then extend it from real client projects instead of speculation.

## Core concepts

These terms have one meaning each across the spec, the code and every phase doc.

| Term | Meaning |
| --- | --- |
| Instance | One deployment of the platform, run by one operator. Hosts one or more tenants. |
| Operator | The organization that runs an instance: Vynxlabs, a client that self-hosts, or another agency. |
| Tenant | One client organization. The hard isolation boundary for data, secrets and root branding. |
| Workspace | A project, department or environment inside a tenant. A permission boundary, flagged production or dev at creation. |
| Resource | Any managed object, such as a script, flow, trigger, table, connection, secret, app or permission binding. |
| Manifest | The canonical, language-neutral description of a resource. |
| Bundle | An immutable, versioned package of a workspace's manifests and code. The unit of deploy. |
| Control plane | The core service: API, identity, scheduler, queue, flow engine, run log and admin console. |
| Worker | A process that runs a workspace's code by pulling jobs from the control plane. |
| Script | A unit of code with declared inputs and outputs. |
| Flow | A declarative graph of steps with one or more trigger entry nodes. |
| Step (node) | One unit in a flow, either built in or backed by code. |
| Trigger | Whatever starts a run: a schedule, a webhook, an event, a manual action or a custom source. |
| Event | A named fact published on the internal event bus. |
| Run | One execution of a script or flow, with status, inputs, outputs and logs. |
| Connector | A reusable adapter for one kind of external system. |
| Connection | A configured instance of a connector, with credentials, bound per workspace. |
| Custom table | A table defined by a tenant and managed as a resource. |
| Data source | A database the platform can read and write: workspace tables or an external database. |
| App | A user interface resource built and served by the platform. |
| Member | A developer or client staff member with a platform identity and roles. |
| End user | A client's customer or portal user, held in that tenant's own user pool. |
| Guest | An unauthenticated visitor, represented as an anonymous principal. |
| Role | A named set of permissions on resource kinds. |
| Binding | A grant of a role to a principal at a scope. |

## System architecture

The platform is a control plane plus workspace workers over a single Postgres database, with S3-compatible storage for files.

### Components

| Component | Responsibility | Constraints |
| --- | --- | --- |
| Control plane | API, identity, permissions, resource registry, scheduler, queue, event bus, flow engine, run log, audit log, admin console, serving apps | Stateless, horizontally scalable, one versioned image |
| Worker | Loads a workspace's deployed bundle, pulls jobs, runs scripts and code steps, reports results and logs | Outbound connections only. May run on a different network from the control plane |
| Postgres | Platform tables, the queue, custom tables | The only required stateful service |
| File storage | Uploaded files, bundle artifacts, large run payloads | Any S3-compatible store, including a self-hosted one |
| SDK and CLI | Authoring, local development, build, deploy and sync | Developer-facing. The SDK is the only supported way to define resources in code |

### The two language-neutral contracts

The control plane knows nothing about TypeScript. It depends on exactly two contracts:

1. **The manifest contract.** A versioned schema for each resource kind.
2. **The worker protocol.** How a worker authenticates, claims jobs, sends heartbeats, reports results and logs, and how payloads are encoded.

Supporting another language later means a new SDK that emits the same manifests and a worker that speaks the same protocol. It must require no change to the control plane.

### Rules

- **Workers pull.** The control plane never opens a connection into a worker. This allows a worker inside a client's network to serve a control plane hosted elsewhere.
- **Worker credentials are scoped** to a tenant, and optionally to a workspace.
- **Trust model.** Everyone who authors code in an instance works for its operator, so code is trusted and jobs are not sandboxed. Workers are kept separate per tenant so isolation can be tightened later.
- **Fairness.** Per-workspace concurrency limits stop one workspace from starving the others.
- **One public API.** It is versioned and has a machine-readable description. The admin console and all apps use this same API, with no private routes.

## Tenancy and deployment model

The hierarchy is instance, then tenant, then workspace, and an instance belongs to exactly one operator.

- A small client on a shared instance is a tenant with one workspace.
- There is no level above tenant. An agency that wants the platform runs its own instance.
- The core carries no billing or metering across operators.

### Deployment modes

Every mode runs the same image. The mode is configuration, never a code branch.

| Mode | Operated by | Tenants | Typical use |
| --- | --- | --- | --- |
| Shared instance | Vynxlabs | Many | Small clients, single integrations |
| Dedicated instance, Vynxlabs cloud | Vynxlabs | One | A larger client with a full custom app |
| Dedicated instance, client cloud | Client or Vynxlabs | One | Client wants its own account and bill |
| On-prem | Client or Vynxlabs | One | Plant networks and offline sites |
| Hybrid | Vynxlabs control plane, worker on the client network | One or many | Local system access without hosting the platform |
| Agency self-hosted | Another agency | That agency's clients | Use outside Vynxlabs |

### Requirements

- **Data routing.** Each tenant record states where its data lives: by default the shared database, optionally a dedicated database. Every data access resolves through this routing. It must exist from the first phase.
- **Tenant export and import.** A tenant can be exported and imported between instances at any time. The export covers resources, custom table data, files, bindings, the end-user pool and the tenant's encryption key, in standard formats.
- **Promotion between modes** is an export followed by an import. No mode needs a special migration path.
- **Single-host install.** A one-machine container deployment must be supported for on-prem sites.
- **Hosting.** Any container host works. A managed Postgres with point-in-time recovery is recommended for Vynxlabs-hosted instances. No provider is locked in.

### Upgrades

- The core ships as a versioned image plus a versioned SDK. Tenant code depends on the SDK at a pinned version.
- Database migrations run automatically on start, move forward only, and must work when versions are skipped.
- Each bundle declares the core version range it needs. The control plane refuses an incompatible bundle with a clear error.
- On a shared instance all workspaces run on one core version, so the SDK surface must stay backward compatible. Breaking changes need a deprecation period.
- Rollout order is Vynxlabs' own workspace, then the shared instance, then dedicated instances.

## Resource model and file format

Every managed object is a resource with one common envelope, authored in TypeScript and compiled to a canonical JSON manifest that is the control plane's only input.

### Common envelope

Every resource, whatever its kind, carries the same fields: its kind, a schema version, a path, its workspace, an immutable internal ID, a version, an ownership mode and a kind-specific body. Permissions, audit, sharing and git sync are built once against this envelope and apply to every kind.

### Authoring and compilation

- Developers define resources in TypeScript through the SDK.
- A build step emits one manifest per resource and bundles the code.
- The control plane reads manifests only. It never parses or executes authoring code to discover resources.
- Each resource kind has a JSON Schema. It validates manifests now and can generate forms and editors later.

### Two families of resource

| Family | Examples | What the manifest holds |
| --- | --- | --- |
| Code-backed | Script, code step, connector, custom trigger, app | A pointer to an entry point in the bundle, plus declared input and output schemas |
| Pure data | Schedule, trigger binding, flow graph, table definition, connection definition, role, binding, branding theme | The complete definition |

Pure-data resources need no code, which is what lets a visual editor create them later.

### Identity and references

- In files and references, a resource is named by a human-readable path that is unique within its workspace.
- In the database, it also has an immutable internal ID. A rename changes the path and keeps the ID.

### Ownership mode

Each resource is either code-managed or UI-managed, never both.

- **Code-managed** resources come from a repository and are read-only in the interface.
- **UI-managed** resources are created in the interface and can be exported to files.

### Repositories and sync

- The core lives in its own repository and is published as an image and an SDK.
- Each tenant has its own repository holding the resources for its workspaces.
- The CLI syncs in both directions for dev workspaces. Production changes arrive only through a deploy.
- Local development must work: the CLI runs a full local instance from a tenant repository, and scripts and flows behave there as they do in production.

### Sharing and secrets

- A resource can be shared with other workspaces in the same tenant by a grant, never by a copy. Nothing is shared across tenants.
- Secret values never appear in a manifest, a bundle or a repository. Resources refer to secrets by name.

### Initial resource kinds

Script, flow, trigger, schedule, event definition, connector, connection, secret, variable, custom table, data source, app, role, binding and branding theme. Adding a kind must not require changes to permissions, audit or sync.

## Identity and permissions

Three classes of people use the platform, served by two identity pools and one binding model.

### Who the users are

| Class | Who | Identity pool | Access |
| --- | --- | --- | --- |
| Developer | Vynxlabs or another developer | Platform members | Authors and deploys, according to roles |
| Client staff | The client's employees | Platform members | Uses apps, runs and monitors work, administers according to roles |
| End user | The client's customers and portal users | That tenant's end-user pool | Only the apps and data granted to them |
| Guest | An unauthenticated visitor | None, an anonymous principal | Only resources explicitly marked public |

### Identity pools

- **Platform members** have one identity per instance and hold memberships in tenants. Operator staff can be members of many tenants.
- **End users** live in a separate pool per tenant. The same email address in two tenants is two unrelated accounts. The pool travels with a tenant export.
- **Service accounts and API keys** provide machine access and are scoped like any other principal.

### Permission model

The model is role-based access control with groups.

- A **role** is a named set of permissions on resource kinds. Custom roles are resources. Sensible built-in roles ship with the core.
- A **binding** grants a role to a principal at a scope.
- A **principal** is a user, a group, a service account or the anonymous principal.
- A **scope** is the instance, a tenant, a workspace or a single resource.

Tenant admin and workspace admin are roles bound at those scopes. An operator admin exists at instance scope and has no access to tenant data by default. To look inside a tenant, an operator opens a time-limited access grant with a stated reason. Each grant, and everything done under it, is audited and visible to the tenant's admins.

### Rules

- **One authorization check.** Every API path calls the same check. No feature implements its own.
- **Nothing is public by default.** Public access is an explicit binding to the anonymous principal, and public endpoints must be rate limited.
- **Row-level policies.** Custom tables must support row policies from the first data phase, starting with a simple owner-column rule. End-user access depends on this.
- **Two pools from the start.** End-user sign-in is delivered in the apps phase, but the identity design in the kernel phase must already reserve the two-pool model.

### Authentication

Authentication is implemented by a library inside the control plane, Better Auth, so no separate identity server is needed. External single sign-on is supported as a per-tenant option.

## Data layer

Postgres is the only platform database, custom tables live in one schema per workspace, and other databases are reached as data sources.

### Platform tables

- Platform tables are shared across tenants. Every row carries a tenant ID, and a workspace ID where it applies.
- All access goes through the tenant routing layer described under tenancy. No query may bypass it.
- No other database engine is supported for the platform itself.

### Custom tables

- A custom table is a resource, defined in a manifest like any other.
- Each workspace gets its own Postgres schema for its custom tables. A dev workspace and its production workspace therefore hold separate data.
- Workspaces in the same tenant can share tables through grants.
- A tenant's data location may point to its own dedicated database. The same code path must serve both cases.

### Schema changes

- A change to a custom table is a migration that travels inside the bundle and runs on deploy. The bundle carries each table's definition, and the control plane compares it with what the workspace has and applies the difference.
- A deploy never drops data. A column or table that leaves the definition is retired: hidden, with its data kept. Dropping it is a separate, explicit, audited action.
- Promotion carries schema changes only. It never carries data.

### Access

- The SDK gives scripts and apps typed access to custom tables.
- Apps reach data through the public API, which applies permissions and row policies.
- Row policies are enforced for every caller, including scripts acting on behalf of an end user.

### Data sources

- External Postgres is the first supported external data source.
- Further kinds, such as SQL Server or SQLite files, are added through the data-source extension point.
- SQLite is a data source for one-off apps only. It is never a deployment option for the platform database.

### Database studio

The admin console includes a studio for browsing and editing custom tables and their definitions. It is delivered in the data phase.

### Files

Files are held in file storage and governed by the same binding model as every other resource.

## Execution: scripts, queue, events and triggers

All work runs as jobs on a queue held in Postgres, started by triggers and executed by workers.

### Scripts

- A script declares its input and output schemas.
- At run time it receives a context giving access to its workspace's connections, secrets, variables, custom tables, a logger and the event bus.
- A script can be run on its own or used as a step in a flow.

### Queue

The queue must support:

- retries with backoff, and timeouts;
- delayed and scheduled jobs;
- priorities;
- concurrency limits per workspace and per resource;
- cancellation.

Delivery is at-least-once. Scripts and steps must therefore be safe to run twice, and the platform provides idempotency keys to help.

The queue is implemented by embedding pg-boss, a Postgres-native library with an Apache-compatible license. No separate queue service is allowed.

### Events

- The platform has an internal event bus. Resources publish and subscribe to named events.
- Events are persisted, so a subscriber that is briefly down does not miss them.
- Platform actions, such as a run finishing or a row changing, are published as events too.

### Triggers

- Built-in triggers are schedule, webhook, event and manual.
- Custom triggers, such as a message broker, a database change or a polling source, are added through the trigger extension point.
- Built-in triggers are implemented through that same extension point.

### Worker behavior

- Workers send heartbeats. Jobs held by a worker that stops responding are reclaimed and retried.
- A deploy never interrupts a run in progress. Each run finishes on the bundle version it started with.
- Small payloads are stored with the run. Large payloads are passed by reference to file storage or a staging table.

## Flows

A flow is a declarative graph of steps stored as data, and the platform's own flow engine runs it durably.

### Graph model

- A flow's manifest holds its nodes and the edges between them.
- Node kinds are trigger entry nodes, built-in steps, code steps and sub-flows.
- Code steps are scripts. Developers add custom nodes through the step extension point.
- The core ships a small set of built-in nodes. A larger automation node pack is deferred.

### Several triggers in one flow

A flow may have several trigger entry nodes, each leading into its own branch of logic. This lets related logic be grouped as one flow. A run is one trigger firing and walking the part of the graph reachable from it.

### Control flow

The engine must be designed for branching, looping over items, parallel paths, waits and delays, approval steps that pause for a person, and error-handling paths. These can be delivered progressively.

### Layout

Nodes can be placed freely on a canvas. Positions are stored apart from the logic, so moving a node creates no new version and no change to the flow's behavior.

### Passing data between steps

- A step refers to an earlier step's output with a plain reference.
- Simple transformations use a small, language-neutral expression language that the control plane evaluates safely.
- Anything more complex becomes a code step.
- The expression language is CEL. It cannot express unbounded work or run arbitrary code, and the control plane evaluates it in a sandbox with time and memory limits.

### Durability

- Flow state is saved after every step.
- A run survives a restart of the control plane or a worker and resumes where it stopped.
- A retry never re-runs a step that already completed.

### Authoring

- In the developer-focused version, flows are defined in code and files.
- The admin console first shows a flow as a read-only graph. Visual editing comes later, as UI-managed flows.

### Data pipelines

ETL jobs are flows. Steps pass references to files or staging tables. Large datasets must never travel through flow state.

### Engine

The flow engine is built in-house on top of the queue, because the graph model is specific to this platform.

## Environments, deploys and promotion

Environments are workspaces, flagged production or dev at creation, and changes move between them as immutable bundles.

### Workspace types

- Every workspace is created as either production or dev. The flag can never be changed afterwards.
- A dev workspace can be linked to a production workspace.
- A dev workspace can also push to another dev workspace, for example from development to QA.

### Deploys

- A deploy is an immutable, versioned bundle for one workspace.
- Activating a bundle is atomic. Rolling back means pointing the workspace at an earlier bundle.
- Runs in progress finish on the version they started with.
- In a production workspace, code-managed resources change only through a deploy.

### Promotion

- Promotion deploys the same bundle that ran in the dev workspace to its linked production workspace. Nothing is rebuilt.
- Connections, secrets and variables are bound per workspace and never travel in a bundle.
- A deploy fails with a clear message if the target workspace lacks a binding the bundle needs.
- Custom table migrations in the bundle run on deploy. Data stays where it is.

### Editing in dev workspaces

Resources can be edited through the interface in a dev workspace. Those edits sync back to the tenant repository so that git stays the source of truth.

### Cloning

- A new workspace can be created as a copy of a production workspace, with or without its data. The copy is always a dev workspace, linked to the workspace it came from.
- Cloning has a safety setting chosen at clone time. By default the clone starts with its triggers paused and its connections unbound, so it cannot act on real systems.
- Turning the safety setting off is allowed and is recorded in the audit log.
- Masking of personal data in clones is deferred.

## Apps and user interface

Custom interfaces are resources built and served by the platform, so identity, permissions and branding apply to them uniformly.

### Two tiers of app

| Tier | Built by | How | When |
| --- | --- | --- | --- |
| Developer-built apps | A developer | Custom interfaces written locally with the SDK and the shared component kit, managed in git | Current focus |
| Generated apps | A developer first, end users later | Screens generated from custom tables: table, detail, form and chart views that can be linked | Deferred |

The generated tier takes its idea from Grist: typed tables and linked views. Grist itself is not embedded, and there is no spreadsheet formula engine.

### Admin console

The platform's own interface covers resources, runs, logs, users, settings and the database studio. It is built with the same component kit and the same public API as client apps.

### Unified experience

- Everything a user sees must use one design system.
- Third-party libraries may be used inside it, for example a charting library, but they must be wrapped in the kit's styling.
- An application that brings its own interface is never embedded.

### Branding

- Branding is a set of theme tokens defined at the tenant and overridable per workspace.
- The component kit must be built on theme tokens from its first version. Retrofitting them later is costly.

### Access

- An app is served to members, end users or guests according to its bindings.
- An app reads and writes data only through the public API, so permissions and row policies always apply.

### Frontend stack

The console and the component kit use Preact and Vite, with the kit built on Base UI and Tailwind. The app SDK built on that foundation is designed in the apps phase. A drag-and-drop builder is deferred.

## Extensibility

The platform is extended through five named extension points, and its built-in features use the same ones.

| Extension point | What it adds | Built-in uses |
| --- | --- | --- |
| Trigger | A way to start runs | Schedule, webhook, event, manual |
| Step (node) | A building block for flows | Branch, loop, wait, run script |
| Connector | An adapter for a kind of external system | Generic HTTP, Postgres |
| Data source | A database the platform can read and write | Workspace tables, external Postgres |
| Interface widget | A component for apps and generated screens | Table, form, chart |

### Rules

- Each extension point has a published interface in the SDK, and its configuration is described by a JSON Schema.
- An extension ships either in a tenant's bundle, when it is specific to that client, or as a shared package reused across tenants.
- The core must not have a private way to do what an extension point does. If a built-in feature needs more than the interface offers, the interface grows.
- Adding a sixth extension point requires a change to this spec.
- The extension interfaces are part of the SDK's compatibility promise, so they follow the same versioning and deprecation rules.

## Observability and audit

One run model and one audit stream cover the whole platform.

### Runs

- Every execution of a script or flow is recorded: what triggered it, inputs, outputs, status, timing, step-level detail, logs and the bundle version it ran on.
- Runs are searchable per workspace.
- Retention is configurable per tenant.
- A tenant can see its own runs and health. This visibility is a core part of what the platform offers over a bare script.

### Alerts

Failures can notify people and can start an error-handling script or flow, configured per workspace or per resource.

### Audit log

- The audit log records every change to a resource, binding or secret, and every deploy, clone, export and import.
- It also records who started a run, and any operator access to tenant data.
- Each entry states who, what, when and from where.
- The log is append-only.
- All changes go through one write path, so nothing can bypass the audit log.

### Operator health

The instance exposes metrics and structured logs in standard formats, including queue depth and worker status, so an operator can monitor it with ordinary tools.

## Open source, licensing and the ownership promise

The platform will be open source, with Apache 2.0 as the intended license, pending legal review.

### Why a permissive license

- A client must be able to run, modify and re-host the platform forever, without Vynxlabs.
- Client code imports the SDK. A copyleft SDK could place obligations on that code, which would break the promise that the client owns it.
- If the core ever moves to a copyleft license, the SDK must stay permissive.
- The accepted trade-off is that anyone may host the platform commercially. Vynxlabs earns from implementation and hosting for its own clients, not from licenses.

### Related rules

- **Client code.** A client's scripts, flows and apps live in the tenant repository. Ownership of that repository is assigned by the services contract, not by the platform license.
- **Brand.** The product name is protected by trademark, not by the license.
- **Copyright.** Vynxlabs keeps sole copyright in the core. A contributor agreement must be in place before outside contributions are accepted.
- **Dependencies.** Every dependency of the core and SDK must have an Apache-compatible license.

### The promise as requirements

| Promise | Requirement |
| --- | --- |
| You own the code | The tenant repository is complete and deployable using only the public core. It has no private Vynxlabs dependencies |
| You own the data | A tenant can be exported at any time in standard formats |
| You own the keys | Each tenant's secrets are encrypted with that tenant's own key, and the key travels with the export |
| No lock-in | No license check, no call home, no kill switch, and no operator access path the tenant cannot see |
| Any location | The same image runs in every deployment mode, including offline |

These requirements are acceptance criteria. A phase that weakens any of them does not pass.

## Technology decisions

Each decision below is locked, provisional or open, and the rest of this spec should be read with that status in mind.

- **Locked**: confirmed by the owner. Changing it means changing this spec.
- **Provisional**: proposed during design and not yet explicitly confirmed. Build on it, but keep it swappable.
- **Open**: to be decided in the phase named.

| Area | Decision | Status |
| --- | --- | --- |
| Product direction | Developer-focused version first, end-user editing kept possible | Locked |
| Authoring language | TypeScript only at launch | Locked |
| Other languages | Possible later through the manifest and worker protocol, with no core rework | Locked |
| Operator model | One operator per instance. Agencies self-host | Locked |
| Deployment targets | Vynxlabs cloud, client cloud and on-prem | Locked |
| Platform table isolation | Tenant ID on every platform row | Locked |
| User classes | Developers, client staff, end users and guests | Locked |
| Permission model | Roles with groups, at tenant, workspace and resource scope | Locked |
| Row-level policies | Postgres row-level security, starting with an owner-column rule | Locked |
| Workflow model | Declarative graph with code steps, free canvas placement, several triggers per flow | Locked |
| Flow data wiring | Plain references plus a small language-neutral expression language | Locked |
| Resource identity | Readable path in files, immutable ID in the database | Locked |
| Environments | Workspaces flagged production or dev at creation, linkable, with promotion and cloning | Locked |
| Deploy unit | Immutable versioned bundle per workspace | Locked |
| App hosting | Apps built and served by the platform | Locked |
| Queue and events | Built-in queue and event-driven design | Locked |
| Interface | One unified experience, with branding per tenant and per workspace | Locked |
| Licensing | Open source | Locked |
| License text | Apache 2.0, pending legal review | Provisional |
| Resource file format | TypeScript authoring compiled to canonical JSON manifests | Provisional |
| Custom table isolation | One schema per workspace, so dev and production data stay separate | Provisional |
| Platform database | Postgres only. SQLite is a data source, never the platform database | Provisional |
| Footprint | Containers, Postgres and S3-compatible file storage only | Provisional |
| Identity pools | Platform members per instance, end users per tenant | Provisional |
| Tenant portability | Data routing per tenant, plus export and import | Locked |
| Dedicated database contents | A tenant's custom tables and their catalog. Platform records, the queue and sign-in stay in the instance database | Locked |
| Tenant export | One archive in standard formats (tar, JSON Lines). The tenant's key travels wrapped with a passphrase. Members and the audit log always travel, run history on request | Locked |
| Workspace clones | Always a dev workspace, linked to its source | Locked |
| Secrets | Encrypted with a key per tenant | Provisional |
| Clone safety default | Triggers paused and connections unbound unless switched off | Provisional |
| Control plane language | TypeScript on Node | Locked |
| Queue engine | pg-boss, embedded in the control plane | Locked |
| Flow engine | Built in-house on the queue | Locked |
| Authentication | Better Auth inside the control plane, with external single sign-on as an option | Locked |
| Expression language | CEL (Common Expression Language), evaluated in a sandbox with time and memory limits | Locked |
| Frontend framework and component kit | Preact and Vite, with a kit built on Base UI and Tailwind | Locked |
| Chart library | Vega-Lite is the candidate | Open, apps phase |
| Hosting provider | Fly.io for Vynxlabs-hosted instances, single-host Compose for VPS and on-prem. No provider is locked in | Locked |

### Considered and not adopted

- **Windmill** as the foundation: its license restricts reselling, white-labeling and serving it to external users.
- **Embedding Grist**: it brings its own interface and its own access rules.
- **Turso**: ruled out while its ownership and direction are changing.
- **A separate identity server or queue service**: each adds a container to every on-prem install.

## Delivery phases

The build runs in eight phases, each with its own design doc checked against this spec and each leaving the system deployable.

| Phase | Name | Delivers | Exit criterion |
| --- | --- | --- | --- |
| 0 | Foundations | Repository, tooling, local stack, conventions | An empty instance boots locally and on a container host, and migrations run on start |
| 1 | Kernel | Tenancy, resources, members, permissions, secrets, audit, console shell | A tenant, workspace, members and roles can be created, and every change is audited |
| 2 | Execution | SDK, build, deploy, worker, queue, triggers, run log | A real client integration runs in production on the shared instance |
| 3 | Events and flows | Event bus, flow engine, built-in nodes, graph view | A multi-step flow survives a restart and is visible as a graph |
| 4 | Data | Custom tables, migrations, row policies, data sources, studio | A table change is promoted from dev to production with no data loss |
| 5 | Environments and portability | Linked workspaces, promotion, cloning, tenant export and import | A tenant moves from the shared instance to a dedicated one with nothing lost |
| 6 | Apps | App resources, component kit, end users, guests, branding | A custom app serves both staff and portal users in production |
| 7 | End-user editing | Generated screens, flow editing, node pack, more data sources | Ongoing track, scoped when reached |

### Phase 0: foundations

Sets up everything later phases assume. It covers the core repository layout, build and test tooling, continuous integration, the license and dependency policy, the local development stack, the migration framework, public API conventions, the manifest envelope with its schema tooling, and the tenant data routing skeleton.

### Phase 1: kernel

Builds the shared core that every feature depends on. It covers instances, tenants and workspaces, the resource registry and envelope, platform member identity and sign-in, roles, bindings and the single authorization check, secrets with per-tenant keys, the audit write path, the admin console shell on theme tokens, and the CLI skeleton. The identity design must already reserve the end-user pool.

### Phase 2: execution

Delivers the first useful product: a script with visibility. It covers the SDK for scripts, the build to manifests and a bundle, deploys, the worker and worker protocol, the queue, schedule, webhook and manual triggers, connections and variables per workspace, the run log with logs and failure alerts, and running scripts locally. This phase is the minimum viable platform.

### Phase 3: events and flows

Adds orchestration. It covers the event bus and event triggers, the flow graph model with several entry nodes, the durable flow engine, control flow, the expression language, the first built-in nodes, approval steps, and the read-only graph view.

### Phase 4: data

Adds tenant-owned data. It covers custom tables as resources, a schema per workspace, migrations in bundles, typed data access, row policies, external Postgres as a data source, file handling, and the database studio.

### Phase 5: environments and portability

Makes the deployment model real. It covers production and dev flags, linked workspaces and promotion, dev-to-dev pushes, cloning with its safety setting, tenant export and import, dedicated database routing, the hybrid worker setup, and tests for upgrades that skip versions. This phase is also when the self-hosting guide and public release are prepared.

### Phase 6: apps

Adds custom interfaces. It covers the app resource, the component kit and app SDK, serving apps, the end-user pool and sign-in, guest access with rate limiting, branding per tenant and workspace, and charts.

### Phase 7: end-user editing

A continuing track for the deferred items listed in the next section. Each item gets its own design doc when it is picked up.

### Rules for phases

- Phases 0 to 2 are strictly ordered. Phases 3 and 4 may swap if the first client project needs data before flows.
- Each phase doc must list the sections of this spec it implements, its schemas and API surface, its tests, and any proposed deviation.
- Later-phase concerns that are costly to retrofit are built early: data routing in phase 0, the two identity pools and theme tokens in phase 1, immutable bundles in phase 2.
- Security review, tests and documentation are part of every phase, not a phase of their own.
- Where possible, each phase is proven on a real client project before the next begins.

## Deferred items and open questions

Nothing below is in scope for the early phases, but no design may block the deferred items, and the open questions need an owner decision.

### Deferred

- Visual editing of flows, and UI-managed resources in general.
- Generated apps from custom tables, and any drag-and-drop builder.
- A core automation node pack.
- Additional authoring languages.
- Sandboxing for code from authors the operator does not trust.
- Customer-managed encryption keys.
- Masking of personal data when cloning a workspace.
- Data sources beyond external Postgres, including SQLite files and SQL Server.
- Hosting several agencies inside one instance. This is not planned.

### Open questions for the owner

- [x] Confirm the control plane language: TypeScript on Node.
- [x] Confirm the queue approach: pg-boss, embedded in the control plane.
- [x] Confirm that the flow engine is built in-house on the queue.
- [x] Confirm the authentication approach: Better Auth inside the control plane.
- [ ] Confirm the remaining provisional rows in the technology decisions table.
- [x] Choose the flow expression language: CEL.
- [x] Choose the frontend framework and the component kit's foundation: Preact, Vite, Base UI and Tailwind.
- [ ] Choose a product name and check it for trademark conflicts.
- [ ] Get legal review of Apache 2.0 together with the contract clause that assigns the tenant repository.
- [x] Decide whether a clone of a production workspace is always a dev workspace: yes. A clone is a dev workspace linked to the workspace it came from.
- [x] Decide the rollback policy for custom table migrations: a deploy or rollback never drops data. A column or table that leaves the definition is retired and kept, and dropping it is a separate, explicit action.
- [ ] Set default retention for runs and audit entries.
- [x] Define what an operator admin can see inside a tenant, and how the tenant is shown that access: nothing by default, then explicit time-limited access grants that are audited and listed for the tenant's admins.
- [x] Choose the hosting provider for the Vynxlabs shared instance: Fly.io.