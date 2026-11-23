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
