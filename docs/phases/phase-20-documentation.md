# Phase 20: Volvel gets its name and its documentation system

Status: planned, on branch `phase-20-documentation`, off `main` at cdc16e8. The owner answered the decisions on 2026-11-19. M0 is done. M1 is under way.
Last updated: 2026-11-19

The product has a name, Volvel, and the owner wrote a high-level architecture for one documentation system: three packages, help inside the console, documentation sites that tenants write, and descriptions on resources. This phase renames the product and builds that system. The architecture was checked against `main` before planning, and the places where it describes something the code does not do are listed under "Where the document and the project disagree".

Three things differ from the architecture as it was given:

- The editor is Monaco, which the console already has, not CodeMirror.
- The public website is not in this phase. It is a separate project in another repository. This phase leaves the packages in a state that site can use.
- The rename from Vynxlabs to Volvel comes first, as M1.

Writing the product's own documentation is not in this phase. `@volvel/docs` gets a page for every help topic, and a page may be a stub.

**Exit criterion.** On `examples/fernhill`, deployed to the rebuilt test instance:

- nothing a person or a program meets is named Vynxlabs, and `volvel deploy` from a packed install of the CLI deploys the example;
- on Data, Tables, `F1` opens the help panel at the tables page, with the network blocked;
- every section, editor and workbench of the console opens help of its own, and a check fails the build when one does not;
- a column's description shows on its header, and a term the tenant defined is underlined in a label and opens its definition by keyboard;
- an end user who may not start a script is told nothing of it by the terms API;
- a handbook written as Markdown files in the repository is served as a docs app, signed out, with its navigation taken from its folders, and works with scripts turned off;
- a member with only `doc:write` writes a page in the console with a live preview, saves, deploys it, and can deploy nothing else;
- two people saving the same page get a conflict, not an overwrite;
- a draft of a public docs app is seen at its preview address by a member and refused to everyone else;
- a tenant page that extends the tables topic is listed under "From your team" in the help panel;
- `npm pack` gives packages named `@volvel/*` that install in a clean folder.

## Owner decisions

Answered by the owner on 2026-11-19.

| Area | Decision |
|---|---|
| Shape | One branch, `phase-20-documentation`, one phase, commits `Phase 20: …`. The owner looks after M5 and again after M9 |
| Editor | Monaco, through the existing `CodeEditor` wrapper. No CodeMirror. |
| Public site | Not in this phase. Packages are made ready for it, nothing more. |
| Rename depth | `@vynxlabs/*` becomes `@volvel/*`. The CLI command `platform` becomes `volvel` and `PLATFORM_*` becomes `VOLVEL_*`. The tenant repo's `platform/` folder and the internal `vx` prefixes stay. |
| Old data | No backwards compatibility. No other instance exists. The Fly test instance is rebuilt from scratch after this phase. |
| Distribution | npm organisation `volvel` and Docker organisation `volvel` exist. The CLI must be installable as `volvel`. |
| Images in docs | Repository images and images by URL. No console upload. |
| Tenant terms in the console | Underlined automatically in labels only: column headers, field labels, resource titles and descriptions. Whole-word match on term and aliases, first use per screen. Never in cell values or free text. |
| Dev workspace preview | Yes. A dev workspace's drafts of a docs app can be previewed at a private address. |
| Term scope | Workspace-wide, filtered by what the reader may open. |
| Product name | Volvel. `:product[]` resolves to the instance's brand in the console (`useBrand()`), and to "Volvel" elsewhere. |

## Where the document and the project disagree

These are the points where the architecture document describes something the code does not do. Each has the plan's answer.

**Things the document assumes exist, and do not**

