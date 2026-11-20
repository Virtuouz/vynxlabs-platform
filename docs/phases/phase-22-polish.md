# Phase 22: what the polish audit found, fixed where it is shared

Status: planned, on branch `phase-22-polish`, off `polish-pattern-audit` (which is off `phase-21-docs-redesign`).
Last updated: 2026-11-20

The polish audit ([docs/polish](../polish/README.md)) read 316 commits for the corrections the owner asked for after each phase. It turned them into rules POLISH-001 to 015 and audited the application against them. It found 84 distinct findings. Thirteen of them are earlier corrections made again somewhere else, because the first fix stayed where the symptom was. This phase fixes them in the order of [the roadmap](../polish/polish-remediation-roadmap.md): the quick wins first, then each shared piece before the screens that use it.

This is the first phase written from [the template](TEMPLATE.md). Every milestone has a **Polish gate**, and none is marked Built until it is answered.

**Exit criterion.** On `examples/fernhill`, in a browser:

- every high finding is fixed and walked: A1-01, A1-02, A1-03, A1-13, A1-20, A2-01, A2-10, A2-23, A3-01, A3-16, A3-20;
- in the flow, script, resource, docs and query editors, the text sent is the text typed, whether by ⌘S pressed at once or by an autosave that a keystroke overtook;
- "New script", "New flow", "Make an app" and "Add a schedule" at a path that is taken are refused on the path field, and nothing is overwritten;
- a script, flow, extension, App Builder app, query and docs site can each be removed where it is listed, and the removal taken back before it is deployed;
- as Fernhill's viewer, developer and approver, the overview's approvals count matches the queue that "Decide" opens;
- `pnpm test` and the full `pnpm e2e` pass. `NOT_MEASURED` in `e2e/polish.spec.ts` is empty, and the served docs site and a code app are under the motion fixture.

## Owner decisions

Answered by the owner on 2026-11-20.

| Area | Decision |
|---|---|
| A create (X2) | A create sends `create: true`. A path held by a draft or a deployed resource is refused with `path_taken`. A save without the flag is unchanged, so the CLI and git sync, which send revisions, are not affected |
| Two-person approval (A3-16) | Turning it off does **not** wait for a second person. It asks first and says what it changes (M1), and nothing more is built on the server |
| Unpublishing a docs site (A3-04) | A switch on the site turns publishing off and on, and keeps the site's pages and its app. Removing the app also unpublishes it, and says so first |
| Git push and pull (A1-21) | The Git sync page's own controls own them: the side-by-side choice for each file changed on both sides, with no default, and "Push with drafts". Push gains a commit message field with a default. The embedded `GitPanel` keeps only what it alone has: the "no repository" state and "Follow this branch". Its second Push, Pull and conflict chooser are removed, and with them the default of keeping this workspace's version |

## Milestones

| # | Milestone | Roadmap |
|---|---|---|
| M1 | Quick wins that close every high finding needing no shared piece | Q1–Q8 |
| M2 | One way for an editor to save | X1 |
| M3 | A create never overwrites | X2 |
| M4 | Everything listed can be removed and brought back | X3 |
| M5 | Who may decide is said before they try, and a trigger reads the same everywhere | X4, X7 |
| M6 | One promotion confirmation, and lists that page | X5, X6 |
| M7 | Guards that reach every screen | X10, Q9–Q12 |
| M8 | The lifecycle the API already has, and the served surfaces held to the console's rules | X8, X9 |
| M9 | Copy made true, and the medium and low findings by area | Q13, "not scheduled" |
| M10 | Guides, Fernhill, changelog, the walk-through | — |

M1 and M2 come first: everything later that saves goes through M2. M3 comes before M4, so that a removal draft and a create cannot collide. M5 and M6 are independent of each other. M7 depends on M1 (Q8) and on its own fixes, so every guard it adds starts green.

## M1: quick wins that close every high finding needing no shared piece

**Findings.**
- A3-01: turning on page feedback breaks the next deploy.
- A2-23 (= A3-25): Retention.
- A2-01: enum and On-delete dialogs.
- A3-16 and A3-26: the confirms. A3-16 is closed by its confirm, as decided.
- A1-11 and A1-14: the runs row menu and batch reject.
- A1-16: the trigger key.
- A1-08, A2-15 and A1-25: loading before "none yet".
- A2-10: SchemaForm.

**To build.**
- **Q1.** The Documentation section's Deploy sends the feedback tables its sites name, and its count says so. The `taken` check also looks at tables (`apps/console/src/screens/Docs.tsx:174`).
- **Q2.** Retention asks first when any period gets shorter, naming the kind and its old and new days. It uses `SaveBar`, as Branding does.
- **Q3.** The enum Values and On-delete dialogs close only on success, and show the server's reason inside the dialog.
- **Q4.** "Stop asking for a second person" and an SSO provider's "Turn off" confirm and say their consequences.
- **Q5.** The runs row menu calls the run page's confirmed helpers. A batch reject requires a reason.
- **Q6.** A trigger row on a script or flow page links with `triggerKey` (`path#node`).
- **Q7.** The flow page's recent runs, the saved-queries list and the App Builder list draw loading and error states before "none yet", through the kit's `LoadState`.
- **Q8.** `packages/ui/src/SchemaForm.tsx:441` draws a text area only for `format: "textarea"`, an explicit multi-line hint, or `maxLength` > 1000.

