# Inventory: app builder

Read from the code at `270e509` on 2026-11-22. A report, not checked prose.

**Refreshed 2026-11-23** against the code on `phase-30-docs-system` (after phase 29). What changed in this brief:
- Section A: pages retyped with a collection and a Diátaxis type; added a tutorial, an explanation page and a "Take over a repository app" how-to; the sharing page is now "Apps" and shares its screen with `apps-as-code.md`.
- Section B: file:line citations moved (the code shifted); corrected the Make an app text (BLD-13), the read-only states (BLD-10, `ReadOnly.tsx`), name length 100 with a typed count (BLD-06/D52), Discard draft (BLD-09), the draft clash (BLD-01), the publish check for maintainers (BLD-02/03), Preview (BLD-04/05), Remove page (BLD-07), the drawer's phase 29 additions (WID-M1..M11, D21, D36, D37, D38), "Apps" in the navigation (VOC-56), "flow" for workflow (VOC-01..16), "Access changes" (VOC-52).
- Section C and E: gotchas that were bugs are now marked fixed or removed; E is settled with the outcome cited (every item 1-7 is fixed or dropped).
- Not verified: no browser walk was made (phase 29 lanes say the same); copy of widget drawers beyond what is listed was not re-read line by line; the exact line of PageView's "canvas never runs actions" is now at `PageView.tsx:720` by the `building` test only; `volvel dev` for interfaces (D64) is phase 30 and not in the code yet.
- Vocabulary: the builder's button is still **Publish** (VOC-55 kept it); "Deploy" appears in the commit message ("Deploy <title>") and in the check's sentence "Deploys to W".

**App Builder inventory (read-only; first read at 270e509, refreshed on phase-30-docs-system).** `B/` = `apps/console/src/screens/builder/`, `K/` = `apps/console/src/kit/inspector/`, `S/` = `packages/screens/src/`, `CP/` = `apps/control-plane/src/`. "Not run" = read in code or tests only, not exercised in a browser.

## A. Proposed pages (`packages/docs/content/build/`)

Only two help topics exist for the builder in the console: `build-screens` (`nav.ts:125`, the App Builder list) and `build-screens-editor` (`nav.ts:317`, every `screens/…` address, Preview included); the Apps screen is `build-apps` (`nav.ts:126`). New pages need topic-less links, or `help:` added in code. A page's `help` topic: a sheet's or modal's own topic is now served (BLD-11, `helpingPage` in `packages/screens/src/AppView.tsx`).

Collection is Console unless said. Existing pages are in `packages/docs/content/build/`: `app-builder.md`, `app-builder-editor.md`, `published-apps.md` (title now "Apps", VOC-56).