| The document says | What is there | Plan |
|---|---|---|
| Schemas in zod (component props, frontmatter) | Kinds are plain JSON Schema checked with Ajv; envelope and routes are TypeBox. zod is only inside the SDK. `SchemaForm` and `schemas/kinds/` need JSON Schema. | JSON Schema (TypeBox) and Ajv for frontmatter and component props. No zod in the new packages. |
| "confirm with `compat.test.ts` that no `schemaVersion` bump is needed" | `compat.test.ts` tests whether a core version can run a bundle. It says nothing about kind schemas. | Optional fields need no bump (every kind is at 1). The check is `pnpm check:schemas`. |
| The spec already has an exception for console-made scripts and interfaces | No such exception. The deferred bullet "UI-managed resources in general" is simply stale: since phase 7 any kind can be drafted in the console (`saveDraft` has no allow-list). | Correct the stale bullet in the spec. No exception is needed. |
| "as the release plan already says" | There is no release plan and no release workflow. The spec still lists "choose a product name" as open. | Tick the name in the spec. M11 writes the first release workflow. |
| An `ERROR_CODES` registry to extend | None. About 60 codes are string literals across 31 files (`kernel/errors.ts`, `problem.ts`). | M7 builds the registry and moves the literals onto it. Larger than the document implies. |
| A config table read by `loadConfig` | `loadConfig` (`config.ts:142`) reads about 50 variables by hand. Server variables have no prefix. | M7 turns it into a table. The docs link setting is `DOCS_URL`, not `VOLVEL_DOCS_URL`, to match the others. |
| A lint for unwrapped glossary terms | Lint is Biome with no custom rules. | A source-scanning test in the style of `apps/console/src/enforce.test.ts`. |
| A palette "Docs source" | `CommandPalette.tsx` has no source registry. It has hard-coded actions and one server search. | Docs come through the server search, plus one added action "Help for this page". |
| Field toggletips from emitted kind schemas, "reusing SchemaForm's hint pattern" | The console never reads `schemas/kinds/`. `SchemaForm` only gets runtime schemas (connector config, script input). Most resource forms are hand-written. | M7 generates a descriptions module from `platformKinds`. Hand-written forms get toggletips field by field. |
| Golden-file tests as an existing habit | The only precedents are Playwright screenshots and `check:schemas`. | New convention, set in M2: fixture `.md` in, `.json`/`.html` out, compared on disk. |
| `Toggletip`, `Alert`, accordion and tree components | `packages/ui` has `Popover` (the toggletip in all but name), `Notice`, `Tabs`, `Kbd`. No accordion, no tree. | M4 adds `Term`, `Toggletip` (on `Popover`), `Details`, `Tree`. `alert` renders as `Notice`. |
| Git sync opens PRs | It pushes one branch per dev workspace. Nothing calls a git host's API. | Unchanged. The docs say "push a branch", not "open a PR". |

**Things that work differently from how the document describes them**

| The document says | What is there | Plan |
|---|---|---|
| Saves go "through `draftManifests`" and are version-checked | `draftManifests` is a git overlay helper. Saves go through `saveDraft` (`kernel/authoring.ts:89`). The `revision` check only happens if the client sends one. Drafts exist only in dev workspaces. | The doc editor always sends `revision`. For `doc`, the server refuses a save without it. |
| `doc:write` "modelled on `interface:write`" | `interface:write` is enforced only in `routes/authoring.ts` through a hard-coded `isScreen` test. | M9 turns that into a small table of "narrow write" kinds (interface, doc) rather than a second special case. |
| Renames redirect for 90 days | Only apps get a real 308. Other resources answer at the old path with `Deprecation`/`Sunset` headers (`kernel/resolve.ts`). | The docs front door looks up the doc alias and answers 308 to the page's new address. |
| "The CLI reading `.md` folders" as a small step | A resource file is `<path>.<kind>.yaml` only (`files.ts:594`). A second file form is new for the CLI, git sync push and pull, export and clone. | M8 adds the `.md` form in `packages/manifest/src/files.ts`, so every reader and writer gets it from one place. |
| Adding a kind is one registry entry | About six places, including `KIND_ORDER` in both `deploy.ts:796` and `cli/src/build.ts:90`. `dashboard` is missing from both today. | M8 adds `doc` to all of them and fixes `dashboard` in passing. |
| A hashed inline enhancement script | Platform pages allow no script at all (`PAGE_POLICY`); apps allow `script-src 'self'`. | Serve the enhancement script as a file from the app's own address. No inline script, no hash. |
| `help: TopicId` on nav section, editor and workbench entries | Sections are `{slug,label,icon}` grouped by area. Editors and workbenches are private regex lists, not entries. | M5 gives sections a `help` field and turns the regex lists into entries that carry one. |
| Extend PageHeader's ⓘ popover | The ⓘ exists only when a page passes `helpKey` (5 files). | Every page with a topic gets the ⓘ. "Learn more" opens the panel. |
| `F1` and `⌘/` are free | Free in the console's registry, but Monaco binds both (command palette, toggle comment). | `F1` is overridden in `CodeEditor`. `⌘/` keeps toggling comments while an editor has focus. |
| The help panel is a `SplitPane` variant | Right-hand space is already shared by the section panel (224px) and `Inspector`. | Docked from 1280px, a non-modal overlay from 768px, full-screen below. It yields to an open Inspector. |
| End users see script and flow terms if "may start it" via `script:read`/`flow:read` | The real test is `run:write` / `flow_run:write` through `targetResource` and `audienceMay` (`kernel/apps/actions.ts`). | Use those. |
| Only `markup`, `docs-engine` and `docs` lose `private` | `app` and `ui` are already public. The React renderer needs `ui`. An installable CLI needs `cli`, and tenant repos need `sdk`. | M11 publishes `markup`, `docs-engine`, `docs`, `ui`, `app`, `sdk`, `cli`. The CLI bundles `manifest` and `compose` so they stay private. |
| Extract `@volvel/tokens` | Tokens live in `packages/ui/src/tokens.css` and are already exported. | Not in this phase. It only matters to the site. |

