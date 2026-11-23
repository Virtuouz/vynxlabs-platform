# Inventory: app builder

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

**App Builder inventory (read-only, HEAD 270e509).** `B/` = `apps/console/src/screens/builder/`, `K/` = `apps/console/src/kit/inspector/`, `S/` = `packages/screens/src/`, `CP/` = `apps/control-plane/src/`. "Not run" = read in code or tests only, not exercised in a browser.

## A. Proposed pages (`packages/docs/content/build/`)

Only two topics exist in the console: `build-screens` (nav.ts:114) and `build-screens-editor` (nav.ts:297, every `screens/…` address, Preview included). New pages need topic-less links, or `help:` added in code.

1. `app-builder.md` (existing, `build-screens`): the list, making, renaming, removing; what an app is
2. `app-builder-editor.md` (existing, `build-screens-editor`): the workbench tour, saving, shortcuts; links on
3. `app-builder-pages.md` (new): page kinds, settings, starters, sample record
4. `app-builder-layout.md` (new): Add to page, drag and size, Section, Tabs, Action group, outline, Layout panel
5. `app-builder-inspector.md` (new): drawer tabs, rules, row click, Add a form, data binding
6. `app-builder-phone.md` (new): device sizes, automatic and by hand
7. `app-builder-publish.md` (new): View as, Preview, check, publish, history, permissions
8. `app-builder-as-code.md` (new): manifest, repository, limits
9. `published-apps.md` (stub, `build-apps`): sharing. The builder has no "who can open" setting.

## B. Per page

**1. List** (`screens/Interfaces.tsx`)
- Columns **App**, **Pages** ("reads …"), **State**, **Address**, then actions (66-175).
- State: **Published vN**, **Not published**, **Edits not published**, **Being removed**, "edited …".
- Address: the URL, "Once it is published" or "No app serves it".
- **Make an app**: **Name**, **Address** (filled from Name; lower-case, digits, dashes, 40 characters), **Make the app**. It saves an interface draft `screens/<slug>` and an app draft `<slug>`, then opens the builder (193-230). A taken address shows "Something already exists at this path…".
- **Rename**: **Save as a draft**, then the toast "Review and deploy". Off for `ownership: code`, with the reason.
- **Remove** / **Discard draft** / **Keep this app** (`kit/RemoveDraftButton.tsx`). Repository apps show "Managed in the repository…".
- Production: "Apps are built in a dev workspace and promoted…", with no edit links. Empty: "No apps made here yet".
- Needs `resource:read` or `interface:read` (CP/routes/interfaces.ts:96).

**2. Workbench** (`B/EditorShell.tsx`, `BuilderHeader.tsx`, `AppBuilder.tsx`)
- Header left: name, pencil **Rename the app**, pill "N draft changes" (opens the check), pill "N to fix" (popover "To fix before it can be published"), status ("Saving…", "Saved. Not published yet.", "Published.", "Not saved: …").
- Header right: **Desktop / Tablet / Phone**, **View as Me ▾**, Undo, Redo ("Undo moving Invoices"), **Preview**, **Publish** with the arrow "More ways to publish", **Hide pages and widgets**, **Hide the settings**. The folds are remembered.
- Narrow windows: **Pages and widgets** and Settings become sheets; Undo is under **⋯**.
- Left: **Pages** (+ = **Add a page**), **On this page**, **Add to page** `A`.
- Autosave 700 ms after the last change (AppBuilder 174-190). Undo: 100 steps, in memory, typing joined within 1 s (`kit/history.ts`).
- Leaving unsaved asks "A change is not saved yet." The page is in the address as `?page=`.
- No app: notice "No app serves this yet…" with **Make an app for it** (484-523).
- Shortcuts: `A`; ⌘/Ctrl+S; ⌘/Ctrl+Z; ⇧⌘Z or Ctrl+Y (`kit/shortcuts.ts:80-84`). On a focused widget: arrows, Shift+arrows, Delete, Ctrl/⌘+D, Esc (S/PageView.tsx:1094-1120). Outline: Alt+↑/↓. Device switch: arrows. Size handle: ←/→, Home, End. Single keys can be turned off in Keyboard shortcuts.
- Read only (`B/ReadOnly.tsx`): production, or neither `resource:write` nor `interface:write`. It shows the deployed app and **Open the app**.

**3. Pages** (`B/PagesList.tsx`, `PageSettings.tsx`, `pageKinds.ts`, `NewPageDialog.tsx`, `starters.ts`)
- **Add a page**, "Start from": **A blank page**, **A list of Invoices**, **An Invoice record page**; **Table**, **Name of the page**, **Add the page**.
  - List makes a search (when there are text columns), a table, a detail sheet, and a "New …" button with its modal form. Existing sheets and forms are reused.
  - Record page adds up to 6 related tables (starters.ts:46).
  - An empty plain page offers the last two; the empty page is replaced.
