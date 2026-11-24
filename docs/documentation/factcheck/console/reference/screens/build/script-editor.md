# Fact-check record: console/reference/screens/build/script-editor

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. EX = `screens/Execution.tsx`, OP = `screens/ObjectPages.tsx`, AU = `screens/Authoring.tsx`, CS = `screens/CodeSettings.tsx`, RU = `screens/Runs.tsx`, RP = `screens/RunPage.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, CP = `apps/control-plane/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Pills Not saved, Draft, Deployed, Removing, Unsaved changes; From the repository. | AU:842; kit/status.tsx:77-81 | writer, run on the instance 2026-11-23 (Not saved, Draft, Deployed) | holds |
| Buttons: Offer to an agent… (Deployed or repository), Name and path, Discard draft / Remove, Save draft, Deploy. | AU:849,863,874,902,905 | writer, run on the instance 2026-11-23 | holds |
| Name and path dialog: Key (read only), Path, Title, Save as a draft. | screens/ResourceIdentity.tsx:163,290-330 | writer, read from the code 2026-11-23 | holds |
| Discard: "Discard this draft?"; Remove: "Remove this script?"; Keep: "Keep this script?"; repository text. | kit/RemoveDraftButton.tsx:28-76 | writer, read from the code 2026-11-23 | holds |
| Deploy menu: This change only; Review all drafts; toast "Deployed {path} as version N."; Promote to {name}; refusal "cannot be deployed alone". | kit/DeployMenu.tsx:55-117 | writer, run on the instance 2026-11-23 (toast: Deployed scr-greet as version 20.) | holds |
| Deploy is shown only for a saved draft with no unsaved changes. | AU:904-905 | writer, read from the code 2026-11-23 | holds |
| Removal notice and Keep this script; no autosave when removed. | AU:501-502,977-980 (`removed` makes the editor read only), AU:486 (autosave runs only for draft and deployed) | writer, read from the code 2026-11-23 | holds |
| New script: Path (rule, hint), Start from with three starters, off once changed; "Something already exists at this path…". | AU:226,253,926,939,967; screens/starters.ts:19,38,63 | writer, run on the instance 2026-11-23 | holds |
| A new script waits for the first save; a browser copy is offered with Restore it / Discard. | AU:1028,1036 | writer, read from the code 2026-11-23 | holds |
| Settings disclosure is open on a new script, closed on an existing one. | AU:1055 | writer, run on the instance 2026-11-23 | holds |
| Code: default export, imports only @volvel/sdk and node:, 256 K characters, node24, no type check. | packages/compose/src/index.ts:95,205,263,285; packages/manifest/src/kinds.ts:112 | writer, read from the code 2026-11-23 | holds |
| Schema read from the code; the three status texts; removing the export keeps the last schema. | AU:721,748-754; CP/kernel/authoring.ts:852-855 | writer, read from the code 2026-11-23 | holds |
| Input and output are parsed at run time; SchemaError texts. | packages/sdk/src/index.ts:238-247; packages/compose/src/index.ts:125-141 | writer, read from the code 2026-11-23 | holds |
| Test pane: input form, Save and run / Run the draft, Build with all drafts and its hint, Result / Problems / Runs tabs. | AU:787,792,1087,1122 | writer, run on the instance 2026-11-23 | holds |
| Result: state, times, Open full view, Cancel run confirm, Copy as curl, Why it failed, Go to line N, Logs / Input and output / Details, Events it published (None.). | RU:1101,1155,1162,1166 and the Result panel from RU:1107 | writer, run on the instance 2026-11-23 (Why it failed, Go to line 2, Logs, None.) | holds |
| Problems: line:column, tag Build, "Problems (N)", "No problems found."; own file only. | AU:809,1174-1187 | writer, run on the instance 2026-11-23 | holds |
| A build refusal on a test shows the build error with file and line, and Problems (N) counts it. | AU:566-585,809 | writer, run on the instance 2026-11-23 (scr-broken.script.ts:6) | holds |
| Test runs are deleted after seven days. | CP/kernel/execution/bundles.ts:194 | writer, read from the code 2026-11-23 | holds |
| Autosave after 3 seconds; not for a new script; a failed one is not retried until a change. | AU:486-491 | writer, read from the code 2026-11-23 | holds |
| A draft keeps 30 versions; a clash shows Copy what I wrote and Load their version. | CP/kernel/authoring.ts:396; kit/DraftClash.tsx:11-60 | writer, read from the code 2026-11-23 | holds |
| Leave guard text. | AU:431 | writer, read from the code 2026-11-23 | holds |
| Read-only cases: production notice, repository notice, core notice, removal. | AU:977-1003; kit/objects.tsx:148-175 | writer, read from the code 2026-11-23 | holds |
| Opened from a run: carried-input notice and masked values. | AU:437-475,1043-1046 | writer, read from the code 2026-11-23 | holds |
| Permissions: save resource:write + code:write; test run:write + code:write; console_code_off text. | CP/routes/authoring.ts:211-228,632-639,1273-1290 | writer, read from the code 2026-11-23 | holds |
| Shortcuts: ⌘S, ⌘↵ shown as Ctrl+Enter. | AU:423,426; seen in the pane | writer, run on the instance 2026-11-23 | holds |
| Ctrl+Enter / ⌘↵ runs the draft with the input of the last run (`testInput`), not the form's current input; with none run yet the input is `{}` and the server refuses it. | AU:344,560-586 | second agent, run on the instance 2026-11-23 | fault fixed (fb): the shortcut presses the pane's Run button, so it runs what the form holds, confirmed on the instance (typed a name, Ctrl+Enter, run succeeded with it); the page now says so |
| Below the laptop width the code area is 5 px high (SplitPane stacks the panes and gives the first no height); the test pane takes all the room. | kit/SplitPane.tsx:140-146 (no basis for the first pane when stacked) | second agent, run on the instance 2026-11-23 (768 and 390 px) | fault fixed (fb): the stacked first pane has a minimum height, confirmed on the instance (the code area is 462 px at 390 and 518 px at 768) |
| Build with all drafts: another draft that does not build stops the test and the result names its file and line; Problems lists none of it. | AU:792-797; CP/routes/authoring.ts | second agent, run on the instance 2026-11-23 (scr-broken drafted with an extra brace, scr-greet tested) | holds |
