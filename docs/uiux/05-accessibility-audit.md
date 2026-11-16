# 5. Accessibility audit against WCAG 2.2 AA

This document audits the Vynxlabs console against the Web Content Accessibility Guidelines (WCAG) 2.2 at levels A and AA. It covers the console application, the shared component kit (`packages/ui`), the app renderer (`packages/screens`) and the end-to-end tests, at HEAD `e737382`. It records what already works, lists every defect found as a numbered finding (A11Y-01 to A11Y-51), explains each topic in detail, and proposes a test plan. Nothing described as a fix has been implemented; this is research and planning only.

Paths are relative to `apps/console/src` unless they start with `packages/`, `apps/` or `e2e/`.

Evidence labels used here:

- **Verified**: read in the code at HEAD `e737382`, cited as `path:line`. Every row of the findings register is Verified unless it says otherwise.
- **Observed (mocked API)**: seen in the built console rendered in headless Chromium with fixture data. Not a real seeded instance.
- **Inferred**: reasoned from code or from a library's documented defaults without being run. In this document every Inferred item is also marked **NRV** (needs runtime verification) and is repeated in the checklist in section 8.
- **Judgment**: a design opinion. WCAG thresholds, computed contrast ratios and measured sizes are not judgment.

## Main findings

- One critical failure: in the flow editor, steps can only be connected by dragging between 6 px handles. A keyboard-only, switch, voice-control or screen-reader user can add, configure and delete steps but cannot wire them, so cannot build a working flow in the console (A11Y-01).
- The `ink-subtle` text colour is below 4.5:1 on every light-theme background except white, and it is used 134 times, mostly on the grey canvas and navigation backgrounds (A11Y-02). No border token reaches 3:1, so inputs, selects and secondary buttons have no boundary that meets 1.4.11, and selected rows differ from their background by 1.03:1 (A11Y-03).
- A screen-reader or multi-tab user gets no orientation: the page title never changes, there is no skip link, focus does not move on navigation, and run state changes are not announced (A11Y-04, A11Y-14, A11Y-15, A11Y-16).
- Error toasts are announced politely and disappear after 5 seconds with no way to pause them; for many row actions the toast is the only report of the failure (A11Y-05).
- The docked inspector, the main detail surface on wide screens, takes no focus on open, returns none on close and ignores Escape; the Runs list cannot open it by keyboard at all (A11Y-06, A11Y-12).
- The read-only flow graph removes its own focus outline, names no edges and shows run state by colour alone (A11Y-07, A11Y-08, A11Y-22).
- The foundations are sound: Base UI primitives for dialogs, menus, tabs and comboboxes; native controls first; every icon button and input is named; a global focus ring and reduced-motion rule; state shown as icon plus word. Most fixes are token, shell or kit changes that reach every screen at once.
- There is no automated accessibility check anywhere in the repository and nothing validates contrast, including for operator-supplied branding (A11Y-29, A11Y-32).
- Totals: 1 critical, 10 serious, 21 moderate, 19 minor (51 findings). Twenty-two items could not be settled from code and are listed for runtime verification.

## 1. Scope, method and limits

**Scope.** `apps/console/src` (shell, router, kit, screens, editor), `packages/ui/src`, `packages/screens/src` and `e2e/`. The public approval page and sign-in are included. Published end-user apps rendered by `packages/screens` are included only where the builder or renderer code was read.

**Method.**

1. Static code review of every interactive element: a scan of all `button`, `input`, `select`, `textarea`, `onClick`, `tabIndex`, `role`, `aria-*`, `outline`, `opacity`, `title`, drag and pointer handlers in the three packages.
2. Contrast computed from the hex values in `packages/ui/src/tokens.css:10-31` (light) and `:45-66` (dark). The formula is the WCAG 2.x one: each sRGB channel `c` (0–1) is linearised as `c / 12.92` when `c ≤ 0.04045`, otherwise `((c + 0.055) / 1.055) ^ 2.4`; relative luminance is `L = 0.2126 R + 0.7152 G + 0.0722 B`; the ratio is `(L_lighter + 0.05) / (L_darker + 0.05)`. Colours with an opacity modifier (for example `text-ink-muted/70`) are composited over the stated background in sRGB before the ratio is taken. Two source notes carried contrast figures; both were recomputed for this document with a fresh script and agree to two decimal places. The same script produced the ratios for the proposed replacement values.
3. A small amount of rendered observation: the built console in headless Chromium at 1440×900 (light and dark), 390×844 and 2200×1100, with every API call answered from fixtures.
4. Review of the existing unit and end-to-end tests for what they assert about roles, names, focus and keys.

