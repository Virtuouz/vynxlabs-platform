# 10. Validation plan

This document says how to find out whether the changes in [09-prioritized-uiux-roadmap.md](09-prioritized-uiux-roadmap.md) improve the product. It defines the baseline to take before any change, the tasks to measure, the metrics and their targets, and the checks that run in CI. Nothing here has been run yet.

The rule for the whole programme: **no change is counted as an improvement because the interface looks better.** A change counts when a measure in this document moves in the right direction on a real workflow and no other measure gets worse.

## Main points

- **The baseline does not exist yet.** This audit counted interactions from code and looked at the console with fixture data. It did not time a person doing a task. Stage 0 of the roadmap takes that baseline.
- **Three kinds of evidence are used together:** instrumented counts (interactions, pages, context switches), task sessions with people (success, time, errors, ease), and automated checks (accessibility, contrast, visual regression, keyboard paths).
- **Twelve tasks** cover the 21 journeys in the brief. Eight are measured with every release stage.
- **Targets are set per task** against the baseline, not as absolute numbers, except where a standard gives one (WCAG, SUS, response-time thresholds).
- **Two findings need confirming before work starts**, because they came from reading code: the 500-line log cap and the first-run "Save and run" remount.

## 10.1 What is known and what is not

| Question | Known today | How |
| --- | --- | --- |
| How many interactions does each journey take? | Yes, as a count from code | [04-workflow-journey-audit.md](04-workflow-journey-audit.md) |
| Where does a user lose context? | Yes, structurally | 04, and the link matrix in 01 |
| Which WCAG criteria fail? | Mostly. Static review, no screen reader, no axe run | [05-accessibility-audit.md](05-accessibility-audit.md) |
| How long does each task take a person? | No | Stage 0 |
| Where do people hesitate or go wrong? | No | Stage 0 sessions |
| How do users rate the product's usability? | No | Stage 0 SUS |
| How often is the keyboard used? | No | Stage 0 instrumentation |
| What do real screens look like with real data? | Partly. Mocked data at four viewports | Stage 0 screenshots on a seeded instance |
| Are the inferred defects real? | No | Stage 0 confirmation list (10.9) |

The earlier journey walk in `docs/evolution/05-journeys.md` measured clicks on a seeded instance after phase 8. Where a journey matches, 04 gives both counts.

## 10.2 The test instance

Every measurement uses the same instance so that runs are comparable.

| Item | Specification |
| --- | --- |
| Build | The commit under test, built with `pnpm build`, served by the control plane |
| Data | `examples/fernhill` seeded with `setup/setup.mjs --reset`: two workspaces, four members, about 2,900 visits, failed runs, waiting approvals, a refused webhook |
| Additions for this plan | One script run with at least 1,200 log lines. One flow run that failed at a middle step after two successes. One connection used by at least five scripts. A fresh, empty second instance for the first-run task |
| Viewports | 1440 × 900 (primary), 1920 × 1080, 2560 × 1440, 1280 × 800, and 390 × 844 for the triage tasks only |
| Themes | Light and dark |
| Reset | The instance is re-seeded before each participant and before each automated run |

The audit could not run this instance in its sandbox: Docker was unavailable and running Postgres was refused. A developer workstation or CI runner with the dev stack can. The mocked-API harness built for the audit (the built console in headless Chromium with every `/api/v1` call answered from fixtures) is kept for deterministic screenshots and is described in 10.7.

## 10.3 Representative tasks

Each task has a start state, an instruction as a participant hears it, and an objective success criterion. The instruction never names the control to use.

