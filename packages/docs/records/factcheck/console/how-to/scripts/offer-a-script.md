# Fact-check record: console/how-to/scripts/offer-a-script

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Dialog text, Service account select, Offer / Continue, Cancel, Done. | OA:45,191,205 | writer, run on the instance 2026-11-23 | holds |
| Confirmation text, Address for the agent, Copy the address, Keys and tools of {name}. | OA:111,121 | writer, run on the instance 2026-11-23 | holds |
| No accounts text and Create a service account link. | OA:144 | writer, read from the code 2026-11-23 | holds |
| Already offered: "It is offered to this account already. Continue to see where the agent connects." | OA:199 | writer, read from the code 2026-11-23 | holds |
| No Agent runner role text. | OA:188 | writer, read from the code 2026-11-23 | holds |
| Role agent_runner has run:write and flow_run:write. | packages/db/migrations/0053_agent_runner.sql:3-6 | writer, read from the code 2026-11-23 | holds |
| Not drawn for an undeployed script; needs binding:write at the workspace or the script. | OA:239 | writer, read from the code 2026-11-23 | holds |
| In the editor: header button for Deployed. | AU:849-856 | writer, run on the instance 2026-11-23 | holds |
| Continue: an account already offered shows "It is offered to this account already. Continue to see where the agent connects." and the button reads Continue; it leads to the done view with the address. | OA | second agent, run on the instance 2026-11-23 (api-docs-agent on scr-greet) | holds |
