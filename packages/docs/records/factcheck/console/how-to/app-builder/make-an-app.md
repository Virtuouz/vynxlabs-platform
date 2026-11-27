# Fact-check record: console/how-to/app-builder/make-an-app

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`packages/docs/records/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

Checked by: second agent, 2026-11-23. The files were read at commit `87000022` (lines cited at `5ebf1c80` moved by a few lines; the claims hold at the places named unless a row says otherwise). Each label was also searched for in the console source; screen behavior was run on http://localhost:8091 as Maya Brooks, as a member with only interface:write, as a viewer and on a production workspace.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Build > App Builder; Make an app; dialog fields and defaults | `nav.ts:125`; `screens/Interfaces.tsx:223-306` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Address from name; 40 characters; lower-case, digits, dashes | `screens/builder/data.ts:27-43` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Result: workbench with one page named after the app; status Saved. Not published yet. | `Interfaces.tsx:243-262`; `AppBuilder.tsx:446` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Add a page, A list of …, Table select appears; notice text | `NewPageDialog.tsx:353-404`; `starters.ts:149-159` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| List row says Not published and Once it is published | `Interfaces.tsx:114-147` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Remove page of the empty first page; confirm Remove the page | `AppBuilder.tsx:381-418` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Taken address message | `ask.tsx:114-117` | second agent, 2026-11-23 | holds (code read at 87000022) |
| At most 20 pages; room message | `page.ts:200`; `NewPageDialog.tsx:414-419` | second agent, 2026-11-23 | holds (code read at 87000022) |
