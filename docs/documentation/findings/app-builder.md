# Findings: App Builder editor

Slice inventory: [app-builder.md](../inventory/app-builder.md). Settled at `270e509`. Scratch vitest run in the pinned tree (a test tenant with a tenant admin and two `app_maintainer` members in a dev workspace); the scratch file is removed. Nothing in the browser was run, and no existing decision in `docs/phases/` or `docs/evolution/decisions/` covers any row.

### BLD-01 A save with no revision replaces another person's draft
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `apps/control-plane/src/kernel/authoring.ts:244-253` (only `doc` requires a revision; an interface save without one skips the check); `apps/console/src/screens/builder/AppBuilder.tsx:147-165` (revision is sent only when one is held), `:309` (cleared after publish).
- **Evidence:** member A saves a draft (revision 1); member B saves the same path with no revision: 200, revision 2, A's body gone (kept only in the 30-step history). A's next save with revision 1 gets 409 `draft_changed`. The builder holds no revision when it opens with no draft, and just after a publish, so both windows are open to it. Two people opening a never-edited app is common.
- **Fix:** the server, shared piece: require `revision` for every kind unless `create: true` (the `doc` rule, widened), so a bare save over a draft is `draft_changed`. Siblings with the same call shape: `RemoveDraftButton` (PUT removal, no revision), `RenameApp` (`Interfaces.tsx:~330`, sends it only when a draft exists), Make an app. Test first: two clients, second save without revision expects 409.
- **Size:** S. **Milestone:** M2

### BLD-02 `app_maintainer` cannot use the publish check
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `routes/authoring.ts:939-941` (`changes/preview` needs `deployment:read`), `:828-830` (`group-keys` needs `resource:read`); role in `packages/db/migrations/0026_app_maintainer.sql` (has `interface:*`, neither); `PublishCheck.tsx:75-119, 160-170`.
- **Evidence:** as the maintainer: draft save 200, `changes/preview` 403 "needs the deployment:read permission", `group-keys` 403, but `changes/deploy` 201. So the primary Publish opens a check that stays on "Checking what publishing does…" (the error is not read); only the arrow's direct Publish works. View as offers only Me and Rules show no groups.
- **Fix:** the server: let `interface:write` read the preview for interface and app paths and `group-keys` (the way `drafts` accepts it, `routes/authoring.ts:254-258`); or add the two reads to the role by migration. Console: show the error when the preview is refused, instead of waiting. Test first: maintainer gets 200 on both.
- **Size:** S. **Milestone:** M5

### BLD-03 The publish check says nothing when the preview is refused
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `PublishCheck.tsx:75-77, 116-119, 166-170` (no use of `preview.error`).
- **Evidence:** `asked` is `preview.data`; on a 403 or 5xx `ready` never becomes true. Same fault for any role lacking `deployment:read`, not only BLD-02.
- **Fix:** show `preview.error` with a retry in the check; sibling: `useGroupKeys` and `useCatalog` also swallow errors.
- **Size:** S. **Milestone:** M5

### BLD-04 Preview draws as no user
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `AppPreview.tsx:111` (`user={undefined}`); the served app builds `user` from the principal (`packages/screens/runtime/main.tsx:213-222`).
- **Evidence:** `AppView` takes `user: ActingUser | undefined` and a rule naming a group needs it; with none, `seenBy` widgets are hidden and `runBy` actions greyed, even for a member of the group. The preview says "drawn as people will use it".
- **Fix:** build `user` in `AppPreview` as the served app does (same helper, lift it from `runtime/main.tsx` into `@volvel/screens`); the builder's View as stays the way to see another group. Test: preview with a group-limited widget shows it for a member.
- **Size:** S. **Milestone:** M5

### BLD-05 "Open the published app" never shows for apps made in the builder
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `AppPreview.tsx:38` finds the app by `one.path === path`, where `path` is the interface's (`screens/<slug>`); apps made here have path `<slug>` (`Interfaces.tsx:211`). The builder itself maps interface to app (`AppBuilder.tsx:228`).
- **Evidence:** the two paths differ by construction. The test mocks matching ones.
- **Fix:** look the app up by `interface` field or reuse the builder's `listed.app`. Test with real paths.
- **Size:** S. **Milestone:** M5

### BLD-06 Names over 100 characters: the fields allow 200, the interface allows 100
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `BuilderHeader.tsx:47`, `Interfaces.tsx:237, 373`, `PageSettings.tsx:149`, `NewPageDialog.tsx:133` (all `maxLength={200}`); `packages/manifest/src/page.ts:397,501,545` (100); app kind `kinds.ts:1308` (200).
- **Evidence:** interface draft with a 101-character title: 400 `validation_failed` "The manifest is not valid". The app draft with the same title: 200. In the builder a long page or app name makes the autosave fail ("Not saved: …"), the invalid text stays in the editor, and every later edit fails until it is shortened. Make an app fails cleanly (interface first, app not made). Rename saves both in one batch, so it is refused whole: no half rename.
- **Fix:** one shared name length (100) on the five fields, with the same count shown; sibling widget title (100) and subtitle (200) in the inspector. Test: typing past 100 stops. The app kind may stay 200, but then Rename should say so.
- **Size:** S. **Milestone:** M5