| # | Page | Collection, type | Purpose | Sources |
|---|---|---|---|---|
| 1 | `app-builder.md` (existing, `build-screens`) | Console, how-to | The list: make, rename, discard edits, remove an app | `screens/Interfaces.tsx:55-310`, `kit/RemoveDraftButton.tsx` |
| 2 | `app-builder-editor.md` (existing, `build-screens-editor`) | Console, reference | The workbench tour: header, panes, saving, shortcuts, read-only states, draft conflicts | `B/EditorShell.tsx`, `BuilderHeader.tsx`, `AppBuilder.tsx`, `ReadOnly.tsx`, `kit/DraftClash.tsx`, `kit/shortcuts.ts:80-84` |
| 3 | `app-builder-pages.md` (new) | Console, reference | Page kinds, settings, starters, sample record | `PagesList.tsx`, `PageSettings.tsx`, `pageKinds.ts`, `NewPageDialog.tsx`, `starters.ts` |
| 4 | `app-builder-layout.md` (new) | Console, how-to | Add to page, drag and size, Section, Tabs, Action group, outline, Layout panel | `AddToPage.tsx`, `selectorData.ts`, `K/LayoutPanel.tsx`, `containers.ts`, `S/placement.ts` |
| 5 | `app-builder-inspector.md` (new) | Console, reference | Drawer tabs, rules, row click, Add a form, data binding. Widget by widget goes to `widgets.md`'s pages | `K/Inspector.tsx`, `RulesTab.tsx`, `ActionsTab.tsx`, `actionModel.ts`, `RowClickEditor.tsx`, `AddFormDialog.tsx` |
| 6 | `app-builder-phone.md` (new) | Console, how-to | Device sizes, automatic and by hand | `PhoneFrame.tsx`, `S/narrow.ts`, `AppBuilder.tsx:287-296` |
| 7 | `app-builder-publish.md` (new) | Console, how-to + reference | View as, Preview, the check, publish, history, permissions, what a maintainer may do | `PublishCheck.tsx`, `publishCheck.ts`, `AppPreview.tsx`, `DraftHistory.tsx`, `CP/routes/authoring.ts:1017-1070` |
| 8 | `app-builder-repository-apps.md` (new, from D35) | Console, how-to | Open an app the repository manages: read only, **Take over**, what the next publish does | `AppBuilder.tsx:556-570`, `fixed/bldwid.md` BLD-10 |
| 9 | `app-builder-as-code.md` (new) | Develop, reference | Manifest, repository, limits; links to `apps-as-code.md`'s pages | `packages/widget-sdk/src/page.ts:181-186`, `packages/manifest/src/page.ts`, `packages/sdk/src/index.ts:1216,1271` |
| 10 | `published-apps.md` (existing, `build-apps`; title "Apps") | Console, reference + how-to | The Apps list: Open to, Share, search, Built filter, sort, Remove. Shared with `apps-as-code.md`; write it once | `screens/Apps.tsx`, `fixed/app.md` APP-03/12/14, `fixed/t3-config.md` APP-MP3 |
| 11 | `build-your-first-app.md` (new) | Get started, tutorial | Make an app over a Fernhill table: a list page, a record sheet, a button, View as, Publish. One working path in order | `starters.ts`, `records.ts`, `PublishCheck.tsx`; the example `examples/fernhill/` |
| 12 | `how-an-app-is-made.md` (new) | Console, explanation | What an app is (an interface and an app that serves it), a draft shared by the workspace, the revision rule, publish deploys only this interface and its app, dev versus production | `kernel/authoring.ts:292-300`, `fixed/draft.md`, section C below |

Deliberately not built, so say it is not there: the builder has no "who can open it" setting (sharing is in Apps, under Access); no per-app theme (Tenant Branding plus a `theme` resource); no Unpublish for a console-made app (the way out is Remove; only a docs app has `published`; asked, `fixed/t3-config.md` APP-MP3); the Form widget has no file upload (WID-10); a page has no filters, rules or visibility of its own; `volvel dev` does not yet draw interface apps (CLI-MP7; D64 settles it as phase 30 work).

## B. Per page

**1. List** (`screens/Interfaces.tsx`)
- Columns **App**, **Pages** ("reads …"), **State**, **Address**, then actions (`Interfaces.tsx:75-195`).
- State: **Published vN** (tooltip "Published means deployed here"), **Not published**, **Edits not published**, **Being removed**, "edited …".
- Address: the URL, "Once it is published" or "No app serves it".
- **Make an app**: **Name**, **Address** (filled from Name; lower-case, digits, dashes, 40 characters), **Make the app**. It saves an interface draft `screens/<slug>` and an app draft `<slug>`, then opens the builder (`Interfaces.tsx:215-310`). The dialog says: "It starts with one empty page. Other builders of this workspace see the draft; people who use the app see nothing until you publish it." (BLD-13). Name and Address show a typed count of 100 (`NAME_MAX`, `builder/names.ts`; BLD-06, D52). A taken address shows "Something already exists at this path…".
- **Rename**: **Save as a draft**, then the toast "Review and deploy". Off for `ownership: code`, with the reason.
- **Remove** / **Discard draft** / **Keep this app** (`kit/RemoveDraftButton.tsx`). A deployed app with edits gets **Discard draft** beside **Remove**, and Remove's text says the edits are replaced by the removal (BLD-09, `Interfaces.tsx:176-210`). Repository apps show "Managed in the repository: the app is removed there." (`RemoveDraftButton.tsx:73-76`).
- Production: "Apps are built in a dev workspace and promoted. Here they can be opened.", with no edit links (`Interfaces.tsx:62-66`). Empty: "No apps made here yet". The page's title is still **App Builder**; the navigation item that lists served apps is **Apps** (`nav.ts:126`; VOC-56), not "Published apps".
- Needs `resource:read` or `interface:read` (`CP/routes/interfaces.ts:100`). Make an app and the list's actions are open to `interface:write` alone, so an `app_maintainer` can use them (`Interfaces.tsx:42`; `fixed/gate-roles.md` row 3).

