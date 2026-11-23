# Lane draft: fixed

Cause of most rows: a draft save that did not say which draft it was based on.

## The shared piece

- Server, `apps/control-plane/src/kernel/authoring.ts` `saveDraft` (the check after "A draft is shared by everyone"): for every kind, a save over an existing draft must name its `revision`, or it is 409 `draft_changed`; a `revision` for a draft that is gone (discarded or deployed) is 409 `draft_changed` too; `create` over anything held is `path_taken`. The `doc` rule widened. Internal writers that replace on purpose pass `replace: true` (restore from history, the dashboards a query rename drafts); no route caller can. Route text in `routes/authoring.ts` (PUT drafts, `create`) says so.
- Console, one helper: `apps/console/src/kit/draftApi.ts` (`putDraft` with a base `{revision}` / `{create}` / `{first}`, `readDraft`, `putOnDraftNow` for buttons that act once, `isDraftClash`). `kit/draftSave.ts` (`useDraftSave`) catches the clash: it sets `clashed`, does not retry, does not report it as a failure, and `reset` (loading their version) clears it. `kit/DraftClash.tsx` is the one notice: "Someone else saved this <thing> after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." with "Copy what I wrote" and "Load their version" (asks first).
- A removal draft opens as a removal in the script/connector/trigger-source editor (`screens/Authoring.tsx`), flow editor, settings editor (`ResourceEditor.tsx`), app builder, and Queries: the deployed content read only, "Removing" pill, "Keep this <noun>", no autosave.

## Editors and callers looked at (POLISH-013)

| Place | Now |
| --- | --- |
| `Authoring.tsx` scripts, connectors, trigger sources | putDraft, clash, removal state |
| `FlowEditor.tsx` | putDraft, clash, removal state (canvas is not frozen: see Left) |
| `ResourceEditor.tsx` (schedules, triggers, variables, ...) | putDraft, clash, removal state |
| `Queries.tsx` | reads the draft; putDraft; clash; removal; discard resets |
| `builder/AppBuilder.tsx` | putDraft `first`/`revision`, clash, removal |
| `Interfaces.tsx` Make an app | putDraft `create`; Discard edits button; text |
| `ResourceIdentity.tsx` (rename, title) | based on the draft it read when it opened |
| `kit/RemoveDraftButton.tsx` (tables, scripts, flows, dashboards, apps, queries) | `putOnDraftNow` |
| `docs/DocEditor.tsx` | uses `draft.clashed` and `DraftClash` (was its own notice) |
| `docs/Docs.tsx` site app changes, remove, undo, turn feedback on | `putOnDraftNow` / `readDraft` revision in the batch |
| `Dashboards.tsx`, `ScheduleForm.tsx`, `ConnectionWizard.tsx`, Docs publish | already `create: true`; unchanged |
| Theme, tables (`Data.tsx`) | write `resources/` directly, not drafts: nothing to base |
| Git pull, CLI pull | read drafts, never write them; a CLI deploy clears them by revision already. Unchanged |
| `drafts/batch` | per-change `revision`/`create`, same server rule |
| `examples/fernhill/setup/setup.mjs` | uses `create: true`: unchanged |
| `e2e/polish-setup.ts` | PUTs bare; fine on a fresh instance, 409 on a second run. Not changed, not run |

## Rows

### BLD-01 A save with no revision replaces another person's draft
Commit: see git log (`Phase 29: a draft save names the draft it is based on`). Server `kernel/authoring.ts` (the three checks after "A draft is shared"); client `kit/draftApi.ts`, `kit/draftSave.ts`, `kit/DraftClash.tsx`, `builder/AppBuilder.tsx` (`save`, `clash`). Tests: `authoring.test.ts` "a save without a revision never replaces a draft, of any kind"; `kit/draftSave.test.tsx` "a save refused because someone else saved first is a clash". Failed before the fix (200 over the draft). Sees: a second builder's bare save is told "Someone else saved this draft" and keeps their work.

### BLD-09 Remove on a deployed app with unpublished edits
`Interfaces.tsx`: a "Discard draft" button beside Remove when a deployed app has edits; Remove's text says the edits are replaced. Test: `DraftBasis.test.tsx` "an app with unpublished edits can have only them discarded". Failed before.

