# Fact-check record: console/how-to/app-builder/publish-an-app

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

Checked by: second agent, 2026-11-23. The files were read at commit `87000022` (lines cited at `5ebf1c80` moved by a few lines; the claims hold at the places named unless a row says otherwise). Each label was also searched for in the console source; screen behavior was run on http://localhost:8091 as Maya Brooks, as a member with only interface:write, as a viewer and on a production workspace.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| View as menu and faded Hidden for | `BuilderHeader.tsx:192-230`; `PageView.tsx:1042` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Preview: opens new tab, bar texts, runs buttons | `AppBuilder.tsx:269-281`; `AppPreview.tsx:80-95` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Check headings and the deploy line (first time / live keeps working) | `PublishCheck.tsx:175-194` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Rows: data sources, actions, buttons with no label, forms, empty widgets, approvals, phone, help topic, groups, refusals | `screens/builder/publishCheck.ts:183-421` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Fail vs warn states and marks | `PublishCheck.tsx:27-31,167-169` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Show it; N changes list; Try as … first; Publish N changes | `PublishCheck.tsx:223-285` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Check could not be made and Check again; Could not check … | `PublishCheck.tsx:130-165,195-201` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Success notice and Open the app; header Published. | `AppBuilder.tsx:312-339` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Publish deploys the interface and its app, message Deploy <title> | `AppBuilder.tsx:316-323` | second agent, 2026-11-23 | holds (code read at 87000022) |
| 403 text | `AppBuilder.tsx:341-346` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Restore an earlier draft | `DraftHistory.tsx:81-176`; `AppBuilder.tsx:300-311` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Permissions for publish and check | `apps/control-plane/src/routes/authoring.ts:1021-1030,1113` | second agent, 2026-11-23 | holds (code read at 87000022) |
| App maintainer role | `builtinRoles.ts:8-17` | second agent, 2026-11-23 | holds (code read at 87000022) |
| A Button with an empty Says gives 'Button on X: needs label.' once in the N to fix list; Publish is off | run | second agent, 2026-11-23 | holds; page row added |
| A member with only interface:write reads the check (tables and queries 'could not be checked: needs resource:read'), publishes and previews | run (Abchk Maker with App maintainer) | second agent, 2026-11-23 | holds |
| 'The check could not be made' with 'Check again' when the preview request fails; Publish off until it can be made | `PublishCheck.tsx:171-200`; run with the preview request made to fail | second agent, 2026-11-23 | holds |
| 'Try as <group> first' closes the panel and sets View as; the note 'Rows are yours…' shows | run (a Button limited to Billing) | second agent, 2026-11-23 | holds |
