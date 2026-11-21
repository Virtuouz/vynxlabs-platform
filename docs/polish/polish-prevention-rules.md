# Polish prevention rules

Status: draft for the owner's review. Written 2026-11-20 against `phase-21-docs-redesign` at `f54d4bc`.

Each rule comes from corrections that the history shows were made after a milestone was called built. The evidence IDs (`H0-…`, `H12-…`, `H18-…`) are rows of the evidence table in [historical-polish-analysis.md](historical-polish-analysis.md), and each row cites its commits and phase-doc lines. A rule takes this form: what the history shows, then the failure it generalises to, how to find it, what complete looks like, and how to check it.

**Enforced** says how much of the rule a machine already checks.
- **Yes:** a test fails when the rule is broken.
- **Partly:** a test covers some surfaces or some forms.
- **No:** only a person or an agent looking at the screen will notice.

Rules are ordered by how often the history broke them.

---

## POLISH-001: Every state the screen can be in is drawn, and drawn truthfully

**History:** 18 corrective rows. These are some of them.
- **"Never" shown when not true:** "Last fired: Never" for a trigger that had run by hand (H0-34).
- **"Not working" for a hostname that was serving:** H0-33.
- **A failed run's attempt read "succeeded":** H12-34.
- **An empty repository was told "branch not found":** H12-45.
- **The empty state still pointed to the CLI only** after console authoring arrived (H0-49).
- **A crash on an answer without `tasks`:** H12-03.
- **A workspace checklist that could never show,** because a new dev workspace always has one item needing attention (H12-20).
- **A connection test with nowhere to show its result:** H0-63.
- **A dashboard that never said how old its numbers were:** H18-14.
- **A clone that slowed the instance** while its dialog said nothing (H0-76).
- **Plain 500s under load:** H0-73.

**Failure mode:** the happy path's state is drawn. Every other state is either missing, inferred from the wrong signal (verification instead of serving; error log lines instead of the run's state), or worded for a world that has since changed.

**Detect:** for each screen, list the states its data can be in:
- loading
- empty, on a first visit and after filtering
- partial
- stale
- waiting on someone else
- failed, and failed in a way that can be retried
- forbidden
- live

Then find where each is drawn. Search for:
- `?? "Never"`, `"Not … yet"`, `.data?.` with no empty branch, and status words derived on the client;
- any action that starts work (`run`, `test`, `deploy`, `clone`, `refresh`) with no result surface after it returns.

**Expected:** every state has its own words, says what to do next, and takes its truth from the server's own state. An action's result stays visible until something changes it.

**Verify:** look at the screen in each state with real data. Use Fernhill, with its failed runs, outage, waiting approvals and unverified host. Make the empty, slow (throttle the network) and error (stop the worker) states happen.

**Enforced:** partly. `enforce.test.ts` refuses a bare "Loading…" paragraph and a Badge that says a state. Nothing checks for a missing empty, stale or error state.

## POLISH-002: Equivalent things are one thing

**History:** 15 rows.
- Three run-state label maps, where "Waiting" meant two things (H0-53).
- End-user group names had to be slugs while member group names did not (H0-40).
- MCP ignored the approvers that the console checked (H0-38).
- The console offered only `uuid` owner columns where the API allowed `text` (H0-21).
- Two column menus (H18-05).
- End users and their groups were two nav entries, while Members had tabs (H18-04).
- Drafts were listed for scripts but not for triggers (H12-63, H18-06).
- "Last used" was told to the second on one list and as "ago" on the others (H12-44).
- Undo in the flow editor and app builder, but only partial undo in dashboards (H18-22).
- Help in interface apps but not in code apps (H18-30).
- Console previews drew a page differently from the served site (H18-35).
- The palette ran "Run again" with ⌘↵ without asking, unlike the button (H12-35).

**Failure mode:** a new screen re-implements something that exists elsewhere, from scratch or by copying, and the copies drift apart. Each copy is reviewed alone, so nothing compares them.

**Detect:** when a feature adds a list, editor, builder, preview, label map, validator or permission check, name its nearest siblings and compare them on:
- actions offered
- keyboard
- undo
- how time and state are written
- empty state
- mobile form
- validation rules

Grep for a second map of the same words (status, trigger type, kind), a second menu component for the same job, and a route that checks a permission another route checks differently.

