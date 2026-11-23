# Walk p30 docs (http://localhost:8091/docs/, signed out)

Shots: ~/.local/share/volvel-walk/shots30/docs/

Right
- Crawled all 181 pages: all 200, one h1 each, no overflow at 1440 or 768 (light and dark), nothing loaded from outside the instance, no console errors.
- Home, five collections, type folders, eyebrow, breadcrumbs, prev/next, "On this page", version at the foot (0.5.0), branding tile and icons.
- Old paths 308 to the new page (start/concepts, reference/api, build/app-builder). Missing page: 404 "There is no page here", with links.
- Headers: CSP (self only, frame-ancestors none), X-Robots-Tag noindex, nosniff, ETag and 304 on If-None-Match, search no-store, .md served.
- Search: Ctrl+K dialog with collection and kind chips, opens focused on the input, Esc closes. `_search.json?type=` filters. Results page works without JavaScript.
- Dark: system dark works. Console choice (Maya, Color theme menu) wins: dark chosen with system light gives dark docs, light chosen with system dark gives light docs.
- Without JavaScript pages and navigation still read.

Wrong
1. 390 px, light and dark: horizontal scroll on develop/reference/sdk/widgets, sdk/widgets-action, sdk/widgets-page. The pager's long title (`@volvel/widgets/action`) pushes "Next" out. Cause: packages/docs-site/src/css.ts:167, `grid-template-columns: 1fr 1fr` should be `minmax(0,1fr) minmax(0,1fr)` plus overflow-wrap on `.pager a`.
2. Backticks show literally in the page subtitle and in search results ("Everything `@volvel/widgets` exports.", "`volvel --help`"), on all widths. Cause: the description is drawn as plain text (docs-site render.ts, lede and search result description).
3. Docs home is titled "Help" ("Search Help", "This help follows...", tab title "Help · Volvel documentation"). Product is "documentation". Source: packages/docs/content/index.md (title).
4. Search result snippets can start with a raw list marker ("- Concepts: Tenants...").
5. The `_search` page (and without JavaScript) shows no crumb or places for a result, so same-titled pages (4 "Reference", 3 "Flows", 2 "Permissions") cannot be told apart. The dialog does show crumbs.
6. Collection landing pages (e.g. /docs/start) have no eyebrow or breadcrumb, and "Previous" on /docs/start is "Help".
7. Page titles repeat across areas ("Reference" x4, "Flows" x3) in tab titles.

Not walked
- A page with a screenshot: this build has no screenshot files, so Tables shows its alt text in italics only; the dark picture was not seen. Not checked whether that is expected.
- Instance branding changed (not allowed); only the default branding seen.
- The mobile menu button was not opened by script (my selector missed it); at 390 only the closed header and focus ring were seen.
- No offline or 429 state, no 304 on assets, no memory check.
