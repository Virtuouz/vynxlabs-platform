# Inventory: docs platform design

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

# Volvel docs site: architecture and plan

Three results change the design:

- **Warnings already fail the product check.** `packages/docs/check.mjs` counts `issues.length`, warnings included. Tenants never see warnings outside the editor, because `checkWorkspaceDocs` keeps errors only.
- **CI images ship without the API pages.** The `image` CI job and any self-built image have no Postgres, so a link to an API page would break those builds.
- **`apps/console/src/ask.tsx:111` is invisible to the topic check.** It uses a template literal, ``openHelp(`reference/errors#${code}`)``, and the regexes match only `"…"`. Moving that page would break silently.

I verified every gap you listed. The search index is 741KB raw and 92KB Brotli. Stored text is 494KB of the raw size, and each word is indexed twice (page and section).

## 1. Shared renderer

New published package `packages/docs-site` (`@volvel/docs-site`), depending on docs-engine, markup and lowlight.

**Moves from `kernel/apps/docs.ts`:**
- `DOCS_CSS`, `DOCS_SCRIPT`, and all of `docs-icons.ts`. Add the icons the five collections need.
- `docPage`, `homePage`, `searchPage`, `searchAnswer`, `notFoundPage`, `pageAt`, `pageMarkdown`, `iconLinks`, and the script tests.

**Stays in control-plane:** the `docsOf` cache, `serveDocs`/`serveDraftDocs`, feedback, access, themes, hosts, policies.

`Drawn` becomes `SiteView`. Today it hardcodes the profile, `/_platform`, the search endpoint and `app.title`:

```ts
interface SiteView {
  title: string; set: DocSet; base: string;
  platform: string;               // "/_platform/"; also sent in docs-data for import()
  look: { themeHref; logoHref?; iconsHref? };
  profile: "docs" | "product"; productName?;
  resolve: { asset; screenshot?; field?; term? };
  search: { kind: "server" } | { kind: "static"; index: string };
  trailingSlash: boolean; canonical?; versions?; notice?; feedback?;
}
```

- Hash the `docs.css`/`docs.js` URLs. They are cached for an hour today with unversioned names, so an upgrade can mismatch HTML and script.
- **Highlighting:** server side, `highlight?: (code, lang) => Drawn[]` in markup's `RenderOptions`. It is implemented with lowlight (MIT; highlight.js is BSD-3) and draws class spans. No CSP change, and markup stays dependency-free. The console loads it lazily.

**Static export** (`@volvel/docs-site/export`, `exportSite(set, opts): AsyncIterable<{file, bytes}>`):
- **Pages:** `<base>/<url>/index.html`, `<url>.md`, `404.html`, sitemap, meta-refresh stubs for redirects.
- **Search:** one index per collection with clipped stored text, so reference loads last. Bundle the query half of `search.ts` with esbuild (already a dependency); split off `search-query.ts` so the client drops markup. Without script, `_search/` lists all pages.
- **Diagrams:** release copies the console's `_platform/diagrams.js` into `@volvel/docs` `dist/platform/` before publishing.
- **Feedback:** off unless an action URL is given.
- **Theme:** the caller supplies a stylesheet; the default is `DEFAULT_THEME`.
- **Versions:** keep `<DOCS_URL>/docs/<version>/<page>`. Prereleases (`x-next.sha`) map to `next`, otherwise the panel's online link is a 404. Old versions fetch `../versions.json` to say that a newer one exists.

## 2. Diátaxis data model

```ts
export const DOC_TYPES = ["tutorial", "how-to", "reference", "explanation"] as const;
// Frontmatter
type?: DocType;         // on index.md: the type of pages below; the index itself has none
subjects?: string[];    // ID_PATTERN, max 5, unique
moved_from?: string[];  // old paths in this set
// DocSet: types: Record<path, DocType>; subjects: Record<string, string[]>; redirects: Record<string, string>
// PageRef.type?  Manifest.pages[].type/subjects, Manifest.redirects  PageHit.type?
relatedTo(set, path): Partial<Record<DocType, PageRef[]>>
```

