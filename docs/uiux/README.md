# UI/UX transformation audit

Status: audit, design direction and plan complete. Nothing is implemented. Written 2026-11-16 against `main` at `e737382`, after phase 11.

This directory holds a full audit of the console's UI and UX and an implementation-ready plan for taking it from functional to exceptional. It supersedes [`docs/evolution/04-ux-audit.md`](../evolution/04-ux-audit.md) for UI and UX. Phases 9 to 11 acted on much of that earlier audit, and these documents say which of its findings are fixed.

The design direction is **"Quiet infrastructure, vivid state."** Chrome stays restrained so that code, data, system state, failures, results and actions carry the contrast.

## Documents

| Document | Contents |
| --- | --- |
| [01-current-product-ui-map.md](01-current-product-ui-map.md) | The product, its users and entities. Frontend architecture, shell, navigation and shared infrastructure. An inventory of 149 screens, dialogs, sheets and inspectors, each with a stable ID |
| [02-design-system-forensics.md](02-design-system-forensics.md) | Whether a coherent design system exists. Tokens, implicit values, duplicates, a component state matrix, and a debt register of 35 items |
| [03-screen-by-screen-audit.md](03-screen-by-screen-audit.md) | 83 surfaces, each scored out of 100 with specific findings and evidence. Inventories of dialogs, feedback, list behaviour and empty states |
| [04-workflow-journey-audit.md](04-workflow-journey-audit.md) | 27 journeys traced step by step with interaction counts, and the failure-to-fix loop end to end |
| [05-accessibility-audit.md](05-accessibility-audit.md) | 51 findings against WCAG 2.2 AA, a conformance table, contrast tables and a test plan |
| [06-design-direction.md](06-design-direction.md) | What the console should become and why. The rules the north star produces, density by surface, and patterns adopted and declined from reference products |
| [07-design-system-specification.md](07-design-system-specification.md) | The proposed tokens: spacing, type, colour, surfaces, borders, radius, elevation, control sizes, table density, icons, motion, focus and breakpoints |
| [08-component-pattern-library.md](08-component-pattern-library.md) | Behavioural standards for 43 components: anatomy, variants, states, keyboard, accessibility, sizing, usage and anti-patterns, with a migration map |
| [09-prioritized-uiux-roadmap.md](09-prioritized-uiux-roadmap.md) | 48 recommendations in five priority levels, with quick wins, architectural work, sequencing and backend needs |
| [10-validation-plan.md](10-validation-plan.md) | The baseline to take first, twelve tasks, metrics, targets, and the checks that run in CI |
| [11-screen-matrix.md](11-screen-matrix.md) | One row per surface: score, problems, changes, priority, effort, dependencies and target score |

Start with this page, then 06 and 09. Use 03 and 11 as reference.

## Evidence labels

- **Verified:** read in the code at `e737382`, cited as `path:line`.
- **Observed (mocked API):** seen in the built console, rendered in headless Chromium with every API call answered from fixtures, at 1440 × 900 in light and dark, 390 × 844 and 2200 × 1100.
- **Inferred:** reasoned from code without being run. Confirm before acting. The list is in 10 §10.9.
- **Judgment:** a design opinion. WCAG thresholds, measured sizes and counted interactions are not judgment.

## Limits of this audit

- **No real instance was run.** The audit sandbox had no Docker and refused to run Postgres. The console was built and observed with mocked data only, so nothing here shows real data, timings, live updates or write flows.
- **No person was observed using the product.** Interaction counts are optimal paths traced through the code. Task times, hesitations and satisfaction are unknown until the baseline in 10 is taken.
- **No screen reader and no automated accessibility tool was run.** The accessibility audit is a static review. Twenty-two of its items need checking at run time.
- **Scores are structured judgment,** from code review and limited observation, accurate to about ±5 points. Three groups of screens were scored by different reviewers on the same rubric.
- **Reference products were not re-examined.** The patterns in 06 come from the research report supplied with the assignment and from [`docs/evolution/03-competitive-analysis.md`](../evolution/03-competitive-analysis.md).

## Summary

### 1. Where the UI and UX are weak

The 83 surfaces average 65.8 out of 100, from 54 to 80. Twelve are under 60. The weak rubric categories are the same almost everywhere: keyboard and expert efficiency, interaction efficiency, and design-system consistency.

- **Trust.** The console has no error boundary, so one unexpected response blanks the whole interface (Observed). The script and resource editors have no autosave and no unsaved-changes guard. A finished run with more than 500 log lines appears to show only 500. A handful of things the interface says are untrue: a `j k` shortcut that does not exist, a failed test announced as a success, a starter script with an error on its first line.
- **The daily screens.** The runs list (63.5) shows about 10 rows in 900 px, in 57 px two-line rows. The flow run page (62.5) says "The flow failed." without naming the step and selects no step. The script editor (58) gives code about 39% of the viewport and renders test output below the fold.
- **Continuity.** From a failed production run to a new production run of the fix takes 27 interactions, 11 page loads, two workspace switches and two re-finds of an object already on screen. "Retry from the failed step" cannot use the fix.
- **Keyboard.** Runs rows cannot be opened by keyboard. Flow steps can only be connected by dragging. There is no ⌘S, no list movement, and no place where shortcuts are shown beside their actions.