**Tests.**
- `Docs.test`: turn on feedback, deploy, and the request's `paths` hold the table.
- Retention: a shorter value asks, a longer one does not.
- Enum dialog: a refused save leaves the dialog open with what was typed.
- A unit test for each new confirm.
- `Runs.test`: "Run again" from the row asks. `Operate.test`: a batch reject without a reason is refused.
- A unit test of each list's pending and failed states.
- **A new guard:** a `SchemaForm` test renders every connector's `configSchema` and fails on a text area for a one-line field.

**Built** in `b9b0b2a`.
- **Q1.**
  - `GET /docs` answers `apps[].drafted` and the workspace's `tables` (`apps/control-plane/src/kernel/docs/working.ts`, `routes/docs.ts`).
  - `pendingOf` in `screens/docs/model.ts` counts pages, new or drafted apps, and the draft tables a site names. The Deploy confirm names each table. `FeedbackDialog`'s `taken` also checks tables.
- **Q2.** Retention saves through `SaveBar`, and asks with `ask.confirm({danger})`, kind by kind, when a period gets shorter.
- **Q3.** `Data.tsx`'s Values and On-delete dialogs close only on success and show the reason inside.
- **Q4.** The confirms are in `AccessReleases.tsx` and `SingleSignOn.tsx`. Nothing changed on the server, as decided.
- **Q5.**
  - `screens/runAgain.ts` holds `scriptAgain`, `flowFromFailed` and `flowFromStart`, shared by `RunPage.tsx` and the runs row menu.
  - The row menu gains "Again from the start…" for an ended flow.
  - A batch reject requires a reason.
- **Q6.** `triggerKey` moved to `kit/objects.tsx`. `ObjectPages.tsx` links trigger rows with it.
- **Q7.** The flow page's recent runs, Queries' saved list and the App Builder list draw `LoadState`'s pending and failed states.
- **Q8.** In `packages/ui/src/SchemaForm.tsx`, a text area is only for `format: "textarea"`, or for a `maxLength` above 1000 with no format.

**Tests.**
- `docs-apps.test.ts`, `Docs.test.tsx`, `Retention.test.tsx`, `Data.test.tsx`, `AccessReleases.test.tsx`, `SingleSignOn.test.tsx`, `Runs.test.tsx`, `ObjectPages.test.tsx`.
- New `Operate.test.tsx` and `ListStates.test.tsx`.
- `SchemaForm.test.tsx`, which renders every built-in connector's `configSchema` and fails on a text area for a one-line field. It fails three tests with the old threshold.
- Console, ui and screens together: 103 files, 727 tests, all pass.

**Findings.**
- A3-01 was wider than the audit wrote. When a deployed site's feedback was turned on, the drafted *app* was also left out of the deploy and the count, not only the table.
- **Open.** A member with only `interface:write` (doc writer) cannot deploy a table. If a developer turns feedback on and leaves the table as a draft, the writer's docs deploy now includes the table and is refused. Before this change, it silently left the feedback out.
- The rest of A1-25 (copy, the remount, links to the source) goes to M9.
- Two siblings were not moved onto the shared run-again helpers:
  - the command palette's "Run again" asks with its own copy and has no bundle version to give;
  - the runs batch bar asks for the batch.

**Polish gate.**
1. **Rules.** 001 (Q7), 003 and 010 (Q2, Q4), 011 and 013 (Q8), 012 (Q3), 002 (Q5, Q6).
2. **Siblings.**
   - `SaveBar`: Branding, InstanceBranding, Environments, the kit sheet, and now Retention.
   - `SchemaForm`: `InputDialog` (the run, flow and command-palette input dialogs), `ConnectionWizard`, `ScheduleForm` (schedule sheets, `ScheduleFields`, `WhenFields`) and the App Builder form actions in `packages/screens`. All of them get the Q8 rule, since the fix is in the shared form.
   - Run again: `RunPage` and the runs row now share `runAgain.ts`. The command palette and the batch bar are left, as said above.
   - `triggerKey`: Operate and ObjectPages.
3. **Lifecycle.** Not applicable: M1 adds no kind of object.
4. **States.**
   - Recent runs, saved queries and App Builder: blank for 300 ms, then the skeleton, then "Could not load … Try again", before the empty state.
   - Retention: a failed save keeps the draft and says why.
   - The Data dialogs: a refusal is said inside the dialog.
5. **Walk.** On a throwaway instance on :8090 seeded by Fernhill at `b9b0b2a`, with screenshots in the session's scratchpad (`walk/out-m1`, `out-m1b`).
   - Q8: Mail server, Sent from, User name and Port are inputs at 1440 (light) and 390 (dark).
   - Q2: shortening Runs to 1 or 2 asks: "Keep runs for less time? Runs: from 30 days to 1 …". Lengthening does not ask. Discard clears the field.
   - Q4: on Releases, turning approval on does not ask, and "Stop asking for a second person" asks with its consequences.
   - Q5: a run row's "Run again…" asks, naming the version. A batch reject's button stays disabled until a reason is typed.
   - Q6: a flow's trigger row opens `triggers?trigger=appointments%2Fafter-visit%23finished`, with that trigger's inspector.
   - Q7: with the API failing, Queries and App Builder say "Could not load … Try again".
   - Q1: turning on page feedback for `handbook` gave "Deploy 2 changes". The confirm named `handbook-feedback`, the request sent `["handbook","handbook-feedback"]`, and the deploy answered 201.
   - F1 opens help and Escape closes it on Retention, Releases, Queries, Runs, Documentation and App Builder at 390 dark. A reload keeps the address, and nothing scrolls sideways.
   - **Not walked:**
     - the SSO confirm, since Fernhill has no provider on (covered by `SingleSignOn.test.tsx`);
     - the enum dialog's refusal (`Data.test.tsx`);
     - a throttled network.
