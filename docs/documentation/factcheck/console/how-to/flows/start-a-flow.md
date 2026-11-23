# Fact-check record: console/how-to/flows/start-a-flow

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Labels and sequence as the console words them (see the screen records) | FlowEditor.tsx, DeployMenu.tsx, FlowTestPanel.tsx, Operate.tsx:1095-1190, RunPage.tsx:700-895, CancelOlder.tsx, RetryOnVersion.tsx | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- Webhook check options: "By a trigger source of your own" is listed only when the workspace has a trigger source (FlowSteps.tsx:405-412); the secret picker lists the workspace's secrets and says "This workspace has no secrets yet." when there are none (FlowSteps.tsx:455-458). Page corrected. Confirmed on the instance.
- A new form starts with one question, **Message** (confirmed on the instance); the form's **Form address** is in the Triggers inspector (Operate.tsx:735), not on the flow's page, which says "a form. Its address is in the triggers below." Page corrected. Form submitted signed out: "Thank you. Your answer was sent."; the run's Started by was Form.
- Ran on a workspace of my own (Fernhill tenant, slug flows-check, triggers on): a webhook with HMAC SHA-256, header x-signature, prefix sha256=, secret from the workspace: good signature 202 {runId}; wrong signature and missing header 401 `signature_invalid` ("The signature does not match.", "The x-signature header is missing."); no prefix 401; a repeated idempotency-key returned the same runId; a paused webhook 503 `trigger_paused` "This webhook is paused, so it started nothing. Try again later.". Run Started by: Webhook.
- fault: api, a webhook's 401 `signature_invalid` body echoes the request path (the webhook's secret token) in `instance`.
- Schedule: preset list is a select ("Often used"), default cron `0 8 * * *`, next five times shown; **Fire now** on the Triggers screen started a run, Started by: Schedule. 25 s hold and `x-flow-run`: execution.ts:3726-3731, engine.ts:487.
