# Run log: console/how-to/docs/publish-a-folder-as-a-site.md

- Instance http://localhost:8091, commit `14f7d5b9`, Maya Brooks, Sandbox, 1440 px, light.
1. Menu of the folder `D31 Notes`: **Publish as a site…** ("Top-level folders only"). The dialog **Publish D31 Notes as a site** with the text "Every page in the folder is a page of the site. Nobody outside sees it until you deploy it and say who may open it." The Address started as `d31-notes-site`; `Bad Address` gave "The address is lowercase letters, digits, hyphens and underscores: handbook." I used `d31-site` and **Publish**.
2. **Deploy N changes**, **Deploy**. The site was at `http://localhost:8091/apps/fernhill/sandbox/d31-site/`: home page with "Collections" (an "Uncategorized" collection for pages directly in the folder), "Recently updated", Search ⌘K.
3. A page of the site had a contents list ("On this page"), "Copy as Markdown", "Copy link", "Last updated", and the feedback form.
4. `…/_draft/walk-in` answered for Maya with the preview notice.
- Not run: the three menu items **Stop publishing…**, **Publish again…**, **Remove the site's app…**, **Undo**, a binding for anonymous readers, the draft preview as a non-member, 768 and 390 px, dark, keyboard only. The first site had no binding and Maya, a tenant admin, opened it.

## Found when cleaning up (not in the page's steps)
- After **Remove the site's app…** on a deployed site and **Delete folder…** on its folder, the tree said **Deploy 3 changes** (the three pages) and not four. **Deploy** was refused: "The bundle's manifests are not valid. d31-site (app): serves the pages under "d31-notes", and there are none." The removed app is not in the screen's list, so its removal is not among the paths the screen deploys. The page says an app's removal takes effect "after the next deploy"; that was not seen from the screen. The removal went out only with a deploy that named the app's path (API). Reported as a product fault; the page's table row for **Remove the site's app…** is as the code words it and was not run to its end.
