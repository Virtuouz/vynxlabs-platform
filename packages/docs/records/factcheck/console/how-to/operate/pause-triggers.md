# Fact-check record: console/how-to/operate/pause-triggers.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Pause one trigger: prompt, toasts, state text. | apps/console/src/screens/Operate.tsx:196-229,646-655 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Workspace pause: Workspace settings texts. | apps/console/src/screens/Environments.tsx:76-131 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Instance pause texts and TRIGGERS_PAUSED. | apps/console/src/screens/InstanceTriggers.tsx:30-90 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| What a pause does: webhook 503 codes, schedule fires once, form text, event stored. | apps/control-plane/src/routes/execution.ts:3764-3779; kernel/flows/events.ts:90-97; kernel/apps/front.ts:528 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Permissions. | apps/control-plane/src/routes/execution.ts:2260; routes/workspaces.ts:398; routes/instance-control.ts:55 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Run in a workspace of my own (Operate check, a dev workspace in Fernhill's tenant, with scripts, flows and triggers of mine deployed by the CLI, and a production workspace linked to it): pausing one trigger and two with the bar, Resume, the workspace pause under Workspace settings, a webhook answering 503 at both levels, Fire now, the production workspace's disabled New trigger. The instance pause was not run (it would stop every tenant of a shared instance); its sentences were read in Overview.tsx, Operate.tsx and InstanceTriggers.tsx.

| Claim | Source | Result |
| --- | --- | --- |
| The workspace pause: "Pause triggers" at once, no question; "Triggers in *name* are paused. Runs started by hand still work."; the section is "Triggers are on", then "Triggers are paused" with a Resume triggers button. | Environments.tsx:82; run | holds as run |
| 503 `trigger_paused` and `workspace_paused`. | execution.ts:3757-3778; run | holds as run |
