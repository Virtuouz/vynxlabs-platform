# 4. End-to-end workflow journey audit

This document measures the console by journey rather than by screen. It traces 27 journeys (J1–J27, with J21 split into nine administrative journeys) step by step through the code, counts what each costs today, states a target version of each, and maps what blocks the target to the roadmap IDs in `09-prioritized-uiux-roadmap.md`. Section 4 traces the composite "continuity loop" from a failed production run to a new production execution of the fix; it is the centrepiece. Section 6 is the baseline table that `10-validation-plan.md` reuses. Screen-level detail is in `03-screen-by-screen-audit.md`; the route map is in `01-current-product-ui-map.md`.

Paths are relative to `apps/console/src` unless they start with `packages/` or `apps/`.

Evidence labels used here:

- **Verified**: read in the code at HEAD `e737382`, cited as `path:line`. Every step table row is Verified unless it says otherwise.
- **Observed (mocked API)**: seen in the built console in headless Chromium with fixture data. Not a real seeded instance.
- **Inferred**: reasoned from code without being run. Must be confirmed before acting.
- **Judgment**: a design opinion (the ratings and the target journeys are judgment; the counts are not).

## Main findings

- The journey from a failed production run to a new production execution of the fix costs **27 interactions, 11 page loads, 2 workspace switches and 2 re-finds of an object the user already had open**. The target is 10 interactions with no re-finds (section 4).
- Three links carry most of that cost: production has no "edit this in dev" link (`screens/Authoring.tsx:681-685`), the workspace switcher keeps the section but drops the object (`Shell.tsx:766-769`), and promotion ends in a sentence with no link to production (`screens/Release.tsx:557-565`).
- "Retry from the failed step" always runs the version the run started on (`screens/RunPage.tsx:485-492`). The only way to run a fix against a failed flow run is "On the version deployed now", which runs every step again from the start (`screens/RunPage.tsx:494-504`).
- Reading and re-running are in good shape: a failed run is 2 interactions from the overview (J10), re-run or retry is 3 (J14), filters are in the URL (J16). These were the weakest journeys in `docs/evolution/05-journeys.md` and are now the strongest.
- Authoring loops are the weakest. The script test loop costs 2 clicks and 2 scrolls per iteration because Run is behind a tab and the output is below a fixed-height editor (J3–J5). A flow of three existing scripts costs 11 clicks, 3 drags and a field, and each step's input is free text although the script's schema is loaded (J7, J8).
- One journey is not possible at all: testing part of a flow (J9). One can silently give a wrong answer: "who changed X" searches only the audit entries already loaded (J21g).
- Deploy leaves every editor and deploys every draft in the workspace (J6); section 5.4 lists nine success states that offer no link to the result.
- A new instance needs about 31 interactions, 4 dialogs and 5 pages before a first script runs, because the tenant's creator is not a member of it (J21i).
- The object the user is working on is looked up again in 12 of the 27 journeys (section 5.1), usually through a select or a list with no search.

## 1. Method and limits

**How the counts were made.** Each journey was traced through the console source at HEAD `e737382`, starting from the notes of the screen audits and re-reading the code for every step sequence the notes marked as inferred or where a count looked uncertain. No journey was timed with a user and none was run against a real seeded instance: the audit sandbox could not run one. A small number of screens were seen rendered with fixture data and are cited as Observed (mocked API). Counts therefore say how many actions the interface requires on the shortest path. They do not say how long the path takes, how often users find it, or where they hesitate. `10-validation-plan.md` covers how to measure those.

**What is counted.**

| Measure | Definition |
| --- | --- |
| Interaction | One click (or its keyboard equivalent), one key chord, one drag, or one filled field. A text entry is one interaction whatever its length; one choice in a select or combobox is one. Writing code and scrolling are not counted; scrolls that the layout forces are noted beside the count. `n` is the number of input fields the user's own schema asks for. |
| Pages visited | Distinct URL paths shown, including the starting page. A changed query string is not a new page. |
| Dialogs/drawers | Modal dialogs, side sheets and inspectors opened. Menus are not counted. |
| Context switch | Leaving the surface the task is on to continue it: another workspace, another navigation area, a second page that exists only to complete the step, or a tool outside the console. |
| Backtrack | Returning to a page already visited in the same journey because nothing links forward. |
| Repeated data entry | A value typed or chosen that the console already holds from an earlier step. |
| Repeated object lookup | Finding again, in a list, select or search, an object the user already had on screen. |

**Starting points.** Unless a journey says otherwise it starts on the list or page where the task naturally begins, in a workspace of the right type, signed in with a role that allows it. `docs/evolution/05-journeys.md` started every journey at the workspace overview; where the two are compared, the navigation clicks are added back and the difference is stated.

**Ratings** are judgment, on four levels: *smooth* (shortest reasonable path, state always clear), *acceptable* (works without detours, some friction), *costly* (works, but with context switches, repeated lookups or ambiguous state), *broken* (cannot be completed, or can complete with a wrong result).

**Where this document corrects the notes.**

- The notes on run inspection assumed the command palette searches the current workspace only. It searches the tenant, current workspace first (`apps/control-plane/src/routes/search.ts:209-224`), groups other workspaces under "Other workspaces" (`kit/CommandPalette.tsx:556-559`) and opens a found script in the workspace it lives in (`kit/CommandPalette.tsx:126-133`). The palette is therefore a second route from production to the dev copy of a script (J13). It finds deployed resources only, by path substring.
- The notes on tenant administration counted steps. This document recounts each field and click by the definition above, so the J21 figures are higher than the notes' figures. The step sequences are the same.
- The notes on run inspection put the loop at "about 14–16 interactions, two workspace switches and one re-find". That figure starts after the fix is written and does not include reaching the dev editor or carrying the input. `09-prioritized-uiux-roadmap.md` (P1-3) and `10-validation-plan.md` (T7) quote it. The end-to-end trace in section 4 counts 27 interactions and two re-finds; its steps 13–29 are the part the notes counted (17 interactions, or 14 without pasting the failed input and opening the output tab).
- The notes marked the editor remount on first save as inferred. The mechanism is Verified: the editors are keyed on the address (`screens/Tenant.tsx:444`, `:520`) and the first save replaces the address (`screens/Authoring.tsx:378`, `screens/FlowEditor.tsx:690`). What the user sees as a result (a first test run whose result panel never appears) remains Inferred.

## 2. Summary of all journeys

Counts are for the shortest path today. "Lost" and "ambiguous" name the single worst place; the journey sections list the rest.

| ID | Journey | Interactions | Pages | Dialogs/ drawers | Context switches | Back-tracks | Repeated data entry | Repeated object lookup | Where context is lost | Where state is ambiguous | Rating | Main roadmap IDs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| J1 | Create a script | 3 | 2 | 0 | 0 | 0 | 0 | 0 | First save remounts the editor | "Not saved" pill beside a state badge; draft missing from the Scripts list (Inferred) | acceptable | P0-4, P0-6, P1-4 |
| J2 | Configure inputs | 2 | 1 | 0 | 0 | 0 | 0 | 0 | Schema-reading status is on the Settings tab only | Form may be drawn from the previous schema | acceptable | P1-4, P0-6 |
| J3 | Test the script | 2 + n | 1 | 0 | 0 | 0 | 0 | 0 | Result renders below the fold | Whether the first run of a new script started (Inferred) | costly | P1-4, P0-6 |
| J4 | Inspect output | 1 per run, 2 scrolls | 1 | 0 | 0 | 0 | 0 | 0 | Output tab resets to Logs on every run | None | costly | P1-4, P3-5 |
| J5 | Debug an error | 2 per iteration, 2 scrolls | 1 | 0 | 0 | 0 | 0 | 0 | Code and error are never on screen together | Which line failed | costly | P1-4, P1-6 |
| J6 | Save/deploy the script | 2–3 (+3 to production) | 2 | 0 (1) | 1 | 0 | 0 | 0 | Deploy leaves the editor; no link back | Which drafts a deploy carries | costly | P1-5, P0-4 |
| J7 | Create a workflow from 3 existing scripts | 15 (11 clicks, 3 drags, 1 field) | 2 | 0 | 0 | 0 | 0 | 0 | View re-fits after every added step | "Draft" tag on a flow that is not saved | costly | P1-8, P0-8 |
| J8 | Configure workflow steps (3 steps) | 6 + lookups | 1 (+1 per lookup) | 0 | up to 3 | up to 3 | Input shape retyped as an expression | up to 3 | Leaving the editor to read a script's input shape | Rename leaves old references in expressions | costly | P1-8 |
| J9 | Test part of the workflow | not possible (whole flow: 2 + n, +1 per step) | 1 | 0 | 0 | 0 | 0 | 0 | Step logs need the run page | Results belong to the saved graph, not the canvas | broken | P1-8, P1-2 |
| J10 | Inspect a production run | 2 | 2 | 1 | 0 | 0 | 0 | 0 | Back from a run page loses loaded pages and scroll | A flow run peek shows no steps | smooth | P1-1, P0-3, P0-5 |
| J11 | Diagnose a failed step | 5–6 | 3 | 0 | 1 | 1 | 0 | 1 | Step selection is not in the URL | Banner does not name the failed step | costly | P1-2, P0-5 |
| J12 | Navigate from failure back to source | 1 (script), 2–3 (flow step) | 2–3 | 0 | 1 | 0 | 0 | 0 | "version N" link goes to a generic list | Source shown is the current version, not the run's | costly | P1-3, P1-10 |
| J13 | Make a correction | 4 | 3 | 0 | 1 (workspace) | 0 | Failed input copied by hand | 1 | Workspace switch drops the object | Which dev workspace feeds this production | costly | P1-3, P2-6 |
| J14 | Rerun or retry | 3 | 2 | 1 | 0 | 0 | 0 | 0 | None | Retry from the failed step cannot use a new version | smooth | P1-3, P3-3 |
| J15 | Find a historical execution | 4 + k (list), 3 (by ID) | 1–2 | 0–1 | 0 | 0 | 0 | 0 | "Load more" pages lost on return | "Started" shows received time | acceptable | P1-1, P3-4 |
| J16 | Filter executions | 1 per filter | 1 | 0 | 0 | 0 | 0 | 0 | None (all in the URL) | "Waiting" merges approval and timer; "Cancel queued runs" ignores the filter | acceptable | P1-1, P3-4 |
| J17 | Inspect logs | 1 | 1–2 | 1 | 0 | 0 | 0 | 0 | None | A finished run with more than 500 lines shows 500 and says "500 lines" | acceptable; broken past 500 lines | P0-5, P1-6 |
| J18 | Create or edit a resource/credential | 6 + n, then 2 to deploy; edit 3 | 1 (+1) | 1 | 1 | 0 | Secret name retyped to replace a value | 1 (variable re-picked) | Deploy step is on another page, not linked | "Saved" and "Reached" while the declaration is an undeployed draft | acceptable | P1-5, P2-7, P1-10 |
| J19 | Determine where a resource is used | 1–2 to read, +3 per user opened | 1 (+1 per user) | 0 | 1 per user | 1 per user | 0 | 1 per user | Used-by names are text, not links | "Nothing deployed uses it" ignores drafts | costly | P1-10, P0-9 |
| J20 | Configure scheduling/triggers | 9 + n | 2–3 | 1 | 2 | 0 | 0 | 1 (target re-picked) | No entry from the script or flow | Draft schedule not shown on Triggers (Inferred) | costly | P1-9, P1-5 |
| J21a | Add a member with a role in one workspace | 10–12 | 2 | 2 | 1 | 0 | 0 | 1 (the member) | New member not carried to "Give access" | Whether the account already exists | costly | P2-11, P2-8 |
| J21b | Why can a member do X | 5–6 | 2–3 | 1 | 0 | 0 | 0 | 0 | None | Check needs the exact permission string | acceptable | P2-11 |
| J21c | Service account + API key | 19–22 | 3 | 4 | 2 | 1 | 0 | 2 (the account) | Account page has no name and no grant action | A key with no role works but can do nothing | costly | P2-11, P0-10 |
| J21d | Create a dev workspace linked to production | 12 | 2 | 2 | 0 | 0 | Same form filled twice | 1 (production re-picked) | No landing in the new workspace | Type defaults to Dev silently | costly | P2-13, P0-9 |
| J21e | Set up SSO | about 34 | 3 + 2 external | 3 | 3 (2 external) | 1 | 0 | 1 (the provider) | Provider and tab are not in the URL | "Turn on" has no precondition check | costly | P2-11, P2-6 |
| J21f | Register a self-hosted worker | 7–10 + manual command | 1 + terminal | 1–2 | 1 (external) | 0 | URL and token typed into the command by hand | 0 | Token shown once without Copy | Whether the worker connected | costly | P0-10, P1-7 |
| J21g | Who changed X in the audit log | 5 + k, unbounded | 1 | 1 | 0 | 0 | 0 | 0 | Filters and entry are not in the URL | Search covers loaded entries only | broken | P2-11, P2-6 |
| J21h | Operator opens access to a tenant | 6–8 | 2 | 1 | 0 | 0 | 0 | 0 | None | Gate does not name the tenant | smooth | P2-8 |
| J21i | Fresh instance → first running script | about 31 (40 with lasting access) | 5 | 4 | 3 | 1 | Reason typed to enter own tenant; workspace form twice | 2 | No landing after create tenant or workspace | Whether a worker is available | costly | P2-13, P0-10 |
| J22 | Decide an approval | 3 | 1 | 1 | 0–1 | 0 | 0 | 0 | From a workspace the queue is tenant-wide | No confirmation or link to the resumed run | acceptable | P3-3, P2-8 |
| J23 | Pause a trigger | 4–5 | 1 | 2 | 0 | 0 | 0 | 0 | None | No confirmation; type filter not in the URL | acceptable | P3-3, P2-8 |
| J24 | Promote dev → prod | 4 | 1 | 1 | 0 | 0 | 0 | 0 | Promote step has no URL; reload returns to Review | Success names no place to go | acceptable | P1-5, P2-6 |
| J25 | Browse and edit a table row | 6 | 2 | 0 | 0 | 0 | 0 | 0 | Filters, sort and page are lost on reload | Clicking away commits the edit | acceptable | P2-9, P2-6 |
| J26 | Build and publish an app page with an action | 14–18 | 2 | 1 | 0 | 0 | 0 | 0 | Palette is below the canvas | Preview actions start real runs | acceptable | P2-10, P0-9 |
| J27 | Share an app with a group | 7–8 | 1 | 2 | 1 | 0 | 0 | 1 (the app) | Closing the sheet drops the selection | No success line | acceptable | P2-10, P0-9, P2-8 |
| Loop | Failed production run → fix → new production execution (section 4) | 27 | 11 loads, 8 distinct | 2 | 6 (2 workspace) | 2 | 1 (failed input) | 2 | Twice at the workspace switcher | Which version a retry will use | costly | P1-3, P1-2, P1-5 |

