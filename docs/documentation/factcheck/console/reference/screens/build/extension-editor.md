# Fact-check record: console/reference/screens/build/extension-editor

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. `Au` = `screens/Authoring.tsx`, `CS` = `screens/CodeSettings.tsx`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Routes extensions/{connector,trigger_source}/new and /edit/<path>; help topic. | `Au:171-197` (edit/list, not re-counted), `nav.ts:316`, `screens/Tenant.tsx:699-709` | writer, run | holds as run |
| Title "New connector"/"New trigger source", then the path. | `Au:808-812` (title) | writer, run | holds as run |
| Pills Not saved, Draft, Deployed, Unsaved changes, From the repository, Removing. | `kit/status.tsx:78-81`; `Au:810-814` | writer, run | holds as run |
| Path field hint and placeholders connectors/shop, sources/payments. | `Au:920-935`, `Au:189,205` | writer, run | holds as run |
| Path rule and refusal text "Give the connector a path: ...". | `Au:253` (PATH), `Au:290-296` | writer, run (saw text with "Bad Path") | holds as run |
| Taken path: "Something already exists at this path. Choose another, or open that one." | run; `takenText` | writer, run | holds as run |
| "The schema is not valid JSON." | `Au:297-301` | writer, run | holds as run |
| Name and path dialog: Key, Path, Title, Save as a draft, 90 days; disabled "Save the draft first." | `screens/ResourceIdentity.tsx:132-136, 163-165, 282-330` | writer, code | holds in code |
| Discard draft / Remove; dialog words; Keep this connector. | `kit/RemoveDraftButton.tsx:15-34` | writer, code | holds in code |
| Save draft primary, disabled when clean and not new. | `Au:895-905` | writer, run | holds as run |
| Deploy menu shows when state is draft and not dirty; items This change only and Review all drafts; refusal dialog "<path> cannot be deployed alone"; toast "Deployed <path> as version N." and Promote to. | `Au:906-920`; `kit/DeployMenu.tsx:44-120` | writer, run ("Deployed ext31-shop as version 6. Promote to Clinics"; dialog text seen) | holds as run |
| Ctrl/Cmd+S saves ("Save now"). | `Au:420-423`; `kit/shortcuts.ts:81` | writer, code | holds in code |
| Autosave 3 s after change once saved or deployed; new waits for first save. | `Au:478-492`, `Au:432-436` | writer, code | holds in code |
| Run shortcut only for scripts. | `Au:424-425` | writer, code | holds in code |
| Unsaved copy kept in the browser: Restore it / Discard; text. | `Au:1012-1040` | writer, code | holds in code |
| Leave guard text. | `Au:429-432` | writer, code | holds in code |
| Settings open for extensions. | `Au:1054-1056` | writer, run | holds as run |
| Fields What it does; It is handed (two options, hint, starter swap); connector schema label, hint, rows. | `Au:600-640`, `Au:196-200`, `CS` | writer, run | holds as run |
| Starter schema baseUrl required, title Address, format uri. | `Au:201-210` | writer, code | holds in code |
| Trigger source fields and limits: Give up after 1-300, default 30, Connections it uses (hint), Secrets it reads, Variables it reads, Worker pool (hint text). | `CS:96-110, 148-198`; `Au:218` (timeoutSeconds 30) | writer, run | holds as run |
| No retries, memory, runs at once or tables for a trigger source or connector. | `CS:96, 138-150, 199` (kind checks) ; `Au:211-220` | writer, code | holds in code |
| Notes under Settings for each kind. | `Au:756-768` | writer, run | holds as run |
| Imports only @volvel/sdk and node:; error text. | `packages/compose/src/index.ts:191-205`; run output | writer, run (lodash refused) | holds as run |
| 256 KiB source. | `packages/manifest/src/kinds.ts:132` | writer | holds |
| Problems list: heading, count, line:column, Build tag, "No problems found." | `Au:1140-1143, 1186-1215` | writer, run (Problems (1) "Cannot find module 'lodash'..." 1:15) | holds as run |
| Build error only after deploy/preview/Test. | `Au:1160-1165` (buildIssuesOf), `Au:1109`; run | writer, run | holds as run |
| Repository read-only notice, File list, "Defined at line", empty state. | `Au:975-985`, `Au:1452-1499` | writer, code | holds in code |
| Removing notice. | `Au:966-969` | writer, code | holds in code |
| Clash notice and buttons. | `kit/DraftClash.tsx:25-70` | writer, code | holds in code |
| Permissions resource:read, resource:write + code:write, deployment:write + code:write. | `apps/control-plane/src/routes/authoring.ts:483-486, 578-583, 639, 1109-1125, 1163` | writer | holds |

Checked by: second agent, 2026-11-23. On the instance: the editor at 390 px in dark (no horizontal scroll), :kbd[Ctrl+S] and reload, the clash notice and the confirm dialog (`kit/DraftClash.tsx:15-62`), the refusal of a save with the tenant switch off, Settings fields for a trigger source, the starters (webhook source with `x-example`, poll source returning no items). Corrected: the clash row (**Load theirs**, **Copy what I wrote** copies the code only: `Authoring.tsx:1007-1011`). Strings checked by search in `apps/console/src`: path and name dialog, discard and keep questions, "Your changes to ... are not saved", the kept-in-this-browser notice. Not seen: **From the repository**, **Taken over**, Removing.
