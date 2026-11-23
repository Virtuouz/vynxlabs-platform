# Phase 30 walk: help panel (slice "help")

Instance http://localhost:8091, Maya Brooks (tenant admin) and the operator. Playwright headless, 1440/768/390, light and dark. Shots: `~/.local/share/volvel-walk/shots30/help/`.

## Right
- F1 opens on Tables, Flows, App Builder, Members (right page, trail, heading focused); F1 again and Esc (from the heading and from the search box) close. Operator: all instance screens give their own page and a working "Open in documentation" (200).
- Breadcrumbs wrap at 390 with no overflow (`panel-deep-390-light.png`). No horizontal overflow of the panel at any width/theme.
- Previous/Next equal /docs' pager on 35 sampled pages (every sixth page plus 6 chosen), 0 mismatches.
- Home, Back-to-page-help, pager, trail: focus lands on the new page heading. Tab order: heading, Home, Copy link, Close, search, trail, body links, pager, Open in documentation, checkbox.
- "Open in documentation": new tab, `noopener`, `/docs/<url>#section`, section is at the top of the page; panel stays open.
- Old links: `?help=start/concepts`, `build/flows`, `reference/errors`, `tenant/members`, `instance/members`, `reference/api` and topic ids all open the new page.
- Search: /docs reachable uses `_search.json`; aborted, 404 and 429 all fall back to the local index; a result opens the page, clears the query, focuses the heading.
- Glossary term: popover, Esc keeps panel and returns focus to the term, "More about" opens Concepts with focus on heading (1440 and 390).
- Error toast with a known code: "What does this mean?" opens `errors#<code>` (panel at 390 too). An unknown code gets no link.

## Wrong
1. Focus is lost when the panel closes (F1 or Esc): lands on `body`, not where it was. The panel's own mount effect moves focus to the heading before HelpDock records `before`, so the remembered element is the heading. `apps/console/src/help/HelpDock.tsx:34-36` (and `HelpPanel.tsx` focus-on-mount).
2. A refusal shown inside a dialog (Create table, Add row: `forbidden`-style code) is an inline alert with no help link; only toasts get "What does this mean?". `ask.tsx:99-107` `explained` is used only by `notify.error`; dialogs use `failureText`.
3. A saved link to a page that is gone (`?help=nonsense-topic`, `build/does-not-exist`) says "There is no help for this screen yet." on a screen that has help. `HelpPanel.tsx` branch `!shown || !page` (~line 330). Better: fall back to the screen's own page.
4. Instance "Health" (`/instance/health`) shows "Database locations" help: `nav.ts` ~line 270 `help: "instance-databases"`. `/instance/component-kit` is not a route (kit is `/instance/kit`); no finding there.
5. Server search and fallback disagree: "table" gives 8 hits vs 12 (different ranking and count), and neither shows a breadcrumb, so "Flow" (kind) and "Flows" (screen) cannot be told apart (`HelpPanel.tsx` `Results`; server hit has `crumb`).
6. Breadcrumb wrapped at 390 starts line two with a lone chevron (`HelpPanel.tsx` trail `li`, ~line 253).
7. Screenshot placeholder: no screenshots are in the build (`screenshotFiles` is `{}`), so the Tables page shows its alt text in italics as if a caption ("A table's rows, with the help for the screen open beside them.").

## Not walked
- Diagram: no page in the build has a `mermaid` fence (only prose mentions), so `Diagram` in the panel could not be seen.
- Screenshot in dark, on /docs and in the panel: no screenshots built, no `<picture>` in /docs HTML.
- Related pages: block is empty everywhere (no `subjects`), as m7 says.
- Panel does not reopen after a reload (not specified; noted).
- Error toast: the refusal was simulated by routing the API answer (real code and shape); a real one was not found with Maya.

## Left behind
Created table `help-walk-a` in Fernhill's Clinics workspace (Maya; a real create). Delete it if it is in the way.
