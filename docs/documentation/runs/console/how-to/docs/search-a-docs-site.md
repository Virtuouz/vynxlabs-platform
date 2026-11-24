# Run log: console/how-to/docs/search-a-docs-site.md

- Instance http://localhost:8091, commit `14f7d5b9`, Maya Brooks (a member), the site `d31-site`, 1440 px, light.
1. `…/d31-site/_search?q=walk`: heading "Search", "1 page for “walk”", the page title as a link. `…/_search?q=zzzz`: "0 pages for “zzzz”" and "Nothing here matches “zzzz”."
2. `walk-in.md` returned status 200, `text/markdown; charset=utf-8`, beginning "# Check in a walk-in patient".
3. `…/_draft/walk-in` showed "A preview, with the workspace's drafts. Only members who may read its documentation see this. Its readers see what is deployed."
- Not run: the search window (⌘K, /, arrows, Enter, Esc), **Recently viewed**, the collection and kind buttons (the site has one collection and no types), prefix and fuzzy matching, `&type=`, the no-script case, an anonymous reader, 768 and 390 px, dark. The window is described from `packages/docs-site/src/script.ts`.

## Second check, 2026-11-23 (second agent)

A repository site with two collections and two types (`volvel deploy`), 1440 px light and 390 px dark.
1. Ctrl+K opened the window with **Recently viewed** (newest first) and the collection and kind buttons; "refun" gave "3 pages"; ↓ then Enter went to the second result; `/` opened it; Esc closed it.
2. `_search?q=refun` gave "3 pages for “refun”", with `&type=explanation` "1 page"; `_search?q=zzzz` "Nothing here matches “zzzz”."; with script off the bar's **Search** link was there.
3. At 390 px dark the bar's Search link opened the window, which fitted.
