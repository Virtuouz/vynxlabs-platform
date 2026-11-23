# Phase 30, lane wf-docs: items 1-23 of the walk fixes

Tests were seen failing on the code before the change for items 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 18 and 23 (the fix reverted with `git apply -R`, the new test run, the fix put back). Items 7, 15, 16, 17, 19, 20, 21, 22 have a test that asserts the new behaviour; they were not reverted one by one.

## Rules chosen
- Descriptions: backticks are code, everywhere a description is shown (`splitCode` in `packages/markup/src/code.ts`; `described` in docs-site; `::pages` cards; the help panel's results).
- Pager: confined to a collection. The first page of a collection has no Previous, the last no Next (`neighboursOf`, `packages/docs-engine/src/set.ts`). The help panel uses the same function.
- Tab title: `<page> · <folder or collection> · <site>`, each said once.
- Breadcrumb separators trail the crumb before them (docs site and help panel), so a wrapped line never begins with one.

## Items
1. `volvel dev` help, `docs/sdk-guide.md` and `p30-m1b.md` no longer say `SCREENS_DIR` is needed. Test: `packages/cli/src/dev-site.test.ts` "the help says the kinds of app".
2. `/help/fields.json` is answered `{}` by the dev server (field help is not drawn locally; the help says so). Test: `dev-site.test.ts` "an interface".
3. Search dialog full width at 390 (`.finder:modal { max-width: none }` beats the browser's own dialog limit), chips wrap. `packages/docs-site/src/css.ts`; `walkfix.test.ts` "the search dialog is as wide as the screen".
4. Pager `minmax(0, 1fr)` and `overflow-wrap: anywhere`; every grid column in the frame may shrink. `walkfix.test.ts` "the pager's columns" and "no grid of the frame".
5. `described()` in docs-site (subtitle, cards, switcher, recent, home intro, search page), `::pages` cards in markup, help panel results. Tests: `walkfix.test.ts` "descriptions", `markup.test.ts` "a description's backticks".
6. The product's home is named by the site (`Volvel documentation`, h1, search label, tab) when `profile` is `product`; a tenant home keeps its page title. `walkfix.test.ts`; `apps/control-plane/src/product-docs.test.ts`. The panel keeps "Help". Content: `packages/docs/content/index.md` says "These pages follow the console".
7. Passages lose list markers, heading hashes and quote marks at index time and at read time (older indexes). `packages/docs-engine/src/search.ts`, `search-query.ts`. Test: `search.test.ts` "a result's words carry no list markers".
8. `_search` page shows each result's collection > folder. Not done: the places per result (the page's `SearchHit` carries an excerpt, not places). `walkfix.test.ts` "a search page says where each result is".
9. A collection's own page has a breadcrumb back to the site; pager confined (above). Tests: `engine.test.ts` "a page's neighbours stay in its collection"; `walkfix.test.ts`. No eyebrow added: the breadcrumb is the decision.
10. Tab titles (above). `walkfix.test.ts` "the tab says".
11. A new page left to the folder's type starts from its template, with no `type:` line. `ops.ts` `planNewPage`. Tests: `ops.test.ts`; `Docs.test.tsx` "a new page left to the folder's type".
12. The home of a site with two or more types shows type cards (`homeTypeCardsOf`, `set.ts`; `render.ts`). `walkfix.test.ts`; golden `typed-home.html`.
13. Related links use the link colour and underline. `walkfix.test.ts` "a related link".
14. The search dialog no longer has a chip for the pages in no collection (it cannot be searched alone), so "All" is the only chip pressed. `script.ts`; `script.test.ts`.
15. New page Type select says "Folder: How-to guide" (fits the tree). `Docs.tsx`; `Docs.test.tsx`.
16. F2 renames the open page wherever focus is on the Documentation screen (`RenameKey`, `Docs.tsx`); the tree rows keep handling it themselves. Test: `Docs.test.tsx` "F2 renames the page that is open".
17. Page details lose their own box and padding below `sm`, so the fields use the width. `PageDetails.tsx` (class change; walk it).
18. Focus is recorded by the store when the panel opens (`takeOpener`, `help/store.ts`) and given back by `HelpDock`. Test: `Help.test.tsx` "closing it gives focus back".
19. A danger `Notice` of the words of a coded refusal offers "What does this mean?" (`setFailureExplainer` in `packages/ui/src/Notice.tsx`, registered in `ask.tsx`). One piece for every dialog that shows `failureText`. Test: `Help.test.tsx` "a failure shown inside a dialog".
20. A stale `?help=` says "The help has no page called ..." and offers this screen's page. Test: `Help.test.tsx` "a stale ?help=".
21. Instance > Health has its own topic `volvel-instance-health` and a stub reference page `self-host/reference/console/health.md` for phase 31. Test: `Help.test.tsx` "no two sections of the navigation share a topic"; `docs:check` passes.
22. Panel results show collection > folder (the same crumb as item 8). `Help.test.tsx` "a result says where its page is".
23. See the rule above. `Help.test.tsx` "a trail's separator stays"; `walkfix.test.ts`.

Also (coordinator): `Served.tsx` card uses the shared `Panel`; `enforce.test.ts` passes.

## Golden pages changed on purpose (tenant sites)
Tab titles (item 10) for pages inside a folder; the collection landing's breadcrumb (9) in `page-folder-index`, `typed-collection-landing`; pager ends (9) in `page-folder-index`, `page-nested-base`, `page-preview`, `page-said-feedback`, `page-static-search`-type pages; search result crumb (8) in `search-hits`; type cards on the home (12) in `typed-home`. Sites with none of these keep their pages byte for byte.
Control-plane tests updated: `product-docs.test.ts` (home h1), `docs-apps.test.ts` (title, no Next past a collection).

## Left
- `dev-site.test.ts` "it is found with no SCREENS_DIR set" needs `packages/screens/runtime/dist` built; not built in this worktree (environment).
- Places under each result on the server `_search` page (item 8).

## Screens to re-walk
/docs and a tenant docs site at 390 (pager, search dialog, long titles, breadcrumb wrap) and 1440 (home with type cards, collection landing, related links, tab titles); /docs home title; the help panel (F1 then Esc returns focus; a dialog refusal such as Create table; `?help=nonsense`; search results; deep breadcrumb at 390); Instance > Health help; Documentation screen: New page Type select, F2 after choosing a page, Page details at 390 (light and dark); `volvel dev` interface (no 404 in the console).