**Things the document does not mention**

- **A Markdown renderer already exists**: `packages/ui/src/Markdown.tsx`, hand-written, used by `ResultView` for script output. M4 replaces it with the markup package under a `result` profile, so there is one renderer.
- **Images by URL meet two rules.** The app policy is `img-src 'self' data: blob:`, and the spec's "runs offline" principle. Docs apps get `img-src 'self' https:`. A URL image is the author's choice and shows a placeholder offline. Product docs may not use them (`docs:check`).
- **Repository images need a home on the instance.** The app asset store (`kernel/apps/assets.ts`, by content hash, 25 MB) already does this. Docs reuse it.
- **The spec says** "Adding a kind must not require changes to permissions, audit or sync." `doc` adds a permission kind and a file form. That sentence needs the owner's agreement to bend.

## Milestones

| # | Milestone | Size |
|---|---|---|
| M0 | Branch, the phase document, the spec changes, and the checks listed below | S |
| M1 | Everything is named Volvel, and the CLI is `volvel` | L |
| M2 | `@volvel/markup`: one page from Markdown to a checked tree to React, HTML and text | L |
| M3 | `@volvel/docs-engine`: a folder of pages becomes collections, terms, topics, links and a search index | M |
| M4 | The kit can show a term, a toggletip, a folded section and a tree, and has one Markdown renderer | M |
| M5 | Every console screen has help: the panel, `F1`, "Learn more", and `docs:check` | L |
| M6 | Columns and resources carry descriptions, and terms reach the console, apps and screens | M |
| M7 | The reference writes itself: permissions, kinds, config, CLI, errors, API | L |
| M8 | A page is a resource, and a folder of pages is served as a docs app | L |
| M9 | Docs are read, written and previewed in the console | L |
| M10 | Tenant pages join the help: attached pages and "From your team" | M |
| M11 | The packages and the CLI can be published | M |
| M12 | The example, the guides, the changelog, and the walk-through on the rebuilt test instance | M |

Each milestone leaves the system deployable. M2 to M4 have no user-visible effect on their own. The owner's first look falls naturally after M5 and again after M9.

## What each milestone holds

### M0: branch, document, spec

- Branch `phase-20-documentation` from `main` once phase 19 is merged.
- This document.
- Spec changes, each agreed and written into `docs/master-spec.md` first (see "Where this meets the master spec").
- Run the checks under "To check before building".

### M1: everything is named Volvel

