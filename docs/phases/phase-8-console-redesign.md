# Phase 8: the console redesigned

Status: in progress. Built and tested locally: milestones 1 to 5 (foundations and instance branding, operate, build, release and git, data), most of 6 (references, health of data sources, variables and secrets), and the first of 7 (a service account's description, a key's last four characters, where a member was last). Not started: the rest of 6 and 7 (testing connections on a worker, the tenant overview, members and access, single sign-on and recovery codes, provisioning refusals, a portal hostname for every app, worker pools, staged import), and 8.
Last updated: 2026-11-13

Phase 8 rebuilds the console to the "Signal Workshop" design: a quiet operational instrument panel in which each task gets the layout it needs. A rail and a section panel replace the long sidebar. Flows, scripts, apps and tables become full-width workbenches. Collections become lists with an inspector beside them. The workspace and the tenant each get an overview of what needs attention. The console is branded per instance instead of borrowing each tenant's colours, works in light and dark, and works from a phone's width up.

The design is recorded in the mock-up `Console Redesign.dc.html` with its generic screens in `console-screens.js`, and the audit that led to it. Where the mock-up showed something the platform could not yet do, the owner chose what to build; those are listed below.

**Exit criterion:** on a fresh instance branded by its operator, a member can, on a laptop and again on a phone-sized screen, sign in, read the workspace overview, find a failed run and the step and log line that failed, edit and test-run a flow, review and deploy a release and promote it to production, share an app with a group and see which rows each audience reads, and pause one trigger in production. No screen uses a raw colour, a tenant's branding never reaches the console, and every screen works in light and dark.

## Spec sections implemented