**Expected:** one primitive or one map, used by every sibling. A difference between siblings is a decision written down in the phase doc.

**Verify:** a side-by-side walk of the siblings in the same browser session. A static test refuses the second copy where that is possible, as `enforce.test.ts` does for lists, h1s and panels.

**Enforced:** partly. The kit-level rules in `enforce.test.ts` cover lists, headers, panels, motion, format and tables. Nothing compares behaviour across surfaces such as the console, MCP, served apps and the docs site.

## POLISH-003: Whatever is listed can be created, opened, changed, renamed, undone and removed from where it is listed

**History:** 14 rows.
- The console could make and delete groups, but not add a member (H0-20).
- There was no "New" on Triggers (H0-58).
- No emergency stop and no bulk cancel (H0-74).
- Renaming a branch case left its edge dangling (H12-32).
- Clearing a title brought the old one back (H12-47).
- Rename existed only in the resources list (H12-48).
- Draft triggers were not on the Triggers list (H18-06).
- Dashboard undo covered only layout (H18-22).
- Moving a docs page meant typing a path (H18-27).
- Frontmatter could be edited only as YAML (H18-28).
- An outside change wiped Monaco's undo history (H18-32).
- Undo closed the step being edited (H0-69).
- No control to allow a deletion the server refused (H12-55).

**Failure mode:** the milestone is written as "X can be made", and the object's later life is left out: editing, renaming, moving, undoing, clearing, and deleting from the place where people see it. That includes the API's operations that the console never surfaced.

**Detect:** for every kind of object a screen lists, fill in this matrix: create, open, edit, rename or title, move, duplicate, delete, undo and redo, clear a field, and bulk act. Mark each cell built, deliberately left out (with a reason), or missing. Compare it with the routes the control plane exposes for that kind (`apps/control-plane/src/routes/*.ts`). If the API can do something the console cannot, that is a candidate gap.

**Expected:** every operation the API offers to the person who can see the list is reachable from the list or the object's page. Every editor built by hand has undo and redo of everything it changes, through one history.

**Verify:** use the matrix above as a checklist in the phase doc, and walk each cell once in a browser.

**Enforced:** no.

## POLISH-004: Layout holds at the sizes the owner uses, with real content

**History:** 14 rows.
- The "Who" menu of a row rule was cut short (H0-23).
- The graph was clipped at 1440 px (H0-48).
- Logs wrapped at about 20 characters in a 22rem inspector (H0-54).
- Runs rows were 37 px tall, so 16 fit instead of 20 (H12-07).
- A new header, then new toolbar controls, cost the runs list a row (H12-16, H12-28).
- A run page could not scroll on short windows from phase 8 to phase 15 (H12-33).
- Two scroll bars on the runs list (H18-02).
- A 30rem dialog around a 60vh table (H18-13).
- A second scroll bar on the whole document, and in a widget (H18-19).
- The docs home page was squeezed into the sidebar's track (H18-31).
- The page was not centred (H18-33).
- A text area of fixed height for JSON (H18-03).

**Failure mode:**
- Containers are sized for the sample the developer had: a short name, three rows, no error.
- A second component makes itself scrollable inside the first.
- Adding a control to a shared header or toolbar costs another screen its target.