**2. Workbench** (`B/EditorShell.tsx`, `BuilderHeader.tsx`, `AppBuilder.tsx`)
- Header left: name, pencil **Rename the app**, pill "N draft changes" (opens the check; hidden on narrow screens), pill "N to fix" (popover "To fix before it can be published"), status ("Saving…", "Saved. Not published yet.", "Published.", "Not saved: …"; `EditorShell.tsx:27-28`, `AppBuilder.tsx:446`). The title field shows "n of 100" while renamed (BLD-06).
- Header right: **Desktop / Tablet / Phone**, **View as Me ▾**, Undo, Redo ("Undo moving Invoices"), **Preview**, **Publish** with the arrow "More ways to publish", **Hide pages and widgets**, **Hide the settings**. The folds are remembered.
- Narrow windows: **Pages and widgets** and Settings become sheets; Undo is under **⋯**.
- Left: **Pages** (+ = **Add a page**), **On this page**, **Add to page** `A`.
- Autosave 700 ms after the last change (`AppBuilder.tsx:196-213`). Undo: 100 steps (`HISTORY_LIMIT`, `kit/history.ts:4`), in memory, typing joined within 1 s.
- Leaving unsaved asks "A change is not saved yet." (`EditorShell.tsx:124`). The page is in the address as `?page=` (`AppBuilder.tsx:62,238`).
- **A draft is shared by the workspace's builders.** Every save names the revision it was based on. If someone else saved first, the builder shows the notice "Someone else saved this app after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." with **Copy what I wrote** and **Load their version** (asks "Load their version?"; `kit/DraftClash.tsx`), and saves nothing until one is chosen. The status reads "Not saved: …" (BLD-01, `fixed/draft.md`).
- A draft that removes the app opens as a removal: the deployed app, read only, a notice "This app is removed in your drafts…" and **Keep this app** (`AppBuilder.tsx:520-545`).
- No app: notice "No app serves this yet, so nobody can open it." with **Make an app for it** (`AppBuilder.tsx:592-630`).
- Shortcuts: `A`; ⌘/Ctrl+S; ⌘/Ctrl+Z; ⇧⌘Z or Ctrl+Y (`kit/shortcuts.ts:80-84`). On a focused widget: arrows, Shift+arrows, Delete, Ctrl/⌘+D, Esc (`S/PageView.tsx:1100-1128`, `S/placement.ts:629`). Outline: Alt+↑/↓. Device switch: arrows. Size handle: ←/→, Home, End. Single keys can be turned off in Keyboard shortcuts.
- Read only has three causes, each with its own line (`AppBuilder.tsx:122,552-570`):
  - Production, or no `resource:write` / `interface:write`: `B/ReadOnly.tsx` says "Read only: this is the production workspace. Apps are changed in a dev workspace and arrive here by promotion." or "Read only: you may look at this but not change it. Changing apps needs the resource:write or interface:write permission in this workspace." The deployed app is shown, with **Open the app**.
  - A repository app (`ownership: code`) with no draft (D35, BLD-10): "This app is managed in the repository, so it is shown as it is published and cannot be changed here…" with **Take over**. After Take over, or with a draft, the line says "The next publish moves it out of the repository, and changes made there no longer reach it."
  - A removal draft (above).