| ID | Task | Start | Instruction | Success means | Journeys |
| --- | --- | --- | --- | --- | --- |
| T1 | Author and test a script | Dev workspace, Scripts list | "Create a script that takes a clinic name and returns a greeting. Run it with 'north' and tell me what it returned." | A draft exists, a test run succeeded, the participant reads out the output | J1–J4 |
| T2 | Debug a script error | A draft script that throws on one input | "This script fails for the Hilltop clinic. Find out why and fix it." | A test run with that input succeeds | J5 |
| T3 | Ship the fix | A saved draft in dev | "Get your change running in production." | Production runs the new version | J6, J24 |
| T4 | Build a flow | Dev workspace with three deployed scripts | "Make a flow that checks stock, then places an order, and sends a text if the order fails. Test it." | The flow is saved, wired as described, and a test run reaches the last step | J7–J9 |
| T5 | Find and read a production failure | Production overview | "Something failed overnight. What was it, and what exactly went wrong?" | The participant names the run, the step if any, and quotes the error line from the log | J10, J11, J17 |
| T6 | From failure to source | A failed flow run page | "Show me the code that failed, as it was when it ran." | The script's source at the run's version is on screen | J12 |
| T7 | The continuity loop | A failed production run | "Fix this and confirm that it now works in production." | A new production run of the same target succeeds | J10–J14, J6, J24 |
| T8 | Find a past run | Runs list | "Find the reminder run for the Northside clinic from yesterday afternoon that failed." | The run's page is open | J15, J16 |
| T9 | Add and check a connection | Configure | "Connect the SMS provider with this key, check that it works, and tell me which scripts use it." | The connection is bound, tested, and the participant lists its users | J18, J19 |
| T10 | Schedule something | A script's page | "Make this run every weekday at 7 in the clinic's time zone." | A trigger exists with the right cron and zone | J20 |
| T11 | Give someone access | Tenant members | "Add Sam as a developer in the Sandbox workspace only. Then show me why Sam can or cannot deploy." | The binding exists, and the effective-access answer is on screen | J21a, J21b |
| T12 | First run on a fresh instance | An empty instance, signed in as the operator | "Get one script running here." | One successful run | J21i |

Tasks T1, T2, T5, T6, T7 and T8 are the high-frequency set. T9 to T11 are the configuration set. T12 is run once per stage.

Three shorter keyboard-only variants are run with every stage: T5-K (open the failed run and read its error), T4-K (build and test a three-step flow), and T8-K (filter the runs list and open a run).

## 10.4 Metrics

### Per task, from sessions

| Metric | Definition | How it is collected |
| --- | --- | --- |
| Success rate | Share of participants who meet the success criterion unaided | Observer, against the criterion |
| Severe failure | The participant gives up, or believes they succeeded and did not, or loses work | Observer |
| Time on task | From the end of the instruction to the success criterion | Screen recording with timestamps |
| Errors | Wrong actions that needed correcting: a wrong screen, a wrong control, a slip | Observer tally with a short label each |
| Backtracks | Uses of Back, of a breadcrumb or of the navigation to return to something just left | Instrumentation (10.5) |
| Hesitations | Pauses over 5 s with no input while not reading results | Recording review, with the screen and element noted |
| SEQ | Single Ease Question, 1 to 7, asked immediately after each task | Verbal |
| Help needed | The observer had to prompt | Observer |

### Per task, from instrumentation

| Metric | Definition |
| --- | --- |
| Interactions | Clicks, key chords and filled fields between task start and success |
| Pages visited | Distinct route paths |
| Dialogs and drawers opened | Overlay open events |
| Context switches | Changes of workspace, of rail area, or of object type |
| Repeated object lookups | Times an object already on screen earlier in the task is searched for or navigated to again |
| Repeated data entry | Values typed that the system already held |
| Keyboard share | Share of interactions made by keyboard, excluding text entry |

### Per session

| Metric | Definition |
| --- | --- |
| SUS | System Usability Scale, ten items, at the end of the session |
| Open comments | What was hardest, what was pleasant, what was missing |

### Per build, automated

| Metric | Definition |
| --- | --- |
| Accessibility defects | axe violations by impact, plus the manual checklist in 05 |
| Keyboard-accessible core actions | Share of the action inventory (10.6) reachable and operable without a pointer |
| Token contrast | Pass or fail for each pair in 07 §7.4, both themes |
| Audit rubric score per screen | The 100-point rubric, re-scored by the same method as 03 |
| Interaction latency | Time from input to visible response for local actions |
| Visual diffs | Screens whose screenshot changed, reviewed and accepted or rejected |
| Rows visible | Data rows above the fold at 1440 × 900 on each operational list |
| Chrome height | Pixels from the top of the viewport to the first data row |

## 10.5 Instrumentation

A small development-only recorder, off in production builds.

| Event | Fields |
| --- | --- |
| Route change | From, to, push or replace, time |
| Pointer activation | Role and accessible name of the target, time |
| Key chord | Keys, scope, the action it triggered, time |
| Field commit | Field name only, never its value |
| Overlay open and close | Kind (dialog, sheet, inspector, menu, palette), time |
| Workspace switch | From and to types (dev or production), time |