**Detect:**
- Grep for nested `overflow-auto`/`overflow-y-auto` inside a `fill` or workbench, fixed `w-[..rem]` or `h-[..vh]` around tables or logs, and grid templates whose tracks are drawn only on some pages.
- Look at the screen at 1440×900 and 1440×640 with the longest real values (Fernhill's ledger paths, long errors).

**Expected:**
- One scroller for each region.
- A dialog that holds a table is the `table` size.
- Text that grows has room to grow.
- The workbench targets hold: 20 runs at 1440×900, and the first row within 160 px.

**Verify:** `e2e/polish-*.spec.ts`, `wide.spec.ts` and `panes.spec.ts` measure some of this. Run them, and add the new screen to their lists.

**Enforced:** partly. The measures cover the workbenches that are listed. A new screen is not measured until someone adds it.

## POLISH-005: Phone and tablet widths are designed, not inherited

**History:** 13 rows.
- The run page had no gutter at 390 px (H0-55).
- The timeline's axis labels overlap at 390 px. This was never fixed (H0-56).
- The palette hint crowded the name (H0-62).
- Health and Reconnect sat off the table's edge (H0-65).
- An approval comment was placed in a column hidden on phones (H0-68).
- The run output table overflowed (H0-70).
- At tablet width every crumb was truncated (H12-18).
- The served app fell back to one column (H12-19).
- The header said "S…" (H12-37).
- An account key's "Last used" was 4 px too wide (H12-44).
- On a phone, tapping a rail area closed the drawer (H18-17).
- The docs navigation covered the page on a phone (H18-23).

The owner's standing rule says the same thing: a redesign is responsive even when the mock-up is desktop-only, as said on 2026-11-13. It is held in the agent's memory, not in the repository.

**Failure mode:** the mock-up and the developer's window are desktop. Narrow widths get whatever the flexbox does, and information put in a column that phones hide disappears.

**Detect:** look at every new or changed screen at 390, 768 and 1280 px. Grep for `hidden sm:`/`md:table-cell` columns that carry information found nowhere else, and for interaction handlers that close a drawer on any click.

**Expected:**
- Nothing is cut off or drawn over its neighbour.
- Nothing the user needs is only in a hidden column.
- Each region has a phone form: drawer navigation, the inspector as a sheet, tables that drop columns by priority.

**Verify:** `polish-measures.spec.ts` and `polish-layout.spec.ts` check for overdraw at 390, 768, 1280 and 1440 px over the workbenches it lists. Add the new screens to it. Look at the screens by eye in light and dark.

**Enforced:** partly, for the console's listed workbenches. Served apps and the docs site are checked only by their own specs and pictures.

## POLISH-006: A way in never loses the way back, or what was chosen

**History:** 12 rows.
- "Open the copy" left the clone dialog open over the new workspace (H0-05).
- The failed-runs chip opened an unfiltered list (H0-44).
- A slug in the address gave a raw error (H0-45).
- Run details had no links onward (H0-50).
- A link in a row also fired the row (H0-51).
- The error boundary remounted the page on every address change (H12-01).
- The flow editor remounted on its first save (H12-05).
- Inside a dashboard the breadcrumb could not go back (H18-16).
- A rail area jumped to its first screen (H18-17).
- The first fix to the workspace crumb left too small a target (H18-18).
- `/me/recent` was written and never read (H0-46).

**Failure mode:** a screen is built as a destination and not as a step in a journey. Filters, the chosen object and position live in component state instead of the address, and new screens do not tell the shell what they are.

**Detect:**
- Every chip, count or "Open …" link should carry its filter in the address (`useQueryValue`).
- Every object page and editor should call `useTitleObject`/`kit/title.ts` so the breadcrumb can name it.
- Look for `key=` values that change on save or navigation, and for dialogs whose state is owned by a parent that outlives the route.
- Every count on an overview should be a link to exactly those things.

**Expected:**
- Reloading or sharing the address shows the same thing.
- The breadcrumb leads back from any depth.
- Each count opens what it counts.
- Saving does not remount.

**Verify:** for each new screen, reload, press Back, copy the link into a new tab, and open it from each place that links to it.

**Enforced:** no.

## POLISH-007: Keyboard, focus and the accessibility tree work on the real page

**History:** 13 rows.
- The logo's name was read twice (H0-43).
- A dialog opened behind a sheet (H0-66).
- Each toast's text appeared twice in the page (H12-02).
- Enter on the open run left focus on the row (H12-04).
- Two regions were named "Log" (H12-12).
- A link was marked by colour only (H12-14).
- A scroll body could not be reached by keyboard (H12-15).
- A page had no h1 to land on (H12-17).
- Required marks changed accessible names (H12-22).
- `//` in Monaco jumped to search (H12-24).
- Monaco swallowed ⌘K (H12-25).
- Esc did nothing while a menu faded out (H18-21).
- A column's ⓘ swallowed F1 and ⌘K (H18-24).

**Failure mode:**
- Keys are handled locally (`stopPropagation`, an editor's own chords) without regard for the app's global shortcuts.
- New motion or layering interacts with focus and Escape in ways that a unit test in happy-dom cannot see.

**Detect:**
- Grep for `onKeyDown` with `stopPropagation()` (should stop only the key it handles), `aria-label` duplicates, `z-` values outside the kit's scale, and `role="dialog"` outside the kit.
- On every new screen, try F1, ⌘K, `/`, Esc and Tab order while the screen has focus, including inside an editor.

**Expected:**
- Global shortcuts work everywhere except where text is being typed.
- Focus lands somewhere named on open and returns on close.
- Each landmark has a unique name.
- axe finds nothing serious.

**Verify:** `e2e/keyboard.spec.ts`, axe in `redesign.spec.ts`/`tenant-apps.spec.ts`, and a walk with the keyboard only.

**Enforced:** partly. axe runs on pictured screens. Shortcuts are tested on some screens.

## POLISH-008: What opens, closes or moves is seen to move, on every surface

**History:** 6 rows, and it recurred twice after being "fixed".
- The docked inspector appeared at once (H12-60/H18-01).
- About 15 more sheets and dialogs appeared and vanished in one frame (H18-09).
- The narrow-screen sheet still had no closing slide after the phase 18 fix (H18-10).
- Moves by arrow were redrawn in one frame (H18-11).
- The served docs site had no motion for folds, folders, switcher, search, phone navigation, tabs or terms, and its switcher did not close on Escape or a click away (H18-34).

**Failure mode:** conditional rendering (`{open && <Sheet open />}`) and hand-built panels, which give the browser nothing to animate. The guard written in phase 19 covers `apps/console` only, so a new surface (the served site, a tenant app) starts without it.

**Detect:**
- In the console, `enforce.test.ts`'s rules.
- Elsewhere (`apps/control-plane/src/kernel/apps/*.ts`, `packages/markup/src/enhance.ts`, `packages/app`, `packages/screens`), grep for `hidden` toggles, `display:none` switches, `remove()` on close, and elements toggled without a transition class.

**Expected:** everything that opens, closes, expands, collapses, reorders or is dismissed has an entry and exit over a motion token, and none under reduced motion. Each popover closes on Esc and on a click outside it.

**Verify:** the `e2e/test.ts` fixture fails a drawer without motion in any spec that opens one. Extend its reach to the served site's specs.

**Enforced:** yes for the console (static rule plus browser fixture). No for the served docs site, tenant apps and `packages/app`.

## POLISH-009: Words say what is true, in the reader's terms, and name what is missing

**History:** 11 rows.
- "by by hand" (H0-02).
- The export passphrase implied the whole file was protected (H0-08).
- Raw audit codes (H0-31).
- A figure repeated its title (H0-35).
- "No access in this workspace" without naming `workspace:read` (H0-37).
- "Defined at line 679" opened at line 1 (H0-47).
- "Yes" for a permission held only in dev (H0-67).
- Renaming back was called breaking (H12-40).
- The tenant plan's warnings were never built (H12-41).
- "Cannot be changed later" stayed after renames existed (H12-46).
- Approvals were four identical rows (H0-32).

**Failure mode:**
- Copy is written once with the first version of a capability and never revisited.
- Machine identifiers are shown as they are.
- A refusal does not say which permission or step would allow it.

**Detect:**
- Grep the console for copy that makes promises about the future ("cannot", "never", "always", "only from the CLI").
- Grep for raw codes rendered as text (`code}`, `.type}` in JSX without a words map).
- Look for refusals (`403`, `forbidden`, "no access") that do not name the missing permission.
- When a phase changes a capability, grep for the old capability's words.

**Expected:** every refusal names what is missing and who can grant it. Every list row can be told apart from its neighbours. No sentence is made false by a later phase.

**Verify:** a reading pass over every string touched by the phase, plus a grep for the capability's old words.

**Enforced:** no.

## POLISH-010: The model is explained where it acts

**History:** 7 rows.
- Platform steps were listed like the tenant's own (H0-29).
- "No access" without the reason (H0-37).
- SQL was offered to people who could not write it (H18-08).
- Deploying a draft of a code-defined resource silently took it over (H12-49).
- Deploy-all swept in stale drafts (H12-50).
- The example invited takeovers (H12-51).
- New dev workspaces ran their schedules beside production without saying so (H0-75).

All of these were found by the owner or by dogfooding, not by tests.

**Failure mode:**
- Rules that matter (ownership, drafts versus deployed, permission scope, what a deploy will touch) are enforced on the server and documented in guides, but the screen where the person acts does not say them.
- Controls are offered that the server will refuse.

**Detect:**
- For every action that changes more than the person can see (deploy, promote, take over, delete, publish, turn on feedback), check that the screen says what will happen before it happens.
- For every control, check that the console knows whether the person may use it (`maySql`-style flags) rather than finding out from a refusal.

**Expected:**
- A control is shown only to someone who can use it, or is disabled with the reason.
- An action with side effects lists them before confirming. Phase 21's "turning on feedback says first what it makes" is the model.

**Verify:** walk the action as a member with the least role that can see the screen, and as one that can act.

**Enforced:** no.

## POLISH-011: Forms drawn from a schema choose the right control, in the shared rule

**History:** 8 rows, with one regression.
- An enum without `type` was dropped (H0-25).
- Short fields were drawn as multi-line boxes because of a large `maxLength` (H0-26). The fix was made at one call site, and phase 10's wizard brought the problem back (H0-64).
- JSON text areas where fields were wanted (H0-57).
- A form that started as JSON stayed empty (H0-60).
- Untitled settings and an empty box for an option with no fields (H0-65).
- A row form drew JSON on one line (H18-03).
- A trigger's form had no description field, and its settings dropped the description (H18-29).

**Failure mode:** each schema quirk is fixed where it was seen, not in `SchemaForm`'s mapping, so the next form drawn from a schema meets it again.

**Detect:** for every new schema rendered by `SchemaForm` or a hand-built form, check:
- each enum (with and without `type`);
- strings with a large `maxLength`;
- `oneOf` options with no fields;
- missing titles;
- JSON columns;
- fields added to the schema after the form was written.

**Expected:** the mapping rule lives in one place (`packages/ui` `SchemaForm`), with a unit test for each quirk. Call-site overrides are refused.

**Verify:** a SchemaForm unit test for each quirk, and render every connector's schema once in a test.

**Enforced:** partly. SchemaForm has tests, but no test renders every connector's schema.

## POLISH-012: Latency, persistence and real input are part of the design

**History:** 8 rows.
- The runs list reloaded hundreds of times a second (H0-42).
- One write under `/me` invalidated every read (H0-61).
- A preference was lost to a reload inside the debounce (H12-26).
- A setting deleted on the server stayed in the browser (H12-29).
- The code editor lost typed letters on a slow redraw (H18-07).
- A dragged widget snapped back while saving (H18-20).
- The log stopped following before its last lines (H12-08).
- A scroll to a row in a virtualised log missed (H12-10).

**Failure mode:** the local machine answers in a millisecond and happy-dom draws nothing, so races between what is typed, what is saved and what is drawn appear only on a real instance over a real network.

**Detect:**
- Look for anything controlled whose value is echoed back from a save.
- Look for `Date.now()` in render or query keys.
- Look for debounced writes without `keepalive` on `pagehide`.
- Look for awaits before redrawing after a drag or drop.
- Look for broad cache invalidations.

**Expected:** what is done shows at once, saves are queued in order, a failure puts back the server's state and says so, and nothing the person typed is lost.

**Verify:** e2e with the save delayed (as `dashboards.spec.ts` does after 8748202). Look in a browser with network throttling.

**Enforced:** partly, for dashboards.

## POLISH-013: A fix goes in the shared piece, and a change to a shared piece is checked everywhere it is used

**History:** 9 rows.
- The `maxLength` fix at a call site came back (H0-26 → H0-64).
- The phase 18 drawer fix covered the docked form and left the sheet (H18-10).
- The phase 19 motion guard did not reach the served site (H18-34).
- The error boundary of M1 undid M2's editor fix (H12-01).
- The shared header (H12-16), new toolbar controls (H12-28) and the breadcrumb (H12-18) each cost another screen its target.
- The first rework of the workspace crumb made it worse (H18-18).
- A promotion with no body began to fail with 400 (H12-39).

**Failure mode:**
- A fix is made where the symptom was seen.
- A change to a kit component is checked on the screen that motivated it, not on the others that use it.

**Detect:**
- When fixing, name the shared piece the defect comes from. If it lives in a screen, ask why the shared piece allowed it.
- When changing `packages/ui`, `kit/layout.tsx`, `Shell.tsx`, `PageHeader`, `DataTable` or `SchemaForm`, list their call sites (`grep -rn`) and look at the ones with the most different content.

**Expected:** the fix is in the shared piece with a guard (an enforce rule, a test of the piece), and the full browser suite has run before the milestone is called built.

**Verify:** run the full `pnpm e2e` (not one spec), and look at the picture diffs.

**Enforced:** partly. The full suite exists, but phase docs record milestones whose suite or browser walk was not run (phase-20 M8 and M9 at `docs/phases/phase-20-documentation.md:413,452`; phase 21 at `docs/phases/phase-21-docs-redesign.md:59`).

## POLISH-014: Seen in a browser, on an instance, with realistic data, before it is called built

**History:** this is a meta-rule. About 60 of the 128 corrective rows were found only in a real browser, on a real instance or by dogfooding an example, and the rest of these rules describe what was found.
- 30 such rows in phases 0–11 (history-0-11 "how found").
- 16 in phases 12–17.
- 9 in phases 18–21, plus 17 more that the owner reported after looking at the test instance.
- Phase 20 milestones 8 and 9 were "not seen in a browser", and two defects showed within an hour of the first browser run (H18-23, H18-24).
- Phase 21's walk-through "was not run" (`phase-21-docs-redesign.md:59`), and the owner's first look then asked for five changes (H18-33 to H18-36).

**Failure mode:** "built" is declared on unit tests and a build. The walk-through happens afterwards, or is done by the owner.

**Detect:** in the phase doc, a milestone marked "Built" without a "seen in a browser" line, or a findings list that says the walk was not run.

**Expected:** each milestone that changes a screen is looked at in a browser, against the seeded example (Fernhill), at 1440 and 390 px, in light and dark, before its commit. The walk's findings are written into the milestone.

**Verify:** the gate in [milestone-polish-quality-gate.md](milestone-polish-quality-gate.md).

**Enforced:** no.

## POLISH-015: What the owner asked for is built as asked, or the difference is said at once

**History:** 5 rows.
- The owner asked for draft preview at the app's own address, and M9 left it in the console (H18-25).
- Dragging a page, a frontmatter form and "Compare with deployed" were each left as "Not built" and then asked for again (H18-26, H18-27, H18-28).
- Dashboard layout by order and width was a deliberate choice (`phase-18-data-insight.md:379`). The owner reversed it the next day in favour of the app builder's drag (H18-12).

**Failure mode:**
- Scope is trimmed during building, and the trim is recorded at the bottom of the milestone instead of being raised.
- A decision that makes one builder differ from another is taken without asking.

**Detect:** search the phase doc for "Not built", "left out" and "deferred" against the owner's decisions table and the exit criterion.

**Expected:** a trim of anything in the owner's decisions table or exit criterion is asked about before the phase is presented. A choice that makes one surface differ from its siblings (POLISH-002) is an owner decision.

**Verify:** compare the "Not built" list with the owner's decisions before the walk-through.

**Enforced:** no.

---

## The checklist

For a milestone review, answer each with a file:line, a screenshot, or "not applicable because …".

| Rule | Question |
|---|---|
| POLISH-001 | Which states can each new screen be in, and where is each drawn? Is each true to the server? |
| POLISH-002 | What are this feature's siblings? Do they share the primitive, the words and the keys? |
| POLISH-003 | Is the object's lifecycle matrix filled in? Can the console do everything the API can? Is undo complete? |
| POLISH-004 | Is there one scroller per region? Does it hold at 1440×900 and 1440×640 with the longest real values? |
| POLISH-005 | Is it designed at 390 and 768 px? Is nothing found only in a hidden column? |
| POLISH-006 | Does it survive reload, Back and a shared link? Does every count lead to what it counts? |
| POLISH-007 | Do F1, ⌘K, `/`, Esc and Tab work? Does focus land and return? Is axe clean? |
| POLISH-008 | Does everything that opens, closes or moves have motion on every surface, including the served apps? |
| POLISH-009 | Does any sentence stop being true because of this phase? Does every refusal name what is missing? |
| POLISH-010 | Does every action with side effects say them first? Is every control usable by whoever can see it? |
| POLISH-011 | Is each schema quirk handled in `SchemaForm`, with a test? |
| POLISH-012 | Does it behave with a slow save, a reload mid-save and a failed save? |
| POLISH-013 | Was the fix made in the shared piece? Have the call sites of a changed kit piece been looked at? Did the full e2e suite run? |
| POLISH-014 | Was the screen seen in a browser on Fernhill before the commit? |
| POLISH-015 | Is everything trimmed from the owner's asks raised before the walk-through? |
