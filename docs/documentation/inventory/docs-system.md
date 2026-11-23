# Inventory: docs system

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

## A. Pages for half 1 (Documentation for tenants)

Stubs today: `content/build/documentation.md` (50 lines) and `documentation-editor.md` (24). Proposed folder `build/documentation/`, keeping topics `build-docs` and `build-docs-editor`. A page cannot sit beside a folder of its own name (`file_and_folder`, set.ts:310), so `documentation.md` becomes `documentation/index.md`.

Paths: `K` = apps/control-plane/src/kernel, `D` = apps/console/src/screens/docs, `E` = packages/docs-engine/src, `M` = packages/markup/src.

| Page | Contents | Pointers |
| --- | --- | --- |
| Overview | Page, folder, collection, site, draft, deploy. Edit in dev workspaces only; production is read-only. | Docs.tsx:60-140; docs-apps.test.ts:1167 |
| The tree | New folder or page (a page needs a folder), drag, F2, move, duplicate (drops topic and terms), delete (type the name), filter, undo, Keep, draft marks. Old address redirects for 90 days. | Docs.tsx:230-480, 620-900; E/ops.ts:340-527 |
| The page editor | Source/Split/Preview, `/` insert, problems by line, ⌘S, file name and Move, compare with deployed, conflict ("See what they saved"). | DocEditor.tsx; kit/markdown/insert.ts |
| Page details | Title, topic, description, icon (folder pages), terms, about, extends. | PageDetails.tsx |
| Frontmatter reference | Generated; needs examples. | E/schema.ts:36-140 |
| Components reference | One worked example each; see the table below. | M/registry.ts:64-300 |
| Links, anchors, pictures | Relative, `topic:`, `.md` optional, folder means index. Pictures are repository-only; there is no upload in the console. | E/set.ts:140-185; cli/build.ts:97-140; front.ts serveDraftDocs |
| Diagrams | `mermaid` fence, zoom keys, source without script. | apps/console/src/diagrams; sdk-guide.md:334 |
| Publish as a site | Top-level folder only; address, title, switch off/on, remove app, who may open it (bindings, anonymous). | Docs.tsx:326-370, 905-985; E/workspace.ts:213-262 |
| A served site | Home cards, collections switcher, breadcrumbs, contents list (`#` and `##` only), previous/next, Copy as Markdown (`<page>.md`), last updated, ⌘K or `/` search, `_search` without script, policy. | K/apps/docs.ts:53-1295 |
| Draft preview | `<site>/_draft/`; members with `doc:read` or `resource:read`; noindex; answers not kept; pictures are the deployed ones. | front.ts:1252-1335 |
| Feedback | `docs-feedback` columns, `site_key`, cookie, one answer per page, reading counts on the page. | E/workspace.ts:42-90; front.ts:1151-1212 |
| Deploy and conflicts | Documentation-only deploy, carries the feedback table, `draft_changed`. | model.ts:73-94; DocEditor.tsx |
| Doc writer role | `workspace:read, doc:*, table:read, app:read`; writes pages, docs apps and exactly the feedback table. | migrations/0081; authoring.ts:222-262 |
| Glossary and terms | Ids are unique per workspace, aliases, `::glossary`, underlining in screens and the opt-out. `/terms` is filtered by permission. | routes/terms.ts; help/glossary.tsx |
| Attach to resources and to help | `about` (6 kinds), `extends` ("From your team"). | terms.ts:170-330; HelpPanel fromTeam |
| Help in apps | `pages.*.help`, `<HelpPanel topic>`, `useHelp`, `helpUrl`; draws nothing without access. Text widgets use the `page` profile. | packages/app/src/help.tsx; client.ts:511 |
| Docs in the repository | `platform/docs` or `volvel.yaml docs: [...]`, file names never changed, `key` when moving a file, `defineApp({docs})`, pictures, build refusals. | sdk-guide.md:232-372 (best prose to reuse); cli/build.ts; manifest/src/files.ts:43 |
| Search | Console `/docs/search` against a site's search; AND, prefix and fuzzy matching; by section. | routes/docs.ts:300-353; E/search.ts |
| API | 3 docs routes plus `/terms`. | generated/api |

Every component (form; props; profiles):

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

## B. Writer's rulebook (packages/docs/content, profile `product`)

**Files.** `content/**.md`; names `[a-z0-9][a-z0-9_-]*`; any depth. `reference/` is the mount for `generated/`: never write there. Non-`.md` files become assets.

**Frontmatter** (unknown keys are errors):
- `title` required, max 120. `description` max 500.
- `pages` and `icon` on index pages. `topic` is an id, max 80, unique. `terms` max 50, each `{id, term, short}` with up to 10 aliases; `short` is plain text, max 500.
- `since: "0.5"`. Quote it, or YAML makes it a number.
- `order` no longer exists. `about` is unchecked and useless here. `extends` and `key` have no effect.
- Quote values containing `: `.

