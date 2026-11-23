# Fixed: lane voc-state (one state, one name; deploy words in the console)

Merged `phase-29-correct-the-product` first. No migration, no API or contract change.

Tests (words changed in the tests first, seen failing against the old words): `kit/status.test.tsx` (Not tested, Set up here, Not set up here; reachable/unreachable removed), `Connections.test.tsx` (failure sentence `Failed (HTTP 401): ...`, `Not set up here`), `Rollback.test.tsx` (`versionMove`, Deploy/Roll back confirms), `Release.test.tsx` ("Versions is the one list ...", "VOC-41 ... Deploy ... Versions"), `enforce.test.ts` (Badge word list).

- **VOC-34, 35.** `ObjectPages.tsx` already drew health with `ConnectionHealth` and `HealthCell` (Reached/Failed); the Answered pills were gone. `Environments.tsx` (database locations) drew `reachable`/`unreachable` pills and "Answers": now Reached/Failed, same words as `kit/health.tsx`. `kit/status.tsx` no longer has `reachable`/`unreachable`.
- **VOC-37.** `ConnectionWizard.tsx testText`: failure opens `Failed (HTTP 401): message`; a test that did not finish `Failed: ...`.
- **VOC-40.** `status.tsx`: `unchecked` is "Not tested", `bound`/`unbound` are "Set up here"/"Not set up here"; `RunPage.tsx`, `Runs.tsx` tags the same. `Domains.tsx` "Not checked yet" is a DNS check, left.
- **VOC-41, 42, 43, 53.** `nav.ts` `sectionLabel`: "Deploy" in dev, "Versions" in production, used by the side panel, tab title and palette in `Shell.tsx`; `Release.tsx` title and eyebrow; "Deploy path" in `Shell.tsx`.
- **VOC-45, 46.** `Execution.tsx` `versionMove` (one function) and `DeployVersion` (was `ActivateVersion`): "Deploy this version" / "Roll back to this version", "Deploy version N to W?" / "Roll back W to version N?", actions "Deploy"/"Roll back" (+ " in production"). `Release.tsx`: "Versions and roll back", "Rolling back deploys an earlier version", "never run here".
- **VOC-47.** `packages/cli/src/commands.ts`: deploy "upload and deploy", promote "Promote ... to the workspace", rollback "Roll back to an earlier version".

Siblings looked at: all `StatePill state=bound/unbound` users (Data.tsx, Execution.tsx, ObjectPages.tsx) take the word from the one table. "Open Releases" link in `ask.tsx`, "Releases" in `ScheduleForm.tsx`, `Overview.tsx`, `FlowEditor.tsx`/`ResourceEditor.tsx` comments, and `Release.tsx:472` "Not bound here" (a deploy warning) were not changed: the first points at access releases (voc-access); ScheduleForm and Overview ("Deploy it from Releases", action "Releases") still name the deploy screen and should read "Deploy" (left to a later row, found).

Found: `ScheduleForm.tsx:399, 453` and `Overview.tsx:217` say "Releases" for the deploy screen. Help topic `operate-release` title comes from docs content.

Screens to walk: workspace side panel and palette in a dev and a production workspace; Deploy/Versions page; Connections list and sheet (Test failure); Environments database locations; Run page connections. Polish gate: states unchanged; keyboard unchanged; copy ends in periods.

For docs (phase 31): `packages/docs/content/operate/releases.md` and `operate/index.md` call the screen "Releases" and the button "Activate"; CLI reference should use the new deploy/promote/rollback lines; the connection pages say "Not checked", "Bound", "Reachable".
