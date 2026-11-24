# Documentation style guide

Every writer of the product's documentation (`packages/docs/content`) follows this. It was written for phase 31, M0. Where it disagrees with the code, the code wins and this guide is corrected.

The mechanics are in `packages/docs-engine/src/diataxis.ts` (types, lints, templates), `packages/markup/src/registry.ts` (components) and `packages/docs/check.mjs` (what `pnpm docs:check` refuses). The decisions on words are in `docs/documentation/decisions.md` (D54 and others) and `docs/polish/polish-prevention-rules.md` (POLISH-009).

## 1. Voice

- **Plain, direct, second person, present tense.** "Press **Deploy**. The run starts." Not "The user should then press...".
- **Short sentences.** One idea each. Put the condition first: "If the workspace is in production, ...".
- **American spelling:** color, canceled, gray, behavior. A stored value keeps its own spelling: the status `cancelled` is written in code style, and the word for it is "canceled".
- **The product's words, exactly as the screen shows them.** Copy a label from the code (`apps/console/src`), not from memory or a screenshot. Write a control's label in bold, with the screen's capitals: **Deploy this version**, **Add to page**. Sentence case for everything else.
- **No marketing.** Do not write easily, simply, just, powerful, seamless, robust, "out of the box". Do not call the product a "platform": say Volvel when you mean the product, "the instance" when you mean the running thing.
- **Say what is not there.** If a reader would look for a thing the product does not do, say so in one sentence and, if there is one, give the way round. ("A file cannot be added in a form. Add it to the row in the table.")
- **Say who may, and what is missing.** A step that can be refused names the permission or role that allows it: "You need `flow:write`. A workspace admin has it."
- **Do not promise.** Avoid "cannot", "never", "always" and "only from the CLI" unless the code enforces it and the fact-check record cites where. No sentence a later phase would make false.
- **Numbers and units:** write the limit, with its unit and where it comes from ("a session lasts 7 days"). Never "a few" or "quickly".
- **Code words:** file names, commands, keys, status values, permissions and paths are in code style. Names of screens, buttons and fields are in bold. Names of things the reader makes (a table called Invoices) are plain, or in quotation marks when a sentence needs them set off.

Wrong and right:

| Wrong | Right |
| --- | --- |
| Simply click Activate to release your workflow. | Press **Deploy this version**. The flow runs on the new version from the next run. |
| The platform sandboxes your job. | A script runs on a worker. |
| You cannot do this from the console. | The console has no screen for this. Use `volvel deploy`. |

## 2. Terminology

Use the left column. Do not use the right, except in a quotation of an old name, a stored value or a command that keeps it, and then say so.

