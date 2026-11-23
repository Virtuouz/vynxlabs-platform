# Fact-check record: console/how-to/scripts/change-script-settings

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Settings tab, Change the settings, Save as a draft, saved notice, Open the draft. | OP:951-1000,1097 | writer, run on the instance 2026-11-23 | holds |
| Give up after and Try again fields; values 90 and 2 gave 90 seconds and "2 times, 30 seconds apart, waiting longer each time". | CS:100-111; OP:903-915 | writer, run on the instance 2026-11-23 | holds |
| Deploy, This change only; toast; the inspector then shows Timeout 90s, Retries 2. | kit/DeployMenu.tsx:55-117; EX:372-376 | writer, run on the instance 2026-11-23 | holds |
| Autosave 3 seconds. | AU:491 | writer, read from the code 2026-11-23 | holds |
| Refusal when a deploy cannot go alone: Review all drafts. | kit/DeployMenu.tsx:55-75 | writer, read from the code 2026-11-23 | holds |
| Not offered in production or for repository code; grayed out without resource:write. | OP:884-994 | writer, read from the code 2026-11-23 | holds |
| Change the settings is not offered for a repository script. | OP:932 | second agent, run on the instance 2026-11-23 | fault fixed (fb): the guard compares `code`, so Change the settings is not offered for a repository script, confirmed in the code (ObjectPages.tsx:932,992); the page now names both |
