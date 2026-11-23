# Fact-check record: console/how-to/flows/draw-and-deploy-a-flow

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Labels and sequence as the console words them (see the screen records) | FlowEditor.tsx, DeployMenu.tsx, FlowTestPanel.tsx, Operate.tsx:1095-1190, RunPage.tsx:700-895, CancelOlder.tsx, RetryOnVersion.tsx | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- The header pill after a deploy reads **Deployed** (kit/status.tsx:80; FlowEditor.tsx:2352-2365), not **Live**: the earlier run log took the live-connection indicator (kit/LiveIndicator.tsx) for the pill. Corrected. Seen on the instance at 390 px dark: pill "Deployed".
- Toast "Deployed <path> as version N." and "<path> cannot be deployed alone" with **Review all drafts**: kit/DeployMenu.tsx:65-84,117. "Nothing leads to <id>.": FlowEditor.tsx:613.
