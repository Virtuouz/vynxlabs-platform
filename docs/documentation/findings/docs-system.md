# Findings: docs system (DOC)

Settled against `270e509` (tree `tree29`). "30-M<n>" is a milestone of the design report's plan in [docs-platform-design](../inventory/docs-platform-design.md) section 8. "29" means it needs fixing in phase 29. Nothing was fixed.

| Outcome | Count |
| --- | --- |
| reproduced | 2 (DOC-09, DOC-11) |
| confirmed by code | 12 |
| not a bug | 3 (DOC-14, DOC-15, DOC-16) |
| missing part | 4 |
| owner decides | 4 |

### DOC-01 `e2e/screenshots.spec.ts` seeds pages with `order:`, which a deploy refuses
- **Outcome:** confirmed by code. **Severity:** broken. **Where:** e2e/screenshots.spec.ts:78,86; packages/docs-engine/src/schema.ts (`order` is gone; `pages:` on the index replaces it).
- **Evidence:** the two page sources carry `order: 1` and `order: 2`; unknown frontmatter keys are errors. Not run end to end (needs a running instance).
- **Fix:** replace with `pages:` on the folder index. The spec is rewritten data-driven anyway. **Size:** S. **Milestone:** 30-M10 (a stop-gap `pages:` edit is S in 29 if screenshots are wanted before).

