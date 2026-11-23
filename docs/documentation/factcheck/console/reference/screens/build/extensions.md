# Fact-check record: console/reference/screens/build/extensions

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. `Au` = `screens/Authoring.tsx`, `CS` = `screens/CodeSettings.tsx`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The list holds two kinds, connector and trigger source. | `Au:1316-1342` (isExtension, approximate range) | writer, run 2026-11-23 | holds as run |
| Title Extensions and the description line. | `Au:1350-1352` | writer, run | holds as run |
| **New connector** (primary) and **New trigger source** shown only when the workspace is dev (`editable`). | `Au:1353-1365`; `screens/Tenant.tsx:710-714` (editable = workspace type dev) | writer, run in Sandbox | holds as run |
| Columns Extension, What it is, What it does, State; sorted by path. | `Au:1368-1410` | writer, run | holds as run |
| What it is: Connector / Trigger source for a webhook / for a schedule (poll). | `Au:1271-1274` | writer, run (saw Connector and Trigger source for a webhook) | holds as run |
| A draft row reads its own draft; before it is read a draft trigger source says Trigger source. | `Au:1276-1295`, `Au:1344-1348` | writer, code | holds in code |
| A draft that removes (deleted) is skipped, so the row keeps its deployed state. | `Au:1338` | writer, code | holds in code |
| State pills Deployed, Draft, From the repository. | `kit/status.tsx:78-81`; `Au:1316-1334` | writer, run (Deployed) | holds as run |
| Empty state title and text. | `Au:1375-1380` | writer, run (copied from the screen) | holds as run |
| A failed read shows a danger notice with the message; loading shows a loading mark. | `Au:1370,1415-1418` | writer, code | holds in code |
| Nav label Extensions under Build, help topic build-extensions. | `nav.ts:127` | writer | holds |
| Production: no buttons; notice "This is a production workspace. <Noun> is changed in ... and reaches production by promotion." | `kit/objects.tsx:148-176`; `Au:986-992` | writer, code | holds in code |
| Listing needs resource:read. | `apps/control-plane/src/routes/workspaces.ts:684-687` | writer | holds |
| Saving needs resource:write and code:write, and the tenant switch; refusal text. | `apps/control-plane/src/routes/authoring.ts:210-227, 578-583, 639` | writer | holds |
| Deploying code also needs code:write; deploy needs deployment:write. | `apps/control-plane/src/routes/authoring.ts:1109-1125` (description), `:1163-1164` | writer | holds |
| The switch is on Repository > Code in the console; changing needs tenant:write. | `screens/Git.tsx:280-310`; `apps/control-plane/src/routes/tenants.ts:405`, `:398` | writer | holds |
| Triggers shows "Last refused". | `screens/Operate.tsx:661` | writer | holds |