6. **Guards.** `pnpm exec vitest run apps/console packages/ui packages/screens` passes, and the `SchemaForm` connector guard is new. The full `pnpm e2e` runs at the end of the phase (M10).
7. **Left out.** The doc-writer permission edge above is for the owner. A1-25's remainder moves to M9.

## M2: one way for an editor to save

**Findings.**
- R-03: ⌘S saves the text from before the typing.
- A1-01: typing during an autosave is marked saved but never sent.
- A2-22: the widget editor discards without asking.
- A2-04: the row inspector drops unsaved edits.
- A2-19: two save paths on two revisions in dashboards.
- A3-10: quick tree operations use stale revisions.

**To build.**
- `useShortcut` (`apps/console/src/kit/keys.ts:139-140`) sets its handler ref when the handler changes, in a layout effect or at the call, so a key pressed before the next render runs the newest handler.
- A kit `useDraftSave`, modelled on the app builder (`apps/console/src/builder/AppBuilder.tsx:113`):
  - it saves a snapshot of what it sends;
  - it clears `dirty` only if nothing changed since;
  - it never overwrites newer local text with the server's echo;
  - it keeps the newest revision it has been given.

  The flow, script, resource, docs and query editors, the dashboard editor and the docs tree's batch send use it.
- The widget editor and the row inspector ask before discarding unsaved edits, with the kit's leave-guard wording.

**Tests.**
- A unit test of `useShortcut`: the handler is swapped and a key is dispatched before the render.
- `useDraftSave` unit tests: an edit during a save in flight keeps `dirty` and triggers a second save; an echo does not overwrite newer text.
- e2e for each editor: type, press ⌘S at once, and the PUT carries the typed text. With the save delayed 2 s (as `e2e/dashboards.spec.ts` does), type during it, and a second save follows.

**Built** on its own branch, merged in `89ef45f`.
- `useShortcut` (`kit/keys.ts`) sets its handler and `enabled` in a layout effect, binds once per id, and asks `enabled` at the key press.
- `kit/draftSave.ts`, `useDraftSave`:
  - sends a snapshot and clears dirty only when nothing changed since;
  - saves again with the returned revision when something did;
  - never replaces newer text with the echo.
  - Used by the script, extension and connector editors (`Authoring.tsx`), `ResourceEditor`, `FlowEditor`, `DocEditor` and `Queries`.
- Dashboards: save and keep go through one ordered queue on one revision.
- The docs tree: sends fetch fresh revisions and run in order.
- The widget editor and the row inspector ask before discarding.
- On merging with M3, every editor's save kept `create: true`, and its refusal on the path field.

**Tests.**
- `kit/draftSave.test.tsx`, `keys.test.tsx`.
- `Docs.test.tsx`: ⌘S right after typing.
- `Dashboards.test.tsx`, `Data.test.tsx`.
- `e2e/editor-save.spec.ts`.

**Findings.**
- A layout effect alone does not help when the keystroke's own state has not rendered (Monaco's `onChange` is not a React event), so the savers read the text from `useDraftSave`.
- The dashboard is a queue of operations, not one snapshot, so it is not on the hook.
- `ResourceEditor` and Queries still have no ⌘S.

**Polish gate.**
1. Rules: 002, 012, 013.
2. Siblings. Callers of `useShortcut("save")`:
   - Authoring, FlowEditor and DocEditor are fixed.
   - `SaveBar`'s screens (Branding, InstanceBranding, Environments, Provisioning, KitSheet) keep their own dirty state, and are candidates for the hook.
   - The app builder (`EditorShell`) was already right.
3. Lifecycle: not applicable.
4. States: a refused save stays unsaved and says why. A save in flight shows Saving, and a second save follows it.
5. Walk. On the throwaway instance on :8090, seeded by Fernhill at `741a52c`:
   - docs editor, `handbook/front-desk/booking`: typing then Ctrl+S at once sent the typed text (200), and "Unsaved changes" cleared;
   - a console-made script: the same.
   - Not walked: a throttled network, which is covered by `editor-save.spec.ts`.
6. Guards: the unit tests above, and `editor-save.spec.ts` in the e2e run.
7. Left out: ⌘S for resources and queries.

## M3: a create never overwrites

**Findings.**
- A1-03 (confirmed): a `PUT drafts/<path>` without a revision replaced the deployed schedule `inventory/half-hourly`.

**To build.**
- The drafts PUT route (`apps/control-plane/src/routes/`) takes `create: true`. With it, a path held by a draft or a deployed resource is refused with `path_taken`.
- Every "New …" in the console sends it: new script, flow, resource, "Make an app" and "Add a schedule". The refusal is shown on the path field.
- The docs editor's existing guard is the model. A save without the flag behaves as before. The CLI and git sync are read once to confirm they never rely on a save landing on a taken path.