**Title and lead.** The panel shows the title, **not the description**, so the first paragraph must restate it (existing habit). Search results show the description.

**Headings.** Start at `##`, then `###`. The panel shifts by 2 (`##` is drawn as h4). Sections are indexed to `###`. Ids are slugs; duplicates get `-1`. `#` validates but do not use it. Never rename a heading that is linked: `#anchor` is checked at build. `reference/errors#<code>` is opened by code (ask.tsx:111).

**Links.** Relative from the file's folder; `.md` optional; folder means its index; `topic:data-tables#anchor`; http(s) and mailto. Broken page, topic or anchor is a build error. Prefer `topic:` for screens. **Never link to `reference/api` from content**: `api.md` exists only after `docs:generate` (Postgres), so a clean `pnpm build` or self-built image would fail.

**Tables.** Allowed (not in `description` or `page`). The panel is 380px: 2-3 short columns, scrolls sideways. Escape `|`.

**Code.** Fences with a language. No highlighter is wired. Put `code-tabs` titles as `title=`.

**Mermaid.** Validates and is drawn as raw source in the help panel (HelpPanel passes no `code` override). Do not use until C3.

**Images.** Relative files pass the build, but HelpPanel passes no `image` resolver, so they point at the console's own address and fall back to alt text. Https images are refused. Use `::screenshot` only.

**HTML** is literal text. Colons in `12:30` and URLs are safe. Nest with more colons; indent containers inside steps under the item. An unclosed container is an error.

**Product name.** `:product[]` inline. It cannot go in frontmatter, code or alt. `name.test` (manifest/src/name.test.ts) refuses the old company token, any case, in every tracked file; the company name is allowed in three listed files only. `ab`, so never write it in content.

**Terms.** Ids are global to the product. 13 exist, all in start/concepts. `:term[word]{id=}` unknown is an error; resource terms (`table=`) draw the bare word. **Every new product term id or topic becomes reserved for tenants** (`term_reserved`, `topic_reserved`): a tenant's next deploy can be refused after upgrade. Use specific ids; avoid `order`, `customer`, `table`.

**Nesting and order.** Any depth. `pages:` orders, the rest by title; an unknown name is a warning, and **check fails on warnings while build does not**. Index pages need a handwritten list: `::pages` is refused and an empty index draws blank.

**Orphans** (check.mjs:90-99). Each non-index page must be opened by a console topic (literal `help:`, `useHelpTopic`, `<HelpTopic topic>`, `openHelp("…")`) or linked from another page. Term links do not count. Two pages linking only each other pass; index pages are exempt. It is not reachability from home.

**Screenshots.** `::screenshot{name=console/table-help alt="…"}`, name = path pattern, PNG at `assets/screenshots/<name>.png`. Missing ones draw the alt in italics; names are not checked. Alt must read as a sentence. `pnpm docs:screenshots` = `SCREENSHOTS=1 playwright -c e2e screenshots`, against a **running** instance (`E2E_URL`, `E2E_ADMIN_*`); one test creates a "Fernhill" tenant and takes 3 pictures at 1440×900, light only. Not in any CI workflow; PNGs are gitignored, so releases ship none.

**Generated pages** (never hand-edit; `pnpm docs:generate`):

| Page | Quality |
| --- | --- |
| permissions | Good |
| settings | Good; no examples |
| errors | Good (60 codes; title, status, help) |
| cli | Thin: usage plus one sentence, flags unexplained, no examples |
| api | 443 routes on one 194 KB page, no parameters or shapes; about 35 blank summaries; sections "Other", "Default", "Vx-single-sign-on" |
| kinds (25) | 247 of 575 fields described. No examples or links; "a app". Union types collapse: flow `nodes.*.type` says only `"trigger"`. theme 2/57, dashboard 53/129, interface 61/137. Every page claims a YAML file, even `doc` |
| docs/components, frontmatter | Accurate; no real examples, rules (holds/within, lengths) omitted |

**Coverage.** `coverage.json` floor `kinds: 0.429`; lowering fails. Raise it as descriptions land.

**Commands.** `pnpm build` includes docs. `pnpm docs:check` runs `tsc -b`, `api.mjs` (**needs Postgres**), then check; run in CI. Without Postgres: `pnpm --filter @volvel/docs build && pnpm --filter @volvel/docs check`.

**Bundling and size.** Vite copies `docs/dist` to console `/help`; fetched per page, offline. No size budget. Now 102 pages, 2.2 MB, `search.json` 741 KB raw / 129 KB gzip (487 KB is stored text, indexed twice: page and section). Loaded on first search. Long pages cost reading, not loading; target under ~150 lines per F1 page.

**Website.** npm `@volvel/docs` exports manifest, search, `pages/*`, `content/*`. Not exported: `fields.json`, `assets/*`, generated sources, `openapi.json` (all in `files`). Release dispatches `volvel-docs` (release.yml:101-110). Panel links `<DOCS_URL>/docs/<version>/<path>`, with no fallback for `-next` versions.