### DOC-02 `Doc` drops the `glossary` option, so `::glossary` is blank in the console reader and editor preview
- **Outcome:** confirmed by code. **Severity:** broken. **Where:** packages/ui/src/Doc.tsx:136-175 (neither destructured nor put in `options`, nor in the memo deps); callers pass it at Docs.tsx:1645 and DocEditor.tsx:532.
- **Evidence:** `ReactOptions` has `glossary` (markup/src/render.ts:58); `Doc` builds `options` from a fixed list of 12 names and `glossary` is not one. Served sites pass it (docs.ts:1038) so only the console is blank.
- **Fix:** forward `glossary` in `Doc` (one line plus the dep). Siblings: the same fixed-list pattern would drop any new `ReactOptions` key, so build `options` by spreading the rest props. Test: `Doc` with a `glossary` that returns an item draws `.vd-glossary`. **Size:** S. **Milestone:** 29 (30-M2 and 30-M7 also list it, for the help panel's use).

### DOC-03 Served sites draw no product terms, resource terms, other-app terms or `::field` info
- **Outcome:** confirmed by code. **Severity:** wrong. **Where:** apps/control-plane/src/kernel/apps/docs.ts:1051-1058 (`term` reads only `set.terms[props.id]`; no `field`, no `screenshot`).
- **Evidence:** `:term[x]{table=orders}` has no `id`, so it returns null and draws the bare word; `:term{id=workspace}` passes deploy (reserved ids are known terms, set.ts:444) and draws a bare word on the site, while the console preview shows the term. sdk-guide.md:354 promises the description.
- **Fix:** give `draw()` resolvers for product terms (link to the main origin's docs), resource terms through the `DESCRIBED` check in routes/terms.ts, and `field`. Anonymous readers must not get column descriptions (leak test). Siblings: serveDraftDocs shares `draw()`. **Size:** L. **Milestone:** 30-M8.

### DOC-04 The help panel has no `image` resolver and draws Mermaid as raw source
- **Outcome:** confirmed by code. **Severity:** broken. **Where:** apps/console/src/help/HelpPanel.tsx:228-241 (`<Doc>` passed no `image`, `screenshot`, `folder`, `glossary` or `code`).
- **Evidence:** relative images point at the console origin and fall back to the alt text; screenshots fall to italics. **Fix:** resolvers to `/help/assets/`, lazy `Diagram`, `pages` and `glossary` in the `product` profile. **Size:** M. **Milestone:** 30-M2 (profile, image) and 30-M7 (panel).

### DOC-05 The insert menu lacks `glossary`
- **Outcome:** confirmed by code. **Severity:** rough. **Where:** apps/console/src/kit/markdown/insert.ts:23-35 (`MENU`; the registry has `insert: "::glossary$0"`, registry.ts:260). The sdk-guide list at line 332 omits it by name but describes `::glossary` in the same paragraph, so the guide part is a nit.
- **Fix:** add the entry; a test that every registry component with an `insert` is in `MENU` or listed as excluded. **Size:** S. **Milestone:** 29.

### DOC-06 The `feedback` schema text names four columns; a deploy requires six
- **Outcome:** confirmed by code. **Severity:** wrong. **Where:** packages/manifest/src/kinds.ts:1332-1338 versus packages/docs-engine/src/workspace.ts:50-57 (`site_key`, `site`, `page`, `helpful`, `version`, `at`); shown in generated/kinds/app.
- **Fix:** write the description from `FEEDBACK_COLUMNS`, or test that it names every key. Sibling: content/build/documentation.md already says six. **Size:** S. **Milestone:** 29.

### DOC-07 Doc-writer wording: "a table of any other kind"
- **Outcome:** confirmed by code, in part. **Severity:** rough. **Where:** packages/docs/content/build/documentation.md:46.
- **Evidence:** "kind" there means a table with other columns or a different table name, but a reader takes it as a resource kind; the permission itself (exactly the feedback table) is right. The report's second half, a "no uncategorized pages" phrase against "Uncategorized", is not in the page at `270e509` (grep `uncategor` over content finds nothing): refuted. **Fix:** reword to "any other table, or this table with other columns". **Size:** S. **Milestone:** 29 (or the rewrite of that page, which the inventory plans anyway).

### DOC-08 Draft previews, the docs search route and `/terms` build without the product's reserved names
- **Outcome:** confirmed by code. **Severity:** wrong. **Where:** front.ts:1278 (`buildApp(app, resources)`, no `product`); routes/docs.ts:338 and routes/terms.ts:140 the same. `docsOf` (docs.ts:781) and deploy (bundles.ts:78) pass it.
- **Evidence:** the draft preview shows a tenant's clashing term and topic as fine, and keeps its definition, while the deployed site drops it and a deploy is refused. The console editor does pass it (DocEditor.tsx:178), so only the server preview, search and the terms route disagree.
- **Fix:** one helper that builds a workspace's docs with `productNames(kernel.config)`; use it at all four call sites (POLISH-013). Preview should also show the issues. Test: the preview and the deployed site draw the same terms. **Size:** S. **Milestone:** 29.

### DOC-09 A tenant's term or topic that clashes with a later product id is dropped silently after an upgrade
- **Outcome:** reproduced. **Severity:** wrong. **Where:** set.ts:384-410 (clash is an issue and the term is not added); docs.ts:764-781 (`docsOf` keeps `issues` unread); bundles.ts:78 (only deploy checks).
- **Evidence:** scratch vitest on `buildApp`: without `product` the terms are `["workspace"]`; with `product.terms = ["workspace"]` they are `[]` and the only issue is `term_reserved` (error). A running bundle is not re-checked until its next deploy, so the first sign is a bare word, and then a refused deploy. A topic clash drops the page's topic the same way.
- **Fix:** carry `issues` from `docsOf` to the console (a banner on the Documentation screen and the editor) and log once per bundle. Prevention: `names.lock` (design section 2) and namespacing product ids. Test: a bundle built before the product list grew reports the clash. **Size:** M. **Milestone:** 29 for the report; 30-M4 for the lock.

### DOC-10 `/help` pictures with unhashed names are cached for a year as `immutable`
- **Outcome:** confirmed by code. **Severity:** wrong. **Where:** apps/control-plane/src/app.ts:360-363 (regex `/[\\/]assets[\\/]/` also matches `help/assets/screenshots/x.png`).
- **Evidence:** the build's own assets are hashed; the screenshots are named by path, so a release's new picture is not fetched by browsers that have the old one. **Fix:** limit `immutable` to hashed names, or serve `/help/*` by one handler (design section 3). Test: header on `/help/assets/screenshots/a.png` is `no-cache`. **Size:** S. **Milestone:** 30-M5 (or S in 29 by narrowing the regex, which is cheap; pictures are not shipped yet, see DOC-17).

### DOC-11 A missing `/help/pages/x.json` answers `index.html` with 200
- **Outcome:** reproduced. **Severity:** broken (for the panel's error message). **Where:** app.ts:371-377 (`setNotFoundHandler` sends `index.html` for any GET outside `/api`).
- **Evidence:** `GET http://localhost:8091/help/pages/nope.json` returned `200 text/html`. The panel's JSON parse fails and shows a parse error instead of "page not found". **Fix:** 404 for `/help/*` paths with a file extension; siblings: `/_platform/*`. Test: status 404. **Size:** S. **Milestone:** 30-M5.

### DOC-12 `docs:check` staleness is vacuous
- **Outcome:** confirmed by code. **Severity:** rough. **Where:** packages/docs/generators/api.mjs:98 (calls `write()`), then packages/docs/check.mjs:53-54 (`stale()` compares what was just written; `generated/` is gitignored, and `write()` is also called when the folder is missing).
- **Fix:** have `docs:check` call `stale()` before any write, or drop the claim. Test: edit a kind description and see `check` fail without a regenerate. **Size:** S. **Milestone:** 29 (or 30-M9, where generators move).

### DOC-13 The panel's "More about" link on a term points at the page you are on
- **Outcome:** confirmed by code. **Severity:** rough. **Where:** HelpPanel.tsx:233-241 draws `more` for any term with an `href`; the product `term` resolver gives no same-page exception (the served-site version has one, docs.ts:1055).
- **Fix:** omit the link when the term's page is the current one. **Size:** S. **Milestone:** 30-M7.

### DOC-14 `writing-a-widget` has no topic; its "not available yet" alert
- **Outcome:** not a bug. The alert is still true: decision 0005 and phase 25 (line 34) say a developer's own widget, run in a sandboxed frame, is designed and not built. `@volvel/widgets` exists as the SDK for the product's own widgets. The missing topic is deliberate (reachable by link, and orphan-checked). The page also sits under `build/`, not `develop/`; 30-M6 places it.

### DOC-15 A tenant's `:term{id=workspace}` (a product term) passes deploy
- **Outcome:** not a bug. Phase 20 (lines 205, 218) says a tenant may use and extend product terms and may not redefine them. What is wrong is only its drawing (DOC-03).

### DOC-16 "`order` is useless" and `about` is unchecked in product content
- **Outcome:** not a bug (writer's note). `order` is refused in every profile, and `about` is not checked against resources in the product set because the product has none.

### DOC-17 Screenshots are never produced for a release
- **Outcome:** confirmed by code. **Severity:** wrong (the panel shows italic alt text everywhere). PNGs are gitignored and the spec is in no workflow. **Milestone:** 30-M10.

## Other items, settled by a milestone

| Item | Outcome | Milestone |
| --- | --- | --- |
| C1 panel navigation | missing part | 30-M7 |
| C2 `pages`/`glossary` in the product profile, `asDirectory` | missing part | 30-M2 |
| C3 Mermaid and images in the panel | see DOC-04 | 30-M2, 30-M7 |
| C4 `audience` field | new capability | owner question 1; 30-M3 does not include it |
| C5 search section hits, rank reference lower, size | confirmed (741 KB raw) | 30-M2 (size), 30-M3 (rank) |
| C6 screenshots | DOC-01, DOC-17 | 30-M10 |
| C7, C8 generators | new capability | 30-M9 |
| C9 check.mjs rules | new capability | 30-M4 |
| C10 redirects for moved pages (`key` and aliases unused) | missing part | 30-M4 |
| C11 highlighting; `since` drawn nowhere | `since` is a missing part, S | 30-M2 |
| D: SPA 200, immutable cache | DOC-10, DOC-11 | 30-M5 |
| D: "`reference` omitted without Postgres" | confirmed; breaks no build | 30-M9 |

## Missing parts
1. Insert menu entry for `glossary` (insert.ts MENU, registry.ts:260): S, no permission change (DOC-05).
2. Draw `since` from the manifest in the panel and served product pages (stored, drawn nowhere): S, 30-M2/M7.
3. Section hits in the panel's search (`PageIndex.grouped` exists, docs-engine/src/search.ts): S, 30-M7.
4. Export `fields.json`, `assets/*` and `openapi.json` from `@volvel/docs` (`files` has them, `exports` does not): S, 30-M11.

## Owner decides
1. **Does `/docs` on the main origin show the version and instance branding without sign-in?** Options: show; hide the version. Recommend hide the version in the footer, keep branding.
2. **Should `develop` and `self-hosting` ship in the console help or only on the website?** In the console they reach tenant users' search and reserve ids. Recommend website only until namespacing.
3. **Namespace tenant topics and terms before product ids grow?** Recommend yes (`names.lock` with a `volvel-` prefix, 30-M4), which also settles DOC-09 for good.
4. **Will `-next` versions alias to a public site version?** Recommend map to `next` (design section 1).