| Master spec section | What phase 8 delivers |
| --- | --- |
| Admin console | The redesign, instance branding, phone widths |
| Branding | Instance tokens, name and logo, separate from tenant branding |
| Promotion | `promotion:write`; a dev deploy warns on a missing binding; the release branch |
| Editing in dev workspaces | Draft history, pushing drafts, repository source in bundles |
| Triggers | Pausing one trigger; refused webhook requests kept |
| Flows: control flow | Approvers named on an approval step |
| Health and diagnosis | Health checks, refused pushes kept, suggested next steps |
| Addresses | A portal hostname that serves every app; apps that declare their tables |
| Authentication | Recovery codes for owners under enforced single sign-on |
| Tenancy: export and import | Staged import |
| Worker behavior | Worker pools as records |

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-8-console-redesign`, in eight milestones |
| Console branding | Per instance: product name, logo, light and dark tokens. The console stops loading the tenant's theme |
| Theme | Light, dark and the system's choice. Dark follows the mock-up; light is designed from the same roles |
| Small screens | Required on every screen, though the mock-up shows none |
| Data the mock-up implies | Built in the milestone of the screen that needs it |
| Adopted although they change the model | Approvers per step; dashboard sharing by group, dashboard filters and a figure widget; pausing one trigger; repository source in bundles; draft history and pushing drafts; plain descriptions of changes; suggested next steps for failed runs; recovery codes; worker pools; refused requests and health kept; a portal hostname for every app; staged import; apps declaring tables; a description on service accounts, the last four characters of keys, and "last here" kept by the server |
| Not adopted | Invitations for members (the "Invited" state is left out); SSH deploy keys |
| Release | `promotion:write` separate from deploying; a dev deploy with a missing binding warns |
| Repository | A verified time and "Check again"; tokens scoped to the repository recommended; each promotion pushes to a release branch, and a failed push leaves the promotion standing |

## Design in brief

- **Tokens or nothing.** Every colour in the mock-up maps to a `--vx-*` token. New roles: `structure`, `raised`, `selected`, `line-strong`, `ink-subtle`, `code-bg`, `focus`. They join the tenant theme's list too, so one stylesheet writer serves both.
- **The kit's defaults do not move.** Tenant apps import `@vynxlabs/ui`. New console pieces live in `apps/console/src/kit/`; shared components gain opt-in variants only.
- **Instance branding reuses the tenant pipeline.** The same token list, the same value check and the same stylesheet writer, served at `/api/v1/instance/theme.css` and loaded before the console renders.
- **Five regions.** A rail of areas; a section panel with counts that hides in the editors; a header with the scope as a signal path; a work surface whose width the task sets; an inspector that opens on selection.
- **Narrow screens.** Below 1280px the section panel and inspector overlay the work; below 1024px the panel is a drawer; below 768px a top bar holds the menu, inspectors open full-screen and tables drop low-priority columns.
- **Numbers come from records.** Counts, health and summaries are read from the API, never invented. Aggregates are added as endpoints where a list would otherwise fetch per row.

## Milestones

| # | Milestone | Contents |
| --- | --- | --- |
| 1 | Foundations | Tokens, type roles, the console kit, instance branding, the shell, the kit sheet |
| 2 | Operate | Workspace overview, runs, events, triggers, approvals |
| 3 | Build | Flows, the flow editor, the script editor, extensions, resources, the app builder, published apps and sharing |
| 4 | Release and git | The release stepper, change descriptions, draft history, the git workbench, the release branch |
| 5 | Data | The table explorer, data sources and health, dashboards |
| 6 | Configure | References, connections, variables, secrets, workspace settings |
| 7 | Tenant, instance, account | Every remaining screen and the model changes they need |
| 8 | Finish | States, accessibility, every width, both themes, the exit criterion in a browser |

## Tests

| Area | Tests |
| --- | --- |
| Token copies agree | `apps/control-plane/src/apps.test.ts`, `apps/console/src/Portal.test.tsx` |
| Instance branding | `apps/control-plane/src/instance.test.ts`, `apps/console/src/Shell.test.tsx` |
| The shell | `apps/console/src/Shell.test.tsx` |
| Every width and theme | `e2e/redesign.spec.ts` |

## Findings

- **Bundles now carry their TypeScript.** The CLI adds the repository's own sources and a source map (never a dependency's files) to `sources`, up to 4 MB of text; the digest covers it only when present. An instance older than this phase refuses a bundle that carries it, since the bundle schema allowed no other fields. Deploy with a CLI that matches the instance.
- **Promotion is its own permission.** `promotion:write` is given by migration to every built-in role that could write deployments. A tenant's own roles that could promote before cannot until it is added to them.
- **A dev deploy warns where it refused.** A connection, secret, variable or data source the bundle needs and the dev workspace lacks is now a warning in the deploy's summary. Production and promotion still refuse.
- **The release branch is `<release_branch>/<workspace slug>`,** `release` by default, and starts from the default branch the first time. It is written after the promotion's transaction, so its failure is recorded as a git operation of the production workspace and never undoes the promotion.
- **"See it as" a group** reads rows as someone in that group who owns no row. Owner rules show nothing in it; rules by group and by attribute do.
- **Connections are not tested from the control plane.** A data source is reached from the control plane, as it always was. An HTTP or SMTP connection would let the control plane call any address on its own network for whoever may bind a connection, so testing one is left to a worker, with the custom connectors, in milestone 6.
- **Where a member was last** is written through the audited write path, as every change is, and only when the workspace changes, so moving around one workspace leaves the audit log alone.
- **One hostname for everything** is a domain registered with an empty app path. It serves the portal's home at its root, the sign-in pages under `/_`, and each app of its workspace at `/<app path>/`, matched by the longest path. It serves one workspace, as a hostname for one app does, and its home lists that workspace's apps, a dev workspace's included.
- **Recovery codes** are spent inside the sign-in check, before the password is accepted, so two sign-ins racing with one code cannot both pass.
- **A staged import** is kept on the disk of the replica that received it, since the object store takes whole files and an import may be very large. Behind several replicas the confirmation must reach the same one: another answers `409 staged_elsewhere`. A staged file is removed after its time is up.
- **Change descriptions** compare a draft with what is deployed. A promotion still lists changes by path: the descriptions need the two bundles' bodies side by side, which is left for milestone 8.

## Proposed deviations

None.
