# Phase 14: design-system consistency and information architecture (UI/UX audit P2)

Status: built, all thirteen milestones, on branch `phase-14-uiux-p2`, off `phase-13-uiux-p1`. Not pushed.
Last updated: 2026-11-16

The UI/UX audit ranks thirteen items as P2 in [09-prioritized-uiux-roadmap.md](../uiux/09-prioritized-uiux-roadmap.md). Phase 13 already built two of them: P2-2, one `DataTable` for every list, and P2-6, URL state on every screen. This phase does the other eleven. Each was re-checked against `phase-13-uiux-p1`.

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Tokens (P2-1) | About 194 arbitrary type sizes, 46 hard-coded 4 px corners, unnamed shadows and z-index values | No spacing, elevation, layer, icon or motion tokens; nine type roles |
| Page headers (P2-3) | Eight header variants and seven kinds of back link. The shell names the section only to screen readers | Each screen draws its own |
| Load states (P2-4) | 40 bare "Loading…" lines. 82 error notices without Try again. Request IDs dropped. A proxy's HTML 502 breaks the client | No shared load state; `ApiError` keeps no request ID |
| Status (P2-5) | About 33 Badges show lifecycle state. Canceled and skipped share an icon. Five local state maps | No domain states in the one map |
| Forms (P2-7) | Field errors aren't linked to their fields. No required marks. Pages mix save models. Large configuration lives in modals. A mistyped secret name makes a new secret | Fields render errors as loose text; no SaveBar or SecretField |
| Feedback (P2-8) | About 90–100 of 170 writes confirm nothing. Pause and resume wait for the server | No toast title or link; no Button loading state |
| Data grid (P2-9) | Every cell is a tab stop. No sticky header, batch delete or CSV. Offset paging shifts | `Grid` predates the grid pattern |
| App Builder and Dashboards (P2-10) | One 2,118-line file. The canvas sits under 200 px of chrome. No undo. The device preview doesn't narrow the layout. Dashboards save differently | Two shells around one editor; viewport breakpoints in the renderer |
| Admin (P2-11) | Giving access starts from a role, not a person. A service account is spread over two pages. Audit search sees only loaded rows | No principal search; audit filters too narrow |
| Enforcement (P2-12) | Screenshots are taken but never compared. No axe. One lint rule | — |
| First run (P2-13) | An operator can't see inside the tenant they just made. A new workspace says "Nothing needs you here". Never-deployed scripts are missing from the scripts list | Grant-only access; no checklist; scripts route ignores drafts |