### 2.1 Comparison with `docs/evolution/05-journeys.md`

`05-journeys.md` walked nine journeys on a real seeded instance after phase 8 (commit `c247273`). It counted clicks and fields separately and started at the workspace overview. The table sets its figures beside today's for the journeys both measured. "Today" is from code tracing, so the comparison is of required actions, not of observed sessions. Phases 9–11 are treated as one block: the notes record what changed, not which phase changed it.

| 05 journey | 05 count (Observed/Inferred there) | Today (this document) | What phases 9–11 changed | Still open |
| --- | --- | --- | --- | --- |
| 1 Create a script and run it | 9–12 clicks, 4 fields, 4 pages, 2 context switches | J1+J3+J4+J6 from the overview: 8 clicks, 1 + n fields, 4 pages by 05's counting (3 from the Scripts list), 1 context switch | Input schema is read from the code's own `input` export (`screens/Authoring.tsx:529-540`); "Try it" draws a form from it (`:592-599`); Scripts list has an inspector with Run in dev (`screens/Execution.tsx:233-257`) | Deploy still leaves the editor (05 projected 1 page); Run is behind a tab |
| 2 Debug a failed task | 4 clicks to see why; 8+ to fix; no link from run to code; no flow retry | J10: 2 to see why. J12: 1 to the script. J14: 3 to retry | Failed chip carries `?status=failed` (`Shell.tsx:878-885`); error summary in the row (`screens/Runs.tsx:407-410`); full run page (`screens/RunPage.tsx`); re-run with edited input and flow retry from the failed step (`:237-245`, `:559-570`); run → script and trigger links (`:106-108`, `:145`) | "Open code at version v1" (05's target) does not exist; production → dev hand-off |
| 3 Create a workflow | 10–15 clicks + 3 per step, 3 pages, 1 context switch; no test with input, no undo | J7: 2 fixed + 4 clicks and 1 drag per step by 05's counting, 2 pages. Test loop: 2 clicks, 0 page changes (05's projection met) | Test in place with step states on the canvas (`screens/FlowTestPanel.tsx:28`); undo/redo (`screens/FlowEditor.tsx:489-505`); evaluated expression preview (`screens/ExpressionField.tsx:76-89`) | Per-step cost has not fallen; connecting is drag-only; no partial test |
| 4 Schedule an execution | 8 clicks, 4 fields, 4 pages; free-text cron and zone, JSON input | J20: 10 clicks, 1 + n fields by 05's counting (9 + n interactions by this document's), 2–3 pages | "New trigger" on Triggers (`screens/Operate.tsx:99-120`); presets, zone picker, next times, schema input (`screens/ScheduleForm.tsx:32-38`, `:181-203`, `:217`); a schedule can target a flow (`:90-99`) | Click count did not fall; no entry from the script or flow; 05 projected 5 clicks, 2 pages |
| 5 Connect an API | about 14 clicks, 5–7 fields, 5 pages, three areas, no test | J18: about 6 clicks, 2 + n fields by 05's counting (6 + n interactions by this document's), 1 page, then 2 clicks on Releases | One wizard declares, binds and tests from a worker (`screens/ConnectionWizard.tsx:152-532`) | Deploy of the declaration is not linked from the sheet |
| 6 Monitor executions | No search by ID, target or error; 100-row cap; polling only | J15: 3 by ID; J16: every filter in the URL | Search over path, ID, tags and error text, cursor paging, retention stated (`screens/Runs.tsx:98-135`, `:209-211`); tenant event stream (`stream.ts:62`); queue panel (`screens/Execution.tsx:824`) | Custom date range, per-target filter, sort; stream health shown only on the runs list |
| 7 Internal tool | 6–8 clicks read-only; no widget can act | J26: 14–18 with a working action | Action widget and row actions with input mapping (`screens/ActionSettings.tsx:79-341`) | Undo, palette placement, publish summary |
| 8 Promote dev to production | 5–6 clicks, 1 field, 2 pages; a developer cannot ask for promotion | J24: 4 interactions, 1 page | "Request promotion" and review on the tenant overview (`screens/Promotion.tsx:34`, `:172`) | Promote step has no URL; success has no link |
| 9 Expose a script to an agent | 6+ clicks, 2 fields, 3 pages | Not re-traced as its own journey; J21c covers the service-account half | "Offer to an agent…" on scripts and flows (`screens/OfferToAgent.tsx:26`); "Try a tool" (`screens/AgentAccess.tsx:156`) | See J21c |

The pattern across the table: phases 9–11 fixed the *reading* and *re-running* journeys and the forms. The journeys that cross a boundary (editor → release, dev → production, object → its users) kept their shape.

## 3. The journeys

Each journey gives the persona and starting point, the steps with evidence, the counts, what works, the friction, the target and what blocks it. "I" = interactions, "P" = pages, "D" = dialogs/drawers, "CS" = context switches.

### J1 Create a script

**Persona and start:** developer, dev workspace, Scripts list.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks "New script" (or ⌘K → "New script") | Scripts list → `scripts/new` | `screens/Execution.tsx:124-128`; `kit/CommandPalette.tsx:394` |
| 2 | Types the path into the Path field in the header row | Script editor | `screens/Authoring.tsx:618-627` |
| 3 | Writes code over the prefilled starter (not counted) | Script editor | `screens/Authoring.tsx:27-39`, `:702-713` |
| 4 | Clicks "Save draft"; the address is replaced with `scripts/edit/<path>` | Script editor | `screens/Authoring.tsx:659-665`, `:378` |

**Counts:** I 3 · P 2 · D 0 · CS 0 · backtracks 0. From the workspace overview add 2 (rail "Build", then "Scripts").
**Works well:** one click to an editor with runnable starter code; path rules are stated in the error (`screens/Authoring.tsx:347-351`); the same editor serves connectors and trigger sources.

**Friction:**
- The starter's first line shows a red squiggle under `z` before anything is typed (Observed (mocked API), O8; cause at `editor/monaco.ts:39-41`).
- The editor is recreated on each keystroke in the Path field because its label embeds the path (`screens/Authoring.tsx:703`, `editor/CodeEditor.tsx:99`) (Inferred).
- The first save changes the component key from `new` to `edit/<path>` (`screens/Tenant.tsx:520`), so the editor remounts: Monaco's undo stack, the open tab and the test input reset.
- There is no autosave and no guard on leaving (`screens/Authoring.tsx:344`, `:392` are the only saves). The "All scripts" link above the title discards unsaved code without asking (`:610`).
- A script saved as a draft is not in the Scripts list the editor links back to: the list reads deployed scripts and the row type has no draft field (`screens/Execution.tsx:76-92`, `:106`) (Inferred from the row type).

**Target:** New script → path field focused with a default slug → code; draft autosaved with "Saved 3s ago". I 2 · P 2 · CS 0. **Blocks:** no autosave or leave guard (P0-4); remount on first save, `z` flagged, editor rebuilt per keystroke (P0-6); drafts absent from the list (P1-5, P2-2).

### J2 Configure inputs

**Persona and start:** developer in the script editor of a saved draft.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Edits `export const input = z.object(…)` in the code | Script editor | `screens/Authoring.tsx:27-32` |
| 2 | Clicks "Save draft"; the server reads the schema from the code as a background task | Script editor | `screens/Authoring.tsx:362-377`, `:263-278` |
| 3 | Clicks the "Try it" tab to see the form drawn from the schema | Right panel | `screens/Authoring.tsx:721`, `:592-599` |
| alt | For a script with no `input` export: types JSON Schema into a 7-row textarea on the Settings tab, then saves | Right panel | `screens/Authoring.tsx:541-558` |

**Counts:** I 2 · P 1 · D 0 · CS 0. Timeout, retries and "uses" are one field each on the Settings tab (`screens/Authoring.tsx:467-527`).
**Works well:** one source of truth for the input. `05-journeys.md` found the schema written twice (TypeScript and JSON Schema); the read-only echo "Change it there, and save" (`screens/Authoring.tsx:529-540`) removes that.

**Friction:**
- Schema-reading status and failure are shown on the Settings tab only (`screens/Authoring.tsx:560-571`); on "Try it" the form can be the previous schema's with no "updating" hint.
- The fallback is a plain textarea although the code editor supports JSON (`editor/CodeEditor.tsx:8`).
- Retries exposes a count only; delay and backoff exist in the body (`screens/Authoring.tsx:107`, `:478-497`).

**Target:** edit the schema in code → the form beside the code updates on autosave, with a visible "reading inputs…" state. I 0–1 · P 1. **Blocks:** no autosave (P0-4); status on one tab only and textarea fallback (P1-4).

### J3 Test the script

**Persona and start:** developer in the script editor.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks the "Try it" tab (the panel opens on Settings every time) | Right panel | `screens/Authoring.tsx:717-723` |
| 2 | Fills the form (n fields), prefilled with the last input while the editor stays open | Right panel | `screens/Authoring.tsx:592-599`, `:255-256` |
| 3 | Clicks "Save and run" (or "Run the draft" when nothing changed) | Right panel | `screens/Authoring.tsx:597`, `:390-403` |
| 4 | Scrolls down to the "Test run" section, which renders after the editor grid | Below the editor | `screens/Authoring.tsx:726-742` |
| again | ⌘↵ runs again with the last input | Window listener | `screens/Authoring.tsx:314-326`, `:406-408` |

**Counts:** I 2 + n · P 1 · D 0 · CS 0 · 1 forced scroll. Repeat run: 1.
**Works well:** save and run are one act; the server's refusals land on the form fields (`InputDialog.tsx:10-17`); the run is a real worker run of the draft with nothing deployed.

**Friction:**
- Run is two levels down: a tab, then a button. Nothing in the header runs the script.
- At 1440x900 the editor is a fixed 34rem (`screens/Authoring.tsx:708`) and the result starts at about y = 716 px, so only its heading is above the fold. Code area measured at about 39% of the viewport (Observed (mocked API), O8).
- ⌘↵ is a window listener and is not registered with Monaco, which binds the same chord to "insert line below"; it probably does not fire, or fires after inserting a line, while the cursor is in the code (Inferred).
- First run of a brand-new script: `test()` awaits `save()`, which navigates and remounts the editor; the continuation then sets the test run on the unmounted instance (`screens/Authoring.tsx:392-399`). The run starts but no result panel appears (Inferred; mechanism Verified).
- The first ⌘↵ sends `{}` as input (`screens/Authoring.tsx:256`); a required-input refusal lands in the page notice, not on the form.

**Target:** Run in the header and ⌘↵ inside Monaco; the form and output docked beside the code. I 1 + n · P 1 · 0 scrolls. **Blocks:** Run behind a tab, fixed editor, output below (P1-4); shortcut not registered, remount on first Save and run (P0-6).

### J4 Inspect output

**Persona and start:** developer, a test run has just started in the editor.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Scrolls to "Test run"; the panel opens on the Logs tab | Below the editor | `screens/Authoring.tsx:726-739`; `screens/Runs.tsx:575-591` |
| 2 | Clicks "Input and output" | Result panel | `screens/Runs.tsx:592-610` |
| 3 | Scrolls back up to the code | — | — |
| alt | Production: on Runs, clicks the row (peek), then "Input and output" | Runs inspector | `screens/Runs.tsx:392-396`, `:592` |

**Counts:** I 1 per run · P 1 · 2 forced scrolls per run. Production run: 2.
**Works well:** tables, markdown and media in the result are detected and drawn (`packages/ui/src/ResultView.tsx`); "Events it published" sits beside the run (`screens/Authoring.tsx:739`).

**Friction:**
- The panel is keyed by run ID (`screens/Authoring.tsx:738`), so it returns to Logs on every run: the result costs a click per iteration.
- On the full run page the tabs open on Input even for a succeeded run, where Output is the point (`screens/RunPage.tsx:388-392`), and the tab is not in the URL.
- Code and output cannot be seen together at 900 px height.

**Target:** output docked beside or under the code, result first, tab choice remembered. I 0 · 0 scrolls. **Blocks:** layout and tab reset (P1-4); panel sizes and tab not persisted (P3-5, P2-6).

### J5 Debug an error

**Persona and start:** developer, the test run failed.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Reads "Why it failed" (the message in mono) and the logs | Result panel | `screens/Runs.tsx:531-553`, `:580-590` |
| 2 | Scrolls up, finds the line by reading, fixes the code | Script editor | — |
| 3 | Presses ⌘↵ or clicks "Save and run" | Right panel | `screens/Authoring.tsx:316-326`, `:597` |
| 4 | Scrolls down; clicks "Input and output" again if the result matters | Result panel | `screens/Authoring.tsx:738` |

**Counts:** per iteration I 2 · P 1 · 2 forced scrolls · 0 dialogs.
**Works well:** a server-derived diagnosis with a next step appears for known causes (`screens/Runs.tsx:539-553`); type errors show as Monaco squiggles from the SDK's own type files (`editor/monaco.ts:24-46`).