**Corrections to your leanings:**
- **`subject` should be a list, `subjects`.** It matches `about` and `extends`, and the schema subset has no `oneOf`. Relatedness also uses `about`, so tenant pages about the same table are related with no new key. Subjects do not inherit. Cap at 4 per type: most shared subjects, then same collection, then nav order.
- **An index needs an exemption.** `how-to/index.md` is a landing page, not a how-to. It gets no eyebrow and no lints, and is never "related".
- **Do not require four folders per collection.** `start` is mostly tutorials. Console how-tos need area subfolders (`console/how-to/data/…`) or there are 80 flat pages. Folders stay free; `type` on an index labels them.
- **Moving a page can change its type.** `planMove` should report it, and write an explicit `type:` only when the user keeps the old one.
- **Type cards:** drawn on a collection landing when at least two types exist, after the author's body. This changes nothing for untyped sites.
- **Search ranking:** `boostDocument` with reference at 0.6, except an exact title or heading match. Add a `type=` filter beside `in=`; store `type` without indexing it. Do not reuse the existing `kind` field.
- **Search size:** stop storing page `text`; clip section text to about 240 characters. The server cuts excerpts from trees. Keep page-level indexing, because AND queries span sections.

**Lints** (`diataxis.ts`, warnings): no steps in a tutorial or how-to; steps in reference or explanation; how-to or tutorial title form; typed page in an untyped folder; subject used once. Product check: keep warnings failing, with a committed `lint-allow.json` ratchet. Tenants: show them in the editor (issue severity is already passed there) and on `volvel build` stderr. Never refuse a deploy.

`PageIndex` in `among.ts` needs `type`, `subjects` and `moved_from`, or the editor and deploy will disagree. The console already receives each page's source, so the API need not change.

**Compatibility:**

| Case | Result |
|---|---|
| Old bundle or CLI on new instance | Identical output |
| New frontmatter, old CLI | Build refused (`additionalProperties: false`), naming the key |
| New CLI, old instance | `storeBundle` refuses, naming page and line |
| Running bundles after upgrade | Keep serving; nothing is rechecked until the next deploy |
| Tenant import into old instance | Not checked by docs rules; `usable()` drops the key; next deploy there is refused |
| Git sync, export | `source` is verbatim; nothing lost |

`doc.v1.schema.json` is unchanged. Add a CLI hint on that refusal: "the instance may be older".

**Reserved names:** commit `packages/docs/names.lock` with today's topics and term ids. New ones must start with `volvel-`, and no topic may disappear, because `extends_unknown` is a deploy error. Most new pages need no topic.

**Console:** type and subjects in `PageDetails.tsx`; type choice in the New page row (`NameEditor`) feeding `planNewPage({type})` with templates from docs-engine; eyebrow in the `DocEditor` preview.

**Also for tenant sites:** resolve product terms (href to `mainOrigin/docs`) and `::field`, both public. Resolve resource terms only through the `DESCRIBED` permission check in `routes/terms.ts`; otherwise a public site leaks column descriptions. Do not resolve another docs app's terms.

## 3. Serving /docs

