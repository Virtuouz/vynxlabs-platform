# Fact-check record: console/how-to/app-builder/publish-an-app

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| View as menu and faded Hidden for | `BuilderHeader.tsx:192-230`; `PageView.tsx:1042` | writer (read, run) | |
| Preview: opens new tab, bar texts, runs buttons | `AppBuilder.tsx:269-281`; `AppPreview.tsx:80-95` | writer (read, run) | |
| Check headings and the deploy line (first time / live keeps working) | `PublishCheck.tsx:175-194` | writer (read, run) | |
| Rows: data sources, actions, buttons with no label, forms, empty widgets, approvals, phone, help topic, groups, refusals | `screens/builder/publishCheck.ts:183-421` | writer (read, run) | |
| Fail vs warn states and marks | `PublishCheck.tsx:27-31,167-169` | writer (read) | |
| Show it; N changes list; Try as … first; Publish N changes | `PublishCheck.tsx:223-285` | writer (read, run) | |
| Check could not be made and Check again; Could not check … | `PublishCheck.tsx:130-165,195-201` | writer (read) | |
| Success notice and Open the app; header Published. | `AppBuilder.tsx:312-339` | writer (read, run) | |
| Publish deploys the interface and its app, message Deploy <title> | `AppBuilder.tsx:316-323` | writer (read) | |
| 403 text | `AppBuilder.tsx:341-346` | writer (read) | |
| Restore an earlier draft | `DraftHistory.tsx:81-176`; `AppBuilder.tsx:300-311` | writer (read, run) | |
| Permissions for publish and check | `apps/control-plane/src/routes/authoring.ts:1021-1030,1113` | writer (read) | |
| App maintainer role | `builtinRoles.ts:8-17` | writer (read) | |