### 2. Where it is already strong

- Colour is used only for state and the primary action, through 22 semantic tokens with no raw colours in screens.
- State is always an icon, a word and a colour together.
- The workspace and tenant overviews lead with "Needs attention".
- The header's scope path says tenant, workspace, environment and promotion target in one line.
- Production is read-only for code and always marked.
- Destructive confirmations and empty states use specific, plain copy.
- `SchemaForm`, the flow editor's undo, the connection wizard's test step and the effective-access view are well made.
- Reading a failure and re-running are in good shape after phase 9: a failed run is 2 interactions from the overview.

### 3. How consistent the design system is

A real token layer exists for colour. Above it there is no single system. Two overlapping kits and hand-built one-offs give six list implementations, seven page-header variants, six back patterns, four tab implementations, four input heights and 187 arbitrary type sizes. Almost nothing enforces consistency: arbitrary 13 px text grew from 87 to 101 uses in the console since the last audit.

### 4. Which problems are visual and which are structural

| Kind | Examples | Where it is fixed |
| --- | --- | --- |
| Structural | No error boundary, no save guard, view state outside the URL, missing links between objects, six list implementations, drag-only connections | P0, P1, P2 |
| Hierarchy | State and failure quieter than names and chrome, generic failure banners, large titles on working screens | P1-1, P1-2, P4-1 |
| Density | Two-line rows, stacked filters, fixed-height editors, stretched wide screens | P1-1, P1-4, P3-8 |
| Visual | Contrast failures, nested boxes, seven icon sizes, mismatched control heights | P0-2, P2-1, P4 |

Most of the gain is structural. A restyle alone would move the scores very little.

### 5. Accessibility

One critical finding, 10 serious, 21 moderate and 19 minor. The critical one is that flow steps can only be connected by dragging. The serious ones include `ink-subtle` text below 4.5:1 on most light backgrounds, no control border reaching 3:1, a page title that never changes, error toasts that vanish after 5 seconds, and a docked inspector that never takes or returns focus. The foundations are sound: Base UI primitives, a global focus ring and reduced-motion rule, and named controls throughout.

### 6. What the mature design language becomes

The phase 8 visual language stays: colours, fonts, shell and motifs. Seven colour values change for contrast and one border token is added. Type goes to ten roles with no arbitrary sizes. Controls come in three heights, with the console at 32 px. Tables get three densities with single-line rows. Three structural ideas carry most of the change: **one list**, **one object page**, and **one continuous loop** from a failure to its fix.

### 7. What needs standardizing, and what stays

The components to standardize first are `DataTable`, `PageHeader` and `Breadcrumb`, `LoadState`, `Toast`, `Inspector`, `FormField` and `SaveBar`. Five needed components do not exist: `Tooltip`, `LoadState`, `SplitPane`, `SaveBar` and a shortcut registry. What stays unchanged is listed in 06 §6.1 and 07 §7.13.

### 8. What to do first

1. **Take the baseline** in 10 on a seeded instance, and confirm the nine inferred findings.
2. **Ship the 22 quick wins** in 09. They remove most of the P0 risk without new architecture.
3. **Finish P0:** the save guard, non-drag flow building, safe destruction, and the branding contrast check.
4. **Build the foundations the core loop needs:** tokens, `LoadState`, URL state, and `DataTable` for the runs list first.
5. **Fix the core loop:** runs list, flow run page, logs, script editor, references as links, then context continuity and deploy hand-offs.

### 9. How improvement will be judged

Not by appearance. The validation plan defines twelve tasks, measures success, time, errors, backtracks, interaction counts and ease for each, and sets targets against a baseline taken before any change. Structural targets include: the loop from 27 interactions to 10 or fewer, 20 or more runs visible at 1440 × 900, code at 55% or more of the script editor, no surface under 70, and no critical or serious accessibility failure.

## Decisions for the owner

These are product decisions the plan depends on. Each has a recommendation.

| Decision | Recommendation | Affects |
| --- | --- | --- |
| Should a tenant's creator become a member, or get an automatic setup grant? | A time-limited setup grant, which keeps the operator-access model | P2-13 |
| Should the console's default control height drop from 36 to 32 px? | Yes, for the console only. Tenant apps keep 36 | P2-1 |
| Should editors be desktop-only below 1024 px, with read-only viewing? | Yes. It is more honest than a layout that technically fits | 06 §6.8 |
| Should deploying a single draft from the editor be allowed? | Yes, with the same validation as a full deploy | P1-5 |
| Should "Retry from the failed step" be able to use a newer version? | Yes, as an explicit choice with a warning that earlier steps ran on the old version | P1-3 |
| Should single-key shortcuts (`j`, `k`, `g r`) be added? | Yes, with a setting to turn them off, as WCAG 2.1.4 requires | P3-1 |
| Should panels move from a 10 px to an 8 px radius? | Optional. It is the lowest-priority change in 07 | P2-1 |
