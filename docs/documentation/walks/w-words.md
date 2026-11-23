# Walk w-words (voc-spell, voc-access, t3-cli-docs console part)

Instance http://localhost:8091, Fernhill as Maya Brooks; destructive steps in my own tenant `w-words-t` (workspace `w-words-ws`). Shots: ~/.local/share/volvel-walk/shots29/w-words/.

## Right
- Access changes (Members & access tab, list, empty state in own tenant, Go back dialog, Esc returns focus to the button, bad `?release=` says so, reload): copy says "access change" throughout. 1440/768/390, light/dark.
- Roles: permission "Access changes" shown (own-roles-1440.png). Apps nav item and page title "Apps". Publish check: "Deploys to Sandbox for the first time. Nobody sees it until then." (builder-publishcheck.png). State tag tooltips "Published means deployed here". Docs "Publish as a site" dialog and toast "will be a site once deployed.", Undo offered, reload keeps the draft.
- Spelling: no British word on any workspace or tenant screen text (scanned all 24 workspace and 15 tenant sections plus tabs).
- Help panel search: pages with places under them, bold matches, Enter opens a page. Reader at 390 and 1440 fine.

## Wrong
1. Audit log still says "Access released", "access.released" and resource type "tenant release" (filter lists and rows), the old word. Tenant audit, any width. Cause: `apps/console/src/audit-words.ts:37-47` (no word for `access.released` / `tenant_release`).
2. Help panel Branding line says "The colours, logo and name" (British); packages/docs content (VOC-31, left to phase 31).
3. Help panel passages show raw table markup ("| tenant access:read | See how ...") in Permissions and Flow hits. Cause: `apps/console/src/help/HelpPanel.tsx` Results (`~315`) / `help/content.ts` passage builder.
4. With the help panel open at 1440, the "Go back to this" button of Access changes is cut at the pane edge (help-search-1440-light.png). Cause: table in `AccessReleases.tsx` has no scroll or wrap.
5. At 390 an unbroken name ("w_readonly_flow_runner") runs under the Status column in Access changes (changes-390-dark.png), `AccessReleases.tsx` What cell.
6. Workspace Overview says "Review release" and "RELEASE / Deployments" while the screen is "Deploy" (deploy sense, voc-state, not this slice).
7. Publish check in Front desk board refuses with `no widget called "labs/goal"` (stale seeded draft; D37 renamed it core/goal). True of the data, but the draft is stale on the instance.

## Not walked
- "New in version X" (DOC-MP2): no page sets `since`, nothing to see.
- Approve/decline/withdraw dialogs and a waiting change: approval needs a second member (`approval_needs_two`); not set up. Single sign-on with an access-change mapping: no provider, only empty state seen.
- `volvel dev` (APP-MP1), CLI: not console.
- 429s from the sign-in limiter appeared in the console log only.
