# Fact-check record: console/reference/screens/build/script-settings

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Field labels and hints of timeout, tries, wait, backoff, uses lists, pool, memory, runs at once, lane key, tables, sources, events, groups, failure fields. | CS:100,111,126,142,157-278,291-310 | writer, run on the instance 2026-11-23 (the form and the editor were opened) | holds |
| Ranges: timeout 1-3600, tries 0-10, wait 0-3600, memory 64-4096, runs at once 1-64. | CS:100-135,207-230; KINDS:157-210 | writer, read from the code 2026-11-23 | holds |
| New script defaults: 60 s, 0 tries, 30 s, backoff on; memory empty is 512. | AU:226-228; CS:215 | writer, run on the instance 2026-11-23 (new script opened) | holds |
| The lane key is disabled until Runs at once is set; pattern `input.` and one to five fields. | CS:240-250; KINDS:225-232 (`CONCURRENCY_KEY`) | writer, read from the code 2026-11-23 | holds |
| Backoff: the wait doubles with each try. | KINDS:196-198 | writer, read from the code 2026-11-23 | holds |
| Worker pool pattern and 40 characters; default pool option; hint text. | KINDS:236-243; CS:186-198 | writer, read from the code 2026-11-23 | holds |
| A deploy to production refuses what is not bound; a dev deploy warns; connection groups need nothing bound. | KINDS:262-275 (the `uses` description and `connectionGroups`) | writer, read from the code 2026-11-23 | holds |
| onFailure: script started with the failed run as input; notify posts to an HTTP connection; its own choice replaces the workspace default. | CS:291-310; KINDS:310-318; SDK/index.ts:213-218 | writer, read from the code 2026-11-23 | holds |
| At most one alert for a script per 10 minutes; a handler's failure starts nothing. | CP/kernel/execution/alerts.ts:61,217 | writer, read from the code 2026-11-23 | holds |
| Use as a flow step: Step name max 60, hint, Icon None, Group max 40 with hint, A step may hand it with three options; shown after a name is set. | AU:640-710 | writer, run on the instance 2026-11-23 (field names seen on the new script) | holds |
| Clearing the step name removes icon and group, which return when a name is typed again. | AU:306-312 (`clearedStep`), AU:665-668 | writer, read from the code 2026-11-23 | holds |
| Input schema fields: label, hint, and "The schema is not valid JSON." | AU:316,721,729 | writer, run on the instance 2026-11-23 | holds |
| Not in the console: mcp.name, key and entry. | SDK/index.ts:75-90; AU body fields | writer, read from the code 2026-11-23 | holds |
| States: draft notices, saved notice, "Your changes are added to it." | OP:951,957-958,1080 | writer, run on the instance 2026-11-23 (saved notice, draft) | holds |
| Page form: not offered in production or for repository code. | OP:991-992 | writer, read from the code 2026-11-23 | holds |
| Permissions for settings. | OP:884 (`resource:write`); CP/routes/authoring.ts:632-639 | writer, read from the code 2026-11-23 | holds |
| Timeout message "The run took longer than its limit of N seconds."; memory message. | WK/worker.ts:553,173 | writer, read from the code 2026-11-23 | holds |