**Friction:**
- The error is a message only. There is no stack frame and no jump to the line, although the editor can reveal a line (`editor/CodeEditor.tsx:15`; used only for repository sources at `screens/Authoring.tsx:947`).
- Monaco diagnostics are not collected anywhere (no marker listener), so there is no problem count and saving or running is not informed by type errors.
- The error and the code that caused it are a scroll apart in both directions.

**Target:** the error's frame is a link that moves the cursor to the line; ⌘↵ reruns; output stays in view. Per iteration I 1 · 0 scrolls. **Blocks:** no problems list or stack plumbing, layout (P1-4); log viewer lacks match navigation and copy (P1-6).

### J6 Save/deploy the script

**Persona and start:** developer in the script editor with a tested draft.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks "Save draft" if the run did not already save | Script editor | `screens/Authoring.tsx:659-665` |
| 2 | Clicks the "Review and deploy" text link (shown only when the draft is saved and clean) | → `changes` (Release, Review step) | `screens/Authoring.tsx:666-670` |
| 3 | Optionally types "What changed" | Release | `screens/Release.tsx:342-350` |
| 4 | Clicks "Deploy N changes" | Release | `screens/Release.tsx:351-374` |
| 5 | Reads the success notice; the stepper has moved to "Deploy to dev" | Release | `screens/Release.tsx:158`, `:166-171` |
| prod | Clicks the "Promote" step, "Promote to production", then confirms | Release | `screens/Release.tsx:155`, `:585-610` |

**Counts:** to deployed in dev I 2–3 (+1 for a message) · P 2 · CS 1. To production +3 and 1 dialog (J24).
**Works well:** deploy and promote are separate, differently coloured acts; the preview lists refusals and unbound connections before the button enables (`screens/Release.tsx:303-341`); "Production is untouched" is stated under the button (`:375-377`).

**Friction:**
- Deploy is on another page. `05-journeys.md` projected "Deploy from the editor header"; it is a text link here (`screens/Authoring.tsx:667`) and a primary button in the flow editor (`screens/FlowEditor.tsx:932`).
- The deploy carries every draft in the workspace as one version (`screens/Release.tsx:357-360`); the user cannot ship this script alone.
- Success is a notice listing paths (`screens/Release.tsx:362-364`): no link back to the script, to run the deployed version, or onward to Promote. The stepper moves to the ledger, not to Promote (`:170`).
- Review shows one sentence per draft, not a diff (`screens/Release.tsx:281-292`).

**Target:** "Deploy ▾" in the editor header ("Deploy this change" / "Review all N changes"), then a toast "Deployed as v42 · Promote to Clinics · Run it". I 2 · P 1 · CS 0. **Blocks:** no deploy action in editors and no next step on success (P1-5); toasts carry text only (P2-8); deploying one change needs a server change, since the endpoint takes all drafts (Inferred).

### J7 Create a workflow from existing scripts

**Persona and start:** developer, dev workspace, Flows list; three plain scripts exist.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks "New flow"; the canvas opens with a manual `start` trigger | Flows list → `flows/new` | `screens/Flows.tsx:99-103`; `screens/FlowEditor.tsx:529` |
| 2 | Types the path | Editor header | `screens/FlowEditor.tsx:860-868` |
| 3 | Per script: clicks "Add step" (search is not focused) | Floating palette | `screens/FlowEditor.tsx:960-979` |
| 4 | Per script: clicks "Run a script" (scripts themselves are not listed) | Palette | `screens/FlowEditor.tsx:111-116`, `:988-1001` |
| 5 | Per script: picks the script in the inspector's combobox | Right aside | `screens/FlowEditor.tsx:1185-1194` |
| 6 | Per script: drags from the previous step's right dot to the new step | Canvas | `screens/FlowEditor.tsx:1067` |
| 7 | Clicks "Save draft"; autosave starts only after this | Editor header | `screens/FlowEditor.tsx:923-930`, `:702-706` |