**Tests.**
- Route tests: a create over a draft is refused; a create over a deployed resource is refused; a create on a free path succeeds; a save with a revision is unchanged.
- e2e: "Make an app" with an existing name is refused, and the existing app is unchanged.

**Built** in `93997fb`, merged in `5eb2280`, with `1f0adbf`.
- `saveDraft` (`kernel/authoring.ts`) refuses `create: true` on a held path with 409 `path_taken`. `drafts/batch` takes `create` too.
- `takenText()` in `ask.tsx`.
- Every "New …" sends it and shows the refusal on its path field:
  - script, extension, connector, flow and resource;
  - "Make an app", "Make an app for it" and "Add a schedule";
  - connection, query and "Keep it as a resource";
  - docs page and "Publish as a site".
- `PromptOptions.submit` (`packages/ui/src/Dialogs.tsx`) does the work before a prompt closes, so a refusal is said on its field. A failure it did not foresee is said there too (`1f0adbf`).

**Tests.**
- `create-guard.test.ts` (route).
- `Interfaces.test.tsx`, `ScheduleForms.test.tsx`, `Dialogs.test.tsx`.
- `e2e/create-guard.spec.ts`.

**Findings.**
- The SDK has no drafts calls, the CLI deploys with revisions, and git sync never reaches `saveDraft`.
- Turning on page feedback creates its table without `create`, so a retry is not refused.

**Polish gate.**
1. Rules: 002, 010.
2. Siblings: every create path above. Renames already refused a taken path.
3. Lifecycle: create is guarded, and the rest are unchanged.
4. States: the refusal sits on the field and keeps what was typed.
5. Walk. On the throwaway instance on :8090, seeded by Fernhill at `741a52c`:
   - `PUT drafts/inventory/half-hourly` with `create: true` returned 409 `path_taken`: "inventory/half-hourly is the path of a schedule. Choose another path, or open that one.";
   - New script at `agent/clinic-day`: the Path field said "Something already exists at this path. Choose another, or open that one."
6. Guards: the route test, and `create-guard.spec.ts` in the e2e run.
7. Left out: a deploy-time check for a create that raced.

## M4: everything listed can be removed and brought back

**Findings.**
- A1-02: scripts, extensions, flows and App Builder apps cannot be removed.
- A2-17: queries.
- A3-04: unpublishing a site, and turning off feedback.
- A3-05: a removal cannot be taken back after the toast.
- A3-03: undoing a move leaves the address behind.
- A3-06: publish has no Undo.
- A3-07: two delete flows in the docs tree.

**To build.**
- Lift ResourceEditor's Remove/Discard into a kit `RemoveDraftButton`. Use it in the script, extension and flow editors, the flow inspector, the App Builder and Queries.
- Docs: "Keep this page" on a page drafted for removal, and one delete flow. A site gets a publishing switch, as decided: off stops serving it and keeps its pages and app, and on serves it again at the next deploy. Its menu gets "Turn off page feedback…". Removing the site's app says first that the site stops being served. Each says first what it does. Undo of a move restores the address, and publish offers Undo while it can.

**Tests.**
- A unit test of `RemoveDraftButton`.
- An e2e lifecycle walk for scripts, flows, apps, queries and docs sites: remove, take back, remove, deploy.

**Built** in `5d2cd68`, merged in `f41c232`, with `24323ab`.
- `kit/RemoveDraftButton.tsx` confirms first and saying what it does, then discards a draft, drafts a removal, or keeps one.
  - It is used in the script, extension and flow editors, the flow inspector, the App Builder list and Queries.
  - For one the repository manages, it says "Managed in the repository: the … is removed there", and offers nothing the server would refuse (`24323ab`).