**Audience.** None. All pages, including instance and settings, are served to everyone with the console; files under `/help` need no sign-in.

**Pages with no topic.** Reachable by search, links, or `?help=path`. The panel has no tree, breadcrumbs, previous/next or contents, and no Home button except on screens with no page. `manifest.nav` is unused by the panel.

**Adding `develop` and `self-hosting`.** Nothing breaks structurally: add folders with `index.md`, list in `content/index.md` `pages:` and link. Required: every page linked; unique topics/terms. Effects: self-hosting appears in tenant users' search; new terms/topics reserve names. No test counts sections of the help.

## C. Tooling to build (effort S < 1 day, M 1-3, L 4+)

1. Panel navigation: Home, breadcrumbs, children of a folder, previous/next, on-page contents (M). Needed before 150 pages.
2. Enable `pages` (and `glossary`) for `product` with `folder`/`glossary` resolvers; `asDirectory` in HelpPanel (S).
3. Mermaid in the panel via `Diagram` (S, lazy; narrow width) and the image resolver to `/help/assets/` (S).
4. `audience` frontmatter field (`everyone|developer|operator`), filter in search and nav; not security (M). Public instances still serve files.
5. Search: section hits (`grouped` exists, unused by panel), rank reference lower ("how to make a flow" returns reference/api first; `flow` guides are stubs), drop stored text for reference pages, split api out (M).
6. Screenshots: repair and data-drive the spec, seed from examples/fernhill, light/dark, run in release, check names against the taken list (M-L).
7. api generator: page per tag with parameters and examples (M-L). kinds: discriminate unions, examples, links, fix file naming (M). cli: structured flags (M).
8. New generators: widgets from `definitionProblems`/widget definitions in widgets-core (M); SDK from `dist` d.ts/TSDoc (L); connector/node catalogue from packages/nodes (M); CEL/expressions (M).
9. check.mjs: reachability from home, `::field` path exists, unused terms, stub detector (body under N words), external link lint, spelling of UI labels (S-M).
10. Redirects for moved product pages: `key`/aliases are unused (S-M). Export assets, fields and openapi (S).
11. Syntax highlighting (S-M). `since` badge: stored in manifest, drawn nowhere (S).
12. Split `describe` work: 328 undescribed fields (M-L, spread).

## D. Gotchas

- `/help/assets/screenshots/*.png` match `/assets/` and get `immutable, 1 year` with unhashed names (app.ts:~363): a new version's pictures stay stale.
- Missing `/help/pages/x.json` returns `index.html` with 200 (SPA fallback), so the panel reports a JSON error.
- `docs:check` staleness is vacuous: api.mjs calls `write()` first, and generated/ is gitignored.
- Help panel's `:term` in product pages shows a "More about" link even to the page you are on.
- Product content is single language; pages have no `updated` date.
- Product pages list `reference` from `generated`, so a checkout that only ran `generate.mjs` has no API page and the index omits it.
- `writing-a-widget.md` has no topic; it is reachable only by link. Its alert "Developer widgets are not available yet" needs checking against the released widget SDK.
- Validation is of written source: a tenant's `:term{id=workspace}` (product term) passes deploy.

## E. Bugs and open questions

Verified by reading; the first also by running `readPage`.
1. **`e2e/screenshots.spec.ts` uses `order:`**, refused since phase 21 (2026-11-20). PNGs date 11-19. Its deploy should fail; not run end to end.
2. **`Doc` (packages/ui/src/Doc.tsx) drops the `glossary` prop**: `::glossary` is blank in the console reader and editor preview, though served sites draw it. No test covers it.
3. **Served sites resolve only own-app glossary ids**: K/apps/docs.ts `draw()` gives no product terms, other-app terms, resource terms (`table=…`) or `field`. They pass deploy and draw a bare word or code path, while the console preview shows terms. sdk-guide.md:354 promises otherwise.
4. HelpPanel lacks `image` and mermaid (above).
5. Insert menu lacks `glossary`, and sdk-guide's component list does too (insert.ts MENU).
6. `feedback` schema description names 4 columns (`page, helpful, version, at`); the deploy requires 6 including `site_key`, `site`. Shown in generated/kinds/app.
7. content/build/documentation.md says "a table of any other kind" for the doc writer; and "no uncategorized pages" versus engine's "Uncategorized" needs one wording.
8. `serveDraftDocs` builds without `product`, so previews do not report or drop reserved terms.
9. docs-page `terms` reserved mid-life: `docsOf` drops a tenant's clashing term after upgrade without telling anyone.

Questions: Should `develop`/`self-hosting` ship in the console or only on the website? Is a public-site version alias planned for `-next`? Should self-hosting pages replace docs/self-hosting.md and sdk-guide.md or be generated from them? Will tenant topics and terms be namespaced before product ids grow?
