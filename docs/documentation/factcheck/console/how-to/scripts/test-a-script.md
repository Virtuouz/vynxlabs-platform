# Fact-check record: console/how-to/scripts/test-a-script

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps: New script, Path, Start from Greet someone; Save and run; Run the draft; Name field. | AU:926,939,787; screens/starters.ts:19 | writer, run on the instance 2026-11-23 | holds |
| Result tabs Logs, Input and output, Details; Events it published, None. | RU:1107-1330 | writer, run on the instance 2026-11-23 | holds |
| Why it failed and Go to line N; run of `throw` reports line 2. | RU:1180,1191 | writer, run on the instance 2026-11-23 | holds |
| Problems tab: line:column, Build tag, Problems (N), No problems found. | AU:1174-1187 | writer, run on the instance 2026-11-23 | holds |
| Runs tab: latest 20, · test. | AU:1223-1260 | writer, run on the instance 2026-11-23 | holds |
| Build with all drafts and its hint. | AU:792-797; CP/routes/authoring.ts:1310-1320 | writer, read from the code 2026-11-23 | holds |
| Edit with this input / Edit in {workspace}; masked values left empty. | RP:237; AU:437-475 | writer, run on the instance 2026-11-23 (the button seen on a run) | holds |
| Needs resource:write, code:write, run:write; `console_code_off` text; build refusal text. | CP/routes/authoring.ts:211-228,1273-1290 | writer, run on the instance 2026-11-23 (build refusal seen) | holds |
| Test runs deleted after seven days. | CP/kernel/execution/bundles.ts:194 | writer, read from the code 2026-11-23 | holds |
| Read-only editor text. | AU:777 | writer, read from the code 2026-11-23 | holds |
| Types are not checked at build. | packages/compose/src/index.ts:263-275 | writer, read from the code 2026-11-23 | holds |
| Build with all drafts, on, with another draft that does not build: "The code written in the console does not build. scr-broken.script.ts:3: Unexpected "}""; Problems stays "No problems found." | AU:792-797,809 | second agent, run on the instance 2026-11-23 | holds |
| Ctrl+Enter runs with the last run's input, not the typed one. | AU:344,584-586 | second agent, run on the instance 2026-11-23 | fault fixed (fb): the shortcut presses the Run button and runs what the form holds, confirmed on the instance; the page now says so |
| At 768 and 390 px the code area is 5 px high. | kit/SplitPane.tsx | second agent, run on the instance 2026-11-23 | fault fixed (fb): the stacked code area has a minimum height, confirmed on the instance (462 px at 390, 518 px at 768) |
