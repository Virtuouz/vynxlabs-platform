# Inventory: docs system

Read from the code at `270e509` on 2026-11-22. A report, not checked prose.

**Refreshed 2026-11-23** against the phase 29 branch (`4992c9da`). What changed in this brief:
- Section A is now typed (Diátaxis) and given a collection, and lists the pages phase 30 will add as "to be written after phase 30 M3 / M8". Describe only what exists now as true; the rows marked "after phase 30" are not in the product yet.
- Corrected claims: the draft-conflict banner and its buttons; "Draft" mark and "To be removed"; limit notes on titles; the console screen is gated by `resource:write` or `doc:write` alone; the doc writer is no longer the only non-developer role with `doc:*` (`workspace_admin` has it, D57); `since` is now drawn; the help panel's search shows places on a page; `docs:check` staleness is real; the console help `immutable` header and the `/help` 404 are fixed; `Doc` forwards every option; `glossary` is in the insert menu; the `feedback` kind text lists six columns; a page's term or topic that the product owns is reported on the screen and in previews.
- Section E is settled with the fix cited. What is still open is marked.
- Not verified: the size and quality figures of the generated pages (`api`: 443 routes; `kinds`: 576 fields) come from the local `packages/docs/generated/` and `dist/` of 2026-11-22, not a fresh `pnpm docs:generate` (needs Postgres); `docs:check` itself was run: 102 pages, 57 topics, 248 of 576 fields (43.1%). Whether a served site redirects an old page address (the console says it does, for 90 days) was not found in code, see the tree row. Walks were not run.
- Vocabulary for the writer: Flow, Deploy (dev) / Versions (production), "Deploy this version" / "Roll back to this version", Access changes, Apps (not Published apps), canceled, American spelling. `docs/sdk-guide.md` still says "authorisation" (line 258) and its alert wording is the product's: fix when quoting. Product pages still using the old words (`content/build/published-apps.md` title, "Releases" and "Activate" in `operate/`) are page content, listed in `fixed/voc-access.md` and `fixed/voc-state.md`.

## A. Pages for half 1 (Documentation for tenants)

Collection: **Console** unless stated (the screens), **Develop** (the repository: files, components, `volvel build`), **Administer** (who may). Types follow Diátaxis. Sources are file:line at the current code.

Stubs today: `content/build/documentation.md` (50 lines, updated in phase 29 for the switch, Keep, feedback table and doc writer) and `documentation-editor.md` (24). Proposed folder `build/documentation/`, keeping topics `build-docs` and `build-docs-editor`. A page cannot sit beside a folder of its own name (`file_and_folder`, set.ts:310), so `documentation.md` becomes `documentation/index.md`.

Paths: `K` = apps/control-plane/src/kernel, `D` = apps/console/src/screens/docs, `E` = packages/docs-engine/src, `M` = packages/markup/src.