- **Packages and imports.** `@vynxlabs/*` to `@volvel/*` in every `package.json` (15 names, 44 dependency lines), 294 source files, root scripts' `--filter` arguments, `Dockerfile:27`, `deploy/image/*`, `deploy/worker/compose.yaml`. Root package becomes `volvel`.
- **CLI.** Binary `volvel` (`packages/cli/package.json` `bin`, usage text in `cli.ts`). Settings in `~/.config/volvel/`. Worker binaries `volvel-worker`, `volvel-worker-host`; image script `volvel-start`.
- **Environment.** `PLATFORM_URL`, `PLATFORM_TOKEN`, `PLATFORM_WORKER_*`, `PLATFORM_IMAGE`, `PLATFORM_ADMIN_*`, `PLATFORM_EMAIL/PASSWORD` become `VOLVEL_*`. `OTEL_SERVICE_NAME` defaults become `volvel` and `volvel-worker`.
- **Tenant repositories.** `vynxlabs.yaml` becomes `volvel.yaml` (`packages/manifest/src/files.ts:541`). The `platform/` folder stays.
- **Markers and wire names.** `Symbol.for("volvel.definitions")`, `__volvelResource`, export format `volvel-tenant-export`, header `Volvel-Resource-Moved`, flow clipboard marker, the `"@volvel/sdk"` specifier in console starter templates, the compose lockdown and Monaco's virtual module. Old spellings are not accepted.
- **Names people see.** `DEFAULT_PRODUCT_NAME` (`routes/branding.ts:14`) and the console fallback (`kit/brand.tsx:13`) become "Volvel". Better Auth `appName`, the SSO certificate common name, the OpenAPI title, Postgres `application_name` values.
- **Deploy files.** Compose project names, default image `volvel/volvel:local`, Keycloak dev client id, CI image tag, `deploy/fly/fly.toml` app name.
- **Prose.** README, CONTRIBUTING, CHANGELOG, `docs/sdk-guide.md`, `docs/self-hosting.md`, the spec's title and product mentions, the examples. "Vynxlabs" stays where it means the company (the spec's licensing and operator passages), judged line by line. Past phase docs are a record and are left as written.
- **Left alone:** the `vx` prefixes (database schema, cookies, CSS tokens, localStorage keys, DNS challenge), the `platform/` folder, the database/user/bucket name `platform`.
- **Not done by the agent:** renaming the GitHub repository and the local folder, creating the new Fly app, and destroying the old one. Those are the owner's.

Tests: the whole suite passes; a test fails if `vynxlabs` appears anywhere outside `docs/phases/`, `docs/evolution/`, `docs/uiux/`, the CHANGELOG's past sections and the company mentions on an allow-list.

### M2: `@volvel/markup`

`packages/markup`, no Volvel dependencies, runs in Node and the browser.

- **Parse.** One markdown-it configuration: CommonMark, tables, strikethrough, task lists, heading anchors from one slug function, one generic directive plugin (`:inline[]{}`, `::leaf{}`, `:::container`). `html: false` for everyone. Links: http(s), mailto, relative, in-docs. Images: relative (repository) and https.
- **DocTree.** A JSON tree with source lines, built from the token stream. It is what is stored, shipped and rendered.
- **Registry.** Each component: name, kind (inline, leaf, container), a JSON Schema for props, allowed children, allowed profiles.
- **Components:** `alert`, `term`, `field`, `steps`, `tabs`/`tab`, `details`, `kbd`, `product`, `screenshot`, `code-tabs`, `file-tree`.
- **Profiles:** `product`, `docs`, `description`, `short`, and `result` (what `ResultView` shows today).
- **Validate.** Errors with line and column for unknown components, bad props, components outside the profile, bad links.
- **Renderers.** `react` with an injectable component map; `html`, escaped and script-free, with one small enhancement script file; `text`.
- Dependencies pass `scripts/check-licenses.mjs` (markdown-it and its plugins are MIT).

Tests: parse and tree round trips; each component's props; each profile; the link policy refuses `javascript:` and raw HTML; golden files for React and HTML output from the same fixtures.

### M3: `@volvel/docs-engine`

`packages/docs-engine`, depends only on markup.

- Frontmatter schema (JSON Schema): `title`, `description`, `order`, `topic`, `terms`, `about`, `extends`, `since`.
- Doc set from `(path, frontmatter, tree)` entries: collections, the Uncategorized collection, groups, order, the depth cap, `index.md`, `x.md` beside `x/` refused.
- Topic index, term registry, attachments, extensions.
- Layering: product first, then the tenant layers the caller may see. Product term ids are reserved.
- Link check across a set: links, anchors, topics, terms, attachments, with path and line.
- Search index over the text renderer's output (MiniSearch, MIT, subject to the licence check).
- Package output: `manifest.json`, one tree per page, the index.

Tests: folder edge cases, ordering, collisions, broken links, layer resolution.

### M4: the kit

In `packages/ui`, so the console and the interface runtime (`packages/screens/runtime`) both get them.

