# Fact-check record: console/reference/screens/build/scripts

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. EX = `screens/Execution.tsx`, OP = `screens/ObjectPages.tsx`, AU = `screens/Authoring.tsx`, CS = `screens/CodeSettings.tsx`, RU = `screens/Runs.tsx`, RP = `screens/RunPage.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, CP = `apps/control-plane/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title Scripts; description "Code this workspace runs. Each script declares what it reaches, so a run can reach only that."; **New script** only in a dev workspace. | EX:196-205 (the description line is at EX:198) | writer, run on the instance 2026-11-23 | holds |
| Show chips All, Failing, Never run, Drafted with counts; `?filter=`, `?item=`. | EX:164-166,208-225 | writer, run on the instance 2026-11-23 | holds |
| Columns: Script with pill Draft / Draft, never deployed and description or No description; Uses with `table x` or Nothing outside; Last run with N in a row; Source Platform / Console / Repository. | EX:236-290 (245, 259, 270, 281) | writer, run on the instance 2026-11-23 | holds |
| The streak counts each script's latest 20 finished runs. | CP/routes/execution.ts:1182-1194, from the inventory | second agent, read from the code 2026-11-23 | holds |
| Empty and no-match texts, dev and production. | EX:296-325 | writer, read from the code 2026-11-23 | holds |
| Inspector: Open editor, Run, Offer to an agent…; each disabled without resource:write, run:write, binding:write; run and binding also count on the script alone; the first missing is named. | EX:171-186,330-360 | writer, run on the instance 2026-11-23 (all three buttons seen) | holds |
| Offer is not drawn for an undeployed script; Run says "Not deployed yet. Deploy it to run it, or try the draft from its editor." | EX:428; OA (`deployed = true` default, `if (!deployed) return null`) | writer, read from the code 2026-11-23 | holds |
| Inspector body: failure notice, description, Timeout, Retries, Managed in, uses lists, the two links. | EX:362-396 | writer, run on the instance 2026-11-23 | holds |
| No Remove on the inspector. | EX:330-360 (three footer buttons) | writer, read from the code 2026-11-23 | holds |
| Run dialog: title with and without ", as deployed"; Start Now/Later; Starts at; Priority -100 to 100; the three refusal texts; a later run is listed as waiting. | EX:439; ID:84,85,91,135 | writer, run on the instance 2026-11-23 (title with a draft; first refusal; waiting run) | holds |
| Fields and JSON switch beside the input form. | `@volvel/ui` SchemaForm; seen as "How to give it" Fields, JSON | writer, run on the instance 2026-11-23 | holds |
| A guest of an app cannot start a script: "Sign in to start a script". | CP/kernel/errors.ts:39, from the inventory | second agent, read from the code 2026-11-23 | holds |
| Shortcut g s; help topic build-scripts; section Build. | kit/shortcuts.ts:37; nav.ts:122-124 | writer, read from the code 2026-11-23 | holds |
| Page header: Last run {state} {when} or Not run yet; Run; Open the code; palette Open the code and See its runs. | OP:701,707,728,734 | writer, run on the instance 2026-11-23 | holds |
| Tabs Runs, Triggers, Used by, Settings, Source. | OP:770-830 | writer, run on the instance 2026-11-23 | holds |
| Runs tab: latest 20, State / Started with "· test" / Took; "No runs yet". | AU:1223-1260 | writer, run on the instance 2026-11-23 | holds |
| Triggers tab: Add a schedule (dev), production sentence, columns, Run it now, Pause…, Resume, empty texts. | OP:518,528,552,574 | writer, run on the instance 2026-11-23 (Add a schedule, empty texts) | holds |
| Used by: kind, path, how, "in a draft", "Nothing uses it, deployed or in a draft." | kit/references.tsx:88-136 | writer, run on the instance 2026-11-23 | holds |
| Settings tab: row labels, empty text, draft notices, Change the settings, Save as a draft, Cancel, saved notice, production and repository sentences. | OP:903-1000,1080,1097 | writer, run on the instance 2026-11-23 (rows, saved notice, draft) | holds |
| The page's form lacks What it does, Use as a flow step and the schema. | OP:1040-1105 (LimitsFields only); CS:100-318 | writer, run on the instance 2026-11-23 | holds |
| Source tab: as deployed now, `?run=` at that version with the failing line, "does not carry its source", Open the code to change it. | OP:630,646,651 | writer, run on the instance 2026-11-23 (as deployed now) | holds |
| Source needs bundle:read; list needs script:read. | CP/routes/operations.ts:640-642; CP/routes/execution.ts:1086 | writer, read from the code 2026-11-23 | holds |
| Running needs run:write at the workspace or the script; saving needs resource:write and code:write. | CP/routes/execution.ts:1303,1331; CP/routes/authoring.ts:632-639 | writer, read from the code 2026-11-23 | holds |
| Settings tab offers **Change the settings** for a script the repository holds (the page says it is not offered for production only). | OP:932 compares `ownership !== "repository"`; the stored value is `code` (OP:440, EX:`=== "ui"`) | second agent, run on the instance 2026-11-23 (messaging/send-sms, a repository script, shows the button) | fault fixed (fb): the guard compares `code`; Change the settings is not offered for a repository script, confirmed in the code (ObjectPages.tsx:932,992); the page now says so |
| Guest start answers 403 "Sign in to start a script." when the guest holds `run:write` on the script; 401 "Sign in or send an API key." with no sign-in | CP/routes/execution.ts:1328-1336; kernel/errors.ts:39 | second agent, run on the instance 2026-11-23 (an anonymous run:write binding, made and removed) | holds |
