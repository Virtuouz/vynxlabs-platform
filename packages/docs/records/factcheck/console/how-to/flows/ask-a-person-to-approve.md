# Fact-check record: console/how-to/flows/ask-a-person-to-approve

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Labels and sequence as the console words them (see the screen records) | FlowEditor.tsx, DeployMenu.tsx, FlowTestPanel.tsx, Operate.tsx:1095-1190, RunPage.tsx:700-895, CancelOlder.tsx, RetryOnVersion.tsx | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- Mail subject is `Approval needed: <title>`, with `[Test] ` in front for a test: apps/control-plane/src/kernel/flows/approval-links.ts:134. Page said "[Test] Approval needed": corrected. Confirmed in the captured mail on the instance.
- Console toast uses curly quotes around the title: apps/console/src/screens/Operate.tsx:1168; confirmed on the instance (dialog "Approve “…”?", "Note (optional)").
- Mailed link: works once, 48 hours (LINK_HOURS, approval-links.ts:20) or until `Give up after`, whichever is first (approval-links.ts:92-97); at most 50 mailed (approvers.ts:248). Page "Comment (needed to reject)", "Approved. Thank you, <name>.", "Nothing to decide here": ApproveLink.tsx:91,141. Added a how-to section. Ran on the instance: opened the link signed out at 390 px, pressed Approve, the run succeeded with approved true and comment null; the second visit said "Nothing to decide here".
- "You may not decide this: it waits for the Billing group." seen on the run page for a member outside the group; added to If it does not work.
- Title 200 characters, Give up after 30 days (2592000): packages/manifest/src/kinds.ts:907,917.