### BLD-07 Removing a page that actions point at: no warning, and the draft keeps the dangling step
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `AppBuilder.tsx:357-372` (confirm says only "Its widgets go with it"); `publishCheck.ts:88-90`.
- **Evidence:** a draft with a button whose step opens page `two` (absent) saves 200; the check marks it "it opens a page that is gone"; direct deploy as the maintainer is refused 400 "The bundle's manifests are not valid". So nothing reaches people: the harm is a late surprise, and the builder's own text "Nothing in any table is touched" omits it.
- **Fix:** at removal, list the widgets whose actions open the page (the check's walk, `publishCheck.ts:60-70`) and name them in the confirm, with Show it; the row-click "Go to a page" editor shares it. Test: remove page with a pointing action shows its name.
- **Size:** M. **Milestone:** M5

### BLD-08 Tab rename by double-click does not exist
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `apps/console/src/kit/inspector/widgets/tabsDrawer.tsx:110` says "or by double-clicking it"; the only `onDoubleClick` on the canvas is for Text (`PageView.tsx:636`).
- **Fix:** drop the words, or build it (missing part, S).
- **Size:** S. **Milestone:** M5

### BLD-09 Remove on a deployed app with unpublished edits replaces them; they cannot be discarded from the list
- **Outcome:** confirmed by code
- **Severity:** data
- **Where:** `Interfaces.tsx:159-165` (`state` is `deployed` whenever it is deployed, edits or not); `RemoveDraftButton.tsx:100-110` (PUT removal, no revision).
- **Evidence:** the button is **Remove**, whose text says "Nothing changes until that draft is deployed" and does not say the edits are replaced. The earlier draft goes only to the history (30 kept, builder's Restore, which a removed app's builder cannot reach). "Discard draft" shows only for never-deployed apps. This is inventory E6; the edits are recoverable from history only.
- **Fix:** when a draft exists over a deployed app, offer **Discard edits** as well, and say it in Remove's text. Sibling: every `RemoveDraftButton` user (tables, scripts, dashboards).
- **Size:** S. **Milestone:** M2

### BLD-10 Editing a repository app drafts a take-over with no notice
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** save returns `takesOver` (`authoring.ts:~290`); `AppBuilder.tsx:147-165` ignores it. The list says "Managed in the repository" and blocks rename and remove, but the builder opens.
- **Fix:** read `takesOver` and say once, in the header, that the next deploy moves it out of the repository; or open such an app read only. Test: save on a code app shows the line.
- **Size:** S. **Milestone:** M5 (owner question 1)

### BLD-11 A sheet's or modal's Help topic is never shown in the served app
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `packages/screens/runtime/main.tsx:207-209` (`open` is the menu page only); the builder offers Help topic for a sheet or modal (`PageSettings`).
- **Fix:** either read the topic of the open sheet or modal too, or hide the control for those kinds. Sibling: Preview shares `AppView`.
- **Size:** S. **Milestone:** M5

### BLD-12 Making an app is not atomic in the other direction
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** `Interfaces.tsx:196-225`. The interface draft is made first, and removed if the app's address is taken. If the removal itself fails the interface draft is left; a retry then says "taken" for it. Rare; left alone. (The 101-character case fails before either exists.)
- **Size:** S. **Milestone:** M5

### BLD-13 "The draft is only yours" and "Nobody else sees it until you publish" are untrue
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `Interfaces.tsx:189`; `docs/` `app-builder-editor.md`. Drafts belong to the workspace (BLD-01); other builders see and replace it.
- **Fix:** say "Other builders of this workspace see it", and fix with BLD-01.
- **Size:** S. **Milestone:** M2

### BLD-14 Inventory claims that stand, and ones that do not
- **Outcome:** not a bug
- **Severity:** rough
- Preview does save first and does run actions (by design, `AppPreview` says so). The canvas not running actions is by design. Row actions copied to a sheet (up to 6) are by design. The deploy of only an interface and its app (not drafted tables) is by design. The docs mismatches in section D are the documentation task, not code faults. Publish "Nothing has changed" when no draft waits is correct.
- **Size:** S. **Milestone:** M5

## Missing parts

1. **App and interface description.** The manifest takes `description` (500) on both the interface (`manifest/src/page.ts:545-553`) and the app (`kinds.ts:1309`); the builder has no field, Rename keeps it only as it was written in code. Belongs in a "About this app" block of the Rename dialog and the header menu. Siblings: dashboards (description 500). Needs `interface:write`. Size S.
2. **Tab rename by double-click** (BLD-08), only if kept. Size S.
3. **Discard edits** over a deployed app (BLD-09). Size S.

No other manifest setting of the interface body is missing: page `help`, `icon`, `size`, `record` and widget `in` are all settable.

## Owner decides

1. A repository app opened in the builder: take it over silently as now, notice it, or open it read only? Recommend read only with a "Take over" button, since the take-over is a one-way move.
2. Should a name be 100 or 200 characters for the app kind? Recommend 100 everywhere, so the app and the interface cannot differ.
