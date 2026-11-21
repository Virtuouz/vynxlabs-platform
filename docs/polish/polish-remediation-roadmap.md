# Polish remediation roadmap

Status: a proposal for the owner's choice. Nothing is scheduled or changed. Written 2026-11-20 against `f54d4bc`.

This roadmap orders the 84 findings of [predictive-ux-audit.md](predictive-ux-audit.md) by the priorities the assignment set:

1. broken core workflows
2. missing lifecycle operations
3. error handling and recovery
4. friction and discoverability
5. cross-feature consistency
6. accessibility
7. layout
8. cosmetics

The history decides one thing above all: **fix the shared piece first**. Thirteen findings are earlier corrections made again somewhere else, because the first fix stayed at its call site (POLISH-013). So the larger work below is grouped by the shared piece it builds, and the screens follow from it.

Effort is S for an hour or two, M for half a day to a day, and L for more. Risk is the chance of breaking something that works.

## Quick wins

Each is a small change to one or two files, with a clear test. None depends on anything else. Ordered by priority.

| # | Findings | Change | Priority class | Effort | Risk | Verify |
|---|---|---|---|---|---|---|
| Q1 | A3-01 | The Documentation section's Deploy also sends each draft feedback table its apps name, and the count says so. The `taken` check also looks at tables | 1, broken workflow | S | Low | A `Docs.test` case: turn on feedback, then deploy; the request's `paths` hold the table. Run in a browser on Fernhill's sandbox with a site that has no feedback |
| Q2 | A2-23 / A3-25 | Retention asks first when any period gets shorter, naming each kind and its old and new days. It uses `SaveBar` like Branding | 3, destructive without warning | S | Low | A unit test that a shorter value asks and a longer one does not |
| Q3 | A2-01 | The enum Values and On-delete dialogs close only on success, and show the server's reason inside | 3, recovery | S | Low | A unit test: the save is refused, the dialog stays open and keeps what was typed |
| Q4 | A3-16, A3-26 | "Stop asking for a second person" and an SSO provider's "Turn off" confirm and say their consequences | 3 | S | Low | Unit tests for each confirm |
| Q5 | A1-11, A1-14 | The runs row menu calls the run page's confirmed helpers. A batch reject requires a reason, as a single one does | 5, consistency | S | Low | `Runs.test`: "Run again" from the row asks. `Operate.test`: a batch reject without a reason is refused |
| Q6 | A1-16 | A trigger row on a script or flow page links with `triggerKey` (`path#node`) | 4, way back | S | Low | Browser: click a flow's trigger row, and the inspector opens on it |
| Q7 | A1-08, A2-15, A1-25 | The flow page's recent runs, the saved-queries list and the App Builder list draw loading and error states before "none yet" | 3, states | S | Low | A unit test of each with a pending and a failed load |
| Q8 | A2-10 | Fix `SchemaForm`'s long-text rule in `packages/ui/src/SchemaForm.tsx:441`: a text area only for `format: "textarea"`, an explicit multi-line hint, or `maxLength` > 1000. Add a test that renders every connector's `configSchema` and fails on a box for a one-line field | 7, but the third recurrence | S | Low | The new test. Browser: the SMTP form's fields are inputs |
| Q9 | A2-27 | The timeline puts each label above its bar under a container width, and shows only the first and last ticks | 7, open since phase 9 | S | Low | Add a flow run's timeline to `polish.spec.ts` at 390 px |
| Q10 | R-01, A1-22 | `<Deployments>` on Release gets `as="section"`. Promote's confirm names its real target | 6 and 9 | S | Low | Walk: one `h1` on Release. A unit test of the confirm text |
| Q11 | A3-08 | The docs tree's naming field stops only Enter, Escape and the tree's own keys | 6, keyboard | S | Low | Browser: F2 on a page, then F1 opens help |
| Q12 | R-02 | The audit log's "To" uses `Truncate`. Operator-access rows say "the tenant's API" instead of a raw request. Empty details are not drawn as `{}` | 8 | S | Low | Walk at 1440: every cut value has its whole on hover |
| Q13 | A1-04, A1-07, A1-19, A3-19, A1-24 | Copy made true: the read-only test pane, form and paused triggers on a flow page, "Releases" for "Changes", role delete, raw kind headings in review | 8, copy | S | Low | Read the changed strings |