- `Toggletip` on `Popover`. `Term` (underlined, opens with Enter or Space, closes with Escape, focus returns, "Learn more"). A `TermScope` context that underlines only the first use per screen.
- `Details` and `Tree` (with `role="tree"` and arrow keys).
- The markup React component map, mapping `alert` to `Notice`, `tabs` to `Tabs`, `kbd` to `Kbd`.
- `Markdown.tsx` becomes a thin call into markup with the `result` profile. `ResultView` output is unchanged for what it supported.
- Each new component appears on `/instance/kit` (`screens/KitSheet.tsx`).

Tests: keyboard and focus for `Term` and `Tree`; `ResultView` fixtures render as before; axe on the kit sheet.

### M5: every console screen has help

- `packages/docs` (`@volvel/docs`): `content/<collection>/<group>/<page>.md`, a first skeleton with one page per topic (stubs are allowed; writing the real docs is out of scope), built artifacts from M3.
- `nav.ts`: `help` on every `Section`; `EDITORS` and the workbench lists become entries with `help`; `whereIs()` returns the topic.
- `useHelpTopic(id)`, a store in the pattern of `kit/current.ts`. Innermost wins: dialog over page over section.
- The help panel: docked from 1280px, overlay from 768px, full-screen below. It keeps its place when closed and reopened, follows navigation, and has "Open online" (`DOCS_URL`, default the public site).
- Opened by: a header button, "Help for this page" in the account menu, a palette action, `F1` (also inside Monaco), `⌘/` outside editors, and `?help=<topic>` through `useUrlParam`.
- `PageHeader`: every page with a topic gets the ⓘ; "Learn more" opens the panel.
- Product trees and index are copied into `apps/console/dist` and fetched per topic. Works with the network blocked.
- `pnpm docs:check`, added to the CI `check` job: a section, editor or workbench with no topic; a topic with no page; an orphan page; unknown terms; validation errors; broken links and anchors; a URL image in product docs; golden drift.
- Shortcut sheet and `kit/shortcuts.ts` list the new keys.

Tests: every nav entry resolves a topic; `F1` opens the panel at it; a dialog's topic overrides its page's; the panel is full-screen at phone width; e2e with egress blocked.

### M6: descriptions and terms

- `description` (max 500) on table columns, `binding`, `schedule`, `trigger` in `packages/manifest/src/kinds.ts`; `pnpm emit:schemas`; SDK `define*` types; console forms for them.
- `GET /tenants/:t/workspaces/:w/terms`: tenant terms, column and resource descriptions the caller may see. Tables and columns need `table:read` and `data:read`. Scripts and flows need the member's read permission, or for an end user the `run:write` / `flow_run:write` test from `kernel/apps/actions.ts`. A caller who may not see a resource is told nothing of it.
- Console: column headers show the column's description; resource pages show theirs; the Roles screen's native `title=` (`Roles.tsx:212`) becomes toggletips.
- Automatic underlining in labels only, as decided, with a preference to turn it off.
- `Term` works in the interface runtime through `packages/ui`, and `packages/app` gains a `terms()` call.
- `:term[status]{table=… column=…}` resolves against the same API.

Tests: the visibility matrix from the document's §18; nothing leaks to an end user without a binding.

### M7: the reference writes itself

Each generator writes to `packages/docs/generated/` (git-ignored). `pnpm docs:generate` runs them; `docs:check` fails on stale output.

- **Permissions** from `packages/manifest/src/permissions.ts`.
- **Kinds**, one page each from `platformKinds`, with a ratchet so description coverage never drops.
- **Config**: `loadConfig` reads a declarative table; the page renders from it; a test fails on an env var read outside it.
- **CLI**: a declarative command table replaces the `switch` in `cli.ts:914`; `--help` and the pages come from it.
- **Errors**: `ERROR_CODES` (code, status, title, topic); the scattered literals move onto it; a test fails on an unregistered code. Error toasts (`ask.tsx` `notify.error`) get "What does this mean?".
- **API**: `openapi.json` written from the running app in the test harness (`startTestApp`), with `x-access` on each route.
- **Doc kind and components**: the frontmatter schema and the registry rendered as pages.
- A generated descriptions module for the console; toggletips on hand-written resource forms.

### M8: a page is a resource, and a folder of pages is a docs app