| Page | Collection, type | Purpose | Sources |
| --- | --- | --- | --- |
| Overview: pages, folders, sites, drafts, deploy | Console, explanation | What a page, a folder, a collection and a site are; edit in dev workspaces only, production is read-only; a change is a draft until "Deploy N changes". | D/Docs.tsx:140-215, 560-600; docs-apps.test.ts |
| Write your first page | Get started, tutorial | New folder, New page, write, check problems, deploy, open the site. Needs a folder first ("A page goes in a folder. Make a folder first."). | Docs.tsx:566-590; DocEditor.tsx |
| Work with the tree of pages | Console, how-to | New folder/page, drag by the grip, rename (pencil or F2: title and file name together), Move to…, Duplicate (drops topic, terms and key; adds "(copy)"), Delete (type the name), filter ("Filter pages"), undo from the message, Keep this page. | Docs.tsx:440-540, 905-930, 1025-1110; E/ops.ts:340-527 (`planMove`, `planRename`, `planDuplicate`, `planDelete`) |
| Move, rename and delete a page | Console, how-to | The console says "Renaming the file moves its address. The old address leads to the new one for 90 days." (Docs.tsx:1074, 1277). The server's path-alias rule is the same 90 days for resources; no redirect for a docs page was found in K/apps/docs.ts, so say what the console says only after a walk. Title max 120, file name max 80, with a count shown past the limit. | Docs.tsx:1148-1215; E/ops.ts:43-78 |
| The page editor | Console, reference | Source / Split / Preview, `/` insert menu (every component the profile has except `product` and `screenshot`), problems listed by line, Ln/Col, Discard, Save (Ctrl or ⌘ S), "Compare with deployed", "Preview in the app" (the draft preview), Delete, Done/Close, file name and "Move…". Pencil changes the title. | D/DocEditor.tsx:229-300, 350-470, 513-660; kit/markdown/insert.ts:23-60 |
| Resolve a draft conflict | Console, how-to | "Someone else saved this page after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." Buttons "Copy what I wrote" and "Load their version" (asks "Load their version?", action "Load theirs"). A page drafted for removal shows "To be removed", a banner and "Keep this page"; its source is read-only until kept. | DocEditor.tsx:476-510; kit/DraftClash.tsx:24-66 |
| Describe a page: Page details | Console, reference | The side tab "Page details": Title, Topic, Description, Icon (folder index pages only), Terms (Term, Id, Also written, What it means), About (Kind, Path), "Add this page's notes to" (`extends`). It writes the page's own source; `pages`, `since` and `key` are typed in the source only. | D/PageDetails.tsx:10-284 |
| Frontmatter reference | Develop, reference | Generated (`reference/docs/frontmatter`); needs real examples and the rules (lengths, `since` pattern `^\d+\.\d+(\.\d+)?$`, terms max 50, aliases max 10, `about` and `extends` max 50 and 20). | E/schema.ts:36-160; generators/reference.mjs |
| Components reference | Develop, reference | One worked example each; the table below. Generated at `reference/docs/components`. | M/registry.ts:64-300 |
| Links, anchors, pictures | Develop, reference | Relative, `topic:`, `.md` optional, folder means index. Pictures are repository files only (a `https` picture is allowed on a tenant site and not shown offline); there is no upload in the console. | E/set.ts:145-190; cli/build.ts; K/apps/front.ts `serveDraftDocs` |
| Draw a diagram | Develop, how-to | A `mermaid` fence; zoom and move keys (+ − 0, arrows, ⌘/Ctrl and scroll); source shown without script. | apps/console/src/diagrams; docs/sdk-guide.md:334 |
| Publish a folder as a site | Console, how-to | Top-level folder only ("Publish as a site…"); address, title; "Stop publishing…" / "Publish again…"; "Remove the site's app…" (pages stay); who may open it (bindings, anonymous). A deploy shows "N changes" and says which feedback table goes with it. | Docs.tsx:337-420, 470-535, 905-985; E/workspace.ts:213-262 |
| Ask readers whether a page helped | Console, how-to | "Turn on page feedback…" makes `docs-feedback` once; "Turn off page feedback…" keeps the table and its answers. Columns `site_key, site, page, helpful, version, at`; one answer a page; nothing about who. | Docs.tsx:340-355, 700-760; E/workspace.ts:44-70; docs.ts `feedbackOf` |
| A served site | Console, reference | Home cards, collections switcher, breadcrumbs, contents list (`#` and `##` only), previous/next, "Copy as Markdown" (`<page>.md`), last updated, "New in version X" when `since` is set, ⌘K or `/` search, `_search` without script, policy. | K/apps/docs.ts:1086-1295 |
| Preview drafts | Console, how-to | `<site>/_draft/`: members with `doc:read` or `resource:read`; noindex; answers are not kept; pictures are the deployed ones. Built with the product's reserved names, as a deploy is. | K/apps/front.ts:1305-1380 |
| Deploy the documentation and conflicts | Console, how-to | "Deploy N changes?": "Readers see them at once. Nothing but documentation is deployed."; carries the feedback table; `draft_changed` is the conflict above. | Docs.tsx:187-212; D/model.ts:73-94 |
| Page names the product keeps | Console, reference | A page that takes a term or topic the product's own help has is named in a banner ("A page takes a term or a topic that the product's own help has, so a site leaves it out and a deploy is refused: …"); `issues` on `GET …/docs`. | Docs.tsx:597-603; routes/docs.ts:161-250; K/docs/product.ts:49-64 |
| The doc writer role | Administer, reference | `workspace:read, doc:*, table:read, app:read`. The Documentation screen needs `resource:write` or `doc:write` alone; with `doc:read` alone the screen reads. Writes pages, docs apps and exactly the feedback table. `workspace_admin` also has `doc:*` (D57). A viewer sees "You can see … not change it." | migrations/0081_doc_writer.sql; 0094:19-27; routes/authoring.ts:236-250; Docs.tsx:152-160; console/builtinRoles.ts:36 |
| Glossary and terms | Console, reference | Ids unique per workspace, aliases, `::glossary` (collection or `scope=site`), underlining in screens and the opt-out. `/terms` is filtered by what the caller may read. | routes/terms.ts:130-324; help/glossary.tsx |
| Attach pages to resources and to help | Console, how-to | `about` (6 kinds) lists the page on the resource's screen; `extends` adds "From your team" under a product help topic. | E/set.ts:384-440; HelpPanel.tsx:140, 275 |
| Help in apps | Develop, how-to | `pages.*.help`, `<HelpPanel topic>`, `useHelp`, `helpUrl`; draws nothing without access. Text widgets use the `page` profile. | packages/app/src/help.tsx:19-103; client.ts:524 |
| Documentation in the repository | Develop, how-to and reference | `platform/docs` or `volvel.yaml docs: [...]`, file names never changed, `key` when moving a file, `defineApp({docs})`, pictures, build refusals. `volvel.yaml` also takes `entry` and `resources` (flags win; git sync writes to `resources`, D65). | docs/sdk-guide.md:233-375 (best prose to reuse); cli/build.ts:240-250; manifest/src/files.ts:39-48 |
| Search a workspace's documentation | Develop, reference | `GET …/docs/search?q=` searches each site's index (AND, prefix and fuzzy matching; by section). No console screen calls it (grep of apps/console/src found none): the Documentation screen's own filter only filters titles. | routes/docs.ts:333-383; E/search.ts |
| API for documentation | Develop, reference | 3 docs routes plus `/terms`, all "Needs `resource:read`, or `doc:read` alone" (`/terms` answers per caller). | routes/docs.ts:161,290,333; routes/terms.ts:213; generated/api |
| Run a docs app locally with `volvel dev` | Develop, how-to | **After phase 30 M1b.** Not built: D64. Today `volvel dev` serves an app only; say docs apps are not drawn locally. | decisions D64; fixed/t3-cli-docs.md CLI-MP7 |

