# Fact-check record: console/how-to/flows/retry-or-cancel-runs

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Labels and sequence as the console words them (see the screen records) | FlowEditor.tsx, DeployMenu.tsx, FlowTestPanel.tsx, Operate.tsx:1095-1190, RunPage.tsx:700-895, CancelOlder.tsx, RetryOnVersion.tsx | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- Refusals: "The flow run succeeded: nothing failed to retry.", other-input refusal, changed kept steps, started-by-another-flow: routes/flows.ts:1230-1253. Cancel by age cap 10,000 per call (bulk-cancel.ts:10); "Retried once"/"Retry of a run": RunPage.tsx:820-825. Cancel flow run ran on the instance (run ended Canceled).