- **Kind `doc`** in `kinds.ts`: body is frontmatter plus `source`, capped at `MAX_SOURCE_LENGTH`. Validation hook runs markup's `docs` profile and the engine's set checks at deploy; errors fail the deploy, warnings are shown. Added to both `KIND_ORDER` lists (and `dashboard` with it), `READ` in `routes/search.ts`, the emitted schemas.
- **Permissions** `doc:read`, `doc:write` in `permissions.ts`.
- **File form.** `packages/manifest/src/files.ts` reads and writes a doc as `<path>.md` with YAML frontmatter under a docs root named in `volvel.yaml` (`platform/docs` when it names none). Git sync push and pull, CLI build, export and clone get it from there. The round trip is byte-for-byte.
- **Images.** Relative image paths are collected at build, stored through the app asset store, and rewritten at render. https images pass through.
- **`app.docs`**: third mode beside `entry` and `interface`, exactly one of the three; overlapping prefixes refused.
- **Serving** in `kernel/apps/front.ts`: server-rendered with the `html` renderer and the page shell pattern of `kernel/apps/pages.ts`, themed by `resolveTheme`; collection selector, group nav, in-page contents; works without JavaScript. Policy: `script-src 'self'`, `img-src 'self' https:`. Existing bindings, `app:read` and `limit.ts` apply unchanged.
- **Search**: one index per docs app built at deploy; served only to those who may open the app.
- **Renames**: a doc alias answers 308 for 90 days.
- **Cache**: rendered pages and indexes per deployed version.
- SDK: `defineApp({ docs })`.

Tests: access for `anonymous`, `end_users`, groups; deploy fails on a bad page; rename redirects; file round trip; export and clone carry docs.

### M9: docs in the console

- A **Docs** section under the Build area in `nav.ts`.
- **Tree** by docs app, with collection and group levels; create page or folder, rename and move (existing rename), delete (`ask.typeToConfirm`).
- **Reader**: the React renderer inside the shell.
- **Editor** for UI-managed pages; code-managed pages are read-only and name their file:
  - `CodeEditor` gains `"markdown"` in its language type and a way to set markers (today it can only read them);
  - live preview from the same parse the server uses, side by side in `SplitPane`, stacked on narrow screens;
  - validation as you type, shown as Monaco markers and a problems list;
  - saves through `saveDraft`, always with `revision`; a conflict is shown, never overwritten;
  - `useNavigationGuard` and `SaveBar` for unsaved changes.
- **`doc:write`**: the narrow-write table in `routes/authoring.ts` covering interface and doc; deploy limited to doc paths.
- **Preview**: a dev workspace's docs app, drafts included, at its app address for signed-in members with `doc:read` only, whatever the app's bindings say.
- `GET …/docs/search?q=` for the palette, filtered on the server.

Tests: two editors on one page conflict; the preview matches the served page; a member with only `doc:write` can deploy a page and nothing else; a non-member cannot reach the preview.

### M10: tenant pages join the help

- `about:` pages listed on the resource's screen and object page, for callers who may open the docs app.
- `extends:` pages listed under "From your team" in the help panel for that topic.
- `topic:` on tenant pages; `packages/app` and the interface runtime can open a help panel at a tenant topic.
- Tenant terms from `terms:` frontmatter served by `/terms`. A clash with a product term id, or between two docs apps in one workspace, fails the deploy.
- A forbidden or missing `term`, `about` or link renders as plain text for readers.

### M11: the packages and the CLI can be published

- `markup`, `docs-engine`, `docs`, `sdk`, `cli` lose `"private": true` and gain `publishConfig`, `files`, `exports`. The CLI's build bundles `manifest` and `compose`.
- `.github/workflows/release.yml`: on `v*` tags build, generate docs, version, publish to npm with `latest`, push the image to the `volvel` Docker organisation. Pushes to `main` publish `x.y.z-next.<sha>` as `next`.
- **Dry run only in this phase**: `npm pack` every published package, install the packed CLI in a clean folder and run `volvel --help`. The first real publish waits for the owner's word and the npm and Docker tokens.
- The site's dispatch step is written but switched off until the site repository exists.

### M12: example, guides, changelog, walk-through

