# Phase 30 re-walk: r-docs (items 1-23)

Instance http://localhost:8091 (the fixed build). Shots: ~/.local/share/volvel-walk/shots30/r-docs/. Widths 1440 and 390 (768 not re-walked), light and dark, keyboard for F1, Esc, F2, Ctrl+K.

## Not fixed
- 4 (partly): the pager no longer overflows, but the page title does. /docs/develop/reference/sdk/widgets-action scrolls sideways at 390 (scrollWidth 446), and widgets-page (423), light and dark: the h1 `@volvel/widgets/action` is one unbreakable word and is cut (docs-action-390-top.png). Cause: packages/docs-site/src/css.ts:156 `.lead h1` has no overflow-wrap. Tenant sites share it. All 24 other /docs pages checked have no overflow.
- 19 (not for the two named dialogs): "What does this mean?" does not show for the refusal in Create table (duplicate name, refusal-dialog-1440-light.png) nor Add row (duplicate value, addrow-refusal-1440.png, 390). The Create table words come from `takenText` (ask.tsx:115), not `failureText`, so no code is registered; the Add row words are not from `failureText` either. The explainer (ask.tsx:92) works only for words made by `failureText`. I did not find a dialog refusal that does show the link.

## Fixed
1 CLI `--help` and sdk-guide.md:288 now say the CLI carries the screens (SCREENS_DIR only to use another build). Ran `volvel dev performance` from the CLI in tree30: serves with no SCREENS_DIR.
2 Fixed: /help/fields.json is 200 JSON under `volvel dev`; no failed request on `performance` (dev-interface-390-dark.png, 1440-light). (front-desk-board showed a 404 for /interfaces/screens/front-desk-board and "You may not open this app": that interface is a draft in Sandbox, not a dev-server fault.)
3 Fixed: search dialog is 390 wide at x=0, chips wrap, on /docs and the tenant site (search-tdocs-390-dark.png, search-docs-390-light.png).
5 Fixed: backticks drawn as code in subtitles, search page, panel results (docs-search-390-dark.png, help-results-390-dark.png).
6 Fixed: /docs home h1 and tab "Volvel documentation".
7 No raw "- ", "#" or ">" at the start of excerpts in four searches (docs-search-*.png).
8 Fixed on the search page: each result shows collection > folder (not the places per result, as the lane said).
9 Fixed: collection landings have a breadcrumb; /docs/start has only Next; tenant /howto has no Previous; first page's Previous is its collection (t-howto-*.png).
10 Fixed: "Mix how-to · Mixed collection · Tdocs guide", "The volvel command · Reference · Volvel documentation".
11 Fixed: New page "Folder: How-to guide" writes the how-to template with no `type:` line (newpage-created-1440-light.png).
12 Fixed: the typed home shows four type cards then Collections (t-home-1440-light.png).
13 Fixed: Related links are green and underlined.
14 Fixed: no "Uncategorized" chip; one pressed chip per group.
15 Fixed: Type select reads "Folder: How-to guide", not cut at 1440 or 390 (newpage-390-dark.png).
16 Fixed: F2 with focus on the page heading opens the title field, and from the tree row (f2-1440.png, f2-tree-1440.png).
17 Fixed at 390: Page details is one column, uses the width, no horizontal scroll (details-390-dark.png, details-390-light.png).
18 Fixed: F1 from Create table then Esc, Help button then Esc, and the close button all return focus to where it was.
20 Fixed: `?help=nonsense` says "The help has no page called “nonsense”. The page for this screen is still there." (help-nonsense-1440-light.png).
21 Fixed: Instance > Health opens "Instance health" (Self-host > Reference > Instance), a stub saying phase 31 writes it (health-help-390-dark.png).
22 Fixed: panel results show collection > folder (help-results-390-dark.png).
23 Not seen to wrap: at 390 and 330 no breadcrumb in the panel or on /docs wrapped, so the separator rule was not observed; the separators sit after each crumb (help-deep-390-light.png).

## Left behind by this walk
- Tables `a`, `select`, `volvel-x`, an 80-character `xxxx...` table and `rdocsdup` in Fernhill Sandbox (made by Maya while probing Create table; no remove control found). Pages `rdocs-inherit-1440` and `rdocs-inherit-390` in tdocs/howto (drafts). The API key I made was revoked; dev was stopped by pid.
