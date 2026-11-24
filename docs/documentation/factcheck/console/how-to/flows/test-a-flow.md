# Fact-check record: console/how-to/flows/test-a-flow

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Labels and sequence as the console words them (see the screen records) | FlowEditor.tsx, DeployMenu.tsx, FlowTestPanel.tsx, Operate.tsx:1095-1190, RunPage.tsx:700-895, CancelOlder.tsx, RetryOnVersion.tsx | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- Mail subject "[Test] Approval needed: <title>" (approval-links.ts:134). "The flow changed since this test.", "Test the draft", "Build with all drafts", "Open the run", "The last test did not reach this step.", **Test from**, "As JSON" (SchemaForm via InputForm, InputDialog.tsx:277-300; InputDialog.test.tsx:71): FlowTestPanel.tsx:71-220. Panel seen on the instance at 390 px in dark and light.