**Counts:** I 15 for three scripts (1 + 1 field + 3 × (3 clicks + 1 drag) + 1 save; the notes' 14 clicks, 3 drags and 1 field count each combobox pick as two clicks) · P 2 · D 0 · CS 0.
**Works well:** labelled undo and redo (`screens/FlowEditor.tsx:489-505`); "N to fix" computed on every change (`:307-375`); drafts of scripts are offered in the picker (`:433`).

**Friction:**
- A new step lands 280 px right of the right-most node, unconnected, whatever is selected, and the view re-fits (`screens/FlowEditor.tsx:572-590`). Every step needs a drag.
- Connecting has no keyboard or click path at all (`screens/FlowEditor.tsx:1067`); the help text describes dragging only (`:1359-1363`; Observed (mocked API), O9).
- Typing a script's path into "Find a step" finds nothing unless the script carries a node label (`screens/FlowEditor.tsx:1006-1039`).
- No copy, paste or duplicate: three similar steps are three full passes.
- A never-saved flow has no autosave (`screens/FlowEditor.tsx:703`) and no leave guard; it also shows a "Draft" tag beside "Not saved" (`:838`, `:872-876`).

**Target:** type-to-add from one list that includes scripts by path; the step is inserted after the selection and connected. I 8 for three scripts (1 + 1 + 3 × 2), 0 drags. **Blocks:** palette contents and placement (P1-8); drag-only connection (P0-8); autosave from the first change (P0-4); duplicate and paste (P3-6).

### J8 Configure workflow steps

**Persona and start:** developer in the flow editor with three unconfigured script steps.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Per step: selects it (already selected right after adding) | Canvas | `screens/FlowEditor.tsx:1070` |
| 2 | Per step: types the "Input" expression as free text | Right aside | `screens/FlowEditor.tsx:1271-1277` |
| 3 | Per step, when the input shape is not remembered: leaves for the Scripts list, opens the script, reads its `input`, returns | Scripts list / editor | `screens/Execution.tsx:233-257` |
| 4 | Optionally renames the step and presses Enter | Right aside | `screens/FlowEditor.tsx:1394-1412` |

**Counts:** I 6 for three steps (3 selections, 3 fields), plus up to 3 lookups, each a context switch and a backtrack · P 1 (+1 per lookup) · D 0.
**Works well:** the evaluated value appears under each expression once a test run exists (`screens/ExpressionField.tsx:76-89`); labelled nodes get a field-by-field form with resource pickers (`screens/FlowSteps.tsx:86-209`).

**Friction:**
- The schema-driven form is withheld from plain script steps, the most common case, although every script's `inputSchema` is loaded (`screens/FlowEditor.tsx:408-415`, `:1264-1277`). The user retypes, as an expression, a shape the console already holds.
- Expression fields have no completion and show nothing until a run exists, without saying why (`screens/ExpressionField.tsx:72-74`, `:103`).
- Renaming a step rewrites edges only (`screens/FlowEditor.tsx:603-621`); expressions that say `steps.<old>.output` break silently. Rename commits on Enter only (`:1395`).
- "N to fix" items are plain text: they do not select the node (`screens/FlowEditor.tsx:946-954`).

**Target:** the step's input is a form drawn from the script's schema; each field takes a literal or an expression with completion from the last run. I n fields, 0 lookups, 0 context switches. **Blocks:** `NodeInputs` gated to labelled nodes, rename, problems not clickable (all P1-8).

### J9 Test part of the workflow

**Persona and start:** developer in the flow editor with a saved draft.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks "Test"; the bottom panel opens, the canvas shrinks and re-fits | Editor header / panel | `screens/FlowEditor.tsx:920`, `:757-760` |
| 2 | Fills the input and clicks "Run a test": the whole flow runs from the manual trigger | Test panel | `screens/FlowTestPanel.tsx:74`; `screens/FlowEditor.tsx:723-731` |
| 3 | Clicks a step in the list or on the canvas to read its output in the aside | Panel / aside | `screens/FlowTestPanel.tsx:96-103`, `:123-167` |
| 4 | For a step's log: clicks "Open the run", which leaves the editor | → run page | `screens/FlowTestPanel.tsx:83` |

**Counts:** testing a part is **not possible**. Whole flow: I 2 + n, +1 per step read · P 1 (+1 for logs).
**Works well:** the whole-flow loop is 2 clicks with no page change, which meets the projection in `05-journeys.md`; step states are painted on nodes and taken edges (`screens/FlowEditor.tsx:762-790`); "The flow changed since this test" is said (`screens/FlowTestPanel.tsx:86-90`).

**Friction:**
- There is no run-from-step, run-one-step or pinned output. The test request carries a flow and an input only (`screens/FlowEditor.tsx:725-728`). The only workaround is to disconnect steps (select the edge, Backspace) and reconnect by drag afterwards.
- A flow whose trigger is not manual is told to change its trigger in order to be tested (`screens/FlowEditor.tsx:732-733`); a deployed flow with no draft cannot be tested until something is edited (`:736-738`).
- A running test cannot be cancelled from the panel; step input is not shown; logs are a page away.

**Target:** "Run from here" on a step, reusing the kept outputs of earlier steps; per-step input, output and logs inline. I 2 · P 1. **Blocks:** test from a step (P1-8); step input and logs beside output (P1-2); partial runs need server support (Inferred).

### J10 Inspect a production run

**Persona and start:** operator or on-call developer, production workspace overview.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks "Open failed runs" in Needs attention (or the header chip "N failed runs") | Overview → `runs?status=failed` | `screens/Overview.tsx:219-225`; `Shell.tsx:878-885` |
| 2 | Clicks a row: the inspector opens with state, "Why it failed" and logs. Or clicks the path for the full page | Runs / run page | `screens/Runs.tsx:392-406`, `:480-553` |
| 3 | From the peek, "Open full view" | → `runs/:id` | `screens/Runs.tsx:521-523` |

**Counts:** I 2 · P 2 · D 1 (peek) or 0 (page) · CS 0. `05-journeys.md` measured 4 clicks, with the chip opening the unfiltered list.
**Works well:** the error's first line is in the row; row = peek and path = page; every filter and the selected run are in the URL (`screens/Runs.tsx:98-111`).

**Friction:**
- Rows are 57 px, 82 px with a tag, and the first row starts at y = 282 px: about 10 rows in 900 px (Observed (mocked API), O3).
- The row is a `<tr onClick>` with no `tabIndex` or key handler (`screens/Runs.tsx:392-396`): the peek cannot be opened by keyboard.
- A reload or a shared link with `?run=<flow run id>` shows an error in the inspector, because script-or-flow is decided from the in-memory row (`screens/Runs.tsx:295-299`).
- A flow run's peek shows no steps and no failed-step name (`screens/Runs.tsx:450-477`).
- An unknown run state crashes the whole console to a blank page (Observed (mocked API), O1; `kit/status.tsx:79`).

**Target:** the overview lists the most recent failures; one click opens the run with the failure in view. I 1–2 · P 2. **Blocks:** runs list density and columns (P1-1); keyboard reach (P0-3); `?run=` for flow runs and crash on unknown state (P0-5, P0-1).

### J11 Diagnose a failed step

**Persona and start:** on-call developer, production, header chip showing failed runs.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks the failed-runs chip | → `runs?status=failed` | `Shell.tsx:878-885` |
| 2 | Clicks the flow's path | → flow run page | `screens/Runs.tsx:401-406` |
| 3 | Reads "The flow failed. <message>"; finds the red bar in the timeline; clicks it | Flow run page | `screens/Flows.tsx:679-683`, `:716-719` |
| 4 | Reads the step's error text and inline logs | Step panel below the tabs | `screens/Flows.tsx:778-811` |
| 5 | Clicks "Open this step's run" for the diagnosis, the input and the attempts | → script run page | `screens/Flows.tsx:807-809` |
| 6 | Presses browser Back to return; selects the step again | Flow run page | `screens/Flows.tsx:628` |

**Counts:** I 5–6 (4 to reach the diagnosis; Back and re-selecting the step make it 5–6) · P 3 · D 0 · CS 1 (step 5) · backtracks 1 · repeated lookup 1 (the step).
**Works well:** timeline with wait, run and hold segments; graph coloured by step state; step logs inline (`screens/Flows.tsx:806`); kept steps link to the run they were kept from (`:789-803`).

**Friction:**
- The banner neither names nor links the failed step, and no step is selected on open; the page ends with "Choose a step to see what it produced." (`screens/Flows.tsx:830`; Observed (mocked API), O7).
- Selection is component state (`screens/Flows.tsx:628`): a failed step cannot be linked, and Back from the step's run loses it.
- The step panel shows no input, shows output only for succeeded steps (`screens/Flows.tsx:825`), and shows the error as a bare paragraph with no diagnosis (`:778-785`). The flow's own input and output are never shown.
- The child run has no link back to its parent flow run: `startedBy` prints "A flow" as text (`screens/RunPage.tsx:140-151`).
- The graph draws the current definition, not the one the run used (`screens/Flows.tsx:629`) (Inferred risk after a redeploy).

**Target:** the run page opens with the first failed step selected and `?step=` in the URL; error, diagnosis, input, output and logs in one panel. I 2 · P 2 · CS 0 · backtracks 0. **Blocks:** failed step selected, named, addressable, with input (P1-2); live polling that stops after one failed read (P0-5).

### J12 Navigate from failure back to source

**Persona and start:** developer on a failed run's page in production.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Script run: clicks the path in the page title | → `scripts/edit/<path>` (read-only in production) | `screens/RunPage.tsx:105-108`, `:188` |
| 1' | Flow step: clicks "Open this step's run", then the path in that page's title | → script run → editor | `screens/Flows.tsx:807`; `screens/RunPage.tsx:188` |
| 1'' | Flow definition: clicks the path in the flow run's title | → `flows/<path>` (read-only view) | `screens/RunPage.tsx:512` |
| 2 | Clicks "version N" hoping for the code at that version | → `deployments` list | `screens/RunPage.tsx:113` |

**Counts:** script I 1 · P 2. Flow step I 2 (3 with step selection) · P 3 · CS 1. `05-journeys.md` Observed "link to code present: false"; the link now exists.
**Works well:** the title is the link, so the route is short; the trigger that started the run is linked with its row selected (`screens/RunPage.tsx:145`).

**Friction:**
- The editor shows whatever is current, not the version that ran; nothing says which (Inferred for what the editor loads; the link carries no version, `screens/RunPage.tsx:188`).
- "version N" lands on a list where the version is not located and nothing can be opened.
- No line is targeted; a flow step has no link to its script or to its node in the definition; the flow view does not highlight the failed node.
- The title link is plain ink with no affordance (`screens/RunPage.tsx:106`).

**Target:** "Open source at vN" on the error block, landing read-only on the file and line, or on the node. I 1 · P 2. **Blocks:** source at a version and step → script link (P1-3, P1-10); "what changed since the last success" (P3-7).

### J13 Make a correction

**Persona and start:** developer on the read-only script editor in production, after J12.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Reads "This is a production workspace. Code is edited in a dev workspace…": the notice has no link | Production editor | `screens/Authoring.tsx:681-685` |
| 2 | Opens the workspace switcher in the header | Shell | `Shell.tsx:750-762` |
| 3 | Picks the dev workspace; lands on the same *section* (the Scripts list), not the script | Dev Scripts list | `Shell.tsx:763-770` |
| 4 | Finds the script by eye (the list has no search) and clicks its path | → dev editor | `screens/Execution.tsx:131-149`, `:157` |
| 5 | Edits, then "Save draft" | Dev editor | `screens/Authoring.tsx:659-665` |
| alt 2–4 | ⌘K, types the path, moves to the row under "Other workspaces", Enter | Palette → dev editor | `kit/CommandPalette.tsx:126-133`, `:556-559` |

**Counts:** I 4 (3 to reach the dev editor, 1 save) · P 3 · CS 1 (workspace) · repeated lookup 1. The palette route is 4 to reach the editor. For a flow: 4 as well, through the flow view's "Edit this flow" link or the list inspector.
**Works well:** production really is read-only, with a plain reason; the palette reaches the dev copy without visiting a list.

**Friction:**
- Which dev workspace feeds this production is not stated on the production side. The header's "promotes to X" appears in the dev workspace only, as text (`Shell.tsx:774-787`); the production overview says "This workspace promotes nowhere." (`screens/Overview.tsx:439`); the versions list says "Promoted" with no source although the row carries `promotedFromWorkspaceId` (`screens/Release.tsx:59`, `:477`).
- The switch drops the object path and the query string (`Shell.tsx:766-769`).
- The failed run and its input do not travel. The user copies the input by hand before leaving, or keeps the production run open in a second tab.
- For flows, production replaces the editor with a notice and no link at all (`screens/Tenant.tsx:451-454`).

**Target:** "Edit in <dev workspace>" on the production run page and read-only editor, opening the same path in dev with the failed run's input loaded as the test input. I 1 · P 2 · repeated lookup 0. **Blocks:** dev↔prod jump for the same object and input carry-over (P1-3); the switcher keeping the object (P2-6).

### J14 Rerun or retry

**Persona and start:** operator on a finished run's page.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Opens "Re-run ▾" | Run page header | `screens/RunPage.tsx:228-246`, `:550-571` |
| 2 | Script: "With the same input", "With other input…" or "On the version deployed now". Flow: "Retry from the failed step…", "Again from the start", "Again, with other input…", "On the version deployed now" | Menu | `screens/RunPage.tsx:237-245`, `:559-570` |
| 3 | Confirms; the dialog states the version and input, and for a retry what runs again and what is kept | Confirm dialog | `screens/RunPage.tsx:170-180`, `:468-493` |
| 4 | Lands on the new run's page | → `runs/:newId` | `screens/RunPage.tsx:166-169`, `:464-467` |

**Counts:** I 3 · P 2 · D 1. With other input: 3 + edited fields, in a form prefilled with the run's input (`screens/RunPage.tsx:424-435`). `05-journeys.md` measured 1 click for a script (same input only) and about 6 steps for a flow, from scratch.
**Works well:** the wording says exactly what will run; the retry plan names kept approvals; old and new runs link both ways (`screens/RunPage.tsx:201-206`, `:520-525`).

**Friction:**
- Not available from the runs list or the peek (`screens/Runs.tsx:501-528` has Cancel, Open full view and copy-as-curl only): +1 from the list.
- "Retry from the failed step" always runs "On version N, with the same input" (`screens/RunPage.tsx:489`, `:492`). After a fix is promoted, the only option that uses it reruns every step (`:494-504`), including steps with side effects that had succeeded.
- No retry from a chosen step, only from the first failed one; no batch re-run.
- "Re-run of a run" and "Run again N times" name no state and link only the first (`screens/RunPage.tsx:201-206`).

**Target:** the same 3, also from the list and peek, plus "Retry from the failed step on vN" once a newer version is deployed. **Blocks:** "Re-run on vN" (P1-3); batch re-run from the list (P3-3).

### J15 Find a historical execution

**Persona and start:** operator anywhere in the workspace.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Opens Runs | Runs | `nav.ts:115-121` |
| 2 | Sets "When" to "Last 7 days" or "Everything kept" | Runs toolbar | `screens/Runs.tsx:107` |
| 3 | Types in Search: a path prefix, an exact ID, an exact tag or error text | Runs toolbar | `screens/Runs.tsx:109`, `:117-123`, `:227` |
| 4 | Scrolls; clicks "Load more" k times; clicks the row | Runs | `screens/Runs.tsx:330-343`, `:392-396` |
| alt | ⌘K, types `>` and the run ID, Enter | Palette → run page | `kit/CommandPalette.tsx:738` |

**Counts:** list I 4 + k · P 1–2 · D 0–1. By ID I 3. `05-journeys.md` found no search by ID, target or error and no paging past 100 rows.
**Works well:** search and window are in the URL; retention is stated in the header (`screens/Runs.tsx:209-211`).

**Friction:**
- No custom date range and no per-script or per-flow filter, though the API has both; the console never sends `target` (`screens/Runs.tsx:132-137`). The workaround is a path prefix in Search.
- No sort; newest first only. "Started" shows the received time (`screens/Runs.tsx:441`).
- Script and flow screens do not link to "all runs of this": the script inspector links the last run only (`screens/Execution.tsx:289-293`), the flow view lists 20 (`screens/Flows.tsx:363-365`).
- Loaded pages reset on leaving the screen (`screens/Runs.tsx:142-145`), so Back from a run page loses the place.

**Target:** "Runs of this script" from the script or flow (1), or Runs with target and date-range filters. I 3–4, no "Load more" hunting. **Blocks:** filters complete and sortable (P1-1); script → its runs (P1-10); saved views (P3-4).

### J16 Filter executions

**Persona and start:** operator on Runs.

| # | What the user does | Evidence |
| --- | --- | --- |
| 1 | Clicks a status chip (All, Failed, Running, Waiting, Queued, Succeeded, Canceled), each with a server count | `screens/Runs.tsx:98-100`, `:260-265` |
| 2 | Chooses Kind (script / flow) and When (1 h, 24 h, 7 d, all) | `screens/Runs.tsx:105-107` |
| 3 | Clicks a tag on a row to filter by it | `screens/Runs.tsx:422-428` |
| 4 | Types in Search (300 ms debounce) | `screens/Runs.tsx:117-123` |

**Counts:** I 1 per filter · P 1 · D 0. A view such as "failed flows, last 7 days, tag X" is 4.
**Works well:** every filter is URL-backed and shareable; the legacy `?status=cancelled` still works; chip counts come from the server.

**Friction:**
- One status at a time; "Waiting" merges waiting for approval and waiting for a timer (`screens/Runs.tsx:63`).
- No filter by trigger, version or duration; one tag only.
- "Cancel queued runs" sits beside the chips and cancels every queued run in the workspace regardless of the filter (`screens/Runs.tsx:165-177`, `:267`).
- No "clear filters"; the filtered-empty state offers no reset (`screens/Runs.tsx:311-313`); filter changes add no history entries (`router.tsx:48`), so Back does not undo one.
- "Waiting for approval" overflows the Status column into the path (Observed (mocked API), O4).

**Target:** the same single-click filters, complete (target, trigger, version, date range, several statuses), with a reset and a saved view. I 1 per filter; 1 for a saved view. **Blocks:** P1-1; saved views (P3-4); Back undoing a filter (P2-6).

### J17 Inspect logs

**Persona and start:** developer on Runs.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks a script run's row: the peek opens on the Logs tab | Runs inspector | `screens/Runs.tsx:575-591` |
| 2 | Optionally: types in the log search (filters lines), sets a minimum level, toggles Wrap or Follow, downloads | Log viewer | `packages/ui/src/LogViewer.tsx:55-65`, `:101-129`, `:73-84` |
| 3 | For width: clicks the path for the full page, where the log is the first block | Run page | `screens/RunPage.tsx:380-387` |
| flow | On a flow run page, selects a step: its log is inline | Flow run page | `screens/Flows.tsx:804-811` |

**Counts:** I 1 · P 1–2 · D 1.
**Works well:** logs are the default view of a run; level colours and structured fields under the line (Observed (mocked API), O6); download of all lines.

**Friction:**
- A finished run with more than 500 lines shows the first 500 and the count says "500 lines": the hook fetches one page per refresh and, with the stream connected, refreshes only on events (`screens/Execution.tsx:371-373`, `:399-409`; server page size at `apps/control-plane/src/routes/execution.ts:1328`, `:1368-1371`).
- One failed poll leaves a sticky error that replaces the whole run until navigation (`screens/Execution.tsx:375-383`; `screens/RunPage.tsx:161`).
- Search hides non-matching lines, so the context around a match is lost; no next/previous match, no copy line, no line numbers, no attempt separators (`packages/ui/src/LogViewer.tsx:3-11`, `:157-171`).
- The viewer is a fixed 28rem box even on the full page (`packages/ui/src/LogViewer.tsx:46`, `:154`); the peek is 22–26rem wide.
- A flow has no combined log.

**Target:** the same 1 interaction to a complete, full-height log with match navigation and copy. I 1. **Blocks:** log paging and sticky error (P0-5); LogViewer v2 (P1-6).

### J18 Create or edit a resource/credential

**Persona and start:** developer, dev workspace, Connections list; an HTTP connection with a token.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks "New connection" | Side sheet | `screens/Execution.tsx:584-588` |
| 2 | Chooses "A new connection…" in the Connection select (it defaults to the first declared, unbound one) | Sheet, section 1 | `screens/ConnectionWizard.tsx:172-174` |
| 3 | Types the name, chooses the kind | Sheet | `screens/ConnectionWizard.tsx:249-254` |
| 4 | Fills the settings drawn from the connector's schema (n fields) and the token | Sheet, sections 2–3 | `screens/ConnectionWizard.tsx:427-454` |
| 5 | Clicks Save: a draft declaration is written, the binding saved and a test run from a worker | Sheet footer | `screens/ConnectionWizard.tsx:257-264`, `:295` |
| 6 | Scrolls to section 4 to read Saved / Reached | Sheet | `screens/ConnectionWizard.tsx:457-516` |
| 7 | Deploys the draft declaration from Releases, which the sheet does not link | → Release | `screens/ConnectionWizard.tsx:464-466`; `Shell.tsx:868-876` |
| edit | Row "Change" → edit → Save → automatic test | Sheet | `screens/Execution.tsx:625-628` |

**Counts:** create I 6 + n (2 clicks, 2 choices, 2 + n typed fields), then 2 on Releases · P 1 (+1) · D 1 · CS 1. Edit I 3. Set a secret: 4 (button, name, value, submit; `screens/Tenant.tsx:686-702`). Set a variable's value: 4 (`screens/Execution.tsx:686-704`). `05-journeys.md` measured about 14 clicks over 5 pages with no test.
**Works well:** one wizard that declares, binds and proves the connection from where scripts run; "Change the token" after a failed test (`screens/ConnectionWizard.tsx:517-527`); secrets are write-only everywhere.

**Friction:**
- After Save the connection reads "Saved" and "Reached" but no script can use it until the draft declaration is deployed; the list never shows that it is pending (`screens/Execution.tsx:597-617` does not render `defined`).
- Save is in the sticky footer and its result is at the bottom of the scroll.
- Esc or a backdrop click discards everything typed (`packages/ui/src/SideSheet.tsx:42`).
- Replacing a secret means retyping its exact name; a typo silently creates a second secret (`screens/Tenant.tsx:689-695`). Changing a variable means re-finding it in a combobox with no prefill (`screens/Execution.tsx:689-699`).
- No connection, variable or secret has its own URL; the palette opens the list only (`kit/CommandPalette.tsx:142-143`).
- A failed data-source test is announced with a success toast (`screens/Data.tsx:1068-1072`).

**Target:** the same sheet as a real stepper with a fifth step "Declared in a draft — deploy" that deploys or links; row-level "Replace value" for secrets and variables. I 6 + n + 1 · P 1 · CS 0. **Blocks:** deploy hand-off (P1-5); per-object URLs (P1-10); SecretField and one save model (P2-7); the success toast on failure (P0-6).

### J19 Determine where a resource is used

**Persona and start:** workspace admin about to rotate a credential, on Connections (or Variables, Secrets).

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Finds the row by eye (no search) | List | `screens/Execution.tsx:591-617` |
| 2 | Reads "Used by": the first three paths and "and N more" | Cell | `kit/references.tsx:19-30`; `screens/Execution.tsx:601` |
| 3 | Hovers for the full list and how each uses it (pointer only) | `title` tooltip | `kit/references.tsx:23-29` |
| 4 | To open a user: Build → Scripts → finds the row → opens it | Scripts list / editor | `screens/Execution.tsx:157` |
| 5 | Returns to Connections for the next one | — | — |

**Counts:** I 1–2 to read up to three users; +3 per user opened · P 1 (+1 per user) · CS 1 and backtrack 1 per user · repeated lookup 1 per user.
**Works well:** the column exists for connections, variables and secrets, which `05-journeys.md`'s source audit found only on secrets.

**Friction:**
- The names are text, not links; beyond three the list is reachable only by hovering, so not by keyboard or touch.
- The reverse direction (what a script uses) is dead text too (`screens/Execution.tsx:279-288`).
- Data sources, connection-group members, tables and worker pools have no usage column.
- Destructive confirms say "Scripts that use it will fail" or "Anything that uses it will fail." without listing them, although the list is in scope (`screens/Execution.tsx:633-638`; `screens/Tenant.tsx:703-710`).
- "Nothing deployed uses it" does not cover drafts.

**Target:** each path is a link; "+N more" opens the full list with kind and usage; the same list appears in the confirm. I 1–2 to read, +1 per user · CS 0. **Blocks:** references as links (P1-10); confirms that list what is affected (P0-9).

### J20 Configure scheduling/triggers

**Persona and start:** developer who has just deployed a script and wants it to run every weekday morning; starts in the script editor.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 0 | Looks for "Schedule" on the script: there is none in the editor or the Scripts inspector | — | `screens/Execution.tsx:241-257` |
| 1 | Goes to Operate → Triggers | Triggers | `nav.ts:115-121` |
| 2 | "New trigger" ▸ "Schedule" | Side sheet | `screens/Operate.tsx:103-118` |
| 3 | Types a path | Sheet | `screens/ScheduleForm.tsx:321-329` |
| 4 | Picks the script again in "What it starts" | Sheet | `screens/ScheduleForm.tsx:144-160` |
| 5 | Picks a preset (or types cron); reads "Next times"; the zone defaults to the browser's | Sheet | `screens/ScheduleForm.tsx:162-203`, `:268-271` |
| 6 | Fills the input drawn from the script's schema (n fields) | Sheet | `screens/ScheduleForm.tsx:214-226` |
| 7 | "Save draft": the sheet closes with a toast "<path> is saved as a draft. Deploy it from Changes." | Triggers | `screens/ScheduleForm.tsx:281-297` |
| 8 | Header "N drafts · Review", then "Deploy N changes" | → Release | `Shell.tsx:868-876`; `screens/Release.tsx:351-374` |

**Counts:** I 9 + n (the notes' 10 clicks count two combobox picks as two clicks each) · P 2–3 · D 1 · CS 2 · repeated lookup 1. Webhook, form or event trigger: "New trigger" navigates to a full-page resource editor instead (`screens/Operate.tsx:113-116`): about 7 interactions over 3 pages. `05-journeys.md` measured 8 clicks, 4 fields, 4 pages with free-text cron and zone.
**Works well:** next fire times computed by the scheduler in the chosen zone; presets; the footer names the first outstanding problem beside a disabled Save (`screens/ScheduleForm.tsx:306-316`).

**Friction:**
- No entry point from the script or flow, so the target is always picked again.
- Three ways to schedule with three capability levels: this sheet; All resources (starts at `0 8 * * *`, UTC; `screens/ResourceEditor.tsx:72`); and a flow's own schedule trigger, a bare cron field with no zone, presets or preview (`screens/FlowEditor.tsx:1138-1148`).
- After saving, the Triggers list is reloaded (`screens/Operate.tsx:196-199`) but the new schedule is a draft and the list reads deployed triggers (Inferred): the thing just made is not visible.
- The toast names "Changes" and offers no link; the trigger exists only after a deploy that carries every other draft.
- Changing the target silently clears the input (`screens/ScheduleForm.tsx:157`).

**Target:** "Add trigger ▾" on the script or flow → Schedule sheet with the target prefilled → preset → "Save and deploy". I 4 · P 1 · CS 0 · lookup 0. **Blocks:** scheduling in context and one schedule form (P1-9); deploy hand-off (P1-5).

### J21 Common administrative actions

Starting point is the tenant overview unless stated. Counts follow section 1's definition and are higher than the step counts in the notes.

#### J21a Add a member with a role in one workspace

**Persona:** tenant admin.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Opens Members & access; clicks "Add member" | Dialog | `screens/Members.tsx:117`, `:294-305` |
| 2 | Types the email; for someone with no account also a name and an invented initial password; submits. Nothing confirms; the row appears as "Through groups only" | Dialog → list | `screens/Members.tsx:299-305` |
| 3 | Clicks the "Access grants" tab; clicks "Give access" | Tab → dialog | `screens/Members.tsx:339`, `:475-504` |
| 4 | Finds the same person again in "Who", a native select of every member, group, service account and end user | Dialog | `screens/Members.tsx:370-390`, `:478` |
| 5 | Chooses the role (raw names, no descriptions) and "Where" (default "Whole tenant"); submits. Nothing confirms | Dialog | `screens/Members.tsx:483` |

**Counts:** I 10 (12 for a new account) · P 2 · D 2 · CS 1 · repeated lookup 1 · 1 step outside the console (telling the person their password).
**Works well:** the page says "Belonging grants nothing by itself"; tabs are URL-addressed (`screens/Members.tsx:14-19`).

**Friction:** adding and granting are two tabs with no hand-off; whether the account exists cannot be known before filling the form; the default scope is the whole tenant; reopening a cancelled dialog shows the previous email and password (`ListScreen.tsx:127`, `:153`); both writes are silent.

**Target:** "Add member": email → role and scope with one-line role descriptions → toast "Added … as developer in Billing · View access". I 6 · P 1 · D 1 · lookup 0. **Blocks:** principal-first "Give access" (P2-11); success feedback (P2-8); dialog that clears on cancel and has no silent defaults (P0-9).

#### J21b Why can a member do X

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Members & access → types in search → clicks the row | Inspector (direct bindings only) | `screens/Members.tsx:121-125`, `:262-278` |
| 2 | Clicks "View access" | → `/members/:id` | `screens/Access.tsx:244` |
| 3 | Reads "What gives them access" | Member page | `screens/Access.tsx:61-65` |
| 4 | Types the exact permission, such as `promotion:write`, to get Yes/No and where | Member page | `screens/Access.tsx:125`, `:177-199` |
| 5 | Clicks a source to land on Access grants with the binding highlighted | → `/access?binding=` | `screens/Members.tsx:355-365` |

**Counts:** I 5–6 · P 2–3 · D 1. The strongest administrative journey.

**Friction:** the check fires only for an exact `kind:verb` string; no workspace can be chosen for the question; the page is read-only, so fixing what was found means leaving; the group link goes to the Groups tab, not the group (`screens/Access.tsx:77`); row → inspector → page is one hop more than needed.

**Target:** the same with a permission picker, a workspace selector and "Remove this binding" inline. I 4. **Blocks:** P2-11.

#### J21c Service account + API key

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Service accounts → "Create service account" → name, purpose → submit (silent; stays on the list) | Dialog | `screens/Tenant.tsx:777` |
| 2 | Clicks the new row; clicks the small footer link "Keys and agent access" | Inspector → page | `screens/Tenant.tsx:837-842` |
| 3 | "Create API key" → name → submit; the key appears in a notice with no Copy button | Page titled "Service account keys", with no account name | `screens/Tenant.tsx:723-764`; `screens/Account.tsx:51-56` |
| 4 | Selects the key text and copies it by hand | Page | — |
| 5 | Members & access → Access grants → "Give access" → finds "Service account: <name>" → role → where → submit | Dialog | `screens/Members.tsx:475-504` |
| 6 | Returns to the account page (list → row → link) to confirm under Access | Page | `screens/Tenant.tsx:753-764` |

**Counts:** I 19 (22 with the check in step 6) · P 3 · D 4 · CS 2 · backtracks 1 · repeated lookup 2.

**Friction:** the object is split between an inspector and a page; create does not land on the result; the page that reports access cannot give it; a key with no role works and can do nothing, and nothing warns; the agent settings snippet contains a placeholder even right after a key is made (`screens/AgentAccess.tsx:42`).

**Target:** create → land on one account page (name in the header) with Access ("Give access" prefilled), Keys (Copy, ready-made snippet) and Agent. I 13 · P 2 · D 2 · CS 0. **Blocks:** service account as one page (P2-11); Copy on new keys (P0-10).

#### J21d Create a dev workspace linked to production

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Workspaces → "Create workspace" → name, slug, Type changed from the default Dev to Production → submit (silent; stays on the list) | Dialog | `screens/Tenant.tsx:306-340` |
| 2 | "Create workspace" again → name, slug, Type left as Dev, "Promotes to" = the production one → submit | Dialog | `screens/Tenant.tsx:326-338` |
| 3 | Clicks the dev workspace's name | → workspace | `screens/Tenant.tsx:297-300` |

**Counts:** I 12 · P 2 · D 2 · same form twice · repeated lookup 1.

**Friction:** the type "cannot be changed afterwards" yet defaults silently to Dev; "Promotes to" is shown for a production workspace; the slug is not derived from the name; the empty state advises production first while the default is Dev (`screens/Tenant.tsx:304`); no navigation after create.

**Target:** one dialog: name → "Create production and a linked dev workspace" → lands in dev. I 5 · D 1. **Blocks:** first-run pair and landing (P2-13); no silent defaults (P0-9).

#### J21e Set up SSO

| # | What the user does | Count | Evidence |
| --- | --- | --- | --- |
| 1 | Single sign-on → "Connect a provider" → audience, protocol, name, issuer, client ID, secret → submit; lands on the provider with a stepper | 9 | `screens/SingleSignOn.tsx:141`, `:1171-1190` |
| 2 | Copies the redirect address; configures the identity provider (outside the console) | 1 | — |
| 3 | "Try signing in" (new tab); returns; presses "Show the result" | 2 | `screens/SingleSignOn.tsx:333-369` |
| 4 | Domains tab → types the domain → adds → copies the TXT name and value; edits DNS (outside) | 5 | `screens/SingleSignOn.tsx:952` |
| 5 | "Check now", repeated until DNS propagates | 1+ | — |
| 6 | Groups tab → adds a mapping (2 fields) → "Save mapping" | 4 | `screens/SingleSignOn.tsx:557-591` |
| 7 | Settings tab → provisioning on, default role → Save | 4 | `screens/SingleSignOn.tsx:715-878` |
| 8 | "Turn on" in the page header (no confirm, no precondition check) | 1 | `screens/SingleSignOn.tsx:1078-1091` |
| 9 | Account → makes recovery codes, as a notice with no link advises | 3 | `screens/SingleSignOn.tsx:1101-1106` |
| 10 | Back to Single sign-on → reopens the provider (the view was component state) → "Require it" → confirms | 4 | `screens/SingleSignOn.tsx:1056-1062`, `:1171` |

**Counts:** I about 34 · P 3 + 2 external · D 3 · CS 3 (2 external) · backtracks 1 · repeated lookup 1.
**Works well:** the provider is created off; "Try signing in" shows what the provider sent and what would happen; "Require it" states the lock-out consequence.

**Friction:** neither the provider nor its tab is in the URL, so a reload mid-setup returns to the list; the test result must be fetched by hand; no DNS polling; stepper step 4 points to the "Set up" tab while its control is in the header (`screens/SingleSignOn.tsx:1098`, `:422-423`).

**Target:** provider and tab in the URL; the result arrives by itself; DNS check polls; the last step holds "Turn on" and "Require" with their preconditions and recovery codes in place. I about 26 · CS 2 (external only) · backtracks 0. **Blocks:** SSO state in the URL (P2-11, P2-6).

#### J21f Register a self-hosted worker

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Workers; scrolls past Queue and the pool cards | Workers | `screens/Execution.tsx:922` |
| 2 | Optionally "Add pool" → name → submit | Dialog | `screens/Execution.tsx:951-963` |
| 3 | "Create credential" → name, pool → submit; the token appears in a notice with no Copy | Dialog → notice | `screens/Execution.tsx:1026-1037`, `:1081-1088` |
| 4 | Selects and copies the token by hand; reads "platform-worker --url <this instance> --token <credential>" in the section description and substitutes both | Terminal | `screens/Execution.tsx:1037` |
| 5 | Runs the worker; returns and watches for the pool card to say "1 online" | Workers | `screens/Execution.tsx:731` |

**Counts:** I 7 (10 with a pool) plus assembling the command by hand · P 1 + terminal · D 1–2 · CS 1 (external).

**Friction:** the set-up task is the last section of a monitoring page; the command is prose with unfilled placeholders although the browser knows the instance address; the one-time token has no Copy; nothing confirms the connection.

**Target:** "Add a worker" → pool → a panel with the full command filled in and a Copy button, then "Waiting for the worker… connected". I 5. **Blocks:** Copy and copyable start command (P0-10); connection status (P1-7).

#### J21g Who changed X in the audit log

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Opens Audit log: the newest 50, the inspector open on the newest | Audit | `screens/Audit.tsx:103`, `:160-162` |
| 2 | Chooses Area and Since (server-side) | Toolbar | `screens/Audit.tsx:124-131` |
| 3 | Types the resource's name in Search, which filters the loaded entries only; targets are shown as IDs | Toolbar | `screens/Audit.tsx:147-158`, `:211-213` |
| 4 | Clicks "Show older entries" at the top of the page, k times, scrolling back up each time | Toolbar | `screens/Audit.tsx:279-283` |
| 5 | Clicks an entry and reads the raw `details` JSON | Inspector | `screens/Audit.tsx:323` |

**Counts:** I 5 + k, unbounded · P 1 · D 1.

**Friction:** the search can miss silently: nothing says it covers only what is loaded, and chip counts are counts of loaded rows (`screens/Audit.tsx:163`); no actor or target filter; the target is an ID and not a link; filters and the open entry are not in the URL, so an entry cannot be put in a ticket; no "history of this" from the resource itself.

**Target:** server-side search with actor and target facets in the URL, named and linked targets, and "Changes to this" on each resource. I 4 from the log, 1–2 from the resource. **Blocks:** server-side audit search and URL state (P2-11, P2-6).

#### J21h Operator opens access to a tenant

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | On `/`: searches, clicks the tenant's name; sees the gate "You have no access to this tenant" | Gate | `screens/Tenant.tsx:165-189` |
| 2 | "Open operator access" → reason, level (viewer first), duration → submit | Dialog | `screens/Tenant.tsx:98-136` |
| 3 | The same address renders with a banner naming role, expiry and reason | Any tenant screen | `screens/Tenant.tsx:195-213` |
| 4 | "End access now" when done (no confirm, no confirmation) | Banner | `screens/Tenant.tsx:201-204` |

**Counts:** I 6–8 · P 2 · D 1. Clean.

**Friction:** the gate does not name the tenant; the screen is blank while grants load (`screens/Tenant.tsx:164`); no expiry countdown; ending is silent and its failure is unhandled.

**Target:** the same 6, with the tenant named, a countdown and a link to "what I did" in the audit log. **Blocks:** feedback on writes (P2-8); audit facets (P2-11).

#### J21i Fresh instance → first running script

**Persona:** the instance operator who installed the platform.

| # | What the user does | Count | Evidence |
| --- | --- | --- | --- |
| 1 | Signs in as the bootstrap admin (email, Continue, password, Sign in) | 4 | `screens/SignIn.tsx:110-117` |
| 2 | "No tenants yet" → "Create tenant" → name, slug → submit (silent; stays on the list) | 4 | `screens/Tenants.tsx:19`; `kit/ListCollection.tsx:131-141` |
| 3 | Clicks the tenant: the gate, because the creator is not a member | 1 | `apps/control-plane/src/routes/tenants.ts:168-203` |
| 4 | "Open operator access" → reason, level raised to `tenant_admin` (viewer cannot create), → submit | 4 | `screens/Tenant.tsx:98-136` |
| 5 | Workspaces → creates production, then dev linked to it, opens dev (J21d) | 12 | `screens/Tenant.tsx:306-340` |
| 6 | Build → Scripts → "New script" → path → "Try it" → "Save and run" | 6 | `screens/Execution.tsx:207-231` |
| 7 | For access that outlasts the grant: Members → add self → Access grants → give `tenant_admin` | 9 | `screens/Members.tsx:294-305`, `:475-504` |

**Counts:** I about 31 to a first run (40 with lasting access) · P 5 · D 4 · CS 3 · backtracks 1 · the workspace form twice · a reason typed to enter a tenant made a minute earlier.
**Works well:** the Scripts empty state offers both the console and the CLI path; the starter script runs as written.

**Friction:** three requirements are learned by hitting them: the grant, production-first, and a worker (if none is online the run queues and the only hint is on the tenant overview, `screens/TenantOverview.tsx:102`); no checklist ties the steps together; step 6 can hit the first-run defect in J3 (Inferred).

**Target:** creating a tenant makes the creator a member and lands in it; an empty tenant shows a four-step first-run panel (workspace pair, worker, sample script, invite the client's admin), each step doing the real action. I at most 15. **Blocks:** first run and empty states (P2-13); one-time secrets for the worker step (P0-10).

### J22 Decide an approval

**Persona and start:** approver, tenant Approvals queue.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Opens Approvals (from a workspace overview, "Decide" leaves the workspace for the tenant-wide queue) | Queue | `screens/Overview.tsx:256-262`; `screens/Operate.tsx:620` |
| 2 | Clicks "Approve" in the row | Prompt | `screens/Operate.tsx:780-788` |
| 3 | Confirms the prompt "Note (optional)"; the row disappears | Prompt | `screens/Operate.tsx:634-657` |

**Counts:** I 3 · P 1 · D 1. From the mail link: 2, with no sign-in (`screens/ApproveLink.tsx:33`). From a flow run page: 2 (`screens/Flows.tsx:684-704`).
**Works well:** oldest first; who decides and the timeout in the inspector; deciding in place on the run page.

**Friction:** Approve always opens a prompt, an extra dialog for the common no-note case; no confirmation and no link to the resumed run afterwards (`screens/Operate.tsx:652-653`); no batch decision; the queue mixes workspaces with no filter; Waiting/Decided and the selection are not in the URL (`:621`, `:629`); the detail is raw JSON.

**Target:** Approve = 1 click with an undo toast carrying "Open run"; the note inline and optional. I 1. **Blocks:** batch actions (P3-3); toasts with actions (P2-8); per-approval URLs (P1-10).

### J23 Pause a trigger

**Persona and start:** operator on Triggers.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Clicks the trigger's row | Inspector; `?trigger=` in the URL | `screens/Operate.tsx:80`, `:244-249` |
| 2 | Clicks "Pause this trigger" | Prompt | `screens/Operate.tsx:274-296` |
| 3 | Optionally types why (shown to everyone); clicks Pause | Prompt | `screens/Operate.tsx:276-283` |

**Counts:** I 4–5 including opening Triggers · P 1 · D 2. The palette offers "Pause trigger…" through a picker (`kit/CommandPalette.tsx:367-481`).
**Works well:** the reason is shown to all; the selection is in the URL so a run links to its trigger; the prompt is styled as dangerous in production (`screens/Operate.tsx:280`).

**Friction:** no row-level action and no batch pause; no confirmation and no undo after pause or resume (`screens/Operate.tsx:259`, `:289`); the type filter is component state (`:77`); production is marked only by a small tag while this action stops production work.

**Target:** a row action with an inline optional reason and an undo toast. I 2–3. **Blocks:** batch actions (P3-3); feedback (P2-8); production signal (P4-5).

### J24 Promote dev → prod

**Persona and start:** developer with `promotion:write`, dev workspace, a version already deployed.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Opens Releases; clicks the "Promote" step in the stepper | Release | `screens/Release.tsx:126-139`, `:155` |
| 2 | Reads From/To and the preview, including "Tried here: N runs, M failed" | Promote step | `screens/Release.tsx:524-555`, `:689-709` |
| 3 | Clicks "Promote to production"; confirms | Confirm | `screens/Release.tsx:585-610` |
| 4 | Reads "<target> now runs version N." | Inline notice | `screens/Release.tsx:557-565` |

**Counts:** I 4 · P 1 · D 1. Without permission: "Request promotion", decided by someone else on the tenant overview (`screens/Promotion.tsx:34`, `:229`). `05-journeys.md` measured 5–6 clicks and 2 pages with no way to ask.
**Works well:** the same bundle is promoted by digest; the confirm states the version and what happens to runs in progress; the amber promote button is the one action that changes production.

**Friction:** the Promote step has no URL: `setStep` never updates the address and a reload returns to Review (`screens/Release.tsx:117-119`; `screens/Tenant.tsx:549`); the success sentence has no link to production, its runs or the version; the drift evidence sits below the button (`screens/Release.tsx:616`); the confirm's button always reads "Promote to production" (`:592`).

**Target:** the step in the URL; from the deploy toast, "Promote" (1) + confirm (1); success offers "Open <production>" and "Re-run failed runs on vN". I 2–3. **Blocks:** hand-offs (P1-5); URL state (P2-6).

### J25 Browse and edit a table row

**Persona and start:** developer fixing a value, Data area.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Opens Tables; clicks the table | → `tables/:name`, Rows view | `screens/Data.tsx:490`, `:502`, `:584` |
| 2 | Types in a column's filter box (a request per keystroke) | Grid header, row 2 | `screens/Data.tsx:207-212`; `packages/ui/src/Grid.tsx:253` |
| 3 | Clicks the cell; types; presses Enter | In place | `packages/ui/src/Grid.tsx:146-158`, `:180-186` |

**Counts:** I 6 · P 2 · D 0. Efficient for one scalar value.
**Works well:** in-place edit with the error under the cell; server-side filter, sort and count ("Rows 51 to 100 of 1,234 that match").

**Friction:** sort, filters, page, hidden columns and density are component state (`screens/Data.tsx:91-99`), lost on reload or when leaving to check another table; clicking away commits (`packages/ui/src/Grid.tsx:180`) with no undo; long text, JSON, timestamps and references are edited as one-line raw strings; the row sheet is modal and read-only (`screens/Data.tsx:281-312`); every cell is a tab stop, with no arrow-key movement; identity columns are last (`:578-582`).

**Target:** the same count on a real grid (arrow keys, Enter to edit, Esc to cancel), with view state in the URL and an undo toast. I 5–6, view state surviving a reload. **Blocks:** data grid semantics (P2-9); URL state (P2-6).

### J26 Build and publish an app page with an action

**Persona and start:** developer, dev workspace, App Builder list; the script exists.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | "Make an app" → name (the address is derived) → submit; lands in the builder on an empty page | Dialog → builder | `screens/Interfaces.tsx:2027-2089` |
| 2 | Scrolls past the canvas to "Add a widget" → Table; picks the table in the inspector | Palette below the canvas / aside | `screens/Interfaces.tsx:1399-1410`, `:1290` |
| 3 | "Add a widget" → Action; picks "What it starts"; maps each input to "Chosen in Table: id"; sets "Can be pressed" | Aside | `screens/ActionSettings.tsx:79-163` |
| 4 | Tries it in the preview: selects a row, presses the button (a real run in dev) | Canvas | `screens/Interfaces.tsx:159-175`, `:1384` |
| 5 | "Publish" (deploys at once), then "Open the app" | Header | `screens/Interfaces.tsx:1683-1706` |

**Counts:** I 14–18 · P 2 · D 1 · CS 0. `05-journeys.md` found this impossible: no widget could act.
**Works well:** autosave with "Saved. Not published yet."; the audience warning "X cannot start Y, so they will not see this action" (`screens/ActionSettings.tsx:158-163`); "See it as" a group.

**Friction:** the palette is below the canvas and new widgets append at the bottom; "Remove this widget" has no confirm and no undo, and is autosaved 700 ms later (`screens/Interfaces.tsx:1200-1204`, `:1434-1445`); Publish has no summary; nothing on the canvas says preview actions are real; below 1280 px the inspector drops under everything (`:1312`, `:1414`); the "Phone 390" preview keeps the desktop grid (Inferred).

**Target:** palette at the side, drop onto the canvas, undo, a publish summary. I 12–15, with no scrolling to the palette. **Blocks:** builder workspace (P2-10); confirm for widget removal (P0-9).

### J27 Share an app with a group

**Persona and start:** workspace admin who has just published in the builder.

| # | What the user does | Screen | Evidence |
| --- | --- | --- | --- |
| 1 | Leaves the builder for Build → Published apps (the builder has no Share) | Workbench | `screens/Apps.tsx:370` |
| 2 | Finds and selects the app's row; clicks "Share" in the inspector footer | Inspector → side sheet | `screens/Apps.tsx:389`, `:89` |
| 3 | Chooses "Share with" (one flat select of every group and two special audiences) and "They may"; clicks Share | Sheet | `screens/Apps.tsx:137-148`, `:229-246` |
| 4 | Optionally opens "What they can read" to verify | Sheet tab | `screens/Apps.tsx:291-338` |
| 5 | Closes the sheet; the list remounts and the selection is gone | Workbench | `screens/Apps.tsx:375-382` |

**Counts:** I 7–8 · P 1 · D 2 · CS 1 · repeated lookup 1.
**Works well:** sharing gives the app and its tables in one step and says so; "What they can read" shows the rows a group will see, per table.

**Friction:** "Stop sharing" has no confirm and removes that audience's access to every table the app reads (`screens/Apps.tsx:195-216`); sharing posts one request per target, so a failure midway leaves it half done (`:229-246`); no success line; the select has no search and is capped at the first 200 of each kind (`:106-110`).

**Target:** Share beside Publish in the builder; a grouped, searchable audience picker; "Support can now open Orders and read orders, customers". I 5 · CS 0. **Blocks:** builder publish and share (P2-10); confirm for "Stop sharing" (P0-9); success feedback (P2-8).

## 4. The continuity loop

The composite journey is: **failed production run → failed flow step → source at that version → edit in dev → test with the failed input → deploy → promote → new production execution.** It is the journey an agency runs every time a client's automation breaks, and it crosses every boundary the console has: list to detail, run to code, production to dev, editor to release, dev back to production.

**Scenario.** A production flow `orders/sync` failed at its step `charge`, which runs the script `billing/charge`. The developer on call has permission to promote. The dev workspace promotes to this production workspace. The developer starts on any production screen with the header visible.

### 4.1 As it is today

Every row is Verified at the reference given. "Carried by" says what holds the context between this step and the next: the interface (a link), or the user (memory, the clipboard, a second tab).

| # | Stage | What the user does | Lands on | Interactions (running total) | Carried by | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find the run | Clicks the header chip "N failed runs" | Production Runs, `?status=failed` | 1 (1) | Link | `Shell.tsx:878-885` |
| 2 | Find the run | Clicks the flow's path in its row | Flow run page | 1 (2) | Link | `screens/Runs.tsx:401-406` |
| 3 | Find the step | Reads "The flow failed. <message>", which names no step; finds the red bar in the timeline; clicks it | Same page, step panel below the tabs | 1 (3) | User (finds it by eye) | `screens/Flows.tsx:679-683`, `:716-719`, `:628` |
| 4 | Find the step | Reads the step's error and inline log; no input, no diagnosis | Same page | 0 (3) | — | `screens/Flows.tsx:778-811` |
| 5 | Find the step | Clicks "Open this step's run" for the diagnosis and the step's input | Script run page of the step | 1 (4) | Link (one way: no link back to the flow run) | `screens/Flows.tsx:807-809`; `screens/RunPage.tsx:140-151` |
| 6 | Keep the input | On the Input tab (open by default), hovers the JSON and clicks "Copy" | Same page | 1 (5) | User (clipboard) | `screens/RunPage.tsx:391-398`; `packages/ui/src/JsonView.tsx:63-74` |
| 7 | Source | Clicks the script path in the page title | Production script editor, read-only, **current** version | 1 (6) | Link without a version | `screens/RunPage.tsx:105-108`, `:188` |
| 8 | Source | Clicks "version N" to see what ran | Deployments list; nothing to open. Presses Back | (optional detour, not counted) | — | `screens/RunPage.tsx:113` |
| 9 | To dev | Reads the notice "Code is edited in a dev workspace"; it has no link. Opens the workspace switcher | Menu | 1 (7) | User (must know which dev workspace) | `screens/Authoring.tsx:681-685`; `Shell.tsx:750-762` |
| 10 | To dev | Picks the dev workspace | Dev **Scripts list**: the section is kept, the script is dropped | 1 (8) | User (remembers `billing/charge`) | `Shell.tsx:763-770` |
| 11 | To dev | Finds the script by eye in a list with no search; clicks its path | Dev script editor | 1 (9) | User (**re-find 1**) | `screens/Execution.tsx:131-149`, `:157` |
| 12 | Edit | Fixes the code | Same page | 0 (9) | — | `screens/Authoring.tsx:702-713` |
| 13 | Test | Clicks the "Try it" tab | Right panel | 1 (10) | — | `screens/Authoring.tsx:717-723` |
| 14 | Test | Switches the form from Fields to JSON | Right panel | 1 (11) | — | `packages/ui/src/SchemaForm.tsx:806-817` |
| 15 | Test | Pastes the failed input | Right panel | 1 (12) | User (clipboard) | `packages/ui/src/SchemaForm.tsx:830-848` |
| 16 | Test | Clicks "Save and run" | Same page; result below the fold | 1 (13) | — | `screens/Authoring.tsx:597`, `:390-403` |
| 17 | Test | Scrolls down; clicks "Input and output" to see the result | Test run panel | 1 (14) | — | `screens/Authoring.tsx:726-739`; `screens/Runs.tsx:592-610` |
| 18 | Deploy | Scrolls up; clicks the "Review and deploy" link | Dev Release, Review step | 1 (15) | Link | `screens/Authoring.tsx:666-670` |
| 19 | Deploy | Clicks "Deploy N changes" (every draft in the workspace goes) | Release, stepper now on "Deploy to dev"; a notice lists paths | 1 (16) | User (reads the new version number) | `screens/Release.tsx:351-374`, `:166-171` |
| 20 | Promote | Clicks the "Promote" step | Promote step (no URL) | 1 (17) | — | `screens/Release.tsx:155`, `:117-119` |
| 21 | Promote | Clicks "Promote to production" | Confirm dialog | 1 (18) | — | `screens/Release.tsx:585-610` |
| 22 | Promote | Confirms | Sentence "<production> now runs version N." with no link | 1 (19) | User | `screens/Release.tsx:589-594`, `:557-565` |
| 23 | Back to production | Opens the workspace switcher | Menu | 1 (20) | — | `Shell.tsx:750-762` |
| 24 | Back to production | Picks production | Production **Versions** page (the section is kept) | 1 (21) | User (remembers which run) | `Shell.tsx:763-770`; `screens/Release.tsx:117-119` |
| 25 | Find the run again | Clicks the header chip "N failed runs" | Production Runs, `?status=failed` | 1 (22) | Link | `Shell.tsx:878-885` |
| 26 | Find the run again | Finds the original run among the failures; clicks its path | Original flow run page | 1 (23) | User (**re-find 2**) | `screens/Runs.tsx:401-406` |
| 27 | New execution | Opens "Re-run ▾" | Menu | 1 (24) | — | `screens/RunPage.tsx:550-571` |
| 28 | New execution | Chooses "On the version deployed now". ("Retry from the failed step…" would run the old version again.) | Confirm: "Every step runs again, with the same input, on the version deployed now." | 1 (25) | User (must know the difference) | `screens/RunPage.tsx:565-568`, `:485-492`, `:494-504` |
| 29 | New execution | Confirms | New flow run page; no step selected | 1 (26) | Link | `screens/RunPage.tsx:464-467` |
| 30 | Verify | Clicks the `charge` step to see that it passed | Step panel | 1 (27) | User | `screens/Flows.tsx:716-719` |

**Totals today.**

| Measure | Count | Detail |
| --- | --- | --- |
| Interactions | **27** | 26 without the last check; +1 for a deploy message; +2 for the version detour in step 8. Each further test iteration adds 2 and 2 scrolls |
| Page loads | **11** | Production: runs list, flow run, step's run, read-only editor. Dev: scripts list, editor, release. Production: versions, runs list, original flow run, new flow run |
| Distinct pages | 8 | The runs list and the original run are each visited twice |
| Dialogs | 2 | Promote confirm, re-run confirm (plus three menus) |
| Workspace switches | **2** | Steps 9–10 and 23–24, both through the switcher, both landing on a list |
| Other context switches | 4 | Flow run → step's run (5); run → editor (7); editor → Release (18); Versions → Runs (25) |
| Re-finds of an object already open | **2** | The script (11) and the original run (26). The failed step is also found by eye twice (3, 30) |
| Backtracks | 2 | Runs list and original run revisited |
| Forced scrolls | 2 per test iteration | Steps 17–18 |
| Things the user must remember | 6 | The script path; which dev workspace; the failed input (clipboard); which run started this; the new version number; that "Retry from the failed step" would use the old version |
| Places the interface carries the context | 7 of 27 interactions | Steps 1, 2, 5, 7, 18, 25, 29 |

Two properties of this path are worse than the count suggests (Judgment). First, nothing at step 28 tells the user that the obvious choice, "Retry from the failed step…", will fail again on the old code; its confirm does say "On version N", but only someone who remembers the new version number will read that as a problem. Second, the correct choice reruns every step, including ones that already succeeded and may have charged a card or sent a message.

### 4.2 Target version

| # | What the user does | Lands on | Interactions (running total) | Needs |
| --- | --- | --- | --- | --- |
| 1 | Clicks the header chip "N failed runs" | Production Runs, failed | 1 (1) | exists |
| 2 | Clicks the run | Flow run page with the failed step selected (`?step=charge`); the banner names the step; one panel holds error, diagnosis, the step's input, output and log | 1 (2) | P1-2 |
| 3 | Clicks "Open source at v41" on the error (optional reading step) | Read-only source of `billing/charge` at v41, at the failing line | 1 (3) | P1-3, P1-4 |
| 4 | Clicks "Edit in <dev workspace>" | Dev editor for the same path; the failed input is loaded as the test input; a chip reads "Fixing run <id>" | 1 (4) | P1-3 |
| 5 | Fixes the code | Same page | 0 (4) | — |
| 6 | Presses ⌘↵ | Output docked beside the code, result first | 1 (5) | P1-4 |
| 7 | Clicks "Deploy this change" in the editor header | Toast "Deployed as v42 · Promote to <production>" | 1 (6) | P1-5 |
| 8 | Clicks "Promote" in the toast; confirms | Confirm, then "<production> now runs v42 · Retry run <id> from the failed step on v42" | 2 (8) | P1-5, P2-8 |
| 9 | Clicks "Retry … on v42"; confirms the retry plan | New production flow run, with the retried step selected | 2 (10) | P1-3, P1-2 |

**Target totals:** 10 interactions (9 without step 3) · 5 page loads (4 without step 3) · 2 dialogs · 2 workspace changes, both made by a link that keeps the object · 0 re-finds · 0 backtracks · 0 forced scrolls · nothing to remember. Each further test iteration adds 1.

Step 9 needs the retry endpoint to accept a newer version together with "from the failed step". The client's request type already allows a `bundle` field beside `from` (`screens/RunPage.tsx:464`), but the menu never sends both; whether the server honours the combination is Inferred and must be confirmed. Step 7 needs a way to deploy one draft; the deploy endpoint takes all drafts (`screens/Release.tsx:357-360`) (Inferred that a server change is needed). If either is refused, the target still holds with "Review all changes" at step 7 (+1) and "On the version deployed now" at step 9 (same count, weaker guarantee).

### 4.3 Missing links, in order of leverage

Leverage is the number of interactions, re-finds and remembered items a link removes from the table in 4.1, weighted by whether it also removes a wrong turn. The step numbers refer to 4.1.

| Rank | Missing link | Where it is missing today | Removes | Roadmap |
| --- | --- | --- | --- | --- |
| 1 | **Production → dev for the same object.** An "Edit in <dev workspace>" action on the production run page, the read-only script editor and the read-only flow notice | Notices with no link (`screens/Authoring.tsx:681-685`; `screens/Tenant.tsx:451-454`); production does not name its source workspace (`screens/Overview.tsx:439`; `screens/Release.tsx:477`) | Steps 9–11: 3 interactions → 1, re-find 1, two remembered items | P1-3 |
| 2 | **Promotion success → production, with the original run.** A link from the promote result to the production workspace and to "Retry run X on vN" | Inline sentence only (`screens/Release.tsx:557-565`) | Steps 23–27: 5 interactions → 1, re-find 2, two remembered items | P1-5, P1-3 |
| 3 | **The failed input travels.** The dev editor opens with the failed run's input as the test input; also "use the input of run X" in "Try it" | No input history or import (`screens/Authoring.tsx:255-256`, `:592-599`) | Steps 6, 14, 15: 3 interactions, the clipboard | P1-3, P1-4 |
| 4 | **Retry from the failed step on the new version.** | Retry is pinned to the run's version (`screens/RunPage.tsx:485-492`); the new version is offered only from the start (`:494-504`) | The wrong turn at step 28 and the re-execution of steps that succeeded | P1-3 |
| 5 | **Failed step selected, named and addressable; its input and diagnosis in the panel.** | Selection is component state and empty on open (`screens/Flows.tsx:628`, `:830`); banner has no step (`:679-683`); no step input (`:778-828`) | Steps 3, 5, 30: 3 interactions, 1 page, 1 context switch | P1-2 |
| 6 | **Deploy from the editor; deploy success → promote.** | Text link to another page (`screens/Authoring.tsx:666-670`); after deploy the stepper moves to the ledger (`screens/Release.tsx:170`) | Steps 18, 20: 2 interactions, 1 page | P1-5 |
| 7 | **Run and output beside the code.** | Run behind a tab (`screens/Authoring.tsx:721`); output after a fixed-height editor (`:708`, `:726`); tab resets per run (`:738`) | Steps 13, 17: 2 interactions, and 1 interaction plus 2 scrolls for every further iteration | P1-4 |
| 8 | **Source at the run's version.** | Path link carries no version (`screens/RunPage.tsx:188`); "version N" goes to a list (`:113`); the flow graph is the current definition (`screens/Flows.tsx:629`) | The detour at step 8 and the risk of reading code that is not what ran | P1-3, P1-2, P3-7 |
| 9 | **The workspace switcher keeps the object and the query.** | `navigate(…/<section>)` only (`Shell.tsx:766-769`); the palette's switch goes to the overview (`kit/CommandPalette.tsx:308`) | A fallback for every case links 1 and 2 do not cover | P2-6, P1-3 |
| 10 | **Step → its script; child run → its parent flow run.** | No script link on a step (`screens/Flows.tsx:748-828`); "A flow" as text (`screens/RunPage.tsx:140-151`) | The hop through the step's run at steps 5 and 7, and the Back that follows it in J11 | P1-10, P1-2 |
| 11 | **A held "fixing run X" context.** Something that remembers the run that started the loop: a chip in the editor, a context command in the palette | Nothing holds it; the palette has no context commands (`Shell.tsx:948-956`) | The last remembered item; makes links 2 and 3 possible without URL plumbing on every screen | P1-3, P3-2 |

Links 1–3 together remove 9 of the 27 interactions and both re-finds. Links 1–7 reach the target of 10.

## 5. Cross-journey patterns

### 5.1 Repeated object lookups

The same object is found again, in a list or a select, in 12 journeys.

| Where | What is looked up again | Journeys | Evidence |
| --- | --- | --- | --- |
| After a workspace switch | The script or flow just open | J13, loop | `Shell.tsx:766-769` |
| After promotion | The run that started the work | loop | `screens/Release.tsx:557-565` |
| Schedule sheet "What it starts" | The script or flow the user came from | J20 | `screens/ScheduleForm.tsx:144-160` |
| Flow step "Input" | The script's input shape, read on another screen | J8 | `screens/FlowEditor.tsx:1271-1277` |
| Flow run page after Back | The failed step | J11 | `screens/Flows.tsx:628` |
| "Give access" → Who | The member or service account just created | J21a, J21c | `screens/Members.tsx:370-390` |
| "Set variable" | The variable whose row the user is looking at | J18 | `screens/Execution.tsx:689-699` |
| Used-by names | Each script that uses a connection, on the Scripts list | J19 | `kit/references.tsx:19-30` |
| Published apps | The app just published in the builder | J27 | `screens/Apps.tsx:389` |
| Create workspace → Promotes to | The production workspace made a moment earlier | J21d, J21i | `screens/Tenant.tsx:326-338` |
| Single sign-on list | The provider being set up, after any navigation or reload | J21e | `screens/SingleSignOn.tsx:1171` |
| Service accounts list | The account just created | J21c | `screens/Tenant.tsx:837-842` |

The common cause is a create or a jump that does not carry the object forward: creates stay on the list (`ListScreen.tsx:261-265`; `kit/ListCollection.tsx:131-141`), and cross-area links go to a section, not an object. Fix: P1-3, P1-9, P1-10, P2-11.

### 5.2 Places the same data is entered twice

| Data | Entered | Entered again | Evidence |
| --- | --- | --- | --- |
| Failed run's input | By the trigger, in production | Pasted as JSON into "Try it" in dev | `screens/Authoring.tsx:592-599` |
| A script's input shape | In the script's `input` schema | As a free-text expression in each flow step that calls it | `screens/FlowEditor.tsx:1271-1277` |
| Secret name | When first set | Typed exactly to replace the value | `screens/Tenant.tsx:689-695` |
| Data-source host, database, user | When first connected | All retyped to change one of them (no prefill) | `screens/Data.tsx:1097` |
| Workspace name and slug | For production | For dev, in the same dialog opened again; the slug is never derived from the name | `screens/Tenant.tsx:306-340` |
| Instance address and worker token | Known to the page | Typed into the worker command by hand | `screens/Execution.tsx:1037`, `:1081-1088` |
| API key | Just created on the page | Typed into the agent settings snippet in place of a placeholder | `screens/AgentAccess.tsx:42` |
| Reason for access | — | Typed by an operator to enter a tenant they created a minute earlier | `screens/Tenant.tsx:98-136` |

`05-journeys.md` found one more, the input schema written in both TypeScript and JSON Schema; that one is fixed (`screens/Authoring.tsx:529-540`).

### 5.3 Required memorisation

Things the user must hold between screens because no screen holds them.

| What must be remembered | Between | Evidence |
| --- | --- | --- |
| The path of the script or flow | Production editor → dev list | `Shell.tsx:766-769` |
| Which dev workspace promotes to this production workspace | Production → switcher | `Shell.tsx:774-787` (shown in dev only); `screens/Overview.tsx:439` |
| Which run started the fix | Production run → dev → production | `screens/Release.tsx:557-565` |
| The new version number, and that a retry ignores it | Deploy notice → re-run menu | `screens/Release.tsx:362-364`; `screens/RunPage.tsx:489` |
| The script's input field names | Script editor → flow step | `screens/FlowEditor.tsx:1271-1277` |
| The exact permission string | Wherever a refusal was seen → member page | `screens/Access.tsx:125` |
| Role names and what they allow | Roles tab → "Give access" select | `screens/Members.tsx:483` |
| The tenant's slug | Inspector → type-to-confirm dialog | `screens/Environments.tsx:1151-1153` |
| That a new connection, schedule or script exists only as a draft | Sheet or editor → Releases | `screens/ConnectionWizard.tsx:464-466`; `screens/ScheduleForm.tsx:290` |
| That "Turn on" should wait for a passed test and a proved domain | Stepper → header button | `screens/SingleSignOn.tsx:1078-1091` |
| That recovery codes are under a page named "API keys" | SSO notice → Account | `screens/SingleSignOn.tsx:1103` |
| Which filter and which loaded page held a run or an audit entry | Any list → detail → back | `screens/Runs.tsx:142-145`; `screens/Audit.tsx:116-120` |

### 5.4 Dead-end success states

A dead-end success state confirms a write and offers no way to the result or the next step. Toasts cannot carry a link (`packages/ui/src/Toast.tsx:14-20`), and of the 40 console files that make API writes, 12 ever show a success toast.

| After | What the user sees | What is missing | Evidence |
| --- | --- | --- | --- |
| Deploy | Notice "Deployed as version N: paths." and the stepper on the ledger | Link to the object, "Run it", "Promote" | `screens/Release.tsx:158`, `:166-171`, `:362-364` |
| Promote | "<target> now runs version N." | Link to production, its runs, re-run of failed runs | `screens/Release.tsx:557-565` |
| Save a schedule | Toast naming "Changes" in text; the list without the schedule (Inferred) | Link to Review; the draft in the list | `screens/ScheduleForm.tsx:290` |
| Save a connection | "Saved", "Reached" at the bottom of the sheet | "Declared in a draft — deploy" | `screens/ConnectionWizard.tsx:457-516` |
| Save a script draft | The grey "Unsaved changes" badge disappears | "Saved at"; the draft in the Scripts list (Inferred) | `screens/Authoring.tsx:372-377`, `:630` |
| Create tenant, workspace, member, service account | The dialog closes and the list reloads | Landing on, or selection of, the new object | `ListScreen.tsx:261-265`; `kit/ListCollection.tsx:131-141` |
| Approve or reject | The row disappears | Confirmation, undo, "Open run" | `screens/Operate.tsx:652-653` |
| Pause or resume a trigger | The pill changes | Confirmation, undo | `screens/Operate.tsx:259`, `:289` |
| Share an app | The audience list grows; closing drops the selection | "X can now open Y and read …" | `screens/Apps.tsx:229-246`, `:375-382` |

Counter-examples to keep: Re-run and "Fire now" land on the new run (`screens/RunPage.tsx:166-169`; `screens/Operate.tsx:87-93`); adding a hostname opens its sheet (`screens/Domains.tsx:460-464`); connecting an identity provider lands on the provider.

### 5.5 Context lost on workspace switch

| What happens | Evidence |
| --- | --- |
| The header switcher keeps the section and drops the object path and the query string: from `scripts/edit/billing/charge` it lands on the Scripts list, from `runs?status=failed` on unfiltered Runs | `Shell.tsx:766-769` |
| The palette's "Switch workspace…" lands on the overview, unlike the header menu | `kit/CommandPalette.tsx:308` |
| The tenant switcher lands on the tenant overview | `Shell.tsx:809` |
| "promotes to X" in the header is text, shown only in the dev workspace and only from 1280 px | `Shell.tsx:774-787` |
| The release path at the foot of the section panel is text | `Shell.tsx:336-353` |
| Production names no source workspace | `screens/Overview.tsx:439`; `screens/Release.tsx:477` |
| "Decide" on a workspace overview leaves for the tenant-wide queue, unfiltered | `screens/Overview.tsx:256-262` |
| Unsaved editor changes are discarded by the switcher without asking | `screens/Authoring.tsx:630` (badge only; no guard anywhere) |
| What does work: a palette search finds the same path in other workspaces and opens it there | `kit/CommandPalette.tsx:126-133`, `:556-559` |

### 5.6 View state that is not in the URL

Only the Runs filters, the selected run and the selected trigger are in the URL (`screens/Runs.tsx:98-111`; `screens/Operate.tsx:80`). All query-string writes replace the history entry (`router.tsx:48`), so Back never closes an inspector and never undoes a filter. The state below is lost on reload, cannot be shared, and is what the journeys above lose most often. `01-current-product-ui-map.md` covers URL state screen by screen.

| State | Journeys it hurts | Evidence |
| --- | --- | --- |
| Selected step of a flow run; Timeline/Graph tab | J11, loop | `screens/Flows.tsx:628`, `:705` |
| Input/Output tab on the run page; Logs/Input and output/Details in the peek | J4, J17 | `screens/RunPage.tsx:388`; `screens/Runs.tsx:575` |
| Runs "Load more" pages and scroll position | J10, J15 | `screens/Runs.tsx:114`, `:142-145` |
| Release step (Promote) | J6, J24, loop | `screens/Release.tsx:117-119` |
| Flows and Scripts list filters, search and selection | J1, J7, J13 | `screens/Flows.tsx:76-78`; `screens/Execution.tsx:107-108` |
| Triggers type filter; Events filter and selection; Approvals Waiting/Decided and selection | J22, J23 | `screens/Operate.tsx:77`, `:424-429`, `:621`, `:629` |
| Flow editor: selected step, test panel open, viewport | J8, J9 | `screens/FlowEditor.tsx:392`, `:398`, `:1072` |
| Script editor: Settings/Try it tab, last test input | J3, J5 | `screens/Authoring.tsx:717-723`, `:255-256` |
| Table rows: sort, column filters, page, hidden columns; Rows/Definition | J25 | `screens/Data.tsx:91-99`, `:586` |
| Audit: area, since, kind, search, open entry | J21g | `screens/Audit.tsx:116-120` |
| SSO: provider and its six tabs | J21e | `screens/SingleSignOn.tsx:952`, `:1171` |
| Members search and selection; Access-grants filter; Apps selection and share tab | J21a, J21b, J27 | `screens/Members.tsx:121-122`, `:352`; `screens/Apps.tsx:131`, `:392` |

Fix: P2-6, with P1-2 for `?step=` and P2-11 for SSO and audit.

## 6. Baseline table for `10-validation-plan.md`

Baselines are the counts from sections 3 and 4, by the definition in section 1, on the shortest path at HEAD `e737382`. They come from code tracing; the validation plan should re-measure each on a seeded instance before using it as a comparison. Targets are proposals (Judgment) and assume the roadmap items named in each journey. "CS" counts all context switches, including workspace switches.

| ID | Journey | Baseline interactions | Baseline pages | Baseline CS | Target interactions | Target pages | Target CS | Also measure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| J1 | Create a script | 3 | 2 | 0 | 2 | 2 | 0 | Unsaved code survives navigation: no → yes |
| J2 | Configure inputs | 2 | 1 | 0 | 0–1 | 1 | 0 | Schema-reading state visible beside the form |
| J3 | Test the script | 2 + n | 1 | 0 | 1 + n | 1 | 0 | Forced scrolls 1 → 0; first run of a new script shows a result |
| J4 | Inspect output | 1 per run | 1 | 0 | 0 | 1 | 0 | Forced scrolls 2 → 0 |
| J5 | Debug an error | 2 per iteration | 1 | 0 | 1 per iteration | 1 | 0 | Forced scrolls 2 → 0; error → line in 1 |
| J6 | Save/deploy the script | 2–3 | 2 | 1 | 2 | 1 | 0 | Success state offers a next step |
| J7 | Create a workflow (3 scripts) | 15 | 2 | 0 | 8 | 2 | 0 | Drags required 3 → 0 |
| J8 | Configure steps (3 steps) | 6 + up to 3 lookups | 1–4 | up to 3 | n fields | 1 | 0 | Lookups 3 → 0 |
| J9 | Test part of the workflow | not possible | — | — | 2 | 1 | 0 | Step logs readable in the editor |
| J10 | Inspect a production run | 2 | 2 | 0 | 1–2 | 2 | 0 | Rows visible at 1440x900: about 10 → 18 or more; peek opens by keyboard |
| J11 | Diagnose a failed step | 5–6 | 3 | 1 | 2 | 2 | 0 | Backtracks 1 → 0; failed step is linkable |
| J12 | Failure → source | 1 (script), 2–3 (flow step) | 2–3 | 1 | 1 | 2 | 0 | Source shown is the run's version; line targeted |
| J13 | Make a correction | 4 | 3 | 1 | 2 (1 to reach the editor) | 2 | 1 (by link) | Re-finds 1 → 0 |
| J14 | Rerun or retry | 3 (4 from the list) | 2 | 0 | 3 (3 from the list) | 2 | 0 | Retry from the failed step can use a newer version |
| J15 | Find a historical execution | 4 + k; 3 by ID | 1–2 | 0 | 3–4; 3 by ID | 1–2 | 0 | "Load more" clicks k → 0 with target and date filters |
| J16 | Filter executions | 1 per filter | 1 | 0 | 1 per filter; 1 for a saved view | 1 | 0 | Filters available: 6 → 10 or more |
| J17 | Inspect logs | 1 | 1–2 | 0 | 1 | 1–2 | 0 | Lines shown for a 2,000-line finished run: 500 → 2,000 |
| J18 | Create a connection | 6 + n, then 2 | 2 | 1 | 7 + n | 1 | 0 | Pending-draft state visible in the list |
| J19 | Where a resource is used | 1–2, +3 per user | 1 + 1 per user | 1 per user | 1–2, +1 per user | 1 + 1 per user | 0 | Full list reachable by keyboard |
| J20 | Schedule a script | 9 + n | 2–3 | 2 | 4 | 1 | 0 | Target re-picked 1 → 0 |
| J21a | Member with a role | 10–12 | 2 | 1 | 6 | 1 | 0 | Lookups 1 → 0; success message shown |
| J21b | Why can a member do X | 5–6 | 2–3 | 0 | 4 | 2 | 0 | No exact permission string needed |
| J21c | Service account + key | 19–22 | 3 | 2 | 13 | 2 | 0 | Key copied with one click |
| J21d | Dev workspace linked to production | 12 | 2 | 0 | 5 | 2 | 0 | Dialogs 2 → 1 |
| J21e | Set up SSO | about 34 | 3 + 2 external | 3 | about 26 | 2 + 2 external | 2 | A reload mid-setup returns to the same tab |
| J21f | Register a worker | 7–10 + manual command | 1 + terminal | 1 | 5 | 1 + terminal | 1 | Command copied complete; connection confirmed on screen |
| J21g | Who changed X | 5 + k, unbounded | 1 | 0 | 4 | 1 | 0 | Search covers all retained entries; entry linkable |
| J21h | Operator access | 6–8 | 2 | 0 | 6 | 2 | 0 | Gate names the tenant |
| J21i | Fresh instance → first run | about 31 | 5 | 3 | at most 15 | 3 | 1 | Dialogs 4 → 2 |
| J22 | Decide an approval | 3 | 1 | 0–1 | 1 | 1 | 0 | Undo offered; link to the resumed run |
| J23 | Pause a trigger | 4–5 | 1 | 0 | 2–3 | 1 | 0 | Confirmation shown |
| J24 | Promote dev → prod | 4 | 1 | 0 | 2–3 | 1 | 0 | Promote step reloads in place; success links to production |
| J25 | Browse and edit a table row | 6 | 2 | 0 | 5–6 | 2 | 0 | Filter and sort survive a reload |
| J26 | Build and publish an app page | 14–18 | 2 | 0 | 12–15 | 2 | 0 | Scrolls to the palette 2 → 0; removal can be undone |
| J27 | Share an app with a group | 7–8 | 1 | 1 | 5 | 1 | 0 | Selection kept after closing the sheet |
| Loop | Failed production run → new production execution | 27 | 11 loads (8 distinct) | 6 (2 workspace) | 10 | 5 loads | 2 (both by link) | Re-finds 2 → 0; remembered items 6 → 0; per test iteration 2 → 1 |

The loop row is the headline measure for the roadmap's P1-3. A release that moves it from 27 towards 10 has improved the product's central workflow whatever happens to the screen scores in `03-screen-by-screen-audit.md`.