- **Route:** `routes/product-docs.ts`, registered on the root app with `access.public` and `hide: true`. Covers `/docs` → 308 `/docs/`, `/docs/*`, `_search`, `_search.json`, `.md`, `_theme.css`. No console path conflicts: `docs` exists only under `/t/…/workspaces/…`.
- **Hosts:** the front door already sends `domain` hosts to the tenant and answers 404 on `apps`, so `/docs` exists only on `main` and unregistered names. Add tests for all three. Vite dev needs `/docs` and `/_platform` proxies.
- **Theme:** `/api/v1/instance/theme.css` contains only overrides and relies on the console's stylesheet. `/docs/_theme.css` is `DEFAULT_THEME` merged with the instance's values, plus the instance logo, icons and product name. Follow the stored console light/dark choice with a small script-file addition.
- **CSP:** `DOCS_POLICY` minus `https:` images, with `frame-ancestors 'none'`. Keep inline styles for Mermaid. `x-robots-tag: noindex`; canonical to `DOCS_URL` when set.
- **Caching:** `public, no-cache` with an ETag over (docs build hash, path, branding revision, renderer hash); LRU of 300 rendered pages. Hashed images immutable. `Limiter` per IP on search.
- **Loading:** from `consoleDir/help`, as `productNames` does. Not from content: control-plane cannot depend on `@volvel/docs`, which dev-depends on it. Add `openPackage(read): DocSet` to docs-engine: manifest eager, page trees lazy, search on first use. `packageOutput` adds frontmatter to page files and `md/<path>.md`. Estimate under 30MB resident with search loaded; measure it. No console dir means 404.
- **Static routes:** with `wildcard: false`, `@fastify/static` globs a route per file, including `.br`/`.gz`. Set `globIgnore: ["help/**"]` and serve `/help/*` by one handler. This also fixes the immutable cache on unhashed screenshot names.
- **DOCS_URL:** `/docs` is always the primary link; "online" is secondary.

## 4. Help panel

- Resolvers: `image`, `screenshot` (light/dark), `folder`, `glossary`. `Doc.tsx` must forward `glossary` in options and deps. Allow `pages` and `glossary` in the `product` profile.
- Lazy Mermaid, reusing the console's `diagrams/Diagram.tsx`.
- Breadcrumbs, prev/next, eyebrow, and a "Related" block. Put `relatedTo`, `trailOf` and `pagesInOrder` in a pure function over `Manifest`.
- "Open in documentation" → `/docs/<url>#anchor`, new tab, plain anchor.
- Search through `/docs/_search.json` instead of downloading the index.
- `pageFor`: topic, then path, then `manifest.redirects`, so saved `?help=` links survive.
- Change `ask.tsx` to the `errors` topic. Make the check match template literals.

## 5. Content layout

```
content/
  index.md
  start/       tutorials/  explanation/concepts  how-to/
  console/     tutorials/  how-to/{build,operate,data,configure}/  explanation/
               reference/screens/{build,operate,data,configure,account}/
               reference/{nodes,widgets,shortcuts}*
  develop/     tutorials/  how-to/writing-a-widget  explanation/
               reference/{kinds,api,sdk,cli,errors,documentation}*
  administer/  tutorials/ how-to/ explanation/ reference/screens/  reference/{permissions,audit-actions}*
  self-host/   tutorials/ how-to/ explanation/ reference/console/  reference/{settings,metrics}*
```
(* generated)

- F1 screen pages are reference with their current topics. `build|operate|data|configure/*`, `start/account` and `start/tenants` → `console/reference/screens`; `tenant/*` → `administer`; `instance/*` → `self-host`. Topics are path independent, so `nav.ts` ids keep resolving.
- `load.mjs`: both roots mount at `""`; a path in both is an error.
- Redirects: `moved_from`, plus `packages/docs/paths.lock` listing every released path, each of which must exist or redirect. Served as 308, exported as stubs; a file-level redirect map covers deleted generated pages. Tenant sites keep `resource_alias` and gain `moved_from`.
- The orphan rule becomes: every handwritten page is listed in its folder's `pages:`; screen topics must resolve; no inbound link is a warning.

## 6. Generators

Output to `packages/docs/generated/<collection>/reference/…`, **still gitignored**, always produced by `pnpm build`.