- `examples/fernhill` gets a handbook docs app, column descriptions, terms, one `about` and one `extends` page.
- `docs/sdk-guide.md` and `docs/self-hosting.md` cover docs, `DOCS_URL` and the `volvel` CLI.
- CHANGELOG section for phase 20, for operators and for tenant developers.
- Playwright script that writes `screenshot` assets.
- Walk-through on the rebuilt test instance, with the owner.

## Where this meets the master spec

| Where | Says now | Would say |
|---|---|---|
| Title and product mentions | "Vynxlabs platform" | "Volvel". Vynxlabs remains the company. |
| Open questions | "Choose a product name…" unticked | Chosen: Volvel. Trademark check still open. |
| Deferred | "Visual editing of flows, and UI-managed resources in general." | "Visual editing of flows." Console-managed resources have existed since phase 7. |
| Initial resource kinds | The list, and "Adding a kind must not require changes to permissions, audit or sync." | Adds `doc`. States that `doc` has its own permission kind and a Markdown file form, and why. |
| Apps | `entry` or `interface` | `entry`, `interface` or `docs`. |
| Core concepts | No docs terms | Doc, docs app, collection, topic, term. |
| Files open question | "Decide whether files need an owner…" | Unchanged. Docs images come from the repository or a URL until it is decided. |
| Principle 6 | Runs offline | Notes the one allowance: an author may link an image by URL in tenant docs. |

## To check before building (M0)

- Whether a resource path is unique across kinds or per kind, since a folder's `index.md` would take the folder's path and an app may sit at the same one.
- Where the console's "own folder" for UI-managed files is in git sync, and that a `.md` there round-trips.
- That markdown-it, its directive plugin and MiniSearch pass `check:licenses`, and the size they add to the console bundle.
- That Monaco's Markdown highlighting chunk is enough, with no language service.
- How `resolveTheme` output can style a full docs layout, not only the portal's single column.
- Whether the interface runtime's bundle can take markup without a large size cost.

## Tests

- **Each milestone:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:schemas`, `pnpm check:migrations`, `pnpm check:licenses`, and from M5 `pnpm docs:check`.
- **End to end (`pnpm e2e`):**
  - Data, Tables, `F1` shows the tables page and a "From your team" page;
  - a term popover opens by keyboard;
  - the panel is full-screen at phone width;
  - create a page in the console, save, deploy, open it in a public docs app signed out;
  - a dev workspace draft is visible at the preview address to a member and refused to anyone else;
  - help works with network egress blocked.
- **Rename:** the name test in M1; `volvel --help` from a packed install; the compose stack comes up from scratch with the new names.
- **Release dry run:** `npm pack` for all published packages.
- **By hand, with the owner:** the M12 walk-through on the rebuilt test instance.

## Findings

### Milestone 0

- **A path belongs to one resource in a workspace, whatever its kind** (`packages/db/migrations/0004_resources.sql:14`). The architecture gives a folder's `index.md` the folder's own path. An app `handbook` with `docs: handbook` is the natural thing to write, and its home page would then want the app's path. So a folder's page keeps `index` as the last part of its path (`handbook/index`), and only its address drops it. The file and the path still match one for one.
- **Resource files are found by name, `<name>.<kind>.yaml`, under the roots a repository names**, and the console writes to `platform/`. A plain `.md` has no kind in its name, and a `README.md` in a root must not become a page. So docs have roots of their own: `docs:` in `volvel.yaml`, a list of folders, and `platform/docs` when it says nothing. The console writes pages there.
- **Licences pass**: markdown-it and markdown-it-directive are MIT, markdown-it-task-lists and `yaml` ISC, markdown-it-anchor Unlicense, MiniSearch MIT. All are on the shipped allow-list in `scripts/check-licenses.mjs`.
- **Monaco's Markdown highlighting is already built** as its own chunk in `apps/console/dist/assets`. `CodeEditor`'s `language` type leaves it out. There is no language service, and none is needed: the problems come from the markup package.
- **A theme is tokens only** (`resolveTheme`). The docs layout needs a stylesheet of its own over those tokens, as the portal has `PORTAL_CSS`.
- **Not checked yet:** what markup adds to the console's and the interface runtime's bundles. Measured in M4, when there is something to measure.
- The master spec was changed first, as it asks: the name, the `doc` kind and its two exceptions, docs apps, the five new terms, the stale deferred line, and the allowance for an image by URL.
