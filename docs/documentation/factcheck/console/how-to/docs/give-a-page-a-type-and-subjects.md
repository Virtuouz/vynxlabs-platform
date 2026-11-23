# Fact-check record: console/how-to/docs/give-a-page-a-type-and-subjects.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Folder's own page: Type reads "None: the pages under it say their own"; page: "Use the folder's (X)". | D/PageDetails.tsx:101-109 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Type labels Tutorial, How-to guide, Reference, Explanation. | packages/docs-engine/src/diataxis.ts:15-21 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| New page Type select: None / Folder: X / four labels; starts from an outline; no `type:` written when the folder says it. | D/Docs.tsx:1239-1254; packages/docs-engine/src/ops.ts:126-133, 452-476 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Add a subject: Enter or Subject; lowercase with hyphen; five at most; disabled hint; Remove; offered buttons. | D/PageDetails.tsx:22-30, 95-100, 182-260 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Preview shows eyebrow, cards, Related. | D/Served.tsx; D/DocEditor.tsx:556-591 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Related: up to four of each other type, sharing a subject or `about`, most shared first, then same collection. | packages/docs-engine/src/set.ts:636-695 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Cards "What do you want to do?" on a collection's page and on the home page, when two or more types; summaries. | packages/docs-site/src/render.ts:437-450; packages/docs-engine/src/diataxis.ts:31-36; set.ts:711-740 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| Search window has "Kind of page" buttons Any kind and each type (plural titles). | packages/docs-site/src/script.ts:370-382; render.ts:268 | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| The warnings and their texts (type_steps_missing, type_steps_present, type_title, type_goal_missing, type_unknown, subjects_many, subject_once, type_folder); all warnings; deploy never refused for them. | packages/docs-engine/src/diataxis.ts:96-187; fixed/p30-m3.md | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |
| subject_once and type_folder are said by the deploy and build, not the editor. | docs/documentation/fixed/p30-m3.md ("Left, and why"); run | writer, run on the instance 2026-11-23 at 1440 px, light | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| The warnings and their words (steps, title, heading, type, six subjects, subject on one page, type in an untyped folder). | packages/docs-engine/src/diataxis.ts:120-180 | second agent, 2026-11-23 | holds as written |
| Cards "What do you want to do?" with a card per type and their sentences; a count "1 page →"; the search window's Any kind and a button per type present; Related up to four per type. | diataxis.ts:32-35, set.ts:636 `RELATED_PER_TYPE = 4`; run on a repository site with how-to and explanation pages | second agent, 2026-11-23 | holds as written |
| Folder warning grammar. | diataxis.ts:148 writes "says it is a explanation" | fault: new, wording ("a ${type}") | the page writes it "a …", leaving the type's name out |
