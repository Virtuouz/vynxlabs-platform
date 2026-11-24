# Fact-check record: console/explanation/docs/how-a-docs-app-works.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A page is a resource of the workspace; it is deployed and promoted; folders to any depth; a folder's own page is index and may list `pages`. | docs/sdk-guide.md:233-262; packages/docs-engine/src/schema.ts:56-63 | writer, read in the code 2026-11-23 | holds as written |
| A docs app serves a folder; index is home; each folder under it a collection; a site never serves a folder inside another; who may open is bindings. | docs/sdk-guide.md:268-281 | writer, read in the code 2026-11-23 | holds as written |
| Pages are changed in dev workspaces; saving makes a draft; the deploy sends only documentation and the feedback table. | D/Docs.tsx:198-224; apps/console/src/screens/Tenant.tsx:590-604 | writer, read in the code 2026-11-23 | holds as written |
| A draft is shared; a save names the revision it saw; an older one is refused. | apps/control-plane/src/kernel/authoring.ts:290-312; kit/DraftClash.tsx | writer, read in the code 2026-11-23 | holds as written |
| Problems stop a deploy; type and subject problems are warnings. | packages/docs-engine/src/diataxis.ts:96-187 | writer, read in the code 2026-11-23 | holds as written |
| Product term and topic ids are the product's; a page may not take them. | packages/docs-engine/src/set.ts:422-442 | writer, read in the code 2026-11-23 | holds as written |
| Repository pages are read in the console and marked repository. | D/Docs.tsx:1035-1037, 1680 | writer, read in the code 2026-11-23 | holds as written |
| A served page's contents, Previous/Next, Last updated, Copy as Markdown, search, "New in version X". | packages/docs-site/src/render.ts:486-549 | writer, read in the code 2026-11-23 | holds as written |
| A resource term is told only to a reader who may use the resource; the same bytes for a forbidden table and one with no description. | docs/documentation/fixed/p30-m8.md (leak test in docs-apps.test.ts); apps/control-plane/src/kernel/docs/describe.ts | writer, read in the code 2026-11-23 | holds as written |
| Types: eyebrow, cards, Related. | packages/docs-engine/src/set.ts:636-740 | writer, read in the code 2026-11-23 | holds as written |
| Answers are rows of docs-feedback; nothing about who answered. | front.ts:1233-1246 | writer, read in the code 2026-11-23 | holds as written |
| A deployed rename or move leaves a permanent redirect for 90 days; a preview has none. | apps/control-plane/src/kernel/apps/front.ts:1290-1306; docs/documentation/fixed/p30-m4.md | writer, read in the code 2026-11-23 | holds as written |
| The console has no picture upload and no search over all sites; an API route searches. | apps/control-plane/src/routes/docs.ts:333-383; grep of apps/console/src | writer, read in the code 2026-11-23 | holds as written |
| A doc writer holds doc:* and may write pages, docs apps and the feedback table. | apps/control-plane/src/routes/authoring.ts:236-250; builtinRoles.ts:36 | writer, read in the code 2026-11-23 | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| A site keeps no folder inside another, only top-level folders are offered; production is read only; a page of the repository is shown as repository; the deploy carries only documentation and the feedback table; stop/publish again are carried by a deploy. | run; workspace.ts:216-228 | second agent, 2026-11-23 | holds as written |
| Contents list, Previous and Next, Last updated, Copy as Markdown, "New in version X", search with and without script. | packages/docs-site/src/render.ts:486-549 | second agent, 2026-11-23 | holds as written |

## Phase 33, M5 (writer, instance 8097, 2026-11-24)

Lines are current at commit `661a2ceb`. Paths are under `packages/` unless stated.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| **On this page** lists `##` and `###` (and a `#`); `####` is not listed; indented by level (26 and 38 px). | docs-site/src/render.ts:357-364,543-549; css.ts:192-195 | writer, run on 8097 at 1440 and 390 px: Opening, Lights, Closing, Alarm listed; Back room not | holds as written |
| A column beside the page from 1280 px; a bar at the top below that. | docs-site/src/css.ts:95-99 | writer, run on 8097: column at 1440, bar at 390 | holds as written |
| A `#` link on every heading, shown on pointing or Tab, always shown with no pointer; pressing copies the address, says "Link copied", the page goes there. | docs-site/src/render.ts:387; css.ts:209-214; script.ts:147-166 | writer, run on 8097: hover, Tab 13 then Enter, URL got `#opening`, clipboard held the address, toast "Link copied" | holds as written |
| Text 16 px on a phone growing to 20 px; headings larger, each level its own size. | docs-site/src/css.ts:11,169 | writer, run on 8097: 16.2 px at 390, 20 px at 1440 | holds as written |
| **Color theme**: System, Light, Dark; three buttons wide, one cycling button at the foot of the drawer on a phone; kept in the browser across pages and a reload. | docs-site/src/render.ts:250,370-376; css.ts:222-234; script.ts:174-229 | writer, run on 8097: three buttons at 1440, one at 390 ("Color theme: System. Change it to Light"), Dark held on the next page | holds as written |
| On `/docs` a signed-in member's choice is kept with their settings; nobody signed in has it in the browser only. | docs-site/src/script.ts:207-215; apps/control-plane/src/routes/preferences.ts | writer, run on 8097: Maya chose Dark on `/docs`, `GET /api/v1/me/preferences` held `theme: dark`, System removed it; the not-signed-in case is code only | holds as written |
| The page takes the theme before it is first drawn. | docs-site/src/theme-script.ts:9-27 | code only (walked by the lane in `docs/documentation/fixed/p33-d1.md`) | holds as written |
| A page is an entry in a `changelog` folder or with the subject `changelog`; `::changelog` lists, `changelog.xml` serves. | docs-engine/src/changelog.ts:52-59; docs-site/src/feed.ts | writer, run on 8097 | holds as written |