To be written after phase 30 (M3 and M8; none of it exists now, so do not describe it as true):
- Give a page a type and subjects (Diátaxis) in Page details, and make a new page from a type's template. Console, how-to. Source: the design, section 2 (`type`, `subjects`, `moved_from`).
- Diátaxis for tenants: the four types, what each page looks like. Console or Develop, explanation.
- The served site's eyebrow, type cards and related pages. Console, reference.
- Moved pages and their redirects (`moved_from`). Develop, reference.
- The static export of a site. Develop, how-to (M11).

Every component (form; props; profiles) (checked against M/registry.ts and `PROFILES`; unchanged):

| Component | Form and props | Profiles |
| --- | --- | --- |
| `alert` | container `[title]`, `type=info\|success\|warning\|danger` | product, docs, description, page |
| `term` | inline; `id`, or one of table/script/flow/app/connection/query, plus `column` with table | product, docs, description, page |
| `field` | leaf; `path` required (`table.columns.*.type`) | product, docs, page |
| `steps` | container, needs a list | product, docs, page |
| `tabs` / `tab` | containers; `tabs` holds only `tab`; `label` required, max 60 | product, docs, page |
| `details` | container; `summary` required, max 120 | product, docs, page |
| `kbd` | inline | product, docs, page |
| `code-tabs` | container of fences; tab name from `title=` | product, docs, page |
| `file-tree` | container, needs a list | product, docs, page |
| `product` | inline `:product[]` | product only |
| `screenshot` | leaf; `name` and `alt` (max 300) required | product only |
| `glossary` (`scope`), `pages` | leaf | **docs only** |