- Docs:
  - "Keep this page";
  - one delete flow (`deletePage`, `applyPlan`, which now sends through M2's ordered, fresh-revision `send`);
  - Undo of a move restores the address;
  - publish offers Undo.
- Docs sites, as decided:
  - `published: false` on the app body (manifest, schemas, SDK, docs-engine). `front.ts` answers 404 for an unpublished site.
  - "Stop publishing…" and "Publish again…", "Turn off page feedback…", "Remove the site's app…".

**Tests.**
- `RemoveDraft.test.tsx`, including the repository state and a code-owned flow.
- `screens/docs` tests.
- `docs-apps.test.ts`: the switch off and on.
- `e2e/lifecycle.spec.ts`.

**Findings.**
- **Found in the walk:** Remove on `appointments/after-visit` and on `screens/performance` was refused, "managed in the repository". The flows and interfaces lists now answer `ownership`, and the button does not offer it (`24323ab`).
- The App Builder shell itself has no Remove; only its list does.
- Queries and apps have no rename yet.

**Polish gate.**
1. Rules: 003, 010.
2. Siblings: every removal now goes through `RemoveDraftButton` or `deletePage`. `ListScreen.RemoveButton` users (tenant resources) are unchanged.
3. Lifecycle:

   | | create | open | edit | rename | remove | take back | deploy |
   |---|---|---|---|---|---|---|---|
   | scripts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
   | extensions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
   | flows | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
   | apps | ✓ | ✓ | ✓ | ✗ | ✓ list | ✓ | ✓ |
   | queries | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
   | docs sites | ✓ | ✓ | n/a | n/a | switch, or remove app | ✓ | ✓ |
   | docs pages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

   A repository-managed item is removed in the repository.
4. States: a removed item shows "Keep this …". A refusal is said in a toast.
5. Walk. On the throwaway instance on :8090, seeded by Fernhill at `f9c9171`:
   - a console-made script: "Discard this draft?", then the draft is gone (404) and the editor goes back to Scripts;
   - a flow: "Remove this flow? This saves a draft that removes it…";
   - the handbook site: "Stop publishing Fernhill handbook? Once this is deployed, readers are told there is nothing at its address…". After the deploy, its address answered 404. "Publish again…" and a deploy, and it answered 200.
6. Guards: `lifecycle.spec.ts` in the e2e run.
7. Left out: renaming apps and queries.

## M5: who may decide is said before they try, and a trigger reads the same everywhere

**Findings.**
- A1-13 (confirmed): the overview's count and the queue disagree.
- A1-09: Approve is shown to non-approvers.
- A3-17 and A3-18: access releases.
- A1-15: drafting in production, and a pause with no reason.
- A1-17: the overview's hand-built trigger list.

**To build.**
- The summary answers `approvalsWaitingMine` beside `approvalsWaiting`, and the overview words its count from it.
- The approvals queue has a read-only "Waiting for others" view.
- A flow run says per step whether the viewer may decide. Access releases say whether the viewer asked, show the full list of changes before approve or roll back, and show buttons only to those the server allows. A decline takes a comment.
- Export the Triggers screen's state cell and pause-with-reason as `TriggerState` and `useTriggerPause`. Use them on the overview and on script and flow pages. Drafting is hidden in production.

**Tests.**
- A route test for `approvalsWaitingMine`.
- e2e as Fernhill's viewer, developer and approver: the count matches the queue "Decide" opens.
- A paused trigger reads the same on the overview, Triggers and its script's page.

**Built** in `a63a314`, merged in `42492e0`, with `719fb11`.
- `mayDecide` (`kernel/flows/approvers.ts`) is shared by `approvals?mine=true` and the summary's new `approvalsWaitingMine`.
- The overview says "N runs are waiting for you", or "… for someone else to decide" with "See who".
- The approvals queue has a read-only "Waiting for others".
- A flow run says per step whether the viewer may decide.
- Access releases say who asked, list every change, and offer only what the server allows (`mayChange` on `GET /access`). A decline takes a comment.
- `TriggerState` and `useTriggerPause` are shared by the overview and the script and flow pages. Production hides "Add a schedule" and says why.
- When merging, the shared `triggerKey` from M1 (`kit/objects.tsx`) was kept.

**Tests.**
- `flows.test.ts` (summary vs `mine`).
- `Approvals.test.tsx`, `AccessReleases.test.tsx`.
- `e2e/approvals-mine.spec.ts`.

**Findings.**
- The tenant approvals queue and `TenantOverview` still word their count from all approvals.
- A rollback of an access release lists what the release made, not what would be removed since. That needs a server dry run.

**Polish gate.**
1. Rules: 001, 002, 006, 010.
2. Siblings:
   - The run page, the workspace approvals and access releases are done.
   - Left: the tenant approvals screen, the Flows head note count, `InstanceTriggers`.
3. Lifecycle: not applicable.
4. States: "Waiting for you", "Waiting for others" and "Decided", each with loading and empty states.
5. Walk. On the throwaway instance on :8090, seeded by Fernhill at `741a52c`:
   - Amara (viewer) and Devi (developer): "2 runs are waiting for someone else to decide", no Decide, and "See who" opens two read-only rows with "Who decides".
   - Maya: "2 runs are waiting for you", with Decide, and `mine` held 2.
   - Production's script Triggers tab: no "Add a schedule", "Triggers change in a dev workspace and reach production by promotion." Dev: offered.
6. Guards: `approvals-mine.spec.ts` in the e2e run.
7. Left out: the tenant-level count, as above.

## M6: one promotion confirmation, and lists that page

**Findings.**
- A1-20: a request with breaking names can never be approved.
- A1-23: rollback in production.
- A3-20: lists stop at 200.
- A1-18: events stop at 100.

**To build.**
- A shared `PromotionConfirm`, extracted from the Promote step's breaking notice and "Delete them anyway". The request review uses it.
- A rollback in production is a danger confirm that names the workspace.
- The two lists of versions become one.
- A shared paged loader with server-side search, on the End users pattern (`apps/console/src/screens/EndUsers.tsx:94`), for members, tenants, instance members, group pickers and events. Until a list uses it, the list says "Showing the first 200".

**Tests.**
- The A1-20 recipe as e2e: an agent-offered script renamed in the sandbox, requested and approved.
- e2e with a seeded tenant of 250 members: the 250th is found by search and by paging.

**Built** in `1df394f`, merged in `741a52c`.
- `screens/PromotionConfirm.tsx` is shared by the Promote step and request review. The review sends `confirmBreaking` and `allowDelete`, and the preview takes `allowDelete`.
- Rollback: "Activate version N in <workspace>?", a danger confirm in production.
- `kit/paged.tsx` (`usePagedList`, `LoadMore`) with server search (`SearchPageQuery` in `pagination.ts`) for tenants, members, all members, the operator picker and group pickers.
- Events page by 100, and open an event by `?id=`, or say "Event not found".

**Tests.**
- `PromotionConfirm.test.tsx`, `Rollback.test.tsx`, `Paged.test.tsx`, `Promotion.test.tsx`.
- `list-search.test.ts`.
- `e2e/paging.spec.ts`.

**Findings.**
- The two lists of versions on Release (the deployment ledger and the bundles) were not merged. They are different things, and merging them is a redesign.
- Roles, other group pickers and `SeeItAs` still load the first 200.

**Polish gate.**
1. Rules: 001, 002, 003, 010.
2. Siblings: Promote and review share one piece. The lists named in Findings remain.
3. Lifecycle: not applicable.
4. States: "Showing the first N … Load more"; "Event not found".
5. Walk. On the throwaway instance on :8090, seeded by Fernhill at `741a52c`:
   - member search sent `members?limit=50&search=rowan` and found Rowan Ellis;
   - `events?item=<unknown>` said "Event not found".
   - **Not walked:** a rollback, since Fernhill's production workspace has one version. Covered by `Rollback.test.tsx`.
6. Guards: `paging.spec.ts` (250 members) in the e2e run.
7. Left out: merging the two version lists, for the owner.

## M7: guards that reach every screen

**Findings.**
- A2-31: the data screens are not measured.
- A2-27: timeline labels overlap at 390 px.
- R-01 and A1-22: two `h1`s on Release; Promote names the wrong target.
- A3-08: the tree's naming field stops every key.
- R-02: the audit log's cut text and raw targets.

**To build.**
- **Q9.** The timeline puts each label above its bar under a container width, and shows only the first and last ticks.
- **Q10.** `<Deployments>` on Release (`Release.tsx:645`) gets `as="section"`. Promote's confirm names its real target.
- **Q11.** The docs tree's naming field stops only Enter, Escape and the tree's own keys.
- **Q12.** The audit log's "To" uses `Truncate`. Operator-access rows say "the tenant's API". Empty details are not drawn as `{}`.
- Every section in `NOT_MEASURED` is added to `screens()` in `e2e/polish.spec.ts`, with Fernhill-like data, and the list is emptied. A flow run's timeline is measured at 390 px.
- New `enforce.test.ts` rules:
  - a `ListScreen` drawn inside another screen without `as="section"` fails;
  - a key handler in a field that stops propagation of keys it does not handle fails.

**Tests.** The guards themselves. Each is shown once to fail on the defect it guards, by reverting its fix locally, and the result is written in Findings.

**Built** in `7eb4385`, merged in `5f4db06`.
- **Q9.** The timeline (`packages/ui/src/Timeline.tsx`) is a container. Under 32rem a label sits above its bar, and only the first and last ticks show.
- **Q10.**
  - `<Deployments as="section">` on Release.
  - `promoteConfirm` and `promoteLabel` name the real target. When merging with M6, the breaking sentences come from `PromotionConfirm`.
- **Q11.** The docs tree's `NameEditor` stops only its own keys. Its sibling, `Grid.tsx`'s cell editor and column filter, now let F1 and ⌘K go on (`keepsKey`).
- **Q12.** The audit log's "To" uses `Truncate` (middle). Operator access reads "the tenant's API". Empty details read "Nothing more was recorded."
- `NOT_MEASURED` is empty. Every navigation section, and a flow run's timeline at 390 px, is measured in `polish.spec.ts`.
- New `enforce.test.ts` rules:
  - "a list drawn inside another screen is a section, not a second page";
  - "no key handler on a field stops every key".

**Tests.**
- `NameEditor.test.tsx`, `Promote.test.ts`, `Audit.test.tsx`, `Grid.test.tsx`, `views.test.tsx`.
- Each new enforce rule failed on its defect when its fix was reverted (`Release.tsx:645`; `Docs.tsx:846`, `Grid.tsx:282`, `Grid.tsx:481`), and passed after.

**Polish gate.**
1. Rules: 004, 005, 007, 013, 014.
2. Siblings: `Grid.tsx`'s two key handlers, fixed in the same change.
3. Lifecycle: not applicable.
4. States: not applicable.
5. Walk. On the throwaway instance on :8090, seeded by Fernhill at `f9c9171`:
   - Release has one `h1` in each workspace;
   - F2 in the docs tree, then F1, opened help;
   - the audit log cut a long target in the middle ("handbook/fr… /booking").
6. Guards: the two enforce rules. `polish.spec.ts` measures every section.
7. Left out: nothing.

## M8: the lifecycle the API already has, and the served surfaces held to the console's rules

**Findings.**
- Lifecycle:
  - A2-03 and A2-02: the table cannot be renamed or described where it is edited, and has no undo.
  - A2-25: a workspace cannot be renamed.
  - A3-24: a tenant cannot be renamed.
  - A3-21: end-user groups cannot be renamed.
  - A2-13: no "Change" for a data source.
- Served surfaces:
  - A2-28: help in code apps.
  - A3-14: the docs phone sheet's focus.
  - A3-12 and A3-13: silent failures.
  - A3-15: the listbox.
  - A2-29: "Load more" fails silently.
  - A2-30: refusals do not say whom to ask.

**To build.**
- Rename and describe for tables (through ResourceIdentity), workspaces, tenants and end-user groups. "Change" for a data source. Undo in the table definition and row rules through `useHistory`. The table editor saves through M2's `useDraftSave`.
- Help in `packages/app` stays mounted with motion, follows the theme, and closes on a click outside.
- The docs navigation sheet takes focus, makes the page inert and returns focus. The search listbox is well formed.
- The served site's searches, votes, copies and "Load more" say when they fail. Refusals say whom to ask.
- The `e2e/test.ts` motion fixture runs against the served-site specs (`documentation.spec.ts`, `tenant-apps.spec.ts`).

**Tests.**
- A lifecycle e2e for each kind.
- The extended motion fixture.
- A keyboard-only walk of the served docs site at 390 px.
- axe on the served search.

**Built** in `d6fe6d3`, merged in `4cdca71`.
- Tables: "Rename table" (via `ResourceIdentity`), "Describe the table", and undo and redo through `useHistory` (⌘Z).
- A workspace name in settings; "Rename" for a tenant; Rename and Describe for end-user groups.
- "Change" for a data source (`CreateDialog`'s new `initial`).
- Code-app help (`packages/app/src/help.tsx`):
  - it moves in and out;
  - it is closed by a click outside;
  - it follows the theme.
- The served docs site (`kernel/apps/docs.ts`):
  - the phone sheet takes and returns focus, and makes the page inert;
  - the search listbox is well formed;
  - search, copy and votes say when they fail.
- Served app tables: "Load more" says when it fails and offers Try again. Refusals say whom to ask.

**Tests.**
- `Data.test.tsx`, `Environments.test.tsx`, `Account.test.tsx`, `Groups.test.tsx`.
- `packages/app/src/app.test.tsx`, `Renderer.test.tsx`.
- `docs-script.test.ts`.
- `e2e/rename.spec.ts`, and `documentation.spec.ts` at 390 px.

**Findings.**
- The table editor PUTs the resource directly, so it does not use `useDraftSave`.
- The docs search dialog and the phone sheet are not matched by the motion fixture's selector.

**Polish gate.**
1. Rules: 001, 003, 007, 008, 013.
2. Siblings: `packages/ui`'s `Presence`, mirrored in `help.tsx` because `packages/app` does not depend on the kit. Member groups have no Describe.
3. Lifecycle:

   | | rename | describe | change | undo |
   |---|---|---|---|---|
   | table | ✓ | ✓ | n/a | ✓ |
   | workspace | ✓ | n/a | n/a | n/a |
   | tenant | ✓ | n/a | n/a | n/a |
   | end-user group | ✓ | ✓ | n/a | n/a |
   | data source | n/a | n/a | ✓ | n/a |

4. States: the served failures are said in place, with a way on.
5. Walk. On the throwaway instance on :8090, seeded by Fernhill at `8fff039`:
   - `handbook-feedback`'s Definition: "Describe the table" saved, and Undo took it back;
   - the workspace name field and tenant Rename were present, and end-user groups had Rename and Describe;
   - the docs site at 390 px, on `front-desk/booking`: opening the sheet moved focus to "Close the navigation" and made `.topbar` and `.page` inert. Escape returned focus to "Open the navigation", with nothing left inert;
   - with search blocked: "The search did not answer. Open the full results."
   - **Not walked:** "Change" on a source (Fernhill has none), and code-app help.
6. Guards: `rename.spec.ts` and `documentation.spec.ts` in the e2e run.
7. Left out: Describe for member groups.

## M9: copy made true, and the medium and low findings by area

**Findings.**
- **Copy (Q13):**
  - A1-04: the read-only test pane.
  - A1-07: form and paused triggers on a flow page.
  - A1-19: "Releases" for "Changes".
  - A3-19: role delete.
  - A1-24: raw kind headings in review.
- **Build and Operate:**
  - A1-05: Run on a draft.
  - A1-06: names that lead to the editor.
  - A1-10: the graph's keyboard.
  - A1-12: the blank compare page.
  - A1-21: Git sync's two control sets, merged into the page's own as decided. `GitPanel` (`apps/console/src/screens/Git.tsx:177`) keeps setup only. Push takes a commit message. `Git.test.tsx` moves its push and pull cases to the page.
- **Rows:**
  - A2-05: booleans edited three ways.
  - A2-06: references typed as UUIDs.
  - A2-07: controls that snap back.
  - A2-08: a scroller inside a scrolling page.
  - A2-09: no phone form for column actions.
- **Connections and sources:**
  - A2-11: headers as JSON.
  - A2-12: two vocabularies for one idea.
  - A2-14: stale health looks live.
- **Queries and dashboards:**
  - A2-16: "New query" keeps the old one.
  - A2-18: clearing a filter's label refills it.
  - A2-20: one failed dashboard sticks to the others.
  - A2-21: stale numbers unmarked.
- **Alerts and clone:**
  - A2-24: load errors never shown, and an unbound target reads "None".
  - A2-26: clone can be posted twice.
- **Documentation and shell:**
  - A3-09 and A3-23: breadcrumbs.
  - A3-11: disabled controls that say not why.
  - A3-22: the open group is not in the address.
  - A3-27: a 403 offers "Try again".

**To build.** Taken in batches by area, each batch one commit with its tests. The fix and expected behaviour for each are in the audit's appendices.

**Built** in three batches.
- **Build and Operate and copy** (`d6f200d`, merged in `5ce1ab1`):
  - the read-only test pane's copy, a flow's trigger copy, "Releases";
  - who holds a role, before it can be deleted;
  - kind names in review;
  - "Not deployed yet" in place of Run for a draft;
  - names lead to the object's page, and the script page has Run;
  - graph nodes are buttons only when choosable;
  - the compare page's "The code is the same in both";
  - Git sync owns push and pull, as decided, with a commit message, and `GitPanel` keeps setup only.
- **Documentation and shell** (`3168e49`, merged in `afa310e`):
  - breadcrumbs for the docs reader, editor and member page;
  - "New page" and preview votes say why they are disabled;
  - `?group=` in the address;
  - a 403 offers no Try again and says whom to ask (`ErrorState`).
- **Data, insight and configure** (`c75d89f`, merged in `ae0205e`):
  - one boolean field, and a reference picker;
  - a choice that holds until it saves;
  - a phone menu for column actions;
  - header rows for HTTP;
  - `HealthCell` with the age of a test;
  - "New query" empties the editor;
  - a filter's label can be cleared;
  - a failed dashboard does not stick, and stale widgets say "Updating…";
  - Alerts' load errors, and targets no longer bound;
  - clone cannot be posted twice.

**Tests.**
- `Git.test.tsx`, `Roles`, `RunCompare`, `RunPage`, `Triggers.test.tsx` (names lead to the page).
- `LoadState.test.tsx`.
- `Grid.test.tsx`, `SchemaForm.test.tsx` (string maps), `Connections.test.tsx`.

**Findings.**
- **A2-08 is not fixed.** One scroller for the rows grid needs a fill layout: `TableView` in `WORKBENCHES`, a fill mode on `Page`, `Grid` with `fill`.
- **A2-06 is partly fixed.** The reference picker lists the first 200 rows. File replace and remove in the row inspector is not done.
- When merging, `ListScreen`'s columns became `DataColumn` (with `priority`), and a lost import was put back (`8fff039`).

**Polish gate.**
1. Rules: 001, 002, 003, 006, 007, 009, 010, 011.
2. Siblings:
   - `ErrorState`'s users all get the 403 rule.
   - `SchemaForm`'s users all draw string maps as rows.
   - Domains' "Not checked yet" and `ConnectionWizard`'s pill are not on `HealthCell`.
3. Lifecycle: not applicable.
4. States: forbidden, stale ("Updating…"), failed with Try again, and "tested 3d ago".
5. Walk. On the throwaway instance on :8090, seeded by Fernhill at `8fff039`:
   - script names in the list open `scripts/<path>`;
   - a role with no holder said "Nobody holds it.";
   - the HTTP connection form has header rows, with no JSON box;
   - Git sync, Roles, Connections, Sources, Tables, Alerts, Dashboards and Settings do not scroll sideways at 390 px in dark.
   - **Not walked:**
     - push and pull, since Fernhill has no repository (covered by `Git.test.tsx`);
     - a forbidden screen, since the viewer could open the one tried (covered by `LoadState.test.tsx`);
     - "New query", since Fernhill has no saved query.
6. Guards: the unit tests above.
7. Left out: A2-08, and the rest of A2-06, for the owner.

## M10: guides, Fernhill, changelog, the walk-through

- `CHANGELOG.md`.
- The guides name what changed: removal, create refusal, approvals for others, paging and retention confirms.
- Fernhill gains what the walk needs: a member who can read approvals but not decide, and enough members to page.
- A phase walk-through spec walks this exit criterion, tagged with the POLISH rules each step checks.
- The phase 21 walk (`e2e/documentation.spec.ts`), never run, is run here.

## Findings

None yet.

## Traceability

Every finding of [the audit](../polish/predictive-ux-audit.md), and where it is taken.

| Milestone | Findings |
|---|---|
| M1 | A1-08, A1-11, A1-14, A1-16, A1-25, A2-01, A2-10, A2-15, A2-23, A3-01, A3-16, A3-26 |
| M2 | A1-01, A2-04, A2-19, A2-22, A3-10, R-03 |
| M3 | A1-03 |
| M4 | A1-02, A2-17, A3-03, A3-04, A3-05, A3-06, A3-07 |
| M5 | A1-09, A1-13, A1-15, A1-17, A3-17, A3-18 |
| M6 | A1-18, A1-20, A1-23, A3-20 |
| M7 | A1-22, A2-27, A2-31, A3-08, R-01, R-02 |
| M8 | A2-02, A2-03, A2-13, A2-25, A2-28, A2-29, A2-30, A3-12, A3-13, A3-14, A3-15, A3-21, A3-24 |
| M9 | A1-04, A1-05, A1-06, A1-07, A1-10, A1-12, A1-19, A1-21, A1-24, A2-05, A2-06, A2-07, A2-08, A2-09, A2-11, A2-12, A2-14, A2-16, A2-18, A2-20, A2-21, A2-24, A2-26, A3-09, A3-11, A3-19, A3-22, A3-23, A3-27 |
| Not taken | A3-02 (= R-04): refuted at runtime. A3-25: the same finding as A2-23 |
