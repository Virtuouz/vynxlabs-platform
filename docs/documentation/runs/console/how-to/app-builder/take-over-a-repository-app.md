# Run log: console/how-to/app-builder/take-over-a-repository-app.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs) plus the working tree of the wave.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run. Apps made for the runs are named `abapp …`.
- The steps were run in pieces (several scripts), then the page was written from what was seen. A single end-to-end run of the finished text was not made.

## The steps as followed (on Clinic performance, `screens/performance`, managed in the repository)
- The workbench opened read only: header status "Published.", **Open the app** in place of Publish, the notice "This app is managed in the repository, so it is shown as it is published and cannot be changed here. Taking it over lets you change it here: the next publish then moves it out of the repository, and changes made there no longer reach it." with **Take over**.
- **Take over**: the notice became "You are taking this app over from the repository. The next publish moves it out of the repository, and changes made there no longer reach it."; **Preview** and **Publish** appeared. Nothing was changed or saved. The App Builder list afterward still read Published v1 with no "Edits not published": no draft was made.

## Not run
A change and a publish after the take-over. That would move Fernhill's own app out of its repository on the shared instance; the page's claim about the next publish is the screen's own sentence plus `kernel/execution/deploy.ts:481`. The page is not presented as finished: the result after a publish was not seen.

## Second check, 2026-11-23 (second agent)
- Instance http://localhost:8091 at commit `87000022` plus the working tree. Playwright headless. My own apps are named `chk2 …` (in Fernhill's Sandbox); no Fernhill app, table or person was changed. People: Maya Brooks (tenant admin); Abchk Maker (a member made for the check, App maintainer in Sandbox: `interface:write`, no `resource:write`); Abchk Dev (Developer in Sandbox: no `deployment:write`); Amara Okafor (viewer). Walked at 1440, 900, 768 and 390 px; light at all and dark at 1440, 768 (list, dialog, workbench) and 390 (list, workbench). A session reload was made for the rename and the page order.
- Not run: a change and a publish after the take-over. It would move a repository app of Fernhill's out of the repository, and the instance has no repository app of its own to use; the page's claim rests on the screen's sentence and `deploy.ts:490-497`. The page is not presented as finished.