### BLD-13 "Nobody else sees it until you publish it"
`Interfaces.tsx` Make an app text now: "Other builders of this workspace see the draft; people who use the app see nothing until you publish it." Same test. The docs text in `app-builder-editor.md` ("The draft is only yours") needs the same change (docs content not edited by this lane): say "Other builders of this workspace see and can change the draft; a save that was based on an older draft is refused."

### SCR-11 A draft that removes a script opens as an ordinary draft
`Authoring.tsx` (removed state). Test: `Authoring.test.tsx` "a script drafted for removal opens as a removal". Failed before (editable, autosaved).

### DAT-06, DAT-07, DAT-08 Queries
`Queries.tsx`: reads `drafts/<path>` when the list says `draft`; save sends its revision; parameters sent as known (`...one`, only `$n` renamed); after Discard or Keep the screen reads the deployed text and the next save is a first draft; a removal draft opens read only. Server half of DAT-08 is the "revision for a draft that is gone" 409, tested in `authoring.test.ts`. Tests: `DraftBasis.test.tsx` (DAT-06/07 failed before; the DAT-08 screen test passes before and after, because the stale revision was never held on this path; the server test is the one that failed).

### FLW-09 A draft with one unfinished field is not saved at all
Server only: `kernel/authoring.ts` lets a `flow` draft hold a step with an unfinished field (any validation fault under `/nodes/<id>`) when the body is a flow's graph (`nodes` object, `edges` array); a body that is not a flow is still 400; a deploy of it is refused. Test: `authoring.test.ts` "a flow draft holds a step not yet finished, and a deploy refuses it". Left: the deploy's refusal is the manifest check's own text, and the 400 for a body that is not a flow still carries the whole `oneOf` list; reporting only the issues of the step type named by `type` (a discriminator in `validateManifest`) and the `problemsAt` additions belong to the flow lane and the manifest. The editor itself was not changed for this row.

## Tests changed

Helpers in `authoring.test.ts`, `docs-apps.test.ts` (table), `extensions.test.ts`, `interfaces.test.ts`, `page-actions.test.ts`, `release.test.ts` and `packages/cli/src/remote.test.ts` now save as an editor does, via `putSeen` in `apps/control-plane/src/testing.ts` (reads the revision, sends it). Run: control-plane draft-touching tests (authoring, flow-editor, extensions, interfaces, page-actions, release, docs-apps, and others) and the CLI `remote.test.ts`; console tests listed in the report. `docs-apps.test.ts` "is refused when a page takes one of the product's own terms" fails and does not touch drafts (a bundle deploy and the product's term list); not caused by this lane.

## Polish gate (screens to walk: 1440, 768, 390, light, dark, keyboard, reload)

Screens: App Builder list and builder, script editor, flow editor, a setting editor (schedule), Queries, docs editor.
- States: the clash notice (open one draft in two windows; save in one; type in the other), a removal opened in each editor, a discarded draft in Queries.
- Lifecycle: Keep this script / flow / query / app takes a removal back; Discard draft over a deployed app's edits.
- Keyboard: "Copy what I wrote" and "Load their version" are buttons in the notice; the confirm is the console's dialog.
- Copy: "Someone else saved this draft after you opened it."; no "simply/just".
- Not walked in a browser: this lane could not start a server.

## Left

- Flow canvas in the removal state is not frozen (nodes can still be moved, which marks it unsaved but is never saved).
- FLW-09 editor side (the "To fix" list, `problemsAt`, the `oneOf` dump).
- `e2e/polish-setup.ts` second runs.
- Lines for the docs: `docs/` app-builder-editor.md (BLD-13); the draft save contract in the API reference: "a save names the revision it saw, or `create`; otherwise 409 `draft_changed`".

## Found

- `docs-apps.test.ts` "is refused when a page takes one of the product's own terms" fails on this branch independent of drafts.
- A removal draft is saved with `body: {}`, so the draft endpoints and history hold no copy of the removed code; editors read the deployed resource for display.
- Process: one `git stash`/`pop` was used early in the lane and popped another lane's stash (see report).
