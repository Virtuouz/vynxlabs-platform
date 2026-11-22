# Phase 28: the builder looks and works as the boards draw it, on a phone too, and is published after a check

Status: in progress, on branch `phase-28-the-boards`, off `phase-27-composition` at `922bc9e`.
Last updated: 2026-11-22

The roadmap's last phase:
- a phone layout made without work;
- publishing after a readiness check;
- "View as" a group;
- restoring an earlier draft.

It also does what phases 25 to 27 missed. The six boards in `temp/Volvel App Builder redesign.html` are the visual bar for the builder, not a description of its functions. Those phases built what the boards do, and drew it with the console's components as they were, so the builder doesn't look like the boards. The owner, 2026-11-22: the UI is half of every enhancement, and the console's components are to change until they meet the boards, not be used to approximate them.

The owner replaced the file on 2026-11-22 with nineteen boards. Boards 7 to 19 draw the widget selector, the parts every inspector shares, and each widget's inspector. The boards are rendered to pictures for the walk (`board-1.png` … `board-19.png`, made from the HTML at 1440 × 1000). Each item below is an acceptance criterion, checked by putting the board and the console side by side at 1440 in light and dark. 768 and 390 are designed in the boards' spirit.

## What the boards draw that the console doesn't (the gap, 2026-11-22)

### Throughout (every board)

- **Type.** The boards are set in Geist, with Geist Mono for record numbers ("INV-9338") and sizes ("8 × 5 · col 1 · row 3"). The console uses the system font. Geist becomes the console's default face; instance branding may still change it.
- **Density and surfaces.** Controls are 36 px. Panels are separated by hairlines, with no outer margins. Selects show their label inside ("Clinic All", "Issued Last 30 days"). Icon tiles head each inspector and list item. Dashed boxes mark "add" places.
- **Selection.** A selected widget has an accent ring, the title edited in place in a chip, the drag handle centred on the top edge, and the size chip under its bottom edge.

### Board 1: the builder's frame and the inspector

- **One header row.** It holds the app's name, with a pencil to rename it in place (no "Name of the app" field), and a "3 draft changes" pill. In the same row: the Desktop · Tablet · Phone switch, "View as Me", undo and redo, Preview, and Publish as a split button. The device switch and the "Buttons and row actions don't run…" line are no longer over the canvas.
- **Left pane.**
  - "PAGES" with a "+" in its heading. Each page is one row: icon, title, and its kind at the right.
  - "ON THIS PAGE": rows with a drag handle and the widget's type icon, nested under their containers.
  - "Add to page" is a full-width outlined button showing its key, A.
  - A hint at the foot of the pane.
- **The canvas.**
  - A framed surface with the twelve column guides drawn behind the widgets.
  - The filter bar's controls are compact, each label inside its select.
  - A table says what a row click does in its own heading ("Click opens Invoice detail"), and statuses are chips with a dot.
- **The inspector.**
  - A header with the widget's icon tile, its name and kind, and ⋯.
  - The tabs are a segmented bar with counts.
  - Source is a select with the table's icon.
  - "Follows the page filters: Search, Clinic, Issued, Status. Change" is one line.
  - Value reads "Sum ▾ of Total ▾" on one row, and Break down by "Issued on ▾ Weekly ▾".
  - "Only include" is a dashed "+ Add a condition".
  - "More data options" is a disclosure with a summary: "Sort, empty values, limit".
  - The layout hint is pinned at the foot.

### Board 2: Add to page

- **A panel, not a centred dialog.** It drops from the top of the canvas, under a search that asks "What do you want people to do here?".
- **Suggestions are chips** in a tinted block: "This page shows Invoices. Common next steps: Invoice detail · New invoice form · Mark paid button · Status filter".
- **The widgets are in two columns** of categories, each with an icon tile. Footer notes run along the bottom.
- **The page inspector:**
  - Page type is four tiles with icons (Page, Record page, Side sheet, Modal);
  - "Title in the app menu";
  - an Icon picker for the page.