Q1 to Q8 together are about two days of work, and they close every high finding that needs no shared piece.

## Larger work, by the shared piece it builds

Each item names its dependencies. The order is the recommended sequence.

### X1: one way for an editor to save (POLISH-012, 013)

- **Findings:** R-03 (⌘S saves text from before the typing), A1-01 (typing during an autosave is marked saved but never sent), A2-22 (the widget editor discards without asking), A2-04 (the row inspector drops unsaved edits).
- **Change:**
  - `useShortcut` (`apps/console/src/kit/keys.ts:139`) keeps its handler current without waiting for a render, or the save handlers read the source from a ref.
  - A shared `useDraftSave` takes a snapshot of what it sends and clears `dirty` only if nothing has changed since. It never overwrites newer local text with the server's echo.
  - The flow, script, resource, docs and query editors use it. The app builder's way is the model (`builder/AppBuilder.tsx:113`).
- **Depends on:** nothing. Do it first, because four other items save through editors.
- **Effort and risk:** M, medium risk. Every editor's save changes.
- **Verify:**
  - A browser test for each editor: type, press ⌘S at once, and the PUT carries the typed text.
  - With the save delayed by 2 s (as `dashboards.spec.ts` does): type during it, and a second save follows.

### X2: a create never overwrites (POLISH-010)

- **Finding:** A1-03, confirmed. A `PUT drafts/<path>` with no revision replaced the deployed schedule `inventory/half-hourly` with 200.
- **Change:**
  - The server gets a `create: true` flag, or treats a missing revision on a non-doc kind as a create. A path that is taken is refused with `path_taken`.
  - Every "New …" in the console sends it, and shows the refusal on the path field. This covers new script, flow, resource, "Make an app" and "Add a schedule".
- **Depends on:** nothing. It changes a server contract, so the CLI and git sync must be checked: they save with revisions.
- **Effort and risk:** M, medium risk.
- **Verify:** route tests for create over a draft and over a deployed resource. A browser test: "Make an app" with an existing name is refused.

### X3: everything listed can be removed and brought back (POLISH-003)

- **Findings:** A1-02, A3-05, A3-04, A2-17.
- **Change:**
  - Lift ResourceEditor's Remove/Discard into a kit `RemoveDraftButton`.
  - Use it in the script, extension and flow editors, the flow inspector, the App Builder and Queries.
  - Add "Keep this page" to a docs page drafted for removal.
  - Add "Stop publishing…" and "Turn off page feedback…" to a docs site's menu, with the same "says first what it does" dialog.
- **Depends on:** X2, so that a removal draft and a create cannot collide.
- **Effort and risk:** M, low risk.
- **Verify:** fill in the lifecycle matrix (POLISH-003) for scripts, flows, apps, queries and docs sites. Each cell is walked once in a browser.

### X4: who may decide, said before they try (POLISH-006, 010)

- **Findings:** A1-13 (confirmed), A1-09, A3-17, A3-18.
- **Change:**
  - The summary answers `approvalsWaitingMine` beside `approvalsWaiting`, and the overview words its count from it.
  - The approvals queue has a read-only "Waiting for others" view.
  - A flow run says per step whether the viewer may decide.
  - Access releases say whether the viewer asked.
  - Buttons show only to those who may use them, and a decline takes a comment.
- **Depends on:** nothing.
- **Effort and risk:** M, low risk.
- **Verify:** as Fernhill's viewer, the overview's count matches the queue that "Decide" opens.

### X5: one promotion confirmation (POLISH-002, 003)

- **Findings:** A1-20 (a request with breaking names can never be approved), A1-23.
- **Change:**
  - Extract the Promote step's breaking notice and "Delete them anyway" into a shared `PromotionConfirm`, used by the request review.
  - A rollback in production is a danger confirm that names the workspace.
  - The two lists of versions become one.
- **Depends on:** nothing.
- **Effort and risk:** M, medium risk. Production changes are involved.
- **Verify:** the runtime recipe in A1-20, on Fernhill with an agent-offered script renamed in the sandbox.

### X6: lists that page (POLISH-001, 002)

