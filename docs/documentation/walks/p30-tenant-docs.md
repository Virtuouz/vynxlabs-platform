# Phase 30 walk: tenant-docs

Instance http://localhost:8091, Fernhill Sandbox, as Sam Reyes (doc writer); served as guest, Maya, Rowan, Amara, Sam, locum.01 (member, no role), Jess and George (end users). My names: `tdocs` (typed site, app `tdocs-site`, public), `tdocsplain` (untyped site, public). Screenshots: ~/.local/share/volvel-walk/shots30/tenant-docs/ (prefixes: 01-09 console, c- console 768/390, g- guest typed site, p- plain site, h- handbook as Jess).

## Wrong
1. "Use the folder's (How-to guide)" on New page writes no template. Page opens empty with 2 warnings (no steps, no heading). Explicit How-to writes the template. Shot 04-after.png (1440 light). Cause: `packages/docs-engine/src/ops.ts:126-132` (`type` undefined gives bare head), `Docs.tsx:1246` option value "".
2. Landing page of a typed site has no type cards, only Collections (shot g-home-1440-dark.png). Type cards appear only on a collection page (g-mix-1440-light.png). If the brief means the site home: `packages/docs-site/src/render.ts:534` (`homePage`) never calls `typeCards` (`render.ts:428`).
3. Served Related links look like plain text (ink colour, no underline) while body links are green and underlined; the console read view shows them as links. g-howto-1440-light.png, 390 dark. Cause: `packages/docs-site/src/css.ts:252`.
4. Search dialog chips: "All" and "Uncategorized" are both pressed at once (aria-pressed true on both) on the typed site. `packages/docs-site/src/script.ts:362` (both ids are ""). Likely older than types. Shots g-search-1440-light.png, g-search-390-dark.png.
5. Type select text cut: "Use the folder's (How-to guid..." at 1440 and 390 (02-newpage.png, c-newpage-390-light.png). `Docs.tsx:1242`.
6. Pressing F2 after selecting a page did nothing: focus sits on the page heading (07-rename.png run). Rename by the pencil works. Not traced.
7. At 768 and 390 the editor has Source/Preview only; Page details is under Preview, cramped at 390 (c-details-390-dark.png, problems bar covers part of the form). Usable.

## Right
- Tree, New page with Tutorial, Reference, Explanation: template written, `type:` set. Untyped: bare. Inside the how-to folder: no `type:` written (03-new-inherit.png).
- Page details: Type shows "The folder says How-to guide, so this page is one."; subjects add by Enter, normalised (Bad Subject! becomes bad-subject), stop at five with words (06-subj-full.png).
- Problems: unknown type, 6 subjects, reference with steps, tutorial without steps are warnings ("This page would deploy as it is"). `volvel-` term and topic are errors ("Mend these before it can be deployed") and a deploy refuses both with words (API 400, same text).
- Preview and read view: eyebrow, Related with link colour.
- Served typed site, guest: eyebrow, cards on a mixed collection (4 types, 1440/768/390, light/dark, no horizontal scroll), Related, search type chips filter (Tutorials gives 1 page, by keyboard), `type=` in `_search.json`, unknown type gives none.
- `:term` of the product and `::field` resolve for everyone. Table terms: guest and locum.01 get the word alone; Maya, Rowan, Amara, Sam, Jess, George get the description.
- Rename in the console then Deploy: old address answers 308 to the new one.
- Untyped site: no eyebrow, related or type row; looks as a plain site. Search has no chips.
- Handbook (needs sign-in, so a guest is sent to sign-in with 303; walked as Jess): eyebrow, cards on front-desk, Related, 3 widths, light/dark, no overflow.

## Question
George (pet owner, end user) is told what `inventory` is for, though no rule gives him any inventory row. The rule (`kernel/docs/describe.ts`) counts `data:read` at the workspace. Matches the code, may be wider than "may read that table".

## Not walked
Unknown written type kept and named in Page details; Back/reload everywhere; keyboard through the New page row; guest signed-in-as-member in a real browser (done with cookies, not clicked); offline states.
