# Polish prevention rules

Each rule comes from corrections that were made after a change to the interface had been called built. A rule says the failure it guards against, how to find it, what complete looks like, and how to check it. The [polish gate](milestone-polish-quality-gate.md) is how they are applied to a change.

**Enforced** says how much of the rule a machine already checks.
- **Yes:** a test fails when the rule is broken.
- **Partly:** a test covers some surfaces or some forms.
- **No:** only a person or an agent looking at the screen will notice.

Rules are ordered by how often they were broken.

---

## POLISH-001: Every state the screen can be in is drawn, and drawn truthfully

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

**Expected:** one primitive or one map, used by every sibling. A difference between siblings is a decision written down in the pull request.

**Verify:** a side-by-side walk of the siblings in the same browser session. A static test refuses the second copy where that is possible, as `enforce.test.ts` does for lists, h1s and panels.

**Enforced:** partly. The kit-level rules in `enforce.test.ts` cover lists, headers, panels, motion, format and tables. Nothing compares behaviour across surfaces such as the console, MCP, served apps and the docs site.

## POLISH-003: Whatever is listed can be created, opened, changed, renamed, undone and removed from where it is listed

**Failure mode:** the milestone is written as "X can be made", and the object's later life is left out: editing, renaming, moving, undoing, clearing, and deleting from the place where people see it. That includes the API's operations that the console never surfaced.

**Detect:** for every kind of object a screen lists, fill in this matrix: create, open, edit, rename or title, move, duplicate, delete, undo and redo, clear a field, and bulk act. Mark each cell built, deliberately left out (with a reason), or missing. Compare it with the routes the control plane exposes for that kind (`apps/control-plane/src/routes/*.ts`). If the API can do something the console cannot, that is a candidate gap.

**Expected:** every operation the API offers to the person who can see the list is reachable from the list or the object's page. Every editor built by hand has undo and redo of everything it changes, through one history.

**Verify:** use the matrix above as a checklist in the pull request, and walk each cell once in a browser.

**Enforced:** no.

## POLISH-004: Layout holds at the sizes the owner uses, with real content

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

**Failure mode:** the mock-up and the developer's window are desktop. Narrow widths get whatever the flexbox does, and information put in a column that phones hide disappears.

**Detect:** look at every new or changed screen at 390, 768 and 1280 px. Grep for `hidden sm:`/`md:table-cell` columns that carry information found nowhere else, and for interaction handlers that close a drawer on any click.

**Expected:**
- Nothing is cut off or drawn over its neighbour.
- Nothing the user needs is only in a hidden column.
- Each region has a phone form: drawer navigation, the inspector as a sheet, tables that drop columns by priority.

**Verify:** `polish-measures.spec.ts` and `polish-layout.spec.ts` check for overdraw at 390, 768, 1280 and 1440 px over the workbenches it lists. Add the new screens to it. Look at the screens by eye in light and dark.

**Enforced:** partly, for the console's listed workbenches. Served apps and the docs site are checked only by their own specs and pictures.

## POLISH-006: A way in never loses the way back, or what was chosen

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

**Failure mode:** conditional rendering (`{open && <Sheet open />}`) and hand-built panels, which give the browser nothing to animate. The motion guard covers `apps/console` only, so a new surface (the served site, a tenant app) starts without it.

**Detect:**
- In the console, `enforce.test.ts`'s rules.
- Elsewhere (`apps/control-plane/src/kernel/apps/*.ts`, `packages/markup/src/enhance.ts`, `packages/app`, `packages/screens`), grep for `hidden` toggles, `display:none` switches, `remove()` on close, and elements toggled without a transition class.

**Expected:** everything that opens, closes, expands, collapses, reorders or is dismissed has an entry and exit over a motion token, and none under reduced motion. Each popover closes on Esc and on a click outside it.

**Verify:** the `e2e/test.ts` fixture fails a drawer without motion in any spec that opens one. Extend its reach to the served site's specs.

**Enforced:** yes for the console (static rule plus browser fixture). No for the served docs site, tenant apps and `packages/app`.

## POLISH-009: Words say what is true, in the reader's terms, and name what is missing

**Failure mode:**
- Copy is written once with the first version of a capability and never revisited.
- Machine identifiers are shown as they are.
- A refusal does not say which permission or step would allow it.

**Detect:**
- Grep the console for copy that makes promises about the future ("cannot", "never", "always", "only from the CLI").
- Grep for raw codes rendered as text (`code}`, `.type}` in JSX without a words map).
- Look for refusals (`403`, `forbidden`, "no access") that do not name the missing permission.
- When a change alters a capability, grep for the old capability's words.

**Expected:** every refusal names what is missing and who can grant it. Every list row can be told apart from its neighbours. No sentence is made false by a later change.

**Verify:** a reading pass over every string touched by the change, plus a grep for the capability's old words.

**Enforced:** no.

## POLISH-010: The model is explained where it acts

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

**Failure mode:**
- A fix is made where the symptom was seen.
- A change to a kit component is checked on the screen that motivated it, not on the others that use it.

**Detect:**
- When fixing, name the shared piece the defect comes from. If it lives in a screen, ask why the shared piece allowed it.
- When changing `packages/ui`, `kit/layout.tsx`, `Shell.tsx`, `PageHeader`, `DataTable` or `SchemaForm`, list their call sites (`grep -rn`) and look at the ones with the most different content.

**Expected:** the fix is in the shared piece with a guard (an enforce rule, a test of the piece), and the full browser suite has run before the milestone is called built.

**Verify:** run the full `pnpm e2e` (not one spec), and look at the picture diffs.

**Enforced:** partly. The full suite exists. Whether the browser walk ran is said in the pull request, and only a reviewer checks it.

## POLISH-014: Seen in a browser, on an instance, with realistic data, before it is called built

**Failure mode:** "built" is declared on unit tests and a build. The walk-through happens afterwards, or is done by the owner.

**Detect:** in the pull request, a change presented as done without a "seen in a browser" line, or a findings list that says the walk was not run.

**Expected:** each milestone that changes a screen is looked at in a browser, against the seeded example (Fernhill), at 1440 and 390 px, in light and dark, before its commit. The walk's findings are written into the milestone.

**Verify:** the gate in [milestone-polish-quality-gate.md](milestone-polish-quality-gate.md).

**Enforced:** no.

## POLISH-015: What the owner asked for is built as asked, or the difference is said at once

**Failure mode:**
- Scope is trimmed during building, and the trim is recorded at the bottom of the milestone instead of being raised.
- A decision that makes one builder differ from another is taken without asking.

**Detect:** search the pull request and the issue for "Not built", "left out" and "deferred" against the owner's decisions table and the exit criterion.

**Expected:** a trim of anything in the owner's decisions table or exit criterion is asked about before the work is presented. A choice that makes one surface differ from its siblings (POLISH-002) is an owner decision.

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
| POLISH-009 | Does any sentence stop being true because of this change? Does every refusal name what is missing? |
| POLISH-010 | Does every action with side effects say them first? Is every control usable by whoever can see it? |
| POLISH-011 | Is each schema quirk handled in `SchemaForm`, with a test? |
| POLISH-012 | Does it behave with a slow save, a reload mid-save and a failed save? |
| POLISH-013 | Was the fix made in the shared piece? Have the call sites of a changed kit piece been looked at? Did the full e2e suite run? |
| POLISH-014 | Was the screen seen in a browser on Fernhill before the commit? |
| POLISH-015 | Is everything trimmed from the owner's asks raised before the walk-through? |