**Exit criterion:** the Acceptance rows of P2-1, 3, 4, 5, 7, 8, 9, 10, 11, 12 and 13 in the roadmap pass.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-14-uiux-p2`, with thirteen milestones built one after another, one commit each |
| Tokens and tenant apps | They move together. The kit's new defaults reach tenant apps; a screenshot baseline is taken first, so each visible change is a reviewed diff. The changelog says what moved |
| Tenant creator | Creating a tenant offers "Make me a member, as tenant admin", checked by default |
| Docs and hints | Out of scope: no "Learn more" links, new concept hints or just-in-time help. A later phase does documentation. Empty states offer the console action only |
| Dashboards | Autosave like apps, with a visible Saved state and undo and redo. Sharing is the dashboard's publishing step |

## Milestones

| # | Milestone | Audit |
| --- | --- | --- |
| 0 | Branch and this document | |
| 1 | Baselines: compared screenshots of the console and tenant apps, axe | P2-12 |
| 2 | Token foundation v2, and the call sites moved onto it | P2-1 |
| 3 | Status system | P2-5 |
| 4 | LoadState and request IDs | P2-4 |
| 5 | One PageHeader and a breadcrumb | P2-3 |
| 6 | Feedback: Toast v2, Button loading, every write confirms, optimistic pause | P2-8 |
| 7 | Forms: linked errors, required marks, SecretField, one save model per page, configuration out of modals | P2-7 |
| 8 | Data grid | P2-9 |
| 9 | App Builder and Dashboards: split, one editor shell, undo and redo, publish summary, container queries | P2-10 |
| 10 | Admin: give access from the person, one service-account page, audit search | P2-11 |
| 11 | First run and empty states | P2-13 |
| 12 | Enforcement rules, axe everywhere, keyboard journeys, kit sheet | P2-12 |
| 13 | Changelog, docs, the whole e2e suite | |

Findings are recorded under each milestone as it lands.

## Findings

### Milestone 1: baselines before anything moves

- **Compared pictures.** `e2e/redesign.spec.ts` compares every console screen with a reviewed picture (`toHaveScreenshot`), at three widths and in both themes: 90 pictures. The new `e2e/tenant-apps.spec.ts` does the same for an app the platform serves to a tenant's people, built through the API and shared anonymously: 6 pictures. They live in `e2e/snapshots/`.
- **What is masked.** Times, IDs, values set in mono and anything marked `data-volatile`. The spec's product and tenant names are now fixed, so they no longer carry the run's stamp. Before each picture the mouse is parked and the page settles: the first stability run caught a hover and a button mid-load. Two compare runs in a row then passed unchanged.
- **Not compared.** Screens that list the whole instance (tenants, audit, workers, API keys) change with every other spec, so they are checked for fit and axe only.
- **Fixed in passing.** The spec's "data" screen was a 404; it is now `tables`.
- **axe**, run with `@axe-core/playwright` on desktop/light screens and in the kit's component tests (`axe-core`), fails on serious and critical problems. Colour contrast is left to the token contrast test. It found two:
  - The "promotes to" link, added in phase 13, sat in muted text marked only by colour. It is now underlined.
  - A widget's scrolling body in served apps couldn't be reached by keyboard. It now takes focus, with a ring.
- **CI.** The pictures were made on this machine's Linux Chromium with its system fonts. If CI's runner draws text differently, its first run will show it, and its `actual` pictures (kept in the uploaded results) become the baseline.

### Milestone 2: token foundation v2

- **Tokens** (`packages/ui/src/tokens.css`): eleven type roles from 07 §7.3, `rounded-inner` and `rounded-overlay`, panels at 8 px, three shadows (overlay, modal, drag) deeper in dark, six layer utilities, three motion durations, a prose measure and a control height. Brand tokens are unchanged apart from the panel radius. The values a brand doesn't set (shadow depth, control height) live on `html`, apart from the `:root` blocks, so Branding's copy of the brand tokens and its test still match.
- **Density.** A control's height is one variable, `--vx-control-height`: 36 px in tenant apps, and the console sets 32 px for itself in `styles.css`. Buttons, inputs, selects and the combobox read it as `h-control`, so no call site passes a size for the common case.
- **Migration.** A codemod (token-boundary matches inside string literals, prefix-aware) moved about 450 values across 89 files of the console, the kit and the renderer:
  - type: 147 arbitrary 13 px values, 39 of 12 and 12.5 px, and the rest;
  - 28 hard-coded small corners;
  - 10 shadows and 9 z-index values;
  - 37 retired spacing steps;
  - 24 prose widths onto one measure;
  - 57 icon sizes onto 12, 14, 16 and 20.

  The stroke is set once, by a `LucideProvider` at the console's root. The examples are tenant code and keep plain Tailwind. A few local `z-10` values stay, where they stack siblings inside a canvas or chart.
- **Found on the way.**
  - The first codemod run collapsed runs of spaces inside every template literal, which would have flattened the indentation of the script starters. It was reverted and rerun so that it changes only the classes it replaces.
  - `biome --write` on a file that didn't parse stripped JSX braces (`items={[` became `items=[`). They were restored by hand.
  - Tailwind's preflight already zeroes margins, so the base reset 07 asks for exists. The 294 `m-0` are redundant but harmless.
- **Pictures.** 92 of the 96 changed, all as intended: 20 px titles, 32 px controls, 8 px corners, 12 px meta and lighter icons. The served app changed only in line heights and corners. Two compare runs then passed unchanged. `snap` now asserts softly, so one run reports every screen that differs.

### Milestone 3: status system

- **One map** (`kit/status.tsx`). `STATES` holds every state the console shows, from 08 §3.11–3.12:
  - run states;
  - waiting, approved and declined;
  - lifecycle: not saved, draft, unsaved changes, deployed, from the repository, retired, older version;
  - a branch against the workspace: not pushed, in sync, ahead, behind, conflict, last sync failed;
  - availability: active, invited, suspended, disabled, revoked, expired, ended;
  - a switch: on, off, paused;
  - health: OK, reachable or not, not checked, verified or not, bound or not, not connected, posted or not, allowed or denied;
  - notes.
  
  Each state has one word, icon and tone, and `State` is derived from the map, so a missing one fails to compile.
- **Run states, corrected:**
  - Canceled has `CircleSlash`, distinct from Skipped.
  - Running is a `LoaderCircle` that turns slowly, the one looping mark, and not under reduced motion.
  - A run or step waiting for a time reads "Waiting until {time}" when the console has the time.
  - A value the console doesn't know shows as the server wrote it, not as "Unknown".
  - The duplicate `cancelled` key is gone.
- **Replaced:**
  - The five local maps (`Authoring` ×2, `ResourceEditor`, `FlowEditor`, `Git`).
  - About 45 state `Badge`s. `Badge` stays only for counts ("+3 more") and in the branding preview of tenant components.
  - 16 `StatePill`s whose state contradicted its words: `failed` for "No", `running` for "Listening" and "Triggers are running", `paused` for "Suspended", `ok` for "Active", `queued` for "not checked yet".
  - Five `Tag tone="production"` that didn't mean production: workspace paused is a state, and an operator's action is a new `attention` tag.
  - A resource's kind, a flow node's type and an audit verb are `Tag`s, since they are fixed when made. "End users can hold it" and a dashboard's audience are plain text.
- **Runs filters.** "Waiting for approval" and "Waiting for a time" are separate chips. The server already took both states. `?status=waiting` from older links still works.
- **Server.** Activity rows have `wakeAt`: the earliest waiting step's time, so the list can say until when.
- **Found.** Milestone 2 broke `apps.test.ts`, which reads the kit's stylesheet by position and keeps the server's own copy of the brand values. Only the console's tests ran for that commit. Here, the non-brand block moved after `@theme inline` and the server's panel radius became 8 px. The whole suite has run since, as the plan says.
- **Test.** `kit/status.test.tsx` is table-driven, asserting word, icon and tone for each state. It also checks that canceled and skipped differ, that no two run states share a mark, that an unknown value shows verbatim, and "Waiting until".

### Milestone 4: load states and request IDs

- **The client** (`api.ts`). `ApiError` keeps `requestId`, from the problem document or the `x-request-id` header. An answer that isn't JSON, such as a proxy's HTML 502, becomes an `ApiError` (`unreadable_response`) that says the server couldn't be reached, with its status and request ID. Before, it was a `SyntaxError` with no message a person could act on. Uploads read answers the same way. `failureText`, and with it every error toast and dialog error, ends with "Request ID …".
- **`kit/LoadState.tsx`** has four parts:
  - `LoadState` covers one read: nothing for 300 ms, then a skeleton; the error with Try again and the request ID (with Copy); the empty state; and the content, marked `aria-busy` while it is asked again.
  - `ErrorState` is the error alone.
  - `Pending` is for a screen that has nothing yet: the error, or the delayed skeleton.
  - `Loading` is the delayed skeleton alone.
- **Lists.** `DataTable` shows `ErrorState`, with the request ID, both in place of rows and under them, and holds back its skeleton for 300 ms. `CollectionView` passes `onRetry`. All 18 list callers now hand over the error itself, with their `reload`, so every list has Try again.
- **Adopted** by a codemod:
  - Nine `if (!x.data) return "Loading…"` became `Pending`. Each of those had shown "Loading…" for ever when its read failed.
  - 31 other "Loading…" paragraphs became `Loading`.
  - 38 error notices on a read became `ErrorState` with Try again.
  - Six screens that drew nothing while loading now show the delayed skeleton.
  
  Notices about a write that failed (`problem`, 23 of them) stay, for Milestone 7 to place beside their fields. "Loading…" inside a control, such as Load more, stays too.
- **Rule.** `enforce.test.ts` fails on "Loading…" in a paragraph, panel or div of its own.
- **Tests.** An HTML 502 becomes an `ApiError` with its status and request ID. A problem document's request ID is kept. `LoadState` shows nothing at first and then a skeleton, an error with Try again and the ID, the empty state, and `aria-busy` while it refreshes.
- **Pictures.** None changed: they are taken of settled screens.

### Milestone 5: one page header and a breadcrumb

- **`kit/PageHeader.tsx`** has three forms.
  - **List or working screen:** title, count, description, actions and a toolbar.
  - **Object:** kind above, the name (mono for a path or ID) with its state beside it, actions and a line of facts.
  - **Compact:** one row for editors. The name and state give way before the actions, so the row stays one row.
  
  Overviews use the larger `display-lg`. `Page`, `CollectionView`, `ObjectPage`, the run header (script and flow runs), the runs list, the script, resource and flow editors, the App Builder, the dashboard view and editor, and the SSO provider detail all use it. The editors' "name a new one" field sits under the heading, which reads "New script", "New flow" and so on.
- **Breadcrumb.** The shell's "Where you are" ends with the section and what is open in it, in a list, with `aria-current="page"` on the last crumb. The section was readable only by screen readers before. It links back to its list when something is open, and on a phone it gives way to the object. What is open comes from the title store, or from the address for editors.
- **Back links removed:**
  - "All scripts" and "All extensions" (script editor);
  - "All resources";
  - "Flows /" (flow editor);
  - "All flows" and "Edit this flow" (Edit is now an action);
  - "All dashboards";
  - "All apps made here";
  - "All tables";
  - "Runs ›" (run page; the run ID stays above the title, copyable);
  - `ObjectPage`'s back nav.
  
  SSO's "All providers" stays until Milestone 10 puts the provider in the address, so the breadcrumb can lead back.
- **Found.** The editable dashboard and the App Builder had no `h1` at all, only a name field, so focus on opening had nowhere to land. They now have one.
- **Rule.** `enforce.test.ts` fails on an `h1` outside `PageHeader`, except on sign-in and the approval link.
- **Checks.** The whole e2e suite ran. `loop.spec.ts` caught the runs header wrapping to two rows at 1440 px (19 rows in view, not 20); the compact form's fix brought it back. `script-editor.spec.ts` now leaves the editor by the breadcrumb.

### Milestone 6: feedback

- **Toast v2** (`packages/ui/src/Toast.tsx`):
  - an optional `title`;
  - a `link` to the result, which the console follows through its router (`ToastProvider navigate`);
  - an `info` tone;
  - an icon for each tone;
  - at most three on screen, with the rest waiting their turn, their time starting when shown;
  - Esc dismisses the one with focus;
  - a 24 px dismiss target with an icon in place of "×".
  
  `notify` gains `info`, and `success` and `error` take the options.
- **`Button loading`** shows a spinner beside the label, which stays, with `aria-busy`, and can't be pressed twice. 38 primary buttons that used `disabled={busy}` moved to it. Secondary buttons that share a `busy` stay disabled, so one press doesn't set several spinners going.
- **Writes say what they did.** A scan found 58 writes with no confirmation nearby. Those whose result is already on screen (a list that shows the new item, an editor's save state, a closed dialog) were left. These now say what they did, naming it:
  - `CreateDialog` says "Created." by default, and takes `done` to name the result and link to it. A new workspace and a new tenant link to themselves.
  - A secret set or replaced, a role saved, a service account's description.
  - Group membership in and out.
  - Promotes to, a workspace's triggers paused and resumed, an end user enabled and disabled.
  - Sign-up on and off, a row added, a version activated, managed workers, the Git branch.
  - An SSO domain added, a provider link untied, a provisioning token revoked, a draft restored.
  - An approval decided, with a link to its run, and a run being canceled.
- **Optimistic pause.** `useCacheEdit` (`api.ts`) changes a read in the cache at once and gives back an undo. Pausing or resuming a trigger, in Operate's inspector or on a script's or flow's page, shows at once, says so, and goes back if the server refuses.
- **Found in the full suite.**
  - The pictures depended on the live indicator ("Live" or "Connecting…" while other specs load the server). It is now `data-volatile`, and volatile marks are hidden by `e2e/screenshot.css` rather than masked, since a mask's box changes with the text.
  - At tablet width every crumb was truncated. The tenant name and the Paused mark now wait for `lg`.
- **Tests.** `Toast.test.tsx` covers a title and a link that routes, three on screen with the fourth waiting, Esc, and a loading button. The new `e2e/feedback.spec.ts` sets a secret twice, resumes and pauses triggers, and makes a workspace. Each is answered within 1 s, and the new workspace's link opens it. The whole e2e suite passed: 25 tests.

### Milestone 7: forms

- **One field frame** (`FieldFrame` in `packages/ui/src/Fields.tsx`):
  - The label, the hint and the error are tied to the control by Base UI's `Field.Description` and `Field.Error`, through `aria-describedby`.
  - The hint stays beside an error; before, the error replaced it.
  - An invalid control has a danger edge.
  - `required` shows `*` and `required={false}` shows "optional". Both are visual only, and sit beside the label rather than in it, so accessible names stay the label; the control's own `required` is what is announced.
  - `ComboboxField` uses the frame too, in place of its own loose error.
  - The first attempt put the marks in the label, which changed every accessible name ("Email*", "Note optional") and broke label lookups across the suite.
- **When and by whom a credential was set.** Migration 0064 adds `credential_set_at`, `credential_set_by_type` and `credential_set_by_id` to the five tables that hold a sealed credential. A trigger stamps them when the sealed value changes, so every write path is covered without touching the five kernel functions. Who comes from `vx.actor_type`/`vx.actor_id`, which `mutate` sets locally at the start of each change's transaction. A row that brings its own stamp keeps it: the portability test caught an imported tenant's credentials being re-stamped with the importer. `credentialSetters` resolves names in one query per kind, and the five responses carry `credentialSetAt` and `credentialSetBy`. Secrets already reported both, from the audit log.
- **`SecretField`** (`kit/SecretField.tsx`) shows "Stored · set 3 days ago by …" and Replace, and never shows the value. A new value is typed only after Replace, so "leave it empty to keep the stored one" is gone. The connection wizard, Git settings, the SSO client secret and a secret's own page use it.
- **Secrets.** "Set secret" is now "New secret". It posts to a new `POST secrets`, which refuses a name in use, so a mistyped name no longer makes a second secret quietly. A secret's page has a Value tab to replace it.
- **One save model per page.**
  - `kit/SaveBar.tsx` appears at the foot once something differs, with Discard and Save. It guards leaving, through phase 12's navigation guard, and saves with ⌘S.
  - Tenant branding (the sign-up switch, the theme) and instance branding (the name, the theme) each had two or three ways of saving. Each is now one draft saved together, and "Reset" clears the draft rather than saving at once.
  - Workspace settings: where it promotes to and the time zone are saved together. Pausing, cloning and deleting stay actions that work at once, and the page's description says which is which.
  - Logo uploads stay immediate, and say so beside the input.
  - Roles, retention, Git and provisioning were already one form with one Save each.
- **Configuration out of modals.**
  - `CreateDialog` opens as a side sheet, with its buttons kept in view, when it has more than three fields: connecting a database (8), a connection group member (6) and creating a workspace (4).
  - Connecting an identity provider, cloning a workspace, adding a hostname and the role editor are side sheets now.
  - The connection wizard and "Add column" already were.
- **Tests:**
  - The kit's axe test checks that a field's error and hint are both in its `aria-describedby`, alongside `aria-invalid` and the marks.
  - `connections.test.ts` checks that the stamp follows the credential and survives a save without one.
  - `kernel.test.ts` covers the new secret route's 409.
  - `feedback.spec.ts` makes a secret, is refused the same name, and replaces the value on the secret's page.
  - The whole suite (1,326 tests) and the whole e2e suite (25) passed.

### Milestone 8: data grid

- **`Grid navigation="grid"`** (`packages/ui/src/Grid.tsx`) follows the WAI-ARIA grid pattern:
  - one tab stop, moved by roving `tabindex`;
  - arrows, Home and End (with Ctrl, the grid's corners), and Page Up and Down by ten rows;
  - Enter or F2 to edit; Escape puts the value back and keeps focus on the cell; Enter in the field saves;
  - Space checks a row, and Enter on a heading sorts by it;
  - a sticky header, a pinned first column, `density`, and a checkbox column.
  
  `EditableCell` can be driven by the grid. A ref stops the blur that follows Escape from saving what was typed. Without the prop, the grid is unchanged, so the tenant `table` widget is untouched: tenant apps move with the tokens, not with this interaction.
- **Virtualisation** isn't built. The grid holds one page of 50 rows, so a window over it would add code and save nothing. Keyset paging is what keeps deep tables fast.
- **The table browser** (`Data.tsx`):
  - Sort, filters (debounced 300 ms), page, hidden columns, density and the chosen row live in the address.
  - The row inspector is docked and non-modal, and edits a row's values together, in place of the read-only modal sheet.
  - Checkboxes with a batch bar delete several rows at once, and CSV exports what the filters and sort show.
  - The double push on Next is gone: one step forward is one address change.
  - Batch delete and CSV apply only to the platform's own tables. A data source's rows path has no `/rows/` to swap, and a batch delete there would have reached the insert route.
- **Server:**
  - Keyset paging in `findRows` applies when the table has a key and the sort is one column or none. A page starts after the last row's sort value and key, with nulls last. The cursor is `{"after": [...]}`, base64url; offset cursors still work and remain for multi-column sorts. `data.test.ts` adds a row before the next page, down the sort and with no sort, and the two pages share no row.
  - `POST row-deletions/*` deletes up to 1,000 keys in one statement, under the table's policy, and reports `deleted` and `missing`. Like single-row deletes, it is data-plane and writes no audit entry; the plan had said one entry, and keeping one rule for row writes won.
  - `GET rows-export/*` streams CSV through the same filter, sort and policy, up to 100,000 rows. It quotes what needs quoting and defuses formulas with an apostrophe.
- **Tests:**
  - The grid's keyboard model, in `Grid.test.tsx`: one tab stop, arrows, Enter and F2, Escape restoring, Space, and Enter on a heading.
  - Keyset paging, batch delete and CSV, in `data.test.ts`.
  - The new `e2e/data-grid.spec.ts`: 10,000 rows, five pages with no row twice and the grid not moving, axe, and a cell reached, changed, put back and saved from the keyboard alone.
- **Pictures.** Times are hidden in a box of one width (`screenshot.css`) rather than masked. A grant's expiry of a different length had reflowed the rest of the operator banner.

### Milestone 9: App Builder and Dashboards

- **Split first, alone** (commit 8baf996). `screens/Interfaces.tsx` (2,118 lines) became the list (197 lines) and `screens/builder/`: `data.ts`, `links.ts`, `Format.tsx`, `WidgetSettings.tsx`, `PageEditor.tsx`, `PageFilters.tsx` and `AppBuilder.tsx`. Nothing changed in behaviour, and all 285 console tests passed unchanged. `WidgetSettings` is still one 800-line file: splitting it by widget type is a refactor this milestone didn't need, and it is left for when it is next changed.
- **One `EditorShell`** (`builder/EditorShell.tsx`) is around both editors:
  - one toolbar with the name, the save state, undo and redo with what they would undo, and the step that makes it reach people (Publish for an app, Share for a dashboard);
  - what is on the page, and what can be added, on the left;
  - the canvas in the middle;
  - the chosen widget's settings on the right, in a `SplitPane` whose divider can be dragged or moved with the keys.
  
  The shell guards leaving while a change is unsaved, and handles ⌘Z and ⇧⌘Z outside fields. At 1440 × 900 the canvas takes 60% or more of the work area; e2e measures it. Dashboards count as editors now, so they get the whole width.
- **Undo and redo** use phase 13's `useHistory`, recorded at each editor's single change funnel, with a label ("Undo adding text") and a key, so typing in one field is one step. Removing a widget is an ordinary step, and its toast's Undo is the editor's undo.
- **Dashboards autosave** as apps do: debounced, with the revision, and with the shell's saving, saved and failed states. Sharing (everyone, or groups) is the Share step, in a dialog, and takes effect at once. Delete moved into a More menu. A dashboard offers no Form or Action widget: it is for looking, and writes and starts nothing.
- **The publish dialog** (`builder/PublishDialog.tsx`) shows, before anything is done:
  - the deploy preview (`GET changes/preview?paths=`), with a refusal if there is one;
  - a widget-by-widget comparison with what people see now: added, changed, removed;
  - who it reaches, from the app's bindings.
  
  The success toast links to the app.
- **The device preview narrows the layout.** The renderer's grid lays out by its container (`@container`, `@2xl:`, 672 px) instead of the window, so the 390 px preview stacks as a phone does. The first try used `@3xl` (768 px). The tenant-app pictures caught that the served app, inside its page's padding at a 768 px window, fell back to one column. `@2xl` brought every served picture back to its baseline.
- **Keyboard move and resize.** The chosen widget's Editing button takes arrow keys to move it a cell, and Shift and arrows to change its size, with `aria-keyshortcuts`.
- **Tests:**
  - The renderer's keyboard move and resize.
  - The dashboard saving by itself, undo saving again at the next revision, Share as a step, and no Form or Action.
  - The builder tests go through the publish dialog.
  - In e2e: the canvas's share at 1440 × 900, the phone preview stacking, and axe on the App Builder. `exit-criterion.spec.ts` publishes through the dialog.
  - The whole e2e suite passed: 26 tests.

### Milestone 10: admin information architecture

- **Giving access starts from the person** (`screens/GiveAccess.tsx`). A side sheet finds who by name or email through `GET principals?q=` (members, groups, service accounts, end users, groups of end users, and "every end user"), then where (the tenant or a workspace), then the role from those that can be held there. A workspace's own roles are offered once that workspace is chosen. `ComboboxField` gained `onSearch`, for lists the server searches, which turns off narrowing in the browser.
- **Adding a member ends with the same step.** "Add member" offers where and a role, sent as `bindings` on `POST members` and made in the member's own transaction through `insertBinding`, which is extracted from the bindings route and shared. A role that can't be held there undoes the whole change, so there is no member without the access they were meant to have; `kernel.test.ts` checks this.
- **One service-account page.** `/service-accounts/:id` is an `ObjectPage` with tabs: Identity (what it is for), Keys, Access (with Give access already pointed at the account) and Agent tools, plus Delete. The list leads to it, and a new account opens on its Keys tab. The list's inspector, and the page of three unrelated sections, are gone.
- **In the address.** The SSO provider open (`?provider=`) and the hostname open (`?hostname=`), each keeping the server's fresher copy after a change. The SSO "All providers" button went with that: the breadcrumb's section link leads back.
- **Worker pools** are a `DataTable`: state first, then pool, workspaces and credentials, with Remove in the row's menu.
- **Audit search is the server's:**
  - Server: `auditSelect` is shared by the page, a single entry, the facets and the export. Filters are action, area, actor, target, target type, workspace, text and time, all within retention. Target names are resolved by kind (member, workspace, tenant, end user, service account, group, role, identity provider, hostname), and migration 0065 indexes the log by actor and by target.
  - Console: who, the action and the kind of target are chosen from the facets, with counts. Every filter and the open entry are in the address, and the search is debounced and sent to the server. Targets show by name and link where they have a page. An entry linked to is fetched when it isn't loaded, there is a "Copy a link to it" button, and a CSV of the same filters.
  - The kind chips counted loaded rows only, so they are gone.
- **Tests:**
  - `kernel.test.ts` covers target type, workspace and text, target names, one entry and 404, facets, CSV, principal search, and a member added with access or refused as a whole.
  - `Audit.test.tsx` covers server-side filters chosen from facets, server search, and opening a linked entry that isn't loaded.
  - `TenantScreens.test.tsx` covers the service account page's tabs, and giving access with workspace roles only where they apply.
  - Typing into the server-searched combobox couldn't be driven under happy-dom, since Base UI doesn't report the input there. Milestone 12's "give access" journey does it in a browser.
  - The whole suite (1,335 tests) and the whole e2e suite (26) passed.

### Milestone 11: first run and empty states

- **The tenant's creator can be its first member.** `POST /tenants` takes `addCreator`, which adds the creating member to `tenant_member` and binds `tenant_admin` through `insertBinding`, in the tenant's own transaction and log. The console's create dialog offers "Make me a member, as tenant admin", checked by default, through a new `checkbox` field type in `CreateDialog`, and then opens the new tenant. In e2e there is no access-grant banner inside it.
- **First steps.** A new workspace's overview shows a checklist from real state:
  - a worker, or the instance starting them;
  - a first script, deployed or in draft;
  - a first run;
  - a first deploy.
  
  Each step leads to where it is done, and they tick themselves off as the summary is asked again. The summary gains `scripts`, `flows`, `everRan` and `workersOnline`.
  
  The checklist is its own section, above "Needs attention". A new dev workspace always has one attention item (its triggers start paused), so the first try, which showed the checklist only when nothing needed attention, never showed it at all. On a new workspace "Nothing needs you here" no longer appears.
- **Starters** (`screens/starters.ts`):
  - Three scripts: greet someone, total some numbers, a job on a schedule.
  - Two flows: started by hand, and a branch that decides and sets a result.
  
  "Start from" offers them on a new script and a new flow, while the code or the flow is still as given. A unit test runs the manifest's own `checkFlow` over each flow starter. That test caught a first version using a respond step (which answers a webhook) after a manual trigger, and wrong case names.
  
  The e2e walk caught that ⌘↵ runs with no input before the form has filled in its defaults, and zod's `.default` isn't applied at runtime, so the totals starter failed. A starter now falls back to its example itself.
- **Drafts in the scripts list.** The scripts route merges `resource_draft`: each script has `draft` and `deployed`, and a script only drafted is listed from its draft. The list shows "Draft" or "Draft, never deployed", with a "Drafted" filter. The command palette's /run keeps to deployed scripts, since a draft can't be started.
- **Empty states offer the page's action.** `CollectionView` puts its actions in an empty list when the empty state has none, as `ListScreen` already did. CLI blocks and documentation links wait for the documentation phase. Search boxes no longer say "optional".
- **Tests:**
  - `first-run.test.ts` covers the creator as member and admin, audited; an operator without it getting not-found; the summary's new fields; and a drafted script in the list.
  - `starters.test.ts` covers flow starters passing `checkFlow` and script starters running with no input.
  - The new `e2e/first-run.spec.ts` walks the console's create dialog, the checklist with axe, and a first successful run from a starter in 5 presses (the limit is 12), then the checklist advancing and the draft listed.
  - The whole suite (1,339 tests) and the whole e2e suite (27) passed.

### Milestone 12: enforcement, axe everywhere, keyboard journeys, the kit sheet

- **Rules** (`enforce.test.ts`, run by `pnpm test` in CI). They read the console, `packages/ui` and `packages/screens`, and fail on:
  - a hand-written type size, corner, shadow or layer;
  - a retired spacing step;
  - a `Badge` that says a state;
  - a raw `<table>`, an `h1` outside `PageHeader`, and a bare "Loading…" (from earlier milestones).
  
  A value that must be its own says why on the line before (`token-allowed:`, `badge-allowed:`). The only one so far is the branding preview's tenant `Badge`. Every rule started as an error, because Milestones 2–5 had already moved the code. They are test assertions rather than Biome GritQL plugins: they are plain regular expressions with a written exception, which a test holds as reliably and reports with the file and line.
- **axe in every e2e spec.** The eight specs without it check a settled screen: the runs list, a failed flow run, the script editor with a run, a run's log, the flow editor, the approval page on a phone, a promoted release, the published App Builder and a new workspace. `expectNoAxeViolations` waits for a closing dialog's transition (Milestone 2's motion) to finish first: a dialog leaving the page had no name for 240 ms, and axe found it.
- **Keyboard journeys.** The new `e2e/keyboard.spec.ts`:
  - opens a failed run from the runs list by Tab, arrows and Enter;
  - gives access by Tab to "Give access", typing a name, which the server searches (what happy-dom couldn't drive in Milestone 10), Enter to choose, typing the workspace, an arrow for the role, and Enter.
  
  Building a flow, fixing and deploying, and editing a row already have keyboard walks in `flow-editor`, `loop` and `data-grid`.
- **The kit sheet** (`/instance/kit`) shows, in light and dark, in a full-height picture compared on every change, with axe:
  - every state of the one map, an unknown one and "Waiting until";
  - every tag tone and a count badge;
  - buttons in every variant, size and state;
  - fields required, optional, with a hint, with an error, a choice, a searchable choice, a checkbox and a stored secret;
  - every notice, the error state with its request ID, and a skeleton;
  - a list at both densities, the keyboard grid with a checked row, and the save bar (`guard={false}`, so an example doesn't hold the page).
  
  The console scrolls inside its main region, so the window is made as tall as the sheet for its picture.
- **What CI fails on:** a hand-written size and the rest above, a raw table (`pnpm test`); a contrast regression (`packages/ui` contrast test); an axe violation or an unreviewed visual change (`pnpm e2e`). The whole e2e suite passed: 29 tests.

### Milestone 13: wrap-up

- **The changelog** lists, for operators: migrations 0064 (when and by whom credentials were set) and 0065 (audit search indexes), the new audit, people, rows and secrets API, and adding the creator to a new tenant. For tenant developers it lists the tokens and what moved, Toast v2, `Button loading`, fields, `Grid navigation="grid"` and container-query layout in served apps.
- **`master-spec.md`** now says that an operator may make themselves the first member of a tenant they create. That was the owner's decision for this phase, and the one exception to "only through an access grant". It is audited in the tenant's own log.
- **Checks on the last commit:**
  - `pnpm test`: 1,339 tests.
  - Lint, typecheck, `check:schemas`, `check:migrations` (65 files) and `check:licenses`.
  - The whole e2e suite: 29 tests, with 98 compared pictures and axe in every spec.

## Exit criterion

| Item | Met by |
| --- | --- |
| P2-1 tokens | Milestone 2: type roles, corners, elevation, layers, motion, measure and density, with about 450 values moved. Milestone 12's rule keeps them |
| P2-3 page headers | Milestone 5: one `PageHeader`, a visible breadcrumb, the back links removed; the h1 rule |
| P2-4 load states | Milestone 4: `LoadState`, `ErrorState`, `Pending`, `Loading`, request IDs, readable 502s, Try again on every list; the "Loading…" rule |
| P2-5 status | Milestone 3: one map of states, badges and misused pills replaced; the Badge rule |
| P2-7 forms | Milestone 7: linked errors, required and optional marks, `SecretField` with when and by whom, one save model per page, configuration in side sheets |
| P2-8 feedback | Milestone 6: Toast v2, `Button loading`, every write confirmed (e2e within 1 s), optimistic pause |
| P2-9 data grid | Milestone 8: the WAI-ARIA grid, keyset paging, batch delete, CSV; 10,000 rows walked |
| P2-10 builder and dashboards | Milestone 9: the split, one editor shell, undo and redo, dashboards autosave, publish summary, container queries, keyboard move |
| P2-11 admin | Milestone 10: give access from the person, one service-account page, details in the address, worker pools in a table, server-side audit search with facets, permalinks and CSV |
| P2-12 enforcement | Milestones 1 and 12: compared pictures, axe everywhere, rules, keyboard journeys, the kit sheet |
| P2-13 first run | Milestone 11: the creator as member, first steps, starters, drafts listed, empty states with actions; a first run in 5 presses. Documentation, hints and just-in-time help are a later phase, as decided |

**What is left, and why:**
- **`WidgetSettings`** is one 800-line file. It wasn't split by widget type, since no behaviour needed it.
- **The grid isn't virtualised.** Pages are 50 rows, and keyset paging keeps deep tables fast.
- **Batch row deletes write no audit entry.** Single row deletes don't either, and row writes are the tenant's data.
- **CI's first run** may draw text differently from this machine's Chromium. If so, its `actual` pictures, kept in the uploaded results, become the baseline (see Milestone 1).
