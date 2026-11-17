# Phase 14: design-system consistency and information architecture (UI/UX audit P2)

Status: Milestones 0–7 built, on branch `phase-14-uiux-p2`, off `phase-13-uiux-p1`.
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