**3. Pages** (`B/PagesList.tsx`, `PageSettings.tsx`, `pageKinds.ts`, `NewPageDialog.tsx`, `starters.ts`)
- **Add a page**, "Start from": **A blank page**, **A list of Invoices**, **An Invoice record page**; **Table**, **Name of the page**, **Add the page**.
  - List makes a search (when there are text columns), a table, a detail sheet, and a "New …" button with its modal form. Existing sheets and forms are reused.
  - Record page adds up to 6 related tables (`starters.ts:45`, `MOST_RELATED`).
  - An empty plain page offers the last two; the empty page is replaced.
- Reorder by grip or arrows. Page **⋯ › Remove page** (confirmed; absent when it is the only page). If actions open that page, the question names them ("Mark paid, on Money") and has **Show it**; the publish check also fails them (BLD-07, `AppBuilder.tsx` `removePage`, `publishCheck.ts` `openersOf`). Page title fields show "n of 100".
- **Display** tab: **Page type** tiles **Page / Record page / Side sheet / Modal**; **Title in the app menu** or **Title**; **Icon** (plain pages); **Size** (sheet or modal); **Help topic** (document picker, **Change**, **Clear**).
- **Data** tab (record kinds only): **Table of its record**; modal may be "None: it opens on no record".
- Sizes: Small 480, Medium 720 (default), Large 960, Extra large 1200, Full.
- A page has no filters, rules or visibility of its own: filters are widgets; visibility is on widgets.
- Sample: "Preview of X for [record]", 25 offered (`SampleRecord.tsx:10`).
- Served addresses: `/<page>/<record>`, `?sheet=&record=`, `?modal=`, `tab.<widget>`, `f.<filter>` (`S/navigation.tsx`). A sheet's or modal's **Help topic** is now what the served Help panel follows while it is open (BLD-11). One menu page draws no tabs.

**4. Layout** (`B/AddToPage.tsx`, `selectorData.ts`, `S/placement.ts`, `K/LayoutPanel.tsx`, `containers.ts`)
- Groups: **Suggested for this page**, **Work with records**, **Understand data**, **Take action**, **Organize and explain**. Labs widgets wear "Labs"; others "<Pack> pack".
- Suggestions (`records.ts:741` `suggestionsFor`, named from the table and its columns): "Search <table>", "<Record> detail", "New <record> form", "<Action> button", "<Status> filter", "Group the buttons", "A section for the numbers"; Approvals is offered as a card when the workspace has a flow with an approval step and the page has none (`selectorData.ts:228`). The header reads "Suggested for <table>" (`AddToPage.tsx:317`).
- Enter places the highlighted tile; an exact title beats a suggestion (`AddToPage.tsx:281-291`). Drag-out is mouse or pen only, not touch (`AddToPage.tsx:176`), and not onto an empty page (`onCarry`).
- "Adds to **Section** (a Section or Tabs goes on the page)". Search and filter always goes at the top.
- Dragging: Esc cancels; containers open after 220 ms; hovering a tab's name opens it.
- **⋯**: **Layout**, **Duplicate**, **Move to…**, **Remove**. Duplicate and Remove take a container's contents.
- Layout: **On desktop** (Column, Row, Width, Height), **Smaller screens** (Tablet, Phone: Automatic or Custom), **On narrow screens** (Automatic / Keep / Full / Stack / Hide), **Priority**; frameless widgets also **Name in the outline**.
- Section: **Plain / Card**, **Can be collapsed**, **Starts folded**, **Holds**. Tabs: 1-8 tabs, names up to 40, **Opens first**, **Underline / Pills**, **Remember the last tab**; removing a filled tab offers **Move and remove the tab** or **Remove it with its widgets** (`K/widgets/tabsDrawer.tsx`).
- Widget choices phase 29 added to the drawers (see `widgets.md` for each): Goal is `core/goal` (D37, was `labs/goal`); an Action group's **Look** has **Line up** Left, Right, Spread; a chart has **Along the bottom** / **Up the side** and **Sorted by**, axis titles, **Add another measure** (up to six), scatter, a heatmap's Colors, **Legend**; a pivot has **Then by** and totals; a table column has **Drawn as** (bar or change); a Stat or chart has **Compare across**; a Form field has **Starts as** and a several-choice column is a list; Detail has **Who can edit** ("Only Billing can edit this."); a visual query has **Also from** (joins); numbers and dates follow the reader's locale and zone (D21, D38); a table's Download holds what is shown (D36).
- **Buttons together**: **Group with other buttons…**, **Move these buttons to an Action group above it** (max 8).

