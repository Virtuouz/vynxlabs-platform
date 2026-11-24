# Run log: console/how-to/docs/move-rename-or-delete-a-page.md

- Instance http://localhost:8091, commit `14f7d5b9`, Maya Brooks, Sandbox, 1440 px, light, headless Playwright. Pages `d31-notes/…` of my own.
1. **New page here** in the folder **D31 Notes**, title "D31 Tmp", **Done**: the page was at `/docs/d31-notes/d31-tmp`.
2. Pencil **Rename D31 Tmp**: the hint "Renaming the file moves its address. The old address leads to the new one for 90 days." showed; File name `d31-moved` and Enter: the address became `d31-notes/d31-moved`.
3. Menu **Move to…**: the dialog listed the folders (D31 Notes, Fernhill handbook, Front desk, Checking in, Fernhill rota guide, Fernhill supplies guide) with the 90-day text. Moving into `handbook/front-desk` and then back to `d31-notes` worked; the address followed each move.
4. **Duplicate**: `D31 Tmp (copy)`, file `d31-moved-copy.md`. **Delete…** asked "Delete D31 Tmp (copy)?" "It is gone once this is deployed." "Type d31-moved-copy to confirm"; typing it and **Delete** removed a page that was never deployed from the tree.
5. After a deploy, **Delete…** on the deployed D31 Tmp showed **To be removed**, a **Keep** button, and on the page "A draft removes this page. It is gone once that is deployed." with **Keep this page**. **Keep** asked "Keep D31 Tmp? This throws away the draft that removes it. The page stays as it was last deployed." and **Keep** brought it back.
6. Moved back and renamed to `d31-renamed`, deployed. On the site `…/d31-site/d31-moved` answered a redirect (a `fetch` with `redirect: manual` gave an opaque redirect) and the browser ended on `…/d31-site/d31-renamed` with status 200.
- Not run: dragging in the tree, deleting a folder, **Undo**, link rewriting seen in a page (only read in `ops.ts` and its tests), the redirect's 308 status and its 90 days (status read in code), a repository page, 768 and 390 px, dark, keyboard only (F2).

## The page got wrong
- A bullet that said a deleted-and-deployed page could be promoted back was invented and removed. "A top-level folder cannot be moved" was too much: only dragging is closed to it; the page says so.

## Second check, 2026-11-23 (second agent)

Dragging was run (as in the Documentation screen's log): into a folder, above another page, Undo. F2 was run from the keyboard (title and file name fields, Escape closing). Not run: deleting a folder, link rewriting seen in a page, the redirect's status.
