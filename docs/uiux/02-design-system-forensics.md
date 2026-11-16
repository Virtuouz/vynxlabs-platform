# Design-system forensics and debt report

This document answers one question: does the console have a coherent design system today, and if not, what is the debt? It covers the token file (`packages/ui/src/tokens.css`), the shared component kit (`packages/ui/src`, called "ui" below), the console's own kit (`apps/console/src/kit`, called "console kit"), the list scaffolding in `apps/console/src/ListScreen.tsx`, and the hand-written styling in the screens. It measures what exists (tokens, class counts, computed sizes, contrast ratios), lists every pattern that has more than one implementation, and ends with a numbered debt register (DS-1 …) that `09-prioritized-uiux-roadmap.md` draws on. The target system is defined in `07-design-system-specification.md`; nothing described here as a fix has been implemented.

Paths are relative to `apps/console/src` unless they start with `packages/` or `apps/`. Short names such as `Fields.tsx`, `Table.tsx`, `Grid.tsx`, `Button.tsx`, `Menu.tsx`, `Combobox.tsx`, `Dialog.tsx`, `Dialogs.tsx`, `SideSheet.tsx`, `Toast.tsx`, `Notice.tsx`, `Pickers.tsx`, `Surfaces.tsx`, `Tabs.tsx`, `JsonView.tsx`, `LogViewer.tsx`, `ResultView.tsx`, `Markdown.tsx`, `Facts.tsx`, `Timeline.tsx`, `Chart.tsx`, `Form.tsx`, `SchemaForm.tsx`, `Pagination.tsx`, `widgets.tsx` and `tokens.css` are files in `packages/ui/src`; `Renderer.tsx` is in `packages/screens/src`; `status.tsx`, `layout.tsx`, `copy.tsx`, `motifs.tsx`, `references.tsx`, `brand.tsx`, `CollectionView.tsx`, `ListCollection.tsx` and `CommandPalette.tsx` are in `apps/console/src/kit`; all other bare file names are in `apps/console/src/screens` or `apps/console/src`.

## Evidence labels

- **Verified**: read in the code at HEAD `e737382`, cited as `path:line`. Class counts come from a scan of string literals in non-test source and were spot-checked with ripgrep. Pixel heights are *computed* from classes (14 px body, line-height 1.45), not measured in a browser, unless marked Observed.
- **Observed (mocked API)**: seen in the built console in headless Chromium with fixture data. Not a real seeded instance.
- **Inferred**: reasoned from code without being run. Must be confirmed before acting.
- **Judgment**: a design opinion. Coherence ratings, "what to keep" and the ordering of the debt register are judgment; counts, sizes and contrast ratios are not.

Contrast ratios use the WCAG 2.x formula on the hex values in `tokens.css`; opacity modifiers are alpha-composited over the stated background. Three scopes are counted: `console` (`apps/console/src`), `ui` (`packages/ui/src`) and `screens` (`packages/screens/src`, the no-code app renderer).

Where the source notes disagreed, the code was re-read. The corrections are: (1) there are six list implementations, not four or five (the lower figures counted one product area each); (2) the literal "Loading…" occurs 45 times in 28 console files, 37 of them as a bare paragraph (an earlier estimate of "about 50 in 29 files" was rounded); (3) `Grid` selects one row with a radio button (`Grid.tsx:295`), not several with checkboxes; (4) `<StatePill` is used in 22 files and `<Tag` in 18 (earlier counts said 21 and 16; use counts are unchanged at 63 and 47); (5) the global focus rule is in `tokens.css:167`, not a console stylesheet; (6) no control has a pressed style: the only `active:` class in the three scopes is a drag cursor (`Renderer.tsx:876`).

## Main findings

- A real token layer exists for colour, and its discipline is excellent: 22 semantic colours in light and dark, zero Tailwind palette classes and zero raw hex outside one deliberate defaults table. This is the part of a design system that is hardest to retrofit, and it is already done.
- Above the colour tokens there is no single system. Two component kits overlap (`packages/ui` and the console kit), and a third layer of hand-written one-offs sits in the screens. Spacing, type sizes, control heights, lists, page headers, tabs and status marks each have between three and seven competing variants.
- The shared kit does not use its own type roles: 2 role uses against 49 arbitrary sizes in `packages/ui`. The role set has no 13 px sans role and no 16 px role, the two sizes the product uses most, so 187 arbitrary `text-[…px]` classes fill the gap.
- Several tokens fail WCAG AA as shipped. In light theme `ink-subtle` fails 4.5:1 on every background except `surface` and `raised`, `attention` fails on five backgrounds including its own soft fill, placeholders fail in both themes, and no border reaches 3:1, including the borders that identify inputs.
- Lists are the largest single source of inconsistency: six implementations, row heights from about 31 px to 57 px, three selection behaviours, three paging behaviours, and retry on error in only one of them.
- State is drawn four ways. The same fact ("Draft", "Active", "Paused", "Production") appears as a filled `Badge` on one screen and an outlined `Tag` or an icon-and-word `StatePill` on another.
- Component states are incomplete in a systematic way: no pressed style anywhere, no loading state on `Button` (72 call sites disable instead), invalid fields are not marked on the control, toggle buttons have no on-state.
- Feedback has no standard: 37 bare "Loading…" paragraphs, a `Skeleton` component the console never uses, 112 danger notices of which 9 offer a retry, three places for form errors and three idioms for "saved".
- Almost nothing enforces the system. Colour is the only rule that holds, and it holds by habit; the one lint rule that exists (`noAlert`) is fully effective, which suggests more rules would be too.
- Of the earlier audit's nine consistency findings (V1–V9), two are fixed, four are partly fixed and three are open; V7 (arbitrary type sizes) is worse than when it was reported.

## 1. Verdict and scorecard

**Verdict (judgment, from measured evidence).** The console has a coherent *palette* and a coherent *voice*, but not a coherent design system. Colour tokens, semantic naming, the focus ring, the reduced-motion rule, the questions API (`ask.confirm` and friends) and the Base UI primitives form a sound foundation. Everything a user perceives as "the same control" or "the same kind of page" is implemented more than once, with different sizes and different behaviour, and which version a screen gets depends on when the screen was written rather than on what it shows. The cost is not mainly aesthetic: a user who learns that a row opens an inspector on Members finds that the same-looking row does nothing on Workspaces; a filled amber pill means "Draft" on one screen and "Production" on another; an error can be retried on one list and not on the next. The remedy is consolidation and adoption, not a new visual language. Scores elsewhere in this audit rate design-system consistency from code review plus limited mocked observation, with confidence of about ±5 points.

Coherence ratings: **coherent** (one way, followed), **partial** (one intended way plus leaks), **fragmented** (several competing ways), **absent** (no system; each screen decides).

| Area | Explicit tokens / components | Implicit recurring values | Coherence | Headline evidence | Roadmap ID |
|---|---|---|---|---|---|
| Spacing | None (Tailwind default scale) | 16 steps in use; `gap-2` ×250, `gap-3` ×152; panel `p-4` ×49 | Fragmented | Page gutter `md:px-8` vs workbench `md:px-6`; `m-0` ×294 | P2-1 |
| Typography | 8 type roles (`tokens.css:131-153`) | 13 px sans ×141; 16 px headings ×27 | Fragmented | 245 role uses vs 129 arbitrary sizes in console; ui uses roles twice | P2-1, P2-12 |
| Colour | 22 semantic colours, light + dark | 35 opacity-modifier uses, 17 distinct | Coherent in use; values fail AA | 0 palette classes; `ink-subtle` 4.19 on canvas (light) | P0-2 |
| Surfaces | `canvas`, `surface`, `sunken`, `structure`, `raised`, `selected`, `code-bg` | `Panel` ×43 vs 28 hand-written panels | Partial | `Card` unused by console; about 35 card-in-card cases | P4-2, P2-1 |
| Borders | `line`, `line-strong` | Tone borders at /40, /45, /60 | Partial | No border reaches 3:1 (input edge 1.41) | P0-2, P2-1 |
| Radius | `control` 6, `panel` 10 | `rounded-[4px]` ×17 as a de-facto third radius | Partial | 17 hard-coded uses; only `Pickers.tsx:39` derives it from the token | P2-1 |
| Shadows / elevation | None | `shadow-sm/lg/xl/2xl`, 10 uses; z-index ladder as literals in 6 files | Partial (coherent by accident) | Dark shadows nearly invisible; `raised` used 4 times | P2-1 |
| Icons | lucide via `@vynxlabs/ui/icons` | 7 sizes between 12 and 18 px; stroke 1.75 in 5 places, default 2 elsewhere | Fragmented | `packages/ui` uses text glyphs (`✓ × ‹ › ▲ ▼`), no lucide | P4-3 |
| Control sizing | `Button` 36 / 28 | Inputs at 28, 30, 32, 36; small controls at 24, 28, 32 | Fragmented | `Audit.tsx:228-256` and `Runs.tsx:219-250` mix three heights in one toolbar | P2-1 |
| States | Global `:focus-visible` ring; `disabled:` styles | — | Partial | No pressed style; no `Button` loading; invalid control unmarked | P2-8, P2-7 |
| Status colours | `StatePill` + `STATES` map | 9 local maps bypass the kit | Fragmented | "Draft" is an amber `Badge` and a teal dashed `Tag` | P2-5, P4-5 |
| Forms | 8 field components, `Form`, `SchemaForm` | Field stack `gap-3` vs `gap-4`; 28 defensive `required={false}` | Partial | Field frame implemented 3 times; five search-box builds | P2-7 |
| Tables / lists | ui `Table`, ui `Grid`, `CollectionView`, `ListScreen`, `ListCollection` | Row heights ≈31–57 px | Fragmented | Six implementations; `Pagination` has no consumer | P2-2, P1-1 |
| Navigation | Shell rail, section panel, breadcrumb; ui `Tabs` | Four tab builds; six back patterns | Partial (shell coherent, in-page fragmented) | `AccessTabs`, `Data.tsx:592-600`, `Interfaces.tsx:1316-1335` | P2-3, P2-6 |
| Page headers | `PageHeader`, `Page` | Titles at 26, 20, 18, 16 px | Fragmented | Seven header variants plus `ListFrame` | P2-3, P4-1 |
| Drawers | ui `SideSheet`, console `Inspector` | — | Partial | Same component differs in padding, close size, icon, footer, focus handling | P0-3 |
| Dialogs | ui `Dialog`, `DialogsProvider` (`ask.*`) | Footer hand-built per dialog | Coherent behaviour, partial chrome | 0 native `confirm`; no footer slot; no close button | P0-9, P2-1 |
| Menus | ui `Menu` | — | Coherent but thin | No disabled item, shortcut slot or submenu; `✓` glyph | P3-1 |
| Code presentation | `JsonView`, `LogViewer`, `ResultView`, `CodeEditor`, `Mono`, `CopyableId` | `font-mono text-[13px]` ×33; `code()` helper copied 6 times | Fragmented | Code background split between `sunken` and `code-bg` | P1-6, P4-6 |
| Empty states | `EmptyState` (ui), `EmptyCanvas` (console) | Bare paragraphs | Fragmented | Three looks; most `CollectionView` empties have no action | P2-13, P2-4 |
| Errors | `Notice tone="danger"` | — | Partial | 112 danger notices, 9 with a retry; no request ID shown | P2-4, P0-1 |
| Loading | `Skeleton` (ui, unused by console) | Bare `<p>Loading…</p>` ×37 | Absent | No spinner, no `LoadState` wrapper | P2-4 |
| Responsive behaviour | `WIDE` constants (one of three read) | 23 distinct `max-w-*` values | Partial (shell coherent, pages ad hoc) | `Page width="form"` never passed | P3-8, P2-1 |
| Motion | Global reduced-motion rule | 1 transition, 2 pulses | Coherent by absence | No duration tokens; "running" has no motion cue | P4-4 |
| Enforcement | Biome `noAlert`; token-copy tests; e2e overflow test | — | Absent beyond colour and dialogs | No lint for sizes or primitives; screenshots not compared | P2-12 |

## 2. Detail by area

Each subsection gives explicit tokens, implicit values with counts, inconsistencies, and what to keep. Counts are for `console` unless another scope is named.

### 2.1 Spacing

**Explicit tokens (Verified).** None. `tokens.css` defines colour, two radii, two fonts and type roles. Spacing is Tailwind's default 4 px scale, used freely.

**Implicit values (Verified).**

| Family | Distinct values | Total uses | Most used |
|---|---|---|---|
| `gap-*` | 22 | 690 | `gap-2` ×250, `gap-3` ×152, `gap-1` ×70, `gap-4` ×58, `gap-1.5` ×56, `gap-0.5` ×21, `gap-5` ×19, `gap-6` ×19, `gap-2.5` ×14 |
| `p-*` | 8 | 133 | `p-4` ×49, `p-0` ×42, `p-3` ×24, `p-2` ×9, `p-6` ×5, `p-7` ×2 |
| `px-*` | 9 | 127 | `px-4` ×40, `px-3` ×36, `px-2.5` ×13, `px-2` ×12, `px-1` ×8, `px-6` ×7 |
| `py-*` | 11 | 104 | `py-2` ×27, `py-1.5` ×24, `py-3` ×19, `py-1` ×9, `py-2.5` ×8 |
| `pt/pb/pl/pr-*` | 21 | 75 | `pl-5` ×13, `pr-3` ×12, `pt-3` ×10 |
| `m*-*` | 28 | 376 | `m-0` ×294, `mt-1` ×17, `mb-0` ×13 |

In `ui`: gap 10 distinct / 69 uses, px 10 / 52, py 9 / 33. In `screens`: gap 4 / 12. Sixteen steps are in use (0, 1 px, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10): effectively every half-step up to 16 px.

Unwritten conventions that recur:

| Convention | Value | Source |
|---|---|---|
| Page gutter | `px-4 md:px-8`, `py-6`, cap `max-w-[1440px]` | `Shell.tsx:909` |
| Workbench header gutter | `px-4 py-4 md:px-6` | `CollectionView.tsx:60`, copied at `Runs.tsx:202` |
| Page stack | `gap-5` | `ListScreen.tsx:109` |
| Panel padding | `p-4` dominant; also `p-3`, `p-4 md:p-5`, `p-6 sm:p-7` | — |
| Inspector padding | `px-4 py-4` docked, `px-5 py-4` as a sheet | `layout.tsx:132`, `SideSheet.tsx:74` |
| Field stack | label to control `gap-1`; fields `gap-3` or `gap-4` | `ListScreen.tsx:141` vs `Form.tsx:184`, `Dialogs.tsx:110` |