- Reorder by grip or arrows. Page **⋯ › Remove page** (confirmed; absent when it is the only page).
- **Display** tab: **Page type** tiles **Page / Record page / Side sheet / Modal**; **Title in the app menu** or **Title**; **Icon** (plain pages); **Size** (sheet or modal); **Help topic** (document picker, **Change**, **Clear**).
- **Data** tab (record kinds only): **Table of its record**; modal may be "None: it opens on no record".
- Sizes: Small 480, Medium 720 (default), Large 960, Extra large 1200, Full.
- A page has no filters, rules or visibility of its own: filters are widgets; visibility is on widgets.
- Sample: "Preview of X for [record]", 25 offered (`SampleRecord.tsx:29`).
- Served addresses: `/<page>/<record>`, `?sheet=&record=`, `?modal=`, `tab.<widget>`, `f.<filter>` (S/navigation.tsx). One menu page draws no tabs.

**4. Layout** (`B/AddToPage.tsx`, `selectorData.ts`, `S/placement.ts`, `K/LayoutPanel.tsx`, `containers.ts`)
- Groups: **Suggested for this page**, **Work with records**, **Understand data**, **Take action**, **Organize and explain**. Labs widgets wear "Labs"; others "<Pack> pack".
- Suggestions (`records.ts` `suggestionsFor`): Search invoices, Invoice detail, New invoice form, Mark paid button, Status filter, Group the buttons, A section for the numbers, Approvals.
- Enter places the highlighted tile; an exact title beats a suggestion (281-296). Drag-out is mouse or pen only, not touch, and not onto an empty page (`onCarry`).
- "Adds to **Section** (a Section or Tabs goes on the page)". Search and filter always goes at the top.
- Dragging: Esc cancels; containers open after 220 ms; hovering a tab's name opens it.
- **⋯**: **Layout**, **Duplicate**, **Move to…**, **Remove**. Duplicate and Remove take a container's contents.
- Layout: **On desktop** (Column, Row, Width, Height), **Smaller screens** (Tablet, Phone: Automatic or Custom), **On narrow screens** (Automatic / Keep / Full / Stack / Hide), **Priority**; frameless widgets also **Name in the outline**.
- Section: **Plain / Card**, **Can be collapsed**, **Starts folded**, **Holds**. Tabs: 1-8 tabs, names up to 40, **Opens first**, **Underline / Pills**, **Remember the last tab**; removing a filled tab offers **Move and remove the tab** or **Remove it with its widgets** (`K/widgets/tabsDrawer.tsx`).
- **Buttons together**: **Group with other buttons…**, **Move these buttons to an Action group above it** (max 8).