### Board 3: a row opens its record

- **The sheet, previewed in the canvas.** A header reads "Preview of Invoice detail for INV-9339", with "Edit layout". The footer steps through records named by number ("‹ INV-9338 · 2 of 236 · INV-9340 ›").
- **"When a row is clicked"** is a list of radio cards: Do nothing, Open record detail ("Passes the clicked invoice along"), Go to a page, Run an action.
- **Choosing the detail:** a "Record detail" select, "Made from the Invoices table. Edit its layout".
- **"Opens as"** is three tiles: Side sheet, Full page, Modal.
- **"Row actions"** is a list of rows ("Mark paid · when Unpaid") with a dashed "+ Add a row action".

### Board 4: a button's steps

- **The steps are a vertical timeline** of cards, each with an icon on the rail: Ask to confirm, Update the record, Run a workflow, Show a message.
- **The words are written in the card,** with the record's fields as tokens: "Mark [Number] as paid?", "[Status] becomes [Paid]", "[Paid on] becomes [Today]", "+ Set another field".
- **Adding:** a dashed "+ Add a step", then "If something fails" as a select.
- **The button's rules** are a summary card linking to the Rules tab: "Shown when Status is Unpaid. Managers and Billing can run it."
- **"What people will see · Step 1":** a popover over the canvas showing the confirmation as it will appear, "Written from the steps".
- **The detail on the canvas:** its fields are tiles with drag handles, and "+ Show another field (3 hidden)".

### Board 5: Add a form

- **A large modal in two columns.** The left holds the settings; the right is a live **Preview** of the form as it will be drawn, with its pickers, money and dates.
- **The settings:**
  - "Create a record" and "Edit a record" are cards with icons;
  - Table is a select with its icon;
  - Fields are rows with a drag handle and a checkbox, and their control and default on the right ("Picker · clinics", "Date · today by default", "Set automatically");
  - "Opens as" and "After saving" are selects, side by side.
- **The footer:** "Also adds a 'New invoice' button to the Invoices table." with Cancel and "Create form".

### Board 6: phone and publish (the roadmap's own work)

- **The phone preview** is drawn in a device frame. A banner says "Phone layout is made from the desktop one. 1 widget changed by hand".
- **On the phone:**
  - a hidden widget is a dashed placeholder ("By clinic is hidden on phones");
  - the table is drawn as a list ("shown as a list on phones");
  - the filters collapse to "Filters · 1".
- **The inspector's phone settings:** "Stack below" and "Hide" as a segmented choice; Priority; "Position on desktop" as four number fields.
- **Publish opens "Ready to publish"**, a popover:
  - the checks (data sources found, actions complete, forms valid, a warning for hidden widgets);
  - the changes it publishes;
  - "Try as Billing first";
  - "Publish 3 changes".

## The roadmap's own work

- **Phone:** each widget is automatic or set by hand (keep, full width, stack below, hide), with a priority. A table becomes a list on phones.
- **Publish check:** what is missing or invalid, said before it is published.
- **View as:** the page, its widgets, rules and actions as a group sees them.
- **Draft history:** an earlier draft restored.
- **The acceptance walk-throughs:** invoices, appointments, approvals, the pet owners' portal, and an analytics dashboard.

## Boards 7 to 19: the selector, the shared drawer, and each widget's drawer

### Board 7: the widget selector

- **The search** reads "Find something to add, or describe what people should do".
- **Suggestions** are cards ("Section for the numbers · Groups the 4 stats under a heading").
- **The widgets** are tiles in categories, in two columns.
- **A preview pane** shows the widget chosen, what it is, and "Good for" examples. It says which table the widget starts on, and shows the keys: ↵ to place it at the end, or drag to place it anywhere.

### Board 8: one drawer, one pattern

**Every widget's inspector:**
- The same header (icon tile, name, kind, ⋯) and the same four tabs, with a dot on each tab that has something set.
- Grouped rows, each showing its current value. Clicking a row opens a small editor.