**Inconsistencies.**
- The page gutter is 32 px from `md` and the workbench gutter is 24 px, so the page title moves 8 px sideways between a page and a workbench. **Observed (mocked API):** Runs and Triggers content starts at x = 312, Connections, Settings and Tenant overview at x = 320.
- Page stacks other than `gap-5`: `gap-4` in editors, `gap-6` in `Environments.tsx:64` and `InstanceTriggers.tsx:55`, `gap-9` in `KitSheet.tsx:43`.
- Eight arbitrary nudges (`py-[3px]`, `pt-[7px]`, `mt-[5px]`, `-mt-[3px]`, `-mt-[3.5px]`, `top-[5px]`, `left-[3px]`, `left-[9px]`) align navigation junctions in `Shell.tsx:264-407` and `motifs.tsx:105-112`.
- `m-0` ×294 is a symptom: there is no base reset for paragraph and heading margins, so each one is reset by hand. Of the 37 bare loading paragraphs, 22 forget the reset and carry default 1em margins; 15 use `m-0`.

**Keep.** Layout is flex plus `gap` throughout (`space-x/y-*`: 0 uses). The dominant values (8, 12, 16 px gaps; 16 px panel padding) already match the scale in `07-design-system-specification.md`; the work is to remove half-steps, not to change the rhythm.

### 2.2 Typography

**Explicit roles (Verified, `tokens.css:131-153`).** display 26/1.2/600; title 18/1.3/600; body 14/1.45; label 12/1.2/600 with +0.06em tracking; meta 12.5/1.4; telemetry 13/1.4; micro 10/1.2/500; tag 10.5/1/600 with +0.06em.

**Role use against raw sizes (Verified).**

| Class | console | ui | screens |
|---|---|---|---|
| `text-meta` | 152 | 1 | 0 |
| `text-telemetry` | 30 | 0 | 0 |
| `text-label` | 25 | 0 | 0 |
| `text-title` | 20 | 1 | 0 |
| `text-tag` | 11 | 0 | 0 |
| `text-display` | 5 | 0 | 0 |
| `text-micro` | 1 | 0 | 0 |
| `text-body` | 1 (`KitSheet` only) | 0 | 0 |
| **Roles total** | **245** | **2** | **0** |
| `text-[13px]` | 101 | 33 | 7 |
| `text-[12.5px]` | 11 | 8 | 0 |
| `text-[12px]` | 11 | 7 | 1 |
| `text-[14px]` / `[15px]` / `[11.5px]` | 3 / 3 / 0 | 0 / 0 / 1 | 1 / 0 / 0 |
| **Arbitrary total** | **129** | **49** | **9** |
| `text-base` / `lg` / `xl` / `3xl` | 27 / 4 / 2 / 0 | 6 / 1 / 0 / 0 | 0 / 0 / 0 / 1 |
| `text-xs` / `text-sm` | 0 / 0 | 6 / 2 | 0 / 0 |

Weights are sound: `font-medium` ×76 console / ×20 ui, `font-semibold` ×45 / ×6, `font-normal` ×8 / ×1, `font-bold` ×1 (`brand.tsx:86`); effectively 400 / 500 / 600. `uppercase` ×31, `tracking-tight` ×5, `tracking-wide` ×3.

**Inconsistencies.**
- The shared kit does not use its own roles. Both role uses in `packages/ui` are in `SideSheet.tsx:53-55`. Every field label, hint and error is `text-[13px]` (`Fields.tsx:18,21,25`, `Combobox.tsx:42-49`, `SchemaForm.tsx:329-375`).
- There is no role for 13 px sans, the most-used size in the product (141 uses across scopes). `text-telemetry` is 13 px but meant for mono; `text-meta` is 12.5 px.
- There is no 16 px role. Section headings are `text-base font-semibold` ×27 (for example `Data.tsx:738`, `Branding.tsx:257`, `Alerts.tsx:109`, `SingleSignOn.tsx:314`, `Flows.tsx:446,472`, `Git.tsx:206`), while other sections use `text-title` (`Environments.tsx:415`, `Authoring.tsx:732`) or `SectionLabel`.
- Seven heading sizes are in use for h1–h3: 26 (`text-display`), 20 (`SingleSignOn.tsx:1017`, `Dashboards.tsx:148`), 18 (`text-title` and `text-lg`), 16, 15 (`Provisioning.tsx:109,171,222`), 14, 13 (`FlowTestPanel.tsx:133`).
- Three near-identical small sizes coexist: 12, 12.5 and 13 px. `Roles.tsx:174` rebuilds the label role by hand as `text-[12px] font-semibold tracking-wide uppercase`.
- Mono has two parallel conventions for the same job: `font-mono text-telemetry` ×30 (and `<Mono>` ×63) against `font-mono text-[13px]` ×33; same size, different line-height. A `code()` helper that returns `<code className="font-mono text-[13px]">` is copy-pasted in six files: `Data.tsx:32`, `Execution.tsx:24`, `Flows.tsx:30`, `Domains.tsx:39`, `Environments.tsx:10`, `Tenant.tsx:92`.
- Mono sizes in use: 10.5 (tag), 12 (`ResultView.tsx:121`, `Roles.tsx:186`, `FlowEditor.tsx:1180`), 12.5 (`JsonView.tsx:84`, `LogViewer.tsx:155`, `Facts.tsx:24`, `Git.tsx:308`), 13, 14 (bare `font-mono`, for example `NotFound.tsx:12`, `Execution.tsx:215`, `Account.tsx:54`), 16–18 (editor titles), 30 (`Renderer.tsx:427`).
- Identity typography differs by screen: a table name is `font-medium text-action` sans (`Data.tsx:502`), every other identifier in the Configure area is mono through `code()` (`Execution.tsx:598`). Durations are `Mono` in list columns (`Runs.tsx:447`) but sans in `StatePill`'s detail text (`status.tsx:81`; `Runs.tsx:502`, `FlowTestPanel.tsx:102`, `FlowEditor.tsx:244`).
- `Facts` (ui) sets code values at 12.5 px; `KeyValues` (console) at 13 px. Same job.
- Duration and date formatting is duplicated. Durations: `Execution.tsx:58`, `FlowTestPanel.tsx:9`, `Timeline.tsx:35`, `Overview.tsx:78-80` ("1.2s" with no space where others write "1.2 s"), `RunPage.tsx:514`. Dates: `ListScreen.tsx:361`, `Execution.tsx:414`, `Audit.tsx:83`, `Runs.tsx:72`, `ScheduleForm.tsx:53`, plus five bare `toLocaleString()` calls (`ApproveLink.tsx:129,155`, `Access.tsx:85`, `Execution.tsx:543`, `FlowTestPanel.tsx:139`). **Observed (mocked API):** the Runs "Took" column renders "3.0 s" with a wide gap before the unit.

**Keep.** The idea of named roles that bundle size, line-height, weight and tracking; the three-weight discipline; `body { font-variant-numeric: tabular-nums }` (`tokens.css:163`); mono reserved for paths, IDs, durations and versions. The role set needs two more roles (`body-sm` 13 px and a 16 px role, per the specification) and adoption; it does not need replacing.

### 2.3 Colour

**Explicit tokens (Verified, `tokens.css:9-33`).** 22 colours in light and dark: `canvas`, `surface`, `sunken`, `structure`, `raised`, `selected`, `code-bg`; `line`, `line-strong`; `ink`, `ink-muted`, `ink-subtle`; `action`, `action-ink`, `action-soft`; `attention`, `attention-soft`; `danger`, `danger-soft`; `success`, `success-soft`; `focus`.

**Discipline (Verified).** Tailwind palette classes (`red-500`, `gray-200`, `white`, `black` and so on): 0 in all three scopes. Raw hex or rgb in non-test source: only `Branding.tsx:58-111`, the defaults table for the branding editor, a second copy of `tokens.css` held in step by tests (`apps/console/src/Portal.test.tsx:242`, `apps/control-plane/src/apps.test.ts:1238`). SVG and canvas colours go through `var(--vx-*)` (`FlowGraph.tsx:168-278`, `status.tsx:92-101`, `packages/ui/src/chartTheme.ts:17-25`).

**Implicit values: opacity modifiers (Verified).** 35 uses, 17 distinct: `border-danger/40` ×8, `border-success/40` ×2, `border-attention/40` ×2, `border-action/60` ×2, `border-{action,attention,success,danger}/45` ×1 each, `text-ink-muted/70` ×4, `text-ink-muted/60` ×3, `bg-action-soft/50` ×2, `bg-danger-soft/40` ×2, `bg-sunken/50`, `bg-ink/40`, `bg-ink/30`, `bg-ink-muted/50`, `bg-success/10`, `bg-danger/10`, `ring-action/30` ×2. These are untokenised colours: tone borders at three opacities and two scrims. Plain `opacity-*` is also used to fade text: `opacity-55` on rail links when no workspace is open (`Shell.tsx:397`), `opacity-80` on chip counts (`layout.tsx:320`), `opacity-50` on muted timeline bars (`Timeline.tsx:98`).

**Token use is lopsided (Verified).** `bg-raised` ×4; `bg-code-bg` ×3, console only (the ui code components use `bg-sunken`); `text-ink-subtle` ×134 in console and 0 in ui.

#### Contrast: text pairs, threshold 4.5:1 (Verified, computed)

Bold marks a failure.

| Foreground on background | Light | Dark |
|---|---|---|
| `ink` on canvas / surface / sunken / structure / selected / code-bg / raised | 14.47 / 16.40 / 13.30 / 13.70 / 14.00 / 15.28 / 16.40 | 15.15 / 13.54 / 15.80 / 15.80 / 13.16 / 15.93 / 12.11 |
| `ink-muted` on canvas | 5.07 | 7.42 |
| `ink-muted` on surface | 5.75 | 6.63 |
| `ink-muted` on sunken | 4.66 | 7.73 |
| `ink-muted` on structure | 4.80 | 7.73 |
| `ink-muted` on selected | 4.91 | 6.44 |
| `ink-muted` on code-bg | 5.36 | 7.80 |
| `ink-muted` on raised | 5.75 | 5.93 |
| `ink-muted` on action-soft | 4.78 | 5.50 |
| `ink-subtle` on canvas | **4.19** | 5.23 |
| `ink-subtle` on surface | 4.75 | 4.68 |
| `ink-subtle` on sunken | **3.85** | 5.46 |
| `ink-subtle` on structure | **3.96** | 5.46 |
| `ink-subtle` on selected | **4.05** | 4.55 |
| `ink-subtle` on code-bg | **4.42** | 5.50 |
| `ink-subtle` on raised | 4.75 | **4.18** |
| `ink-subtle` on action-soft | **3.94** | **3.88** |
| `action` on surface / canvas / selected / sunken / structure / action-soft | 7.15 / 6.31 / 6.10 / 5.80 / 5.97 / 5.94 | 7.17 / 8.03 / 6.97 / 8.37 / 8.37 / 5.95 |
| `action-ink` on `action` (primary button) | 7.15 | 7.29 |
| `danger` on surface / canvas / selected / sunken / structure / action-soft / danger-soft | 6.54 / 5.77 / 5.58 / 5.30 / 5.46 / 5.43 / 5.58 | 6.51 / 7.29 / 6.33 / 7.60 / ≥ 7.6 / ≥ 5.4 / 6.16 |
| `surface` on `danger` (`danger-solid` button) | 6.54 | 6.51 |
| `success` on surface | 5.32 | 8.55 |
| `success` on canvas | 4.69 | 9.57 |
| `success` on selected | 4.54 | 8.31 |
| `success` on sunken | **4.31** | 9.98 |
| `success` on structure | **4.44** | 9.98 |
| `success` on action-soft | **4.42** | ≥ 5.4 |
| `success` on success-soft | 4.61 | 7.22 |
| `attention` on surface | 5.02 | 8.10 |
| `attention` on canvas | **4.43** | 9.06 |
| `attention` on selected | **4.28** | 7.87 |
| `attention` on sunken | **4.07** | 9.45 |
| `attention` on structure | **4.19** | 9.45 |
| `attention` on action-soft | **4.17** | ≥ 5.4 |
| `attention` on attention-soft (`Badge`) | **4.47** | 6.90 |
| `canvas` on `attention` (`promote` button, `Button.tsx:10`) | **4.43** | 9.06 |
| `ink` on action-soft / danger-soft / success-soft / attention-soft (`Notice`) | 13.63 / 13.99 / 14.22 / 14.59 | 11.23 / 12.80 / 11.42 / 11.53 |
| `ink-muted` on the four soft backgrounds | 4.78–5.11 | 5.50–6.27 |
| Neutral badge (`ink-muted` on sunken) | 4.66 | 7.73 |
| Placeholder `ink-muted/70` on surface (`Fields.tsx:6`) | **3.04** | **3.97** |
| Placeholder `ink-muted/70` on canvas | **2.84** | **4.25** |
| `ink-muted/60` on surface (`Grid.tsx:252,311`, `widgets.tsx:182`) | **2.52** | **3.29** |
| Placeholder `ink-subtle` on structure / canvas (`Shell.tsx:693`) | **3.96** / **4.19** | 5.46 / 5.23 |
| Dim rail link (`ink-muted` at `opacity-55` on structure, `Shell.tsx:397`) | **2.14** | **3.13** |

#### Contrast: non-text pairs, threshold 3:1 (Verified, computed)

| Pair | Light | Dark |
|---|---|---|
| `line` on surface / canvas / structure / sunken | **1.41 / 1.24 / 1.18 / 1.14** | **1.34 / 1.50 / 1.57 / 1.57** |
| `line-strong` on surface / canvas / structure / sunken | **1.87 / 1.65 / 1.56 / 1.51** | **1.74 / 1.95 / 2.03 / 2.03** |
| `focus` on surface / canvas / structure / sunken / selected / action-soft | 7.15 / 6.31 / 5.97 / 5.80 / 6.10 / 5.94 | 7.17 / 8.03 / 8.37 / 8.37 / 6.97 / 5.95 |
| `focus` on `action` (ring touching a primary button) | 1.00 (saved by the 2 px offset) | 1.00 |
| Selected row (`selected`) vs canvas / surface | **1.03 / 1.17** | **1.15 / 1.03** |
| Menu highlight (`action-soft`) vs surface | **1.20** | **1.21** |
| Segmented control on (`surface`) vs off (`sunken`) | **1.23** | **1.17** |
| `action/60` on action-soft (selected chip border) | **2.66** | 3.14 |
| `action/45` on canvas (`Tag` "dev") | **2.07** | **2.60** |
| `attention/45`, `success/45`, `danger/45` on canvas (`Tag` borders) | **1.87 / 1.87 / 2.17** | **2.77 / 2.90 / 2.41** |
| Tag borders (`colour/45`) on surface | **1.94–2.24** | **2.35–2.83** |
| `danger/40` on surface; on danger-soft (`Notice` border) | **2.03 / 1.94** | **2.12 / 2.15** |
| `ink-muted/50` on surface (`Timeline` wait bar) | **2.11** | **2.70** |
| Status icons and strokes vs surface / canvas / sunken | ≥ 4.07 | ≥ 6.5 |
| "Skipped" node stroke (`line`) vs surface | **1.41** (dashed) | **1.34** |
| Surface layering: surface vs canvas; sunken vs surface; selected vs canvas; structure vs canvas | 1.13 / 1.23 / 1.03 / 1.06 | 1.12 / 1.17 / 1.15 / 1.04 |