- **API:** one page per tag (37 tags today, including `Default` (32 operations), `Vx-single-sign-on` and 2 untagged; fix these first). Make it DB-free: export `describeApi()` from control-plane that builds the app on a lazy `Database` and never queries. `createKernel` appears lazy; this needs a spike. Fallback: commit only the API pages, with CI checking staleness.
- **SDK:** `typescript-js: npm:typescript@^6` (or 5.9) as a docs-only devDependency, using its checker over `packages/sdk/dist/index.d.ts`. This follows re-exports and JSDoc, which a parser such as oxc would not. Confirm the version exists; the licence (Apache-2.0) is allowed.
- **CLI:** one page per command group. `COMMANDS` has no structured flags; add `options` to `CommandEntry`.
- **Nodes:** `@volvel/nodes` input/output schemas. **Widgets:** `widgets-core` declarations. **Kinds:** add examples and `topic`-less subjects.
- **Shortcuts:** `kit/shortcuts.ts` must be importable without the console. It declares a plain table, so move the data to a file with no imports.
- **Metrics:** create a typed `METRICS` registry that `inc`/`observe` require. Names are inline literals now.
- **Audit:** typed `AUDIT_ACTIONS`; a rough grep finds 139 literals. Make the `audit()` parameter a union, so the compiler finds omissions.
- **Events:** a registry of platform-emitted events; inventory needed.

## 7. Screenshots

- `packages/docs/screenshots.mjs`: `{name, as, path, viewport, steps[], ready, clip?, mask[]}`. The spec only loops, and fails on a missing ready state or an unused or undeclared name. This replaces the broken tenant built with `order:`.
- Run on a throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, with `page.clock`, masks for times, and animations off. `setup.mjs` has no fixed clock; add a `FERNHILL_NOW` option.
- Two themes, scale 1, 1280×800, at most 60 shots. Name `<name>.<theme>.<hash8>.png`; manifest adds `pictures: Record<name,{light,dark,width,height}>` and keeps `screenshots`. Render both `<img>`s with CSS switching, because `<picture>` ignores `data-theme`.
- Not committed. A `screenshots.yml` workflow (manual and pre-release) uploads an artifact; release downloads it before `pnpm build`. Missing pictures fail release only; locally, words remain. About 10MB in the image at an assumed 80KB each.

## 8. Milestones

Write the phase doc with a Polish gate first, as CLAUDE.md requires.

| # | Work and files | Tests | Size / risk |
|---|---|---|---|
| 1 | Extract `docs-site`; `SiteView`; hashed assets. Update the release lists (`release.yml`, `release-version.mjs`, `release-check.mjs`), Dockerfile COPY, tsconfig | Golden HTML before/after; moved script tests; `docs-apps.test` | L / M |
| 2 | Profile, glossary, image gaps; highlighting; icons; search split and size | markup, docs-engine, React/HTML parity | M / L |
| 3 | Diátaxis engine: `schema`, `set`, `among`, `ops`, `search`, `diataxis` | Untyped golden unchanged; inheritance; index exemption; compat matrix | L / M |
| 4 | Redirects, `paths.lock`, `names.lock`, new check rules, `ask.tsx` | check tests | M / L |
| 5 | `openPackage`, `/docs` route, `/help` handler, theme, ETag | Host matrix, CSP, 304, memory, traversal | L / M |
| 6 | Move content and mount generated pages; old topics resolve | `docs:check`; `Help.test` | M / M |
| 7 | Help panel | Help.test, axe, browser walk | M / L |
| 8 | Tenant enhancements, console editor, CLI warnings, product and resource terms | Docs.test; leak test for anonymous readers | L / M |
| 9 | Generators: API spike first, then SDK, registries, the rest | Snapshots; no-DB build in CI `image` | L / H |
| 10 | Screenshots | Manifest lint; release rehearsal | M / M |
| 11 | Static export and website handoff | Export crawl with no broken links, base-path tests, offline search | M / M |
| 12 | Write about 250 pages, by collection | Lints, link check | XL / L |

1 → 2 → 3 is sequential. 4 precedes 6, and 5 precedes 7. 9 and 10 can run beside 7 and 8. Do the API spike during milestone 1, because it decides commit versus gitignore.

**Ask the owner:** `/docs` discloses the running version and branding without sign-in. Confirm whether the footer should show the version.

### Critical Files for Implementation
- apps/control-plane/src/kernel/apps/docs.ts
- packages/docs-engine/src/set.ts
- packages/docs-engine/src/schema.ts
- packages/docs/load.mjs
- apps/console/src/help/HelpPanel.tsx
