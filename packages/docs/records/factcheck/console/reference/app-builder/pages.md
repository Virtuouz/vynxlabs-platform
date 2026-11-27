# Fact-check record: console/reference/app-builder/pages

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`packages/docs/records/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

Checked by: second agent, 2026-11-23. The files were read at commit `87000022` (lines cited at `5ebf1c80` moved by a few lines; the claims hold at the places named unless a row says otherwise). Each label was also searched for in the console source; screen behavior was run on http://localhost:8091 as Maya Brooks, as a member with only interface:write, as a viewer and on a production workspace.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Four kinds and their names | `screens/builder/pageKinds.ts:6-16`; `PageSettings.tsx:41-46` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Kind line text | `pageKinds.ts:13-14` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Menu holds only Page | `pageKinds.ts:21-22` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Served addresses | `packages/screens/src/navigation.tsx:7-20` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Add a page dialog: Start from, Table, Name of the page, 100 chars, Add the page | `screens/builder/NewPageDialog.tsx:294-431` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Start descriptions and words | `screens/builder/starters.ts:37-61` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| List start: search when text columns, table 25 a page, detail side sheet, New button and modal form; reused if existing | `starters.ts:97-160` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Record page start: detail plus up to 6 related tables filtered by this record | `starters.ts:44-45,166-218` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Room for pages message; tables-unread message | `NewPageDialog.tsx:348-367,414-419` | second agent, 2026-11-23 | holds (code read at 87000022) |
| A start is one change with a notice; on an empty page it replaces that page | `AppBuilder.tsx:358-380`; `starters.ts:155-159` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Page settings tabs Display and Data; Data only for non-page kinds | `PageSettings.tsx:76-85` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Page type tiles; kind change keeps table/size | `PageSettings.tsx:122-143`; `pageKinds.ts:64-74` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Title field, 100 chars, hint | `PageSettings.tsx:144-160` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Icon: 22 options plus No icon; page only | `PageSettings.tsx:161-192`; `packages/ui/src/pageIcons.ts:32+`; run: select options | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Size: sheet and modal only; widths 480/720/960/1200/full; default medium | `PageSettings.tsx:193-210`; `pageKinds.ts:25-42` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Help topic picker text | `PageSettings.tsx:213-231` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Data tab: Opens on, Table of its record, hints, None for modal | `PageSettings.tsx:233-263` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Reorder by grip and arrows; arrows absent with one page | `PagesList.tsx:181,217-259` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Remove page: menu, only when more than one page, confirm text, names openers, link to each | `PageSettings.tsx:94-109`; `AppBuilder.tsx:381-418,685`; `screens/builder/publishCheck.ts:464-492` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Limits: 20 pages, 30 widgets, 8 filters | `packages/widget-sdk/src/page.ts:200-204` | second agent, 2026-11-23 | holds (code read at 87000022) |
