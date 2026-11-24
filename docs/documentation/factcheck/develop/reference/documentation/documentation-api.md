# Fact-check record: develop/reference/documentation/documentation-api.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The three docs routes and `/terms`, their access text. | apps/control-plane/src/routes/docs.ts:161-166, 296-301, 333-339; routes/terms.ts:181-186 | writer, run on the instance 2026-11-23 (search 200, 201 characters 400, terms 200) | holds as written |
| The list's fields apps, pages, issues, tables. | routes/docs.ts:35-115, 168-262 | writer, run on the instance 2026-11-23 (search 200, 201 characters 400, terms 200) | holds as written |
| `preview` is the app's address plus `_draft/`; `key` falls back to path. | routes/docs.ts:274-282 | writer, run on the instance 2026-11-23 (search 200, 201 characters 400, terms 200) | holds as written |
| One page: page, source, revision, deployedSource; 404 "The page at <path>". | routes/docs.ts:290-330 | writer, run on the instance 2026-11-23 (search 200, 201 characters 400, terms 200) | holds as written |
| Search: `q` at most 200; up to 10 for each app and 20 in all; items fields. | routes/docs.ts:333-383; run (201 characters gave 400) | writer, run on the instance 2026-11-23 (search 200, 201 characters 400, terms 200) | holds as written |
| A save names the revision; 409 draft_changed; create: true and path_taken. | apps/control-plane/src/kernel/authoring.ts:290-312; routes/authoring.ts:595-612 | writer, run on the instance 2026-11-23 (search 200, 201 characters 400, terms 200) | holds as written |
| `/terms` answers terms, resources, extensions, attachments, topics, as the caller may read; guests rate-limited. | routes/terms.ts:20-60, 181-215 | writer, run on the instance 2026-11-23 (search 200, 201 characters 400, terms 200) | holds as written |
| No console screen calls the search route. | grep of apps/console/src for `docs/search`: none | writer, run on the instance 2026-11-23 (search 200, 201 characters 400, terms 200) | holds as written |

## Second check

Checked by: second agent, 2026-11-23. Every label, quoted message and limit in the page was searched for in the console and engine source by script, and the claims below were run on the instance http://localhost:8091 (a tenant of the checker's own, d31chk, a dev workspace and a production workspace; a doc writer and a tenant admin) at 1440 px light, with 390 px dark and 768 px for the screens.

| Claim | Source or run | Checked by | Result |
| --- | --- | --- | --- |
| `/docs` answers apps, pages, issues, tables; an app also has `deployed` and `drafted`. | run: GET as a tenant admin | second agent, 2026-11-23 | corrected: the two fields were missing |
| 404 for a missing page. | run: "The page at nope/none was not found." | second agent, 2026-11-23 | corrected |
| Search: 200 characters, 400 beyond; spelling slip (`refnd`) matches; `/terms` answers terms, resources, extensions, attachments, topics. | run | second agent, 2026-11-23 | holds as written |
