# Fact-check record: console/how-to/extensions/write-an-extension

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. `Au` = `screens/Authoring.tsx`, `CS` = `screens/CodeSettings.tsx`. Written by the writer; "Checked by" is for the second agent. Run log: `docs/documentation/runs/console/how-to/extensions/write-an-extension.md`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Build > Extensions > New connector opens the editor, title New connector, pill Not saved, Path field. | `nav.ts:127`; `Au:1356-1360, 808-812` | writer, run | holds as run |
| Save draft: title becomes the path, pill Draft; Deploy appears. | `Au:884-920` | writer, run | holds as run |
| Deploy > This change only: toast "Deployed <path> as version N." | `kit/DeployMenu.tsx:84-90` | writer, run (version 6) | holds as run |
| All resources > New > Connection; Path of the new connection; "What kind of connection" lists the workspace's connectors. | `screens/Tenant.tsx:821-832`; `screens/ResourceEditor.tsx:555-577` | writer, run | holds as run |
| New connection panel on Connections offers only built-in kinds. | `screens/ConnectionWizard.tsx:425-433` | writer, run (HTTP, Mail (SMTP), OAuth 2.0) | holds as run |
| Connections row of a declared connection says Not set up here, with Set up; settings form drawn from schema (Address); Save then Test again; Reached. | run; `screens/ConnectionWizard.tsx:203-240` | writer, run ("Reached (404) in 40 ms." from the test export) | holds as run |
| Trigger source settings, limits 1-300 and default 30. | `CS:96-110`; `Au:218` | writer, run | holds as run |
| New > Trigger: It starts the script, When its address is called, The script it starts, Each request is checked, By a trigger source of your own, Trigger source. | `screens/ResourceEditor.tsx:628-690`; `screens/FlowSteps.tsx:396-425` | writer, run (trigger ext31/inbox-hook saved and deployed; listed on Triggers) | holds as run |
| New > Schedule offers Trigger source (optional). | `screens/ScheduleForm.tsx:162-170` | writer, code | holds in code |
| Source offered only when a source of that mode exists, deployed or draft. | `screens/ResourceEditor.tsx:315-335` | writer, code | holds in code |
| At most 100 inputs or items from a source. | `apps/control-plane/src/kernel/execution/triggers.ts:711, 801-803` | writer | holds |
| Last refused on Triggers. | `screens/Operate.tsx:661` | writer | holds |
| Refusal texts: path, taken, schema, build line, switch. | run output; `apps/control-plane/src/routes/authoring.ts:222-227` | writer, run | holds as run |
| Needs resource:write, code:write, deployment:write; switch under Repository. | `apps/control-plane/src/routes/authoring.ts:210-227, 578-583, 1109-1125`; `screens/Git.tsx:280` | writer | holds |
