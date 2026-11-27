# Fact-check record: console/how-to/docs/search-a-docs-site.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| ⌘K / Ctrl+K, / outside a box, or the Search button opens the window; arrows, Enter, Esc; count "N pages". | packages/docs-site/src/script.ts:353-445 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Empty search lists the last five pages opened, kept in the browser, under Recently viewed. | script.ts:33-40, 288-300 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Where to search buttons All and each collection (two or more collections); Kind of page buttons Any kind and the types. | script.ts:360-383 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| `_search?q=` page: "Search", "N pages for “…”", "Nothing here matches “…”", `type=` narrows. | packages/docs-site/src/render.ts:645-668; front.ts:1264-1270 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Matching: all words (AND), prefix, fuzzy 0.15, boosts title > heading > description. | packages/docs-engine/src/search-query.ts:95-101 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| "The search did not answer." with "Open the full results". | script.ts:325-333 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Filter pages in the console filters titles only. | D/model.ts `filterRows`; D/Docs.tsx:441 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| The documentation API search route; no screen calls it. | apps/control-plane/src/routes/docs.ts:333-383; grep of apps/console/src finds none | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| Ctrl+K opens the window; / opens it outside a box; Esc closes; ↓ Enter opens a result; results say "3 pages"; Recently viewed lists the pages opened, newest first; All / each collection under Where to search; Any kind / each type present under Kind of page. | packages/docs-site/src/script.ts:290-450; run on a site with two collections and two types at 1440 and 390 dark | second agent, 2026-11-23 | holds as written |
| The search page: "3 pages for “refun”", with &type=explanation narrowed to 1, "Nothing here matches “zzzz”."; the Search link works without script. | run, script off | second agent, 2026-11-23 | holds as written |