Profiles also include `description`, `short`, `page` and `result` (`result` is a script's Markdown); a tenant page uses `docs`.

## B. Writer's rulebook (packages/docs/content, profile `product`)

Phase 30 adds Diátaxis types, subjects, collections and the Develop and Self-host folders (M3, M6); until then the folders below are the five of today (`start`, `build`, `configure`, `data`, `operate`, `tenant`, `instance`, `reference`).

**Files.** `content/**.md`; names `[a-z0-9][a-z0-9_-]*`; any depth. `reference/` is the mount for `generated/`: never write there. Non-`.md` files become assets.

**Frontmatter** (unknown keys are errors):
- `title` required, max 120. `description` max 500.
- `pages` and `icon` on index pages. `topic` is an id, max 80, unique. `terms` max 50, each `{id, term, short}` with up to 10 aliases; `short` is plain text, max 500.
- `since: "0.5"`. Quote it, or YAML makes it a number.
- `order` no longer exists (refused in every profile). `about` is unchecked here (the product has no resources to check it against) and `extends` and `key` have no effect on product pages (DOC-16, not a bug). `since` is now drawn: a line "New in version X" above the page in the help panel and under the description on a served page (fixed/t3-cli-docs.md DOC-MP2); no product page sets it yet.
- Quote values containing `: `.

**Title and lead.** The panel shows the title, **not the description**, so the first paragraph must restate it (existing habit). Search results show the description.

**Headings.** Start at `##`, then `###`. The panel shifts by 2 (`##` is drawn as h4). Sections are indexed to `###`. Ids are slugs; duplicates get `-1`. `#` validates but do not use it. Never rename a heading that is linked: `#anchor` is checked at build. `reference/errors#<code>` is opened by code (ask.tsx:111).

**Links.** Relative from the file's folder; `.md` optional; folder means its index; `topic:data-tables#anchor`; http(s) and mailto. Broken page, topic or anchor is a build error. Prefer `topic:` for screens. **Never link to `reference/api` from content**: `api.md` exists only after `docs:generate` (Postgres), so a clean `pnpm build` or self-built image would fail.

**Tables.** Allowed (not in `description` or `page`). The panel is 380px: 2-3 short columns, scrolls sideways. Escape `|`.

**Code.** Fences with a language. No highlighter is wired. Put `code-tabs` titles as `title=`.

**Mermaid.** Validates and is drawn as raw source in the help panel (HelpPanel passes no `code` override; still true, phase 30 M7). Do not use until C3.

**Images.** Relative files pass the build, but HelpPanel (options at HelpPanel.tsx:103-130) passes no `image` resolver, so they point at the console's own address and fall back to alt text. Https images are refused. Use `::screenshot` only.

**HTML** is literal text. Colons in `12:30` and URLs are safe. Nest with more colons; indent containers inside steps under the item. An unclosed container is an error.

**Product name.** `:product[]` inline. It cannot go in frontmatter, code or alt. `name.test` (manifest/src/name.test.ts) refuses the old company token, any case, in every tracked file; the company name is allowed in three listed files only. `ab`, so never write it in content.

**Terms.** Ids are global to the product. 13 exist (`tenant, workspace, dev-workspace, production-workspace, resource, deploy, draft, promotion, bundle, run, binding, member, end-user`), all in start/concepts; check each against the vocabulary when writing (for example `promotion`). `:term[word]{id=}` unknown is an error; resource terms (`table=`) draw the bare word. **Every new product term id or topic becomes reserved for tenants** (`term_reserved`, `topic_reserved`): a tenant's next deploy can be refused after upgrade; the Documentation screen now names such pages in a banner. Owner's rule (decisions.md, phase 30 M4): a new product term or topic starts `volvel-`. That rule is not enforced in code yet (no `names.lock`); follow it by hand. Avoid `order`, `customer`, `table`.

**Nesting and order.** Any depth. `pages:` orders, the rest by title; an unknown name is a warning, and **check fails on warnings while build does not**. Index pages need a handwritten list: `::pages` is refused and an empty index draws blank.

**Orphans** (check.mjs:90-99). Each non-index page must be opened by a console topic (literal `help:`, `useHelpTopic`, `<HelpTopic topic>`, `openHelp("…")`) or linked from another page. Term links do not count. Two pages linking only each other pass; index pages are exempt. It is not reachability from home.

**Screenshots.** `::screenshot{name=console/table-help alt="…"}`, name = path pattern, PNG at `assets/screenshots/<name>.png`. The build lists the pictures taken in the manifest; a missing one draws the alt in italics at run time and the build does not complain. Alt must read as a sentence. `pnpm docs:screenshots` = `SCREENSHOTS=1 playwright -c e2e screenshots`, against a **running** instance (`E2E_URL`, `E2E_ADMIN_*`); one test creates a "Fernhill" tenant and takes 3 pictures at 1440×900, light only. The spec no longer seeds `order:` (DOC-01 fixed) and its draft saves send the revision. Not in any CI workflow; PNGs are gitignored, so releases ship none (phase 30 M10).

**Generated pages** (never hand-edit; `pnpm docs:generate`):

| Page | Quality |
| --- | --- |
| permissions | Good |
| settings | Good; no examples; includes the worker's own variables (`WORKER_VARS`) |
| errors | Good (61 codes; title, status, help) |
| cli | Grown with phase 29: `--json`, `--profile`, `logout`, `profiles`, `rollback`, `deploy --preview`, `--message`, `--entry`, `--resources`, `dev --no-strict` appear (the page is drawn from `commands.ts`); still one sentence a command, no examples |
| api | 443 operations in the local `openapi.json` (11-22; not regenerated), on one page; phase 30 M9 replaces it. As of 11-22: no parameters or shapes; about 35 blank summaries; sections "Other", "Default", "Vx-single-sign-on" |
| kinds (25) | 248 of 576 fields described (docs:check, 2026-11-23); a field's minimum, maximum and default are now added to its row. No examples or links; "a app". Union types collapse: flow `nodes.*.type` says only `"trigger"`. theme 2/57, dashboard 53/129, interface 61/137. Every page claims a YAML file, even `doc` |
| docs/components, frontmatter | Accurate; no real examples, rules (holds/within, lengths) omitted |

**Coverage.** `coverage.json` floor `kinds: 0.429`; lowering fails. Now 43.1%; `check` prints the figure to raise it to.

**Commands.** `pnpm build` includes docs. `pnpm docs:check` runs `tsc -b`, `check.mjs --staleness` (generated pages out of date, asked before anything is rewritten), `api.mjs` (**needs Postgres**), then check; run in CI and in `release.yml`. `pnpm docs:generate` is `tsc -b` and `api.mjs`. Without Postgres: `pnpm --filter @volvel/docs build && pnpm --filter @volvel/docs check`.

**Bundling and size.** Vite copies `docs/dist` to console `/help`; fetched per page, offline. No size budget. Now 102 pages, 2.3 MB, `search.json` 762 KB raw / 133 KB gzip (487 KB is stored text, indexed twice: page and section). Loaded on first search. Long pages cost reading, not loading; target under ~150 lines per F1 page.

**Website.** npm `@volvel/docs` exports manifest, search, `fields.json`, `pages/*`, `content/*`, `assets/*` and `openapi.json` (DOC-MP4; `openapi.json` exists only after the API generator ran with a database). Release dispatches `volvel-docs` (release.yml:101-110). Panel links `<DOCS_URL>/docs/<version>/<path>`, with no fallback for `-next` versions.

**Audience.** None. All pages, including instance and settings, are served to everyone with the console; files under `/help` need no sign-in.

**Pages with no topic.** Reachable by search, links, or `?help=path`. The panel has no tree, breadcrumbs, previous/next or contents, and no Home button except on screens with no page. `manifest.nav` is unused by the panel.

**Adding `develop` and `self-hosting`.** Nothing breaks structurally: add folders with `index.md`, list in `content/index.md` `pages:` and link. Required: every page linked; unique topics/terms. Effects: self-hosting appears in tenant users' search; new terms/topics reserve names. No test counts sections of the help.

## C. Tooling to build (effort S < 1 day, M 1-3, L 4+)

Phase 29 settled some of these; phase 30 owns the rest (milestone in brackets).

1. Panel navigation: Home, breadcrumbs, children of a folder, previous/next, on-page contents (M). Phase 30 M7. Needed before 150 pages.
2. Enable `pages` (and `glossary`) for `product` with `folder`/`glossary` resolvers; `asDirectory` in HelpPanel (S). Phase 30 M2.
3. Mermaid in the panel via `Diagram` (S, lazy; narrow width) and the image resolver to `/help/assets/` (S). Phase 30 M2, M7 (DOC-04).
4. `audience` frontmatter field: not in phase 30 M3; the design makes one collection per audience instead.
5. Search: **done** section hits (`grouped` is used; the panel shows up to three places a page, HelpPanel.tsx:316-380, DOC-MP3). Open: rank reference lower, drop stored text for reference pages, split api out (M3 and M2).
6. Screenshots: spec repaired of `order:` only; data-driving it, seeding from examples/fernhill, light/dark, running it in release, checking names (phase 30 M10).
7. api generator: page per tag with parameters and examples; kinds: discriminate unions, examples, links, file naming; cli: structured flags (phase 30 M9).
8. New generators: widgets, SDK, connector/node catalogue, CEL (phase 30 M9).
9. check.mjs: reachability from home, `::field` path exists, unused terms, stub detector, external link lint, spelling of UI labels (phase 30 M4).
10. Redirects for moved product pages: `key`/aliases unused (phase 30 M4, `moved_from`). **Done:** `fields.json`, `assets/*` and `openapi.json` exported.
11. Syntax highlighting (phase 30 M2). **Done:** `since` badge is drawn (panel and served page).
12. Describe the undescribed fields: 328 left (576 less 248), spread over the lanes.

## D. Gotchas

Settled in phase 29 and gone: help pictures were cached `immutable` for a year (now only a file with a hash in its name outside `help/`, app.ts:388-392, DOC-10); a missing `/help/pages/x.json` answered the console page with 200 (now 404 for an address with an extension, app.ts:403-404, DOC-11); `docs:check` staleness was vacuous (now asked first, DOC-12); the help panel's `:term` offered "More about" to the page you are on (now none, HelpPanel.tsx:120-127, DOC-13).

Still true:
- Product content is single language; pages have no `updated` date.
- Product pages list `reference` from `generated`, so a checkout that only ran `generate.mjs` has no API page and the index omits it; `pnpm docs:check` reports `reference/index.md` lists "api" there. Never link to `reference/api` from content.
- `writing-a-widget.md` has no topic (deliberate: reached by link). Its alert "Developer widgets are not available yet" is still true (DOC-14: a developer's own widget in a sandboxed frame is designed, not built). It still says `labs/goal` in lines 6, 27, 97 and 155; it is `core/goal` (D37). Mark the page for contributors (D60).
- Validation is of written source: a tenant's `:term{id=workspace}` (a product term) passes deploy (DOC-15, not a bug; the tenant may use and extend product terms, not redefine them).
- A served site draws only its own app's terms (see E3).

## E. Findings: settled, and what is open

Each row cites the outcome (`findings/docs-system.md`, `fixed/t2-docs.md`, `fixed/api2.md`, `fixed/t3-cli-docs.md`, `fixed/t4-gov-docs.md`).
1. **`e2e/screenshots.spec.ts` seeded `order:`**: fixed, DOC-01 (`pages:` on the support index; test in `seeds.test.ts`). The spec itself was not run.
2. **`Doc` dropped `glossary`**: fixed, DOC-02 (`Doc` passes every option on, `packages/ui/src/Doc.tsx`; test in `docComponents.test.tsx`).
3. **Served sites resolve only their own app's terms** (DOC-03): **open, phase 30 M8.** `draw()` (K/apps/docs.ts:1008-1060) gives no product terms, other-app terms, resource terms (`table=…`) or `field`: they pass deploy and draw a bare word or code path, while the console preview shows terms. `sdk-guide.md:354` promises the description of a column from `:term[status]{table=… column=…}`: say "in the console" until M8 lands. Anonymous readers must not get column descriptions.
4. **HelpPanel lacks `image` and mermaid** (DOC-04): **open, phase 30 M2 and M7.**
5. **Insert menu lacks `glossary`**: fixed, DOC-05 (`MENU` has it; `NOT_IN_MENU` names `product` and `screenshot`, with a test). The sdk-guide now names `::glossary` in the paragraph.
6. **`feedback` kind text named 4 columns**: fixed, DOC-06 (kinds.ts:1371 names the six).
7. **"a table of any other kind"** (DOC-07): the page now reads "A table of any other kind, or one whose columns are not the feedback columns, is still refused." `fixed/api2.md:32` gives the replacement: "Any other table, or this table with other columns, is still refused." Apply it when the page is written. The "Uncategorized" wording is the engine's (`UNCATEGORIZED`, set.ts:67); the page does not say it.
8. **Draft previews, search and `/terms` built without the product's names**: fixed, DOC-08 (`buildDocs`, `kernel/docs/product.ts:49-64`, used at the four sites).
9. **A term or topic taken later by the product was dropped silently**: reported now, DOC-09 (banner on the Documentation screen, `issues` on `GET …/docs`). Prevention (`names.lock`, `volvel-` prefix) is phase 30 M4: **open**.
10. DOC-10 and DOC-11: fixed (see D). DOC-12 and DOC-13: fixed. DOC-14 to DOC-16: not bugs (see D and B).
11. DOC-17 screenshots never produced for a release: **open, phase 30 M10.**

Remaining owner questions (design report): ship `develop`/`self-hosting` in the console help or only on the website; a public-site version alias for `-next`; whether self-hosting pages replace `docs/self-hosting.md` and `sdk-guide.md` or are generated from them; namespacing tenant topics and terms before product ids grow (the `volvel-` rule is the answer for product ids).
