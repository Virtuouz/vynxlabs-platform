# Fact-check: console/reference/screens/configure/variables.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Variables are strings up to 65,536 characters; PUT body. | `apps/control-plane/src/routes/execution.ts:3328-3340` | writer, 2026-11-23 | holds |
| `variable.set` audit keeps the value. | `apps/control-plane/src/routes/execution.ts:3358-3365` | writer, 2026-11-23 | holds |
| List description, button **Set variable**, columns Variable, Read by, For, Value here. | `apps/console/src/screens/Execution.tsx:958-1030` | writer, 2026-11-23 | holds; seen |
| Value here: value, **Empty**, "Default: …"/"Default: none". | `apps/console/src/screens/Execution.tsx:1030-1042` | writer, 2026-11-23 | holds; Default: 10 and 12 seen |
| Draft and arrives tags; draft-new links to the editor. | `apps/console/src/screens/Execution.tsx:975-1000` | writer, 2026-11-23 | holds (code) |
| Set variable dialog: Variable picker with hints, Value optional with hint; toasts. | `apps/console/src/screens/Execution.tsx:1048-1070` | writer, 2026-11-23 | holds (code); sheet and list seen |
| Row buttons Set / Change / Use default; confirm text; not for draft-new or removed. | `apps/console/src/screens/Execution.tsx:1072-1090` | writer, 2026-11-23 | holds; Set and Change seen |
| Sheet titles, hints (default / no default), Cancel / Save, toast "X is set in this workspace." | `apps/console/src/screens/VariableSheet.tsx:48-78` | writer, 2026-11-23 | holds; seen |
| Page: Change value / Set value; meta; Used by with "reads it". | `apps/console/src/screens/ObjectPages.tsx:200-272` | writer, 2026-11-23 | holds; seen |
| A script reading a variable with neither a value nor a default fails with 404 "The variable X was not found." | `apps/control-plane/src/routes/worker.ts:640-672` | writer, 2026-11-23 | holds (code) |
| An empty set value is returned, not the default. | `apps/control-plane/src/routes/worker.ts:660-664` | writer, 2026-11-23 | holds |
| `?setup=<path>` fills the Variable field. | `apps/console/src/screens/Execution.tsx:965 (setupField)` | writer, 2026-11-23 | holds |
| Read-only line and tooltip; `variable:write` / `variable:read`. | `apps/console/src/screens/Execution.tsx:969; apps/control-plane/src/routes/execution.ts:3249,3300,3328,3373` | writer, 2026-11-23 | holds |
| Flows do not read variables; steps hand over connections, tables, events. | `packages/sdk/src/index.ts:859-870; packages/manifest/src/kinds.ts (grants)` | writer, 2026-11-23 | holds |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Source commit `87000022`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| List description, button, columns, tags, Value here states, row buttons, confirm, empty text. | `Execution.tsx:956-1100`, `kit/references.tsx:55-57` | second agent, 2026-11-23 | holds |
| Sheet title, hints, buttons; page strings; the 404 "The variable X was not found."; an empty value is returned, not the default. | `VariableSheet.tsx:48-78`; `routes/worker.ts:636-672`; `ObjectPages.tsx:200-272` | second agent, 2026-11-23 | holds |
| The tooltip is "It needs variable:write." followed by whom to ask. | `kit/Can.tsx:243` | second agent, 2026-11-23 | corrected in the page |
| 390 px dark and 768 px light: no page scroll. | walk | second agent, 2026-11-23 | holds |

No sentence describes a listed fault.