**5. Inspector** (`K/Inspector.tsx`, `RulesTab.tsx`, `ActionsTab.tsx`, `tabProblems.ts`)
- Tabs Data / Display / Actions / Rules (Text's is Content). A dot means "Needs fixing". **More … options**.
- Heading: Title 100, Caption 200; or click the title on the page.
- Rules: **Show this …** (Always / Only when…), **Who can see it** (+ Limit to a group), **Can be pressed when**, **Who can run it**, **Open row rules**, and for an editable Detail **Who can edit** (`RulesTab.tsx:382`). A condition can compare to "this record's …" or "the current user" (WID-M9); money works in "is between".
- **When a row is clicked**: Do nothing / Open record detail / Go to a page / Run an action; **Record detail**, **Edit its layout**, **Opens as** Side sheet / Full page / Modal (`B/RowClickEditor.tsx`). While Actions is open, the sheet is previewed over the canvas with **Edit layout** and a stepper.
- Steps (`K/actionModel.ts:72-81`): Update the record, Make a record, Remove the record, **Run a flow**, Run a script, Open a page, Close, Show a message, Filter the page, Show the rows behind; plus Ask to confirm. A dashboard offers Filter the page and Show the rows behind only where they do something (WID-12). An action can also say something when it is done (WID-M2, `actionControls.tsx`). A flow or script input is typed by its schema. The value picker keeps digits as text for a text column (WID-13). A guest cannot start a script or flow from an app (D39): say so in the app-client page.
- **Add a form** (`AddFormDialog.tsx`): Create / Edit, Table, Fields, **Opens as**, **After saving**, title (60), **Create form**; the footer says where its button goes.
- Text: double-click, or **Edit on the page**; **Done**, **Cancel**; leaving with changes asks **Keep writing / Discard** (`TextOnPage.tsx`).

**6. Phone** (`B/PhoneFrame.tsx`, `S/narrow.ts`)
- Tablet 768, Phone 390; only Phone gets a device frame. Banner with **All automatic**.
- First move asks "Change the phone layout by hand?", once per device per visit. On a phone a drag changes order only, not size.
- Served by room: phone under 42rem, tablet under 58rem (`PageView.tsx:186-188`). Hidden ones show "X is hidden on phones".

**7. Publish** (`B/PublishCheck.tsx`, `publishCheck.ts`, `AppPreview.tsx`, `DraftHistory.tsx`)
- Headings: "Checking before you publish", "Ready to publish", "Not ready to publish: N things to fix" (`PublishCheck.tsx:178-183`). Each row may have **Show it**. If the control plane refuses or fails the preview, the panel says why with **Check again** and Publish stays off; if the tables or groups cannot be read, it says "Could not check …" instead of calling them missing (BLD-03). The check opens for an `app_maintainer`: `changes/preview` and `group-keys` accept `interface:write` for the interfaces and apps named (BLD-02, `CP/routes/authoring.ts:1017-1070`). A refusal from the deploy about another resource is named ("boards/x (dashboard)", `refusalWords`).
- Fails: data sources not found; actions not complete (no steps, page gone, table, flow or script missing); buttons with no label; "form can't save"; anything save or deploy refuses.
- Warns: shows nothing yet (List, Pivot, Record detail); Approvals lists a flow with no approval; decided in the console; Phone layout hides N; Help topic no document has; groups no longer exist; deploy warnings.
- Passes: "All data sources found", "N actions are complete", "X form is valid" (`publishCheck.ts:207,243,310`). Fails also read "N of M actions are not complete", "N buttons with no label", "X form can't save".
- Then the change list, **Try as <group> first** (most-named group), **Publish N changes**. Success: "Published…" with **Open the app**.
- Arrow menu: **Publish**, **Open the published app**, **Restore an earlier draft** (30 kept; **Restore**, **Not now**).
- Preview: new tab, saves first, "Actions change <workspace>'s rows", device switch, **Close**. It draws as the person previewing, with their groups, so group-limited widgets show for members (BLD-04, `AppPreview.tsx:43`), and the published app is found by its interface, so **Open the published app** shows for apps made here (BLD-05, `AppPreview.tsx:42`).
- Sharing: Apps › **Share** (`screens/Apps.tsx:438-460`): Share with, They may Read / Read and change; also binds the app's tables. The Apps list has **Open to** (names groups of end users, service accounts, "(whole workspace)", "(whole tenant)", with a warning when anyone; APP-03, APP-14), a **Not published** tag with no link for an app switched off, **Find an app**, a **Built** filter, sortable columns, and Remove for apps made in the console (APP-MP3). **Stop sharing** keeps a table another shared app needs and says so (APP-12). Write the Apps page once, with `apps-as-code.md`. Theme: Tenant Branding plus a `theme` resource; nothing per app.
- Permissions: save and publish need `resource:write`/`deployment:write`, or `interface:write` (interfaces and their apps only: `CP/routes/authoring.ts:582,1113`); the check needs `deployment:read` or the same `interface:write`; open needs `app:read`.
- The commit message is "Deploy <title>" and the check says "Deploys to <workspace>. The live app keeps working until then." (VOC-49, VOC-55).

**8. As code**
- `<name>.interface.yaml` (schemaVersion 2) and `.app.yaml` with `interface:`; or `defineInterface` / `defineApp`. Examples: `examples/higher-ed-devices/platform/`, `examples/fernhill/src/operations.ts` (uses everything).
- Limits: 20 pages, 30 widgets a page, 8 filters, 12 columns, 400 rows, height 40, container depth 1, titles 100 (`packages/widget-sdk/src/page.ts:181-186`; the manifest's own schema in `packages/manifest/src/page.ts`; an app title and a page title are 100, D52). SQL sources are refused on apps (`packages/manifest/src/page.ts:1145`). A file of an app whose name starts with `.` or `_` is allowed (APP-05); files an app no longer names are removed a week after the deploy that stopped naming them (APP-17, D40).

## C. Gotchas

- Drafts belong to the workspace, not the person. Every save names the revision it saw; a stale or missing one is 409 `draft_changed`, and the builder shows the clash notice (BLD-01; `kernel/authoring.ts:292-300`). The old silent replace is gone. The Make an app text and the editor page must say other builders see and can change the draft.
- Publish deploys only this interface and its app, not drafted tables or scripts.
- The canvas never runs actions (`PageView.tsx:720`); Preview really does.
- View as changes drawing only: "Rows are yours" (`PhoneFrame.tsx:91`), and you can still edit. Widgets are faded "Hidden for …", not removed.
- Row actions are copied into the opened sheet's Record detail, up to 6 (`sheetActions.ts`).
- Removing a page that actions open now asks, naming them (BLD-07); the publish check still fails any left.
- Opening a repository app is read only until **Take over** (D35, BLD-10); the next publish moves it out of the repository. The old "drafts a take-over with no notice" is gone.
- Remove on an app with unpublished edits replaces that draft with a removal; **Discard draft** drops only the edits (BLD-09).
- A guest cannot start a script or flow from an app; forms still start them (D39, APP-02).
- Remove on a console-made app is deployed with the next release; the list still shows it until then (`fixed/t3-config.md`).

## D. Existing docs wrong, stale, missing

`app-builder-editor.md`:
- "History in the header" is in the Publish arrow menu (**Restore an earlier draft**).
- "the draft is only yours" is false (BLD-13; `fixed/draft.md` gives the replacement line). The Make an app dialog now says so.
- Groups "Organize" and "Content" are one, "Organize and explain"; Labs is a tag on widgets; Goal is `core/goal`, no longer a Labs widget (D37).
- "Can be folded" is **Can be collapsed**; "Move to" is **Move to…**; "+ Page" is **Add a page**; "Full width, Stack below or Hide" misses Automatic and Keep.
- "shown as tabs above the page … from the page's own menu" contradicts the next sentence; the builder has a left list.
- Tablet has no device frame. View as widgets are not "gone".
- Undo covers every change. "what the builder does not do yet" links to nothing.
- Publish list omits labels, empty widgets, Approvals, Help topics, deploy refusals; a lost group only warns. Text is listed twice.
- Words: "workflow" is "flow" (VOC-18, `fixed/voc-flow.md`: 5 places in `app-builder.md`, 2 in `app-builder-editor.md`); the first use links to Flows.
- A double-click to rename a tab does not exist; the words are gone from the product (BLD-08), so keep them out of the page.

`app-builder.md`:
- "The publish check lists the actions and the groups they name": it gives counts and only missing groups.
- Step names stale: "Add a row", "Narrow the page". "More" is now **⋯**. "Run a workflow" is **Run a flow**.
- "Published apps" is **Apps** (VOC-56; `fixed/voc-access.md` lists `build/index.md:30`, `build/published-apps.md` title, `build/app-builder.md:9`).

Missing: read-only, saving and conflicts, Preview, Remove/Discard, panes, shortcuts, sharing, theme, YAML, limits, permissions. `build/index.md` repeats the old editor summary. `published-apps.md` is a stub (the Apps screen has since gained search, filter, sort, Open to names, Not published; see `apps-as-code.md`). `docs/` text for `labs/goal` in `writing-a-widget.md` still names it (`fixed/bldwid.md` D37: for phase 31).

## E. Findings: settled

The old list of questions and likely bugs is all settled in phase 29; none stays as a gotcha. Where the outcome is:

1. `app_maintainer` could not publish: fixed. `changes/preview` and `group-keys` take `interface:write` for what is named; a refusal is written with **Check again** (BLD-02, BLD-03; `fixed/bldwid.md`; `fixed/t3-widgets.md` for the tables and groups read errors).
2. Preview drew with no user: fixed, it draws as the previewing person (BLD-04; `fixed/bldwid.md`).
3. "Open the published app" never showed: fixed, found by the interface (BLD-05).
4. Name length 200 against 100: fixed, 100 everywhere with a typed count (BLD-06, D52; `fixed/bldwid.md`, `fixed/sweep-console.md`).
5. Tab rename by double-click: not built; the words are dropped (BLD-08).
6. A deployed app's edits could not be discarded from the list: fixed, **Discard draft** (BLD-09; `fixed/draft.md`).
7. A sheet's or modal's Help topic never shown: fixed (BLD-11).
Also fixed and no longer gotchas: a bare save replacing a draft (BLD-01), a repository app drafting a take-over silently (BLD-10, D35), the misleading "Nobody else sees it" (BLD-13).

Left, from `remaining.md` and `outcomes.md`, and to say plainly in the pages: the builder header's typed count is on the rename field, not the bare inline title; `PageEditor` and `NewPageDialog` now say tables could not be read; WID-27 (a Goal is a pressable bar, its height fixed in `fix-final.md`), WID-28 (Legend "Always" and "Automatic" wording, a heatmap's Colors), WID-29, WID-30 (Action group's 3x3 position picker beside Line up), and WID-31 were reported in `outcomes.md` as not done as written or not traced: re-read the drawer before writing about them. Unpublish for a console-made app is not built (needs a new field on the app kind).

## F. Screenshots

1. Workbench at 1440 with a table selected
2. Make an app dialog
3. Add to page with suggestions
4. Add a page, "A list of Invoices"
5. Page settings, Side sheet
6. Sheet on canvas with size handle and "Drawn at N %"
7. Row click with sheet preview
8. Rules tab with groups
9. Layout panel
10. Phone frame with banner and hidden placeholder
11. Ready to publish, and Not ready
12. Restore an earlier draft
13. Preview tab
14. Read-only line
15. Share sheet

Fernhill's Clinic operations suits most of them.