**The parts every widget shares:**
- **Page filters:** "Follows 4 page filters · click to switch one off" as chips, with a dashed chip for a filter not followed.
- **Conditions:** sentences as chips ("Status is Unpaid ×", "+ Condition"). The editor offers the column's own words: a choice column's values with how many rows each has, and a date's "is in the last…, is before, is after, is between, is empty".
- **Sorted by:** Newest or Oldest, "+ Then by", and "Show at most".
- **One number format picker** wherever numbers appear. Each choice shows the real number (Money $43,120.00, Money whole, Money short $43.1k, Number, Percent, Plain), with a currency and "Stored in cents".

### Board 9: the shared tabs

- **Actions:** a trigger sentence ("When someone clicks a bar"), then numbered steps written as sentences, reordered by dragging. "If it fails" is a row. The same step list serves buttons, row actions, forms and charts.
- **Rules:**
  - "Show this widget": Always, or Only when…;
  - "Who can see it", with the note that hiding a widget isn't security, which links to the row rules;
  - for a button, "Can be pressed when" and "Who can run it" (decision 2);
  - on the canvas, a widget shown only to some carries a small tag.
- **Layout leaves the tabs** for ⋯ › Layout. It holds column, row, width and height for the desktop, and Tablet and Phone each Automatic or Custom, with "On narrow screens: Full width · Stack · Hide". The note repeated at the foot of every tab is gone.

### Boards 10 to 19: each widget

- **Chart (10, 11).**
  - Data asks three plain questions: Measure, For each, Split into colors, with a sentence and a small preview of how it reads. Then Order ("Biggest first") and "Show at most".
  - Display shows only what fits:
    - chart types that can't work with the data are greyed, with what they would need;
    - Numbers and Colors;
    - "Show values on bars" and "Show axis titles".
  - Over time, extra options appear: "Compare with the period before" (dashed), "Smooth the line", and "Mark each point".
  - Choosing "For each" orders the columns by how well they group. A date offers Day, Week, Month or Quarter, and "Include weeks with no invoices".
- **Table (12, 13).**
  - Data: the source, filters, conditions and sort as rows and chips. Searching says which columns the page's search box looks in.
  - Display:
    - columns as rows with an eye to hide one and a handle to drag it; a click opens the column;
    - clicking a heading on the page opens the same column: heading, shown as (text or a badge with a colour per value), alignment, width, "Sort by clicking the heading", "Show a total at the bottom", "Hide on phones";
    - row height (Comfortable or Compact), rows at a time, what an empty table says, and striped rows.
  - Actions:
    - what a row click does, and how its record opens;
    - row actions, each with when it may be pressed;
    - buttons above the table, which replace a separate Action group there;
    - "Let people select several rows", so an action runs on all of them.
- **Stat and Goal (14).**
  - Stat: a live preview on top; "Compare with the period before" as one switch, then "Show change as % or $" and "Going up is Good or Bad".
  - Goal: Value, Goal (a fixed amount or a column) and Over; "Show the percentage"; and "When reached, the bar turns green".
- **Pivot and List (15).**
  - Pivot: Measure, Rows and Columns, with a small shaded preview; "Shade cells by size"; and totals for each row and column.
  - List: a sample row with named places (Title, Under the title, Right, Badge, Picture), each filled with a column; List or Cards.
- **Record detail and Form (16).**
  - Record detail's record is one of three:
    - the one the page was opened with;
    - the row selected in a table on the page;
    - the current user's own record, matched by email.
  - Record detail's fields are a list in sections, 1, 2 or 3 across, with "Let people edit fields in place".
  - Form: fields and sections, with what each requires; "Submit says"; "After saving".
- **Button and Action group (17).**
  - Button: Says, Icon, and a style chosen by looking at it (Main, Normal, Quiet, Danger); Full width.
  - Its actions shown collapsed, one line per step.
  - Action group: its buttons as rows, each opening its own Display, Actions and Rules; lined up Left, Right or Spread; "Show up to 3 buttons, the rest in ⋯".