The recorder writes to the browser's memory and exports a JSON file per task. It sends nothing to a server. It never records field values, so no secret or customer data is captured. Participants are told it is on.

The same recorder runs under Playwright for the scripted version of each task. That gives a deterministic count of interactions, pages and context switches for every commit, which is how the counts in 04 become a regression test.

## 10.6 Accessibility validation

Accessibility is checked at four levels. No single level is sufficient.

| Level | What | When |
| --- | --- | --- |
| Tokens | A unit test computing contrast for every text and boundary pair in 07 §7.4, in both themes, and for the example brandings | Every commit |
| Components | axe on every component in every state, rendered from the kit sheet | Every commit |
| Screens | axe on every route in the e2e walk, in both themes, at 1440 and 390 px | Every commit |
| Journeys | Keyboard-only e2e for T5-K, T4-K and T8-K. Focus order and focus return asserted | Every commit |
| Manual | A screen-reader script with NVDA on Windows and VoiceOver on macOS covering T1, T5 and T7. 200% and 400% zoom. Windows high-contrast mode. Reduced motion | Every release stage |

axe finds a minority of real barriers. The manual pass is not optional.

### The core action inventory

"Keyboard-accessible" is measured against a fixed list so the percentage means something. It is the union of the major actions in 01's screen inventory for the screens in tasks T1 to T11: about 120 actions. For each: reachable by Tab or a shortcut, operable by Enter or Space or a documented key, focus visible, and the result announced. An action that needs a drag with no alternative fails.

### Definition of zero critical failures

The same five conditions as 05 §7. All must hold:

1. No finding of severity critical in 05 remains open, and no serious finding remains open without a dated plan.
2. axe reports no violation of impact critical or serious on any covered route, in both themes.
3. All three keyboard-only tasks pass.
4. The token contrast test and the branding contrast test pass.
5. No step fails in the NVDA and VoiceOver script.

## 10.7 Visual and structural regression

| Check | Method |
| --- | --- |
| Deterministic screenshots | The mocked-API harness: the built console in headless Chromium, all `/api/v1` calls answered from fixtures. Every screen in 01, at 1440 × 900 and 390 × 844, light and dark |
| Comparison | Pixel comparison against the accepted set, with a small threshold. A changed screen must be accepted by a reviewer in the pull request |
| Overflow | The existing check in `e2e/redesign.spec.ts` for horizontal scroll at 390, 768 and 1440 px, kept and extended to text overdrawing its neighbours |
| Fixture coverage | Fixtures include every run state, an unknown state, long paths, long error messages, empty lists, and error responses, so that edge states are in the screenshot set |
| Crash check | Every route is loaded once with each of its responses replaced by a malformed body. The shell must remain |
| Kit sheet | `/instance/kit` renders every component, state and density, and is in the screenshot set |

The e2e suite takes screenshots today and compares nothing, and one of its entries lands on the 404 page (`e2e/redesign.spec.ts:147`). Fixing that is part of P2-12.

## 10.8 Performance validation

Perceived performance is measured against the response-time thresholds in 07 §7.10.

| Measure | Target | Method |
| --- | --- | --- |
| Local actions: select a row, open a menu, toggle a panel, switch a tab, sort or filter loaded rows | Under 100 ms to the next paint | Playwright with performance marks |
| Open the command palette | Under 100 ms | Same |
| Route change to first meaningful content, cached data | Under 200 ms | Same |
| Route change to first meaningful content, cold | Under 1 s on the seeded instance, with a skeleton by 300 ms | Same |
| Any wait over 1 s | A visible state at the place of the work | Screenshot at 1.1 s in the e2e walk |
| Any wait over 10 s | A named stage or progress, and a way to leave | Manual check on deploy, promote, import, export |
| Runs list with 10,000 rows loaded by paging | Scroll at 55 frames per second or better | Performance trace |
| Log viewer with 50,000 lines | Same | Performance trace |
| Code-split editors | A skeleton of the editor's layout, not the text "Loading…" | Screenshot |

## 10.9 Stage 0: the baseline

Done once, on the current commit, before any roadmap item ships.