- **Findings:** A3-20 (members, tenants, instance members and group pickers stop at 200), A1-18 (events stop at 100).
- **Change:**
  - A shared paged loader with server-side search, the way End users already work (`EndUsers.tsx:94`).
  - Until it is used everywhere, a list that stopped says "Showing the first 200".
- **Depends on:** nothing.
- **Effort and risk:** M, low risk.
- **Verify:** a seeded tenant with 250 members, and an e2e test that finds the 250th.

### X7: one trigger state and one pause (POLISH-002)

- **Findings:** A1-15, A1-17.
- **Change:** export the Triggers screen's state cell and pause-with-reason as `TriggerState` and `useTriggerPause`. Use them on the overview and on script and flow pages, and hide drafting in production.
- **Depends on:** nothing.
- **Effort and risk:** S–M, low risk.
- **Verify:** a paused trigger reads the same on the overview, the Triggers list and its script's page.

### X8: the lifecycle the API already has (POLISH-003)

- **Findings:** A2-03, A2-25, A3-24, A3-21, A2-13, A2-02, A2-17.
- **Change:** rename and describe for tables, workspaces, tenants and end-user groups; "Change" for a data source; undo in the table definition and row rules through `useHistory`.
- **Depends on:** X1, for the table editor's saves. ResourceIdentity is reused for tables.
- **Effort and risk:** M–L, low risk.
- **Verify:** the lifecycle matrix for each kind, compared with `apps/control-plane/src/routes/*.ts`.

### X9: served surfaces held to the console's rules (POLISH-007, 008, 013)

- **Findings:** A2-28 (code-app help), A3-14 (the docs phone sheet's focus), A3-12, A3-13 (silent failures), A3-15, A2-29, A2-30.
- **Change:**
  - Help in `packages/app` stays mounted with motion and closes on a click outside.
  - The docs navigation sheet takes focus, makes the page inert and returns focus.
  - The served site's searches, votes and copies say when they fail.
  - The `e2e/test.ts` drawer fixture is run against the served-site specs too.
- **Depends on:** nothing.
- **Effort and risk:** M, low risk.
- **Verify:** the extended fixture, and a keyboard-only walk at 390 px.

### X10: guards that reach every screen (POLISH-013, 014)

- **Findings:** A2-31, R-01 and the class it belongs to.
- **Change:**
  - `polish.spec.ts` measures Queries, Dashboards, a table's rows and definition, Alerts, Retention, Variables, Sources and a run's timeline.
  - `enforce.test.ts` refuses a `ListScreen` drawn inside another screen without `as="section"`.
  - A test renders every connector's settings (part of Q8).
- **Depends on:** Q8 and Q9, so the new measures start green.
- **Effort and risk:** S–M, test-only risk.
- **Verify:** each new measure is shown to fail on the defect it guards, by reverting its fix locally once.

## Not scheduled, for the owner to decide

- **Medium and low findings with no shared piece:**
  - A1-05 and A1-06: Run on a draft; names that lead to the editor.
  - A1-10: the graph's keyboard.
  - A1-12: the compare page.
  - A1-21: Git sync's two control sets. This needs a decision about which page owns push and pull.
  - A2-05 to A2-09: the rows grid's controls and layout.
  - A2-11, A2-12, A2-14: connection details.
  - A2-16, A2-18 to A2-21, A2-24, A2-26: queries and dashboards details, alerts, clone.
  - A3-03, A3-06, A3-07, A3-09 to A3-11, A3-22, A3-23, A3-27: docs tree undo and naming, breadcrumbs, the 403 state.

  Each is small, and they can be taken in batches by area after the work above.
- **Decisions only the owner can make:**
  - Should turning off two-person approval itself wait for a second person (A3-16, server side)?
  - Should a docs site be unpublished by removing the app or by a switch (A3-04)?
  - Which page owns Git push and pull (A1-21)?

## Suggested order

1. **Q1 to Q8, then X1.** One sitting. X1 first among the large items, because everything that saves goes through it.
2. **X2, then X3.** A create that cannot overwrite, then removal everywhere.
3. **X4, X5, X7.** Approvals, promotions and triggers. These are independent and can be taken in any order.
4. **X6, X8.** Paging, then the API's lifecycle.
5. **X9 and X10,** then Q9 to Q13 if not already done.

Each step should go through the [quality gate](milestone-polish-quality-gate.md) before it is called done, starting with a browser walk on Fernhill.
