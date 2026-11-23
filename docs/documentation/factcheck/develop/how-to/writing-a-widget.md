# Fact-check record: develop/how-to/writing-a-widget

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. `Au` = `screens/Authoring.tsx`, `CS` = `screens/CodeSettings.tsx`. Written by the writer; "Checked by" is for the second agent. `W` = `packages/widget-sdk/src/index.ts`, `Core` = `packages/widgets-core/src/index.ts`. Run log: `docs/documentation/runs/develop/how-to/writing-a-widget.md`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Core pack holds the shipped widgets; labs holds only labs/probe, not offered in Add to page. | `Core:2021-2038`; `packages/widgets-labs/src/index.ts` | writer | holds |
| Packs are imported by hand in the console and the app runtime; no repository loading. | `apps/console/src/screens/builder/registry.ts:8-20`; `packages/screens/runtime/main.tsx:13,37` | writer | holds |
| Goal definition: type, version, title, description, category understand, surfaces, summary 1-2 values 0 breakdowns, dataHints. | `Core:1711-1730` | writer | holds |
| target and goalFrom in Data tab group Progress, labels Goal / Goal from a column; goalFrom wins. | `Core:1731-1760` | writer | holds |
| Display settings: A line under it, Numbers, Show the percentage, When reached the bar (Turns green / Stays), Good news is, Color by how close; defaults. | `Core:1761-1830` (labels at 1767-1822) | writer | holds |
| Event click, label; layout min 2x2, default 3x3, phone stack. | `Core:1846-1847` | writer | holds |
| View: number, progressbar with aria, share can pass 100, line under; button only when listens click. | `packages/widgets-core/views/goal.tsx:56-100` | writer | holds |
| View registered under core/goal. | `packages/widgets-core/views/index.ts:44` | writer | holds |
| defineWidget throws; definitionProblems checks; type, version, name, size rules. | `W:282-340` | writer | holds |
| Four data shapes; sources; SQL not on app pages. | `W:48-58` | writer | holds |
| Categories and their titles. | `W:26-36` | writer | holds |
| 28 controls. | `W:139-185` (counted: 22 config + 6 data) | writer | holds |
| Hint keys and tabs. | `W:121-135, 188-212` | writer | holds |
| View props. | `W:556-625` | writer | holds |
| Action step kinds; server runs the first five. | `packages/widget-sdk/src/action.ts:39-76` | writer | not re-read in this pass; from the inventory |
| Helpers exported. | `W:694-808`; `packages/widget-sdk/src/money.ts` | writer | holds |
| viewRegistry errors. | `packages/screens/src/types.ts:183-193` | writer | holds |
| WidgetRegistry error "declared twice". | `W:339-350` | writer | holds |
| Views import only react, @volvel/widgets, @volvel/ui. | `apps/console/src/enforce.test.ts:555-575` | writer | holds |
| Custom drawer for Goal registered in the console, not by a pack. | `apps/console/src/kit/inspector/widgets/registerCharts.ts:16-50` | writer | holds |
| slots draws "its places are drawn by the widget" unless registered. | `apps/console/src/kit/inspector/controls.tsx:470` | writer | holds |
| Test command and 15 tests pass. | run: `npx vitest run src/goal.test.tsx` in packages/screens | writer, run | holds as run |
| Add to page dialog; Goal under Understand data. | `apps/console/src/screens/builder/AddToPage.tsx:268`; `W:31-36` | writer | holds in code; not walked |

Checked by: second agent, 2026-11-23. Checked in the code: 28 controls (`widget-sdk/src/index.ts:138-174`), type/name/version patterns (`:282-284`), Goal's labels, group "Progress", defaults and layout (`widgets-core/src/index.ts:1711-1850`), `core/goal` in `views/index.ts:44`, `CORE_WIDGETS` (`:2021`), the test file `packages/screens/src/goal.test.tsx`, the icon rule (`:241-246`). On the instance: **Add to page** groups are Work with records, Understand data, Take action, Organize and explain (`apps/console/src/screens/builder/AddToPage.tsx:16-21`); the page's earlier list of five category titles came from `CATEGORY_TITLES` and is not what the screen shows: corrected.