- **Section and Tabs (18).**
  - Section: what it holds, as a list; Plain or Card; "Can be collapsed".
  - Tabs: a list with what each tab holds, and "Opens first" as a chip; Underline or Pills; "Remember the last tab", for each person on this device.
- **Search and filter, and Text (19).**
  - Search and filter: every filter in one list, each saying what it does in one line ("Search invoices · Looks in Number, Client code, Payment ref"); "Filters sit In a row, or Behind a button".
  - A filter's editor: its label, kind and starting value, and which widgets it narrows, as checkboxes.
  - Text: a callout style chosen by looking at it (Plain, Note, Warning, Tip), and the words edited on the page with a small toolbar. Markdown is kept for steps, tabs and folds.

## The owner's further asks (2026-11-22)

- **Modals and side sheets are sized by their maker, from small to big.** They no longer force a stacked layout:
  - In the builder, a modal or sheet page's frame is resized by dragging its edge. It snaps to Small, Medium, Large, Extra large or Full, also set in Page settings.
  - Served, it opens at that size, and its widgets are laid out on its grid as placed. That replaces phase 26's rule that a served overlay draws its widgets in one column. They stack only where the width is narrow (a phone).
- **A Button is placed within its own cell** by a 3 × 3 position picker on its Display tab: top, middle or bottom by left, centre or right. An Action group takes the same picker, for one control.
- **The Text widget's editor is the documentation's Markdown editor.** It has Source and Preview modes and the component authoring help (inserting an alert, steps, tabs, a fold, with the docs' assistance). It is drawn from board 19:
  - the callout style tiles;
  - "Edit on the page", which opens the editor in place, with the preview showing what readers will see.

  The docs editor's editing core (source, preview, mode, the component help) is taken out of `apps/console/src/screens/docs/DocEditor.tsx` into a shared kit component, used by both.
- **A Markdown alert was drawn as plain text** inside a widget's card: the kit's plain notice drops its border inside a panel. It is now a callout with a rail and an icon, as the documentation draws it (fixed on phase 27's branch, `f962d32`). Every component of the Markdown profile is to be checked rendered in a widget, in light and dark: alert, steps, tabs, fold, term, key and field.

## The contract (M1, `faa5284`, and the options each widget gains)

**In the model (built in M1):**
- `Action.runBy?: { groups: string[] }` holds groups by path, end-user or member groups. It is enforced on the server, and someone outside the groups sees the action greyed, with "Only Billing can do this".
- `WidgetRules.seenBy?: { groups }` decides only what is drawn.
- New record sources: `{ selected: "<table or list id>" }` (the row chosen in it, on an app page) and `{ own: { table, by } }` (the current user's own row, where the column `by` holds their email).
- `Page.size` takes `small`, `medium`, `large`, `xlarge` or `full`, for a sheet or a modal; left out, it is medium.
- `Page.icon` names an icon of the kit's set.
- `PageWidget.layout` holds `{ tablet?: {at}, phone?: {at}, narrow?: "full" | "stack" | "hide", priority? }`. Leaving out tablet or phone means automatic.

**In the SDK (built in M1):**
- `InspectorHint.group` names the group of rows a setting is drawn in.
- New controls: `position` (3 × 3), `tiles` (chosen by looking), `slots` (a list's places), `icon` and `groups`.

**Each widget's new options.** The agent that draws a widget adds them to its definition in `packages/widgets-core/src/index.ts`, with `x-volvel` hints (tab, group, control, label), and to its view:
- **Every widget that takes a number format:** the format picker of board 8, a `format` drawn by the `format` control: Money, Money whole, Money short, Number, Percent, Plain, with the currency and "Stored in cents".
- **`core/chart`:**
  - `smooth`, `points` and `values` (show values on bars), all switches;
  - `axisTitles`, a switch;
  - `colors`: `theme` or a named palette;
  - `order`: `biggest`, `smallest` or `label`;
  - `fillGaps`, to include empty periods as zero;
  - `compare` replaces `compareTo`'s filter name with a switch, using the page's date filter.
  - Measure, For each and Split into colors are the data input's measure and first and second group.
- **`core/table`:**
  - each column gains `as: "badge"` with `badges: { [value]: tone }`, `align` (`auto` or `right`), `width` (`auto` or `fixed`), `sortable`, `total` and `phone: false`;
  - `rowHeight` (`comfortable` or `compact`), `empty` (what an empty table says) and `stripes`;
  - `buttons` above the table, actions as an Action group's are;
  - `select`, for several rows, so a row action runs on each of them.
- **`core/list`:** places `title`, `subtitle`, `right`, `badge` and `picture` (the first four replace `primary`, `secondary`, `meta` and `status`), and `look` (`list` or `cards`).
- **`core/detail`:**
  - its record from `{ record: "this" }`, `{ selected }` or `{ own }`;
  - `across` (1, 2 or 3);
  - `edit`, fields edited in place: the fields shown, on the server's terms as an action's.
- **`core/button`:**
  - `tone` adds `quiet`;
  - `icon`;
  - `full`, full width;
  - `place`, one of the nine positions from `top-left` to `bottom-right`.
- **`core/actions`:**
  - `lineUp` (`left`, `right` or `spread`);
  - `showUpTo`, a number, with the rest in ⋯;
  - `place`;
  - each button's `icon`.
- **`core/section`:** `look` (`plain` or `card`); `folds` is "Can be collapsed".
- **`core/tabs`:** `look` (`underline` or `pills`), `opensFirst` (a tab's id) and `remember` (the last tab, for each person on this device). The address still wins.
- **`core/filter`:** `sit` (`row`, or `button`: behind a "Filters · n" button).
- **`core/text`:** `look` (`plain`, `note`, `warning` or `tip`).
- **`labs/goal`:** `goalFrom` (a column, instead of a fixed amount) and `reached` (`green` or nothing).

**Wave A** builds the foundations and what is drawn: tokens and type, the drawer kit, the builder's frame, the server, the views, and the Markdown editor. **Wave B** builds on them: the drawers of every widget, the shared tabs, the selector and dialogs, and the phone and publish work.

## Owner decisions

Answered by the owner on 2026-11-22.

| # | Area | Decision |
|---|---|---|
| 1 | Which board wins | **Boards 7 to 19 win** where they differ from 1 to 6: every inspector, and the widget selector. Boards 1 to 6 still define the frame: the header, the panes, the canvas, the sheets, the form's modal, the phone and publishing. |
| 2 | Who can run an action | **Groups narrow the grant.** Every action (a button, a row action, an Action group's button, a form's submit, a chart's click) may name groups in "Who can run it". Left empty, anyone who may open the app may run it, as in phase 26. With groups named, the server refuses everyone else, a call made straight to the API too. It never widens: rows read, fields named and conditions still hold. The groups are end-user groups or the console's member groups. A named group that no longer exists runs for nobody, and the publish check says so. |
| 3 | Someone who may not run it | **Greyed out, with the reason** ("Only Billing can do this") as its tooltip, as "Can be pressed when" does. Hiding it is the Rules tab's "Show this button". |
| 4 | Scope | **One phase 28:** the builder as boards 1 to 5 and 7 to 19 draw it, with every capability they show, then board 6 and the roadmap's phone layout, publish check, View as, draft history and the acceptance walk-throughs. The boards come first, then the phone and publish work, built on the new components. |
| 5 | "Describe what people should do" | **Words are matched, with no AI.** Titles, descriptions, each widget's "Good for" examples and the suggestions are searched. Nothing leaves the instance. |
| 6 | Documentation | Not part of this phase. The docs redesign was raised as an example of the same pattern, and was fixed before. |

## Milestones

To be written when the phase starts.
