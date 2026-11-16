# 8. Component pattern library

This document specifies the standard components the console should converge on. For each one it says what exists today (file, competing variants, defects), what stays and what changes, and then fixes the contract: anatomy, variants, states, keyboard model, accessibility, sizing, responsive behaviour and usage rules. It is a specification for later phases. Nothing in it is implemented, and every "is", "has" and "does" in a specification subsection describes the target, not the code at HEAD.

Paths are relative to `apps/console/src` unless they start with `packages/` or `apps/`. Sizes, type roles, radii, control heights, densities, motion and breakpoints come from `07-design-system-specification.md` and are not restated as alternatives here. Roadmap IDs (P0-1 … P4-6) refer to `09-prioritized-uiux-roadmap.md`.

Evidence labels:

- **Verified**: read in the code at HEAD `e737382`, cited as `path:line`. Every "Today" entry is Verified unless marked otherwise.
- **Observed (mocked API)**: seen in the built console in headless Chromium with fixture data. Not a real seeded instance.
- **Inferred**: reasoned from code without being run; confirm before acting.
- **Judgment**: a design opinion. All "Standardise on" choices are Judgment constrained by the binding decisions in 07 and by the WAI-ARIA Authoring Practices (APG) patterns named in each section.

## Main findings

- There are two kits (`packages/ui/src` and `apps/console/src/kit`) and a third layer of one-offs in screens. Lists have six implementations, page headers seven, tabs four, search boxes five, copy affordances four, and status marks three mechanisms plus nine local maps.
- Five components the product needs do not exist: Tooltip, LoadState, SplitPane, SaveBar and a shortcut registry. Their absence shows up as about 77 native `title` attributes, 37 bare "Loading…" paragraphs, fixed-height editors, a "Unsaved changes" badge with no guard, and an advertised `j k` shortcut that has no handler (`kit/CommandPalette.tsx:744`).
- The state matrix has systemic holes: no pressed style anywhere, no loading state on `Button` (72 `disabled={busy…}` call sites, 5 change the label), no on-state for toggle buttons, and invalid fields are not marked on the control (`packages/ui/src/Fields.tsx:17`).
- Keyboard models are incomplete where the data is: `CollectionView` rows are one tab stop each with Enter/Space only (`kit/CollectionView.tsx:110-121`), Runs rows are pointer-only (`screens/Runs.tsx:392-396`), and the table `Grid` is "a table of buttons" with one tab stop per cell (`packages/ui/src/Grid.tsx:148`).
- The docked `Inspector` behaves differently from the same component below 1280 px: no focus move, no focus return, no Escape (`kit/layout.tsx:85-140`).
- Feedback components cannot carry what the workflows need: `Toast` is text-only, 5 s for every tone, `role="status"` even for errors (`packages/ui/src/Toast.tsx:35,84`); `Dialog` has no close control and no footer slot (`packages/ui/src/Dialog.tsx:27-48`).
- What is already right and is kept as the base: Base UI primitives for dialog, menu, tabs and combobox; `StatePill` (icon + word + colour); the `ask.*` question API with type-to-confirm; `SchemaForm`; `CollectionView` + `Inspector` + `MasterDetail` as the shape of an operations list; native select and date inputs.
- Unknown values crash instead of degrading: a run state outside the map throws in `StatePill` and blanks the console (`kit/status.tsx:79`, Observed (mocked API)). Every status component below has an explicit `unknown` rendering.

---

## 1. Principles

### 1.1 A component is a behavioural contract

A component in this library is defined by what it guarantees, not by its classes: the states it can be in, the keys it answers, the roles and names it exposes, where focus goes, and how it reflows. Two things that look alike but differ on any of those are two components, and that is the current defect (`CollectionView` rows are selectable and focusable; ui `Table` rows are not; they look related). A screen may not restyle a standard component to obtain a new behaviour, and may not rebuild a standard behaviour by hand.

### 1.2 Where components live

| Layer | Path | Consumers | Rule |
|---|---|---|---|
| Shared kit | `packages/ui/src` | Console, tenant apps (`packages/app`, `packages/screens`, `examples/*`) | **Defaults do not move.** `docs/phases/phase-8-console-redesign.md:45` ("The kit's defaults do not move"): tenant apps import `@vynxlabs/ui`, so shared components gain opt-in variants only. Every change below to a `packages/ui` component is an added prop or an added component; existing props keep their current rendering. |
| Console kit | `apps/console/src/kit` | Console only | Console-specific compositions and console defaults (32 px controls, 36 px rows). Screens import from here, never deep from `@vynxlabs/ui` when a kit wrapper exists. |
| Screens | `apps/console/src/screens` | — | No local component that duplicates a standard one. Enforced by lint (P2-12). |

Consequence for sizes: `packages/ui` `Button` and fields stay 36 px by default (that is the `comfortable` height in 07). The console's 32 px `standard` height arrives as an opt-in `size` value, and the console kit re-exports the component with that size as its default.

### 1.3 The universal state model

Every interactive component declares each of these states or marks it not applicable. The order is also the order of visual precedence when two apply (a disabled control shows no hover; an error outranks success).

| State | Meaning | Required treatment |
|---|---|---|
| default | At rest | Token colours; boundary on `line-control` for inputs, checkboxes and unfilled buttons |
| hover | Pointer over | 120 ms; never the only place information appears |
| pressed | Pointer or key down; also the on-state of a toggle (`aria-pressed="true"`) | Distinct from hover. Does not exist anywhere today (0 `active:` styles) |
| focus-visible | Keyboard focus | 2 px `focus` ring, 2 px offset, never removed; one ring per composite control |
| selected | Chosen item in a set | A non-colour cue (inset 2 px `action` bar or check icon) plus `selected` background; `bg-selected` alone is 1.03:1 against canvas today |
| disabled | Not available | Same opacity for all controls; the reason is given by a Tooltip or adjacent text, not `title` |
| loading | The control's own action is in flight | Spinner replaces the leading icon, label stays, width does not change, `aria-busy="true"`, activation ignored |
| empty | Nothing to show | EmptyState (3.20), never a blank region |
| error | The last action or load failed | Message beside the cause, a way to retry, the request ID where there is one |
| success | The last action worked | Feedback that names the result (rule 4.3) |

### 1.4 The asynchronous-entity state model

Anything read from the API (a list, a run, a draft) is in exactly one of the states below. `LoadState` (3.23) renders the first five; `LiveIndicator` (3.42) renders the connection sub-state.

| State | Condition | What the user sees |
|---|---|---|
| loading | No data yet | Skeleton shaped like the content, `role="status"` |
| ready | Data, current | Content |
| refreshing | Data shown while a refetch runs (`useLoad` keeps previous data, `api.ts:149`, and reports `loading` on every background refetch, `api.ts:160`) | Content stays; a quiet busy cue on the region; no layout shift |
| empty | Loaded, zero items | EmptyState; "filtered empty" is a distinct variant with "Clear filters" |
| error | Load failed | With no data: ErrorState with retry and request ID. With earlier data: content stays under a Banner |
| stale | Live source disconnected | Content stays; LiveIndicator says "Stale since 14:02" with Refresh |
| not found / forbidden | 404 / 403 | ErrorState variant that names the object and offers a way back |

Writes follow idle → pending (Button loading) → succeeded (Toast or inline status that names the result) or failed (InlineError beside the control; persistent). Live entities (runs) add the run lifecycle of 3.12 on top.

---

## 2. Index

| Component | Exists today as | Variants found today | Standardise on | Roadmap ID |
|---|---|---|---|---|
| PageHeader | `PageHeader` (`kit/layout.tsx:31`), `Page` (`ListScreen.tsx:95`), `CollectionView` header, four hand-built headers | 7 (8 with `ListFrame`) | One kit `PageHeader`, `display` 20/28 | P2-3, P4-1 |
| Breadcrumb | Shell "Where you are" (`Shell.tsx:730-865`) plus per-screen back links | 6 patterns on 10 screens | Shell `Breadcrumb`: Workspace › Section › Object | P2-3 |
| Toolbar | `toolbar` slot of `CollectionView`; hand-built rows | No shared component | `Toolbar`, one 32 px row | P4-1, P2-2 |
| FilterBar | `FilterChips` (11 uses), `SegmentedControl` (0 console uses), native selects, 2 hand-made groups | 4 | `FilterBar`, URL-backed | P1-1, P2-6 |
| SearchField | Five separate builds | 5 | `SearchField` | P2-2, P3-1 |
| DataTable | `ListScreen`, ui `Table`, `CollectionView`, `ListCollection`, hand-rolled tables, (`Grid`) | 6 | Kit `DataTable` | P2-2, P0-3, P1-1, P3-3, P3-4 |
| DataGrid | ui `Grid` (`packages/ui/src/Grid.tsx`) | 1 | `Grid` with opt-in grid semantics | P2-9 |
| CommandMenu | `kit/CommandPalette.tsx` | 1 | Same component, v2 | P3-2 |
| Menu / ContextMenu | ui `Menu` (9 uses); no context menu | 1 | `Menu` v2 + `ContextMenu` | P3-1, P3-6 |
| Tooltip | Does not exist; native `title` | 0 | New `Tooltip` | P3-1 |
| StatusBadge family | `StatePill` (63 uses), `Badge` (48), `Tag` (47), 9 local maps | 3 mechanisms | `StatePill` state, `Tag` class, `Badge` count | P2-5 |
| RunStatus | `STATES` map (`kit/status.tsx:42-61`) | 1 map plus residue | `RunStatus` with `unknown` | P0-1, P2-5 |
| Timeline | ui `Timeline` (1 use) | 1 | `Timeline` v2 | P1-2 |
| LogViewer | ui `LogViewer` (3 uses) | 1 | `LogViewer` v2 | P1-6, P0-5 |
| CodeViewer | Does not exist; `<pre>` ×3, `<code>` ×38, `code()` helper ×6 | 4 idioms | New `CodeViewer` | P1-3, P2-12 |
| CodeEditor | `editor/CodeEditor.tsx` (2 uses); JSON textareas | 1 + 3 textarea sites | `CodeEditor` with registered commands | P1-4, P0-6 |
| JSONViewer | ui `JsonView` (9 uses); raw `JSON.stringify` | 1 + 2 raw sites | `JsonView` v2 | P1-2, P0-2 |
| ResultView | ui `ResultView` (5 uses) | 1 | Keep; add copy and names | P1-2 |
| KeyValue / Facts | `KeyValues` (24 uses), `Facts` (4), a `<dl>` in `widgets.tsx:409` | 3 | `KeyValue` | P2-1, P4-6 |
| EmptyState | `EmptyState` (17 uses), `EmptyCanvas` (7 + every `CollectionView`), paragraphs | 3 | `EmptyState` | P2-13, P2-4 |
| ErrorState | `Notice tone="danger"` ×112, 9 with retry | No component | New `ErrorState` | P2-4, P0-1 |
| InlineError | `<p role="alert">` in three field frames; Notice; toast | 3 placements | `InlineError` | P2-7 |
| LoadState | Does not exist; 37 bare "Loading…"; `Skeleton` unused | 0 | New `LoadState` | P2-4 |
| Drawer and Inspector | ui `SideSheet` (11 uses), kit `Inspector` (13) | 2 chromes, 2 behaviours by width | One chrome, one focus contract | P0-3, P2-6 |
| Modal (Dialog) | ui `Dialog` (15 uses) | 1 (3 sizes) | `Dialog` with close and footer | P0-9 |
| ConfirmDialog | `ask.confirm` ×30, `ask.prompt` ×12, `ask.typeToConfirm` ×3 | 3 kinds | Three levels with blast radius | P0-9 |
| SplitPane | Does not exist | 0 | New `SplitPane` | P3-5, P1-4 |
| Tabs | ui `Tabs`, `AccessTabs`, two hand-made | 4 | `Tabs` (URL-backed) and `RouteTabs` | P2-6 |
| FormField | `Frame` ×3, hand-rolled labels | 3 frames | One `FormField` | P2-7 |
| SchemaForm | ui `SchemaForm`, ui `Form` (0 console uses), `CreateDialog` fields | 3 form engines | `SchemaForm` | P1-4, P1-8, P2-7 |
| SaveBar | Does not exist; per-screen save | 4 save models | New `SaveBar` | P0-4, P2-7 |
| SecretField and OneTimeSecret | Password `TextField`; attention Notice | 5 one-time presentations | New `SecretField`, `OneTimeSecret` | P2-7, P0-10 |
| CopyButton / Identifier | `CopyButton` (11 uses), `CopyIcon`/`CopyableId` (7), JsonView Copy, `select-all` | 4 | `CopyButton`, `Identifier` | P0-10, P1-10, P4-6 |
| ResourcePicker | `ComboboxField` (21 uses), `choose`, `x-pick`, native selects | 4 | `ResourcePicker` | P2-7, P1-10 |
| ScriptPicker | Schedule sheet, flow editor, palette pickers | 3 | `ScriptPicker` (script/flow target) | P1-9, P1-8 |
| UserPicker | Operators combobox; "Give access" native select | 2 | `UserPicker` (principal) | P2-11 |
| UsedBy / ReferenceList | `UsedBy` (`kit/references.tsx:19`, 3 uses) | 1 | `ReferenceList` | P1-10, P0-9 |
| Toast | ui `Toast` via `notify.*` (19 + 54 calls) | 1 | `Toast` v2 | P0-7, P2-8 |
| Notice / Banner | ui `Notice` (4 tones) | 1 | `Notice` (in flow) and `Banner` (region) | P2-8, P4-2 |
| Button | ui `Button`; two hand-made toggle idioms | 1 + 2 | `Button` with loading and pressed | P2-8, P0-2 |
| Kbd and shortcut registry | 2 `<kbd>`; 4 independent window listeners; a static sheet | No registry | `Kbd` + one registry | P3-1, P0-6 |
| LiveIndicator | One label (`screens/Runs.tsx:215-219`) | 1 | New `LiveIndicator` | P1-7 |
| EnvTag | `EnvTag` (9 uses), `TypeBadge` | 2 | `EnvTag` | P4-5 |

Counts are from `02-design-system-forensics.md`; a spot recount for this document matched (`<CollectionView` 16, `<ListCollection` 3, `<ListScreen` 13, ui `<Table` 14, `<Page` 23, `<Inspector` 13, `<SideSheet` 11, `<Dialog` 15). The accessibility notes speak of "about 30 collections" behind `CollectionView`; the counted figure is 16 direct uses plus 3 through `ListCollection`, and that is the one used here.

---

## 3. Components

### 3.1 PageHeader

- **Purpose.** Names the screen or object, carries its state and its actions, and is the focus target after navigation.
- **Today.** Seven variants: `PageHeader` (`kit/layout.tsx:31`, 9 direct uses), `Page` (`ListScreen.tsx:95`, 23 uses), the `CollectionView` header (`kit/CollectionView.tsx:60-71`, 16 uses), a hand copy (`screens/Runs.tsx:202-205`), editor headers at 18 and 16 px mono (`screens/Authoring.tsx:616`, `screens/ResourceEditor.tsx:330`, `screens/FlowEditor.tsx:858`), the run page (`screens/RunPage.tsx:93-105`) and 20 px detail headers (`screens/SingleSignOn.tsx:1017`, `screens/Dashboards.tsx:148`). Titles are 26 px with an always-visible description; the Runs list starts 282 px down (Observed (mocked API)). New-object editors have no `h1` because a Path field takes its place (`screens/Authoring.tsx:615-628`). Stays: the slot model (title, description, eyebrow, meta, actions). Changes: one component, 20 px, a state slot, collapsible description.
- **Anatomy.**

```
[title h1]  [StatePill] [EnvTag?]                      [secondary…] [Primary]
meta: Identifier · version · started by · …                         [⋯ Menu]
description (pages) | (?) help popover (workbenches)
```

- **Variants.** `page` (title + one-line description); `workbench` (title only, description behind a help button, sits on the Toolbar row when space allows); `object` (mono title for paths and IDs, state and meta row); `editor` (object variant plus SaveBar status).
- **States.** default; loading (title skeleton, actions disabled); error (title stays, ErrorState in the body, never a header replaced by a notice as at `screens/Flows.tsx:368`); not found.
- **Keyboard behaviour.** No keys of its own. Actions are in DOM order after the title; the primary action is last visually and last in tab order.
- **Accessibility.** One `h1` per route with `tabIndex={-1}`; the shell focuses it on route change and sets `document.title` from it (P0-7). The state is text inside the heading's group, not colour alone. Actions overflow into a Menu named "More actions".
- **Sizing.** Title `display` 20/28 (26 px only on overviews and sign-in). A path or ID used as a title keeps the mono face at the `title` role's 16/24 metrics; no other heading size is used (today: 26, 20, 18 and 16 px). Meta `meta` 12/16. Actions 32 px. Gutter 24; gap to content 16.
- **Responsive behaviour.** Below 1024 px actions wrap under the title; below 768 px only the primary action stays visible and the rest move into the Menu. Description hidden below 768 px on workbenches.
- **Usage guidance.** Use on every routed screen. Do not use inside an Inspector, Drawer or Dialog (those have their own `title` 16/24 heading).
- **Anti-patterns.** A back link above or below the title ("All flows" under the title, `screens/Flows.tsx:409`); a text field in place of the `h1`; three badges of equal weight after the title (`screens/ResourceEditor.tsx:343-345`); mixing 28, 32 and 24 px actions in one row (`screens/RunPage.tsx`).

### 3.2 Breadcrumb