**5. Inspector** (`K/Inspector.tsx`, `RulesTab.tsx`, `ActionsTab.tsx`, `tabProblems.ts`)
- Tabs Data / Display / Actions / Rules (Text's is Content). A dot means "Needs fixing". **More … options**.
- Heading: Title 100, Caption 200; or click the title on the page.
- Rules: **Show this …** (Always / Only when…), **Who can see it** (+ Limit to a group), **Can be pressed when**, **Who can run it**, **Open row rules**.
- **When a row is clicked**: Do nothing / Open record detail / Go to a page / Run an action; **Record detail**, **Edit its layout**, **Opens as** Side sheet / Full page / Modal (`B/RowClickEditor.tsx`). While Actions is open, the sheet is previewed over the canvas with **Edit layout** and a stepper.
- Steps (`K/actionModel.ts:70-79`): Update the record, Make a record, Remove the record, Run a workflow, Run a script, Open a page, Close, Show a message, Filter the page, Show the rows behind; plus Ask to confirm.
- **Add a form** (`AddFormDialog.tsx`): Create / Edit, Table, Fields, **Opens as**, **After saving**, title (60), **Create form**; the footer says where its button goes.
- Text: double-click, or **Edit on the page**; **Done**, **Cancel**; leaving with changes asks **Keep writing / Discard** (`TextOnPage.tsx`).

**6. Phone** (`B/PhoneFrame.tsx`, `S/narrow.ts`)
- Tablet 768, Phone 390; only Phone gets a device frame. Banner with **All automatic**.
- First move asks "Change the phone layout by hand?", once per device per visit. On a phone a drag changes order only, not size.
- Served by room: phone under 42rem, tablet under 58rem (PageView 186-188). Hidden ones show "X is hidden on phones".

**7. Publish** (`B/PublishCheck.tsx`, `publishCheck.ts`, `AppPreview.tsx`, `DraftHistory.tsx`)
- Headings: "Checking before you publish", "Ready to publish", "Not ready to publish: N things to fix". Each row may have **Show it**.
- Fails: data sources not found; actions not complete (no steps, page gone, table, workflow or script missing); buttons with no label; "form can't save"; anything save or deploy refuses.
- Warns: shows nothing yet (List, Pivot, Record detail); Approvals lists a workflow with no approval; decided in the console; Phone layout hides N; Help topic no document has; groups no longer exist; deploy warnings.
- Passes: "All data sources found", "N actions are complete", "X form is valid".
- Then the change list, **Try as <group> first** (most-named group), **Publish N changes**. Success: "Published…" with **Open the app**.
- Arrow menu: **Publish**, **Open the published app**, **Restore an earlier draft** (30 kept; **Restore**, **Not now**).
- Preview: new tab, saves first, "Actions change <workspace>'s rows", device switch, **Close**.
- Sharing: Published apps › **Share** (`screens/Apps.tsx`): Share with, They may Read / Read and change; also binds the app's tables. Theme: Tenant Branding plus a `theme` resource; nothing per app.
- Permissions: save and publish need `resource:write`/`deployment:write`, or `interface:write` (interfaces and their apps only); open needs `app:read`.

**8. As code**
- `<name>.interface.yaml` (schemaVersion 2) and `.app.yaml` with `interface:`; or `defineInterface` / `defineApp`. Examples: `examples/higher-ed-devices/platform/`, `examples/fernhill/src/operations.ts` (uses everything).
- Limits: 20 pages, 30 widgets a page, 8 filters, 12 columns, 400 rows, height 40, container depth 1, titles 100 (`packages/widget-sdk/src/page.ts:181-186`, manifest `page.ts`). SQL sources are refused on apps.

## C. Gotchas

- Drafts belong to the workspace, not the person. A stale revision gives 409 `draft_changed`, "Someone else saved this draft…"; reload. But a save with no revision (builder opened with no draft, or just after publishing) silently replaces another's draft (CP/kernel/authoring.ts:230-247).
- Publish deploys only this interface and its app, not drafted tables or scripts.
- The canvas never runs actions (PageView 720); Preview really does.
- View as changes drawing only: "Rows are yours", and you can still edit. Widgets are faded "Hidden for …", not removed.
- Row actions are copied into the opened sheet's Record detail, up to 6 (`sheetActions.ts`).
- Removing a page leaves actions pointing at it; the check fails them.
- Saving an edit to a repository app drafts a take-over, with no notice in the builder.
- Remove on an app with unpublished edits replaces that draft with a removal.

## D. Existing docs wrong, stale, missing

`app-builder-editor.md`:
- "History in the header" is in the Publish arrow menu.
- "the draft is only yours" is false. The Make an app dialog's "Nobody else sees it until you publish it" also misleads.
- Groups "Organize" and "Content" are one, "Organize and explain"; Labs/Goal missing.
- "Can be folded" is **Can be collapsed**; "Move to" is **Move to…**; "+ Page" is **Add a page**; "Full width, Stack below or Hide" misses Automatic and Keep.
- "shown as tabs above the page … from the page's own menu" contradicts the next sentence; the builder has a left list.
- Tablet has no device frame. View as widgets are not "gone".
- Undo covers every change. "what the builder does not do yet" links to nothing.
- Publish list omits labels, empty widgets, Approvals, Help topics, deploy refusals; a lost group only warns. Text is listed twice.

`app-builder.md`:
- "The publish check lists the actions and the groups they name": it gives counts and only missing groups.
- Step names stale: "Add a row", "Narrow the page". "More" is now **⋯**.

Missing: read-only, saving and conflicts, Preview, Remove/Discard, panes, shortcuts, sharing, theme, YAML, limits, permissions. `build/index.md` repeats the old editor summary. `published-apps.md` is a stub.

## E. Questions and likely bugs (not run)

1. **`app_maintainer` probably cannot publish from the builder.** The role (migrations 0026, 0028) lacks `deployment:read`, which `/changes/preview` needs (CP/routes/authoring.ts:939); `PublishCheck` ignores the error and stays at "Checking what publishing does…". `group-keys` needs `resource:read`, so View as has only Me and Rules says the tenant has no groups.
2. Preview passes `user={undefined}` (AppPreview:111): group-limited widgets vanish and limited actions are greyed, even for members.
3. Preview compares an app path with the interface path (AppPreview:38), so "Open the published app" never shows for apps made here. The test mocks matching paths.
4. Name and title fields allow 200; the schema allows 100 for both app and page, so 101+ should be refused ("Not saved…").
5. "Rename … by double-clicking it" (tabsDrawer:110): no handler found in the views or canvas.
6. A deployed app's edits cannot be discarded from the list; presumably Releases. Intended?
7. A record page's/sheet's Help: served Help follows the page on screen only (runtime/main.tsx:209), so a sheet's or modal's topic is never shown.

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