**What the failures mean on screen.**
- `ink-subtle` fails in light on every background except `surface` and `raised`, and it colours the most structural small text: collection table headers on canvas at 12.5 px (`CollectionView.tsx:85-86`, `Runs.tsx:317-318`: 4.19), navigation group labels on `structure` at 10.5 px (`Shell.tsx:271`: 3.96), `SectionLabel` (`layout.tsx:62`), the page eyebrow (`layout.tsx:46`), `KeyValues` labels (`layout.tsx:339`), the Canceled, Skipped and Retired states and every pill's detail text (`status.tsx:50-57, 81`), and sign-in help (`SignIn.tsx:246, 253`).
- `attention` fails in light on canvas, selected, sunken, structure and its own soft fill (4.07–4.47). A `StatePill` reading "Waiting", "Paused" or "Needs attention" in a collection row sits on canvas (4.43) or a selected row (4.28). The `promote` button, the action that pushes to production, is 4.43.
- `success` on sunken (4.31) and structure (4.44) is marginal; JSON strings are `text-success` on `bg-sunken` and numbers are `text-attention` on sunken at 4.07 (`JsonView.tsx:5,57`).
- Placeholders fail in both themes. The word "empty" in null grid cells (`Grid.tsx:311`, `widgets.tsx:182`) is 2.52 and conveys a value.
- No border reaches 3:1. Inputs, selects, chips and secondary buttons are identified by `border-line` on `surface` (1.41 light, 1.34 dark; `Fields.tsx:6`, `Button.tsx:5`, `layout.tsx:315`). `line-strong` at 1.87 would not fix it.
- Selection is shown by background alone at 1.03–1.23: a selected row, a highlighted menu item and the active segment are distinguished only by a slight hue shift.
- Two token pairs are identical in one theme: dark `structure` equals dark `sunken` (#0c1118), and light `raised` equals light `surface` (#ffffff).
- Nothing validates contrast: no test, lint or server check mentions contrast or luminance. Instance and tenant branding accept any valid colour (`Portal.test.tsx:310` rejects only non-colours); the branding editor previews both themes (`InstanceBranding.tsx:81-83,217`) but checks nothing, so an operator can ship an unreadable accent, focus ring or production tag.

The token changes that resolve these are decided in `07-design-system-specification.md` (darker `ink-muted`, `ink-subtle`, `attention` and `success` in light, a lighter dark `ink-subtle`, a new `line-control` border at 3:1 or more, placeholders on `ink-subtle`) and scheduled as P0-2. The accessibility findings that depend on them are C1–C4 and C6 in `05-accessibility-audit.md`.

**Keep.** The 22 role names and the model behind them; the zero-leak discipline; the soft-fill pairs; `ink` and `ink-muted` values in dark; the `focus` token (5.80 or better on every surface); the dark theme as a designed counterpart rather than an inversion (**Observed**).

### 2.4 Surfaces

**Explicit (Verified).** Seven surface tokens (see 2.3). Containers: console `Panel` (`layout.tsx:70`, 43 uses), ui `Card` (`Surfaces.tsx:8`, 0 uses in the console).

**Implicit (Verified).** Hand-written `rounded-panel border border-line bg-surface …` panels: 14 exact matches and 28 `rounded-panel border` lines in screens, for example `Authoring.tsx:716,729`, `Execution.tsx:742,1148`, `Flows.tsx:712,749`, `Git.tsx:57,206`, `Branding.tsx:116`, `ResourceEditor.tsx:406`, `Environments.tsx:414`. A further 46 `rounded-control border border-line` boxes.

**Inconsistencies.**
- Three containers for one job (`Panel`, `Card`, hand-written).
- Card-in-card. A lexical scan finds 47 bordered containers inside another bordered container in the same file; about 9 are false positives (an `EmptyState` passed to a `Table`), leaving roughly 35. Nesting across components is not counted, so the true figure is higher. Concrete cases: `SingleSignOn.tsx:372` (bordered box holding a `Notice` at 373, bordered `Facts` at 379 and bordered `JsonView` at 411, inside a tab panel); `Flows.tsx:749` (section panel → `Facts` 757 → `Notice` 790 → `ResultView` 826); `Account.tsx:99` (Panel → `Notice` 112, 119 → bordered code list 120); `Release.tsx:300` (Panel → three notices) and `Release.tsx:688`; `Environments.tsx:414` (panel → three notices at 449, 450, 467); `ApproveLink.tsx:84` (card → `ResultView` 134 → `Notice` 144). `Notice` is always bordered and filled, so any notice inside a panel is a box in a box.
- **Observed (mocked API):** in workspace settings a label "PROMOTION TARGET" sits above a card whose own heading is "Promotion", and four single-purpose cards each wrap one sentence and one button.
- Surface steps are nearly invisible by luminance (1.03–1.23), so borders carry all the grouping; that is why boxes multiply.

**Keep.** `Panel` as the single in-flow container; the canvas/surface/sunken/structure model; the absence of shadows on in-flow panels.

### 2.5 Borders

**Explicit (Verified).** `line`, `line-strong`.

**Implicit (Verified).** `border-line` ×109 console / ×44 ui; `border-line-strong` ×9 / ×1; `border-action` ×7 / ×5; dashed ×7 / ×1; `divide-y divide-line` ×9. Tone borders at three opacities: /40, /45 and /60.

**Inconsistencies.** One token does two jobs: decorative dividers, which are exempt from the 3:1 rule, and the identifying edge of inputs and unfilled buttons, which is not. Both use `line`, so the token cannot be right for both. The specification splits it by adding `line-control`.

**Keep.** One-pixel hairlines; `divide-y` for row separation; dashed borders reserved for drafts and empty placeholders.

### 2.6 Radius

**Explicit (Verified).** `control` 6 px, `panel` 10 px.

| Class | console | ui | screens |
|---|---|---|---|
| `rounded-control` | 74 | 29 | 1 |
| `rounded-panel` | 30 | 5 | 1 |
| `rounded-full` | 5 | 4 | 0 |
| `rounded-[4px]` | 6 | 11 | 0 |
| `rounded-[2px]`, `[3px]`, calc | 4 | 4 | 1 |

**Inconsistencies.** `rounded-[4px]` is a de-facto third radius for inner elements: menu items (`Menu.tsx:49`), combobox rows and chips (`Combobox.tsx:31,169`), the toast dismiss button (`Toast.tsx:91`), grid cells (`Grid.tsx:151,178,252`), `Tag` (`status.tsx:119`), inline code (`Markdown.tsx:135`, `Audit.tsx:199`), the keyboard hint (`Shell.tsx:895`). `Pickers.tsx:39` derives it as `calc(var(--vx-radius-control)-2px)`; the 17 `rounded-[4px]` uses hard-code it, so a brand that changes `radius-control` gets mismatched inner corners.

**Keep.** Two named radii used 140 times against 26 exceptions: adoption is already high. The specification names the 4 px step and adds 8 and 12 in place of 10.

### 2.7 Shadows and elevation

**Explicit (Verified).** None.

**Implicit (Verified).** Ten shadow uses: `shadow-sm` (segmented thumb `Pickers.tsx:41`; flow node `FlowEditor.tsx:231`), `shadow-lg` (menu, combobox, toast; dragged widget `Renderer.tsx:871`), `shadow-xl` (dialog `Dialog.tsx:31`; flow palette `FlowEditor.tsx:971`), `shadow-2xl` (side sheet `SideSheet.tsx:46`). z-index: `z-10` sticky headers, `z-40/50` sheet, `z-[60]/[61]` dialog, `z-[70]` menu and combobox, `z-[80]` toast, written as literals in 6 files. Scrims: `bg-ink/40` for dialogs, `bg-ink/30` for sheets.

**Inconsistencies.** The mapping (resting, popover, modal, sheet) is coherent but unnamed, so nothing stops the next component from choosing differently. Tailwind's default shadows are black-alpha and nearly invisible against the dark surface (#10161f); the `raised` token exists for this and is used 4 times. The sheet has a deeper shadow and a lighter scrim than the dialog for no stated reason.

**Keep.** The z-index ladder and the four-level idea; no shadow on in-flow content.

### 2.8 Icons

**Explicit (Verified).** `lucide-react` ^1.72 re-exported from `@vynxlabs/ui/icons` (`packages/ui/src/icons.ts:8`), imported in 24 console files.

**Implicit (Verified).** `size={15}` ×36, `{14}` ×21, `{13}` ×17, `{16}` ×9, `{12}` ×3, `{18}` ×2, `{17}` ×1. Stroke width set to 1.75 in five places (`status.tsx:79`, `Shell.tsx:411` and three others); everywhere else is lucide's default 2.

**Inconsistencies.**
- Seven sizes between 12 and 18 px with no rule for which goes where: back links 16 (`Dashboards.tsx:140`), menu items 15 (`Shell.tsx:429`), status 14 (`status.tsx:79`), inline warnings 13 (`FlowEditor.tsx:880`).
- `StatePill` icons are lighter (1.75) than every other icon (2).
- `packages/ui` components use no lucide icons. They use text glyphs: `✓` (`Menu.tsx:55`, `Combobox.tsx:69`), `×` (`Combobox.tsx:120,176`, `Toast.tsx:94`), `‹ ›` (`Pickers.tsx:120,132`), `▲ ▼` (`Grid.tsx:231`), and one inline SVG close (`SideSheet.tsx:64`). The console's Inspector uses lucide `X` at 15 px for the same close action (`layout.tsx:130`). Glyphs render at the font's metrics, which is why their hit areas are small (see 2.9).

**Keep.** One icon library; sizing through the `size` prop only (no `h-4 w-4` classes); decorative icons marked `aria-hidden` and icon-only buttons labelled.

### 2.9 Control sizing

All heights are computed from classes (Verified) unless marked Observed.

| Control | Height (px) | Source |
|---|---|---|
| `Button` regular / small | 36 / 28 | `Button.tsx:32` |
| `TextField`, `SelectField`, `NumberField`, `DateField` | 36 | `Fields.tsx:6` |
| `Combobox` / `MultiSelect` | min 36 | `Combobox.tsx:25` |
| `LogViewer` search, level select, toggles | 28 | `LogViewer.tsx:86` |
| `Grid` filter input, cell editor | 28 | `Grid.tsx:178,252` |
| Audit native selects; Roles search; Flows search; flow palette search; app-renderer filters | 32 | `Audit.tsx:231,245`, `Roles.tsx:132`, `Flows.tsx:114`, `FlowEditor.tsx:978`, `Renderer.tsx:688` |
| Shell navigation filter | 30 | `Shell.tsx:686` |
| Shell palette trigger | 32; 28 from `md` | `Shell.tsx:891` |
| `SegmentedControl` regular / small | 32 (+4 frame) / 24 | `Pickers.tsx:40` |
| `FilterChips` | 28 | `layout.tsx:313` |
| Data view toggle (hand-made) | 32 | `Data.tsx:596` |
| `Tabs` (ui) | ≈38 | `Tabs.tsx:34` |
| `AccessTabs` (console) | ≈37 | `Members.tsx:41` |
| Menu item | ≈32 | `Menu.tsx:49` |
| Icon buttons | 24 (`CopyIcon`), 28 (inspector close, panel toggles), 32 (sheet close, phone menu, `DateStepper`) | `copy.tsx:25`, `layout.tsx:127`, `Shell.tsx:680,711,723`, `SideSheet.tsx:62`, `Pickers.tsx:109` |
| Shell top bar / navigation row / rail item | 48 / 32 / ≈47 | `Shell.tsx:705,280,395` |

Text inputs come in four heights (28, 30, 32, 36) and "small" controls in three (24, 28, 32). A toolbar that mixes a labelled `TextField` (36 plus label), `FilterChips` (28) and a native select (32) cannot align on a baseline; `Audit.tsx:228-256` and `Runs.tsx:219-250` do exactly that. **Observed (mocked API):** on Runs, Kind and When are native selects beside pill chips, and the labelled filter row adds to 282 px of chrome above the first row at 1440 px.

Row and header heights:

| List | Row (px) | Header | Source |
|---|---|---|---|
| ui `Table` | ≈37; ≈45 when the row has a small button | ≈36, 13 px muted, not sticky | `Table.tsx:30` |
| `CollectionView` | ≈41 one line; ≈59 with a two-line cell | ≈35, 12.5 px subtle, sticky | `CollectionView.tsx:85-91` |
| Runs | ≈57 (two lines). **Observed:** 57, and 82 when the row has a tag | as `CollectionView` | `Runs.tsx:400-417` |
| ui `Grid` | ≈37; ≈41 with a Delete button | two rows, ≈71 in total (sort row + 28 px filter inputs), not sticky | `Grid.tsx:226-252` |
| `ResultView` table | ≈32 at 13 px | sticky | `ResultView.tsx:147-166` |
| Roles permission matrix | ≈33 | 12 px on `sunken`, sticky | `Roles.tsx:155` |
| Row-rules preview | ≈31 at 13 px | — | `RowRules.tsx:312` |
| Queue / connection groups | ≈33 at 14 px / ≈37–45 | 13 px / 12.5 px; Queue `<th>` has no `scope` | `Execution.tsx:857-865`, `1165-1167` |

Targets below 24×24 px (WCAG 2.5.8; approximate, computed):

| Element | Size | Source |
|---|---|---|
| Toast dismiss `×` | ≈16×20 | `Toast.tsx:88-95` |
| Combobox clear `×`; chip remove `×` | ≈16 wide; ≈8 wide | `Combobox.tsx:119`, `172-177` |
| `JsonView` Copy chip; `ResultView` download chip | ≈23 tall | `JsonView.tsx:63`, `ResultView.tsx:214` |
| Run tag buttons | ≈20 tall | `Runs.tsx:421-432`, `RunPage.tsx:118-126` |
| Grid sort headers; grid row radio; Roles checkboxes | ≈19 tall; 16; 16 | `Grid.tsx:226`, `295`, `Roles.tsx:195` |
| Flow connection handles | 6×6 | `FlowEditor.tsx:236, 248-261` |

`SegmentedControl` small and `CopyIcon` are exactly 24.

**Keep.** `Button`'s two sizes as a starting point for the specification's 28 / 32 / 36 set; 28 px icon buttons.

### 2.10 States

The full matrix is in section 5. Systemic gaps (Verified):
- No pressed style exists on any control in the three scopes.
- `Button` has no loading state. There are 72 `disabled={busy…}` call sites; 5 also change the label (`Environments.tsx:1067,1124`, `Git.tsx:121`, `SignIn.tsx:217`, `ConnectionWizard.tsx:317`). Elsewhere a pressed button only goes 50 % opaque, including the submit of `CreateDialog` (`ListScreen.tsx:200`).
- Toggle buttons have no on-state: `Data.tsx:174` and `FlowEditor.tsx:920` pass `aria-pressed` to `Button`, which does not style it. `GitSync.tsx:211` works around it by switching `variant`.
- Invalid fields are not marked on the control. `Field.Root invalid` is set (`Fields.tsx:17`) but the control class has no `data-[invalid]` style; only red text appears below.
- Disabled is 50 % opacity on buttons and 60 % on fields.
- Focus: the global `:focus-visible` rule is unlayered, so by cascade it should beat the `outline-none` utilities at `Shell.tsx:693`, `Flows.tsx:120`, `FlowEditor.tsx:978`, `CommandPalette.tsx:635` and `Combobox.tsx:27` (possibly drawing a second ring inside the combobox's own `focus-within` ring). **Inferred**; not confirmed in a browser. Flow graph nodes switch the focus outline off inline (F1 in `05-accessibility-audit.md`).

**Keep.** The single global focus ring (2 px, 2 px offset, dedicated token); hover styles that already exist on buttons, tabs, menu items and chips.

### 2.11 Status colours

**Explicit (Verified).** `StatePill` (`status.tsx:67`): a 14 px icon plus a word in the tone colour, driven by one `STATES` map of 16 states (`status.tsx:42-61`): 8 run states (queued, running, waiting_approval, waiting_time, succeeded, failed, canceled, skipped) and 8 general ones (ok, waiting, paused, cancelled, retired, warning, info, locked).

**Four mechanisms render state (Verified).**

| Mechanism | Look | Uses |
|---|---|---|
| `StatePill` (console kit) | icon + coloured word | 63 uses / 22 files |
| `Badge` (ui, `Badge.tsx`) | filled pill, 5 tones | 48 uses / 16 files |
| `Tag` / `EnvTag` (`status.tsx:116,127`) | outlined mono capitals, 7 tones | 47 + 9 uses |
| `Junction` dots (`motifs.tsx:10`) and `STATE_STROKE` (`status.tsx:92`) | shapes and strokes in the flow graph | — |

**Local maps that bypass the kit (Verified).** A `STATE` record for draft / deployed / repository is copied four times: `Authoring.tsx:420`, `Authoring.tsx:805`, `ResourceEditor.tsx:271`, `FlowEditor.tsx:808`. Others: `Git.tsx:151` (sync state → Badge), `Audit.tsx:58` (verb → Badge tone), `FlowEditor.tsx:182` (node type → Badge tone), `Drift.tsx:96` (→ StatePill), `Release.tsx:251` (`CHANGE_TAG`), `Tenant.tsx:95` (`TypeBadge`). Two trigger-label maps use different words: "Started by hand" (`Execution.tsx:64`) and "By hand" (`Flows.tsx:42`).

**The same meaning drawn two or three ways (Verified).**

| Meaning | Rendering A | Rendering B |
|---|---|---|
| Draft | `Badge` attention, amber fill (`Authoring.tsx:422`) | `Tag` "draft", teal dashed outline (`FlowEditor.tsx:875`, `Flows.tsx:214`) |
| Deployed / live | `Badge` success (`Authoring.tsx:423`) | `Tag` "live" (`FlowEditor.tsx:873`) |
| From the repository | `Badge` action (`Authoring.tsx:424`) | `Tag` "repository", grey (`Apps.tsx:193`, `Roles.tsx:457`); neutral `Badge` (`Alerts.tsx:187`); plain text "Managed in" (`Data.tsx:515`) |
| Active | `Badge` action, teal (`Account.tsx:46`, `Execution.tsx:1054`) | `StatePill` ok, green (`Members.tsx:196`, `EndUsers.tsx:43`, `Instance.tsx:81`, `Provisioning.tsx:303`) |
| Enabled / on | `Badge` success (`SingleSignOn.tsx:117`, `Domains.tsx:52`) | `StatePill` running "Listening" (`Operate.tsx:164`) |
| Disabled / off | neutral `Badge` (`Domains.tsx:52`, `SingleSignOn.tsx:119`) | `Tag` danger (`Instance.tsx:79`); `StatePill` failed "Disabled" (`EndUsers.tsx:41`); `StatePill` cancelled "Off" (`Operate.tsx:158`) |
| Paused | `Badge` attention (`SingleSignOn.tsx:115`) | `StatePill` paused (`Operate.tsx:156`); `Tag` production "Paused" (`Shell.tsx:773`, `Overview.tsx:344`) |
| Not bound | `Badge` attention (`Execution.tsx:614`) | `Tag` production (`Runs.tsx:681`, `RunPage.tsx:330`) |
| Running | `StatePill` running | `Badge` success "Running" (`Execution.tsx:443`) |
| Production | `EnvTag`, amber outline | `Badge` attention (`Tenant.tsx:96`) |
| Reached (connection test) | `StatePill` "Reached" (`Execution.tsx:549-558`) | coloured text "Reached: Yes, 12 ms" (`Data.tsx:1046-1054`) |

**Other inconsistencies.**
- `Tag tone="production"`, the amber environment tone, is reused for "Paused", "Not bound", "Edits not published" and "Instance · operator" (`Shell.tsx:773,858`): the production signal doubles as a generic warning. `StatePill state="failed"` is reused for "No" (`Access.tsx:192`) and "Disabled".
- Inside the map: both `canceled` and `cancelled` keys exist; `waiting` and `waiting_time` both read "Waiting" with different icons (`status.tsx:47,54`); `canceled` and `skipped` share icon and colour and differ only by word (`status.tsx:50-51`); `paused` and `waiting` share icon and colour (`status.tsx:54-55`). `STATE_STROKE` colours canceled `ink-muted` and skipped `line` while the pill uses `ink-subtle` for both.
- There is no fallback. **Observed (mocked API):** a run whose state is not in `STATES` (the fixture sent `timed_out`) throws in `StatePill` (`status.tsx:79`) and, with no error boundary, blanks the whole console. `stateOf()` exists (`status.tsx:90`) but the runs list does not use it.
- `running` has no motion cue: a still teal icon. **Observed (mocked API):** "Waiting for approval" overflows the Runs status column and is overdrawn by the next column at 1440 and 2200 px.
- One flow node type has four vocabularies: the node card shows the raw type (`foreach`, `subflow`, `respond`; `FlowEditor.tsx:239`), the read-only graph says "For each", "Sub-flow", "Answer" (`FlowGraph.tsx:21-33`), the palette says "Run a flow" and "Answer the request" (`FlowEditor.tsx:119, 133`), and palette "Wait" becomes badge `delay` (`FlowEditor.tsx:161-164`).

**Keep.** `StatePill` itself: icon, word and colour together, never colour alone, one map keyed by the API's enum, with "Waiting for approval" distinct from "Queued". `Tag` for classification and `EnvTag` for the environment are the right shapes; the fix (P2-5) is to assign each mechanism one job.

### 2.12 Forms

**Explicit (Verified).** `TextField` ×86 console uses, `SelectField` ×68, `CheckboxField` ×21, `ComboboxField` ×21, `TextAreaField` ×16, `NumberField` ×5, `MultiSelectField` ×5, `DateField` (only inside `Form` / `SchemaForm`); `Form` (flat, schema-driven, 0 console uses) and `SchemaForm` (nested; 3 console uses through `InputDialog.tsx`, plus the app renderer). Inside the kit the frame is consistent: label above (13 px medium), control, then an error (`role="alert"`, 13 px danger) that replaces the hint (`Fields.tsx:15-29`).

**Inconsistencies (Verified).**
- The field frame is implemented three times (`Fields.tsx:15-29`, `Combobox.tsx:33-52`, `SchemaForm.tsx:327-378`) rather than shared.
- Hand-written labels skip the frame: `Audit.tsx:254` (`text-meta text-ink-muted`), `Renderer.tsx:629,641`, `Roles.tsx:124`, `Shell.tsx:686`, `Flows.tsx:114`, `FlowEditor.tsx:973`. Filter labels are muted grey in some toolbars and ink in others (`Runs.tsx:222`).
- No visual required marker. Optional fields say "(optional)" in 14 labels. `CreateDialog` defaults `required` to true (`ListScreen.tsx:189`) while `TextField` defaults to false, so 28 call sites pass `required={false}` defensively.
- Validation runs on submit only (`Form.tsx:168,184`, `SchemaForm.tsx:782,862`); there are 0 `onBlur` handlers. Field errors are not tied to their control by `aria-describedby` (FM1 in `05-accessibility-audit.md`).
- Form-level errors appear in three places: a `Notice` above the buttons (`ListScreen.tsx:197`), a `Notice` above the form (`InputDialog.tsx:77`), or a toast (`notify.error`, 54 sites).
- Five search-box builds: a labelled `TextField` (`ListCollection.tsx:92`, `Runs.tsx:220`, `Members.tsx:164`), an icon-in-box at 32 px (`Flows.tsx:114`), an icon-in-box at 30 px (`Shell.tsx:686`), a bare `<input type="search">` at 32 px (`Roles.tsx:126`, `Audit.tsx:256`), and the palette input (`CommandPalette.tsx:605`). The Scripts list has no search at all.
- Four bare `<input type="file">` (`Data.tsx:447`, `Environments.tsx:1103`, `Branding.tsx:384`, `InstanceBranding.tsx:136`); checkboxes outside the kit (`Roles.tsx:135-197`); bare `<select>` outside the kit (`Audit.tsx:228,242`, `LogViewer.tsx:101`, `Renderer.tsx:643`).
- JSON textareas remain: `ResourceEditor.tsx:277-290`, `Authoring.tsx:531` (input schema) and `542` (extension schema). `Interfaces.tsx:1082` stores a JSON string as a select value.
- Field widths are ad hoc (`w-72`, `w-80`, `w-56`, `w-40`, `w-64`, `max-w-sm`, `max-w-md`, `max-w-xs`).
- Save models differ by screen: explicit save (Retention, Repository, SSO settings, theme), immediate save (sign-up checkbox, logo upload, provider on/off, domain enable), and a disabled-until-dirty Save in four places only (`Retention.tsx:105`, `Provisioning.tsx:58,215`, `SingleSignOn.tsx:591`, `Tenant.tsx:936`). There is no unsaved-changes guard anywhere.
- The same form has different defaults in two places: a schedule made in the resource editor starts at `0 8 * * *` with no zone, which becomes UTC (`ResourceEditor.tsx:72`, `ScheduleForm.tsx:113`); the schedule sheet starts at `0 9 * * *` in the browser's zone (`ScheduleForm.tsx:268-271`).

**Keep.** Label-above layout; native select and date inputs as a deliberate accessibility choice (`Fields.tsx:65,221`); `SchemaForm` and `InputDialog` replacing JSON textareas for run input, with server errors mapped to fields (`ListScreen.tsx:130`); focus moved to the first invalid field on submit.

### 2.13 Tables and lists

Six implementations (Verified):

| Implementation | Used by | Row (px) | Header | Selection | Keyboard | Loading | Error | Empty | Paging |
|---|---|---|---|---|---|---|---|---|---|
| `ListScreen` → ui `Table` (`ListScreen.tsx:210`) | 13 uses: `Account`, `Data` ×2, `Environments`, `Execution` ×4, `Tenant` ×5 | ≈37–45 | 13 px muted, inside a bordered panel | none | Tab to buttons only | paragraph | `Notice` + "Try again" | `EmptyState` with create action | none |
| ui `Table` direct | 14 uses: `AgentAccess`, `Authoring`, `Dashboards`, `Data` ×2, `Domains`, `Flows`, `Interfaces`, `Provisioning` ×3, `SingleSignOn` ×2 | ≈37–45 | same | none | none | each screen's own | each screen's own | prop | none |
| `CollectionView` (`CollectionView.tsx:24`) | 16 uses: `Apps`, `Audit`, `EndUsers`, `Execution`, `Flows`, `Groups` ×2, `Members` ×2, `Operate` ×4, `Roles`, `Tenant` | ≈41–59 | 12.5 px subtle, sticky, edge to edge on canvas | `aria-selected` + `bg-selected` | Enter / Space on a focusable row | paragraph | `Notice`, no retry | `EmptyCanvas`; action only if the caller passes one | none; column `priority` hides columns |
| `ListCollection` (wraps the above) | 3 uses: `Instance` ×2, `Tenants` | same | same | yes, opens the Inspector | same | same | same | same, plus "Nothing matches" | none; client-side search, `?limit=200` |
| ui `Grid` | 1 use: `Data.tsx` (and the app table widget) | ≈37–41 | sort buttons + filter row | one row by radio; `bg-action-soft/50` | Enter / Escape in a cell | busy flag | per cell | row of text | none inside ("load more" in `Data`) |
| Hand-written `<table>` | `Runs.tsx:316`, `Execution.tsx:857,1165`, `Roles.tsx:154`, `RowRules.tsx:312`; `ResultView.tsx:147` in ui | ≈31–57 | five different header styles | Runs only | Runs: none on the row (a link inside) | paragraph | `Notice` | paragraph | Runs: "Load more" (`Runs.tsx:339`) |

**Inconsistencies.**
- Two visual languages: a bordered white panel (`Table`) and an edge-to-edge list on canvas (`CollectionView`). `Tenant.tsx` uses both (5 `ListScreen`, 1 `CollectionView`), as do `Execution.tsx` and `Flows.tsx`.
- Selected-row colour differs: `bg-selected` (`CollectionView`, Runs) and `bg-action-soft/50` (`Grid`).
- `Runs.tsx:201-318` re-implements `CollectionView`'s header, toolbar and table by hand because it needs paging and a two-line row. As a result the most-used list is the only selectable one whose row cannot be opened from the keyboard (K2 in `05-accessibility-audit.md`).
- Paging is done three ways: "Load more" in Runs, "Show older entries" in Audit (`Audit.tsx:279-283`), Previous / Next bolted into the End users toolbar (`EndUsers.tsx:159-180`); `Pagination` (ui) has no consumer.
- Only `Grid` sorts; no list has multi-select; `j` / `k` movement is advertised in the shortcut sheet (`CommandPalette.tsx:744`) and exists nowhere.
- The row-action column is unlabelled in `ListScreen` (`ListScreen.tsx:219`) and labelled "Actions" in `ListCollection` (`ListCollection.tsx:66`).
- Every `CollectionView` row is its own tab stop (`CollectionView.tsx:110`), so a 200-member list is 200 stops; `aria-selected` sits on a `<tr>` outside a grid role (`CollectionView.tsx:109`).
- Selection is component state in every list except Triggers (`Operate.tsx:81`), so an open inspector has no URL.

**Keep.** `CollectionView` with `Inspector` and `MasterDetail` is the right primitive for an operations console (sticky header, its own scroll region, column priority, sheet fallback under 1280 px) and is the base the specification's DataTable grows from. `Grid`'s sort, per-column filter and in-place edit; `ResultView`'s honest "more in the JSON" cap.

### 2.14 Navigation

**Explicit (Verified).** The shell: a 64 px rail, a 224 px section panel, a 48 px header with a breadcrumb (`Shell.tsx:730-860`), `aria-current="page"` on links. ui `Tabs` (6 console uses: `Apps`, `Authoring`, `RunPage`, `Runs`, `Flows`, `SingleSignOn`).

**Inconsistencies (Verified).**
- Four tab implementations: ui `Tabs` (14 px, selected = action colour with an underline); `AccessTabs` link-tabs (`Members.tsx:31-48`, 13 px, selected = ink); hand-made toggle pills (`Data.tsx:592-600`, `bg-action-soft` with `aria-pressed`); a hand-made segmented radio group (`Interfaces.tsx:1316-1335`). The App Builder's page tabs are `Button`s with `aria-pressed` (`Interfaces.tsx:1809-1819`) while the runtime shows the same pages with ui `Tabs` (`Renderer.tsx:990-1003`).
- `Stepper` (`layout.tsx:167`) is a wizard indicator, and in `SingleSignOn.tsx:1098` it is a second tab row above real `Tabs` (1114).
- `FilterChips` (console kit, 11 uses) and `SegmentedControl` (ui, 0 console uses) are both single-choice groups with different looks. `FilterChips` declares `role="radiogroup"` but every chip is a tab stop and arrow keys do nothing (`layout.tsx:301,309`).
- Tab, filter and selection state is in the URL on some screens (selected trigger, `Operate.tsx:81`) and in component state on others (Flows filter and search, `Flows.tsx:76-78`; Rows / Definition in `Data.tsx`), so Back restores one and resets the other.
- Back navigation has six patterns; see section 3.

**Keep.** The rail, section panel and header frame with counts that appear only when non-zero; the drawer on phones; labelled landmarks; ui `Tabs` (Base UI: arrows, Home and End).

### 2.15 Page headers

Seven variants, plus one for sections (Verified):

| Variant | Where | Title style |
|---|---|---|
| `PageHeader` (`layout.tsx:31`) | 9 direct uses (`Access`, `GitSync`, `InstanceBranding`, `InstanceTriggers`, `KitSheet`, `Overview`, `Release`, `TenantOverview` among them) | `text-display`, 26 px |
| `Page` (`ListScreen.tsx:95`, wraps `PageHeader`) | 23 uses in 16 files | 26 px |
| `CollectionView` header (`CollectionView.tsx:60-71`) | 16 uses | 26 px, bottom border, its own gutter |
| Hand-copied workbench header | `Runs.tsx:202-205` | 26 px |
| Editor header | `Authoring.tsx:616`, `ResourceEditor.tsx:330` (`font-mono text-lg font-semibold`); `FlowEditor.tsx:858` (`font-mono text-base font-semibold`) | 18 px vs 16 px mono |
| Run page header | `RunPage.tsx:93-105` | `font-mono text-lg`, weight not set |
| Detail header | `SingleSignOn.tsx:1017`, `Dashboards.tsx:148` | `text-xl font-semibold tracking-tight`, 20 px |
| `ListFrame` (sections) | `ListScreen.tsx:286-306` | `text-title` |

**Inconsistencies.** The same level of page has a title at 26, 20, 18 or 16 px depending on the file. Editors differ from each other: state is a `Badge` in the script editor (`Authoring.tsx:629`) and a `Tag` in the flow editor (`FlowEditor.tsx:870-876`); "Review and deploy" is a text link in one (`Authoring.tsx:667-669`) and a primary button in the other (`FlowEditor.tsx:932`); the script editor has Discard beside Save and the flow editor has none. The `CollectionView` header always shows its description (`CollectionView.tsx:63-64`), about 90–110 px of chrome before any filter. Description measures differ: `PageHeader` 70ch, `CollectionView` 75ch.

**Keep.** `PageHeader`'s slots (eyebrow, title, description, actions); the `header` slot added to `FlowRunView` (used at `RunPage.tsx:48`), which is the right mechanism for the rest.

### 2.16 Drawers

**Explicit (Verified).** ui `SideSheet` (11 console uses) and console `Inspector` (`layout.tsx:86`, 13 uses): 22rem beside the list from 1280 px, 26rem from `2xl`, otherwise a `SideSheet`.

**Inconsistencies (Verified).**

| Property | `Inspector` (docked) | `SideSheet` |
|---|---|---|
| Padding | `px-4 py-4` (`layout.tsx:132`) | `px-5 py-4` (`SideSheet.tsx:74`) |
| Close button | 28 px, lucide `X` at 15 (`layout.tsx:127-130`) | 32 px, inline SVG at 16 (`SideSheet.tsx:62-64`) |
| Footer alignment | start | end |
| Focus | not moved in, not returned; Esc does nothing (`layout.tsx:113`) | trapped and returned; Esc closes |
| Title | `h2` | `text-title` with an accent rule above (`SideSheet.tsx:52-55`) |

One component therefore behaves in two ways either side of a 1280 px breakpoint (`layout.tsx:24,103`).

**Keep.** The docked-inspector-or-sheet idea and the widths; `SideSheet`'s Base UI focus handling.

### 2.17 Dialogs

**Explicit (Verified).** ui `Dialog` (sizes regular 30rem, wide 46rem, palette; 15 console uses) and `DialogsProvider`, reached as `ask.confirm` ×30, `ask.prompt` ×12, `ask.typeToConfirm` ×3. Native `confirm` / `alert` / `prompt`: 0, enforced by Biome `noAlert: error` (`biome.json:19`). Native `<dialog>`: 0.

**Inconsistencies (Verified).**
- `Dialog`'s title is `text-base font-semibold` (16 px); `SideSheet`'s is `text-title` (18 px).
- No footer slot: every dialog hand-builds `flex justify-end gap-2` (`ListScreen.tsx:198`, `Dialogs.tsx:149`).
- No close button (`Dialog.tsx:30-46`); Escape or the backdrop only. `SideSheet` has one.
- A second question silently cancels the first (`Dialogs.tsx:68-72`).
- `typeToConfirm` applies the danger style only when asked: the SSO provider removal omits `danger: true`, so its confirm button is primary (`SingleSignOn.tsx:1027-1032` vs `Dialogs.tsx:153`).
- `CreateDialog` clears values only on success (`ListScreen.tsx:153`), so Cancel keeps them, including a password (`ListScreen.tsx:127`, `Members.tsx:300`).
- Confirmation is uneven for the same action: removing a flow step with the button asks (`FlowEditor.tsx:1331-1337`), removing it with Backspace does not (`FlowEditor.tsx:1051`).
- Configuration that needs room is squeezed into wide dialogs (role editing `Roles.tsx:274`, group membership `Groups.tsx:20`).

**Keep.** The questions API with named actions ("Delete", not "OK"; `Dialogs.tsx:18`) and type-to-confirm; Base UI focus trapping; the lint rule.

### 2.18 Menus, tooltips and disclosure

**Explicit (Verified).** ui `Menu` (9 uses). There is no Tooltip, Popover, Disclosure or Accordion component.

**Inconsistencies (Verified).** `Menu` has no disabled item, no shortcut slot and no submenu; its check mark is a `✓` glyph; the current item is not exposed to assistive technology (N4 in `05-accessibility-audit.md`); the highlight is 1.20:1 against the surface. About 17 native `title=` attributes carry information a keyboard or touch user cannot reach, for example the truncated error summary at `Runs.tsx:408` and the "used by" list at `references.tsx:24`; one hover tooltip is hand-made (`Overview.tsx:149`). One `<details>` exists (`SingleSignOn.tsx:406`).

**Keep.** `Menu` on Base UI (arrows, typeahead, focus returned to the trigger).

### 2.19 Code, JSON and log presentation

**Explicit (Verified).** ui `JsonView` (9 uses), `LogViewer` (3), `ResultView` (5), `Markdown` (inside `ResultView` only), `Timeline`; console `CodeEditor` (Monaco), `Mono`, `CopyableId`, `CopyIcon`.

**Inconsistencies (Verified).**
- Code background is split between two tokens: `bg-sunken` (`JsonView.tsx:57`, `LogViewer.tsx:155`, `Markdown.tsx:47`, the editor frame, two `<pre>`s) and `bg-code-bg` (three console one-offs). The `code-bg` token was added in phase 8 and the kit never adopted it.
- Three `<pre>` styles: `AgentAccess.tsx:87` (`bg-sunken`, 12.5 px), `Drift.tsx:168` (`bg-sunken`, diff), `GitSync.tsx:243` (`bg-code-bg`, 13 px).
- 38 `<code>` elements in seven styles: the copied `code()` helper; bare `font-mono` at 14 px (7 sites); `font-mono text-[13px] break-all` (10); `text-[12px] text-ink-muted` (3); a chip (`Audit.tsx:199`); a block (`Operate.tsx:383`); a code list (`Account.tsx:122`).
- JSON syntax colours reuse semantic tokens: keys `action`, strings `success`, numbers `attention` (`JsonView.tsx:4-7`). Two of the three fail contrast on `sunken` in light, and success and attention colours inside a payload read as status. This works against the north star ("vivid state"): state colours should mean state.
- `LogViewer` controls use literal `text-[13px]` and `h-7` rather than kit fields (`LogViewer.tsx:86`). Its functional gaps (no match highlight, line numbers, copy, virtualisation) are covered in `03-screen-by-screen-audit.md` and scheduled as P1-6.
- Copy affordances have four forms; see section 3.

**Keep.** `JsonView`, `LogViewer`, `ResultView` and `Timeline` as real developer-tool components; log level colours (error `danger`, warn `attention`, debug `ink-muted`; `LogViewer.tsx:26-28`); the plain `<textarea>` fallback while Monaco loads (`CodeEditor.tsx:112-121`).

### 2.20 Empty states

**Explicit (Verified).** ui `EmptyState` (dashed, left-aligned, `font-medium` title; 17 uses) and console `EmptyCanvas` (centred, junction diagram, `text-title`; 7 direct uses plus every `CollectionView`).

**Inconsistencies (Verified).** Three looks for "nothing here": the two components and bare paragraphs (`Runs.tsx:311-313`, `Execution.tsx:1142`, `Alerts.tsx:200`). `ListScreen` and `ListCollection` empties carry the primary action; hand-wired `CollectionView` empties mostly do not (Members, Groups, Roles, Access, End users, Service accounts: the button is only in the header). Roles says only "No roles". Neither title is a heading element.

**Keep.** The copy: empty states explain the concept and name the next action (**Observed (mocked API):** Connections shows an explanation and "New connection"). The Scripts empty state offers both the console and the CLI path (`Execution.tsx:207-225`).

### 2.21 Errors

**Explicit (Verified).** `Notice` (4 tones, optional action; `role="alert"` for danger). 184 `<Notice` uses in 50 console files, 112 of them `tone="danger"`.

**Inconsistencies (Verified).**
- Retry ("Try again") on 9 of the 112: `ListScreen.tsx:239` (covering its 13 uses), `Data.tsx:184,1173`, `SingleSignOn.tsx:1208`, `InstanceBranding.tsx:23`, `Domains.tsx:388`, `Dashboards.tsx:66`, `Interfaces.tsx:1948`, `Branding.tsx:409`. `CollectionView` and the 19 lists built on it have none (`CollectionView.tsx:73-76`).
- Detail screens return the notice alone, replacing the whole page and its header (`Flows.tsx:368`, `Flows.tsx:631`), so the only way back is the shell.
- No request ID is shown with an error; `requestId` appears only in the audit inspector (`Audit.tsx:315`).
- `Notice` has no informational tone, so neutral hints use `plain` or become a paragraph.
- Errors from row and inspector actions go to a toast that disappears after 5 s (`Toast.tsx:35`), carries `role="status"` (`Toast.tsx:84`) and has no action slot; errors from forms go to an inline notice. `notify.error` ×54, `notify.success` ×19.
- There is no error boundary, so a render error is not shown at all (**Observed**, see 2.11).

**Keep.** `Notice` with `role="alert"` for danger and an optional action; server field errors mapped to fields.

### 2.22 Loading

**Explicit (Verified).** `Skeleton` (`Surfaces.tsx:117-136`, `role="status"`): 0 uses in the console. `Chart` has its own pulse placeholder (`Chart.tsx:90`).

**Implicit (Verified).** The literal "Loading…" occurs 45 times in 28 console files. 37 are a bare `<p>` (15 with `m-0`, 22 without), 1 is a `Panel` (`Overview.tsx:459`), and the rest are placeholders and ternaries (`ListScreen.tsx:60-61`, `Data.tsx:245`, `Groups.tsx:86,99`, `Flows.tsx:847`, `Alerts.tsx:200`). The code-split fallback is the same paragraph (`App.tsx:142`).

**Inconsistencies.** There is no spinner and no `LoadState` wrapper: every screen writes the `error ? … : !data ? … : empty ? …` ladder by hand. Three routes render nothing at all while loading (`App.tsx:104`, `Tenant.tsx:164,413`). Loading is not announced (N2 in `05-accessibility-audit.md`). `useLoad` keeps the previous data while a new path loads, so a page change shows the old rows with no signal unless the screen reads `loading`, and most do not (**Inferred** for the visual effect).

**Keep.** `Skeleton` as built (labelled, reduced-motion aware); cached reads shown at once on return.

### 2.23 Responsive behaviour

**Explicit (Verified).** `WIDE = { inspector: 1280, panel: 1024, rail: 768 }` (`layout.tsx:25`); only `WIDE.inspector` is read (`layout.tsx:103`, `Audit.tsx:122`), and the other two are expressed again as `lg:flex` and `md:flex` in `Shell.tsx:656,672`. Tailwind breakpoints in console: `md:` ×64, `sm:` ×27, `lg:` ×17, `xl:` ×13, `2xl:` ×2. No container queries.

**Inconsistencies (Verified).**
- Width caps: non-workbench pages cap at `max-w-[1440px]` (`Shell.tsx:909`); workbenches and editors have no cap; `Page width="form"` (`max-w-[52rem]`, `ListScreen.tsx:109`) is never passed. Screens then cap themselves with different numbers: `60rem` (`InstanceTriggers.tsx:55`, `Environments.tsx:64,916`), `80ch` (`SingleSignOn.tsx:312,550,673`), `3xl` (`RowRules.tsx:104,291`), `2xl` (`Alerts.tsx:108`, `ResourceEditor.tsx:406`), `xl` (`Retention.tsx:63`, `Git.tsx:57`, `Provisioning.tsx:170`), `md` (`Environments.tsx:571,1002,1086`), `34rem` (`ApproveLink.tsx:78`), `25rem` (`SignIn.tsx:81`). 23 distinct `max-w-*` values in all.
- Five line-length limits for the same kind of description paragraph: `70ch` ×10, `75ch` ×8, `80ch` ×3, `3xl` ×4, `60ch`, `52ch`.
- `CollectionView` hides columns by priority; ui `Table` only scrolls sideways.
- **Observed (mocked API):** at 2200 px the Runs "What" column is about 1240 px wide and mostly empty; workspace settings is capped near 960 px while the overview uses the full width; at 390 px the Runs list spends 480 px on title, description and stacked filters before the first row and wraps paths mid-word.

**Keep.** The shell's rail → panel → drawer behaviour, tested at 390 / 768 / 1440 in both themes for sideways overflow (`e2e/redesign.spec.ts:25-27,161-185`); column priority; dialogs and sheets sized with `min(…, 100vw-2rem)`.

### 2.24 Motion

**Explicit (Verified).** A global reduced-motion rule (`tokens.css:172-177`) and `motion-reduce:animate-none` on `Skeleton`. No duration or easing tokens.

**Implicit (Verified).** One transition in three scopes (`Interfaces.tsx:1371`, `transition-[max-width]`); `animate-pulse` ×2 (`Surfaces.tsx:136`, `Chart.tsx:90`); React Flow `fitView({ duration: 200 })` (`FlowEditor.tsx:590,758`).

**Inconsistencies.** Dialogs, sheets, menus, toasts and the Inspector appear and disappear with no transition, and hover and selection changes are instant. This is consistent; it reads as abrupt rather than broken (judgment). The one state that is live, `running`, has no motion cue. JS-driven motion (`fitView`) ignores the reduced-motion preference.

**Keep.** The restraint and the global kill switch. The specification adds three durations and one looping indicator, no more.

### 2.25 Enforcement

See section 8.

## 3. Duplicate visual patterns

Every pattern with more than one implementation, and the one the specification (`07-design-system-specification.md`) standardises on.

| Pattern | Variants | Where used | Specification standardises on |
|---|---|---|---|
| Lists | (1) `ListScreen` → ui `Table`; (2) ui `Table` direct; (3) `CollectionView`; (4) `ListCollection`; (5) ui `Grid`; (6) hand-written `<table>` | 13 / 14 / 16 / 3 / 1 uses; hand-written in `Runs.tsx:316`, `Execution.tsx:857,1165`, `Roles.tsx:154`, `RowRules.tsx:312`, `ResultView.tsx:147` | One DataTable list primitive grown from `CollectionView` (density 28 / 36 / 44, selection, keyboard, sort, paging, column priority, states); `Grid` remains only for editable table rows, with real grid semantics (P2-2, P2-9) |
| Page headers | `PageHeader`; `Page`; `CollectionView` header; Runs copy; editor header (two sizes); run page header; detail header; `ListFrame` | See 2.15 | One PageHeader with a 20 px `display` title (26 px only on overviews and sign-in) and a visible breadcrumb (P2-3, P4-1) |
| Back links | (1) shell breadcrumb (`Shell.tsx:730-860`); (2) text link above the title (`Authoring.tsx:610`, `ResourceEditor.tsx:324`); (3) arrow + link or button (`Dashboards.tsx:139`, `SingleSignOn.tsx:1008-1013`, `Interfaces.tsx:1718`); (4) inline crumb with `/` (`FlowEditor.tsx:848-858`); (5) inline crumb with `›` (`RunPage.tsx:94-101`); (6) link below the title (`Flows.tsx:409`); plus a link in the right-hand action slot (`Data.tsx:607-611`) | Editors, run page, detail pages. **Observed:** three patterns on three neighbouring screens | One breadcrumb, "Workspace › Section › Object", in the shell header; local back links removed (P2-3) |
| Tabs | ui `Tabs`; `AccessTabs` (`Members.tsx:31-48`); toggle pills (`Data.tsx:592-600`); segmented radio group (`Interfaces.tsx:1316-1335`); `Button`s with `aria-pressed` (`Interfaces.tsx:1809-1819`); `Stepper` used as tabs (`SingleSignOn.tsx:1098`) | 6 uses; Members and access; table rows browser; App Builder viewport and pages; SSO provider | ui `Tabs`, with a link variant for route tabs and the tab in the URL (P2-6) |
| Single-choice filters | `FilterChips` (11 uses); `SegmentedControl` (0 console uses); native `<select>` in toolbars (`Audit.tsx:228,242`) | List toolbars | `FilterChips` with counts for list filters, `SegmentedControl` for view switches, both with arrow-key movement (P2-1, P1-1) |
| Empty states | `EmptyState` (ui); `EmptyCanvas` (console); bare paragraphs | 17 / 7 + every `CollectionView` / `Runs.tsx:311-313`, `Execution.tsx:1142`, `Alerts.tsx:200` | One empty state inside LoadState, always with a primary action where the user may create (P2-4, P2-13) |
| Copy affordances | `CopyButton` (text button, `ListScreen.tsx:342`, 11 uses); `CopyIcon` / `CopyableId` (24 px icon, `copy.tsx`, 4 + 3 uses); `JsonView`'s hover-only chip (`JsonView.tsx:59-75`); `select-all` on `<code>` (`Execution.tsx:1084`, `Account.tsx:54`, `EndUsers.tsx:65`, `Operate.tsx:383`) | IDs, keys, commands, payloads | One icon copy control that is always visible and announces "Copied"; `CopyableId` for identifiers (P0-10, P4-6) |
| Key-value lists | `KeyValues` (console, 24 uses, 13 px values); `Facts` (ui, 4 uses, 12.5 px values, bordered); a `<dl>` in `widgets.tsx:409` | Inspectors, detail pages, SSO, flow run | `KeyValues` (unboxed); `Facts` retired from the console (P2-1, P4-2) |
| Panels | `Panel` (43 uses); `Card` (0 console uses); 28 hand-written `rounded-panel border` blocks; 46 `rounded-control border` boxes | See 2.4 | `Panel` at elevation 1 (border only), not nested (P4-2) |
| Status marks | `StatePill`; `Badge`; `Tag` / `EnvTag`; `Junction` and graph strokes; coloured text (`Data.tsx:1046-1054`) | 63 / 48 / 47 + 9 uses | `StatePill` for lifecycle state, `Tag` for classification, `Badge` for counts only, one state map with an `unknown` fallback (P2-5) |
| Code blocks | `JsonView`; `LogViewer`; `Markdown` code; `CodeEditor`; three `<pre>` styles; seven `<code>` styles; `Mono`; the `code()` helper ×6 | See 2.19 | `code` 13/20 and `code-sm` 12/18 roles on `code-bg`; `Mono` for inline values; one block component (P2-1, P1-6) |
| Confirm flows | `ask.confirm` ×30; `ask.typeToConfirm` ×3; no confirmation for some destructive actions ("Remove this widget", "Stop sharing", Backspace on a flow step) | See 2.17 | `ask.confirm` with the affected objects listed; type-to-confirm for irreversible, wide-reaching deletes (P0-9) |
| Save feedback | Success toast (19 calls in 12 files); inline "Saved." text (`Branding.tsx:313-317`, `InstanceBranding.tsx:209`); inline success `Notice` (`Git.tsx:116-118`); nothing but the list changing (15 write-heavy files with no success toast, for example `Tenant.tsx` with 11 writes) | Every write | One dirty-aware save bar for forms and a toast with a link to the result for actions; success feedback on every write (P2-7, P2-8) |
| Loading | Bare paragraph ×37; `Panel` ×1; `Chart` pulse; `Skeleton` (unused); blank frame ×3 | See 2.22 | LoadState with a skeleton (P2-4) |
| Form errors | `Notice` above the buttons; `Notice` above the form; toast | `ListScreen.tsx:197`; `InputDialog.tsx:77`; 54 `notify.error` sites | FormField with linked errors plus one form-level position (P2-7) |
| Search boxes | Five builds (see 2.12) | List toolbars, shell, palette | One search field at the standard 32 px control height (P2-1, P2-7) |
| Drawers | `Inspector`; `SideSheet` | 13 / 11 uses | One chrome and one focus behaviour for both (P0-3) |
| Formatting helpers | Five duration formatters; five date formatters plus five bare `toLocaleString()` | See 2.2 | One format module (P4-6) |
| Field frame | `Fields.tsx:15-29`; `Combobox.tsx:33-52`; `SchemaForm.tsx:327-378` | All fields | One FormField (P2-7) |
| Decorative motifs | `JunctionList` (kit) vs the same list hand-built in `Shell.tsx:357-364`; `InsetRule` (kit) vs the identical span in `SideSheet.tsx:52` | Shell, sheet | The kit versions |

## 4. Look alike, behave differently; behave alike, look different

### Look alike, behave differently

| Pair | What differs | User-visible consequence |
|---|---|---|
| ui `Table` rows vs `CollectionView` rows vs hand-written rows | Only `CollectionView` rows are selectable and focusable; `Table` rows are inert; Runs rows select by pointer only | Clicking a row opens an inspector on Members and does nothing on Workspaces. Moving Workspaces → Members → Domains → SSO, a user meets four "open a row" conventions in four clicks: a link in the first cell, a row click, a "Details" button, a name that is a button swapping the page |
| Docked `Inspector` vs the same `Inspector` as a `SideSheet` (below 1280 px) | The sheet traps focus, closes on Esc and returns focus; the docked form does none of these | Esc closes the panel on a laptop window and does nothing on a wide monitor; keyboard users lose their place only at one width |
| `Badge` vs `Tag` | Used interchangeably for state; `Badge` is filled, `Tag` is outlined mono capitals | An amber filled pill means "Draft" in the script editor, "Production" in the workspace list and "Not bound" on connections; the user cannot learn what amber means |
| `Tag tone="production"` for the environment vs the same tone for "Paused", "Not bound", "Edits not published" | Same look, unrelated meanings | The production marker, the one signal that should stop a user before a risky action, is diluted |
| `Button` with `aria-pressed` vs hand-made toggle pills (`Data.tsx:592`) vs `FilterChips` | `Button` shows no on-state; pills and chips do | On the table rows browser's toggle and the flow editor's toggle (`Data.tsx:174`, `FlowEditor.tsx:920`) a sighted user cannot see whether the option is on |
| ui `Tabs` vs `AccessTabs` | `Tabs` hold state and switch panels; `AccessTabs` are links that change the route | Back and reload restore the tab in Members and access but not in a run page, a script editor or an SSO provider |
| `FilterChips` vs a real radio group | Declared as a radio group, but each chip is a tab stop and arrows do nothing | Keyboard and screen-reader users are told one interaction model and given another |
| `Dialog` vs `SideSheet` | Title 16 vs 18 px; no close button vs a close button; scrim /40 vs /30; hand-built footer vs a footer slot | On a phone the full-screen palette dialog has no visible way out (F6 in `05-accessibility-audit.md`); overlays do not feel like one family |
| "Try again" on a `ListScreen` error vs none on a `CollectionView` error | Same red notice | On Runs, Triggers, Members or Audit a failed load can only be recovered by reloading the page |
| Remove a flow step with the button vs with Backspace | The button asks for confirmation, the key does not | The same action is guarded or not depending on how it is invoked |
| `typeToConfirm` with and without `danger` | The confirm button is red for "Delete tenant" and primary for "Remove identity provider" | A destructive confirm looks like a routine one |
| Two Push / Pull sets on the Git sync page | The top buttons push with no message prompt (`GitSync.tsx:148-160`); the panel below asks for a commit message (`Git.tsx:323-331`) | Two buttons with one label do different things on the same page |
| `CreateDialog` cancel vs success | Values are cleared only on success | Reopening "Add member" shows the previous email and password |
| `StatePill` for a known state vs an unknown one | A known state renders; an unknown one throws | One unexpected value from the API blanks the console (**Observed**) |

### Behave alike, look different

| Pair | What differs | User-visible consequence |
|---|---|---|
| `Panel` vs `Card` vs 28 hand-written panels | Padding (`p-3`, `p-4`, `p-4 md:p-5`, `p-6 sm:p-7`) and nesting | Pages read as assembled from different products; boxes inside boxes add borders without adding grouping |
| `KeyValues` vs `Facts` vs a `<dl>` | 13 px vs 12.5 px values; unboxed vs bordered | The same fact list changes size and gains a border between an inspector and a detail page |
| `EmptyState` vs `EmptyCanvas` vs a paragraph | Left-aligned dashed box; centred with a diagram; plain text | "Nothing here" has to be re-read on each screen; only two of the three offer the next action |
| `PageHeader` vs `CollectionView` header vs editor headers | Title 26 / 20 / 18 / 16 px; gutter 32 vs 24 px | The title jumps in size and shifts 8 px sideways when moving between a page and a workbench (**Observed**: x = 320 vs 312) |
| Six back patterns | Position (above, below, inline, right), separator (`/`, `›`, arrow), element (link, button) | The way out of a detail page must be found again on each screen |
| `FilterChips` vs `SegmentedControl` vs two hand-made segmented groups | Pills at 28 px; a framed thumb at 32 px; pills at 32 px | A view switch and a filter look like different kinds of control from screen to screen |
| `CopyButton` vs `CopyIcon` vs `JsonView`'s hover chip vs `select-all` | A text button; a 24 px icon; a chip invisible until hover; nothing visible | Users cannot predict whether a value can be copied; on touch the JSON copy cannot be found; one-time secrets rely on `select-all` |
| Ui `Tabs` vs `AccessTabs` vs toggle pills | 14 px action-coloured underline; 13 px ink; filled pills | Tabs are not recognisable as one control |
| Inputs at 28, 30, 32 and 36 px | Height | Toolbars cannot align (`Audit.tsx:228-256`, `Runs.tsx:219-250`) |
| Inspector close vs sheet close | 28 px lucide `X` at 15 vs 32 px inline SVG at 16 | The same panel's close button changes size and weight with window width |
| `ask.confirm`, success toast, inline "Saved.", inline notice, silence | Five outcomes for "your change was accepted" | After a write the user often has to inspect the list to learn whether it worked |
| Draft / Deployed / Repository as `Badge` (scripts, resources) vs `Tag` (flows) | Filled vs outlined; amber vs teal for "Draft" | The two editors a builder moves between most show the same state in different colours |
| Connections vs data sources | "Test" vs "Test connection"; "Unbind" vs "Disconnect"; `StatePill` vs coloured text; side-sheet wizard vs centred dialog | One concept (a credentialed link to an external system) is learned twice |
| Durations | "1.2s" (`Overview.tsx:78-80`) vs "1.2 s" elsewhere; mono in columns, sans in pills | Numbers in adjacent views do not line up or match |
| Section headings | `text-base font-semibold`, `text-title`, `SectionLabel`, 15 px, 13 px | Heading level cannot be read from size |

## 5. Component state matrix

Y = styled or implemented; – = not implemented; n/a = not applicable. "Y(g)" under focus-visible means only the global ring (`tokens.css:167`). All entries are Verified from classes and props, not from a browser. No component has a pressed style, so that column is "–" wherever a pressed state would apply.

### `packages/ui`

| Component | Default | Hover | Pressed | Focus-visible | Selected | Disabled | Loading | Error | Empty |
|---|---|---|---|---|---|---|---|---|---|
| `Button` | Y (variants incl. primary, secondary, `promote`, `danger-solid`; 2 sizes) | Y | – | Y(g) | – (`aria-pressed` passes through unstyled) | Y (50 %) | – | n/a | n/a |
| `TextField` / `NumberField` / `DateField` / `TextAreaField` | Y | – | n/a | Y(g) | n/a | Y (60 %) | – | text only; no border change | n/a |
| `SelectField` (native) | Y | – | n/a | Y(g) | native | Y | – | text only | n/a |
| `CheckboxField` | Y | – | – | Y(g) | native accent | Y | – | text + `aria-invalid` | n/a |
| `ComboboxField` / `MultiSelectField` | Y | – on the box | – | Y (`focus-within` on the box) | Y (`✓` + medium weight) | Y | via the `empty` text | text only | Y |
| `Menu` | Y | Y (highlight) | – | Y (highlight) | Y (`current` `✓`, not exposed) | – (no disabled item) | – | n/a | – |
| `Tabs` | Y | Y | – | Y(g) | Y | Y | – | n/a | n/a |
| `SegmentedControl` | Y | Y | – | Y (`has-[:focus-visible]`) | Y | Y | – | n/a | n/a |
| `DateStepper` | Y | Y | – | Y(g) | n/a | Y | – | n/a | n/a |
| `Dialog` / `DialogsProvider` | Y | n/a | n/a | focus trap (Base UI) | n/a | submit disabled until ready | – | – | n/a |
| `SideSheet` | Y | close Y | – | focus trap | n/a | n/a | – | – | n/a |
| `Toast` | Y (3 tones) | dismiss Y | – | Y(g) | n/a | n/a | n/a | tone only; `role="status"` | n/a |
| `Notice` | Y (4 tones) | n/a | n/a | n/a | n/a | n/a | n/a | tone, `role="alert"` | n/a |
| `EmptyState` | Y | n/a | n/a | n/a | n/a | n/a | n/a | n/a | is the empty state |
| `Badge` | Y (5 tones) | n/a | n/a | n/a | n/a | n/a | n/a | tone | n/a |
| `Table` | Y | – | – | n/a | – | n/a | – | – | Y (prop) |
| `Grid` | Y | cell Y | – | Y(g) | Y (`bg-action-soft/50`, radio) | busy disables | busy flag only | per cell | Y |
| `Card` | Y | Y (if `onSelect`) | – | Y | Y (ring) | – | – | n/a | n/a |
| `Avatar` | Y | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `Skeleton` | Y | n/a | n/a | n/a | n/a | n/a | is the loading state | n/a | n/a |
| `Pagination` | Y | via `Button` | – | Y(g) | n/a | Y | – | n/a | n/a |
| `Facts` | Y | n/a | n/a | n/a | n/a | n/a | – | – | – |
| `JsonView` | Y | copy Y (chip appears on hover or focus) | – | Y(g) | n/a | n/a | – | `tone="danger"` | Y |
| `LogViewer` | Y | controls Y | – | Y(g) | toggles `aria-pressed` | Download when nothing to save | `empty` text | – | Y |
| `ResultView` | Y | chips Y | – | Y(g) | n/a | n/a | – | – | Y |
| `Markdown` | Y | links | – | Y(g) | n/a | n/a | n/a | n/a | n/a |
| `Timeline` | Y | rows | – | Y(g) | Y (`aria-pressed`) | n/a | – | – | not verified |
| `Chart` | Y | – | – | – | – | – | Y (pulse) | not verified | – |
| `Form` / `SchemaForm` | Y | via fields | – | first invalid field focused | n/a | Y while busy | button disabled only | per field, on submit | n/a |
| `PageShell` | Y | links | – | Y(g) | `aria-current` | n/a | – | – | n/a |
| `widgets` (app widgets) | Y | buttons | – | Y(g) | `aria-pressed` | not verified | not verified | not verified | "empty" text at 2.52:1 |

### Console kit and scaffolding

| Component | Default | Hover | Pressed | Focus-visible | Selected | Disabled | Loading | Error | Empty |
|---|---|---|---|---|---|---|---|---|---|
| `CollectionView` (`CollectionView.tsx`) | Y | Y on selectable rows (`hover:bg-surface`, `:123`) | – | Y(g) on rows (`tabIndex=0`) | Y (`bg-selected`, `aria-selected` / `aria-current`, `:108-123`) | n/a | bare paragraph (`:78`) | `Notice`, no retry (`:73-76`) | `EmptyCanvas` |
| `ListCollection` | Y | as above | – | as above | Y, opens the Inspector | n/a | as above | as above | as above + "Nothing matches" |
| `ListScreen` / `Page` / `ListFrame` | Y | – on rows | – | n/a on rows | – | n/a | bare paragraph (`ListScreen.tsx:254`) | `Notice` + "Try again" (`:239`) | `EmptyState` with action |
| `CreateDialog` | Y | via fields | – | via `Dialog` | n/a | submit disabled while busy (`:200`) | – (no busy label) | per field + `Notice` (`:197`) | n/a |
| `CopyButton` / `RemoveButton` (`ListScreen.tsx`) | Y | via `Button` | – | Y(g) | n/a | via `Button` | – | toast | n/a |
| `Inspector` (`layout.tsx:86`) | Y | close Y (`:127`) | – | Y(g) on close; no focus move when docked | n/a | n/a | – | – | – |
| `MasterDetail` | Y | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `PageHeader`, `SectionLabel`, `Panel`, `KeyValues`, `NextStep` | Y | n/a | n/a | n/a | n/a | n/a | – | – | – |
| `Stepper` (`layout.tsx:167`) | Y | Y when steps are buttons (`:209`) | – | Y(g) | Y (`aria-current="step"`) | – | n/a | – | n/a |
| `FilterChips` (`layout.tsx:289`) | Y | Y (`:315`) | – | Y(g) | Y (`aria-checked`, action border and soft fill) | – | – | n/a | n/a |
| `EmptyCanvas` | Y | n/a | n/a | n/a | n/a | n/a | n/a | n/a | is the empty state |
| `CopyIcon` / `CopyableId` (`copy.tsx`) | Y | Y (`:25`) | – | Y(g) | "Copied" by icon swap and `title` only, not announced | – | n/a | – | n/a |
| `StatePill`, `Tag`, `EnvTag`, `Mono` (`status.tsx`) | Y | n/a | n/a | n/a | n/a | n/a | n/a | throws on an unknown state | n/a |
| `UsedBy` (`references.tsx`) | Y | detail in `title` only | n/a | – | n/a | n/a | not verified | not verified | not verified |
| `Junction`, `Wire`, `SignalPath`, `PortBrackets`, `InsetRule`, `JunctionList` (`motifs.tsx`) | Y (decorative, `aria-hidden`) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `BrandMark` (`brand.tsx`) | Y | n/a | n/a | n/a | n/a | n/a | not verified | not verified | n/a |
| `CommandPalette` / `ShortcutSheet` | Y | not verified | – | input `autoFocus`; `outline-none` on the input (`:635`) | Y (active option `bg-selected`, `:677`, with an Enter glyph) | n/a | not verified | not verified | not verified |
| `CodeEditor` (`editor/CodeEditor.tsx`) | Y | Monaco | Monaco | Monaco | Monaco | read-only mode | textarea fallback until Monaco loads (`:112-121`) | Monaco markers | n/a |
| `FlowGraph` (`FlowGraph.tsx`) | Y | not verified | – | removed inline (F1) | Y (`aria-pressed`) | n/a | – | state by stroke colour and a 5 px dot | – |

"Not verified" marks cells the source notes do not cover; they need a read of the component before the specification's state table for that component is finalised.

## 6. Status of the earlier audit's V1–V9

`docs/evolution/04-ux-audit.md` §4.4 listed nine visual-consistency findings. Their state at `e737382`:

| # | Earlier finding | Status | Evidence |
|---|---|---|---|
| V1 | Three status presentations (`StatePill`, `Badge`, `Tag`) | Partly fixed | `StatePill` is now dominant (63 uses / 22 files), but `Badge` (48 / 16) and `Tag` (47 / 18) still carry lifecycle state. "Draft / Deployed / From the repository" is a `Badge` in `Authoring.tsx:629`, `ResourceEditor.tsx:344`, `Authoring.tsx:859` and a `Tag` in `FlowEditor.tsx:871-875`, `Flows.tsx:213-215` |
| V2 | Three run-state label maps | Mostly fixed | One `STATES` map with a distinct `waiting_approval` (`status.tsx:42-61`). Residue: a dead `_TONE` map (`Execution.tsx:28`); two trigger-label maps with different words (`Execution.tsx:64`, `Flows.tsx:42`); both `canceled` and `cancelled` keys; `waiting` and `waiting_time` both read "Waiting"; `STATE_STROKE` (`status.tsx:92`) disagrees with the pill for canceled and skipped |
| V3 | Four list implementations | Open; now six | Section 2.13 |
| V4 | Bare "Loading…" ×36; `Skeleton` and `Pagination` unused | Open | 37 bare paragraphs; `<Skeleton` 0 uses in console; `Pagination` has no consumer in the repo |
| V5 | Only `ListScreen` retries; Connection groups empty state renders nothing | Partly fixed | No `LoadState` wrapper exists. Retry is in `ListScreen.tsx:239` plus 8 hand-written sites; `CollectionView` has none (`CollectionView.tsx:73-76`). The Connection groups empty state is fixed (`Execution.tsx:1141-1145`) |
| V6 | Empty state points only to the CLI | Fixed | `Execution.tsx:207-225` offers "Write one here, or deploy…" with a primary action |
| V7 | `text-[13px]` ×87, `text-[12.5px]` ×11 | Open and worse | Console now has `text-[13px]` ×101, `text-[12.5px]` ×11, `text-[12px]` ×11, `text-[14px]` ×3, `text-[15px]` ×3. No lint rule was added |
| V8 | Flow view and flow run view use `Page` plus an "All flows" link | Partly fixed | `FlowRunView` now takes a `header` slot (`RunPage.tsx:48`). `FlowView` is unchanged: `Flows.tsx:381` (`<Page>`), `Flows.tsx:409-411` ("All flows") |
| V9 | Dead `RunDetail`, `Triggers`, `Approvals`, `Events`, `Changes` | Fixed | None is defined any more. New dead code is listed in section 7 |

Two fixed, four partly or mostly fixed, three open. The open three (V3, V4, V7) are the ones a lint rule or a shared primitive would have closed; the fixed ones were closed by editing individual screens.

## 7. Dead or unused components and exports

| Item | Where | Status (Verified) |
|---|---|---|
| `_TONE` | `Execution.tsx:28` | Defined, never read |
| `STATE` Badge tones | `FlowEditor.tsx:808` | Only the label is read (line 842); the header draws a `Tag` |
| `SignalPath`, `PortBrackets`, `JunctionList` | `motifs.tsx` | Used only by `KitSheet.tsx` |
| `WIDE.panel`, `WIDE.rail` | `layout.tsx:25` | Never read |
| `Page`'s `width="form"` branch | `ListScreen.tsx:109` | No caller passes it |
| `Pagination` | `packages/ui` | No consumer anywhere outside `packages/ui` and its tests |
| `registerWidget` | `packages/ui` | No consumer anywhere outside `packages/ui` and its tests |
| `Markdown` | `packages/ui` | Exported; used only internally by `ResultView` |
| `Skeleton`, `Card`, `Avatar`, `PageShell`, `SegmentedControl`, `DateStepper`, `Form`, `checkForm` | `packages/ui` | Not used by the console. Used by `examples/fernhill` apps or `packages/app`, so not dead, but outside the console's system |
| `bg-raised`, `bg-code-bg` tokens | `tokens.css` | Defined; 4 and 3 uses; ui never uses `code-bg` |

`packages/app` and the `examples/` apps were checked only as consumers of ui exports, not audited.

## 8. Enforcement

**What keeps the system consistent today (Verified).**

| Mechanism | Scope | Effect |
|---|---|---|
| Biome `noAlert: error` (`biome.json:19`) | Native `alert` / `confirm` / `prompt` | Fully effective: 0 found; an e2e test also asserts it (`e2e/redesign.spec.ts:233`) |
| Biome recommended accessibility rules | Source | 12 `biome-ignore lint/a11y/*` comments, each with a reason |
| Token-copy tests | `tokens.css` vs the server's list vs the branding defaults (`apps/control-plane/src/apps.test.ts:1238`, `apps/console/src/Portal.test.tsx:242`) | The three copies agree |
| e2e overflow test (`e2e/redesign.spec.ts:161-222`) | Listed screens at 390 / 768 / 1440, light and dark | No sideways scroll; the instance accent reaches `--vx-action` |
| Component behaviour tests (`packages/ui/src/*.test.tsx`) | kit, Dialogs, Form, Grid, SchemaForm, ResultView, Chart | Behaviour, queried by role and label |
| CI (`.github/workflows/ci.yml:45,154`) | `pnpm lint` and e2e | Runs the above |
| `KitSheet.tsx` (route `/instance/kit`) | Console kit only | A reference sheet for tokens, type roles, motifs, state and environment marks, actions, chips, empty canvas |

**Written down but not enforced.** `CONTRIBUTING.md:95`: "Do not style with raw colors or sizes: use the theme tokens." Colours: obeyed (0 violations). Sizes: 187 arbitrary `text-[…]` classes and 17 hard-coded `rounded-[4px]`.

**What nothing checks.**
- Arbitrary text sizes (the earlier audit's V7 asked for a check; none exists), and the use of ui type roles inside ui.
- Which list, header, empty-state or status component a screen uses.
- Contrast, for the built-in theme or for operator and tenant branding.
- Control heights, icon sizes and spacing steps.
- Bare "Loading…" paragraphs and missing retry.
- Unused exports (no knip or ts-prune equivalent).
- Visual regressions: the e2e run writes screenshots but compares none (0 `toHaveScreenshot` or snapshot assertions).
- Accessibility beyond lint: no `axe-core`, `jest-axe`, `vitest-axe` or `@axe-core/playwright` in any `package.json`.
- The reference sheet's coverage: `KitSheet.tsx` imports only `Button` and `Notice` from `@vynxlabs/ui`. Fields, `Table`, `Dialog`, `SideSheet`, `Menu`, `Tabs`, `Badge`, `JsonView`, `LogViewer`, `Toast`, `EmptyState` and `CollectionView` are not on it, nor are control sizes or loading and error states. It also sits in operators' production navigation (`nav.ts:200`) although it is a developer reference.

Judgment: the two rules that are enforced (no native dialogs, token copies in step) have zero violations; the rule that is only written down has 204. Enforcement, not intent, is the difference. P2-12 covers the lint rules, the full kit sheet, visual regression and axe in CI.

## 9. Debt register

Ordered by user impact (judgment), highest first. "Engineering cost" is what the debt costs the team today, not the cost of the fix. Evidence is Verified unless marked.

| ID | Debt | Evidence | User-visible cost | Engineering cost | Fix | Roadmap ID |
|---|---|---|---|---|---|---|
| DS-1 | Status rendering has no fallback: an unknown state throws | `status.tsx:79`; `stateOf()` at `status.tsx:90` unused by the runs list; no error boundary. **Observed (mocked API)** | One unexpected API value blanks the whole console | Any new server state is a breaking change for the UI | Explicit `unknown` state in the one state map; error boundary per region | P0-1, P2-5 |
| DS-2 | Text tokens fail AA: `ink-subtle`, `attention`, `success` on dim surfaces, placeholders, opacity-faded text | 2.3 text table; `text-ink-subtle` ×134; `Fields.tsx:6`; `Grid.tsx:252,311`; `Shell.tsx:397` | Table headers, navigation labels, waiting states, the promote button and placeholders are hard to read in light theme | Every new use of the token inherits the failure | Token values from the specification; placeholder on `ink-subtle`; no opacity on text | P0-2 |
| DS-3 | Control boundaries and selection cues are below 3:1 | `line` 1.41 on surface; selected row 1.03; menu highlight 1.20; segmented 1.23 | Input edges and the selected row, option or segment are hard to find | One border token serves decoration and controls, so it cannot be tuned | New `line-control` token; a non-colour selected cue | P0-2, P2-1 |
| DS-4 | Branding colours are not contrast-checked | No contrast or luminance check anywhere; `Portal.test.tsx:310`; `InstanceBranding.tsx:81-83,217` | An operator can make buttons, focus rings or the production tag unreadable for every user | Support cost lands on the operator | Contrast check on save, with a warning in the branding editor | P0-2 |
| DS-5 | Six list implementations with different row behaviour, selection, keyboard, paging and error handling | 2.13; `Runs.tsx:201-318` re-implements `CollectionView` | Rows that look alike open, select or do nothing depending on the screen; Runs rows cannot be opened by keyboard; no sort; no retry on most lists | Each list feature (sort, paging, keyboard, states) must be built six times or not at all | One DataTable; migrate `ListScreen`, `ListCollection`, `CollectionView`, ui `Table` uses and hand-written tables | P2-2, P0-3, P1-1 |
| DS-6 | Docked `Inspector` and `SideSheet` are one component with two behaviours and two chromes | 2.16; `layout.tsx:103,113`; `SideSheet.tsx:62-74` | Esc and focus behave differently either side of 1280 px; keyboard users lose their place | Two close buttons, paddings and footers to maintain | One chrome; docked form takes and returns focus and closes on Esc | P0-3 |
| DS-7 | Toasts cannot carry errors: 5 s auto-dismiss, `role="status"`, text only | `Toast.tsx:35,56-59,84`; `notify.error` ×54 | A failed action flashes bottom-right and is gone; for many row actions it is the only report | No way to attach an action, link or undo | Toast v2: persistent errors with `role="alert"`, actions, link to result | P0-7, P2-8 |
| DS-8 | Incomplete control states: no pressed style, no `Button` loading, no on-state for toggles | 2.10; 72 `disabled={busy…}` sites, 5 with a label change; `Data.tsx:174`, `FlowEditor.tsx:920` | A click gives no acknowledgement; a busy button only fades; a toggle's state is invisible | Each screen improvises busy labels | Pressed and loading states on `Button`; styled `aria-pressed` | P2-8, P2-1 |
| DS-9 | No loading or error standard: bare "Loading…", unused `Skeleton`, retry on 9 of 112 errors, no request ID, blank frames | 2.21, 2.22; `CollectionView.tsx:73-78`; `App.tsx:104`; `Tenant.tsx:164,413` | Layout jumps on load; failed lists need a page reload; nothing to quote to support | The same four-branch ladder is hand-written on every screen | LoadState with skeleton, error + retry + request ID, empty + action | P2-4 |
| DS-10 | State is drawn four ways and the amber production tone is reused for unrelated warnings | 2.11 conflict table; `Tag tone="production"` at `Shell.tsx:773,858`, `Runs.tsx:681` | Colour and shape cannot be learned; the production signal is diluted | Nine local state maps, four copies of one | `StatePill` for lifecycle, `Tag` for classification, `Badge` for counts; amber reserved for production and warnings | P2-5, P4-5 |
| DS-11 | Fields do not mark invalid controls, link errors, or show required; the field frame exists three times | 2.12; `Fields.tsx:15-29`; `Combobox.tsx:33-52`; `SchemaForm.tsx:327-378`; 28 `required={false}` | Errors are easy to miss and are not announced with the field; required fields are discovered by submitting | Three frames drift apart; defensive props | One FormField with linked errors and required marks | P2-7 |
| DS-12 | No standard feedback for a successful write; three save models; three places for form errors | 2.12; 19 `notify.success` calls in 12 of 40 files with writes; `Branding.tsx:313-317`; `Git.tsx:116-118` | Users inspect the list to learn whether a change was accepted; some forms save at once and others wait, with no cue which | Every screen invents its own busy / saved / error state | Dirty-aware SaveBar; success feedback on every write | P2-7, P2-8 |
| DS-13 | Destructive and creation dialogs behave unevenly | 2.17; `Dialogs.tsx:68-72,153`; `SingleSignOn.tsx:1027-1032`; `ListScreen.tsx:153`; `FlowEditor.tsx:1051,1331-1337` | A destructive confirm can look routine; a cancelled form keeps a password; the same deletion is guarded or not | Footer and close hand-built per dialog | Footer slot, close button, danger by default for type-to-confirm, clear on cancel | P0-9 |
| DS-14 | Control heights: inputs at 28, 30, 32 and 36 px; small controls at 24, 28, 32 | 2.9; `Audit.tsx:228-256`; `Runs.tsx:219-250` | Toolbars do not align; filter rows take more height than needed (**Observed**: 282 px before the first Runs row) | Each toolbar is hand-tuned | Three control heights (28 / 32 / 36), 32 as the console default | P2-1 |
| DS-15 | Row heights from about 31 to 57 px; Runs uses two-line rows | 2.9 row table; `Runs.tsx:400-417`. **Observed**: 57 px, 82 with a tag; about 10 rows in 900 px | The highest-traffic list shows the fewest rows; density changes screen to screen | — | Table density 28 / 36 / 44; single-line Runs rows | P1-1, P2-2 |
| DS-16 | Seven page-header variants and six back patterns | 2.15; section 3. **Observed**: three back patterns on three neighbouring screens | Title size and the way out change between sibling pages; the title shifts 8 px between page and workbench | Headers copied rather than composed (`Runs.tsx:202-205`) | One PageHeader and one breadcrumb | P2-3, P4-1 |
| DS-17 | Four tab implementations; two single-choice controls; view state in the URL on some screens only | 2.14; `Members.tsx:31-48`; `Data.tsx:592-600`; `Interfaces.tsx:1316-1335,1809-1819`; `Flows.tsx:76-78` | Back and reload restore the tab or filter on some screens and reset it on others; `FilterChips` announce a radio group that does not behave as one | — | ui `Tabs` with a link variant; state in the URL; arrow keys on chips | P2-6, P2-12 |
| DS-18 | Targets below 24×24 px, mostly from text glyphs used as buttons | 2.9 target table; `Toast.tsx:88-95`; `Combobox.tsx:119,172-177`; `Runs.tsx:421-432` | Small dismiss, clear and remove buttons are hard to hit, worst on touch | — | 24 px minimum target; lucide icons in 28 px icon buttons | P4-3, P2-1 |
| DS-19 | No Tooltip or Popover; information held in native `title` | 2.18; about 17 `title=` attributes; `Runs.tsx:408`; `references.tsx:24` | Truncated values and "used by" lists are unreachable by keyboard or touch | One hand-made tooltip already (`Overview.tsx:149`) | A Tooltip component; truncation with the full value on hover and focus | P3-1, P4-6 |
| DS-20 | Three empty-state looks; most `CollectionView` empties have no action | 2.20 | On an empty Members, Groups or Roles list the user must find the create button in the header | — | One empty state in LoadState with the primary action | P2-13, P2-4 |
| DS-21 | Four copy affordances; `JsonView`'s is hover-only; one-time secrets rely on `select-all` | 2.19; `JsonView.tsx:59-75`; `Execution.tsx:1084`; `Account.tsx:54` | Users cannot predict whether or how a value can be copied; on touch the JSON copy cannot be found | — | One always-visible copy control that announces "Copied" | P0-10, P4-6 |
| DS-22 | Type system: no 13 px or 16 px role; 187 arbitrary sizes; ui does not use roles; seven heading sizes | 2.2 | Hierarchy cannot be read from size; three near-identical small sizes | A type change means editing 187 literals; brand or density changes cannot be made in one place | Add `body-sm` and a 16 px role; migrate; lint | P2-1, P2-12 |
| DS-23 | Code presentation: two background tokens, three `<pre>` and seven `<code>` styles, the `code()` helper copied six times, JSON colours that reuse status tokens | 2.19 | Code looks different on each screen; green and amber in a payload read as status and two fail contrast | Six copies of a helper | `code` / `code-sm` roles on `code-bg`; neutral syntax colours | P2-1, P1-6 |
| DS-24 | Date and duration formatting duplicated | 2.2: five duration and five date formatters, five bare `toLocaleString()` | "1.2s" beside "1.2 s"; timestamps formatted differently on adjacent views | Ten functions to keep in step | One format module | P4-6 |
| DS-25 | Three panel containers and about 35 card-in-card cases | 2.4 | Borders stop conveying grouping; pages look heavier than their content (**Observed**: workspace settings) | 28 hand-written panels | `Panel` only; group with spacing and labels first | P4-2 |
| DS-26 | Spacing has no scale: 16 steps, two gutters, three page-stack gaps, `m-0` ×294 | 2.1 | Rhythm varies; the 8 px gutter shift is visible (**Observed**) | Hand resets on every paragraph; 22 loading paragraphs with stray margins | 4 px scale from the specification; base reset for `p` and headings | P2-1 |
| DS-27 | Width and measure are ad hoc: 23 `max-w-*` values, five prose measures, an unused form width | 2.23 | Forms and settings pages have different widths; wide screens stretch single columns (**Observed** at 2200 px) | Each screen picks a number | Named page widths; side-by-side detail from 1920 px | P3-8, P2-1 |
| DS-28 | Radius: an unnamed 4 px step hard-coded 17 times | 2.6 | Mismatched inner corners under a brand that changes the control radius | — | Named 4 / 6 / 8 / 12 radii | P2-1 |
| DS-29 | Elevation is unnamed: shadows, z-index and scrims as literals; dark shadows nearly invisible | 2.7 | Menus and dialogs separate poorly from the page in dark theme | Magic numbers in 6 files | Four elevation levels with border + shadow rules | P2-1 |
| DS-30 | Icons: seven sizes, two stroke widths, text glyphs in ui | 2.8 | Icons look uneven in weight and size; glyph buttons render differently per font | — | Three sizes (14 / 16 / 20), stroke 1.75, lucide in ui | P4-3 |
| DS-31 | Untokenised colour through opacity modifiers | 2.3: 35 uses, 17 distinct | Tone borders differ slightly between notice, tag and chip; all are below 3:1 | Colours that the branding system cannot reach | Tokens for tone borders and scrims | P2-1, P0-2 |
| DS-32 | Motion has no tokens and the running state has no cue; JS motion ignores reduced motion | 2.24; `FlowEditor.tsx:590,758` | A live run looks the same as a still one; overlays appear abruptly | — | Three durations; one running indicator; honour reduced motion in JS | P4-4 |
| DS-33 | `Menu` lacks disabled items, shortcut hints and an exposed current item | 2.18; `Menu.tsx:49,55` | Unavailable actions must be hidden rather than explained; shortcuts cannot be learned from menus | — | Extend `Menu` | P3-1 |
| DS-34 | Dead and unused code and exports | Section 7 | None directly | Misleads contributors (a `Pagination` and a `Skeleton` exist, so the gap looks filled) | Remove or adopt; unused-export check | P2-12 |
| DS-35 | Almost nothing is enforced; the reference sheet covers only the console kit; screenshots are not compared; no automated accessibility check | Section 8 | Every item above can recur after it is fixed (V7 grew from 87 to 101) | Review is the only control | Lint for type sizes and primitives; full kit sheet; visual regression and axe in CI | P2-12 |

## 10. What to keep unchanged

These are sound and should survive the consolidation as they are (judgment, with the evidence that supports it).

- **Colour tokens and their discipline.** 22 semantic roles in light and dark with zero palette or hex leaks. Theming by swapping variables works for instance branding, charts and the flow graph. Only some values change (P0-2); the names and the model stay.
- **Semantic role names**: canvas / surface / sunken / structure / raised / selected; ink / muted / subtle; action / attention / danger / success with soft pairs.
- **`StatePill`**: icon, word and colour together, never colour alone, one map keyed by the API's state enum.
- **The questions API** (`ask.confirm`, `ask.prompt`, `ask.typeToConfirm`) with named actions, and the lint rule behind it.
- **Base UI underneath** dialog, sheet, menu, tabs, combobox and field: focus trapping, roving focus and ARIA come with it.
- **The global focus-visible ring**: a dedicated `focus` token, 2 px with a 2 px offset, at 5.80:1 or better on every surface.
- **The global reduced-motion rule** and a UI that barely animates.
- **`tabular-nums` globally** and mono reserved for telemetry (`Mono`, `CopyableId`).
- **`CollectionView` + `Inspector` + `MasterDetail`**: sticky header, its own scroll region, column priority, sheet fallback under 1280 px. It is the base for the DataTable, not something to replace.
- **`FilterChips` with counts, `NextStep`, `KeyValues`, `SectionLabel`**: small, well-scoped console parts.
- **Native select and date inputs** as a deliberate accessibility choice (`Fields.tsx:65,221`).
- **`SchemaForm` and `InputDialog`** for run input, with server errors mapped to fields.
- **`JsonView`, `LogViewer`, `ResultView`, `Timeline`**: real developer-tool components with search, level filter, wrap and download; they need extension (P1-6), not redesign.
- **Shell responsiveness** (rail → panel → drawer) and its e2e overflow test at three widths in both themes.
- **The type-role mechanism**: named roles that bundle size, line-height, weight and tracking. It needs two more roles and adoption.
- **The fonts**: system sans and system mono. No finding in this audit is solved by changing them.
- **Copy quality**: plain, specific empty states and confirmations.
- **Restraint.** Colour appears only for state and the primary action (**Observed**); there are no gradients, no decorative shadows on in-flow content and no ornamental motion. This is the "quiet infrastructure" half of the north star and is already in place; the debt above is about making the "vivid state" half consistent and legible.