- **Purpose.** Shows where the user is (workspace, section, object) and is the single way back up.
- **Today.** The shell header shows scope only; in a workspace the section name is `sr-only` (`Shell.tsx:788`) and the object never appears. Ten screens hand-build a back link in six patterns: plain link (`screens/Authoring.tsx:610`, `screens/ResourceEditor.tsx:324`), arrow + link (`screens/Dashboards.tsx:139`, `screens/Interfaces.tsx:1718`), arrow + button (`screens/SingleSignOn.tsx:1008-1013`), "Flows / path" (`screens/FlowEditor.tsx:848-858`), "Runs › id" (`screens/RunPage.tsx:94-101`), link below the title (`screens/Flows.tsx:409`). Three patterns are visible on three neighbouring screens (Observed (mocked API)). Stays: the workspace switcher and the junction motif. Changes: section and object become visible crumbs; local back links are removed.
- **Anatomy.** `Tenant › [Workspace ▾] [ENV] › Section › Object` — each crumb a link except the last, which is text.
- **Variants.** Workspace, tenant, instance and account scopes (as today); `collapsed` (middle crumbs fold into a "…" Menu).
- **States.** default; loading (object crumb is a skeleton until the name resolves); not found (object crumb reads the raw path segment).
- **Keyboard behaviour.** Links in tab order; the switcher is a menu button (3.9). `g` then a section letter is a registry chord (3.41), not a breadcrumb key.
- **Accessibility.** `nav aria-label="Breadcrumb"` containing an `ol`; the last item has `aria-current="page"` (today only an `sr-only` "/here"). Separators are `aria-hidden`.
- **Sizing.** `body-sm` 13/18 in the 48 px header; object crumb in `code-sm` when it is a path or ID; truncation in the middle of long paths with the full value in a Tooltip.
- **Responsive behaviour.** Below 1024 px: workspace + object, section folded. Below 768 px: the object crumb only, with a back chevron to the section.
- **Usage guidance.** One breadcrumb, in the shell. A screen supplies its object crumb through a hook; it never renders its own.
- **Anti-patterns.** Any per-screen "All …" link; a `<button>` used for navigation (`screens/SingleSignOn.tsx:1008-1013`); "promotes to X" as plain text beside the crumbs (`Shell.tsx:783-785`) — it becomes a link to the same object in the target workspace (P1-3).

### 3.3 Toolbar

- **Purpose.** One row above a list or canvas that holds search, filters, view controls and bulk actions.
- **Today.** No component. `CollectionView` has a `toolbar` slot filled by each caller; Runs stacks a labelled field row and a chip row (`screens/Runs.tsx:219-250`); Audit mixes 36, 32 and 28 px controls (`screens/Audit.tsx:228-256`); the flow editor header carries eleven items on one wrapping row (`screens/FlowEditor.tsx:887-935`). Stays: the slot idea. Changes: a real component with a fixed height and overflow.
- **Anatomy.** `[SearchField] [FilterBar…]            [LiveIndicator] [view ▾] [density ▾] [actions]` ; replaced in place by the batch-action bar when rows are selected (3.6).
- **Variants.** `list` (above DataTable), `editor` (above a canvas or code), `inline` (inside a panel, 28 px).
- **States.** default; busy (refreshing cue at the right); selection (batch bar).
- **Keyboard behaviour.** APG toolbar pattern.

| Key | Action |
|---|---|
| Tab | Enters the toolbar on the last-focused control; next Tab leaves it |
| ← / → | Previous / next control (skipped while a text input has a caret that can move) |
| Home / End | First / last control |

- **Accessibility.** `role="toolbar"` with `aria-label` ("Runs filters") and `aria-controls` pointing at the list. Icon buttons have names and Tooltips.
- **Sizing.** Height 32 px controls in a 48 px band (8 px gap, 16 px inline padding in panels, 24 px page gutter). All controls in one toolbar share one height.
- **Responsive behaviour.** Controls that do not fit move into a "Filters" menu button with a count of active filters; search stays visible down to 768 px and becomes an icon below.
- **Usage guidance.** Use for controls that act on the region directly below. Page-level actions (New, Deploy) belong to PageHeader.
- **Anti-patterns.** Labels above toolbar inputs (they make the bar about 80 px tall, `screens/FlowEditor.tsx:860-868`, Observed (mocked API)); a bulk action beside filters that ignores them ("Cancel queued runs", `screens/Runs.tsx:165-177`).

### 3.4 FilterBar

- **Purpose.** Narrows a list; every filter is visible, removable and in the URL.
- **Today.** Four mechanisms: `FilterChips` (`kit/layout.tsx:289`, 11 uses) declares `radiogroup`/`radio` but has no arrow keys or roving tabindex (`kit/layout.tsx:301-322`); ui `SegmentedControl` (native radios, `packages/ui/src/Pickers.tsx:16`) has 0 console uses; bare native selects (`screens/Audit.tsx:228,242`); hand-made groups (`screens/Data.tsx:592-600`, `screens/Interfaces.tsx:1316-1335`). Only Runs keeps filters in the URL (`screens/Runs.tsx:98-111`), written with `replaceState` (`router.tsx:48`). Stays: chips with server counts; the Runs URL contract. Changes: one component, correct radio behaviour, multi-value filters, "Clear".
- **Anatomy.** `[Status: All 120 | Failed 3 | Running 2 …] [Kind ▾] [When ▾] [tag:billing ×] [Clear filters]`
- **Variants.** `single` (one of N: segmented, radio semantics); `multi` (toggle chips, `aria-pressed`); `menu` (a filter with many values: menu button with checkbox items); `token` (an applied free-form filter such as a tag, removable).
- **States.** default, hover, pressed, focus-visible, selected (inset cue + `action-soft`, border on `action` at full strength), disabled, loading (counts show a 2-character skeleton).
- **Keyboard behaviour.** `single` follows the APG radio group pattern; `multi` is a set of toggle buttons.

| Key | single | multi / token |
|---|---|---|
| Tab | One stop for the group (the checked chip) | Each chip is a stop |
| ← ↑ / → ↓ | Move and check previous / next, wrapping | — |
| Space / Enter | Check | Toggle; on a token's ×, remove |
| Backspace / Delete | — | Remove the focused token |

- **Accessibility.** `single`: native radios in a `fieldset` with a `legend` (the `SegmentedControl` construction). `multi`: `role="group"` with a label. Counts are part of the accessible name ("Failed, 3"). Changing a filter announces the new result count through the list's polite status.
- **Sizing.** 28 px chips in a 32 px toolbar; radius 6; count in `code-sm`; no opacity on counts (today `opacity-80` at 10.5 px, `kit/layout.tsx:320`).
- **Responsive behaviour.** Collapses to a "Filters (2)" menu button below 1024 px; active tokens stay visible and scroll horizontally.
- **Usage guidance.** Filters change `?param=` with `replaceState`; opening an object uses `pushState` (rule 4.2). Default values are omitted from the URL.
- **Anti-patterns.** `role="radio"` on buttons without arrow keys; merging two states under one chip ("Waiting" merges approval and time, `screens/Runs.tsx:63`); filters held in component state (Flows, Triggers, Events, Approvals, Audit, Members).

### 3.5 SearchField

