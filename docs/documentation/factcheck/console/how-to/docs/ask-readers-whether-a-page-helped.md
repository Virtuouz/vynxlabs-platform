# Fact-check record: console/how-to/docs/ask-readers-whether-a-page-helped.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Menu items Turn on / Turn off page feedback…; dialog title and intro; what it lists; button labels; taken-path notice. | D/Docs.tsx:506-527, 1356-1442 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| The table `docs-feedback` and its six columns. | packages/docs-engine/src/workspace.ts:44-61 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Success message "<site> will ask its readers when you deploy."; deploy question names the table. | D/Docs.tsx:746, 203-207 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Form "Was this page helpful?" with Yes and No; "Thank you for saying."; preview disabled with "Answers are not kept in a preview." | packages/docs-site/src/render.ts:415-433; script.ts:197-215; front.ts:1394 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A row: site_key (app key), site (title), page, helpful, version (bundle id), at. | apps/control-plane/src/kernel/apps/front.ts:1236-1253 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| One answer a page: remembered a year by the reader's browser (cookie `vd_said`, Max-Age one year). | front.ts:95, 1268-1277 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| 30 answers a minute for one address and workspace; the 429 and 503 messages. | front.ts:184, 1205-1207, 1257 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Nothing about who answered is kept (scope principal null); a field no person sees (website) is a robot's and nothing is kept. | front.ts:1233-1246 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Turn off keeps the table; table per site no longer made. | D/Docs.tsx:368-377; docs/sdk-guide.md:301-325 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A deploy refuses a site whose table is not there or lacks the columns. | docs/sdk-guide.md:325; packages/docs-engine/src/workspace.ts:63-80 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| A doc writer may draft and deploy only this table. | apps/control-plane/src/routes/authoring.ts:236-250 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| The helpful line needs a deployed site that asks and a reader of the table. | D/Docs.tsx:1588-1600, 1634-1639 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| Turn on (three drafts), the deploy question with the table, Turn off page feedback and "Deploy 1 change", the app's feedback becomes null and the table stays. | run on a console site | second agent, 2026-11-23 | holds as written |
| 30 answers a minute for an address and workspace; the cookie lasts a year; 429 and 503 words. | front.ts:184, 1203, 1242, 1253 | second agent, 2026-11-23 | holds as written |