**Limits.** No screen-reader session was possible (no NVDA, JAWS or VoiceOver). No automated axe run was made; the repository has no axe dependency and none was added. No real-device or touch testing was possible. No real seeded instance could be run, so live updates, write flows and session expiry were not observed. Behaviour that comes from a library (Base UI focus traps, `@xyflow/react` keyboard defaults, Monaco's Tab handling) was read from the library's defaults, not exercised. Items that code cannot settle are marked NRV where they appear and are collected in section 8.

**Severity scale.**

| Severity | Meaning |
|---|---|
| Critical | A core task cannot be completed at all by a group of users. |
| Serious | An A or AA criterion fails on a frequent surface, or part of a task is blocked with only a costly workaround. |
| Moderate | A criterion fails with a reasonable workaround, or on a limited surface. |
| Minor | Low impact, a best-practice gap, or a criterion that passes with a defect. |

**Corrections to the source notes** made after re-reading the code:

- One note said the script editor autosaves drafts. It does not: `screens/Authoring.tsx` has no autosave timer. Only the flow editor (`screens/FlowEditor.tsx:700-706`, and only once the flow has been saved once: `state === "new"` returns early) and the App Builder (`screens/Interfaces.tsx:1657`) autosave. This weakens the mitigation for session expiry (A11Y-28).
- Notes disagreed on whether the script, flow and resource editors have a page heading. Both are right: an existing object gets an `h1` with its path (`screens/Authoring.tsx:616`, `screens/FlowEditor.tsx:858`, `screens/ResourceEditor.tsx:330`); a new object shows a Path text field in that position and the page has no `h1` (A11Y-38).
- One note called the Grid's row selector a checkbox; it is a radio (`packages/ui/src/Grid.tsx:295-301`).

**Relation to the earlier audit.** `docs/evolution/04-ux-audit.md` raised keyboard support (its X8) and the missing section name in the header (its IA7). Since then a `?` shortcut sheet and flow-editor undo/redo were added, and the section name is visible on tenant, instance and account screens (`Shell.tsx:818-828`). Still open: the section name is screen-reader-only inside a workspace (`Shell.tsx:788`), and the sheet advertises `j k` list movement that does not exist (A11Y-27).

## 2. Summary

### Counts by severity

| Severity | Count | Finding IDs |
|---|---|---|
| Critical | 1 | A11Y-01 |
| Serious | 10 | A11Y-02 to A11Y-11 |
| Moderate | 21 | A11Y-12 to A11Y-32 |
| Minor | 19 | A11Y-33 to A11Y-51 |
| Total | 51 | |

### Conformance by success criterion

Status values: supports, partially supports, does not support, not evaluated. "Supports" from a code review means no failure was found, not that conformance was demonstrated. Criteria for audio and video (1.2.x, 1.4.2) do not apply: the console has no time-based media.

| Criterion (level) | Status | Findings / basis |
|---|---|---|
| 1.1.1 Non-text content (A) | Partially supports | Icons, avatars, charts are named or hidden correctly; flow graph edges have no text equivalent (A11Y-08) |
| 1.3.1 Info and relationships (A) | Partially supports | A11Y-08, 13, 18, 37, 38, 40, 41 |
| 1.3.2 Meaningful sequence (A) | Partially supports | Inspector is last in DOM after the whole list (A11Y-06); flow nodes are in insertion order (A11Y-08) |
| 1.3.3 Sensory characteristics (A) | Partially supports | The only connect instruction is "drag from the dot on a step's right edge" (A11Y-01) |
| 1.3.4 Orientation (AA) | Not evaluated | No orientation lock was searched for or tested |
| 1.3.5 Identify input purpose (AA) | Supports (sign-in); not evaluated elsewhere | `autoComplete` on sign-in fields (A11Y-47 evidence) |
| 1.4.1 Use of colour (A) | Partially supports | A11Y-03 (selection), A11Y-22 |
| 1.4.3 Contrast, minimum (AA) | Does not support | A11Y-02, 20, 21, 29 |
| 1.4.4 Resize text (AA) | Partially supports (NRV) | Browser zoom works; A11Y-10, 46 |
| 1.4.5 Images of text (AA) | Not evaluated | None seen; not searched systematically |
| 1.4.10 Reflow (AA) | Partially supports (NRV) | A11Y-10, 26, 46 |
| 1.4.11 Non-text contrast (AA) | Does not support | A11Y-03; A11Y-43 noted |
| 1.4.12 Text spacing (AA) | Not evaluated | Risk noted in A11Y-46 |
| 1.4.13 Content on hover or focus (AA) | Partially supports | A11Y-30, 33 |
| 2.1.1 Keyboard (A) | Does not support | A11Y-01, 12, 24, 30, 33 |
| 2.1.2 No keyboard trap (A) | Not evaluated | Monaco (A11Y-25) and the phone palette (A11Y-11) need runtime checks |
| 2.1.4 Character key shortcuts (A) | Does not support | A11Y-27 |
| 2.2.1 Timing adjustable (A) | Does not support | A11Y-05; A11Y-28 (NRV) |
| 2.2.2 Pause, stop, hide (A) | Supports (Inferred) | No looping motion beyond loading pulses; live log has a Follow toggle |
| 2.3.1 Three flashes (A) | Supports | No flashing content found |
| 2.4.1 Bypass blocks (A) | Partially supports | Landmarks exist; no skip link (A11Y-15) |
| 2.4.2 Page titled (A) | Does not support | A11Y-04 |
| 2.4.3 Focus order (A) | Partially supports | A11Y-06, 14, 47, 49 |
| 2.4.4 Link purpose (A) | Not evaluated | Buttons and inputs were scanned for names; link text was not reviewed systematically |
| 2.4.5 Multiple ways (AA) | Supports | Rail, section panel and command palette search |
| 2.4.6 Headings and labels (AA) | Partially supports | A11Y-38, 39 |
| 2.4.7 Focus visible (AA) | Partially supports | Global ring; A11Y-07; A11Y-35 (NRV) |
| 2.4.11 Focus not obscured, minimum (AA) | Not evaluated | A11Y-36 (NRV) |
| 2.5.1 Pointer gestures (A) | Supports (Inferred) | No multipoint or path gestures; zoom has buttons |
| 2.5.2 Pointer cancellation (A) | Not evaluated | One down-event activation noted (A11Y-39) |
| 2.5.3 Label in name (A) | Not evaluated | Two naming mismatches noted (A11Y-30, 42) |
| 2.5.4 Motion actuation (A) | Supports | None used |
| 2.5.7 Dragging movements (AA) | Does not support | A11Y-01, 24; met in the App Builder (A11Y-44) |
| 2.5.8 Target size, minimum (AA) | Partially supports | A11Y-09, 23 |
| 3.1.1 Language of page (A) | Supports | `apps/console/index.html:2` |
| 3.1.2 Language of parts (AA) | Not evaluated | A11Y-51 |
| 3.2.1 On focus (A) | Supports (Inferred) | No focus-triggered context change found |
| 3.2.2 On input (A) | Not evaluated | |
| 3.2.3 Consistent navigation (AA) | Supports | One shell for every screen |
| 3.2.4 Consistent identification (AA) | Partially supports | The same state is drawn several ways; see `02-design-system-forensics.md` and roadmap P2-5, P2-3 |
| 3.2.6 Consistent help (A) | Not evaluated | No help mechanism was identified |
| 3.3.1 Error identification (A) | Partially supports | A11Y-18, 42, 47 |
| 3.3.2 Labels or instructions (A) | Partially supports | Every input is labelled; A11Y-19 |
| 3.3.3 Error suggestion (AA) | Supports | `packages/ui/src/Form.tsx:97-128` |
| 3.3.4 Error prevention (AA) | Not evaluated here | Confirm dialogs exist; gaps are covered by roadmap P0-9 in `09-prioritized-uiux-roadmap.md` |
| 3.3.7 Redundant entry (A) | Not evaluated | |
| 3.3.8 Accessible authentication, minimum (AA) | Supports | A11Y-47 evidence |
| 4.1.2 Name, role, value (A) | Partially supports | A11Y-13, 17, 31, 34, 39, 41, 42 |
| 4.1.3 Status messages (AA) | Partially supports | A11Y-05, 14, 16, 48 |

## 3. What is already good (keep)

These are deliberate strengths. The roadmap must not regress them, and several are the model for the fixes below.

| Area | What is in place | Evidence |
|---|---|---|
| Tokens and theme | Semantic colour tokens with light, dark and system modes; `color-scheme` set | `packages/ui/src/tokens.css:9-95` |
| Focus ring | One global `:focus-visible` rule, 2 px solid with 2 px offset. Ring against every background is at least 5.80:1 light and 5.95:1 dark | `packages/ui/src/tokens.css:167-170` |
| Reduced motion | One global rule removes all CSS transitions and animations | `packages/ui/src/tokens.css:172-177`; `packages/ui/src/Surfaces.tsx:136` |
| Primitives | Dialog, SideSheet, Menu, Tabs, Combobox and Field are Base UI components (`@base-ui/react ^1.9.0`), not hand-rolled, so focus trap, Escape, focus return and arrow-key roving come from the library (NRV) | `packages/ui/src/Dialog.tsx`, `SideSheet.tsx`, `Menu.tsx`, `Tabs.tsx`, `Combobox.tsx`, `Fields.tsx` |
| Native controls first | `SelectField` is a native `select`; `SegmentedControl` is native radios in a `fieldset` with a `legend`; `DateField` uses native date inputs; `Button` renders an `a` when it navigates; the router `Link` is a real `a href` that honours modifier clicks | `packages/ui/src/Fields.tsx:65-93`, `packages/ui/src/Pickers.tsx:32-59`, `packages/ui/src/Button.tsx:41-48`, `router.tsx:81-95` |
| Names | A scan of every `button`, `input`, `select` and `textarea` found no icon-only button without `aria-label` and no input without a label. Decorative icons are `aria-hidden` | `Shell.tsx:678, 709, 718, 890`; `kit/layout.tsx:125`; `kit/copy.tsx:11-13`; `packages/ui/src/SideSheet.tsx:61`; `screens/Interfaces.tsx:563, 643, 781, 797, 813`; `packages/ui/src/SchemaForm.tsx:600-616` |
| No native dialogs | Confirm and prompt go through `DialogsProvider`; Biome `noAlert: error` enforces it; an e2e test asserts it | `packages/ui/src/Dialogs.tsx`, `biome.json`, `e2e/redesign.spec.ts:233` |
| Status is not colour-only | `StatePill` always pairs an icon, a word and a colour. **Observed (mocked API)**: state read as icon plus word on every list and run page | `kit/status.tsx:67-84` |
| Live regions that exist | `Notice` is `role="alert"` for danger and `role="status"` otherwise; `Skeleton` is a labelled `role="status"`; `Pagination` and `DateStepper` values are `aria-live="polite"`; `LogViewer` count is live | `packages/ui/src/Notice.tsx:22`, `Surfaces.tsx:129`, `Pagination.tsx:23`, `Pickers.tsx:122`, `LogViewer.tsx:138` |
| Charts | `Chart` is `role="img"` with a title and description; the Overview bar chart has a screen-reader-only data table with a caption | `packages/ui/src/Chart.tsx:81-82`, `screens/Overview.tsx:166-184` |
| Data grid basics | Named table, `scope="col"`, `aria-sort`, a real sort button, labelled filters, labelled inline edit with Enter to commit and Escape to cancel, and a radio per row as the keyboard path for selection | `packages/ui/src/Grid.tsx:171-196, 209, 219-233, 295-301` |
| Scroll regions | Focusable and named, so keyboard users can scroll them | `packages/ui/src/JsonView.tsx:77-80`, `LogViewer.tsx:151-153`, `ResultView.tsx:141-144, 257-260` |
| Forms | Submit focuses the first invalid field; error text says how to fix the value | `packages/ui/src/Form.tsx:97-128, 166-170`, `packages/ui/src/SchemaForm.tsx:783` |
| Non-drag alternatives | App Builder placement has x, y, width and height number fields; every reorder uses Move up / Move down buttons | `screens/Interfaces.tsx:781-809, 1149-1181`, `packages/ui/src/SchemaForm.tsx:600-616` |
| Shell | Labelled landmarks, `aria-current="page"` on navigation links, a drawer built on SideSheet below 768 px, a command palette built as an ARIA combobox and listbox, `html lang="en"` | `Shell.tsx:654, 670, 705, 730, 902, 917`; `router.tsx:85`; `kit/CommandPalette.tsx:604-646`; `apps/console/index.html:2` |
| Sign-in | Labelled fields with `autoComplete`, no paste blocking, show/hide password with `aria-pressed`, no CAPTCHA, errors in `role="alert"`, steps with `aria-current="step"` | `screens/SignIn.tsx:88-101, 153-207, 214` |
| Code editor fallback | Until Monaco loads, or if it fails, a labelled plain `textarea` holds the same text | `editor/CodeEditor.tsx:112-121` |
| Lint and tests | Biome's recommended accessibility rules are on; only 12 `biome-ignore lint/a11y` comments exist, each with a reason. Tests query by role and label (about 849 `getByRole`/`getByLabel` calls against 35 `getByTestId`/`querySelector`), so names and roles are exercised incidentally | `biome.json`; see section 7 |

## 4. Findings register

Ordered by severity, then by how many screens or users the finding reaches. "Roadmap ID" uses the IDs in `09-prioritized-uiux-roadmap.md`; "08" means the fix also belongs in the component standard in `08-component-pattern-library.md`. Where no roadmap item names the fix, the row says which item's work should absorb it.

| ID | Severity | WCAG SC | Finding | Evidence | Who is affected | Fix | Roadmap ID | Verification method |
|---|---|---|---|---|---|---|---|---|
| A11Y-01 | Critical | 2.1.1, 2.5.7, 1.3.3 | Flow editor: steps can be connected only by dragging between xyflow `Handle` elements, which are not focusable. `onConnect` is the only code path that creates an edge. The inspector has no "goes to" control, the only instruction is "drag from the dot on a step's right edge to the next step", and "Add step" places the new step unconnected. Error paths and branch cases are also drag-only | `screens/FlowEditor.tsx:236, 248-261, 567-591, 1067, 1089-1343, 1359-1363` | Keyboard-only, switch, voice-control and screen-reader users cannot build a working flow; pointer users who cannot drag depend on an unverified click-to-connect default | Inspector "Then go to" control per output and "On error go to", listing and removing existing connections; new step connected to the selection; step outline (section 5.15) | P0-8, P1-8 | Keyboard-path e2e: build and test a three-step flow with no pointer events |
| A11Y-02 | Serious | 1.4.3 | `ink-subtle` (`#687485`) is 4.19 on canvas, 3.96 on structure, 3.85 on sunken, 4.05 on selected, 4.42 on code background and 3.94 on action-soft in light; in dark it is 4.18 on raised and 3.88 on action-soft. 134 uses, mostly on canvas and structure, often at 10.5–12.5 px | `packages/ui/src/tokens.css:29, 64`; `Shell.tsx:271, 354, 693, 891`; `kit/layout.tsx:46, 62, 339`; `kit/CollectionView.tsx:86`; `kit/status.tsx:50-57, 81`; `screens/SignIn.tsx:246, 253` | Low-vision users; anyone on a poor display | `ink-subtle` → `#586474` light, `#8a97a7` dark (section 5.1) | P0-2 | Token contrast test; axe colour-contrast in e2e, both themes |
| A11Y-03 | Serious | 1.4.11, 1.4.1 | No border token reaches 3:1: `line` is 1.41 on surface and 1.24 on canvas; `line-strong` 1.87 and 1.65. Inputs, selects, filter inputs, secondary buttons and chips are identified only by that border. Selected states rely on background alone: selected row 1.03 against canvas, menu and combobox highlight 1.20, segmented control on/off 1.23. Invalid fields get no border change | `packages/ui/src/Fields.tsx:6`; `packages/ui/src/Grid.tsx:252`; `Shell.tsx:686`; `packages/ui/src/Button.tsx:5`; `kit/layout.tsx:315`; `kit/CollectionView.tsx:122-124`; `screens/Runs.tsx:395`; `packages/ui/src/Menu.tsx:49`; `packages/ui/src/Combobox.tsx:31`; `packages/ui/src/Pickers.tsx:40`; `kit/CommandPalette.tsx:677` | Low-vision users cannot find input edges or see which row or option is selected; sighted keyboard users in menus rely on the 1.2:1 highlight | New `line-control` token at ≥ 3:1 on control boundaries; a non-colour selected cue (inset bar as on the rail, `Shell.tsx:402-408`, or a check icon) | P0-2, P2-1; 08 | Token contrast test; visual regression of selected states |
| A11Y-04 | Serious | 2.4.2 | The page title never reflects the screen. `index.html` sets "Console"; the only write is `document.title = value.productName`. **Observed (mocked API)**: the title is "Vynxlabs" on every route | `apps/console/index.html:6`; `kit/brand.tsx:44`; `router.tsx:6-10` | Screen-reader users; anyone with several console tabs; history and bookmarks | One effect in `Shell` setting "Screen · Workspace · Product" from the breadcrumb data it already computes | P0-7 | e2e asserts `document.title` per route |
| A11Y-05 | Serious | 2.2.1, 4.1.3 | Every toast, including errors, disappears after 5 s with no pause on hover or focus. Errors use `role="status"` (polite). Each toast is a newly inserted element, not content added to a persistent live region. For many row actions the toast is the only failure report, and it appears bottom-right, away from the control | `packages/ui/src/Toast.tsx:35, 56-59, 80, 84`; `ask.tsx:33, 56-68` | Screen-reader users, slow readers, magnifier users | Errors persist until dismissed and use `role="alert"`; success toasts pause on hover and focus; one always-present live container | P0-7, P2-8; 08 | Component test of roles and timing; screen-reader script |
| A11Y-06 | Serious | 2.4.3, 1.3.2 | The docked Inspector (≥ 1280 px) is a plain `aside` rendered after the list. Opening it leaves focus on the row; closing unmounts it so focus falls to `body`; Escape does nothing. Below 1280 px the same component is a SideSheet that traps and restores focus, so behaviour differs by width. 13 uses | `kit/layout.tsx:85-140, 156-162` | Keyboard and screen-reader users on every list-plus-detail screen | On open, focus the inspector heading or close button; on close, return focus to the opening row (`[data-row]` exists, `kit/CollectionView.tsx:107`); close on Escape; no focus trap in the docked form | P0-3; 08 | Keyboard-path e2e at 1440 px and 1024 px |
| A11Y-07 | Serious | 2.4.7 | Read-only flow graph: each node is a focusable `g role="button"` with inline `style={{ outline: "none" }}`, which beats the global focus rule. Nothing replaces it; the corner brackets show selection, not focus | `FlowGraph.tsx:241-251, 265-272`; used at `screens/Flows.tsx:418, 734` | Sighted keyboard users cannot see which node has focus | Remove the inline outline; draw a focus rectangle on the node stroked with the `focus` token | P0-8 | e2e focus screenshot; manual check |
| A11Y-08 | Serious | 1.3.1, 1.1.1 | The flow has no non-visual structure. In the editor the canvas is the only representation: no list of steps or connections; handles carry only `title`; edge labels are SVG text; DOM order is insertion order. In the read-only graph the edges have no accessible name, so order and branching are not conveyed. The run page has a Timeline tab as a text alternative; the flow page has none | `screens/FlowEditor.tsx:239-247, 260, 1046-1084`; `FlowGraph.tsx:124-135, 196-229, 244-247`; `screens/Flows.tsx:418, 705-734` | Screen-reader users cannot learn what a flow does or in what order | An ordered "Steps" outline in topological order, each item giving name, kind, "then → …" and "on error → …", with a button that selects the step | P0-8 | Screen-reader script: describe an existing flow from the outline alone |
| A11Y-09 | Serious | 2.5.8 | Flow connection handles are the xyflow default 6×6 px with no override. Branch steps stack several handles on one edge, so the spacing exception does not apply | `screens/FlowEditor.tsx:236, 248-261, 268-285`; `@xyflow/react/dist/style.css:245-253` | Motor-impaired pointer users and touch users | 24 px hit area on each handle, plus the inspector controls of A11Y-01 | P0-8 | Measured in Playwright (`boundingBox`) |
| A11Y-10 | Serious | 1.4.10, 1.4.4 | NRV. Flow editor below 1024 px or at high zoom: the canvas (`min-h-[28rem]`) and the `shrink-0` inspector stack in a column inside an `overflow-hidden` main, and nothing in the chain scrolls. When the height is less than about 448 px plus header plus inspector (a 1280×720 window at 200 % zoom), the inspector is pushed past the clipped edge | `nav.ts:229-233`; `Shell.tsx:903`; `screens/FlowEditor.tsx:957, 958, 1091` | Low-vision users who zoom; small screens | Let the stacked column scroll below 1024 px, or drop the canvas minimum height when stacked; per `07-design-system-specification.md`, editors below 1024 px show a clear desktop-only notice | No dedicated item; do with P0-8 on the same screen | Playwright at 640×360 CSS px (1280×720 at 200 %) |
| A11Y-11 | Serious on phones, moderate elsewhere | 2.1.2 (NRV) | The generic `Dialog` has no close control. The command palette uses the `palette` size, which is full-screen below 768 px, so no backdrop is visible and Escape is the only exit short of picking a result. The shortcut sheet has no focusable content at all | `packages/ui/src/Dialog.tsx:27-48` (`:33`); `kit/CommandPalette.tsx:601, 768` | Touch and switch users with no Escape key | A labelled close button in `Dialog`, as `SideSheet` has (`packages/ui/src/SideSheet.tsx:60-73`) | No dedicated item; do with P0-3 (same focus-management work); 08 | Real-device check on iOS and Android |
| A11Y-12 | Moderate | 2.1.1 | Runs list: `tr onClick` opens the inspector but has no `tabIndex`, role or key handler. The inner link goes to the full run page instead | `screens/Runs.tsx:392-396, 401` | Keyboard and screen-reader users lose the side-by-side preview (the full page is an equivalent route) | Move Runs to the shared list primitive; a real control in the row opens the inspector | P0-3, P1-1 | Keyboard-path e2e |
| A11Y-13 | Moderate | 4.1.2 | Clickable rows in `CollectionView` are `tr tabIndex={0}` with Enter and Space, but no role or name saying they open details, and `aria-selected` on a `tr` in a plain table is not a supported state (same in `Grid`). Every row is a tab stop, with a second stop for its inner link, so a 200-member list is 200 or more Tab presses. The audit log nests a `button` inside the already-clickable row | `kit/CollectionView.tsx:105-124`; `packages/ui/src/Grid.tsx:277-291`; `screens/Audit.tsx:173-183` | Screen-reader users are not told the row is actionable; keyboard users pay one or two tab stops per row | A real button or link in the first cell opens the inspector (`aria-expanded`, `aria-controls`); roving focus so the list is one tab stop; `aria-current` instead of `aria-selected` | P0-3, P2-2; 08 | axe; keyboard-path e2e |
| A11Y-14 | Moderate | 2.4.3, 4.1.3 | Nothing moves focus or announces the new screen on route change. After a link click focus stays on the link or is lost when its container unmounts | `router.tsx:6-10`; `.focus()` appears only in `screens/ConnectionWizard.tsx:522`, `packages/ui/src/Form.tsx:169`, `packages/ui/src/SchemaForm.tsx:783` | Screen-reader users are not told the page changed; keyboard users restart from an arbitrary point | In `Shell`, on path change focus the main heading (`tabIndex={-1}`) and reset the main scroll position | P0-7 | e2e asserts `document.activeElement` after navigation |
| A11Y-15 | Moderate | 2.4.1 | No skip link. DOM order is rail, section panel (filter input and full section list), header, then `main`, which has no `id` or `tabIndex`. **Observed (mocked API)**: 8 tab stops on the rail before anything else | `Shell.tsx:653-915`; `packages/ui/src/PageShell.tsx` | Sighted keyboard users on every screen (landmarks cover screen-reader users) | First focusable element is "Skip to content", targeting `main#content tabIndex={-1}` | P0-7 | e2e: first Tab then Enter lands in `main` |
| A11Y-16 | Moderate | 4.1.3 | Status changes are not announced. Run state arrives over server-sent events and re-renders `StatePill` with no live region. 45 bare "Loading…" paragraphs have no `role="status"`. Command palette results have no count or "nothing matches" announcement. "Copied" is shown only by a `title` and an icon swap. The flow editor's problems notice is not live | `screens/RunPage.tsx:111`; `kit/status.tsx:67-84`; `kit/CollectionView.tsx:78`; `App.tsx:142`; `kit/CommandPalette.tsx:638-646`; `kit/copy.tsx`; `screens/FlowEditor.tsx:882` | Screen-reader users must re-read the page to learn that a run finished or content loaded | A polite live region beside the run header ("Run succeeded after 12 s"); a shared loading component with `role="status"`; announce result counts and "Copied" | P0-7, P2-4 | Component tests; screen-reader script |
| A11Y-17 | Moderate | 4.1.2 | The Menu's current item is shown by weight and an `aria-hidden` check mark only, so the workspace switcher and theme menu do not say which item is active | `packages/ui/src/Menu.tsx:47-56`; `Shell.tsx:418-435, 750-770` | Screen-reader users cannot tell which workspace they are in from the switcher | Base UI `RadioItem` (`aria-checked`) or `aria-current="true"` | P0-7 (workspace orientation); 08 | axe; component test |
| A11Y-18 | Moderate | 1.3.1, 3.3.1 | Field errors are a plain `p role="alert"`, not Base UI `Field.Error`, so they are not in `aria-describedby` and they replace the hint. Re-reading the field does not give the error. The control gets no invalid border. Many alerts appear at once on submit. Same pattern in Combobox and SchemaForm; `CheckboxField` does it correctly | `packages/ui/src/Fields.tsx:15-29, 271-289`; `packages/ui/src/Combobox.tsx:44-47`; `packages/ui/src/SchemaForm.tsx:371, 478, 575`; `packages/ui/src/Form.tsx:165` | Screen-reader users; low-vision users who look for a marked field | Render errors with `Field.Error` or link by id; keep `role="alert"` only on the form summary; add an invalid border with an icon | P2-7; 08 | Component test of `aria-describedby` and `aria-invalid` |
| A11Y-19 | Moderate | 3.3.2 | Required fields are exposed to assistive technology but have no visible marker. Some screens mark optional fields in the label text instead; most mark neither | `packages/ui/src/Fields.tsx:15-19, 44-54`; `screens/FlowSteps.tsx:138, 352`; `screens/FlowEditor.tsx:1153` | Sighted users, especially with cognitive disabilities, learn a field is required only on submit | One convention in the field frame: visible "required" or "optional" text | P2-7; 08 | Visual regression of the kit sheet |
| A11Y-20 | Moderate | 1.4.3 | Amber (`attention`, `#b45309`) is just under 4.5 in light: the `promote` button label is 4.43; the attention badge is 4.47 on its soft background; amber text is 4.43 on canvas, 4.19 on structure, 4.07 on sunken. `success` is 4.31 on sunken, 4.44 on structure, 4.42 on action-soft | `packages/ui/src/Button.tsx:10`; `packages/ui/src/Badge.tsx:8`; `packages/ui/src/PageShell.tsx:73`; `kit/status.tsx:46-58`; `Shell.tsx:348`; `packages/ui/src/JsonView.tsx:5, 57` | Low-vision users, on the production-promotion action and on waiting and paused states | `attention` → `#9a4707`; `success` → `#1b6e45` (section 5.1) | P0-2 | Token contrast test |
| A11Y-21 | Moderate | 1.4.3 | Text faded with opacity. Rail links when no workspace is open: `opacity-55` gives 2.14 light, 3.13 dark, and the links still work so they are not exempt as disabled. Placeholders at `/70`: 3.04 light, 3.97 dark; at `/60`: 2.52. The word "empty" in null cells at `/60`: 2.52, and it conveys a value. Chip counts at `opacity-80` and 10.5 px: 3.41 on canvas (off), 3.94 (on) | `Shell.tsx:397, 613`; `packages/ui/src/Fields.tsx:6`; `packages/ui/src/Combobox.tsx:27`; `packages/screens/src/Renderer.tsx:688`; `screens/Branding.tsx:118`; `packages/ui/src/Grid.tsx:252, 311`; `packages/ui/src/widgets.tsx:182`; `kit/layout.tsx:320` | Low-vision users | Placeholders and "empty" use `ink-subtle` at full opacity; remove opacity from working links and counts; lint against opacity modifiers on text | P0-2, P2-12 | Token contrast test including the composited pairs |
| A11Y-22 | Moderate | 1.4.1 | State by colour alone. Run graph: a node's state is its stroke colour plus a 5 px dot; the state name is only in `aria-label` and an SVG `title`; only "skipped" has a non-colour cue (dashed). Overview bars: succeeded and failed differ by green and red only, with a colour-swatch legend | `FlowGraph.tsx:279-281, 294-298`; `screens/Overview.tsx:135-146, 160-163` | Colour-blind users reading a run graph or the 24-hour chart | State icon on each graph node from the single state map; pattern or labelled segments on the bars | P0-8 (graph nodes), P2-5 | Greyscale screenshot review |
| A11Y-23 | Moderate | 2.5.8 | Targets under 24×24 px: Combobox clear "×" (about 16×20) and chip remove "×" (about 8×20, chips 4 px apart); run tag filter buttons and tag links (about 20 px high, 4 px gap); toast dismiss "×" (about 16×20, NRV for the spacing exception); Grid sort header buttons (about 19 px high). Borderline at about 23.5 px: JsonView Copy, ResultView download, `Runs.tsx:273`, `FlowGraph.tsx:118`. Native 13–16 px radios and checkboxes in Grid and the Roles matrix (NRV for spacing) | `packages/ui/src/Combobox.tsx:119-121, 172-177`; `screens/Runs.tsx:273, 425-433`; `screens/RunPage.tsx:118-126`; `packages/ui/src/Toast.tsx:88-95`; `packages/ui/src/Grid.tsx:129, 226, 295`; `packages/ui/src/JsonView.tsx:63`; `packages/ui/src/ResultView.tsx:212`; `screens/Roles.tsx:195` | Motor-impaired pointer users; touch users | Minimum 24×24 target and 28 px icon buttons from the control-height decisions in `07-design-system-specification.md`; lucide icons in place of text glyphs | P2-1, P4-3; 08 | Playwright `boundingBox` assertion on every interactive element in the kit sheet |
| A11Y-24 | Moderate | 2.5.7 | Dragging with no single-pointer alternative. Flow page: node positions change only by dragging, and Enter or Space only selects. Flow editor: moving a node is drag-only for a pointer user; removing a connection needs the Backspace key after clicking the edge, with no on-screen delete; panning is drag or scroll. Layout is cosmetic, which limits impact | `FlowGraph.tsx:136-156, 252-256`; `screens/Flows.tsx:422-426`; `screens/FlowEditor.tsx:1061-1066, 1069, 1080-1083` | Pointer users who cannot drag; keyboard users on the flow page | "Reset layout" and arrow-key nudging on the read-only graph; a remove button per connection in the inspector | P0-8 | Manual single-pointer pass with dragging disabled |
| A11Y-25 | Moderate | 2.1.2 (NRV) | Monaco captures Tab. Its own toggle (Ctrl+M, Ctrl+Shift+M on macOS) should exist but nothing in the UI mentions it: no shortcut-sheet entry, no hint by the editor. The global Ctrl/⌘+K handler fires while focus is in Monaco, where Ctrl+K is a chord prefix. Ctrl/⌘+Enter is a window listener, not a Monaco command, so it may not fire in the code (Inferred) | `editor/CodeEditor.tsx:56-66`; `editor/monaco.ts:6`; `kit/CommandPalette.tsx:112-123, 735-746`; `screens/Authoring.tsx:316-326` | Keyboard-only users can be stuck in the editor unless they know the toggle | Document "Ctrl+M: Tab moves focus" in the shortcut sheet and under the editor; a visible toggle; register save and run inside Monaco | P1-4, P3-1 | Keyboard-path e2e: Tab into and out of the editor |
| A11Y-26 | Moderate | 1.4.10 (NRV) | Workbench screens keep title, description, toolbar and filters fixed above a list that is the only scrolling region. At 400 % zoom (320×256 CSS px) the fixed chrome can take most of the height. **Observed (mocked API)**: at 1440×900 the first Runs row starts at y = 282 px; at 390 px wide 480 px of chrome precede the first row | `kit/CollectionView.tsx:59-71`; `screens/Runs.tsx:200-300`; `Shell.tsx:903` | Low-vision users who zoom; phone users | Below a height breakpoint let the whole workbench scroll; shorter page chrome | P4-1, P1-1 | Playwright at 320×256 |
| A11Y-27 | Moderate | 2.1.4 | The single-character shortcut `?` is a window-level handler that cannot be turned off or remapped. The sheet it opens documents "j k — Move through a list", but no `j` or `k` handler exists anywhere | `kit/CommandPalette.tsx:744, 750-766` | Speech-input users (a spoken word can trigger it); everyone who trusts the sheet | An off switch on the account page or a modifier; remove or implement `j k` through one shortcut registry | P0-6, P3-1 | Unit test of the registry and its setting |
| A11Y-28 | Moderate | 2.2.1 (NRV) | Session expiry is not handled in the client. `/me` is checked once; a later 401 surfaces as a toast or inline error, with no warning, no way to extend and no re-authentication that keeps the page. The script and resource editors do not autosave, so typed work can be lost | `App.tsx:90-113`; `api.ts`; `screens/FlowEditor.tsx:700-706`; `screens/Interfaces.tsx:1657` | Slow typists, screen-reader users and anyone interrupted mid-edit | On 401, a modal re-authentication that keeps page state; warn at least 20 s before expiry with an extend option if sessions are short; autosave in every editor | P0-4 | Runtime test with a shortened session |
| A11Y-29 | Moderate | 1.4.3, 1.4.11 | Branding can break contrast and nothing checks it. An operator or tenant can set any valid colour for all 22 colour tokens, including `ink`, `canvas`, `action`, `action-ink`, `attention` and `focus`. The editor previews light and dark but computes no ratios; the only validation rejects non-colours | `screens/Branding.tsx:22-49`; `screens/InstanceBranding.tsx:81-83, 217`; `Portal.test.tsx:310` | Every user of a tenant whose brand colours fail | Contrast check in the branding editor and on the server for the pairs in section 5.20; warn and refuse below threshold for text and focus | P0-2 | Contrast test over tokens and saved branding |
| A11Y-30 | Moderate | 2.1.1, 1.4.13 | Information that exists only in a native `title` tooltip (about 77 uses; there is no Tooltip component): the "Used by" list, health and failure detail on connections and sources, permission descriptions in the Roles matrix (whose checkbox name is the raw permission string), palette descriptions in the App Builder, and the full value of about 40 truncated texts | `kit/references.tsx:25`; `screens/Roles.tsx:194-199`; `kit/copy.tsx:40`; `screens/Runs.tsx:407`; `Shell.tsx:444`; `screens/Operate.tsx:99`; `screens/Interfaces.tsx:1404` | Keyboard, touch and many screen-reader users never get the content | A Tooltip component that opens on focus; "Used by" as links; descriptions as visible or `aria-describedby` text; full value on focus for truncated text | P3-1 (Tooltip), P1-10, P4-6 | axe; manual keyboard pass |
| A11Y-31 | Moderate | 4.1.2, 2.4.3 | The table-rows grid is a table of buttons, not a grid: every editable cell is its own tab stop (50 rows × 8 columns is 400 stops plus radios and Delete buttons), with no arrow-key cell movement. The density toggle shows the other state's name while setting `aria-pressed`, which reads as contradictory. The screen's Previous/Next paging is hand-rolled without the kit Pagination's live label | `packages/ui/src/Grid.tsx:148, 174-176`; `screens/Data.tsx:262-279`; `packages/ui/src/Pagination.tsx:16` | Keyboard and screen-reader users editing table data | Real grid semantics: one tab stop, arrow keys between cells, Enter to edit, commit and cancel | P2-9 | Keyboard-path e2e on a seeded table |
| A11Y-32 | Moderate | Process | No automated accessibility check exists: no `axe-core`, `jest-axe`, `vitest-axe` or `@axe-core/playwright` in any `package.json`; no contrast test; no accessibility step in e2e; no accessibility statement | all `package.json` files; `e2e/*.spec.ts` | Every regression reaches users unnoticed | Section 7 | P2-12 | CI job exists and fails on a seeded violation |
| A11Y-33 | Minor | 1.4.13, 2.1.1 | Hover-only content: the Overview chart's per-hour tooltip is `hidden group-hover:block` inside an `aria-hidden` chart (screen readers get the table; sighted keyboard users get no per-hour numbers). JsonView "Copy" is `opacity-0` until hover or focus, so it stays invisible on touch | `screens/Overview.tsx:149`; `packages/ui/src/JsonView.tsx:63` | Sighted keyboard users; touch users | Focusable bars with the same text or a table on demand; Copy always visible at reduced emphasis | 08; P2-12 | Manual keyboard and touch pass |
| A11Y-34 | Minor | 4.1.2 | `role="radiogroup"` with `button role="radio"` and no arrow-key behaviour or roving tabindex: FilterChips and the App Builder viewport switch. Screen-reader users hear "radio" and get button behaviour | `kit/layout.tsx:301-322`; `screens/Interfaces.tsx:1315-1334` | Screen-reader and keyboard users | Reuse `SegmentedControl` (native radios) or switch to `aria-pressed` toggle buttons | 08; P2-12 | Component test: arrow keys move the selection |
| A11Y-35 | Minor | 2.4.7 (NRV) | Six inputs carry `outline-none`. The global `:focus-visible` rule is unlayered and should beat the layered utility, so the ring should still show; if not, `Shell.tsx:686` leaves only a 1.87:1 border change and two inputs leave nothing. Either way Combobox draws its own `focus-within` ring while the input keeps the global one, so a double ring is likely | `Shell.tsx:693`; `kit/CommandPalette.tsx:635`; `screens/Flows.tsx:120`; `screens/FlowEditor.tsx:978`; `editor/CodeEditor.tsx:119`; `packages/ui/src/Combobox.tsx:25, 27` | Sighted keyboard users | Delete the `outline-none` classes; one ring per composite control | P2-1; 08 | e2e focus screenshots |
| A11Y-36 | Minor | 2.4.11 (NRV) | A row focused while scrolling up can sit under a sticky table header. Toasts (fixed bottom-right) can cover a focused control for 5 s | `kit/CollectionView.tsx:85`; `packages/ui/src/ResultView.tsx:148`; `packages/ui/src/Toast.tsx:80` | Sighted keyboard users | `scroll-margin-top` on rows; toasts placed clear of content | P2-2, P2-8 | Manual Shift+Tab pass through a long list |
| A11Y-37 | Minor | 1.3.1 | Tables without an accessible name (kit `Table` has no label prop; hand-rolled tables in Runs, Execution, Roles, RowRules). `th` without `scope` in three places; empty header cells for the choose and actions columns and a filter row made of `th` in Grid. `aria-sort` set only on the sorted column | `packages/ui/src/Table.tsx:22`; `screens/Execution.tsx:857, 860-865, 1165`; `screens/Roles.tsx:154`; `screens/RowRules.tsx:312`; `screens/Runs.tsx:316, 319-323`; `screens/Overview.tsx:172-174`; `packages/ui/src/Grid.tsx:212, 240, 244-261` | Screen-reader users navigating by table | One list primitive with a required name, scoped headers and named action columns | P2-2 | axe |
| A11Y-38 | Minor | 1.3.1, 2.4.6 | Headings. No heading at all on Not found, the App Builder editor, the Dashboards owner view, or a new script, flow or resource (a Path field sits where the `h1` would be). Skipped levels: Card title fixed at `h3`, `h3` under `h1` in Execution and Provisioning, Markdown maps `#` to `h3`. `EmptyState` and `EmptyCanvas` titles are paragraphs. Card puts an `h3` inside a `button` | `screens/NotFound.tsx:5-24`; `kit/layout.tsx:281`; `screens/Interfaces.tsx:1716-1745`; `screens/Authoring.tsx:615-628`; `screens/FlowEditor.tsx:857-869`; `screens/ResourceEditor.tsx:329-342`; `packages/ui/src/Surfaces.tsx:33`; `screens/Execution.tsx:745`; `screens/Provisioning.tsx:109, 171, 222`; `packages/ui/src/Markdown.tsx:58`; `packages/ui/src/Notice.tsx:43` | Screen-reader users navigating by heading | One PageHeader that always renders an `h1` (visually hidden for a new object); a heading-level prop on Card, Form and Markdown | P2-3; 08 | axe heading-order; e2e asserts one `h1` per route |
| A11Y-39 | Minor | 4.1.2, 2.5.2 (NRV) | Command palette listbox: the input's `aria-label` is the long placeholder string; section titles are `role="presentation"` so groups are not conveyed; options are wrapped in plain `div`s; no `aria-autocomplete`; `aria-expanded` is hard-coded `"true"`; options activate on `onMouseDown` (a down-event activation); no Home, End or Page keys | `kit/CommandPalette.tsx:604-646, 655, 672` | Screen-reader users of the palette | `role="group"` with `aria-labelledby` per section; short label; activate on click | P3-2 | axe; screen-reader script |
| A11Y-40 | Minor | 1.3.1 | Landmarks: the breadcrumb marks the current location only with a screen-reader-only "/here", no `aria-current="page"`; the section name is screen-reader-only inside a workspace; `ReleasePath` has a stray `span` child in an `ol`; `Panel` is an unnamed `section`; kit `PageShell` has no `h1` and no skip link | `Shell.tsx:356-361, 788`; `kit/layout.tsx:69`; `packages/ui/src/PageShell.tsx` | Screen-reader users | Breadcrumb with `aria-current`; visible "Workspace › Section › Object" | P2-3 | axe |
| A11Y-41 | Minor | 4.1.2, 1.3.1 | Combobox: the `label` element wraps the label text, the control, the chips and the hint and error spans, so the input's accessible name includes all of them | `packages/ui/src/Combobox.tsx:41-51` | Screen-reader users hear a long, changing name | `Field.Root` and `Field.Label` as in `Fields.tsx`; hint and error by `aria-describedby` | P2-7; 08 | Component test of the accessible name |
| A11Y-42 | Minor | 3.3.1, 4.1.2, 2.5.3 | Grid inline edit: the edit button's accessible name is the cell value; the action is named only by `title="Change this value"`. Screen-level failures are shown in a danger Notice without pointing at the field | `packages/ui/src/Grid.tsx:150`; `screens/SignIn.tsx:214`; `screens/Git.tsx` | Screen-reader users | `aria-label` "Change {column}: {value}"; `aria-invalid` on the field a screen-level error refers to | P2-9, P2-7 | Component test |
| A11Y-43 | Minor | 1.4.11 (no failure) | Tag outlines at 45 % opacity are 1.87–2.24:1 in light and 2.35–2.90 in dark. The tag text passes on surface, so the border is decorative, but amber tag text fails on canvas until A11Y-20 is fixed | `kit/status.tsx:106-112` | Low-vision users | Treat as decorative; fix the text colour; one border opacity | P2-5 | Token contrast test |
| A11Y-44 | Minor | 2.5.7 (met), 4.1.3 | App Builder: drag-to-move and corner resize have number-field alternatives, so 2.5.7 is met. Gaps: the 16×16 resize handle is `aria-hidden` and the drag header says "Drag to move" only by `title`; problems-list entries are not links to the widget; in the running app the outcome notice renders once at the top of the page with no focus move, so feedback for a row action lower down is off-screen | `packages/screens/src/Renderer.tsx:853, 874-905`; `screens/Interfaces.tsx:1149-1181` | Keyboard and screen-reader users of the builder and of published apps | Arrow-key nudge on the selected widget; problems as links; outcome notice beside the action or focused | P2-10 | Keyboard-path e2e |
| A11Y-45 | Minor | 2.3.3 (AAA, advisory) | JavaScript-driven motion ignores the reduced-motion preference: `fitView({ duration: 200 })` in the flow editor; chart engine animation (NRV); Monaco smooth effects | `screens/FlowEditor.tsx:590, 758`; `packages/ui/src/Chart.tsx` | Users with vestibular disorders | Read the preference in one hook; duration 0 when reduced | P4-4 | Playwright with `reducedMotion: "reduce"` |
| A11Y-46 | Minor | 1.4.4, 1.4.12, 1.4.10 | Text sizing and truncation. All type sizes are in px, so browser zoom works but a user's default font size is ignored; the smallest text is 10 px (rail labels) and 10.5 px (tags). Single-line controls with fixed heights and `truncate` will clip under increased text spacing (NRV). **Observed (mocked API)**: "Waiting for approval" does not fit the Runs status column and is overdrawn by the next column at 1440 and 2200 px; at 390 px paths wrap mid-word | `packages/ui/src/tokens.css:131-154, 162`; `Shell.tsx:412, 732` | Low-vision users; users who override text spacing | Type roles from `07-design-system-specification.md` (no size below 10.5 px, and that only for tags); column sizing in the list primitive | P2-1, P1-1, P4-6 | Text-spacing bookmarklet pass; visual regression |
| A11Y-47 | Minor | 2.4.3, 3.3.1 | Sign-in meets 3.3.8 but: after "Continue" the email field is replaced and focus is not moved to the password field; the error is not tied to a field; helper text is `ink-subtle` on canvas (4.19) and the host line is 10.5 px. The reveal button is positioned over the input's right edge with no added padding, so long passwords may run under it (Inferred) | `screens/SignIn.tsx:135-197, 188, 246, 253` | Screen-reader and keyboard users at the first screen they meet | Focus the password field on step change; link the error; token fix | P0-7 (focus), P0-2, P2-7 | Keyboard-path e2e for sign-in |
| A11Y-48 | Minor | 4.1.3 | Over-announcement. Each `ExpressionField` preview is its own `role="status"`, so a step with six expressions announces six values when a test finishes. The LogViewer count is `aria-live`, so a live run announces a new line count on every batch. Every non-danger `Notice` is a live region even when static at load | `screens/ExpressionField.tsx:114, 121, 128`; `packages/ui/src/LogViewer.tsx:138`; `packages/ui/src/Notice.tsx:22` | Screen-reader users are flooded during a test or a live run | One summary announcement per test; throttle or drop the live count while following; `role` on Notice only when it appears after load | P2-8, P1-6 | Screen-reader script |
| A11Y-49 | Minor | 2.4.3, 2.1.1 | Flow editor "Add step" palette is an `aside`, not a menu or dialog: the search field is not focused on open, there is no arrow-key movement and no Escape. On the flow page the graph is rendered without `onSelect`, so every node is a tab stop that does nothing | `screens/FlowEditor.tsx:969-979`; `screens/Flows.tsx:418`; `FlowGraph.tsx:244-245` | Keyboard users | Palette as a Combobox or Menu with focus on open and Escape; nodes focusable only when they act, or give them an action (open the step in the outline) | P1-8, P0-8 | Keyboard-path e2e |
| A11Y-50 | Minor | various | Component-level gaps noted in section 6: Pagination can leave focus on a disabled button (NRV); Grid does not return focus to the cell button after commit; a second `ask.*` question silently cancels the first; Markdown external links give no "opens in new tab" cue; `Button` styles `aria-disabled` on links without enforcing it; Stepper shows done and pending by shape and muted text only; Timeline segments have no text alternative; FlowGraph labels are truncated at 20 and 26 characters with no full value; Facts values truncate with no way to expand | `packages/ui/src/Pagination.tsx`; `packages/ui/src/Grid.tsx:171-196`; `packages/ui/src/Dialogs.tsx:68-72`; `packages/ui/src/Markdown.tsx:147-151`; `kit/layout.tsx:166`; `packages/ui/src/Timeline.tsx`; `FlowGraph.tsx:284, 291`; `packages/ui/src/Facts.tsx` | Mostly screen-reader and keyboard users | Per-component fixes in section 6 | 08; P2-12 | Component tests with axe |
| A11Y-51 | Minor (informational) | 3.1.2 | `html lang="en"` is set. No `lang` on user-supplied content (tenant names, markdown). Not required unless multilingual content is expected | `apps/console/index.html:2` | Screen-reader users reading non-English tenant content | Decide when localisation is planned | None | Not applicable |

## 5. Topic detail

### 5.1 Colour contrast

Text needs 4.5:1 (1.4.3); control boundaries, focus indicators and state cues need 3:1 (1.4.11). Values below threshold are bold. "Proposed" rows use the replacement values decided in `07-design-system-specification.md`; they are proposals, not changes. Fonts stay as they are: no finding here is solved by changing them.

**Light theme: text on each background.**

| Foreground | canvas `#eef1f4` | surface `#ffffff` | sunken `#e3e8ed` | structure `#e7ebf0` | selected `#e3eff4` | code-bg `#f5f7f9` | action-soft `#dcedf3` |
|---|---|---|---|---|---|---|---|
| `ink` `#16202e` | 14.47 | 16.40 | 13.30 | 13.70 | 14.00 | 15.28 | 13.63 |
| `ink-muted` `#5b6777` (current) | 5.07 | 5.75 | 4.66 | 4.80 | 4.91 | 5.36 | 4.78 |
| `ink-muted` `#4b5666` (proposed) | 6.56 | 7.44 | 6.04 | 6.21 | 6.35 | 6.93 | 6.18 |
| `ink-subtle` `#687485` (current) | **4.19** | 4.75 | **3.85** | **3.96** | **4.05** | **4.42** | **3.94** |
| `ink-subtle` `#586474` (proposed) | 5.31 | 6.02 | 4.88 | 5.03 | 5.13 | 5.60 | 5.00 |
| `action` `#0e5f7a` | 6.31 | 7.15 | 5.80 | 5.97 | 6.10 | 6.66 | 5.94 |
| `danger` `#b3261e` | 5.77 | 6.54 | 5.30 | 5.46 | 5.58 | 6.09 | 5.43 |
| `attention` `#b45309` (current) | **4.43** | 5.02 | **4.07** | **4.19** | **4.28** | 4.68 | **4.17** |
| `attention` `#9a4707` (proposed) | 5.65 | 6.41 | 5.20 | 5.35 | 5.47 | 5.96 | 5.32 |
| `success` `#1f7a4d` (current) | 4.69 | 5.32 | **4.31** | **4.44** | 4.54 | 4.95 | **4.42** |
| `success` `#1b6e45` (proposed) | 5.51 | 6.24 | 5.06 | 5.22 | 5.33 | 5.81 | 5.19 |

The proposed `ink-muted` is not needed for conformance (the current value passes everywhere); it keeps muted text visibly darker than the new `ink-subtle`, so the two roles stay distinguishable.

**Light theme: component pairs.**

| Pair | Where | Current | Proposed |
|---|---|---|---|
| `action-ink` on `action` | Primary button | 7.15 | unchanged |
| `surface` on `danger` | Destructive button | 6.54 | unchanged |
| `canvas` on `attention` | Promote button (`packages/ui/src/Button.tsx:10`) | **4.43** | 5.65 |
| `attention` on `attention-soft` | Attention badge | **4.47** | 5.70 |
| `success` on `success-soft` | Success badge | 4.61 | 5.41 |
| `danger` on `danger-soft`; `action` on `action-soft` | Danger and action badges | 5.58; 5.94 | unchanged |
| `ink-muted` on `sunken` | Neutral badge | 4.66 | 6.04 |
| Placeholder: `ink-muted` at 70 % on surface / canvas | `packages/ui/src/Fields.tsx:6` | **3.04 / 2.84** | `ink-subtle` at full opacity: 6.02 / 5.31 |
| `ink-muted` at 60 % on surface | "empty" in null cells; grid filter placeholder | **2.52** | `ink-subtle`: 6.02 (a 60 % tint of the new muted would still be 2.85, so the opacity has to go) |
| `ink-muted` at `opacity-55` on structure | Rail links with no workspace open | **2.14** | Remove the opacity; these links work |
| Chip count at `opacity-80` | `kit/layout.tsx:320` | **3.41** off (canvas), **3.94** on | Remove the opacity |

**Light theme: non-text.**

| Pair | canvas | surface | sunken | structure | Note |
|---|---|---|---|---|---|
| `line` `#d3dae2` | **1.24** | **1.41** | **1.14** | **1.18** | Stays, for dividers and panel edges only (decorative, exempt) |
| `line-strong` `#b4bfcb` | **1.65** | **1.87** | **1.51** | **1.56** | Stays, for emphasis dividers only |
| `line-control` `#748090` (proposed, new) | 3.54 | 4.01 | 3.25 | 3.35 | Input, checkbox and unfilled-button boundaries; also 3.42 on selected, 3.33 on action-soft |
| `focus` `#0e5f7a` | 6.31 | 7.15 | 5.80 | 5.97 | Passes everywhere; 1.00 against `action`, saved by the 2 px offset gap |

| State cue | Ratio | Assessment |
|---|---|---|
| Selected row (`selected`) vs canvas / surface | **1.03 / 1.17** | Needs a non-colour cue; no fill change within this palette can reach 3:1 |
| Menu and combobox highlight (`action-soft`) vs surface | **1.20** | Same |
| Segmented control on (`surface`) vs off (`sunken`) | **1.23** | Same |
| Selected chip border (`action` at 60 %) vs `action-soft` | **2.66** | Use `action` at full opacity |
| Tag borders (colour at 45 %) vs surface / canvas | **1.94–2.24 / 1.87–2.17** | Decorative (A11Y-43) |
| Notice border (`danger` at 40 %) vs surface / danger-soft | **2.03 / 1.94** | Decorative; the notice has an icon and text |
| Timeline wait bar (`ink-muted` at 50 %) vs surface | **2.11** | Graphic that conveys meaning; needs a pattern or a text value (A11Y-50) |
| "Skipped" node stroke (`line`) vs surface | **1.41** (dashed) | Needs the state icon (A11Y-22) |

**Dark theme: text on each background.**

| Foreground | canvas `#10161f` | surface `#18212d` | sunken / structure `#0c1118` | selected `#172430` | code-bg `#0b1016` | raised `#1f2a38` | action-soft `#17323d` |
|---|---|---|---|---|---|---|---|
| `ink` `#e6ebf1` | 15.15 | 13.54 | 15.80 | 13.16 | 15.93 | 12.11 | 11.23 |
| `ink-muted` `#9aa7b6` | 7.42 | 6.63 | 7.73 | 6.44 | 7.80 | 5.93 | 5.50 |
| `ink-subtle` `#7e8b9b` (current) | 5.23 | 4.68 | 5.46 | 4.55 | 5.50 | **4.18** | **3.88** |
| `ink-subtle` `#8a97a7` (proposed) | 6.11 | 5.46 | 6.37 | 5.31 | 6.42 | 4.88 | 4.53 |
| `action` `#5cb8d6` | 8.03 | 7.17 | 8.37 | 6.97 | 8.44 | 6.42 | 5.95 |
| `danger` `#f2857d` | 7.29 | 6.51 | 7.60 | 6.33 | 7.66 | 5.83 | 5.40 |
| `attention` `#f0a94b` | 9.06 | 8.10 | 9.45 | 7.87 | 9.53 | 7.25 | 6.72 |
| `success` `#6fcf9a` | 9.57 | 8.55 | 9.98 | 8.31 | 10.06 | 7.65 | 7.09 |

**Dark theme: component pairs and non-text.**

| Pair | Current | Proposed |
|---|---|---|
| Primary button; destructive button; promote button | 7.29; 6.51; 9.06 | unchanged |
| Badges: action / attention / danger / success on their soft backgrounds | 5.95 / 6.90 / 6.16 / 7.22 | unchanged |
| Placeholder: `ink-muted` at 70 % on surface / canvas | **3.97 / 4.25** | `ink-subtle` at full opacity: 5.46 / 6.11 |
| `ink-muted` at 60 % on surface | **3.29** | `ink-subtle`: 5.46 |
| Rail links at `opacity-55` on structure | **3.13** | Remove the opacity |
| `line` `#2b3746` vs canvas / surface / sunken | **1.50 / 1.34 / 1.57** | Decorative only |
| `line-strong` `#3a4859` vs canvas / surface / sunken | **1.95 / 1.74 / 2.03** | Decorative only |
| `line-control` `#6b7b90` (proposed, new) vs canvas / surface / sunken / selected / raised / action-soft | — | 4.20 / 3.76 / 4.38 / 3.65 / 3.36 / 3.12 |
| `focus` `#5cb8d6` vs canvas / surface / sunken / selected / action-soft | 8.03 / 7.17 / 8.37 / 6.97 / 5.95 | unchanged |
| Selected row vs canvas / surface; menu highlight vs surface; segmented on vs off | **1.15 / 1.03; 1.21; 1.17** | Non-colour cue |
| Tag borders (colour at 45 %) vs surface | **2.35–2.83** | Decorative |

Two margins are thin after the change and should be pinned by the token test: dark `ink-subtle` on `action-soft` (4.53) and dark `line-control` on `action-soft` (3.12).

### 5.2 Keyboard access

What works: every control in the kit is a native element or a Base UI primitive, so Tab, Space, Enter and arrow keys behave as expected in buttons, menus, tabs, comboboxes and segmented controls (library behaviour is NRV). `CollectionView` rows take Enter and Space (`kit/CollectionView.tsx:112-121`). The command palette is fully keyboard-driven (`kit/CommandPalette.tsx:619-633`).

What does not: connecting flow steps (A11Y-01); opening the Runs inspector (A11Y-12); rearranging the read-only flow graph (A11Y-24); reaching content held in `title` tooltips (A11Y-30) and the Overview chart's per-hour numbers (A11Y-33).

What is expensive: lists have one or two tab stops per row and no row-to-row movement (A11Y-13); the table-rows grid has one tab stop per cell (A11Y-31). **Observed (mocked API)**: reaching the content of any screen costs 8 Tab presses on the rail alone (A11Y-15). These pass 2.1.1 and still make the console slow for the users who depend on the keyboard, which is why P0-3 (keyboard reach) and P2-2 (one list primitive with roving focus) are tied to accessibility, not to expert shortcuts in P3-1.

### 5.3 Logical focus order

DOM order in the shell is rail, section panel, header, main (`Shell.tsx:653-915`), which matches the visual order. Three places break the match between what the user did and where focus is:

1. The docked Inspector is last in the DOM (`kit/layout.tsx:156-162`), so after choosing row 3 of 50 the panel that just opened is 47 rows of tab stops away (A11Y-06).
2. Route changes leave focus where it was or drop it to `body` (A11Y-14).
3. Sign-in replaces the email field on "Continue" without moving focus (A11Y-47).

Flow editor nodes are in insertion order in the DOM, not flow order (A11Y-08); the step outline fixes this for the outline, and the canvas order should follow it (NRV for what xyflow allows).

### 5.4 Visible focus

The global rule (`packages/ui/src/tokens.css:167-170`) gives every focusable element a 2 px ring with a 2 px offset in the `focus` colour, which passes 3:1 on every background in both themes. `SegmentedControl` hides its native radios and draws the ring on the visible label through `has-[:focus-visible]` (`packages/ui/src/Pickers.tsx:39`), which is the right pattern for a hidden input.

Failures and risks: the read-only graph's nodes switch the outline off inline (A11Y-07); six inputs carry `outline-none` and depend on a cascade-layer accident (A11Y-35, NRV); Combobox probably shows two rings (A11Y-35). The design-system decision is one 2 px ring, 2 px offset, never removed, drawn on the node inside the graph.

### 5.5 Focus traps and modal focus restoration

| Surface | Trap | Escape | Focus on open | Focus on close | Evidence |
|---|---|---|---|---|---|
| Dialog (confirm, prompt, palette, shortcut sheet) | Yes (Base UI, NRV) | Yes | Base UI default; palette input has `autoFocus` | Returned to trigger (Base UI, NRV) | `packages/ui/src/Dialog.tsx:26-48` |
| SideSheet (narrow inspector, phone drawer) | Yes (Base UI, NRV) | Yes; has a Close button | Base UI default | Returned to trigger (NRV) | `packages/ui/src/SideSheet.tsx:22-73`; tested for name and Escape at `e2e/redesign.spec.ts:197-199` |
| Menu, Combobox popup | Not modal | Yes | First or current item | Returned to trigger (NRV) | `packages/ui/src/Menu.tsx`, `Combobox.tsx` |
| Docked Inspector (≥ 1280 px) | No (correct) | **No** | **Not moved** | **Lost to `body`** | `kit/layout.tsx:85-140` (A11Y-06) |
| Flow editor "Add step" palette | No | **No** | **Not moved** | — | `screens/FlowEditor.tsx:969-979` (A11Y-49) |
| Monaco | Tab captured by design | Ctrl+M toggle (NRV) | — | — | `editor/CodeEditor.tsx:56-66` (A11Y-25) |
| Toast | No; does not take focus (correct) | — | — | — | `packages/ui/src/Toast.tsx` |

A Dialog with no close button is not a trap for a keyboard user but may be one for a touch user with no Escape key when the dialog is full-screen (A11Y-11). A second `ask.*` question cancels the first without telling the user (`packages/ui/src/Dialogs.tsx:68-72`, A11Y-50).

### 5.6 Semantic labels and landmarks

Landmarks are complete and labelled: `nav aria-label="Main"` (`Shell.tsx:654`), `nav aria-label="Sections"` (`:670`), `header` (`:705`), `nav aria-label="Where you are"` (`:730`), `main` (`:902`), and `aside aria-label` for inspectors (`kit/layout.tsx:113`, `screens/FlowEditor.tsx:1089`). Below 768 px the two navigation regions move into a SideSheet (`Shell.tsx:917`). The gaps are small (A11Y-40): no `aria-current` on the breadcrumb's current location, one invalid list child, unnamed `Panel` sections.

Names: no unnamed button or input was found. The naming defects are of a different kind: a name that is too long (Combobox label, A11Y-41; palette input, A11Y-39), a name that states the value and not the action (Grid edit button, A11Y-42), a name that is a raw identifier (Roles checkboxes, A11Y-30), and a state that is not exposed (Menu current item, A11Y-17; clickable rows, A11Y-13).

### 5.7 Headings and page titles

The page title is the largest single orientation defect (A11Y-04) and is a one-effect fix in the shell.

Most screens get exactly one `h1` from `PageHeader` (`kit/layout.tsx:47`), `CollectionView` (`kit/CollectionView.tsx:63`) or their own header (`screens/RunPage.tsx:105`, `screens/Runs.tsx:205`, `screens/Dashboards.tsx:148`, `screens/SignIn.tsx:102`). The public approval page has an `h1` per state (`screens/ApproveLink.tsx:87, 97, 126`). The screens with no `h1`, the skipped levels and the hard-coded levels in kit components are listed in A11Y-38. The proposed single PageHeader (P2-3) is also the focus target for route changes (P0-7), so the two should be designed together: a heading that always exists, takes `tabIndex={-1}`, and supplies the text for `document.title`.

### 5.8 Form errors

| Aspect | State | Evidence |
|---|---|---|
| Labels | Every field has one | section 3 |
| Hints | Linked with `aria-describedby` (Base UI `Field.Description`); tested | `packages/ui/src/Fields.tsx:15-29`; `kit.test.tsx:138` |
| Error text quality | Specific and corrective ("Use at least N characters") | `packages/ui/src/Form.tsx:97-128` |
| Focus on submit | First invalid field is focused; tested | `packages/ui/src/Form.tsx:166-170`; `Form.test.tsx:102` |
| Error linked to control | **No**, except CheckboxField | A11Y-18 |
| Invalid shown on the control | **No** border or icon; red text below only | A11Y-03, A11Y-18 |
| Required shown | **No** visible marker | A11Y-19 |
| Announcement | Each field error is `role="alert"`, so several are read at once | `packages/ui/src/Form.tsx:165` |
| Screen-level errors | Danger Notice (`role="alert"`), not tied to a field | A11Y-42 |
| Row-action errors | Toast only, polite, gone in 5 s | A11Y-05 |

The kit `Form` engine handles focus correctly, but the settings forms in the tenant and instance areas are hand-assembled from individual fields and do not use it, so each reinvents busy, error and saved states. P2-7 (FormField with linked errors and required marks, one save model) is the accessibility fix as well as the consistency fix.

### 5.9 Target sizing

Measured control heights from the kit: Button 36 and 28; text fields 36; Grid filter and cell editor 28; segmented control 32 and 24; FilterChips 28; menu items about 32; icon buttons 24 (`CopyIcon`), 28 (inspector close, panel toggles) and 32 (sheet close, phone menu, DateStepper). All of these meet the 24×24 minimum. The exceptions are the text-glyph buttons and bare tag buttons in A11Y-23 and the 6 px flow handles in A11Y-09. The glyph buttons are small because `packages/ui` uses characters ("×", "‹", "›", "▲", "▼") with `px-1` padding where the console uses lucide icons in sized buttons; adopting the 28 px icon button with a 16 px icon (decided in `07-design-system-specification.md`) removes the whole class.

### 5.10 Screen-reader labelling and live regions

| Event | Announced today | Evidence | Proposed |
|---|---|---|---|
| Route change | No | A11Y-14 | Focus the main heading; title changes |
| Run state changes (queued → running → finished) | No | A11Y-16 | One polite region by the run header |
| Content finishes loading | No (45 bare "Loading…" paragraphs) | A11Y-16 | LoadState with `role="status"` (P2-4) |
| Write succeeds | Toast, polite | `packages/ui/src/Toast.tsx:84` | Keep polite; one persistent live container |
| Write fails | Toast, polite, 5 s | A11Y-05 | `role="alert"`, persists |
| Field error appears | Yes, `role="alert"` each | A11Y-18 | One summary alert; errors linked to fields |
| Flow layout saved; script and flow save state | Yes | `screens/Flows.tsx:436`; `screens/Authoring.tsx:561`; `screens/FlowEditor.tsx:882` | Keep |
| App Builder save state | Yes, `role="status"` | `screens/Interfaces.tsx:1737-1745` | Keep; make "Not saved" visually stronger |
| Page changes in Pagination; DateStepper value | Yes | `packages/ui/src/Pagination.tsx:23`; `Pickers.tsx:122` | Keep |
| Log line count during a live run | Yes, on every batch | A11Y-48 | Throttle or silence while following |
| Expression previews after a test | Yes, once per field | A11Y-48 | One summary |
| "Copied" | No | A11Y-16 | Announce |
| Palette result count | No | A11Y-16 | Announce count and "nothing matches" |

Whether a newly inserted `role="status"` element is announced reliably varies by screen reader (NRV); a single container that is always in the DOM is the dependable form.

### 5.11 Accessible data tables

Six list implementations exist (see `02-design-system-forensics.md`). Their table semantics differ:

| Implementation | Name | Header scope | Sort exposed | Row selection | Keyboard |
|---|---|---|---|---|---|
| kit `Table` (`packages/ui/src/Table.tsx`) | **None** (no prop) | `scope="col"` | n/a | none | none |
| `CollectionView` | Yes (`kit/CollectionView.tsx:84`) | Yes (`:90`) | n/a | `aria-selected` on `tr` (unsupported) | Row is a tab stop; Enter and Space |
| `Grid` | Yes (`packages/ui/src/Grid.tsx:209`) | Yes, with `aria-sort` on the sorted column | Yes, real button | Radio per row (correct) plus `aria-selected` on `tr` | Tab per cell; Enter and Escape in the editor |
| Runs (hand-rolled) | **None** | **No scope** | n/a | `aria-selected` on `tr`; pointer only | Link only |
| Execution, Roles, RowRules (hand-rolled) | **None** | Partly | n/a | none | none |
| `ResultView` table | Inside a labelled `section` | — | n/a | none | Scroll region focusable |

The fix is structural: one list primitive (P2-2) that requires a name, scopes its headers, exposes sort on every sortable column, puts the open action on a real control, and uses one tab stop with arrow-key movement. The table-rows grid needs true grid semantics on top of that (P2-9). Sticky headers need `scroll-margin-top` on rows (A11Y-36).

### 5.12 Non-colour status communication

`StatePill` is the model: an icon, a word and a colour for every lifecycle state (`kit/status.tsx:67-84`), with distinct icons. `Tag` and `EnvTag` are text. The junction shapes in the shell differ by fill, outline and dash and sit beside text. Graph edges are well handled: taken edges are thicker, untaken ones dashed, error edges dashed and labelled "on error".

The exceptions are the run graph's nodes and the Overview bars (A11Y-22), selection states (A11Y-03), and the Stepper and Timeline (A11Y-50). The proposed single `RunState` map with distinct icons and an explicit `unknown` fallback (P2-5) should feed the graph nodes too, so one definition of "failed" covers pill, node and timeline.

Related: **Observed (mocked API)**, a run whose state is not in the state map throws inside `StatePill` (`kit/status.tsx:79`) and blanks the whole console. That is a robustness defect for every user (roadmap P0-1), and for a screen-reader user it is silent.

### 5.13 Reduced motion

The global rule removes CSS transitions and animations under `prefers-reduced-motion` (`packages/ui/src/tokens.css:172-177`). There is little motion to remove: "running" is a static icon and word, and the only CSS animations are loading pulses (`packages/ui/src/Surfaces.tsx:136`, `packages/ui/src/Chart.tsx:90`) and one width transition (`screens/Interfaces.tsx:1371`). JavaScript-driven motion is not covered (A11Y-45). When P4-4 adds a running indicator, it must be inside the same rule: the decision is that nothing loops except that indicator, and all motion is removed under reduced motion.

### 5.14 Dragging and drag alternatives

A search for `draggable`, `onDrag*`, `onDrop`, `onPointerDown`, `setPointerCapture` and resize cursors found the interactions below and no others: there is no column reorder, no split-pane resizer and no file drop zone.

| Drag interaction | Screen | Non-drag pointer alternative | Keyboard alternative | Evidence | Finding |
|---|---|---|---|---|---|
| Connect two steps | Flow editor | Possibly click source handle then target handle (xyflow `connectOnClick` default, NRV), on 6 px targets | **None** | `screens/FlowEditor.tsx:1067` | A11Y-01, 09 |
| Route the error path | Flow editor | As above (NRV) | **None** | `screens/FlowEditor.tsx:252-255` | A11Y-01 |
| Route a branch case | Flow editor | As above (NRV) | **None** | `screens/FlowEditor.tsx:256-258` | A11Y-01 |
| Move a step | Flow editor | "Tidy up" auto-layout (`screens/FlowEditor.tsx:887-899`); no way to place one step | Arrow keys on a selected node (xyflow default, NRV) | `screens/FlowEditor.tsx:1069` | A11Y-24 |
| Pan the canvas | Flow editor | Scroll; zoom and fit buttons (`screens/FlowEditor.tsx:1081`) | Zoom and fit buttons | `screens/FlowEditor.tsx:1080-1083` | A11Y-24 |
| Box-select several steps | Flow editor | Modifier-click (xyflow default, NRV) | None known | library | — (no multi-step action exists yet) |
| Arrange nodes | Flow page (read-only graph) | **None** (an auto-layout exists, but there is no control to return to it) | **None** | `FlowGraph.tsx:54-69, 136-156, 252-256`; `screens/Flows.tsx:422-426` | A11Y-24 |
| Move a widget | App Builder | x and y number fields | Same fields | `packages/screens/src/Renderer.tsx:874-884`; `screens/Interfaces.tsx:1149-1181` | A11Y-44 (met) |
| Resize a widget | App Builder | Width and height number fields | Same fields | `packages/screens/src/Renderer.tsx:900-907` | A11Y-44 (met) |
| Resize a textarea | Any form | Browser-native (exempt) | — | `packages/ui/src/Fields.tsx:124` | — |

Operations that might be expected to drag and do not: form questions, field order and list items all reorder with Move up / Move down buttons (`screens/Interfaces.tsx:781-809`, `packages/ui/src/SchemaForm.tsx:600-616`). Branch cases, which are "tried in order", cannot be reordered at all, by any means (`screens/FlowEditor.tsx:1428, 1449-1468`); that is a functional gap covered by P3-6.

Related non-drag gap: removing a connection is "click the edge, then press Backspace" with no on-screen control (`screens/FlowEditor.tsx:1061-1066`), so a pointer-only user cannot do it.

### 5.15 Canvas accessibility

**Flow editor (`@xyflow/react` 12.12.1). What each user can do today.**

| Task | Keyboard-only user | Screen-reader user |
|---|---|---|
| Add a step | Yes: "Add step" and the palette are buttons (`screens/FlowEditor.tsx:959-1040`); the search is not focused on open (A11Y-49) | Yes; the palette is a labelled `aside` |
| Find and select a step | Tab to a node, Enter (xyflow default, NRV); order is insertion order | Each node card exposes its id, type, description and run state as text (`screens/FlowEditor.tsx:239-247`); xyflow adds its own labels and a keyboard description (NRV) |
| Edit a step | Yes: inspector fields (`screens/FlowEditor.tsx:1089-1343`) | Yes: labelled fields in a labelled `aside` |
| Delete a step | Yes: "Remove this step" with a confirm (`:1330-1340`), or Backspace on a selected node with no confirm (NRV) | Yes |
| **Connect steps, route errors and branch cases** | **No** | **No** |
| Remove a connection | Tab to the edge, Enter, Backspace (NRV); undiscoverable | Edge labels are SVG text; NRV for what is announced |
| Understand the flow's order and branching | Visually, yes | **No**: no outline, edges are not a structure |
| Move a step | Arrow keys (NRV) | Not meaningful |
| Undo and redo | Buttons and Ctrl/⌘+Z (`:739-752, 901-918`) | Yes; button titles name the action |
| Test the flow | Yes: Test is a button | Yes; six status regions fire at once (A11Y-48) |

No test covers any keyboard use of the canvas: `e2e/flow-editor.spec.ts:122-136` only presses undo and redo. Nothing in the repository sets `disableKeyboardA11y`, `nodesFocusable`, `edgesFocusable`, `deleteKeyCode` or `connectOnClick`, so the library defaults should apply, but every "NRV" in the table depends on that.

**Read-only graph (`FlowGraph.tsx`), on the flow page and the run page's Graph tab.**

| Task | Keyboard-only user | Screen-reader user |
|---|---|---|
| Reach a node | Yes: each node is `role="button" tabIndex={0}` | Yes: `aria-label` is "Kind id, State" (`FlowGraph.tsx:244-247`), `aria-pressed` for selection |
| See which node is focused | **No** (A11Y-07) | n/a |
| Select a node (run page) | Enter or Space (`FlowGraph.tsx:258-263`; tested at `FlowGraph.test.tsx:66`) | Yes |
| Act on a node (flow page) | Nothing happens: `onSelect` is not passed (A11Y-49) | Hears "button" that does nothing |
| Learn order and branching | Visually | **No**: edges have no name (A11Y-08). The run page's Timeline tab is a workable text alternative; the flow page has none |
| Learn a step's run state | Colour and a 5 px dot (A11Y-22) | In the label |
| Rearrange | **No** (A11Y-24) | n/a |

**Proposed: step outline and inspector "goes to" controls (roadmap P0-8).** Two additions make the canvas optional and leave it intact for those who prefer it.

1. A **step outline**: an ordered list titled "Steps", in topological order from the trigger, visible beside the canvas or as a "List" tab. Each item shows the step's name and kind, then its outgoing connections in words ("then → send-receipt", "on error → notify-ops", one line per branch case). Each item holds a button that selects the step and moves focus to the inspector. The same component, read-only, appears on the flow page and replaces the graph as the default view for screen-reader users. It gives a screen-reader user the structure 1.3.1 requires, gives every user a second way to find a step in a large flow, and gives clickable problems (P1-8) a target.
2. **Inspector connection controls**: for the selected step, one "Then go to" select per output (from the same `outputs(node)` the handles use) and an "On error go to" select, each listing the other steps by name plus "Nothing". Existing connections are listed with a remove button. They write through the same `connect` and `setEdges` logic the drag uses, so undo, validation and autosave are unchanged. A newly added step is inserted after the selected step and connected to it (P1-8).

With these in place: handles grow to a 24 px hit area for pointer users (A11Y-09); nodes in both graphs draw a visible focus ring on the node (A11Y-07); the read-only graph gains "Reset layout" and arrow-key nudging (A11Y-24). The instruction text at `screens/FlowEditor.tsx:1359-1363` then describes both paths, not only the drag.

### 5.16 Monaco

Monaco is created with `ariaLabel` set from the caller (`editor/CodeEditor.tsx:56-66`; labels at `screens/Authoring.tsx:703, 940`) and no accessibility options. Because the full `monaco-editor` package is imported (`editor/monaco.ts:6`), its built-in Tab-focus toggle (Ctrl+M; Ctrl+Shift+M on macOS) and accessibility help (Alt+F1) should be available (NRV). The console tells the user about neither. Two window-level shortcuts interact with Monaco: Ctrl/⌘+K opens the palette where Monaco expects a chord prefix, and Ctrl/⌘+Enter (save and run) is not registered as a Monaco command, so inside the code it may insert a line, not run (Inferred; see `04-workflow-journey-audit.md`). The plain-textarea fallback (`editor/CodeEditor.tsx:112-121`) is a real strength: a user for whom Monaco does not work with their assistive technology should be able to choose it deliberately, which today they cannot. P1-4 should add: the Tab toggle documented under the editor and in the shortcut sheet, save and run registered inside Monaco, and a "plain text editor" preference.

### 5.17 Timeouts and session expiry

Two time limits exist. Toasts last 5 s for every tone with no pause, extension or setting (A11Y-05). Sessions expire on the server; the lifetime was not reviewed, and the client has no warning, extension or in-place re-authentication (A11Y-28, NRV). The risk of lost work is higher than the source notes assumed because the script and resource editors do not autosave and a new flow is not autosaved until its first manual save. P0-4 (unsaved-changes guard and autosave) is therefore part of meeting 2.2.1, not only a convenience.

### 5.18 Single-key shortcuts

| Shortcut | Modifier | Scope | 2.1.4 | Evidence |
|---|---|---|---|---|
| `?` opens the shortcut sheet | None | Window, outside inputs, textareas, selects and contenteditable | **Fails**: cannot be turned off or remapped | `kit/CommandPalette.tsx:750-766` |
| `j` `k` list movement | None | Advertised only; no handler exists | Not applicable today; must meet 2.1.4 when built | `kit/CommandPalette.tsx:744` |
| Ctrl/⌘+K, Ctrl/⌘+Enter, Ctrl/⌘+Z, Ctrl+Y | Yes | Window | Passes | `kit/CommandPalette.tsx:115`; `screens/Authoring.tsx:319`; `screens/FlowEditor.tsx:742-750` |
| Backspace deletes a selected node or edge | None | Only while a node or edge has focus | Passes (active only on focus) | xyflow default (NRV) |
| Enter, Space, Escape, arrows in components | None | Only on the focused component | Passes | — |

P3-1 plans list movement keys (`j`, `k`, `x`) and go-to chords. Each is a single-character shortcut, so the one shortcut registry it introduces must ship with an off switch (and ideally remapping) from the first key it registers; that requirement belongs in P0-6, where `j k` is either removed or implemented.

### 5.19 Reflow and zoom

The layout is responsive by construction: the rail and section panel hide below 768 and 1024 px and move to a drawer (`Shell.tsx:656, 672, 917`); `CollectionView` hides lower-priority columns (`kit/CollectionView.tsx:16`); dialogs and sheets size to `min(…, 100vw - 2rem)` (`packages/ui/src/Dialog.tsx:33-37`, `packages/ui/src/SideSheet.tsx:36-40`); kit tables scroll inside their own box (`packages/ui/src/Table.tsx:21`, `packages/ui/src/Grid.tsx:208`). Browser zoom works because sizes are px, so 1.4.4 is met by zoom.

The risks come from the "workbench" layout mode, where `main` is `overflow-hidden` and one inner region scrolls: the flow editor's stacked inspector can be clipped (A11Y-10, NRV), and list headers that do not scroll can crowd out the list at 400 % (A11Y-26, NRV). **Observed (mocked API)** at 390 px wide: the Runs list drops two columns, wraps paths mid-word and truncates error text. The breakpoint decision in `07-design-system-specification.md` is that phone widths are for triage (overview, runs, approvals) and editors below 1024 px show a clear desktop-only notice; that notice must itself be reachable and must not hide content a zoomed desktop user needs, since a 1280 px window at 200 % is a 640 px viewport.

### 5.20 Branding-induced contrast risk

Instance and tenant branding can replace all 22 colour tokens (`screens/Branding.tsx:22-49`). The editor is a flat list of raw token names with a light and dark preview and no contrast computation; the server accepts any valid colour. A brand colour that looks right in a logo can make primary buttons, links, the focus ring or the production signal unreadable for every user of that tenant, in a way the platform's own token fixes cannot prevent.

Pairs the proposed check must cover, with thresholds:

| Pair | Threshold | Why |
|---|---|---|
| `ink`, `ink-muted`, `ink-subtle` on `canvas`, `surface`, `sunken`, `structure`, `selected`, `raised`, `code-bg` | 4.5 | All body and label text |
| `action-ink` on `action` | 4.5 | Primary button label |
| `action`, `danger`, `attention`, `success` on `canvas`, `surface`, `sunken`, `structure`, `selected` and on their own soft background | 4.5 | Links, state words, badges |
| `canvas` on `attention`; `surface` on `danger` | 4.5 | Promote and destructive button labels |
| `focus` on every background token | 3.0 | Focus ring |
| `line-control` on `canvas`, `surface`, `sunken` | 3.0 | Control boundaries |

The check runs in three places: live in the branding editor (ratio shown beside each pair, failing pairs named in plain words), on save on the server (refuse text and focus pairs below threshold), and in CI over the default tokens. This is part of P0-2, not a later refinement, because the default-token fix is undone by one unchecked brand.

## 6. Per-component accessibility

"Base UI" means the behaviour comes from `@base-ui/react` and was not verified at runtime. "Global ring" is the rule at `packages/ui/src/tokens.css:167-170`.

### `packages/ui/src`

| Component (file) | Keyboard | Focus management | ARIA and semantics | Issues | Fix |
|---|---|---|---|---|---|
| Badge (`Badge.tsx`) | n/a | n/a | `span` with text | Attention tone 4.47:1 light (A11Y-20) | Token change |
| Button (`Button.tsx`) | Native `button` or `a` | Global ring | `type="button"` default; link form when it navigates | Promote label 4.43:1 (A11Y-20); secondary border 1.41:1 (A11Y-03); `aria-pressed` passes through unstyled; `aria-disabled` on links styled but not enforced; no loading state | `line-control` border; pressed and loading states; enforce disabled links |
| Chart (`Chart.tsx`) | None (image) | n/a | `role="img"` with title and description | No data-table alternative in the kit; animation under reduced motion NRV (A11Y-45) | Optional table view; honour reduced motion |
| ComboboxField, MultiSelectField (`Combobox.tsx`) | Base UI: type, arrows, Enter, Escape, Backspace on chips | Base UI | Combobox and listbox; Clear and Remove have `aria-label` | Label wraps everything (A11Y-41); error not linked (A11Y-18); Clear and chip remove under 24 px (A11Y-23); probable double ring (A11Y-35); placeholder 3.04:1 (A11Y-21); highlight 1.20:1 (A11Y-03) | `Field.Label`; linked error; 24 px targets; one ring; token changes; check icon on the active option |
| Dialog (`Dialog.tsx`) | Escape (Base UI) | Trap and return (Base UI) | Title and Description | No close button; full-screen on phones in palette size (A11Y-11) | Labelled close button |
| DialogsProvider (`Dialogs.tsx`) | Enter submits; Cancel button | Via Dialog | Labelled field; named action button | A second question silently cancels the first (A11Y-50) | Queue questions |
| Facts (`Facts.tsx`) | n/a | n/a | `dl`, `dt`, `dd` | Values truncate with no way to expand (A11Y-50) | Wrap, or full value on focus |
| TextField, SelectField, TextAreaField, NumberField, DateField, CheckboxField (`Fields.tsx`) | Native | Global ring | Base UI Label, Control, Description; checkbox has `aria-invalid` and `aria-describedby` | Error not linked (A11Y-18); no required marker (A11Y-19); border 1.41:1 and no invalid border (A11Y-03); placeholder contrast (A11Y-21) | FormField standard (P2-7) |
| Form (`Form.tsx`) | Native | Focuses first invalid field | `noValidate` with its own messages; Notice for failure | Title fixed at `h2`; every error is `role="alert"` at once (A11Y-18) | Heading-level prop; one summary alert |
| Grid (`Grid.tsx`) | Sort buttons, filter inputs, radio per row, edit button to input (Enter, Escape) | `autoFocus` on edit; focus not returned to the cell after commit | Named; `scope`; `aria-sort`; labelled filters | Tab stop per cell (A11Y-31); `aria-selected` on `tr` (A11Y-13); empty and misused `th` (A11Y-37); edit button named by value (A11Y-42); "empty" 2.52:1 (A11Y-21); sort buttons about 19 px high (A11Y-23); density toggle label contradicts `aria-pressed` (A11Y-31) | Grid semantics (P2-9) |
| JsonView (`JsonView.tsx`) | Scroll region `tabIndex=0`; Copy button | Global ring | `section aria-label` | Copy hidden until hover or focus (A11Y-33); Copy about 23 px high (A11Y-23); string and number colours 4.31 and 4.07 on sunken (A11Y-20) | Always-visible Copy; token changes |
| LogViewer (`LogViewer.tsx`) | Native input, select, toggles; focusable scroll region | — | `aria-label`s; `aria-pressed`; live count | Count announced on every batch (A11Y-48); lines are not a `role="log"` region (arguably right) | Throttle the count (P1-6) |
| Markdown (`Markdown.tsx`) | Links | — | Headings start at `h3`; external links have `rel` | Fixed heading level (A11Y-38); no "opens in new tab" cue (A11Y-50) | Level prop; visible cue |
| Menu (`Menu.tsx`) | Base UI: arrows, typeahead, Enter, Escape | Base UI: return to trigger | `ariaLabel` prop for icon triggers | Current item not exposed (A11Y-17); highlight 1.20:1 (A11Y-03); no disabled item | RadioItem; non-colour highlight |
| Notice, EmptyState (`Notice.tsx`) | n/a | n/a | `role="alert"` for danger, `status` otherwise | EmptyState title is a `p` (A11Y-38); static notices are live regions (A11Y-48) | Heading; role only when inserted |
| PageShell (`PageShell.tsx`) | Links, buttons | — | `header`, `nav aria-label="Main"`, `main`, `aria-current` | No skip link; title is a `span`, no `h1` (A11Y-40); count pill 4.47:1 (A11Y-20) | Skip link; `h1` |
| Pagination (`Pagination.tsx`) | Buttons | Focus stays on the button | `nav aria-label`; live label | Focus can rest on a disabled button at the last page (NRV, A11Y-50) | Keep the button focusable with `aria-disabled` |
| SegmentedControl (`Pickers.tsx`) | Native radios: arrows, Tab | Ring drawn on the visible label | `fieldset` and `legend` | On and off differ by 1.23:1 (A11Y-03) | Non-colour on-state |
| DateStepper (`Pickers.tsx`) | Buttons | — | `fieldset`, `legend`, `aria-label`s, live value | Text glyph buttons, sized 32 (fine) | Icons (P4-3) |
| ResultView (`ResultView.tsx`) | Focusable scroll regions | — | `section aria-label`; table inside | Table unnamed (A11Y-37); `title`-only truncation (A11Y-30); download chip about 23 px (A11Y-23); sticky header (A11Y-36) | List primitive |
| SchemaForm (`SchemaForm.tsx`) | Native; Move up, Move down, Remove buttons | Focuses first invalid | `fieldset`s; labelled array buttons | Errors not linked (A11Y-18) | FormField standard |
| SideSheet (`SideSheet.tsx`) | Escape; Close button | Trap and return (Base UI) | Title, Description, `aria-label="Close"` | None found | Reference pattern for Dialog |
| Card (`Surfaces.tsx`) | Whole card is a `button` when selectable | Global ring | `aria-pressed` | `h3` inside a `button`; fixed `h3` (A11Y-38) | Heading outside the button; level prop |
| Avatar (`Surfaces.tsx`) | n/a | n/a | `role="img"` with name, or decorative | None | — |
| Skeleton (`Surfaces.tsx`) | n/a | n/a | `role="status"` with label | None; not used by screens | Use through LoadState (P2-4) |
| Table (`Table.tsx`) | n/a | n/a | `scope="col"` | No name or caption prop (A11Y-37); no hover, selected, loading or error state | Replace with the list primitive |
| Tabs (`Tabs.tsx`) | Base UI: arrows, Home, End | Base UI | `aria-label` required | None; active tab has colour and a 2 px underline | — |
| Timeline (`Timeline.tsx`) | Row buttons | Global ring | `aria-pressed`; bars and axis `aria-hidden` | Segment kinds by colour with a legend; wait bar 2.11:1; durations must be in the row text (NRV per caller) (A11Y-50) | Duration text per row; pattern on wait |
| Toast (`Toast.tsx`) | Dismiss button | Does not take focus (correct) | `role="status"` per toast | 5 s for every tone; errors polite; no pause; small dismiss (A11Y-05, 23, 36) | Toast v2 (P2-8) |
| widgets (`widgets.tsx`) | Buttons; card lists | — | `aria-pressed`; `aria-label` on card lists | "empty" 2.52:1 (A11Y-21) | Token change |

### Console kit and shell (`apps/console/src`)

| Component (file) | Keyboard | Focus management | ARIA and semantics | Issues | Fix |
|---|---|---|---|---|---|
| CollectionView (`kit/CollectionView.tsx`) | Rows `tabIndex=0`, Enter and Space | None on open | Named table; `scope`; `aria-current` or `aria-selected` | Row has no role or name; tab stop per row (A11Y-13); selected 1.03:1 (A11Y-03); bare "Loading…" (A11Y-16); fixed header at zoom (A11Y-26); headers `ink-subtle` on canvas (A11Y-02) | List primitive (P2-2) |
| ListCollection (`kit/ListCollection.tsx`) | Via CollectionView; action buttons | Via Inspector | — | Inherits A11Y-13 and A11Y-06 | As above |
| CommandPalette (`kit/CommandPalette.tsx`) | Ctrl/⌘+K, arrows, Enter, ⌘Enter, Backspace, Escape | `autoFocus` input; return by Base UI | Combobox, listbox, `aria-activedescendant` | No close on phones (A11Y-11); listbox structure (A11Y-39); no result announcement (A11Y-16) | Palette v2 (P3-2) with the Dialog close button earlier |
| ShortcutSheet (`kit/CommandPalette.tsx:749-782`) | `?` opens; Escape closes | Dialog; no focusable content | `dl` | Single-key shortcut; lists `j k`; no Monaco or canvas keys (A11Y-27, 25) | Registry-driven sheet |
| BrandMark (`kit/brand.tsx`) | n/a | n/a | `alt` or `role="img"`, or decorative | Sets `document.title` once only (A11Y-04) | Title effect in Shell |
| CopyIcon, CopyableId (`kit/copy.tsx`) | Button | — | `aria-label`; state by `title` and icon swap | "Copied" not announced (A11Y-16); full value only in `title` (A11Y-30) | Announce; value on focus |
| PageHeader (`kit/layout.tsx:30`) | n/a | Not a focus target on navigation (A11Y-14) | `h1` | Eyebrow `ink-subtle` on canvas 4.19 (A11Y-02) | One PageHeader (P2-3), focusable |
| SectionLabel (`kit/layout.tsx:59`) | n/a | n/a | `h2` | `ink-subtle` 12 px uppercase on canvas 4.19 (A11Y-02) | Token change |
| Panel (`kit/layout.tsx:69`) | n/a | n/a | `section` without a name | Unnamed region (A11Y-40) | `aria-labelledby` its heading, or a `div` |
| Inspector (`kit/layout.tsx:85`) | Close button; no Escape when docked | None when docked; SideSheet when narrow | `aside aria-label`; `h2` | A11Y-06 | Focus in, focus back, Escape |
| MasterDetail (`kit/layout.tsx:146`) | — | — | — | Inspector last in DOM (A11Y-06) | With Inspector |
| Stepper (`kit/layout.tsx:166`) | Buttons when selectable | — | `ol`; `aria-current="step"` | Done and pending by shape and muted text only (A11Y-50) | "Done" in text |
| NextStep, EmptyCanvas (`kit/layout.tsx:229, 263`) | n/a | n/a | EmptyCanvas title is a `p` | No heading (A11Y-38) | Heading |
| FilterChips (`kit/layout.tsx:289`) | Tab and Space or Enter on each | — | `radiogroup` and `radio` | No arrow keys (A11Y-34); on-border 2.66:1 (A11Y-03); count at `opacity-80` (A11Y-21) | SegmentedControl or toggle buttons |
| KeyValues (`kit/layout.tsx:330`) | n/a | n/a | `dl` | Labels `ink-subtle` (A11Y-02) | Token change |
| Junction, Wire, SignalPath, PortBrackets, InsetRule, JunctionList (`kit/motifs.tsx`) | n/a | n/a | All `aria-hidden` | Decorative; none | — |
| UsedBy (`kit/references.tsx`) | n/a | n/a | Detail only in `title` (`:25`) | List of users unreachable by keyboard or touch (A11Y-30) | Links (P1-10) |
| StatePill, Tag, EnvTag, Mono (`kit/status.tsx`) | n/a | n/a | Icon `aria-hidden` plus text | Subtle and attention tones fail on canvas (A11Y-02, 20); tag text 10.5 px; unknown state throws (see 5.12) | Token change; `unknown` fallback (P0-1, P2-5) |
| history, diff (`kit/history.ts`, `kit/diff.ts`) | Ctrl/⌘+Z and Y through the flow editor | — | — | Logic only | — |
| Shell (`Shell.tsx`) | Links, buttons, menus, drawer | Drawer via SideSheet | Landmarks; `aria-current`; labelled buttons | No skip link, title or route focus (A11Y-15, 04, 14); dim rail 2.14:1 (A11Y-21); rail labels 10 px (A11Y-46); group labels `ink-subtle` on structure 3.96 (A11Y-02) | P0-7, P0-2 |
| CodeEditor (`editor/CodeEditor.tsx`) | Monaco; textarea fallback | — | `ariaLabel` | Tab capture undocumented (A11Y-25) | P1-4 |
| FlowGraph (`FlowGraph.tsx`) | Nodes Tab, Enter, Space | Focus ring removed (A11Y-07) | `role="group"`; node `role="button"` with label and `aria-pressed` | Edges unnamed (A11Y-08); state by colour (A11Y-22); drag-only arrange (A11Y-24); inert tab stops on the flow page (A11Y-49); truncated labels (A11Y-50) | P0-8 |

## 7. Testing gaps and proposed test plan

### What is tested today

Explicit accessibility assertions exist for: `aria-current` on navigation and rows (`Shell.test.tsx:98, 118`, `Access.test.tsx:130`, `e2e/release.spec.ts:160`); `aria-sort` (`Grid.test.tsx:60`); `aria-pressed` (`FlowGraph.test.tsx:57`, `views.test.tsx:46`, `widgets.test.tsx:193`); hint `aria-describedby` (`kit.test.tsx:138`); tab arrow keys and focus (`kit.test.tsx:209-219`); focus on the first invalid field (`Form.test.tsx:102`); Enter on a graph node (`FlowGraph.test.tsx:66`); palette arrows and Enter, `?` ignored in inputs (`CommandPalette.test.tsx:111-185`); Ctrl+K (`Shell.test.tsx:154`); grid edit Escape (`Grid.test.tsx:106, 135`); the drawer's accessible name and Escape (`e2e/redesign.spec.ts:197-199`); chart bars' `aria-roledescription` (`Chart.test.tsx:106`).

### What is not tested

No automated checker of any kind (A11Y-32). No test for: focus trap and return of Dialog, SideSheet or Menu; Inspector focus; route-change focus or title; toast roles or timing; run-state announcements; any keyboard use of the flow canvas; Monaco Tab behaviour; reduced motion; reflow at 320 px or 400 %; target sizes; error and required association of fields; contrast. The unit environment (happy-dom) cannot evaluate layout, focus-visible styling or contrast, so those need a real browser.

### Proposed plan

Accessibility is a system requirement, so each layer below is attached to the roadmap item that creates the thing it tests, and the CI wiring is P2-12. Detail on tooling and cadence is in `10-validation-plan.md`.

| Layer | What | Covers | Attached to |
|---|---|---|---|
| 1. axe in component tests | `vitest-axe` (or equivalent) assertion in every `packages/ui` and console-kit component test, on each documented state (default, invalid, disabled, selected, open) | Names, roles, ARIA validity, heading order inside components | Each component as it is rebuilt to the standard in `08-component-pattern-library.md`; P2-12 for coverage |
| 2. axe in e2e | `@axe-core/playwright` on every route in the screen matrix (`11-screen-matrix.md`), light and dark, at 1440 and 390 px, with the inspector open and closed and one dialog open | Colour contrast in context, landmarks, page-level structure, duplicate ids | P0-2 and P0-7 land with the first routes covered; P2-12 for all routes |
| 3. Keyboard-path e2e | Playwright tests that use only `keyboard.press` and assert `document.activeElement` and `document.title` at each step, for the core journeys: (a) sign in; (b) skip link, switch workspace, open Runs; (c) open a failed run from the list, read the error, re-run; (d) open and close the inspector with focus returned; (e) create a script, Tab into and out of the editor, run it, save; (f) build a three-step flow with one error path using the outline and inspector, test it; (g) deploy and promote; (h) decide an approval; (i) create a connection; (j) edit a table cell and commit | 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.5.7 on the journeys that matter | P0-3 (c, d), P0-7 (a, b), P0-8 (f), P1-4 (e), P2-9 (j) |
| 4. Contrast test over tokens and branding | A unit test that parses `packages/ui/src/tokens.css`, applies the formula in section 1 to the pair list in section 5.20 for both themes, and fails below threshold. The same function runs in the branding editor and in the server's validation, with a test that a failing brand is refused | 1.4.3, 1.4.11 for defaults and for every tenant theme | P0-2 |
| 5. Target-size and reflow checks | Playwright: every interactive element on the kit sheet has a bounding box of at least 24×24 or meets the spacing exception; no horizontal scroll and no clipped content at 320×256 and 640×360 on the core routes; `reducedMotion: "reduce"` run asserts no animation | 2.5.8, 1.4.10, motion | P2-1, P2-12, P4-4 |
| 6. Manual screen-reader script per release | A written script, run with NVDA + Chrome on Windows and VoiceOver + Safari on macOS before each release, about one hour per pair. Steps: identify the page from its title and heading on five routes; navigate by landmarks and headings; sign in; find a failed run and hear its state and error; hear a run finish while on its page; trigger a failed write and hear the error; fill a form with one invalid field and find the error from the field; open and close a dialog, a sheet, a menu and the inspector, checking where focus lands; describe an existing flow from the outline; add and connect a step; use the palette to open an object. Each step has an expected announcement; results are recorded as pass, fail or changed | Everything code and axe cannot settle: announcements, reading order, live regions, library behaviour | Starts when P0-7 ships; grows with P0-8 |
| 7. Lint | Keep Biome's accessibility rules; add rules against `outline-none`, opacity modifiers on text colours, `title` as the only label, and arbitrary type sizes | Regressions of A11Y-21, 30, 35 | P2-12 |

### Definition of "0 critical failures"

A release meets the bar when all of the following hold:

1. **No open Critical finding** in this register or raised since: no core journey in layer 3 is impossible for a keyboard-only user or a screen-reader user.
2. **axe reports zero violations of impact "critical" or "serious"** on every covered route and component state, in both themes. Violations of impact "moderate" or "minor" are tracked with an owner and do not block. Any suppression names the rule, the element and the reason in code.
3. **Every keyboard-path e2e test passes** with no pointer events.
4. **The contrast test passes** for the default tokens in both themes, and the server refuses a brand that fails a text or focus pair.
5. **The manual screen-reader script has no failed step** on either pair. A step that could not be run counts as failed, not skipped.

"Critical failure" in the roadmap's exit criteria means a breach of any of these five. The bar is deliberately about blocked tasks and machine-detectable A/AA failures; it is not a claim of full WCAG 2.2 AA conformance, which also needs the "not evaluated" rows in section 2 to be assessed.

## 8. Runtime-verification checklist

Each item was inferred from code or library defaults and must be confirmed in a browser, with a screen reader or on a device before it is acted on or closed.

| # | What to verify | How | Related finding |
|---|---|---|---|
| 1 | xyflow 12.12.1 defaults in the flow editor: nodes and edges are focusable; Enter or Space selects; arrow keys move a selected node; Backspace deletes; Escape deselects | Keyboard pass in Chromium, Firefox, Safari | A11Y-01, 24 |
| 2 | xyflow `connectOnClick`: clicking a source handle then a target handle creates a connection without dragging | Single-pointer pass | A11Y-01, 24 |
| 3 | What xyflow exposes to a screen reader for nodes, edges and its keyboard-use description; whether SVG edge labels are read | NVDA and VoiceOver | A11Y-08 |
| 4 | Base UI Dialog, SideSheet and Menu: focus is trapped where modal, Escape closes, focus returns to the trigger; the heading level of Dialog and SideSheet titles | Keyboard pass; accessibility tree | A11Y-06, 38; section 5.5 |
| 5 | Base UI `Field.Root invalid` emits `aria-invalid` on the control | Accessibility tree | A11Y-18 |
| 6 | Inputs with `outline-none` still show the global focus ring; whether Combobox shows two rings | Focus each input in both themes | A11Y-35 |
| 7 | Command palette on a real phone: can it be dismissed without an Escape key (Android back, iOS)? | iOS Safari, Android Chrome | A11Y-11 |
| 8 | Monaco: Tab is captured; Ctrl+M (Ctrl+Shift+M on macOS) toggles Tab focus mode; Alt+F1 help opens; Ctrl/⌘+K conflict with the palette; whether Ctrl/⌘+Enter runs the draft from inside the code | Keyboard pass in the script editor | A11Y-25 |
| 9 | Flow editor at 640×360 CSS px (1280×720 at 200 %) and on a phone in landscape: is the inspector reachable? | Browser zoom; Playwright viewport | A11Y-10 |
| 10 | Workbench lists at 400 % zoom (320×256): how much height the list keeps | Browser zoom | A11Y-26 |
| 11 | Text spacing override (line height 1.5, letter 0.12 em, word 0.16 em): clipping in rail labels, tabs, tags, breadcrumb, single-line controls | Text-spacing bookmarklet | A11Y-46 |
| 12 | A row focused with Shift+Tab under a sticky table header; a toast covering a focused control | Keyboard pass on a long list | A11Y-36 |
| 13 | Whether newly inserted `role="status"` toasts are announced; whether errors are heard before they disappear | NVDA, JAWS, VoiceOver | A11Y-05 |
| 14 | Toast dismiss and native radio and checkbox targets: do they meet the 2.5.8 spacing exception? | Measure rendered boxes | A11Y-23 |
| 15 | Session lifetime; what the user sees and what work is lost when a session expires mid-edit in the script, resource and flow editors | Shortened session on a real instance | A11Y-28 |
| 16 | Chart engine and Monaco animation under `prefers-reduced-motion` | Emulated media feature | A11Y-45 |
| 17 | Pagination: where focus goes when "Next" becomes disabled on the last page | Keyboard pass | A11Y-50 |
| 18 | Timeline callers put each step's duration in the row text, not only in the bars | Screen reader on a flow run | A11Y-50 |
| 19 | Sign-in: where focus is after "Continue"; whether a long password runs under the reveal button | Keyboard pass; visual check | A11Y-47 |
| 20 | Palette options activating on mouse down: can a press be cancelled by moving off before release? | Pointer pass | A11Y-39 |
| 21 | Live behaviour with real data: run state changing on an open run page, live log follow, announcements during a flow test | Seeded instance with a screen reader | A11Y-16, 48 |
| 22 | The "not evaluated" criteria in section 2: 1.3.4, 1.4.5, 1.4.12, 2.1.2, 2.4.4, 2.4.11, 2.5.2, 2.5.3, 3.1.2, 3.2.2, 3.2.6, 3.3.4, 3.3.7 | Full manual audit with axe and a screen reader | Section 2 |