- **Purpose.** Free-text narrowing of the region below it.
- **Today.** Five builds: `TextField` with a visible label (`kit/ListCollection.tsx:92`, `screens/Runs.tsx:220`), icon-in-box 32 px (`screens/Flows.tsx:114`), icon-in-box 30 px (`Shell.tsx:686`), bare `<input type="search">` (`screens/Roles.tsx:126`, `screens/Audit.tsx:256`), the palette input (`kit/CommandPalette.tsx:605`). Events needs an explicit submit (`screens/Operate.tsx:424-429`); the Grid filter refetches on every keystroke (`screens/Data.tsx:208-212`). Stays: 300 ms debounce and URL `q` from Runs. Changes: one field.
- **Anatomy.** `[🔍 placeholder…                 (×) /]` — leading icon, input, clear button when non-empty, shortcut hint when empty and unfocused.
- **Variants.** `list` (debounced, URL-backed), `local` (filters loaded items, no debounce), `submit` (server search that needs Enter; shows a return-key hint).
- **States.** default, hover, focus-visible, disabled, loading (spinner replaces the search icon while the request is in flight), no-results (the list's filtered-empty state, not a state of the field).
- **Keyboard behaviour.**

| Key | Action |
|---|---|
| `/` (registry, outside inputs) | Focus the search of the active region |
| Esc | Clear if non-empty; otherwise blur back to the list |
| ↓ | Move focus to the first row of the controlled list |
| Enter | `submit` variant: run; others: no-op |

- **Accessibility.** `<input type="search">` with an `aria-label` naming the scope ("Search runs"); `aria-controls` the list; clear button named "Clear search"; result count announced by the list's status region. Placeholder uses `ink-subtle` (new value, ≥4.5:1).
- **Sizing.** 32 px (28 in `inline` toolbars); 240 px default width, grows to 360 px on focus at ≥1280 px; icon 16.
- **Responsive behaviour.** Below 768 px an icon button that expands to full toolbar width.
- **Usage guidance.** The placeholder says what is matched ("Path, run ID, tag or error text"). One search per region.
- **Anti-patterns.** A visible label above a search box in a toolbar; `outline-none` on the input (`Shell.tsx:693`, `screens/Flows.tsx:120`, `screens/FlowEditor.tsx:978`); swallowing a failed search as "Nothing matches" (`kit/CommandPalette.tsx:249`).

### 3.6 DataTable

- **Purpose.** The one list primitive: a set of like objects in rows, scannable, sortable, selectable, with a row action and an optional inspector.
- **Today.** Six implementations (`02-design-system-forensics.md`): `ListScreen` → ui `Table` (`ListScreen.tsx:210`, 13 uses, rows inert, retry on error); ui `Table` direct (`packages/ui/src/Table.tsx:18`, 14 uses, no hover/selected/loading/error); `CollectionView` (`kit/CollectionView.tsx:24`, 16 uses, sticky header, column `priority`, Enter/Space on a focusable row, no retry); `ListCollection` (`kit/ListCollection.tsx:13`, 3 uses, client search + inspector); hand-rolled tables (`screens/Runs.tsx:316`, `screens/Execution.tsx:857,1165`, `screens/Roles.tsx:154`, `screens/RowRules.tsx:312`); ui `Grid` (3.7). Rows are 31–57 px; Runs rows are 57 px, 82 px with tags (Observed (mocked API)). Defects: Runs rows are pointer-only (`screens/Runs.tsx:392-396`); `aria-selected` on a `tr` in a plain table (`kit/CollectionView.tsx:109`); 200 rows are 200 tab stops; no sort or multi-select outside `Grid`; paging done three ways while `Pagination` has no consumer; a status column that overflows ("Waiting for approvavisits/…", Observed (mocked API)). Stays: `CollectionColumn` shape (`header`, `cell`, `priority`, `align`), sticky header, own scroll region, `MasterDetail`. Changes: everything below.
- **Anatomy.**

```
Toolbar | batch bar: [✓ 3 selected] [Cancel] [Re-run] [Clear]        (replaces toolbar)
┌──┬────────────┬───────────────────────┬─────────┬─────────┬────────┬───┐
│☐ │ State   ↕  │ Target (identifier)   │ Trigger │ Started↓│ Took   │ ⋯ │  sticky header
├──┼────────────┼───────────────────────┼─────────┼─────────┼────────┼───┤
│☐ │ ● Failed   │ billing/record-payment│ schedule│ 14:02   │ 3.0 s  │ ⋯ │  row: 36 px
└──┴────────────┴───────────────────────┴─────────┴─────────┴────────┴───┘
footer: "100 of 1,234"  [Load more] | [‹ Previous] [Next ›]
```

- **Variants.** Three kinds, then the options every kind shares. `interactive` (default: rows open an object or an inspector); `static` (read-only reference table such as the roles matrix or a result table: native `<table>`, no roving focus); `inset` (inside a panel, no page gutter, at most 10 rows before "Show all").
  - **Density.** `compact` 28, `standard` 36 (default), `comfortable` 44; a per-user preference per table (P3-4). One line per row by default; a second line is an opt-in `detail` slot shown only for rows that need it (a failed run's error summary).
  - **Column priority.** Each column declares `priority` 1–3 as today, plus `min`/`max` width and `truncate: "end" | "middle"`. The first data column is the identifier and is sticky when the table scrolls sideways. State columns size to the longest label in the state map. Numeric and duration columns right-align in tabular mono.
  - **Sort.** Header buttons, tri-state (ascending → descending → none); `aria-sort` on every sortable header (`none` when unsorted); the sort arrow is visible at reduced emphasis when unsorted (today `opacity-0`, `packages/ui/src/Grid.tsx:230`). Server-side when the list is paged.
  - **Selection.** Single (the open row, `aria-selected`, mirrored in `?item=`/`?run=`) and multiple (checkbox column, Shift-click and Shift+↓/↑ ranges, header checkbox selects the loaded rows and offers "Select all N that match"). The two are independent.
  - **Batch-action bar.** Replaces the toolbar while any row is checked; names the count and the scope; destructive batch actions go through ConfirmDialog with the list of affected rows.
  - **Row actions.** At most one inline action (icon button) plus a "⋯" Menu at the row end; the same items are offered by ContextMenu. Actions never depend on hover to exist.
  - **Paging vs virtualisation.** Cursor "Load more" for time-ordered streams (runs, events, audit), with "N of M" where the API gives a count; Previous/Next (the unused `packages/ui/src/Pagination.tsx`) for stable sets. Virtualise rows once more than 200 are in the DOM; loaded pages and scroll offset survive Back.
  - **URL state.** `q`, filters, `sort`, `item` (open row) and the active view are query parameters; filters and sort use `replaceState`, opening a row uses `pushState` so Back closes it.
- **States.** Row: default, hover, focus-visible (ring on the cell, row tinted), selected (inset 2 px `action` bar + `selected`), checked, disabled (dimmed, reason in Tooltip), pending (a write on this row: actions show loading). Table: loading (skeleton rows at the current density), refreshing (rows stay, header busy cue), empty, filtered-empty ("Clear filters"), error (ErrorState with retry), page error (inline row with retry, as `screens/Runs.tsx:366-373`).
- **Keyboard behaviour.** `interactive` follows the APG grid pattern: one tab stop, roving focus on cells, focus lands on the widget inside a cell when it has exactly one.

| Key | Action |
|---|---|
| Tab / Shift+Tab | Into the grid at the last-focused cell; out of the grid |
| ↓ / ↑, `j` / `k` | Next / previous row, same column |
| → / ← | Next / previous cell |
| Home / End | First / last cell in the row |
| Ctrl+Home / Ctrl+End | First / last loaded row |
| Page Down / Page Up | One viewport of rows |
| Enter | Open the row (inspector or page, as the table declares) |
| ⌘/Ctrl+Enter | Open the row's page in a new tab |
| Space, `x` | Toggle the row's checkbox |
| Shift+↓ / Shift+↑ | Extend the checked range |
| ⌘/Ctrl+A | Check all loaded rows |
| Esc | Clear checks; if none, close the inspector |
| Shift+F10 / Menu key | Open the row's ContextMenu |

- **Accessibility.** `interactive`: `role="grid"` on the table with `aria-label`, `aria-rowcount`/`aria-rowindex` when virtualised, `aria-multiselectable` when checkboxes exist, `aria-selected` on rows. The identifier cell holds a real link (`<a href>`) so modified clicks and "open in new tab" work. `static`: native table, `scope="col"`, a caption or `aria-label`. Sticky header with `scroll-margin-top` on rows so focus is never under it. A polite status region announces "24 runs, 3 failed" after load and filter changes, not on every stream event.
- **Sizing.** Rows per density above; header 32 px, `meta` 12/16 medium in `ink-muted`; cell padding 12 px inline; checkbox and action columns 36 px wide with 24×24 targets; radius 4 on focus rings in cells.
- **Responsive behaviour.** Priority 3 columns hide below 1024 px, priority 2 below 768 px. Below 768 px a row keeps state + identifier + one datum; the inspector is a full-screen Drawer. From 1920 px the inspector may be replaced by a side-by-side detail pane (P3-8). The identifier column truncates in the middle and never wraps mid-word (today "billing/record-p / ayment", Observed (mocked API)).
- **Usage guidance.** Use for every list of objects. Use DataGrid when cells are edited in place. Use KeyValue for one object's facts. Cards are for at most a handful of heterogeneous items, not for worker pools (`screens/Execution.tsx:951-963`).
- **Anti-patterns.** `tr onClick` without a keyboard path; a row with two unmarked click targets that do different things (`screens/Tenants.tsx:38`); an unlabelled actions column (`ListScreen.tsx:219`); two-line rows that repeat "Script · attempt 1 of 3" (`screens/Runs.tsx:412-417`); a silent cap (events 100, triggers 8 on the overview) with no "N more".

### 3.7 DataGrid

- **Purpose.** Tabular data whose cells are read, edited and navigated individually: table rows in Tables and Sources, and the app table widget.
- **Today.** ui `Grid` (`packages/ui/src/Grid.tsx:199`): sort buttons with `aria-sort`, a filter row, in-place edit (Enter commits by blur, Esc cancels, `packages/ui/src/Grid.tsx:181-186`), per-cell error, a radio per row to "choose". Defects: every editable cell is a tab stop (`packages/ui/src/Grid.tsx:148`; 50 rows × 8 columns = 400 stops); header not sticky (`packages/ui/src/Grid.tsx:208`); `id`, `created_at`, `updated_at` appended last (`screens/Data.tsx:578-582`); commit on blur with no undo (`packages/ui/src/Grid.tsx:180`); a null boolean looks like false (`packages/ui/src/Grid.tsx:132`); the edit button is named by its value only (`packages/ui/src/Grid.tsx:150`); "empty" at 2.52:1 (`packages/ui/src/Grid.tsx:311`); filter `th`s and empty header cells. Stays: typed parse/show (`showValue`, `parseValue`), server sort/filter, per-cell errors. Changes: grid semantics behind an opt-in prop (`navigation="grid"`), because the app renderer shares the component.
- **Anatomy.** DataTable anatomy with: pinned key column first, a filter row under the header (optional), an editor that replaces the cell content, a row inspector (non-modal) instead of the modal sheet.
- **Variants.** `editable`, `read-only` (keyless source tables), `widget` (inside an app page; default behaviour unchanged).
- **States.** Cell: default, hover, focus-visible, editing, saving (spinner in cell, value optimistic), error (red boundary + message under the cell, value kept in the editor), read-only, null (the word "empty" in `ink-subtle`, never opacity), changed-since-load. Grid states as DataTable.
- **Keyboard behaviour.** APG grid pattern with editable cells (navigation mode and edit mode).

| Key | Navigation mode | Edit mode |
|---|---|---|
| Arrows | Move one cell | Move the caret |
| Enter / F2 | Start editing | Enter commits and moves down |
| Any printable key | Start editing, replacing the value | — |
| Tab / Shift+Tab | Leave the grid | Commit and move to next / previous cell |
| Esc | — | Cancel, restore the value, focus the cell |
| Space | Toggle a boolean cell; otherwise toggle the row check | — |
| Delete / Backspace | Set to null where the column allows, with undo | — |
| ⌘/Ctrl+C | Copy the cell value | — |
| ⌘/Ctrl+Z | Undo the last committed edit (while the undo Toast is live) | Native undo |
| Home / End, Ctrl+Home / Ctrl+End, Page Up / Down | As DataTable | — |

- **Accessibility.** `role="grid"`, `aria-readonly` on cells that cannot change, `aria-invalid` + `aria-describedby` on a cell with an error, column header as each cell's name context; the editor's label is "{column}, row {key}". After commit, focus returns to the cell (today the input unmounts and focus is lost). Commit is explicit (Enter or Tab); blur with a changed value keeps the editor open and marks it unsaved rather than saving silently.
- **Sizing.** Density 28 / 36; cell editor fills the cell at the row height; radius 4; key column `code-sm` or `code`; truncation at the column's max width with the full value in the row inspector and on focus.
- **Responsive behaviour.** Horizontal scroll inside the grid with the key column pinned; below 768 px the grid is read-only and a row opens a form Drawer.
- **Usage guidance.** Use only where the data is genuinely tabular and edited in place. Not for lists of platform objects (DataTable).
- **Anti-patterns.** A radio column whose effect is to open details (`packages/ui/src/Grid.tsx:293-303`); undebounced filter-per-keystroke; raw UUIDs for reference columns (`screens/Data.tsx:459-469`) — use ResourcePicker; a modal sheet over the grid for reading one row (`screens/Data.tsx:281-312`).

### 3.8 CommandMenu

- **Purpose.** Keyboard-first search, navigation and actions from anywhere.
- **Today.** `kit/CommandPalette.tsx`: a combobox input with `aria-controls` and `aria-activedescendant` over a listbox (`:604-646`), server search with a 150 ms debounce and a stale-answer guard (`:234-253`), prefix modes `>` `#` `/` `@` (`:153-165`), server-side recents, ⌘↵ secondary action (`:486-510`). Defects: no loading state and errors swallowed as "Nothing matches" (`:249`, `:645-648`); no context commands for the open object (`Shell.tsx:948-956`); connection, event, app, member and end-user results open only a list (`:127-147`); Esc in a picker closes everything; no Home/End; `aria-expanded` hard-coded, section titles `role="presentation"` (`:655`), dialog titled "Go to" (`:601`); full-screen on phones with no close control (`packages/ui/src/Dialog.tsx:32-33`); ⌘K captured over Monaco's chord prefix (`:112-123`). Stays: one input, the prefixes, permission-checked server search, recents, the Run/Start schema-form hand-off.
- **Anatomy.**

```
┌ [mode chip?] [ Search or run a command…                     ] [×] ┐
│ THIS OBJECT   Run this script ⌘↵ · Open its runs · Copy path       │
│ RECENT        …                                                    │
│ RESULTS       script  billing/record-payment     Sandbox   ↵ open  │
├ ↑↓ move · ↵ open · ⌘↵ run · ⌫ back · esc close      20 of 57 ──────┤
```

- **Variants.** Root; picker (a second step such as "Pause trigger…"); mode (prefix active, shown as a chip).
- **States.** empty query (context commands, recent and pinned, then actions; not 12 navigation rows first, Observed (mocked API)); typing/loading (a "Searching…" row, client matches stay); results; no results (says what was searched and offers the other modes); error (a row with Retry); action pending (row shows loading and the menu stays until the result is known).
- **Keyboard behaviour.** APG combobox pattern with a listbox popup, inside a modal dialog.

| Key | Action |
|---|---|
| ⌘K / Ctrl+K | Open; pressing it again closes. Inside Monaco it is a registered editor command (3.16), not a window listener |
| ↓ / ↑ | Next / previous option (wraps) |
| Home / End | First / last option (when the input is empty); otherwise caret |
| Page Down / Up | Next / previous group |
| Enter | Run the option's primary action |
| ⌘/Ctrl+Enter | Secondary action named on the row |
| Backspace on empty input | Leave the picker or mode |
| Esc | Leave the picker; at the root, close and return focus to the invoker |
| Tab | Stays in the dialog (input, close button) |

- **Accessibility.** Dialog named "Command menu"; input `role="combobox"` with a short `aria-label`, `aria-expanded` reflecting whether options exist, `aria-autocomplete="list"`; groups are `role="group"` with `aria-labelledby`; options carry kind, name and workspace in their accessible name; a polite status announces "12 results" or "No results" after the debounce. A visible close button on every size.
- **Sizing.** 640 px wide, radius 12, elevation 3; input 44 px with `emphasis` 15/22; rows 36 px; footer legend `meta` 12/16 with Kbd.
- **Responsive behaviour.** Full-screen sheet below 768 px with the close button and the legend hidden; secondary actions become a trailing button on the row.
- **Usage guidance.** Every action shown in a PageHeader or row Menu of the open object is registered as a context command (P3-2). A result always opens the object, never its list.
- **Anti-patterns.** Advertising keys that do not exist (`j k`, `:744`); actions not filtered by permission; uncapped pickers that load whole lists (`:315-357`).

### 3.9 Menu and ContextMenu

- **Purpose.** A short list of actions or choices for one target, on demand.
- **Today.** ui `Menu` (`packages/ui/src/Menu.tsx`, 9 uses): Base UI menu with `label`, `icon`, `danger`, `separated`, `current`. Gaps: no disabled items, no shortcut slot, no submenu, the current mark is an `aria-hidden` "✓" glyph so the active workspace or theme is not exposed (`packages/ui/src/Menu.tsx:47-56`), highlight is `action-soft` on surface at 1.20:1. No context menu exists; rows show up to five inline text buttons (`packages/ui/src/widgets.tsx:239-262`). Stays: Base UI. Changes: opt-in item features; a ContextMenu built on the same list.
- **Anatomy.** `[trigger ▾]` → panel: `[icon] Label            [Kbd]` rows, separators, optional group labels, danger items last after a separator.
- **Variants.** Action menu (menu button); choice menu (`menuitemradio` / `menuitemcheckbox`); ContextMenu (same items, opened on the target); submenu (one level only).
- **States.** Item: default, highlighted (background + inset bar), pressed, disabled (with a reason as a description line), checked, danger, loading (after activation when the menu stays open). Menu: closed, open, empty (never rendered: hide the trigger instead).
- **Keyboard behaviour.** APG menu button and menu patterns.

| Key | Action |
|---|---|
| Enter / Space / ↓ on trigger | Open, focus first item (↑ focuses last) |
| ↓ / ↑ | Next / previous item, wrapping |
| Home / End | First / last item |
| Type a character | Move to the next item starting with it |
| Enter / Space | Activate; close unless the item is a checkbox |
| → / ← | Open / close a submenu |
| Esc | Close, focus returns to the trigger or the row |
| Tab | Close and move on |
| Shift+F10 / Menu key | Open the ContextMenu of the focused row or node |

- **Accessibility.** `role="menu"`; items `menuitem`, `menuitemradio` (with `aria-checked`) or `menuitemcheckbox`; icon triggers have an `aria-label`; disabled items use `aria-disabled` and stay focusable so the reason can be read. A ContextMenu never holds an action that is unavailable from a visible control.
- **Sizing.** Items 32 px (28 in compact contexts), `body` 14/20, icon 16, radius 8 on the panel and 4 on items, elevation 2, min width 180 px, max 320 px; opens in 180 ms.
- **Responsive behaviour.** Below 768 px a menu with more than six items opens as a bottom sheet with 44 px items.
- **Usage guidance.** Use for three or more secondary actions; one or two actions stay as buttons. Use a Select or `single` FilterBar, not a menu, to choose a value that persists on screen.
- **Anti-patterns.** Glyph check marks; a destructive item first; a disabled trigger explained only by `title` ("New trigger" in production, `screens/Operate.tsx:99`).

### 3.10 Tooltip

- **Purpose.** A short, non-essential text label for a control, or the full value of truncated text, reachable by pointer, keyboard and touch.
- **Today.** Does not exist. The console uses the native `title` attribute about 77 times, about 17 of which carry information available nowhere else (the truncated error summary `screens/Runs.tsx:408`, the full "Used by" list `kit/references.tsx:25`, undo labels `screens/FlowEditor.tsx:904,914`, the reason a button is disabled `screens/Operate.tsx:99`). One hover-only tooltip is hand-made and unreachable by keyboard (`screens/Overview.tsx:149`). `CopyIcon` reports "Copied" only through `title` (`kit/copy.tsx:14`).
- **Anatomy.** `[target]` → small panel: text, optional Kbd. No interactive content.
- **Variants.** `label` (names an icon button; also its accessible name); `description` (extra hint, `aria-describedby`); `overflow` (shows the full text only when the target is truncated); `disabled-reason`.
- **States.** hidden; delayed (500 ms on hover, 0 ms on focus, 0 ms when another tooltip was open in the last 300 ms); visible; dismissed.
- **Keyboard behaviour.** APG tooltip pattern.

| Key | Action |
|---|---|
| Focus on target | Show |
| Esc | Hide without moving focus |
| Blur / pointer leaves target and tooltip | Hide |

- **Accessibility.** `role="tooltip"` referenced by `aria-describedby` (or supplies `aria-label` in the `label` variant). Meets WCAG 1.4.13: dismissible, hoverable, persistent until dismissed. Disabled targets use `aria-disabled` and stay focusable so the reason can be reached. On touch, long-press shows it; anything a touch user must know is also in visible text.
- **Sizing.** `meta` 12/16, max width 280 px, padding 4 × 8, radius 6, elevation 2, 8 px from the target; 120 ms fade, none under reduced motion.
- **Responsive behaviour.** Flips and shifts to stay in the viewport; never covers its own target.
- **Usage guidance.** Icon buttons always have a `label` tooltip with their shortcut. Use a Popover (Menu-level surface) for anything with links or more than two lines.
- **Anti-patterns.** `title` on any element; error text or blast radius in a tooltip; a tooltip as the only place a value can be read.

### 3.11 StatusBadge family: StatePill, Tag, Badge

- **Purpose.** Three marks with three jobs: `StatePill` says what lifecycle state a thing is in; `Tag` says what kind of thing it is; `Badge` shows a count.
- **Today.** `StatePill` (`kit/status.tsx:67`, 63 uses) is an icon + word in tone colour, 16 states; `Badge` (`packages/ui/src/Badge.tsx`, 48 uses, filled pill, 5 tones); `Tag` (`kit/status.tsx:116`, 47 uses, outlined mono capitals, 7 tones). The same meaning is drawn two or three ways: Draft is an amber `Badge` (`screens/Authoring.tsx:422`) and a teal dashed `Tag` (`screens/FlowEditor.tsx:875`); Active is an action `Badge` (`screens/Account.tsx:46`) and a green `StatePill` (`screens/Members.tsx:196`); Disabled is a neutral `Badge`, a danger `Tag` and a `StatePill state="failed"`. Nine local maps bypass the kit: `STATE` copied four times (`screens/Authoring.tsx:420,805`, `screens/ResourceEditor.tsx:271`, `screens/FlowEditor.tsx:808`), plus `screens/Git.tsx:151`, `screens/Audit.tsx:58`, `screens/FlowEditor.tsx:182`, `screens/Drift.tsx:96`, `screens/Release.tsx:251`. `Tag tone="production"` is reused for "Paused" and "Not bound". Stays: all three components and StatePill's icon-plus-word rule. Changes: strict roles and one exported map per domain.
- **Anatomy.** StatePill `● Word  detail`; Tag `[ KIND ]`; Badge `(12)`.
- **Variants.** StatePill domains: run (3.12), lifecycle (`draft`, `deployed`, `from-repository`, `retired`), availability (`active`, `invited`, `suspended`, `disabled`, `revoked`), switch (`on`, `off`, `paused`), health (`ok`, `degraded`, `failing`, `unchecked`), plus `unknown`. Tag tones: neutral, kind, source, danger; environment lives in EnvTag (3.43). Badge tones: neutral, action, attention, danger.
- **States.** Static marks: default and `unknown` only. When a StatePill or Tag is a filter shortcut it is wrapped in a Button (`quiet`, 24 px target) and takes the button's states.
- **Keyboard behaviour.** None; not focusable. A clickable wrapper follows Button.
- **Accessibility.** StatePill: icon `aria-hidden`, the word is the name; colour never alone. Badge: the number has context in its accessible name ("3 failed"). Tag: uppercase by CSS only, so screen readers read the word. Contrast uses the corrected `attention` and `success` tokens (P0-2); tag borders are decorative.
- **Sizing.** StatePill `body` or `body-sm` with a 14 px icon, stroke 1.75; Tag `tag` 10.5/12, radius 4, 20 px tall; Badge `code-sm` 12/18, min 20 × 20, fully rounded.
- **Responsive behaviour.** StatePill may drop its `detail`, never its word; in a column narrower than its longest label it shows the icon with the word in a Tooltip and in the accessible name.
- **Usage guidance.** If the value changes over the object's life it is a StatePill. If it is fixed at creation (kind, source, type) it is a Tag. If it is a number it is a Badge. One mark per fact per row.
- **Anti-patterns.** `Badge` for state (`screens/Alerts.tsx:211-216`, `screens/Execution.tsx:443,614`, `screens/Git.tsx:306`); a whole sentence in a badge ("Active until …", `screens/Tenant.tsx:960`); `StatePill state="failed"` to mean "No" (`screens/Access.tsx:192`); `state="running"` to mean "Listening" (`screens/Operate.tsx:164`); a local state map in a screen.

### 3.12 RunStatus

- **Purpose.** The single rendering of a run's or step's state, in lists, headers, graphs and timelines.
- **Today.** One `STATES` map (`kit/status.tsx:42-61`) with a distinct "Waiting for approval". Residue: `StatePill` destructures `STATES[state]` and throws on a state outside the map, blanking the console (`kit/status.tsx:79`; Observed (mocked API) with `timed_out`); `stateOf()` exists (`kit/status.tsx:90`) but falls back to "Note" and Runs does not use it; `canceled` and `skipped` share icon and colour; both `canceled` and `cancelled` keys; `STATE_STROKE` colours differ from the pill (`kit/status.tsx:92-101`); a dead `_TONE` map (`screens/Execution.tsx:28`); two trigger-word maps (`screens/Execution.tsx:64`, `screens/Flows.tsx:42`); "running" has no motion cue.
- **Anatomy.** StatePill plus optional `detail` (elapsed, attempt) in tabular mono.
- **Variants.** `pill` (icon + word), `icon` (icon only with Tooltip, for dense graphs), `stroke` (graph node colour, always paired with an icon on the node), `summary` (for a flow run: "Failed at `charge-card`").
- **States.** The full set, one map:

| State | Label | Icon | Colour role |
|---|---|---|---|
| queued | Queued | Clock | neutral |
| running | Running | CircleDot (the one looping indicator) | action |
| waiting_approval | Waiting for approval | UserRoundCheck | attention |
| waiting_time | Waiting until {time} | Hourglass | attention |
| succeeded | Succeeded | CircleCheck | success |
| failed | Failed | CircleX | danger |
| canceled | Canceled | CircleSlash | neutral |
| skipped | Skipped | CircleDashed | neutral |
| unknown | The raw value, verbatim | CircleHelp | neutral |

- **Keyboard behaviour.** None; not focusable.
- **Accessibility.** A change of state on an open run page is announced once through a polite live region beside the header ("Run failed after 12 s"), not by the pill itself (P0-7). The running animation stops under reduced motion and the word "Running" remains.
- **Sizing.** As StatePill; `detail` in `code-sm`; the state column in DataTable is sized to "Waiting for approval".
- **Responsive behaviour.** `icon` variant below 768 px in lists only when the row also shows the error summary; otherwise the word stays.
- **Usage guidance.** Running rows show a live elapsed timer as `detail`; queued rows show queue wait (P1-7). Never map an API value to a neighbouring state to avoid `unknown`.
- **Anti-patterns.** Indexing the map without a fallback; duration in sans inside the pill while list columns use mono (`kit/status.tsx:81`); state as stroke colour plus a 5 px dot only (`FlowGraph.tsx:279-281`).

### 3.13 Timeline

- **Purpose.** Shows the steps of a flow run on a time axis and selects one.
- **Today.** ui `Timeline` (`packages/ui/src/Timeline.tsx`, 1 console use at `screens/Flows.tsx`): rows are buttons with `aria-pressed`, segments `wait` / `run` / `hold`, a legend limited to kinds in use. Gaps: axis ticks are offsets only (`:143-155`); the 160 px label truncates with no full value (`:114`); segments are colour-only for assistive tech; `wait` bars are `ink-muted/50` at 2.11:1; `now` is captured at render so live bars do not grow; a kept step reads "0 ms" (`screens/Flows.tsx:535-544`); no step is selected on open and selection is not in the URL (`screens/Flows.tsx:628`).
- **Anatomy.**

```
            0 s        5 s        10 s       15 s      (toggle: offset | clock)
▸ fetch     ░░██████                                   ● Succeeded   2.1 s
▸ charge          ░████████████                        ● Failed      6.0 s   ← selected
▸ notify                        ┄┄ skipped             ◌ Skipped
```

- **Variants.** `flow` (steps), `attempts` (a script run's queue wait, attempts and backoff); nested rows for loop items and child flows (collapsed by default).
- **States.** Row: default, hover, focus-visible, selected, failed (danger bar and RunStatus), kept-from-earlier-run (hatched, labelled "kept"), in progress (bar grows on a 1 s tick). Timeline: loading, empty ("This run has not started a step yet"), error.
- **Keyboard behaviour.** APG listbox pattern, single-select, selection follows focus.

| Key | Action |
|---|---|
| Tab | One stop: the selected row (the first failed step on open) |
| ↓ / ↑ | Next / previous step, selects it and updates `?step=` |
| Home / End | First / last step |
| → / ← | Expand / collapse nested items |
| Enter | Move focus to the step detail panel heading |

- **Accessibility.** `role="listbox"` named "Steps"; each `option` is named "{step}, {state}, waited 3 s, ran 1 s"; bars and axis `aria-hidden`; segment kinds differ by pattern as well as colour. The selected step is mirrored in `?step=` so it can be linked (P1-2).
- **Sizing.** Rows 32 px; label column 200 px, resizable to 40 % of the width, `code-sm`; duration column right-aligned mono; bar height 12, radius 2.
- **Responsive behaviour.** Below 1024 px the bars column scrolls horizontally with labels pinned; below 768 px the bars hide and the list shows state and duration only.
- **Usage guidance.** Default view for a flow run; the graph is the alternative tab. Selecting a step shows its input, output, error and logs beside it.
- **Anti-patterns.** A failure banner that does not name or link the failed step (`screens/Flows.tsx:679-683`); a step detail panel below a tall graph with no scroll into view (`screens/Flows.tsx:748`).

### 3.14 LogViewer

- **Purpose.** Reads, searches and exports the log of a run or step, live or finished.
- **Today.** ui `LogViewer` (`packages/ui/src/LogViewer.tsx`, 3 uses): filter-by-text, minimum-level select, Wrap, Follow while live, download of all lines, "x of y" count with `aria-live` (`:138`), a focusable scroll region. Gaps: search hides non-matching lines and highlights nothing (`:55-65`); no next/previous match, copy, line numbers or permalink; fields render as one muted JSON string (`:166-168`); `attempt` is dropped (`:3-11`); every line is a DOM node (`:157-171`); Follow forces `scrollTop` on every batch (`:68-71`); height fixed at 28 rem (`:46,154`); controls are hand-built at 28 px (`:86`). A finished run with more than 500 lines shows only the first 500 while the stream is connected (`screens/Execution.tsx:371-373`; P0-5).
- **Anatomy.**

```
[Search…  3/41 ‹ ›] [Level ▾] [Wrap] [Time: local ▾]      [Follow ●] [Copy] [Download] [⤢]
   12  14:02:11.204  INFO   Charging card                              {orderId: 8841} ▸
   13  14:02:11.911  ERROR  Supplier refused                           ▾ fields…
 ─────────────── attempt 2 of 3 ───────────────
                                              [↓ 24 new lines — Jump to latest]
```

- **Variants.** `page` (fills the pane height), `inspector` (compact toolbar, 13 px), `step` (inline under a flow step, capped with "Open full log").
- **States.** loading; empty (waiting for first line while live, "No log lines" when finished); live-following; live-paused (new-lines pill); truncated (states how many lines are loaded of how many, with "Load the rest"); error loading a page (inline retry); disconnected (LiveIndicator).
- **Keyboard behaviour.** The log is a focusable scroll region with an active line.

| Key | Action |
|---|---|
| `/` or ⌘/Ctrl+F (focus in viewer) | Focus search |
| Enter / Shift+Enter (in search), `n` / `N` (in log) | Next / previous match |
| ↓ / ↑ | Move the active line |
| Page Down / Up, Home / End | Scroll; End resumes Follow |
| → / ← | Expand / collapse the active line's fields |
| ⌘/Ctrl+C | Copy the selection, or the active line |
| `w` | Toggle wrap |
| Esc | Clear search, then leave the viewer |

- **Accessibility.** Region `role="log"` with `aria-live="off"` and a label; live announcements are limited to a throttled polite status ("120 lines, 2 errors") instead of every batch. Lines are rows with level as text, not colour alone. Match count is announced when the query settles. All toolbar controls are kit controls.
- **Sizing.** Lines `code-sm` 12/18 (`code` 13/20 optional), line number gutter in `ink-subtle`; toolbar 28 px in `inspector`, 32 px in `page`; background `code-bg`.
- **Responsive behaviour.** Fills its SplitPane; below 768 px timestamp collapses to time only and fields open below the line; wrap defaults on.
- **Usage guidance.** Search highlights and keeps context; the level select is the filter. Follow turns off when the user scrolls up and resumes at the bottom.
- **Anti-patterns.** A line count that states the page size as the total ("500 lines", `packages/ui/src/LogViewer.tsx:139-141`); a fixed-height box on a full run page; unknown levels silently ranked as info (`:59`).

### 3.15 CodeViewer

- **Purpose.** Shows code, configuration or a diff read-only, with copy and line addressing.
- **Today.** Does not exist. Four idioms: three `<pre>` styles (`screens/AgentAccess.tsx:87`, `screens/Drift.tsx:168`, `screens/GitSync.tsx:243`); 38 `<code>` elements including a `code()` helper copied into six files (`screens/Data.tsx:32`, `screens/Execution.tsx:24`, `screens/Flows.tsx:30`, `screens/Domains.tsx:39`, `screens/Environments.tsx:10`, `screens/Tenant.tsx:92`); a read-only `CodeEditor` for repository sources (`screens/Authoring.tsx:904-950`); code backgrounds split between `bg-sunken` and `bg-code-bg`. There is no way to see source at a run's version (`screens/RunPage.tsx:113,188`).
- **Anatomy.** `inline` code; `block`: header (file name or label, language, Copy, Wrap) over numbered lines; `diff`: unified with `+`/`−` gutter glyphs and folded unchanged regions.
- **Variants.** `inline`, `block` (static highlight, no Monaco), `file` (Monaco read-only: find, reveal line, large files), `diff` (source diff, not sorted JSON), `command` (a shell command with Copy; used by OneTimeSecret).
- **States.** default; loading (skeleton lines); empty ("No source in this version"); error; highlighted line or range (from `#L12-L18`); truncated ("Showing the first 2,000 lines — Open the whole file").
- **Keyboard behaviour.**

| Key | Action |
|---|---|
| Tab | Focuses the scroll region, then the header buttons |
| Arrows, Page Up / Down, Home / End | Scroll |
| ⌘/Ctrl+C | Copy the selection |
| ⌘/Ctrl+F | Find (`file` variant) |

- **Accessibility.** Scroll region is focusable with `role="region"` and a label ("Source of billing/record-payment at v12"); `inline` is a plain `<code>`; diff lines carry "added"/"removed" as visually hidden text; the `file` variant never traps Tab (Monaco read-only with tab focus mode on).
- **Sizing.** `code` 13/20 (block and file), `code-sm` 12/18 (diff, inspector); `inline` inherits size, radius 4, `code-bg`; block radius 8, padding 12.
- **Responsive behaviour.** Horizontal scroll by default, Wrap toggle; diff stays unified at every width.
- **Usage guidance.** Use for every piece of code or command on screen. Editable code is CodeEditor.
- **Anti-patterns.** A local `code()` helper; `select-all` on `<code>` as the copy mechanism (`screens/Execution.tsx:1084`, `screens/Account.tsx:54`); a 12 px diff of sorted JSON for a script change (`screens/Drift.tsx:168-171`); whole files side by side in place of a diff (`screens/GitSync.tsx:243-249`).

### 3.16 CodeEditor (Monaco wrapper)

- **Purpose.** Edits TypeScript, JSON and YAML with completion, diagnostics and the console's shortcuts.
- **Today.** `editor/CodeEditor.tsx` (2 uses, both in `screens/Authoring.tsx`): props `label`, `value`, `onChange`, `language`, `path`, `readOnly`, `height`, `revealLine`; a labelled `<textarea>` fallback until Monaco loads or if it fails (`:112-121`); theme built from tokens. Defects: fixed height (default 28 rem; 34 rem in the script editor, about 39 % of a 1440×900 viewport, Observed (mocked API)); no commands registered, so ⌘↵ is a window listener (`screens/Authoring.tsx:314-325`) that Monaco likely swallows and ⌘S opens the browser's save dialog (Inferred); the create effect depends on `label`, which embeds the path being typed, so Monaco is recreated per keystroke in the Path field (`:99`, `screens/Authoring.tsx:703`; Inferred); diagnostics are not read (no problems count or list); the SDK typings omit `z`, so the starter script shows an error on line 1 (Observed (mocked API)); Tab is captured with no documented escape. JSON is still edited in plain textareas in three places (`screens/ResourceEditor.tsx:277-290`, `screens/Authoring.tsx:531,542`) and in SchemaForm's JSON mode (`packages/ui/src/SchemaForm.tsx:830-848`).
- **Anatomy.** Editor surface filling its SplitPane; status strip: `Ln 12, Col 4 · TypeScript · 2 problems ▸ · Tab moves focus: off`.
- **Variants.** `source` (TypeScript with SDK types), `data` (JSON/YAML with a schema), `field` (single small JSON value in a form, 6–12 lines, no minimap), `readOnly`.
- **States.** loading (fallback textarea, same value); ready; read-only (with the reason in a Banner above, not inside); problems (count in the strip and in SaveBar); disconnected language worker (strip says "Type checking unavailable"); failed to load (fallback stays, Notice offers Retry).
- **Keyboard behaviour.** Monaco defaults, plus commands registered with Monaco through the shortcut registry so they work with the caret in the code.

| Key | Action |
|---|---|
| ⌘/Ctrl+S | Save draft |
| ⌘/Ctrl+Enter | Run (script) / submit (field in a form) |
| F8 / Shift+F8 | Next / previous problem |
| Ctrl+M (Ctrl+Shift+M on macOS) | Toggle "Tab moves focus"; shown in the strip and the shortcut sheet |
| Esc then Tab | Leave the editor forward (Esc then Shift+Tab backward) |
| ⌘/Ctrl+K | Opens the CommandMenu, registered as a Monaco command so the override of Monaco's chord prefix is deliberate and listed in the shortcut sheet |
| F1 | Monaco command list |

- **Accessibility.** `ariaLabel` is stable for the document ("Source of this script"), never derived from a value being typed. The Tab trap has a visible, documented exit. Problems are also a list (`role="list"`) whose items move the caret; a polite status announces "2 problems" when the count changes after typing stops.
- **Sizing.** `code` 13/20; fills available height (no fixed rem height); minimum 240 px; `field` variant 120–240 px.
- **Responsive behaviour.** Desktop-only below 1024 px: the screen shows a notice and the read-only CodeViewer. The model, undo stack and caret survive a first save (no remount on the new → edit URL change).
- **Usage guidance.** Use for any multi-line code or JSON. One model per document path; changing `path` swaps the model, it does not recreate the editor.
- **Anti-patterns.** A window-level key listener for an editor command; a plain textarea for JSON Schema (`screens/Authoring.tsx:542-558`); `outline-none` on the fallback (`editor/CodeEditor.tsx:119`).

### 3.17 JSONViewer

- **Purpose.** Reads a structured value: run input and output, event payloads, claims, settings.
- **Today.** ui `JsonView` (`packages/ui/src/JsonView.tsx`, 9 uses): props `value`, `label`, `tone`, `maxHeight` (18 rem); regex-coloured text (keys `action`, strings `success`, numbers `attention`), a Copy chip that is `opacity-0` until hover or focus (`:63`), a focusable scroll region. Gaps: no collapse, search or path copy; the whole value is stringified and painted every render (`:53,85`); string and number colours are 4.31:1 and 4.07:1 on `sunken` in light and read as status. Two screens bypass it with raw `JSON.stringify` in a notice or inspector (`screens/Flows.tsx:700-702`, `screens/Operate.tsx:839`).
- **Anatomy.** Header `label · 14 keys · [Search] [Copy] [Raw | Tree]`; tree rows `▸ key: value` with a per-row copy on focus or hover.
- **Variants.** `tree` (default above 20 lines), `raw` (pretty-printed text), `inline` (one line with expand), `danger` (error payloads).
- **States.** default; empty (`null`/`{}` shown as the literal with "empty"); collapsed/expanded nodes; large (more than 500 nodes: collapsed to depth 1 with counts); truncated string ("… 4,096 more characters — Show"); copied.
- **Keyboard behaviour.** `tree` follows the APG tree view pattern.

| Key | Action |
|---|---|
| ↓ / ↑ | Next / previous visible node |
| → / ← | Expand or go to first child / collapse or go to parent |
| Home / End | First / last node |
| `*` | Expand all siblings |
| ⌘/Ctrl+C | Copy the node's value; Shift adds the path |
| Enter | Toggle expand |

- **Accessibility.** `role="tree"` with a label; nodes named "key, type, value or N items"; syntax colours come from dedicated non-status tokens that pass 4.5:1 on `code-bg`; Copy is always visible at reduced emphasis and announces "Copied".
- **Sizing.** `code-sm` 12/18 in inspectors, `code` 13/20 on pages; indent 16 px; Copy button 24 × 24.
- **Responsive behaviour.** Long values wrap; the tree never scrolls horizontally below 768 px.
- **Usage guidance.** Use for values of unknown shape. A value with a schema or a known shape is shown as KeyValue or through ResultView.
- **Anti-patterns.** `JSON.stringify` into a Notice; status colours for syntax; hover-only controls.

### 3.18 ResultView

- **Purpose.** Shows what a run or step produced in the most useful shape.
- **Today.** ui `ResultView` (`packages/ui/src/ResultView.tsx`, 5 uses): detects `table`, `markdown`, `media`, `json`; caps tables at 500 × 12 with an honest note (`:131-178`); remote images load on click; scroll regions are focusable. Gaps: the table is unnamed and relies on `title` for truncated cells; no copy or download for the table; shape chips are about 23 px tall (`:212`); flow input, flow output and step input are never passed to it (`screens/Flows.tsx`). Stays: shape detection and the caps.
- **Anatomy.** `[Table | Text | Preview | JSON]  [Copy] [Download]` over the body.
- **Variants.** By shape; `compact` for inspectors; `paired` (input beside output in a SplitPane, P1-2).
- **States.** empty ("No output" with the state that explains it: "The step failed before it produced output"); loading; truncated (rows × columns shown of total); error payload (danger JSONViewer); media blocked until clicked.
- **Keyboard behaviour.** Shape switch follows Tabs (3.28, `local` variant, not in the URL by default); the table is a `static` DataTable; the JSON body follows JSONViewer.
- **Accessibility.** `section` with a label ("Output of charge-card"); the table has a caption; images have the file name as alt text; the truncation note is text, not a tooltip.
- **Sizing.** Table rows 28 px (compact), `body-sm` 13/18; shape switch 28 px.
- **Responsive behaviour.** Fills its pane; tables scroll inside with a sticky header.
- **Usage guidance.** Default to Output for a succeeded run and Error for a failed one (today Input is always first, `screens/RunPage.tsx:388-392`).
- **Anti-patterns.** Showing output only for succeeded steps with nothing in its place otherwise (`screens/Flows.tsx:825`).

### 3.19 KeyValue (Facts)

- **Purpose.** The facts of one object as label/value pairs.
- **Today.** Three components for one job: `KeyValues` (`kit/layout.tsx:330`, 24 uses, 13 px mono values, labels in `ink-subtle`), ui `Facts` (`packages/ui/src/Facts.tsx`, 4 uses, 12.5 px, fixed label column, values `truncate` with no way to expand, `:22-24`), and a `<dl>` in `packages/ui/src/widgets.tsx:409`. Timestamps wrap onto two lines in the 256 px run aside (Observed (mocked API)); the step "Run ID" is plain text, not a link (`screens/Flows.tsx:774`).
- **Anatomy.** `label   value [copy]` rows in a `dl`; optional group headings.
- **Variants.** `stacked` (label above value, for narrow inspectors), `inline` (two columns), `grid` (2–4 columns of pairs on pages), `dense` (28 px rows).
- **States.** default; loading (value skeletons, labels real); empty value ("—" with an accessible "not set"); unknown value shown verbatim.
- **Keyboard behaviour.** None of its own; links and CopyButtons inside are tab stops.
- **Accessibility.** `dl`/`dt`/`dd`; labels in `ink-muted` (passes on every surface); a truncated value has its full text in a Tooltip and on focus.
- **Sizing.** Label `meta` 12/16, value `body` 14/20 or `code` 13/20; row gap 8, column gap 16; label column `minmax(96px, auto)`.
- **Responsive behaviour.** `inline` becomes `stacked` below 360 px of container width.
- **Usage guidance.** Identifiers use Identifier (3.33); references are links (rule 4.1); times use one format module with relative text and the absolute time in a Tooltip (P4-6); durations are derived for the reader (queue wait, run time), not left as three timestamps to subtract.
- **Anti-patterns.** Raw role IDs or kinds as values (`screens/Tenant.tsx:954`); `toLocaleString()` beside `stamp()` on one route (`screens/Flows.tsx:750-777`).

### 3.20 EmptyState

- **Purpose.** Explains an empty region and offers the way to fill it.
- **Today.** Three looks: ui `EmptyState` (`packages/ui/src/Notice.tsx:32`, 17 uses, dashed, left-aligned, title is a `<p>`), kit `EmptyCanvas` (`kit/layout.tsx:263`, 7 direct uses and every `CollectionView`, centred with a junction motif, title is a `<p>`), and bare paragraphs (`screens/Runs.tsx:311-313`, `screens/Execution.tsx:1142`, `screens/Alerts.tsx:200`). Most `CollectionView` callers pass no action (`screens/Members.tsx:218`). Copy quality is good and is kept.
- **Anatomy.** `[icon or motif]  Title  ·  one sentence  ·  [Primary action] [secondary: CLI or docs]`.
- **Variants.** `first-use` (nothing exists yet: primary action and the CLI equivalent in a `command` CodeViewer, P2-13); `filtered` (nothing matches: "Clear filters"); `cleared` (a good zero, such as "No failed runs in the last 24 hours"); `no-access`; `inline` (one line inside a panel or table body).
- **States.** One state per variant; the action takes Button states.
- **Keyboard behaviour.** None of its own; the action is the next tab stop.
- **Accessibility.** Title is a heading at the level below the region's heading; the motif is `aria-hidden`; in a list region the empty state replaces the grid and is announced by the list's status ("No runs match").
- **Sizing.** Title `title` 16/24; text `body` max 52ch; icon 20; padding 32 (page), 16 (`inline`); no dashed border inside a bordered panel.
- **Responsive behaviour.** Centred in a workbench, left-aligned in a panel; actions stack below 480 px.
- **Usage guidance.** Every empty region uses it. In production, a `first-use` state for code objects says where authoring happens and links to the dev workspace.
- **Anti-patterns.** "Nothing here." (`screens/Drift.tsx:82`); an empty state with no action where one exists; a filtered-empty state with no reset (`screens/Runs.tsx:311-313`).

### 3.21 ErrorState

- **Purpose.** Replaces a region that failed to load or crashed, and offers recovery.
- **Today.** No component. `Notice tone="danger"` is used 112 times; 9 have a retry (`ListScreen.tsx:239`, `screens/Data.tsx:184,1173`, `screens/SingleSignOn.tsx:1208`, `screens/InstanceBranding.tsx:23`, `screens/Domains.tsx:388`, `screens/Dashboards.tsx:66`, `screens/Interfaces.tsx:1948`, `screens/Branding.tsx:409`); `CollectionView` has none (`kit/CollectionView.tsx:73-76`). Detail screens return the notice alone and lose their header (`screens/Flows.tsx:368,631`). The API's `requestId` is dropped by the client (`api.ts:5-24`). There is no error boundary: a render error blanks the console (Observed (mocked API)).
- **Anatomy.** `[icon] What failed, in the user's terms  ·  what to do  ·  [Try again] [secondary]  ·  Request ID [copy]`.
- **Variants.** `load` (retry), `crash` (rendered by a per-region error boundary: "This panel stopped working" with Reload panel and Copy details), `not-found`, `forbidden` (names the missing permission), `offline`.
- **States.** default; retrying (Button loading); retry failed again (adds "Tried 2 times").
- **Keyboard behaviour.** None of its own; Try again is the first tab stop in the region.
- **Accessibility.** `role="alert"` when it replaces content after a user action, otherwise a plain region with a heading; focus moves to the heading only when the failed region had focus.
- **Sizing.** As EmptyState; Identifier in `code-sm`.
- **Responsive behaviour.** As EmptyState.
- **Usage guidance.** The shell, PageHeader and Breadcrumb stay rendered around it. When earlier data exists, keep it and show a Banner instead (1.4).
- **Anti-patterns.** One transient failed poll replacing a whole run page until navigation (`screens/Execution.tsx:382-383`, `screens/RunPage.tsx:161`); errors with no retry; rendering `null` while loading or on failure (`App.tsx:104`, `screens/Tenant.tsx:164,413`).

### 3.22 InlineError

- **Purpose.** A validation or write error placed beside the control that caused it.
- **Today.** Three placements: under the field as `<p role="alert">` that replaces the hint and is not linked by `aria-describedby` (`packages/ui/src/Fields.tsx:20-23`, repeated in `packages/ui/src/Combobox.tsx:44-47` and `packages/ui/src/SchemaForm.tsx:371`); a danger Notice above or below the form (`ListScreen.tsx:197`, `InputDialog.tsx:77`); a toast through `notify.error` (54 sites) that disappears after 5 s. The invalid control has no red boundary.
- **Anatomy.** `⚠ message` under the control; hint stays visible above it.
- **Variants.** `field`, `cell` (DataGrid), `row` (a failed row action), `summary` (form-level: counts the errors and links to each field).
- **States.** hidden; shown; resolved (removed when the value becomes valid or the write succeeds).
- **Keyboard behaviour.** None; `summary` links move focus to the field.
- **Accessibility.** The message has an `id` in the control's `aria-describedby`; the control has `aria-invalid="true"`; only `summary` uses `role="alert"`, so a submit with five errors is announced once. On submit, focus moves to the first invalid field (kept from `packages/ui/src/Form.tsx:166-170`).
- **Sizing.** `body-sm` 13/18 in `danger`, icon 14; 4 px below the control.
- **Responsive behaviour.** Wraps; never truncates.
- **Usage guidance.** Validate on blur after first interaction and on submit; server field errors map by pointer as today (`ListScreen.tsx:130`). A failure of a row or inspector action is shown in that row or inspector and persists until retried or dismissed; a Toast may accompany it but is never the only report.
- **Anti-patterns.** `notify.error` as the only report of a failed Suspend or Delete (`screens/Members.tsx:146-148`); the error replacing the hint; a failed test shown as success.

### 3.23 LoadState

- **Purpose.** One wrapper that renders the loading, refreshing, empty and error states of an asynchronous region (1.4).
- **Today.** Does not exist. Every screen writes `error ? … : !data ? … : empty ? …` by hand. 45 occurrences of "Loading…", 37 as a bare `<p>` (22 without `m-0`); `Skeleton` (`packages/ui/src/Surfaces.tsx:117`, `role="status"`) has 0 console uses; several screens render `null`. The suspense fallback is the same paragraph (`App.tsx:142`).
- **Anatomy.** `<LoadState of={query} skeleton={…} empty={…}>{(data) => …}</LoadState>`.
- **Variants.** Skeleton shapes: `table` (rows at the current density), `detail` (header + KeyValue), `editor`, `chart`, `text`.
- **States.** loading (skeleton after 150 ms, to avoid a flash); refreshing (children stay, `aria-busy`, 2 px progress line at the region's top edge); empty; error; stale.
- **Keyboard behaviour.** None; focus inside the region is preserved across refreshes.
- **Accessibility.** One `role="status"` with a label ("Loading runs") while loading; on arrival the region's own status announces the result. `aria-busy="true"` on the region while refreshing. Skeleton pulse stops under reduced motion.
- **Sizing.** Skeleton blocks match the type role's line height and the row density, so nothing shifts on arrival.
- **Responsive behaviour.** Skeleton follows the same breakpoints as the content.
- **Usage guidance.** Wrap every `useLoad` read. A region never shows a spinner alone and never shows nothing.
- **Anti-patterns.** Bare "Loading…"; old rows shown after a filter change with no busy cue (`screens/Runs.tsx`, `api.ts:149`); "Nothing matches" shown while a request is in flight (`kit/CommandPalette.tsx:645-648`).

### 3.24 Drawer (SideSheet) and Inspector

- **Purpose.** Inspector: the details of the selected row, beside the list, without leaving it. Drawer: the same surface as an overlay, for narrow widths and for focused sub-tasks (a wizard, a history).
- **Today.** ui `SideSheet` (`packages/ui/src/SideSheet.tsx`, 11 uses; sizes `regular`/`wide`/`narrow`, sides right/left; Base UI modal with focus trap, Escape and a Close button). Kit `Inspector` (`kit/layout.tsx:85`, 13 uses): at ≥1280 px a plain `aside` (352 px, 416 px at 2xl) that takes no focus, returns none (it unmounts, `:104`) and ignores Escape; below 1280 px it becomes a `SideSheet`. The two chromes differ in padding (16 vs 20 px), close size (28 vs 32 px), close icon and footer alignment. Selection is component state on every list except Runs and Triggers, and is written with `replaceState`, so Back never closes an inspector.
- **Anatomy.**

```
┌ eyebrow                              [⤢ open page] [×] ┐
│ Title (h2)   ● State                                   │
├────────────────────────────────────────────────────────┤
│ Tabs? · body (scrolls)                                 │
├────────────────────────────────────────────────────────┤
│ [Primary] [Secondary]                       [Danger ⋯] │
└────────────────────────────────────────────────────────┘
```

- **Variants.** Inspector `docked` (non-modal, ≥1280 px) and `overlay` (Drawer below); Drawer `regular` 480, `wide`, `narrow` 320, `left` (navigation). A docked Inspector is resizable through SplitPane (P3-5).
- **States.** closed; opening (240 ms); open; loading (LoadState `detail`); error (ErrorState inside; the frame and Close stay); dirty (a Drawer with unsaved input asks before closing).
- **Keyboard behaviour.** Drawer follows the APG modal dialog pattern. The docked Inspector is a non-modal region with the same open/close contract.

| Key | Docked Inspector | Drawer |
|---|---|---|
| Enter on a row | Opens; focus moves to the inspector heading | Opens; focus moves to the heading |
| Tab / Shift+Tab | Moves through the inspector, then on to the page (not trapped) | Trapped inside |
| Esc | Closes; focus returns to the row that opened it | Same |
| ↓ / ↑ in the list while open | Inspector follows the focused row after 150 ms | — |
| `[` / `]` | Previous / next row without leaving the inspector | Same |
| F6 | Cycle focus between list and inspector | — |

- **Accessibility.** Docked: `aside` (`complementary`) with `aria-label`, heading `h2` with `tabIndex={-1}`; the row's identifier link has `aria-expanded` and `aria-controls`. Drawer: `role="dialog"`, `aria-modal="true"`, labelled by its title. Both restore focus to the invoking row (`[data-row]` exists, `kit/CollectionView.tsx:107`); if the row is gone, to the list's heading. The open item is in the URL and opened with `pushState`.
- **Sizing.** Docked 352 px (416 px from 1536); padding 16; title `title` 16/24; close button 28 px with a 16 px icon; footer 48 px with primary actions at the start and destructive ones in a Menu at the end; elevation 1 docked (border, no shadow), elevation 3 as a Drawer.
- **Responsive behaviour.** Docked from 1280 px; Drawer from 768 px to 1279 px; full-screen below 768 px with a back chevron. From 1920 px the screen may use a side-by-side detail pane instead (P3-8).
- **Usage guidance.** Inspector for peeking at a selected row; a full page when the object needs tabs, editing or a URL people share; Dialog for a blocking question.
- **Anti-patterns.** Two behaviours for one component decided by a breakpoint; a destructive button beside the primary one in the footer (`screens/Tenants.tsx:104-116`); a read-only modal sheet where a non-modal inspector is needed (`screens/Data.tsx:281-312`).

### 3.25 Modal (Dialog)

- **Purpose.** A short task or decision that must finish before the user returns to the page.
- **Today.** ui `Dialog` (`packages/ui/src/Dialog.tsx`, 15 uses): sizes `regular` 30 rem, `wide` 46 rem, `palette`; Base UI focus trap, Escape, backdrop. Gaps: no close control (`:27-48`), so the full-screen `palette` size has no exit on a phone; no footer slot, so every dialog hand-builds `flex justify-end gap-2` (`ListScreen.tsx:198`, `packages/ui/src/Dialogs.tsx:149`); title is 16 px while the SideSheet title is 18 px; scrims differ (`bg-ink/40` vs `bg-ink/30`). `CreateDialog` keeps its values on Cancel, including a password (`ListScreen.tsx:127,153`), shows no busy label (`:200`) and defaults silently (workspace Type = Dev, `screens/Tenant.tsx:306-340`).
- **Anatomy.** `Title [×]` · description · body (scrolls) · footer `[Cancel] [Primary]` right-aligned, destructive action left-aligned when present.
- **Variants.** `regular` 480 px, `wide` 736 px, `form` (footer bound to a form with SaveBar rules), `fullscreen` (below 768 px).
- **States.** closed; opening (240 ms); open; submitting (primary Button loading, fields disabled, Esc and backdrop ignored); error (InlineError `summary` above the footer); dirty (closing asks "Discard what you entered?").
- **Keyboard behaviour.** APG modal dialog pattern.

| Key | Action |
|---|---|
| Tab / Shift+Tab | Cycle within the dialog |
| Esc | Close (asks first when dirty; ignored while submitting) |
| Enter | Submit the form when focus is in a single-line field |
| ⌘/Ctrl+Enter | Submit from anywhere in the dialog |

- **Accessibility.** `role="dialog"`, `aria-modal`, `aria-labelledby` the title (a heading), `aria-describedby` the description. Initial focus on the first field, or on the least destructive button when there are no fields. Focus returns to the invoker. A close button named "Close" on every size.
- **Sizing.** Radius 12, elevation 3, padding 24 (16 below 768 px); title `title` 16/24; footer buttons 32 px; max height 85 vh with the body scrolling.
- **Responsive behaviour.** Full-screen below 768 px with the footer pinned.
- **Usage guidance.** Short creates (up to about five fields) and blocking questions. Longer or reference-heavy tasks use a Drawer or a page. A second dialog over a first is not allowed (today a second question silently cancels the first, `packages/ui/src/Dialogs.tsx:68-72`).
- **Anti-patterns.** Remembered values after Cancel; an irreversible choice with a silent default; no way out on touch.

### 3.26 ConfirmDialog

- **Purpose.** Asks before an action that is destructive or hard to undo, and states exactly what will be affected.
- **Today.** `ask.confirm` (30 calls), `ask.prompt` (12), `ask.typeToConfirm` (3) through `DialogsProvider` (`packages/ui/src/Dialogs.tsx`), lint-enforced against native dialogs; options `title`, `text`, `action`, `cancel`, `danger`, `expected`. Gaps: confirms state consequences but do not list them ("Anything that uses it will fail", `screens/Tenant.tsx:706`, while `secretUses(row.name)` holds the list); `typeToConfirm` does not show the expected text in mono and asks for a slug the title does not show (`screens/Environments.tsx:1151-1153`); it renders `primary` unless `danger` is passed (`screens/SingleSignOn.tsx:1027-1032`); "Remove this widget" and "Stop sharing" have no confirm; "Delete for good" on a table uses a simple confirm (`screens/Data.tsx:668-674`); `RemoveButton` titles are "Remove?" / "Delete?" (`ListScreen.tsx:325`); undoable removals confirm (`screens/FlowEditor.tsx:1331-1337`) while one-click production pauses do not (`screens/Environments.tsx:92`).
- **Anatomy.**

```
Delete the secret STRIPE_KEY?                                    [×]
This cannot be undone. In Clinics (PRODUCTION):
  Used by 3 — billing/charge (script) · billing/refund (script) · nightly (flow)   ← links
  [Show all 3]
Type STRIPE_KEY to confirm: [___________]           (level 3 only)
                                             [Cancel]  [Delete secret]
```

- **Variants.** Level 1 `confirm` (reversible or narrow: named action, one sentence). Level 2 `danger` (destructive: blast-radius ReferenceList, EnvTag when in production, danger-solid action). Level 3 `type-to-confirm` (irreversible and broad: tenant, workspace, table "delete for good", identity provider, a secret in use in production). `prompt` (needs a reason or note; the field may be optional).
- **States.** loading references ("Checking what uses it…", action disabled until known or failed); ready; nothing affected ("Nothing deployed uses it"); references failed to load (says so; level rises by one); typed text matching / not matching; submitting; failed (InlineError, dialog stays).
- **Keyboard behaviour.** APG alert dialog pattern.

| Key | Action |
|---|---|
| (open) | Focus on Cancel at level 2; on the text field at level 3; on the action at level 1 |
| Enter | Activates the focused button; in the level-3 field, submits only when the text matches |
| Esc | Cancel |
| Tab | Cycles; links in the blast-radius list are reachable |

- **Accessibility.** `role="alertdialog"`, labelled by the question and described by the consequence text. The expected text is shown in `code`, selectable, and is the field's label ("Type STRIPE_KEY to confirm"). The action button's name is the verb and the object ("Delete secret"), never "OK".
- **Sizing.** `regular` Dialog; blast-radius list rows 28 px, at most 5 before "Show all N"; EnvTag at the title.
- **Responsive behaviour.** As Dialog.
- **Usage guidance.** Do not confirm an action that has Undo (remove a flow step, set a draft aside): act and offer Undo in a Toast. Confirm at level 2 or 3 whenever production, other users or stored data are affected.
- **Anti-patterns.** A consequence stated without the list; red buttons for reversible actions ("Set aside", `screens/Release.tsx:260-278`); a confirm whose title omits the object.

### 3.27 SplitPane

- **Purpose.** Two or three regions side by side or stacked, resizable by the user, with sizes remembered.
- **Today.** Does not exist. A repository search for resize handles finds none; sizes are fixed: flow editor aside 22 rem (`screens/FlowEditor.tsx:1091`), script settings panel 22 rem and editor 34 rem (`screens/Authoring.tsx:697,708`), test panel max 45 vh (`screens/FlowTestPanel.tsx:58`), log box 28 rem, docked Inspector 352/416 px. The only remembered layout is the section panel (`localStorage["vx-panel"]`, `Shell.tsx:107-114`).
- **Anatomy.** `[pane A] ┃ [pane B]` — a 1 px divider with an 8 px hit area and a visible grip on hover and focus; optional collapse buttons at the divider.
- **Variants.** `horizontal` (side by side), `vertical` (stacked: code over output), nested once at most; `collapsible` panes.
- **States.** Divider: default, hover, focus-visible, dragging, at-minimum, at-maximum. Pane: open, collapsed (a 28 px rail with its title, clickable to restore).
- **Keyboard behaviour.** APG window splitter pattern.

| Key | Action |
|---|---|
| Tab | The divider is one tab stop |
| ← / → (horizontal), ↑ / ↓ (vertical) | Resize by 16 px; with Shift by 64 px |
| Home / End | Collapse to minimum / expand to maximum |
| Enter | Toggle collapse of the primary pane |
| Double-click / `0` | Reset to the default size |

- **Accessibility.** Divider `role="separator"` with `aria-orientation`, `aria-valuenow`/`aria-valuemin`/`aria-valuemax` (percent), `aria-controls` the primary pane and a label ("Resize output"). The drag has a keyboard equivalent (WCAG 2.5.7). Each pane is a labelled region.
- **Sizing.** Minimum pane 240 px (160 px for a collapsed-capable rail); hit area 8 px, at least 24 px long target at the grip; sizes stored per user and per screen key (`vx-split:<screen>`), in pixels for fixed side panes and as a ratio for code/output.
- **Responsive behaviour.** Below 1024 px a horizontal split stacks or turns its secondary pane into a Drawer; stored sizes are clamped to the viewport on load.
- **Usage guidance.** Script editor (code | test and output), flow editor (canvas | inspector, canvas over test), run page (log | input/output), DataTable with a resizable docked Inspector.
- **Anti-patterns.** A fixed-height editor inside a scrolling page with output below the fold (`screens/Authoring.tsx:697-742`); an inspector field squeezed to about 170 px with no way to widen it (`screens/FlowEditor.tsx:1494`).

### 3.28 Tabs (URL-backed)

- **Purpose.** Switches between views of the same object without losing the object.
- **Today.** Four implementations: ui `Tabs` (`packages/ui/src/Tabs.tsx`, 6 uses; Base UI, 14 px, selected = action colour, state in the component); `AccessTabs` link-tabs (`screens/Members.tsx:31-48`, 13 px, selected = ink, URL path); hand-made toggle pills with `aria-pressed` (`screens/Data.tsx:592-600`); a hand-made segmented radio group (`screens/Interfaces.tsx:1316-1335`). `Stepper` is used as a second tab row above real tabs (`screens/SingleSignOn.tsx:1098,1114`). No ui `Tabs` selection is in the URL (`screens/RunPage.tsx:388`, `screens/Runs.tsx:575`, `screens/Flows.tsx:705`); the Release step is addressable only for "deploy".
- **Anatomy.** `[Logs] [Input] [Output 2] [Details]` on a baseline rule; panel below.
- **Variants.** `Tabs` (views of one object; value in `?tab=`, written with `replaceState`); `RouteTabs` (each tab is its own route and a real link); `local` (inside an inspector or ResultView, state not in the URL by default).
- **States.** Tab: default, hover, focus-visible, selected (2 px `action` underline plus ink text), disabled (with a Tooltip reason), with count (Badge), with problem (danger dot plus "has errors" in the name). Panel: LoadState per panel; inactive panels keep their scroll and state.
- **Keyboard behaviour.** `Tabs` and `local` follow the APG tabs pattern with automatic activation. `RouteTabs` are links in a `nav`.

| Key | Tabs / local | RouteTabs |
|---|---|---|
| Tab | One stop (the selected tab), then into the panel | Each link is a stop |
| ← / → | Previous / next tab, activates it, wraps | — |
| Home / End | First / last tab | — |
| Enter / Space | Activate (already active on focus) | Follow the link |

- **Accessibility.** `role="tablist"` with a label, `tab` with `aria-selected` and `aria-controls`, `tabpanel` labelled by its tab and focusable when it has no focusable child. `RouteTabs`: `nav` with a label and `aria-current="page"`, no tab roles. An unknown `?tab=` falls back to the default without an error.
- **Sizing.** 32 px tabs, `body` 14/20 medium, 16 px inline padding, 2 px underline; `local` 28 px with `body-sm`.
- **Responsive behaviour.** Overflowing tabs scroll horizontally with edge fades; more than six move into a trailing "More" Menu.
- **Usage guidance.** The default tab depends on state (Output for a succeeded run, Error for a failed one). Steps of a process use `Stepper`; mutually exclusive views of data use a `single` FilterBar.
- **Anti-patterns.** `aria-pressed` pills as tabs; a second tab row; tab state lost on reload.

### 3.29 FormField

- **Purpose.** The frame around every input: label, required mark, hint, control, error.
- **Today.** The frame exists three times: `Frame` in `packages/ui/src/Fields.tsx:15-29` (Base UI `Field`), a copy in `packages/ui/src/Combobox.tsx:33-52` whose `<label>` wraps control, chips, hint and error, and a copy in `packages/ui/src/SchemaForm.tsx:327-378`. Hand-rolled labels skip it (`screens/Audit.tsx:254`, `screens/Roles.tsx:124`, `packages/screens/src/Renderer.tsx:629,641`). No required mark; 14 labels say "(optional)" and 28 call sites pass `required={false}` defensively because `CreateDialog` defaults to required (`ListScreen.tsx:189`). The error replaces the hint and is not linked (3.22). Field gap is 12 px in `CreateDialog` and 16 px elsewhere. Control boundary is `line` at 1.41:1. Four bare file inputs (`screens/Data.tsx:447`, `screens/Environments.tsx:1103`, `screens/Branding.tsx:384`, `screens/InstanceBranding.tsx:136`).
- **Anatomy.**

```
Label  (optional)                         [help ?]
hint text
[ control                               ]
⚠ error text
```

- **Variants.** `stacked` (default), `inline` (label left, for dense settings ≥1024 px), `checkbox` (control before label), `group` (`fieldset` + `legend` for radios and related fields); `size` compact 28 / standard 32 / comfortable 36.
- **States.** default, hover, focus-visible, filled, disabled, read-only (shown as text with a lock icon, still copyable), invalid (danger boundary + icon + InlineError), validating (spinner in the control), changed (a dot beside the label inside a SaveBar form).
- **Keyboard behaviour.** Native control behaviour; the help button opens a Tooltip or popover; Enter in a single-line field submits its form.
- **Accessibility.** A real `<label for>`; hint and error both in `aria-describedby`; `aria-required` with the visible convention "optional fields are marked, everything else is required"; `aria-invalid` on the control; groups use `fieldset`/`legend`.
- **Sizing.** Label `body-sm` 13/18 medium; hint and error `body-sm`; label-to-control 4 px; field gap 16; control radius 6; boundary `line-control`; widths from a fixed set (160, 240, 320, 480 px, full) chosen by expected content, replacing the 23 ad hoc `max-w-*` values.
- **Responsive behaviour.** `inline` becomes `stacked` below 1024 px; controls go full width below 768 px and use 36 px height on touch.
- **Usage guidance.** Every input, including search-like inputs inside forms, file inputs (a kit `FileField`) and Monaco `field` editors.
- **Anti-patterns.** Placeholder as label; a rule carried in the label ("needed to reject", `screens/ApproveLink.tsx`); fields always shown that do not apply (workspace "Promotes to" when Type is Production, `screens/Tenant.tsx:306-340`).

### 3.30 SchemaForm

- **Purpose.** Draws a form from a JSON Schema: run input, step input, trigger input, connection settings.
- **Today.** ui `SchemaForm` (`packages/ui/src/SchemaForm.tsx:707`; props `schema`, `value`, `onSubmit`, `submitLabel`, `onCancel`, `errors`, `disabled`, `onChange`): nested objects, arrays with Move up/down/Remove buttons, `anyOf`/`oneOf` switch, a Fields/JSON toggle, validation on submit with focus on the first invalid field (`:782-783`), server errors mapped by JSON pointer (`InputDialog.tsx:10-17`). Used through `InputDialog`/`InputForm` in run, test, schedule and palette flows. Two other form engines exist: ui `Form` (0 console uses) and `CreateDialog`'s `FormField` list (`ListScreen.tsx:19-34`). Gaps: plain script steps in the flow editor get one free-text "Input" expression although the schema is loaded (`screens/FlowEditor.tsx:1271-1277,408-415`); the input schema itself is edited as a JSON textarea (`screens/Authoring.tsx:542-558`); JSON mode is a 10-row textarea (`:830-848`); array rows carry three text buttons each (`:597-620`); its own copy of the field frame.
- **Anatomy.** Mode switch `[Fields | JSON]`; fields in schema order; arrays as rows with a drag-free reorder control; footer or external SaveBar.
- **Variants.** `dialog` (with footer), `embedded` (no footer; the host supplies submit), `expression` (each field may switch to an expression with a live value preview, for flow steps), `readOnly` (renders KeyValue).
- **States.** As FormField per field; form: pristine, dirty, submitting, invalid (InlineError `summary`), schema loading ("Reading the input from the code…"), schema missing (falls back to JSON mode with an explanation), unsupported keyword (that field alone falls back to a JSON `field` editor).
- **Keyboard behaviour.** Native fields; array rows:

| Key | Action |
|---|---|
| Alt+↑ / Alt+↓ on a row | Move the row up / down |
| ⌘/Ctrl+Backspace on a row | Remove the row (with Undo) |
| ⌘/Ctrl+Enter | Submit from any field, including JSON mode |

- **Accessibility.** Nested objects are `fieldset`s with legends; array rows are a list whose items are named "Item 2 of 4"; row buttons are icon buttons with names ("Move item 2 up"); errors follow InlineError; the mode switch is a `single` FilterBar.
- **Sizing.** FormField sizes; nested groups indent 16 px with a `line` rule, not a box (no card in card); JSON mode uses CodeEditor `field`.
- **Responsive behaviour.** Single column up to 640 px of container width; two columns for short scalar fields above that when the schema marks them compact.
- **Usage guidance.** The only way to enter structured input. Hand-assembled settings forms are fine for fixed platform settings but use FormField and SaveBar.
- **Anti-patterns.** A free-text JSON or expression box where a schema exists; three form engines; text buttons "Up / Down / Remove" on every row.

### 3.31 SaveBar

- **Purpose.** One save model: shows whether there are unsaved changes, saves or autosaves them, and guards against losing them.
- **Today.** Does not exist. Four models coexist: explicit Save with a neutral "Unsaved changes" `Badge` and no guard (`screens/Authoring.tsx:630`, `screens/ResourceEditor.tsx:345`); flow autosave 1.5 s after a change, only once saved by hand, with "Not saved / Saving… / Draft saved 12s ago" (`screens/FlowEditor.tsx:702-706,836-842`) and a retry loop on persistent failure (Inferred); immediate save on change (sign-up checkbox, logo upload, managed-workers toggle, "Promotes to" select: `screens/Branding.tsx:448-457,388-392`, `screens/Environments.tsx:432-440`); explicit Save disabled until dirty (Retention, the cleanest, `screens/Retention.tsx:45-53`). There is no `beforeunload` and no router blocker anywhere; the Dashboards list says "saved as you make it" while the editor has a manual Save (`screens/Dashboards.tsx:62,202`).
- **Anatomy.** In an editor header: `● Unsaved changes · 2 problems     [Discard] [Save draft ⌘S]` → `✓ Saved 14:02`. In a settings page: a bar pinned to the bottom of the form region with the same content.
- **Variants.** `explicit` (settings and forms: Save and Discard appear when dirty); `autosave` (editors: status only, plus "Save now"); `immediate` (a single switch: the control itself shows loading then a transient "Saved" beside it, and offers Undo).
- **States.**

| State | Shown as |
|---|---|
| pristine | Nothing (`explicit`) or "Saved {time}" (`autosave`) |
| dirty | "Unsaved changes" with a dot; Save enabled |
| invalid | "Fix N fields to save"; Save disabled with the reason; links to the first field |
| saving | Button loading; "Saving…" |
| saved | "Saved {time}" for 4 s, then pristine |
| failed | Persistent "Could not save — {reason}" with Retry; autosave backs off (2 s, 4 s, 8 s … 60 s) |
| conflict | "Changed elsewhere since you opened it" with Reload theirs / Keep mine / Compare |
| offline | "Offline — changes are kept in this browser" |

- **Keyboard behaviour.**

| Key | Action |
|---|---|
| ⌘/Ctrl+S | Save now (registered in the shortcut registry and inside Monaco) |
| Esc (in an `explicit` form with focus in a field) | No effect; Discard is a deliberate button |

- **Accessibility.** The status text is a polite live region; "failed" and "conflict" are `role="alert"`. The leave guard is a Dialog for in-app navigation ("Leave without saving? Save draft / Discard / Stay") and `beforeunload` for tab close.
- **Sizing.** 48 px bar; buttons 32 px; status `body-sm` 13/18.
- **Responsive behaviour.** Pinned to the bottom of the viewport below 768 px.
- **Usage guidance.** `autosave` for script, flow, resource, dashboard and app editors, from the first change; `explicit` for settings; `immediate` only for single reversible switches, never for a production-affecting change without a confirm.
- **Anti-patterns.** Mixed models on one page (`screens/Branding.tsx`); copy that says autosave where Save is manual; an editor that remounts on first save and loses undo, test input and panel state (`screens/Tenant.tsx:444,520,596`; Inferred).

### 3.32 SecretField and OneTimeSecret

- **Purpose.** SecretField: enter or replace a value that can never be read back. OneTimeSecret: show a generated secret exactly once and make sure the user has it before it is gone.
- **Today.** SecretField: a `TextField type="password"` with per-screen copy — "Leave it empty to keep the one stored" (`screens/ConnectionWizard.tsx:442-454`), secrets set by retyping the exact name, where a typo silently creates a new secret (`screens/Tenant.tsx:686-702`). The only show/hide toggle is on sign-in (`screens/SignIn.tsx:183-195`). OneTimeSecret has five presentations: new API key in a never-dismissed Notice with `select-all` and no Copy (`screens/Account.tsx:51-56`, `ListScreen.tsx:237`); worker credential the same, with an uncopyable start command whose placeholders are unfilled (`screens/Execution.tsx:1037,1081-1088`); SCIM token with Copy, lost on tab switch (`screens/Provisioning.tsx:114-123`); invitation link in a dialog with Copy (`screens/EndUsers.tsx:47-75`); recovery codes with Copy and "I have kept it" (`screens/Account.tsx:131-132`).
- **Anatomy.**

```
SecretField    Label                          OneTimeSecret
               ●●●●●●●● set 3 May by ana      ┌ Copy this key now. It is not shown again. ┐
               [Replace value]                │ vx_live_9f…c21        [Show] [Copy]       │
               → [ new value        ] [👁]    │ $ platform login --key vx_live_…  [Copy]  │
                                              │ ☐ I have stored it            [Done]      │
```

- **Variants.** SecretField: `new`, `stored` (shows set/not set, when and by whom, with "Replace value"), `multiline` (keys and certificates). OneTimeSecret: `key`, `link`, `codes` (list + Download), each with an optional ready-to-paste `command`.
- **States.** SecretField: empty, typing (masked by default), revealed, stored-unchanged, replacing, invalid. OneTimeSecret: shown, copied ("Copied" on the button and announced), acknowledged, gone ("This key was shown once. Create a new one if it was lost").
- **Keyboard behaviour.** SecretField: native input; the reveal toggle is a button with `aria-pressed`. OneTimeSecret is a Dialog: focus starts on Copy; Esc and the close button ask "Close without copying?" until Copy or the checkbox has been used.
- **Accessibility.** SecretField: `autocomplete="new-password"` (or `off` for API tokens), never prefilled with the stored value, state "A value is stored" is text in `aria-describedby`. OneTimeSecret: the value is in a labelled read-only text field so it can be selected and read; the warning is part of the dialog's description; copy success is a polite announcement.
- **Sizing.** SecretField as FormField; value in `code` 13/20. OneTimeSecret: `regular` Dialog, value and command in `command` CodeViewers, Copy button 32 px.
- **Responsive behaviour.** Long keys wrap anywhere (`break-all`) in the dialog; Copy stays visible.
- **Usage guidance.** Every write-only value uses SecretField. Every generated credential uses OneTimeSecret as a blocking dialog, with the real instance URL substituted into commands.
- **Anti-patterns.** A secret left on screen in a Notice until the next navigation; a "Replace" flow that depends on retyping an identifier; reveal toggles on stored secrets.

### 3.33 CopyButton and Identifier

- **Purpose.** CopyButton copies a given value and confirms it. Identifier renders an ID, path, address or version in mono with copy built in.
- **Today.** Four affordances: `CopyButton` (text Button, `ListScreen.tsx:342`, 11 uses); `CopyIcon` and `CopyableId` (`kit/copy.tsx`, 7 uses; 24 px, 13 px icon; state shown by icon swap and `title` only, not announced); JsonView's hover-only Copy chip; `select-all` on `<code>` (`screens/Execution.tsx:1084`, `screens/Account.tsx:54`, `screens/EndUsers.tsx:65`, `screens/Operate.tsx:383`). Many identifiers have no copy: run ID in the list, step Run ID (`screens/Flows.tsx:774`), event ID (`screens/Operate.tsx:536`), request ID in audit. `curlFor` (`kit/copy.tsx`) is kept.
- **Anatomy.** Identifier `billing/record-pa…ment [⧉]`; CopyButton `[⧉ Copy]` → `[✓ Copied]`.
- **Variants.** CopyButton `icon` (24 px quiet), `button` (labelled), `menu` ("Copy ID / Copy link / Copy as curl"). Identifier `id` (middle truncation keeping the last 6 characters), `path` (end-preserving truncation), `link` (the text is a link to the object and the copy button sits beside it), `version` ("v12").
- **States.** default, hover, pressed, focus-visible, copied (1.5 s), failed ("Press ⌘C to copy" with the value selected), disabled.
- **Keyboard behaviour.** Button activation with Enter or Space. In a DataTable, ⌘/Ctrl+C on a focused identifier cell copies its value.
- **Accessibility.** The button's name includes what it copies ("Copy run ID"); "Copied" is announced through a polite region; the full value is available to assistive tech and in a Tooltip when truncated; target 24 × 24 minimum.
- **Sizing.** Identifier `code` 13/20 or `code-sm` 12/18; icon 14 inline, 16 in a 28 px button.
- **Responsive behaviour.** Truncation length follows the container; the copy button never wraps away from its value.
- **Usage guidance.** Every identifier a user might paste elsewhere is an Identifier (rule 4.1). Copy never depends on hover.
- **Anti-patterns.** `select-all` as a copy mechanism; copy visible only on hover; state reported through `title`.

### 3.34 ResourcePicker

- **Purpose.** Chooses a platform object (connection, table, variable, secret, data source, row reference) by name, with enough context to choose correctly.
- **Today.** Four mechanisms: `ComboboxField` (`packages/ui/src/Combobox.tsx:95`, 21 uses; Base UI combobox; clear and chip-remove targets under 24 px, `:119,172-177`); the `choose` field type in `CreateDialog` (`ListScreen.tsx:31`); `x-pick` schema hints in flow node inputs, which also write the step's grants (`screens/FlowSteps.tsx:139-151`); native selects of raw names. Reference columns in tables take raw UUIDs (`screens/Data.tsx:459-469`).
- **Anatomy.** `[icon kind  name                 ▾]` → popup: search, groups, rows `name · kind · state/health · workspace`, footer "Create new…".
- **Variants.** `single`, `multi` (chips), by kind (`connection`, `table`, `variable`, `secret`, `source`, `row`), `inline` (inside a DataGrid cell).
- **States.** empty, filled, open, loading options, no matches (offers Create), option disabled with reason ("Not bound in this workspace"), stale value (the chosen object no longer exists: shown in danger with its raw name), error loading (Retry in the popup).
- **Keyboard behaviour.** APG combobox pattern with list autocomplete.

| Key | Action |
|---|---|
| ↓ / Alt+↓ | Open; ↓ moves to the next option |
| ↑ | Previous option |
| Enter | Choose the active option |
| Esc | Close the popup; a second Esc clears the text |
| Backspace on empty (`multi`) | Remove the last chip |
| Home / End | Caret in the input |
| Type | Filter (server-side past 100 options) |

- **Accessibility.** `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-activedescendant`; options named with kind and state; the label is a FormField label (not a wrapping `<label>`); chips are buttons named "Remove {name}" with 24 px targets; one focus ring for the composite.
- **Sizing.** FormField heights; popup rows 32 px, max 320 px tall, radius 8, elevation 2.
- **Responsive behaviour.** Below 768 px the popup is a bottom sheet with the search field on top.
- **Usage guidance.** Any reference to another object. The chosen value renders as a link to the object when the field is read-only.
- **Anti-patterns.** Typing an identifier that exists elsewhere in the system; a JSON string as a select value (`screens/Interfaces.tsx:1082`); a picker that silently omits ineligible options without saying why.

### 3.35 ScriptPicker (script and flow target)

- **Purpose.** Chooses what to run: a script or a flow, deployed or draft.
- **Today.** Three builds: the schedule sheet's single target picker for scripts and flows with the kind as hint (`screens/ScheduleForm.tsx:90-99`; only flows with a manual trigger, `:97`); the flow editor's Script combobox, which offers drafts with "A draft, not yet deployed." (`screens/FlowEditor.tsx:1185-1194,433,449`); the palette's "Run script…" / "Start flow…" pickers that load whole lists uncapped (`kit/CommandPalette.tsx:315-357`). Schedules and triggers are never started from the script or flow, so the target is always re-picked.
- **Anatomy.** ResourcePicker with rows `[script|flow] path · description · Draft?/vN · last run state`.
- **Variants.** `scripts`, `flows`, `any`; `include-drafts` (dev only); `prefilled` (opened from a script or flow: shows the target as read-only text with "Change").
- **States.** As ResourcePicker, plus "has required input" (the host draws a SchemaForm for the chosen target) and "not runnable here" with the reason.
- **Keyboard behaviour.** As ResourcePicker (APG combobox).
- **Accessibility.** As ResourcePicker; kind is text, not only an icon.
- **Sizing.** As ResourcePicker; path in `code`.
- **Responsive behaviour.** As ResourcePicker.
- **Usage guidance.** Used by "Add trigger", schedules, flow steps, alert handlers and the CommandMenu. When opened from an object, the target is prefilled (P1-9).
- **Anti-patterns.** Three scheduling entry points with different target lists; filtering flows out with no explanation.

### 3.36 UserPicker (principal picker)

- **Purpose.** Chooses who: a member, group, service account, end user or end-user group.
- **Today.** Two builds: a searchable member combobox for adding an operator (`screens/Instance.tsx:144-157`), and "Give access", where Who is one native `<select>` holding every member (up to 200), group, service account, end-user group and end user in a flat list distinguished by label prefixes (`screens/Members.tsx:370-390`). The palette finds people only with `@` and opens the list, not the person.
- **Anatomy.** ResourcePicker with groups by principal kind; rows `[avatar] name · email or kind · state`.
- **Variants.** By allowed kinds; `single` / `multi`; `invite` (an email that matches nobody offers "Invite {email}").
- **States.** As ResourcePicker, plus suspended or disabled principals shown dimmed with their state, and "already has this access".
- **Keyboard behaviour.** As ResourcePicker (APG combobox); `@` is not required.
- **Accessibility.** Options named "{name}, {kind}, {email}"; avatars decorative; groups are `role="group"` with labels.
- **Sizing.** Rows 36 px with a 20 px avatar; otherwise as ResourcePicker.
- **Responsive behaviour.** As ResourcePicker.
- **Usage guidance.** Server-side search from the first character for tenants above 100 principals. The principal-first "Give access" flow (P2-11) starts here.
- **Anti-patterns.** Label prefixes to encode kind; a 200-option native select.

### 3.37 UsedBy and ReferenceList

- **Purpose.** Shows what depends on an object, as links, and feeds the blast radius of destructive confirms.
- **Today.** `UsedBy` (`kit/references.tsx:19-30`, 3 uses) with `useReferences` (one request per kind): the first three paths in mono, "and N more", the full list in a `title`; names are not links and not expandable. Present on connections, variables and secrets; absent on sources, tables, scripts ("used by flows") and connection group members. Delete confirms do not use it (3.26).
- **Anatomy.** Cell: `billing/charge, billing/refund +3` (links; "+3" opens a popover). Panel: a list `[kind] path · how it is used · workspace`.
- **Variants.** `cell` (DataTable), `panel` (inspector or page section, grouped by kind), `confirm` (inside ConfirmDialog, capped at 5 with "Show all N").
- **States.** loading (skeleton text); none ("Nothing deployed uses it"); some; many (count + expand); partial ("Drafts are not included"); error ("Could not check what uses it" — never rendered as "nothing").
- **Keyboard behaviour.** Links are tab stops; the "+N" button opens a popover (Menu keys); in `panel` the list is a `static` list.
- **Accessibility.** A `ul` with a label ("Used by 5"); each link named with kind and path; the count is text.
- **Sizing.** `code-sm` 12/18 in cells, `code` in panels; panel rows 28 px.
- **Responsive behaviour.** `cell` shows the count only below 1024 px ("5 uses").
- **Usage guidance.** Every object that can be referenced has a `panel`; every destructive confirm on such an object has a `confirm` list.
- **Anti-patterns.** References as plain text; the full list only in a tooltip; a consequence sentence without the list.

### 3.38 Toast

- **Purpose.** Brief confirmation of a completed action, with the result and the next step, away from the content.
- **Today.** ui `Toast` (`packages/ui/src/Toast.tsx`): `show(message, tone)`, `success`, `danger`, `dismiss`; text only; fixed bottom-right; 5 s for every tone including errors (`:35,56-59`); every toast is a new `role="status"` element (`:84`); no pause, no cap, no merge; dismiss target about 16 × 20 px (`:88-95`). Console wrapper `notify.success` (19 calls in 12 files) and `notify.error` (54 calls); 28 of the 40 files with API writes never call `notify.success`.
- **Anatomy.** `[icon] Deployed v13 to Sandbox      [Open] [Promote…]  [×]`.
- **Variants.** `success` (auto-dismiss), `info`, `undo` (action "Undo", 8 s, with a progress cue), `error` (persistent until dismissed), `progress` (a long task: updates in place and resolves to success or error).
- **States.** entering (180 ms), visible, paused (hover or focus within), exiting, stacked (at most 3 visible, older ones collapse into "+2 more"), merged (identical messages increment a count).
- **Keyboard behaviour.**

| Key | Action |
|---|---|
| F6 (registry) | The notifications region is one of the regions F6 cycles through; focus lands on the newest toast |
| Tab | Through the toast's actions and dismiss |
| Esc (focus in a toast) | Dismiss it |
| ⌘/Ctrl+Z | Runs the live Undo toast's action when focus is not in an editor |

- **Accessibility.** One persistent region (`role="region"`, label "Notifications") containing a polite live area for success/info and an assertive one for errors, so messages are inserted into an existing live region; toasts never take focus on arrival; success toasts stay 6 s and pause on hover and focus; errors do not time out (WCAG 2.2.1). Dismiss target 24 × 24.
- **Sizing.** 320–400 px wide, `body` 14/20, radius 8, elevation 2, 16 px from the viewport edges, stack gap 8.
- **Responsive behaviour.** Full width at the bottom below 768 px, above the SaveBar.
- **Usage guidance.** Every write gets success feedback that names its result (rule 4.3). Use a toast when the result is elsewhere or the page changes; use inline status when the control stays in view. An error whose cause is on screen is shown inline first.
- **Anti-patterns.** A 5 s error as the only report; "Saved." with no object; a toast that covers the focused control.

### 3.39 Notice and Banner

- **Purpose.** Notice: a message that belongs to a section and stays in the flow. Banner: a message about the whole page, object or environment.
- **Today.** ui `Notice` (`packages/ui/src/Notice.tsx:11`; tones `attention`, `danger`, `success`, `plain`; optional `action`; `role="alert"` for danger and `role="status"` for the rest, including static ones present at load). 184 uses in the console, 112 of them danger. It is always bordered and filled, so a Notice inside a panel is a card in a card (three inside one panel at `screens/Release.tsx:300-324`). No `info` tone. Read-only and paused states are section notices rather than page-level banners (`screens/Authoring.tsx:675-695`, `screens/InstanceTriggers.tsx`).
- **Anatomy.** `[icon] Title — text. [Action] [×?]`.
- **Variants.** Notice: `inline` (default in panels: icon + text, a 2 px start rule, no box) and `boxed` (on canvas). Tones `info`, `attention`, `danger`, `success`. Banner: full width under the PageHeader or shell header; tones `info`, `attention`, `danger`, `production`; `dismissible` only for info.
- **States.** shown; dismissed (remembered per user for info banners); with action pending.
- **Keyboard behaviour.** None of its own; action and dismiss are tab stops.
- **Accessibility.** `role="alert"` only when a danger notice appears in response to an action; `role="status"` only for messages that appear after load; static notices have no live role. Tone is carried by icon and a leading word ("Warning:"), not colour alone.
- **Sizing.** `body` 14/20; icon 16; padding 8 × 12; Banner 40 px single line, wraps to more; radius 6 (`boxed`), none (`inline`, Banner).
- **Responsive behaviour.** Actions wrap below the text under 480 px.
- **Usage guidance.** Banner for: production read-only, triggers paused (workspace or instance), stale data, session ending, an object changed elsewhere. Notice for local explanations. At most one Banner per tone per page.
- **Anti-patterns.** Stacked notices in one panel; a Notice replacing a whole page (use ErrorState); one-time secrets in a Notice (use OneTimeSecret).

### 3.40 Button

- **Purpose.** Triggers an action or, as a link, navigates.
- **Today.** ui `Button` (`packages/ui/src/Button.tsx`): variants `primary`, `secondary`, `quiet`, `danger`, `danger-solid`, `promote`; sizes `regular` 36 px and `small` 28 px; renders `<a>` when given `href`; `type="button"` default. Gaps: no pressed style; no loading state (72 `disabled={busy…}` sites, 5 change the label); `aria-pressed` passes through unstyled (`screens/Data.tsx:174`, `screens/FlowEditor.tsx:920`), so one screen swaps `variant` instead (`screens/GitSync.tsx:211`); disabled is 50 % here and 60 % on fields; secondary boundary `line` at 1.41:1; `promote` is `canvas` on `attention` at 4.43:1; icons in the kit are text glyphs.
- **Anatomy.** `[icon?] Label [Kbd?]`; icon-only buttons are square with a Tooltip.
- **Variants.** Emphasis: `primary` (one per region), `secondary`, `quiet`, `danger` (text), `danger-solid` (only inside ConfirmDialog), `promote` (only for the act that changes production). Kinds: button, link, `toggle` (`aria-pressed`), `split` (primary + menu, for "Deploy ▾"), `icon`.
- **States.**

| State | Treatment |
|---|---|
| hover | Background step, 120 ms |
| pressed | Darker step and 1 px inset; for `toggle` on: `selected` background, ink text, inset cue |
| focus-visible | 2 px ring, 2 px offset |
| disabled | 50 % opacity, `aria-disabled`, focusable when it has a reason Tooltip |
| loading | Spinner replaces the leading icon, label unchanged or progressive ("Deploying…"), width fixed, `aria-busy`, clicks ignored |
| success (optional) | Check icon for 1.5 s on icon buttons such as Copy |

- **Keyboard behaviour.** APG button pattern: Enter and Space activate; a `toggle` flips `aria-pressed`; a `split` button's menu part follows the menu button pattern; link buttons activate with Enter only.
- **Accessibility.** The name is a verb and its object ("Delete secret"); icon buttons have `aria-label` and a Tooltip; loading announces through `aria-busy` plus a polite "Deploying…"; a disabled link is not rendered as a link.
- **Sizing.** Opt-in `size`: `compact` 28, `standard` 32 (console kit default), `comfortable` 36 (current ui default, unchanged); icon buttons 28 px with a 16 px icon, minimum target 24 × 24; radius 6; inline padding 12; label `body` 14/20 medium (`body-sm` at 28 px); boundary `line-control` on `secondary`.
- **Responsive behaviour.** 36 px on touch below 768 px; labels never wrap, and long labels truncate with a Tooltip.
- **Usage guidance.** One primary per region, placed last. Destructive actions sit apart from the primary. A button that navigates is a link.
- **Anti-patterns.** Two filled buttons side by side (Approve and a red Reject, `screens/ApproveLink.tsx:146-151`); a busy button that only fades; a toggle whose state is invisible.

### 3.41 Shortcut hint (Kbd) and the shortcut registry

- **Purpose.** Kbd shows a key combination next to the action it triggers. The registry is the one place shortcuts are declared, scoped, checked for conflicts, displayed and turned off.
- **Today.** Two hand-written `<kbd>` elements (`Shell.tsx:895`, `screens/Authoring.tsx:603`), showing "⌘K" on every platform. Four independent `window` listeners: ⌘K (`kit/CommandPalette.tsx:112-123`), `?` (`:750-766`), ⌘↵ in the script editor (`screens/Authoring.tsx:314-325`), undo/redo in the flow editor (`screens/FlowEditor.tsx:740-753`). A static `SHORTCUTS` list for the sheet (`kit/CommandPalette.tsx:735-746`) that advertises `j k` with no handler and omits Monaco and canvas keys; the sheet is reachable only by pressing `?`. No ⌘S anywhere. ⌘↵ can fire in both the palette and the editor (Inferred). The single-key `?` cannot be turned off (WCAG 2.1.4).
- **Anatomy.** Kbd `⌘` `K` (one cap per key; "then" between chord parts: `g` then `r`). Registry entry: `{ id, keys, scope, label, when, run }`.
- **Variants.** Kbd: `inline` (menus, tooltips, buttons), `legend` (CommandMenu footer, shortcut sheet). Scopes: `global`, `list`, `editor`, `canvas`, `dialog`; the innermost active scope wins.
- **States.** Registered; shadowed (an inner scope uses the same keys); disabled (`when` is false: shown dimmed in the sheet); user-disabled (single-key shortcuts off).
- **Keyboard behaviour.** The base set every screen can rely on:

| Keys | Scope | Action |
|---|---|---|
| ⌘/Ctrl+K | global | CommandMenu |
| `?` | global, outside inputs | Shortcut sheet |
| `/` | list | Focus search |
| `j` / `k`, ↓ / ↑ | list | Next / previous row |
| Enter, `x`, Esc | list | Open, check, clear or close |
| `[` / `]` | inspector, run page | Previous / next item |
| `g` then a letter | global, outside inputs | Go to a section |
| ⌘/Ctrl+S, ⌘/Ctrl+Enter | editor | Save, run |
| ⌘/Ctrl+Z, Shift+⌘/Ctrl+Z | editor, canvas, undo toast | Undo, redo |
| F6 | global | Cycle regions (rail, panel, main, inspector) |

- **Accessibility.** Single-character shortcuts are active only outside text inputs and can be turned off or remapped in Account settings (WCAG 2.1.4). Kbd text is read as words ("Command K") through `aria-label`; modifier glyphs follow the platform (⌘ on macOS, Ctrl elsewhere). Buttons expose their shortcut with `aria-keyshortcuts`.
- **Sizing.** Kbd `code-sm` 12/18, min width 20 px, height 20 px, radius 4, 1 px `line-strong` border, 2 px gap between caps.
- **Responsive behaviour.** Kbd hints are hidden on touch-only devices.
- **Usage guidance.** A shortcut exists only through the registry; the sheet, Tooltips, Menus and the CommandMenu read from it, so nothing can be advertised that is not bound (P0-6). The sheet is also opened from the account menu and the CommandMenu.
- **Anti-patterns.** `window.addEventListener("keydown")` in a screen; a hint hard-coded to one platform; a shortcut shown only in a `title`.

### 3.42 LiveIndicator

- **Purpose.** Says whether what is on screen is live, catching up or stale, and offers a manual refresh.
- **Today.** One label in the Runs header, "Live" or "Live · updates every 5s", shown only while a run in the loaded rows is in progress (`screens/Runs.tsx:215-219`). `useStreamConnected` exists (`stream.ts:123-132`) but nothing else shows it; no "reconnecting", no "last updated", no refresh button on run pages, overview, approvals or triggers. Reconnection is left to the browser with no backoff or give-up (`stream.ts`). A flow run's polling stops after one failed read (`screens/Flows.tsx:600-602`).
- **Anatomy.** `● Live` · `◌ Reconnecting…` · `○ Stale since 14:02 [Refresh]` · `◔ Updates every 5 s`.
- **Variants.** `shell` (one per tab, in the header, compact), `region` (in a Toolbar or run header, with text), `inline` (beside a running RunStatus as an elapsed timer).
- **States.**

| State | Condition | Treatment |
|---|---|---|
| live | Stream connected | Success dot, static; text "Live" |
| polling | Stream down, timer fallback active | Neutral dot; "Updates every 5 s" |
| reconnecting | Stream lost under 10 s | Attention ring; "Reconnecting…" |
| stale | No update path for 10 s or more, or last refresh failed | Attention; "Stale since {time}" + Refresh |
| paused | Tab hidden or user paused | Neutral; "Paused" |
| offline | Browser offline | Danger; "Offline" |

- **Keyboard behaviour.** Refresh is a button (Enter/Space); `r` in `list` scope refreshes when the indicator is stale.
- **Accessibility.** State is text plus shape, not colour alone. Transitions to `stale` and `offline` and back to `live` are announced politely once; `reconnecting` is not announced unless it lasts 10 s.
- **Sizing.** Dot 8 px with a 14 px icon alternative; text `meta` 12/16; Refresh button 28 px.
- **Responsive behaviour.** `shell` shows the dot only below 1024 px, with the text in a Tooltip and the accessible name.
- **Usage guidance.** Any screen that shows runs, queues, approvals or logs shows a `region` indicator. On entering `stale`, a Banner appears on run pages.
- **Anti-patterns.** Indicating liveness only when something happens to be running; silent polling that stops after one failure; a running state with no elapsed time.

### 3.43 EnvTag

- **Purpose.** Marks the environment (production or dev) of a workspace wherever a workspace, or an action in it, is shown.
- **Today.** `EnvTag` (`kit/status.tsx:127`, 9 uses in 6 files): a 10.5 px outlined `Tag`, amber for production, teal for dev. `TypeBadge` renders the same fact as a filled `Badge` (`screens/Tenant.tsx:95`). The production tone is reused for "Paused" (`Shell.tsx:773`, `screens/Overview.tsx:344`), "Not bound" (`screens/Runs.tsx:681`, `screens/RunPage.tsx:330`) and "Instance · operator" (`Shell.tsx:858`), which dilutes it. The header, rail and page do not otherwise change in production, and `attention` on canvas is 4.43:1 in light.
- **Anatomy.** `[PRODUCTION]` / `[DEV]`. In the shell it is paired with the frame-level production signal defined in `06-design-direction.md` (P4-5).
- **Variants.** `tag` (default, inline), `shell` (in the Breadcrumb, with the frame-level signal), `confirm` (inside ConfirmDialog titles and on the `promote` Button's context line).
- **States.** production, dev, unknown (neutral tag with the raw type).
- **Keyboard behaviour.** None; not focusable.
- **Accessibility.** Text, not colour, carries the meaning; contrast from the corrected `attention` token; instance branding is checked so an operator cannot make it unreadable (P0-2).
- **Sizing.** `tag` 10.5/12 mono semibold uppercase, 20 px tall, radius 4; `shell` variant 12 px text.
- **Responsive behaviour.** Never hidden at any width; in the phone header it stays beside the workspace name.
- **Usage guidance.** Amber is reserved for production and warnings; other classifications use neutral `Tag` tones (P4-5). Every destructive or state-changing confirm in production carries an EnvTag.
- **Anti-patterns.** `Tag tone="production"` for anything that is not the environment; a `Badge` for workspace type.

---

## 4. Cross-component rules

### 4.1 Every identifier is copyable and every reference is a link

An ID, path, address, version, token prefix or command renders through Identifier or CodeViewer `command` and can be copied without selecting text. A mention of another object (a run's script, a step's run, a trigger's target, a "used by" entry, a version, a connection in "Uses") is a real `<a href>` to that object's own URL, not to its list. Where an object has no URL today (connection, variable, secret, event, approval, published app, deployment version), the link target is the list with `?item=<id>` opening its Inspector (P1-10). Why: the dominant journeys in `04-workflow-journey-audit.md` lose time re-finding objects that were named on screen.

### 4.2 The URL is the source of view state

Tab, step, filters, search, sort, the open row and the active view are query parameters read on load. Changing a filter, sort or tab uses `replaceState`; opening an object (row → Inspector, step, dialog-as-route) uses `pushState` so Back closes it. Defaults are omitted. Per-user layout (pane sizes, density, column choice, collapsed panels) is stored per user and screen, not in the URL. An unknown parameter value falls back to the default silently. Why: today only Runs and the selected trigger can be shared or reloaded without losing the view (`router.tsx:48`).

### 4.3 Feedback names its result

Every write ends in feedback that says what now exists or changed, in the object's terms, and offers the next step: "Deployed v13 to Sandbox — Open · Promote…", "Paused trigger nightly-sync — Undo", "Approved; run 8f2c continues — Open run". "Saved." and silent list refreshes are not feedback. Errors say what was not done, why, and what to do; they sit beside the cause and persist. Why: 28 of the 40 files that write to the API never confirm success with a toast today (some use inline status, most rely on the list changing), and several journeys end on an inline sentence with no link to the result (`screens/Release.tsx:557-565`).

### 4.4 Destructive actions state the blast radius

A destructive or production-affecting action shows, before it runs: the object by name, the environment (EnvTag), what depends on it (ReferenceList), whether it can be undone, and a button named with the verb and the object. Reversible actions run immediately and offer Undo instead of a confirm. Irreversible and broad actions require typing the name. A failed dependency check raises the confirmation level; it never reads as "nothing uses it".

### 4.5 Keyboard shortcuts are shown where the action is shown

A shortcut appears as a Kbd in the button's Tooltip, the Menu item, the CommandMenu row and the shortcut sheet, all read from the registry. No shortcut exists without a visible control for the same action, and no hint is shown for a key that is not bound in the current scope.

### 4.6 Supporting rules

- **One mark per fact.** A state is drawn once per row or header (StatePill), not as a pill plus a tag plus a coloured border.
- **No information in `title`.** Truncated text and disabled reasons use Tooltip and remain reachable by keyboard and touch.
- **No hover-only controls.** Row actions, Copy and sort affordances are visible at rest, at reduced emphasis.
- **Unknown values render verbatim.** An unexpected enum value shows as its raw text in a neutral mark; it never throws and is never mapped to a neighbour.
- **One format module** for timestamps, durations and counts (P4-6): relative in lists with the absolute time on focus/hover, tabular mono, "1 h 2 m" not "3725.0 s".

---

## 5. Migration map

Call-site counts are from `02-design-system-forensics.md` and the area notes. Order: 1 = first (a prerequisite or a P0 defect), 6 = last.

| Existing component or idiom | Call sites today | Moves to | Order | Notes |
|---|---|---|---|---|
| `StatePill` lookup without a fallback (`kit/status.tsx:79`) | 63 uses in 21 files | RunStatus / StatePill with `unknown` | 1 | P0-1; one-line fix before any migration |
| Docked `Inspector` (`kit/layout.tsx:85`) | 13 uses | Inspector focus contract (3.24) | 1 | P0-3; behaviour change inside the component, no call-site edits |
| `Toast` roles and timing (`packages/ui/src/Toast.tsx`) | `notify.error` ×54, `notify.success` ×19 | Toast v2 | 1 | P0-7; `notify.*` API kept, gains `{ action, link, undo }`; error persistence is opt-in in `packages/ui` and on in the console provider |
| New-key / new-credential Notices (`screens/Account.tsx:51-56`, `screens/Execution.tsx:1081-1088`, `ListScreen.tsx:237`) | 5 presentations | OneTimeSecret | 1 | P0-10 |
| `ask.confirm` on destructive actions without a list; missing confirms | `ask.confirm` ×30, `ask.typeToConfirm` ×3, `RemoveButton` | ConfirmDialog levels 1–3 with ReferenceList | 1–2 | P0-9; `ask.*` API kept, gains `uses` and `level` |
| `CreateDialog` (`ListScreen.tsx:116`) | 14 create/config dialogs in the tenant-admin area (most through `CreateDialog`) | Dialog `form` + FormField + SchemaForm | 2 | Clear on cancel; no silent defaults; busy label |
| Bare "Loading…" paragraphs; `null` while loading | 37 paragraphs (45 occurrences); 7 `null` returns | LoadState with skeleton | 2 | P2-4; mechanical once LoadState exists |
| `<Notice tone="danger">` as a load error | 112 uses, 9 with retry | ErrorState (load failures) / InlineError (write failures) / Notice (explanations) | 2 | Triage each site into one of the three |
| Hand-rolled Runs table (`screens/Runs.tsx:316`) | 1 | DataTable `interactive`, compact | 2 | P1-1; first DataTable consumer, proves sort, URL state, keyboard, paging |
| `CollectionView` (`kit/CollectionView.tsx`) | 16 uses in 11 files | DataTable + PageHeader `workbench` + Toolbar | 3 | Column type is compatible (`header`, `cell`, `priority`, `align`); `CollectionView` becomes a thin wrapper, then is removed |
| `ListCollection` (`kit/ListCollection.tsx`) | 3 uses in 2 files | DataTable + SearchField + Inspector, selection in URL | 3 | |
| `ListScreen` → ui `Table` (`ListScreen.tsx:210`) | 13 uses in 5 files | DataTable (`interactive` where rows have a detail, `inset` for sections) | 3 | Keeps "Try again"; gains keyboard, empty action |
| ui `Table` direct (`packages/ui/src/Table.tsx`) | 14 uses in 10 files | DataTable `static` or `interactive` | 4 | ui `Table` itself stays for tenant apps (defaults do not move) |
| Other hand-rolled tables (`screens/Execution.tsx:857,1165`, `screens/Roles.tsx:154`, `screens/RowRules.tsx:312`) | 4 | DataTable `static` / `interactive` | 4 | Roles matrix is `static` with a checkbox grid |
| ui `Grid` (`packages/ui/src/Grid.tsx`) | 1 console use + app table widget | DataGrid (`navigation="grid"` opt-in) | 4 | P2-9; widget default unchanged |
| `Pagination` (`packages/ui/src/Pagination.tsx`), "Load more", "Show older entries", bolt-on Previous/Next | 0 / 1 / 1 / 1 | DataTable footer | 3 | With the DataTable migrations |
| `Page` (`ListScreen.tsx:95`) | 23 uses in 16 files | PageHeader `page` + page layout | 3 | The unused `width="form"` branch is dropped |
| `PageHeader` direct (`kit/layout.tsx:31`) | 9 uses | PageHeader (20 px, same props) | 3 | Size change is inside the component |
| `CollectionView` header, Runs header copy | 16 + 1 | PageHeader `workbench` | 3 | With DataTable |
| Editor, run-page and detail headers | 3 + 1 + 2 | PageHeader `editor` / `object` | 3 | Restores an `h1` on new-object editors |
| Per-screen back links ("All scripts", "Flows /", "Runs ›", arrow links) | 10 screens, 6 patterns | Shell Breadcrumb | 3 | P2-3; delete the local links in the same change |
| ui `Tabs` with component state | 6 uses | Tabs (URL-backed) | 3 | `value`/`onChange` already exist; add the URL binding in a kit wrapper |
| `AccessTabs` (`screens/Members.tsx:31-48`) | 1 | RouteTabs | 4 | |
| Toggle "tabs" (`screens/Data.tsx:592-600`), segmented group (`screens/Interfaces.tsx:1316-1335`) | 2 | Tabs / `single` FilterBar | 4 | |
| `Stepper` as tabs (`screens/SingleSignOn.tsx:1098`) | 1 of 4 Stepper uses | Tabs | 5 | Stepper stays for processes |
| `FilterChips` (`kit/layout.tsx:289`) | 11 uses in 10 files | FilterBar `single` (radio semantics from `SegmentedControl`) | 3 | Fixes arrow keys in one place |
| Native `<select>` filters (`screens/Audit.tsx:228,242`), hand labels | 2 + 7 hand-rolled label sites | FilterBar `menu` / FormField | 4 | |
| Five search-box builds | 5 | SearchField | 3 | With Toolbar |
| `Badge` used for state | 48 uses in 16 files (state uses to be triaged) | StatePill (state), Tag (class), Badge (count) | 4 | P2-5; start with the 4 copies of `STATE` |
| `Tag` used for state or warnings | 47 uses in 16 files (triage) | StatePill / Notice; `production` tone → EnvTag only | 4 | P4-5 |
| Local state maps (`STATE` ×4, `screens/Git.tsx:151`, `screens/Audit.tsx:58`, `screens/FlowEditor.tsx:182`, `screens/Drift.tsx:96`, `screens/Release.tsx:251`) | 9 | Domain maps exported from `kit/status.tsx` | 4 | Also delete `_TONE` (`screens/Execution.tsx:28`) and merge the two trigger-word maps |
| `TypeBadge` (`screens/Tenant.tsx:95`) | 1 | EnvTag | 4 | |
| `KeyValues` / `Facts` / `<dl>` in widgets | 24 / 4 / 1 | KeyValue | 4 | `Facts` stays exported for apps |
| `EmptyState` / `EmptyCanvas` / bare paragraphs | 17 / 7 + lists / 3+ | EmptyState variants | 4 | Motif kept for `first-use` |
| `CopyButton`, `CopyIcon`/`CopyableId`, JsonView Copy, `select-all` | 11 / 7 / 1 / 4 | CopyButton + Identifier | 2 | P0-10 for secrets first; then identifiers (P1-10) |
| `code()` helper, `<pre>`, bare `<code>` | 6 copies / 3 / 38 | CodeViewer `inline` / `block` / `diff` | 5 | Lint rule after migration (P2-12) |
| JSON textareas (`screens/ResourceEditor.tsx:277-290`, `screens/Authoring.tsx:531,542`), SchemaForm JSON mode | 3 + 1 | CodeEditor `field` / SchemaForm | 4 | P1-4 |
| Raw `JSON.stringify` in UI (`screens/Flows.tsx:700-702`, `screens/Operate.tsx:839`) | 2 | JSONViewer / KeyValue | 4 | |
| `UsedBy` text + `title` (`kit/references.tsx`) | 3 uses in 2 files | ReferenceList (links) | 2 | P1-10; needed by ConfirmDialog |
| Native `title` for information | about 77 native uses, about 17 informational | Tooltip | 3 | P3-1; Tooltip must exist before DataTable ships truncation |
| `disabled={busy…}` buttons | 72 sites, 5 change the label | Button `loading` | 3 | P2-8; codemod-able |
| `aria-pressed` on `Button`, variant-swap toggles | 2 + 1 | Button `toggle` | 3 | |
| Window key listeners; static `SHORTCUTS` list; hand-written `<kbd>` | 4 / 1 / 2 | Shortcut registry + Kbd | 1 (remove `j k`) then 5 | P0-6 removes the false entry now; P3-1 builds the registry |
| Field frames in `Combobox.tsx` and `SchemaForm.tsx`; hand-rolled labels; bare file inputs | 2 copies / 6 / 4 | FormField | 4 | P2-7; error linkage fixed once |
| "Unsaved changes" badges; per-screen Save/Saved; flow autosave status | 2 badges; 4 save models | SaveBar | 1 (guard) then 4 | P0-4 ships the guard and autosave in editors first |
| Password `TextField`s for stored secrets | secrets, connections, sources, repository token | SecretField | 4 | |
| Native select of principals (`screens/Members.tsx:370-390`) | 1 | UserPicker | 5 | P2-11 |
| Target comboboxes (`screens/ScheduleForm.tsx:90-99`, `screens/FlowEditor.tsx:1185-1194`, palette pickers) | 3 | ScriptPicker | 5 | P1-9 |
| "Live" label (`screens/Runs.tsx:215-219`) | 1 | LiveIndicator in shell and regions | 2 | P1-7 |
| Fixed pane sizes (flow aside, script settings, log box, test panel) | 5 fixed sizes | SplitPane | 5 | P3-5; P1-4 uses it for the script editor |
| ui `Dialog` without close/footer | 15 uses | Dialog with close and footer slot (opt-in `footer`, close on by default only through the console wrapper) | 2 | Fixes the phone palette exit |
| `SideSheet` and `Inspector` chromes | 11 + 13 | One chrome (3.24) | 3 | Padding, close and footer unified |
| `KitSheet` (`screens/KitSheet.tsx`) | 1 | A sheet that renders every component in this document in every state | 6 | P2-12; the reference for visual regression and axe |

Suggested sequence in short: fix the crash and focus defects inside existing components (order 1); build LoadState, ErrorState, Tooltip, Button loading, ReferenceList and the Dialog additions (order 2); build DataTable with PageHeader, Toolbar, FilterBar, SearchField and Breadcrumb, and migrate lists starting with Runs (order 3); converge status marks, forms, key/value and code presentation (order 4); add SplitPane, pickers and the registry-backed keyboard system (order 5); extend the kit sheet and turn on lint and CI checks (order 6).