| Step | Output |
| --- | --- |
| 1. Confirm the inferred findings | A yes or no for each item in the table below |
| 2. Scripted task runs | Interactions, pages, overlays, context switches and repeated lookups for T1 to T12, from the recorder under Playwright |
| 3. Sessions | Five to eight participants: at least three developers who build on the platform and two operators who watch runs. Each does T1, T2, T5, T6, T7, T8 and two of T9 to T11. One participant per stage does T12 |
| 4. Accessibility run | axe on every route. The manual script once. The core action inventory scored |
| 5. Screenshots | The accepted set from the mocked harness and from the seeded instance |
| 6. Performance | The measures in 10.8 |
| 7. Rubric re-check | The scores in 03 corrected where observation on real data contradicts code review |
| 8. A baseline report | One page per task with every metric, plus the list of hesitation points |

### Findings to confirm first

| Finding | Source | Why it matters to confirm |
| --- | --- | --- |
| A finished run with more than 500 log lines shows only 500 | 03 part B, `screens/Execution.tsx:371-409` | It is P0 if true. It depends on stream behaviour at run time |
| The first "Save and run" of a new script remounts the editor and loses the result | 03 part A, `screens/Tenant.tsx:520` | It decides how bad T1 is today |
| Monaco is recreated on each keystroke in the Path field | 03 part A, `editor/CodeEditor.tsx:99` | Same |
| ⌘↵ is swallowed while the code editor has focus | 03 part A | Same |
| The flow run graph shows the current definition, not the run's version | 03 part B, `screens/Flows.tsx:629` | It can mislead debugging |
| Draft scripts that were never deployed are absent from the Scripts list | 03 part A | It affects T1 and T12 |
| The flow editor's inspector is clipped below 1024 px or at 200% zoom | 05 | A WCAG reflow failure if true |
| A double click on Next in the rows browser pushes the same cursor twice | 03 part B, `screens/Data.tsx:270-275` | A data-browsing defect |
| The App Builder's phone preview does not match a real phone | 03 part B | It misleads app builders |

### Sample size and what it supports

Five to eight participants find most of the severe usability problems in a task. They do not support precise time comparisons. For that reason:

- **Success, errors, hesitations and comments** are read qualitatively from sessions.
- **Interactions, pages and context switches** are read from the scripted runs, which are exact.
- **Time on task** is reported as a median with its range, and a change is claimed only when the ranges separate or when the scripted optimal path shortens by the target.
- **SUS** from so few people is a rough indicator. It is tracked for direction, not compared to the second decimal.

## 10.10 Targets

Targets are against the stage 0 baseline unless a standard supplies an absolute.

### Product-level scorecard

| Metric | Target | Basis |
| --- | --- | --- |
| Top-task completion (T1, T2, T5–T8) | 95% or more | Research report |
| Severe task failure | Under 2% | Research report |
| Time on high-frequency tasks | At least 20% lower than baseline | Research report |
| Unnecessary navigation and context switches | At least 30% lower than baseline | Research report |
| Post-task SEQ | 5.5 of 7 or more, per task | Research report |
| SUS | 80 or more | Research report. Well above the commonly cited average of 68 |
| Core actions keyboard-accessible | 90% or more of the inventory | Research report |
| WCAG 2.2 AA critical and serious failures | 0 | 05 |
| Screens scoring under 70 on the rubric | 0 | Research report |
| High-frequency screens scoring 85 or more | All of: runs list, script run, flow run, script editor, flow editor, workspace overview, shell, palette | Research report |
| Local interactions under 100 ms | 95% or more of measured actions | 07 §7.10 |
| Production failure to actionable debugging context | 2 navigational transitions or fewer | Research report |
| Blank pages from a malformed response | 0 | P0-1 |

### Per-task structural targets

Baselines here are the counts from code in 04. Stage 0 replaces them with measured values.

