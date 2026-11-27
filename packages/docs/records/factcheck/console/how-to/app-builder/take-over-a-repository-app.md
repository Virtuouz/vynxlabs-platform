# Fact-check record: console/how-to/app-builder/take-over-a-repository-app

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`packages/docs/records/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

Checked by: second agent, 2026-11-23. The files were read at commit `87000022` (lines cited at `5ebf1c80` moved by a few lines; the claims hold at the places named unless a row says otherwise). Each label was also searched for in the console source; screen behavior was run on http://localhost:8091 as Maya Brooks, as a member with only interface:write, as a viewer and on a production workspace.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Repository app listed with the managed-in-repository text | `kit/RemoveDraftButton.tsx:73-79` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Read-only workbench with Open the app; the notice and Take over | `AppBuilder.tsx:482-492,556-569` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| After Take over: notice text, Preview and Publish drawn, no draft made until a change | `AppBuilder.tsx:115-117,564-568`; run: list unchanged | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Rename disabled for repository app; Remove not drawn | `Interfaces.tsx:155-177`; `RemoveDraftButton.tsx:73-79` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Server refusal for a removal draft of a repository app | `apps/control-plane/src/kernel/authoring.ts:285-289` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Read-only line texts | `screens/builder/ReadOnly.tsx:32-36` | second agent, 2026-11-23 | holds (code read at 87000022) |
| A deploy of a console draft switches ownership | `apps/control-plane/src/kernel/execution/deploy.ts:490-497` | second agent, 2026-11-23 | holds (line moved to 490-497) |
