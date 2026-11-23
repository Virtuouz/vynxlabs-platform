# Fact-check record: console/how-to/app-builder/take-over-a-repository-app

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Repository app listed with the managed-in-repository text | `kit/RemoveDraftButton.tsx:73-79` | writer (read, run) | |
| Read-only workbench with Open the app; the notice and Take over | `AppBuilder.tsx:482-492,556-569` | writer (read, run) | |
| After Take over: notice text, Preview and Publish drawn, no draft made until a change | `AppBuilder.tsx:115-117,564-568`; run: list unchanged | writer (read, run) | |
| Rename disabled for repository app; Remove not drawn | `Interfaces.tsx:155-177`; `RemoveDraftButton.tsx:73-79` | writer (read) | |
| Server refusal for a removal draft of a repository app | `apps/control-plane/src/kernel/authoring.ts:285-289` | writer (read) | |
| Read-only line texts | `screens/builder/ReadOnly.tsx:32-36` | writer (read) | |
| A deploy of a console draft switches ownership | `apps/control-plane/src/kernel/execution/deploy.ts:481-482` | writer (read) | |