| Say | Do not say | Notes |
| --- | --- | --- |
| instance | platform, server, install | The running Volvel, run by an operator. |
| operator, operator admin | superuser, root | The organization that runs an instance, and its people. |
| tenant | customer, account, org | One team's space on an instance. |
| workspace | environment, stage | A tenant's dev or production workspace. Say "dev workspace" and "production workspace". |
| flow | workflow, automation | The visual flow editor and its runs. A lint fails "workflow" in console strings. |
| script | job, function | Code a worker runs. Never "sandboxed". |
| run | execution, job | One execution of a script or flow. "Flow run" where the difference matters. |
| trigger | starter (except the editor's own word) | A schedule, webhook, form, event or poll that starts a run. |
| table | custom table, database table | A workspace table. |
| data source | database connection | An external Postgres a workspace reads. |
| connection | integration | A connector plus its settings. States as the screen shows: **Set up here**, **Not set up here**, **Reached**, **Failed**, **Not tested**. |
| app | screen, interface (as the thing served), Published apps | The nav item and page are **Apps**; **App Builder** is the editor. "Interface" names only the kind of app a page renders. |
| page, widget, Section, Tabs | panel, component | Capitalized as the builder shows. |
| dashboard, query | report | |
| Deploy (dev workspace), Versions (production) | Release, Activate, Publish for deploying | The screen is **Deploy** in dev and **Versions** in production. The buttons are **Deploy this version** and **Roll back to this version**. **Publish** is only the App Builder's and the docs editor's button. |
| promote | release to production | Sends the same version to the linked workspace. |
| version | release, build | The number the screen shows. "Release" is left only for Git's release branch and the API's `release` field. |
| access change | access release, release for access | A change to a tenant's access, from files or by approval. The tab is **Access changes**. The commands `volvel tenant plan`, `volvel tenant release` and `volvel tenant pull` keep their names. |
| approval | sign-off | A flow step that waits for a person. An access change also waits for approval. |
| member | user (alone) | A person in a tenant. Say "end user", "guest" and "service account" for the others. |
| end user, end-user group | customer, client | Someone who uses an app and does not run the tenant. |
| role, permission, binding | right, privilege, grant (as a noun) | A role is a set of permissions; a binding gives a role to a person, group or service account. |
| canceled | cancelled | American spelling. Only the stored value is `cancelled`. |
| Volvel | the old product names, `platform deploy`, the old yaml file, the old npm scope | Names from before phase 20 are gone. |

**Roles and permissions.** Name a role as the console shows it ("Tenant admin", "Doc writer") and give the permission when the page is about what is allowed: "Needs `flow:write`." A permission is always in code style and written as in the generated permissions reference. Link the first mention to the permissions reference. Do not list a role's whole set on a how-to: link to it.

**Instance, tenant, workspace, in a sentence.** The instance holds tenants. A tenant holds workspaces, members and groups. A workspace holds the resources: scripts, flows, tables, queries, apps. Do not say "your instance" for a hosted one; there is none (see section 6).

**Product terms and glossary.** The first time a page uses a defined term, write `:term[workspace]{id=volvel-workspace}`. A new term or help topic id starts `volvel-` (phase 30 M4); `names.lock` forbids removing one that was released.

## 3. The four page types

A page's type is its own `type:` or, if it has none, the `type:` of the nearest folder index above. Put `type:` on the folder's `index.md` and leave it off the pages. The index is a landing page: it has no type and no lints, and it lists its pages in `pages:` (the check fails a page the folder's `pages:` leaves out).

### Frontmatter

```yaml
---
title: Connect a table to a flow
description: One or two sentences on what the page is for. Shown in navigation and search.
subjects: [flows, tables]
topic: volvel-connect-table      # only when the console's F1 or a link opens it
since: "0.5"                     # the version that brought what the page describes
moved_from:
  - build/connect-table          # the path it had, without .md
---
```

- `title` (required, 120 characters at most). A tutorial's and how-to's title says what the reader does: "Connect a table to a flow". It does not start with About, Overview, Introduction, Understanding, What is, Why, and does not end in "?" (lint `type_title`).
- `description`: one or two sentences, 500 characters at most.
- `type`: on the folder index only. A page may say its own (it then needs the folder to say a type too, or `type_folder` fires).
- `subjects`: up to five short ids, the same words on every page about the thing. Use a subject on at least two pages, of different types, or the lint `subject_once` fires. Subjects are how Related blocks are built, so choose the ones a reader would look for. Do not use more than five (`subjects_many`).
- `topic`: only when the console opens the page (the `help` button, F1) or other pages link by topic. It never changes when the page moves. A topic that a released version had is never taken away. New ones start `volvel-`.
- `date`: only on a changelog entry (a page in a folder named `changelog`): the day it is about, as `YYYY-MM-DD` and a day on the calendar. Without it the entry takes a day that begins or ends its file name, else the day it last changed. Volvel's own entries are generated from `CHANGELOG.md` and are not written by hand.
- `since`: for the product's own pages, the version that brought what the page describes, as `0.5` or `0.5.1`. Leave it off before the first publish date is set (D62) unless you know.
- `moved_from`: when you move or rename a page, list its old path. `paths.lock` makes every released path resolve or redirect.
- `pages:` and `icon:` only on a folder index.

### Tutorial

A learning journey with a known result. The reader follows; they are not expected to understand yet.

- Runs on **Fernhill**, except the quickstart, which starts from an empty tenant. One path, no options, no digressions: link out to explanation.
- Open with one sentence of what the reader will have at the end ("You will have a flow that waits for an approval, and you will have decided it.") and the time it takes.
- **Before you start:** exactly what must exist (the instance, who you sign in as, which workspace).
- Numbered steps in a `:::steps` block. Each step is one action and says what the reader sees when it worked ("The run shows **Succeeded**.").
- End with **What you built** (what now exists, where it is on screen) and one or two links on.
- Do not explain why. Do not give choices. If a step can fail, give the one fix.

### How-to

A goal the reader already has.

- Start with a heading that says the goal, then one sentence on the result. (`type_goal_missing` wants a heading.)
- **Before you start:** permissions (`flow:write`), the workspace kind, anything that must exist.
- Steps in `:::steps`. Name the screen, then the control, in bold. Alternatives (console, CLI, API) go in `tabs`, not in prose.
- **The result:** what is true now and where the reader sees it.
- **If it does not work:** the failures a reader will meet, each with its cause and the fix; the refusal text as the console words it, in quotation marks.
- No teaching. Link to explanation and reference.

### Reference

Exact, complete and scannable, to look things up in.

- One screen, one resource kind, one command group or one API tag per page. A long list is a table, not paragraphs.
- No numbered steps (`type_steps_present`). No opinions and no history.
- A **screen page** (the pages under `console/reference/screens`, `administer/reference/screens`, `self-host/reference/console`) lists every control on the screen, every state, and the permission each action needs: what it is for, as the screen words it; the states of the list and of an empty or failed screen; the permissions in a table (**Action**, **Needs**); where it is reached from; its `topic`. Check it against the component, and against the screen in a browser.
- Fixed order, the same on every page of its kind: what it is, **Controls**, **States**, **Permissions**, **Related**.
- Generated reference (`packages/docs/generated`) is not written by hand. To change it, change the code's description, and `pnpm docs:generate`.

### Explanation

Why and how it works, in prose, with the ideas in order.

- No steps. If the reader must do something, link to the how-to.
- Say what is decided and what is left to others ("Volvel does not run your scripts in a container each. It gives each worker a user of its own").
- Diagrams in Mermaid code fences when a picture shows the mechanism better than words.
- A limit or guarantee is stated only if the code holds it, and the record cites where.

### Templates

The editor's "new page" row starts a page from `DOC_TEMPLATES` in `packages/docs-engine/src/diataxis.ts`. A page begins from its type's template, filled in; the headings below are the ones to keep.

| Type | Headings, in order |
| --- | --- |
| tutorial | opening sentence (what you will have, how long) / **Before you start** / `:::steps` / **What you built** |
| how-to | **<goal heading>** + result sentence / **Before you start** / `:::steps` / **The result** / **If it does not work** |
| reference | what it is (a sentence) / **Controls** or **Fields** (table) / **States** / **Permissions** |
| explanation | opening paragraph / **The idea** / **How it fits** (and as many more as the ideas need) |

The templates in `DOC_TEMPLATES` match the tutorial, reference and explanation rows. The how-to template has only **Goal**, steps and **If it does not work**: it lacks **Before you start** and **The result**, and it names the goal heading "Goal" where this guide wants the goal itself as the heading. See "What needs a change" at the end.

### Files, folders and names

Five collections, each a folder under `packages/docs/content`: `start`, `console`, `develop`, `administer`, `self-host`. Under each:

```
<collection>/
  index.md                    landing page: pages: [...], icon
  tutorials/index.md          type: tutorial
  how-to/index.md             type: how-to        (console: area folders: build/, operate/, data/, configure/)
  reference/index.md          type: reference     (screen pages under reference/screens/<area>/)
  explanation/index.md        type: explanation
```

- A folder is lower-case, hyphened, and a noun for what is in it. A collection need not have all four type folders (`start` is mostly tutorials and has `explanation/` for concepts).
- A file name is lower-case with hyphens, the same words as the title without the verb stem where it helps: `how-to/data/connect-a-table.md` for "Connect a table to a flow". It matches `^[a-z0-9][a-z0-9_-]*$` and never changes after release: move with `moved_from`.
- A tutorial's file name is its result ("approval-flow"). A how-to's is its action ("roll-back-a-version"). A reference page's is the thing ("flow-editor", "deploy"). An explanation's is the idea ("how-access-works").
- A page is listed in its folder's `pages:`, in the order a reader should meet it; a folder in its parent's.
- A page goes in the collection of its reader: `start` for first contact, `console` for people using the screens, `develop` for people writing code or calling the API, `administer` for tenant admins, `self-host` for operators of an instance.

## 4. Components

A product page may use the components of the `product` profile. Write them as the registry gives them (`packages/markup/src/registry.ts`).

| Component | When | Example |
| --- | --- | --- |
| `:term[...]{id=}` | The first use of a defined term on a page. For a resource: `{table=invoices column=paid_at}` (also script, flow, app, connection, query). Not in headings. | `:term[workspace]{id=volvel-workspace}` |
| `::field{path=}` | A field of a resource kind, with the kind's own description, in reference pages: never retype it. | `::field{path=table.columns.*.type}` |
| `::screenshot{name= alt=}` | A screen the reader must recognize. One per screen at most, after the sentence that says what it shows. | `::screenshot{name=console/page-editor alt="The page editor with the preview beside it"}` |
| `:::steps` | Tutorial and how-to steps. A numbered list also counts for the lint; a `:::steps` block is preferred. | |
| `:::tabs` with `::::tab{label=}` | Console, CLI and API ways to do one thing. Not for order. | |
| `:::alert[Title]{type=}` | `info`, `success`, `warning`, `danger`. One per section at most. Use for what a reader would lose by skipping it: a data loss, a permission, "this is not security". | |
| `:::details{summary=}` | A long detail most readers skip. | |
| `:kbd[...]` | Keys: `:kbd[⌘↵]`. | |
| `:::code-tabs` | The same code in several languages. | |
| `:::file-tree` | A repository's layout. | |
| `::changelog{limit folder subject}` | A page that lists the newest entries of the site's changelog, each with its date and body: `limit` 1 to 50 (10 when left out), `folder` and `subject` narrow it. In the product's pages only `start/reference/whats-new` uses it. | `::changelog{limit=3 folder=start/reference/changelog}` |
| `::pages` | A folder index with nothing to say beyond its list. | |
| `::glossary` | The glossary page only. | |

Rules:

- A **screenshot** names a shot in `packages/docs/screenshots.mjs`. Adding one means adding it to that manifest first, with the scene, who is signed in and what is masked; `pnpm docs:check` fails a name the manifest does not list. At most 60 shots in all, so use one only where the words need the picture. The `alt` says what the picture shows. Never rely on a picture for a fact: the words say it.
- **Code fences** say a language from the list: `ts`/`typescript`, `tsx`, `js`/`javascript`, `jsx`, `json`, `yaml`, `bash` (also `sh`), `sql`, `html`/`xml`, `css`, `diff`, `markdown`. A command the reader types is in a `bash` fence, with `$` left off. A file has `title=`. Output is a `text` fence. A change to a file is a `diff-ts` fence (added and removed lines drawn in TypeScript). To draw attention to a line, mark it: `ts/3-5`. Mark only the lines the text talks about.
- **Links** are relative and go to pages by path, without `.md`: `[Flows](../how-to/build/connect-a-table)`. To point at a page that may move, link by topic: `[Approvals](topic:volvel-approvals)`. Link a term's first use, not every use. External links go only to what is not ours; never to a page that needs a sign-in. A link text says where it goes ("the permissions reference"), never "here".
- **Headings:** `#` is the page's title and is not written (the title is in frontmatter); sections start at `##`. Do not skip a level. Sentence case. Every heading gets a `#` anchor link to itself, drawn by the site (shown on hover or focus, copies the address), and "On this page" lists the `##` and `###` headings: do not write an anchor link or a heading id by hand, and link to a heading with `[words](page#heading-text)` as the check resolves it. A heading deeper than `###` is not in "On this page", so a page that needs to be found by it should not rely on `####`.
- **Lists:** a list of three or more parallel things is a list. A comparison of a property across things is a table. Do not use a table for one column.

## 5. Examples and data

- **Fernhill** (`examples/fernhill`) is the running example: a veterinary group with three clinics (Northside, Riverside, Hilltop), a production workspace `clinics` and a dev workspace `sandbox`, the tables `appointments` and `invoices`, the groups Practice managers and Billing, the end-user groups of the front desk and Pet portal clients, and its people: Maya Brooks (tenant admin), Rowan Ellis (practice manager), Devi Shah (billing, developer), Jess Morgan, Sam Reyes (doc writer). Use these names and workspaces consistently across pages. Read `examples/fernhill/README.md` and `src/model.ts` for what exists; do not invent a table or a flow Fernhill does not have, and do not use a step that Fernhill's seed does not make possible.
- **higher-ed-devices** (`examples/higher-ed-devices`) is for pages that start from a repository: `volvel.yaml`, TypeScript resources, `tenant/` access, a flow with approval, `volvel deploy` and `promote`. It does not create its own tenant, so say what the reader must make first.
- **An empty tenant** is the start of the quickstart and of every page that is about first use.
- **`acme`** gives short snippets only. It is not a tutorial.
- Code in a page runs: it is checked against the SDK and was run on the instance the walk uses.
- **Never real personal data.** Use the example's people, `example.com` addresses and made-up numbers. **Never the owner's name or company**, in a page, a path, a sample address or a screenshot. Names of tools of ours are Volvel's. Passwords on a page are only the seeded demo ones, and only on a page that is about the seeded example.
- Dates: the clock of the screenshots is fixed (`CLOCK` in `screenshots.mjs`); do not write "today" for a date that matters, and write a time with its zone.

## 6. What not to describe

- **Internals** a reader cannot act on: table names, queue mechanics, class names, the file a function is in. The exception is when a reader would be surprised or hurt without it (for example "file-owned resources are read-only in the console").
- **Anything unreleased or not built.** `docs/documentation/inventory/tutorials-and-style.md` section 5 lists what is not shipped: developer-written widgets, MFA, languages other than TypeScript, hosted Volvel, npm and Docker publication (the first publish date is not set), CSV import, and others. Do not write that it exists or "will". Where a reader would expect it, say in one sentence that it is not there.
- **Anything the code does not do.** If you cannot find the line that does it, you do not write it. Do not describe from the master spec, from an old phase document, from `docs/evolution/` (before phase 9), or from memory. Use the code, the generated reference and `CHANGELOG.md`.
- **Our promises** such as uptime, performance or support commitments.
- **A fix for a bug.** If the product does the wrong thing, report it in `docs/documentation/findings`; do not document around it.

### The fact-check record

Every page has a record, at `docs/documentation/factcheck/<collection>/<page>.md` (the page's path under the collection, with `.md`). It is a table, one row per claim a reader could act on:

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A session lasts 7 days. | `apps/control-plane/src/auth/session.ts:41` | second agent, 2026-11-24 | holds |

A claim is a label, a limit, a default, a permission, a state, a command or flag, a refusal text, or a sequence. The source is a line in the code, a test that asserts it, or the generated reference; the line is current at the commit named at the top of the record. A page with no record is not finished.

## 7. How a page is made

1. **The writer** reads the code and the screen, then writes the page from this guide and the type's template. The writer fills the first column and the source of the record.
2. **A second agent**, who did not write the page, checks every label, limit, permission and command against the code, and the page against this guide. The second agent writes "checked by" and the result in the record, and gives each claim that does not hold back to the writer. A page does not pass with an open claim.
3. **Tutorials and how-tos are executed**: every step run, in order, on a throwaway instance seeded by `examples/fernhill/setup/setup.mjs` (never the owner's own or the live test instance), at the width a person would use, by the person the page says is signed in. A run log goes to `docs/documentation/runs/<page>.md`: the instance and commit, the steps as followed, what was seen at each, and what the page got wrong. The page is corrected to what happened and run again until a run has no change. A run that could not be done is said there, and the page is not presented as finished.
4. **Reference screen pages** are walked in a browser: every control and state is on the page, and no page has a control the screen lacks.
5. **Then the check:** `pnpm docs:check` and the docs build. A new warning is not added to `lint-allow.json`; it is fixed. The page is listed in its folder's `pages:`.
6. The commit message says which pages and starts with the phase and milestone.

## What needs a change (found while writing this guide)

- **`DOC_TEMPLATES`, how-to:** add **Before you start** and **The result**, and head it with the goal as the page's `##` heading instead of "Goal". The tutorial template has **What you built** at the end but no opening line for the time and the result; it should say it.
- **Tutorial template, where the check differs:** `type_steps_missing` accepts a numbered list or a `:::steps` block; this guide asks for `:::steps`. No change needed, but the check cannot tell them apart.
- **`check.mjs`:** it enforces neither American spelling, nor the avoided words (workflow, Activate, "access release", "Published apps", cancelled) in `packages/docs/content`, nor the existence of a fact-check record or a run log for a page. The terminology table is held by review until a lint is added (`enforce.test.ts` holds spelling only for console strings).
- **`screenshot` is in the `product` profile only**, so a tenant's docs site cannot use it. That is intended, and this guide is for the product's pages.

## Changelog pages (phase 33)

- A page in any folder named `changelog`, or with the subject `changelog`, is an entry of the site's changelog, listed by `::changelog` and in the feed `changelog.xml`. Never give a product page the subject `changelog` unless it is an entry: it would appear in Volvel's own "What's new" and its feed.
- A how-to that describes a tenant's changelog uses the subjects `documentation` and `sites`.