| Task | Measure | Baseline from 04 | Target | Items that deliver it |
| --- | --- | --- | --- | --- |
| T1 | Forced scrolls to see output | 2 | 0 | P1-4 |
| T2 | Clicks and scrolls per debug iteration | 2 and 2 | 0 and 0 (one key chord) | P1-4, P0-6 |
| T3 | Interactions from saved draft to deployed in dev | Leaves the editor for Release | 2, without leaving the editor | P1-5 |
| T4 | Interactions to build a three-script flow | 15 (11 clicks, 3 drags, 1 field) | 8, with 0 drags | P1-8, P0-8 |
| T5 | Interactions to the failed run's error text | 2 | 1 (shown in the row) | P1-1 |
| T5 | Interactions to a failed flow step's error | 5–6, with one Back | 1 | P1-2 |
| T6 | Interactions from a failed step to its source at the run's version | Not possible directly | 1 | P1-3 |
| T7 | Interactions for the whole loop | 27, over 11 page loads | 10 or fewer | P1-3, P1-2, P1-5 |
| T7 | Workspace switches made through the switcher | 2 | 0 (both carried by a link that keeps the object) | P1-3 |
| T7 | Repeated object lookups | 2 | 0 | P1-3 |
| T8 | Filters that survive reload and Back | Runs only | All | P2-6 |
| T9 | Clicks to a complete list of a connection's users | 2, to a truncated unlinked list | 1, complete and linked | P1-10 |
| T10 | Interactions and pages to schedule from the script | 9 plus fields, 2–3 pages | 5 or fewer, 1 page | P1-9 |
| T11 | Screens to add a member with a scoped role | 2 tabs | 1 flow | P2-11 |
| T12 | Interactions to a first successful run | About 31 | 12 or fewer | P2-13 |

### Per-screen structural targets

| Screen | Measure | Today | Target |
| --- | --- | --- | --- |
| Runs list, 1440 × 900 | Rows visible | About 10 (Observed) | 20 or more |
| Runs list | Top of viewport to first row | 282 px (Observed) | 160 px or less |
| Runs list | Row height | 57 px, 82 px with a tag (Observed) | 36 px, single line |
| Script editor, 1440 × 900 | Code share of viewport | About 39% (Observed) | 55% or more, with output visible |
| App Builder, 1440 × 900 | Canvas share of viewport | Under half (Verified from layout) | 60% or more |
| Every list | Implementations | 6 | 1, plus the grid |
| Every screen | Arbitrary type sizes | 187 | 0 |
| Every text token pair | Contrast | 2 tokens fail in light | All pass |

## 10.11 Measuring each stage

| After stage | Run | Decide |
| --- | --- | --- |
| 0 Baseline | Everything in 10.9 | Whether the P1 order in 09 matches where people struggled. Reorder if not |
| 1 Trust | Automated checks. Crash check. Keyboard tasks. The confirmation list re-run | P0 is closed when every P0 acceptance criterion passes |
| 2 Foundations | Automated checks. Visual diffs reviewed screen by screen. Scripted counts must not increase on any task | Foundations must be neutral or better on every task before the core loop builds on them |
| 3 Core loop | Sessions on T1, T2, T5, T6, T7, T8 with five or more participants, some new and some returning. Scripted counts. Performance | The scorecard targets for high-frequency tasks |
| 4 Breadth | Sessions on T9 to T12 and T4. Rubric re-score of every screen | No screen under 70 |
| 5 Expert and polish | Sessions with experienced users, keyboard share measured. Full rubric re-score | High-frequency screens at 85 or more. Keyboard share rising without novice success falling |

### Guardrails

A change is rolled back or reworked when any of these happens, even if its own target is met:

- Success rate on any task falls.
- A new critical or serious accessibility finding appears.
- Time on task rises for new users on a screen made denser.
- A scripted interaction count rises on a task the change was not meant to affect.
- Local interaction latency passes 100 ms on a previously fast action.

### Novices and experts

Rule 10 of the brief is that expert paths get faster without beginner paths getting obscure. Each session round includes at least two participants who have not used the console. Their success rate and SEQ are reported separately. A keyboard feature ships only with its visible equivalent.

## 10.12 After release

| Signal | Use |
| --- | --- |
| Opt-in, anonymous counts of palette use, shortcut use, density setting and saved-view use, per instance | Whether expert features are found. The platform must never call home, so this stays on the instance and is shown to its operator |
| Support questions tagged by screen | Where confusion remains |
| The first-run checklist's completion rate, from the instance's own records | Whether onboarding works |
| The rubric re-scored at each phase | Drift |
| A session round every two phases | New friction introduced by new features |

## 10.13 What this plan does not claim

- The scores in 03 are structured judgment from code review and limited mocked observation. They are a way to compare screens and to track change. They are not a measurement of user experience.
- The interaction counts are optimal-path counts. Real users take longer paths. The sessions show how much longer.
- The targets from the research report are reasonable aims for a professional tool. Reaching them does not prove the product is good, and missing one by a small margin does not prove it is not.
- The audit did not test with a screen reader, on a real seeded instance, or with any user. Stage 0 exists to close those gaps before anything is built.
