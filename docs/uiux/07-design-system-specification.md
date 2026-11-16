# 7. Design-system specification

This document defines the design foundation the console should move to: tokens for spacing, type, colour, surfaces, borders, radius, elevation, control sizes, icons, table density, motion, focus and breakpoints. It is a proposal. Nothing is implemented.

Every decision names the audit finding it solves. Where a value has no finding behind it, the current value stays. Findings are in [02-design-system-forensics.md](02-design-system-forensics.md) and [05-accessibility-audit.md](05-accessibility-audit.md). Component behaviour is in [08-component-pattern-library.md](08-component-pattern-library.md).

Evidence labels: **Verified** (code at `e737382`), **Observed (mocked API)**, **Judgment**. Contrast ratios are computed with the WCAG 2.x relative-luminance formula.

## Main points

- The colour system stays. Five light values and two dark values change, all for contrast. One border token is added.
- Type goes from eight roles plus 187 arbitrary sizes to ten roles and no arbitrary sizes. The missing 13 px and 16 px roles are added.
- Spacing gets a named scale of eleven steps in place of sixteen ad hoc ones.
- Controls come in three heights. The console's default drops from 36 to 32 px. Tables get three densities, with single-line rows.
- Radius, elevation, z-index, icon size and motion each become a short named set.
- The shared kit's defaults do not move for tenant apps. The console opts in to the denser values through its own theme layer.

## 7.1 Constraints this specification respects

| Constraint | Source | Effect |
| --- | --- | --- |
| `@vynxlabs/ui` is imported by tenant apps, and its defaults must not move | `docs/phases/phase-8-console-redesign.md`, "The kit's defaults do not move" | New sizes are opt-in. The console sets them once in its own stylesheet |
| Instance and tenant branding override `--vx-*` colour, radius and font tokens | `packages/ui/src/tokens.css:1-5` | Every colour stays a token. New tokens join the branding list with safe defaults |
| A test keeps the token copies in step | `apps/control-plane/src/apps.test.ts`, `apps/console/src/Portal.test.tsx` | New tokens are added to every copy in the same change |
| No raw colours in screens | Phase 8 exit criterion | Kept, and extended to sizes |

### Where values live

| Layer | File | Holds |
| --- | --- | --- |
| Brand tokens | `packages/ui/src/tokens.css` `:root` | Colours, radii, fonts. Overridable by branding |
| Shared roles | `packages/ui/src/tokens.css` `@theme` | Type roles, spacing names, elevation, motion, z-index. Not brandable |
| Console density | `apps/console/src/styles.css` `@theme` | The console's own control height, table density and title sizes |

## 7.2 Spacing

**Problem solved.** There is no spacing scale. Sixteen steps are in use, with 22 distinct gap values across 690 uses. The page gutter and the workbench gutter differ by 8 px, so titles shift sideways between screens (Verified, 02 §spacing; Observed, O12).

### Scale

| Token | px | Tailwind step | Use |
| --- | --- | --- | --- |
| `space-0.5` | 2 | 0.5 | Icon to text inside a tag |
| `space-1` | 4 | 1 | Label to its control. Icon to label |
| `space-1.5` | 6 | 1.5 | Icon to text in a button or state mark |
| `space-2` | 8 | 2 | Between controls in a toolbar. Between chips |
| `space-3` | 12 | 3 | Cell padding. Between related rows |
| `space-4` | 16 | 4 | Panel padding. Between form fields |
| `space-5` | 20 | 5 | Between a heading and its content |
| `space-6` | 24 | 6 | Page gutter. Between sections |
| `space-8` | 32 | 8 | Between major groups on a page |
| `space-10` | 40 | 10 | Empty-state padding |
| `space-12` | 48 | 12 | Sign-in and first-run layouts |

Steps 2.5, 3.5, 7 and 9 are retired. The arbitrary pixel nudges in `Shell.tsx:264-407` and `kit/motifs.tsx:105-112` are moved into the motif components, where they are implementation detail.

### Layout constants

| Constant | Value | Replaces |
| --- | --- | --- |
| Page gutter, horizontal | 24 px from 768 px, 16 px below | `md:px-8` on pages and `md:px-6` on workbenches |
| Page gutter, top | 16 px on workbenches and editors, 24 px on pages | `py-4` and `py-6` |
| Section gap | 24 px | `gap-4`, `gap-5`, `gap-6`, `gap-9` |
| Panel padding | 16 px | `p-3`, `p-4`, `p-4 md:p-5`, `p-6 sm:p-7` |
| Inspector and sheet padding | 16 px | 16 px docked, 20 px as a sheet |
| Form field gap | 16 px | 12 px in `CreateDialog`, 16 px elsewhere |
| Label to control | 4 px | Unchanged |
| Toolbar gap | 8 px | Mixed |
| Prose measure | 72ch | `52ch`, `60ch`, `70ch`, `75ch`, `80ch` |

### Base reset

Paragraph and heading margins are reset once in the base layer. `m-0` appears 294 times because nothing resets them, and 22 loading paragraphs forget it (Verified, 02).

### Grouping rule

Related items sit 4 to 8 px apart. Items in the same group sit 12 to 16 px apart. Groups sit 24 to 32 px apart. A divider or a box is added only when these steps cannot show the grouping.

## 7.3 Typography

**Problem solved.** The shared kit has 2 uses of its own type roles against 49 arbitrary sizes. `text-[13px]` appears 141 times and no role covers 13 px sans. There is no 16 px role. Headings use seven sizes (Verified, 02 §typography).

### Font roles

| Role | Stack | Used for |
| --- | --- | --- |
| Sans | `ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` (unchanged) | Interface text, prose, labels, state words |
| Mono | `ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace` (unchanged) | Code, logs, JSON, paths, IDs, versions, durations, counts in telemetry, cron expressions, keyboard keys |

Sans is never used for a path or an ID. Mono is never used for a sentence. `font-variant-numeric: tabular-nums` stays global.

### Type roles

| Role | Size / line | Weight | Face | Use | Replaces |
| --- | --- | --- | --- | --- | --- |
| `display-lg` | 26 / 32 | 600 | Sans | Overview titles, sign-in, first-run | `text-display` today |
| `display` | 20 / 28 | 600 | Sans | Page title on every working screen | `text-display` on workbenches, `text-xl` |
| `title` | 16 / 24 | 600 | Sans | Section, inspector, dialog and panel headings | `text-title` (18), `text-lg`, `text-base font-semibold` ×27 |
| `emphasis` | 15 / 22 | 500 | Sans | A row's primary text in comfortable lists. Lead sentences | `text-[15px]` |
| `body` | 14 / 20 | 400 | Sans | Default interface text, form values, table cells | Unchanged |
| `body-sm` | 13 / 18 | 400 | Sans | Field labels, hints, errors, secondary cell text, menu items | `text-[13px]` ×141 |
| `meta` | 12 / 16 | 400 | Sans | Timestamps, counts, captions, table headers | `text-meta` (12.5), `text-[12.5px]`, `text-[12px]`, `text-xs` |
| `label` | 11 / 16 | 600, uppercase, +0.06em | Sans | Group headings above sections | `text-label` (12) |
| `code` | 13 / 20 | 400 | Mono | Paths, IDs, inline code, JSON, editor default | `text-telemetry`, `font-mono text-[13px]` |
| `code-sm` | 12 / 18 | 400 | Mono | Log lines, dense JSON, key-value code values | 12 and 12.5 px mono |
| `tag` | 10.5 / 12 | 600, uppercase, +0.06em | Mono | Environment and classification tags, counts in the nav | Unchanged |

`micro` (10 px, one use) is retired. No text is smaller than 10.5 px, and 10.5 px is used only for tags of one to three words.

**Why 20 px page titles.** A 26 px title on a workbench spends the screen's strongest contrast on a word the navigation already shows, and it costs about 40 px of height above operational data (Observed, O3). Overviews keep 26 px because the title there is the object's name.

**Why 12 px meta.** Three sizes within one pixel of each other (12, 12.5, 13) are in use. Two remain: 12 and 13.

### Weights

400 for text, 500 for emphasis and interactive labels, 600 for headings and labels. No 700.

### Rules

- One `display` per screen. It is the `h1`.
- Heading levels follow document order. `title` is `h2` on a page and the dialog's heading in a dialog.
- A state word uses `body` at weight 500 in its state colour, with its icon.
- Numbers that are compared down a column are right-aligned, in mono, with the unit in `meta`: `3.0 s`, not `3.0   s` (Observed, O5).

### One formatting module

Durations, timestamps and relative times are formatted in five or more places with different results, for example "1.2s" and "1.2 s" (Verified, 02). One module provides:

| Value | Format | Example |
| --- | --- | --- |
| Duration under 1 s | Whole milliseconds | `420 ms` |
| Duration under 60 s | One decimal | `3.0 s` |
| Duration under 1 h | Minutes and seconds | `4m 12s` |
| Relative time under 24 h | Largest unit only in lists | `5m ago` |
| Absolute time, same day | Time with seconds | `16:38:54` |
| Absolute time, other day | ISO date and time, on one line | `2026-11-16 16:38:54` |
| Hover or focus on any time | Full local time, UTC, and relative | Tooltip |
| ID | Mono, middle-truncated at 12 characters, with copy | `r_01HX…9F2K ⧉` |

## 7.4 Colour

**Problem solved.** The colour system is the strongest part of the design and is kept. Two text tokens fail 4.5:1 on common backgrounds in the light theme, and no border reaches the 3:1 that WCAG 1.4.11 requires for control boundaries (Verified, 05).

### Neutral palette

| Token | Light now | Light proposed | Dark now | Dark proposed | Role |
| --- | --- | --- | --- | --- | --- |
| `canvas` | `#eef1f4` | unchanged | `#10161f` | unchanged | The page |
| `structure` | `#e7ebf0` | unchanged | `#0c1118` | unchanged | Rail and section panel |
| `surface` | `#ffffff` | unchanged | `#18212d` | unchanged | Panels, tables, inputs |
| `raised` | `#ffffff` | unchanged | `#1f2a38` | unchanged | Menus, popovers, dialogs |
| `sunken` | `#e3e8ed` | unchanged | `#0c1118` | unchanged | Wells, table headers, code blocks |
| `code-bg` | `#f5f7f9` | unchanged | `#0b1016` | unchanged | Editor and log background |
| `selected` | `#e3eff4` | unchanged | `#172430` | unchanged | Selected row. Always paired with a 2 px `action` edge |
| `line` | `#d3dae2` | unchanged | `#2b3746` | unchanged | Dividers and panel edges |
| `line-strong` | `#b4bfcb` | unchanged | `#3a4859` | unchanged | Emphasis dividers, table header rule |
| `line-control` | none | `#748090` | none | `#6b7b90` | Boundaries of inputs, checkboxes, unfilled buttons |
| `ink` | `#16202e` | unchanged | `#e6ebf1` | unchanged | Primary text |
| `ink-muted` | `#5b6777` | `#4b5666` | `#9aa7b6` | unchanged | Secondary text |
| `ink-subtle` | `#687485` | `#586474` | `#7e8b9b` | `#8a97a7` | Tertiary text, placeholders, table headers |

### Contrast of the changed values

Light theme, ratio against each background:

| Token | canvas | surface | sunken | structure | selected |
| --- | --- | --- | --- | --- | --- |
| `ink-muted` now `#5b6777` | 5.07 | 5.75 | 4.66 | 4.80 | 4.91 |
| `ink-muted` proposed `#4b5666` | 6.56 | 7.44 | 6.04 | 6.21 | 6.35 |
| `ink-subtle` now `#687485` | 4.19 | 4.75 | 3.85 | 3.96 | 4.05 |
| `ink-subtle` proposed `#586474` | 5.31 | 6.02 | 4.88 | 5.03 | 5.13 |
| `attention` now `#b45309` | 4.43 | 5.02 | 4.07 | 4.19 | 4.28 |
| `attention` proposed `#9a4707` | 5.65 | 6.41 | 5.20 | 5.35 | 5.47 |
| `success` now `#1f7a4d` | 4.69 | 5.32 | 4.31 | 4.44 | 4.54 |
| `success` proposed `#1b6e45` | 5.51 | 6.24 | 5.06 | 5.22 | 5.33 |
| `line-strong` now `#b4bfcb` | 1.65 | 1.87 | 1.51 | 1.56 | 1.59 |
| `line-control` proposed `#748090` | 3.54 | 4.01 | 3.25 | 3.35 | 3.42 |

Dark theme:

| Token | canvas | surface | sunken | raised | selected |
| --- | --- | --- | --- | --- | --- |
| `ink-subtle` now `#7e8b9b` | 5.23 | 4.68 | 5.46 | 4.18 | 4.55 |
| `ink-subtle` proposed `#8a97a7` | 6.11 | 5.46 | 6.37 | 4.88 | 5.31 |
| `line-strong` now `#3a4859` | 1.95 | 1.74 | 2.03 | 1.56 | 1.69 |
| `line-control` proposed `#6b7b90` | 4.20 | 3.76 | 4.38 | 3.36 | 3.65 |

`ink-muted` is darkened with `ink-subtle` so that the two stay distinguishable: 7.44 against 6.02 on surface.

Also on soft status backgrounds in light: proposed `attention` on `attention-soft` is 5.70 (now 4.47), and proposed `success` on `success-soft` is 5.41 (now 4.61).

### Accent and status

| Token | Light | Dark | Role | Change |
| --- | --- | --- | --- | --- |
| `action` | `#0e5f7a` | `#5cb8d6` | Primary action, links, focus, running state, selection edge | None |
| `action-ink` | `#ffffff` | `#06222c` | Text on `action` | None |
| `action-soft` | `#dcedf3` | `#17323d` | Tint behind an action-toned mark | None |
| `focus` | `#0e5f7a` | `#5cb8d6` | Focus ring | None |
| `danger` / `danger-soft` | `#b3261e` / `#fbe9e7` | `#f2857d` / `#3d1b18` | Failure, destructive action | None |
| `attention` / `attention-soft` | `#9a4707` / `#fdf0dc` | `#f0a94b` / `#3a2a12` | Waiting on a person or time, warnings, production | Light text value only |
| `success` / `success-soft` | `#1b6e45` / `#e1f3e9` | `#6fcf9a` / `#153326` | Success, live | Light text value only |

### Rules

1. **Colour means state or action, and nothing else.** No colour for decoration or categorisation.
2. **State is never colour alone.** It is an icon, a word and a colour together.
3. **One primary action per view** is filled with `action`. Other actions are outlined or plain.
4. **Soft backgrounds are for marks, not regions.** A whole panel is not tinted red because something in it failed. The failure block is.
5. **Opacity modifiers are limited to two named uses:** a tone border at 45% (`border-danger/45` and the like) and a scrim. Seventeen distinct opacities are in use today (Verified, 02).
6. **Amber as an environment signal means production.** "Paused" keeps amber as a state. "Instance · operator" moves to a neutral tag (Verified, 01).
7. **Placeholders use `ink-subtle`.** They are 3.04:1 today.
8. **Text is never dimmed with opacity.** The dim rail links at 2.14:1 use a token instead (Verified, 05).

### Branding and contrast

Instance and tenant branding can set any token, and nothing checks the result (Verified, 02). The branding screens compute the ratios for the pairs in the tables above as values are typed, show a pass or fail per pair, and refuse to save a text pair under 4.5:1 or a control boundary under 3:1. The same check runs in CI over the default tokens (10).

## 7.5 Surfaces, borders and elevation

**Problem solved.** There are three competing panel containers, about 35 nested bordered boxes, shadows with no names, and z-index values written as numbers in six files (Verified, 02 §surfaces).

### Surface hierarchy

| Level | Token | Border | Shadow | Used for |
| --- | --- | --- | --- | --- |
| 0 | `canvas` | none | none | The page behind everything |
| 0 | `structure` | `line` on the inner edge | none | Rail, section panel |
| 1 | `surface` | `line` | none | Tables, panels, editor panes, inspectors, inputs |
| 1, recessed | `sunken` or `code-bg` | `line` | none | Table headers, wells, code, logs |
| 2 | `raised` | `line` | `elevation-2` | Menus, popovers, comboboxes, tooltips, toasts |
| 3 | `raised` | `line` | `elevation-3`, over a scrim | Dialogs, sheets, the command palette |

Nothing in the page flow has a shadow. A shadow means "this floats above the page and can be dismissed".

### Elevation tokens

| Token | Value | Replaces |
| --- | --- | --- |
| `elevation-2` | `0 4px 12px rgb(0 0 0 / 0.10)`, dark `0.40` | `shadow-lg` on menus, comboboxes, toasts |
| `elevation-3` | `0 12px 32px rgb(0 0 0 / 0.16)`, dark `0.50` | `shadow-xl` on dialogs, `shadow-2xl` on sheets |
| `elevation-drag` | `0 8px 20px rgb(0 0 0 / 0.14)` | `shadow-sm` on nodes while moved, `shadow-lg` on dragged widgets |

### Layer tokens

| Token | Value | Layer |
| --- | --- | --- |
| `layer-sticky` | 10 | Sticky table headers and toolbars |
| `layer-sheet` | 40 | Side sheets and their scrim |
| `layer-dialog` | 60 | Dialogs, the command palette |
| `layer-popover` | 70 | Menus, comboboxes, tooltips |
| `layer-toast` | 80 | Toasts |

### Border hierarchy

| Token | Use | Contrast requirement |
| --- | --- | --- |
| `line` | Dividers between rows, panel edges, separators | None. Decorative under WCAG |
| `line-strong` | The rule under a table header, a section break that must read at a glance | None |
| `line-control` | The boundary of an input, select, checkbox, radio, unfilled button, or drop zone | 3:1 against adjacent colours |
| `action`, 2 px | The selected row's leading edge, the selected tab's underline, the focus ring | 3:1 |
| Tone at 45% | The edge of a status block | Carried by the icon and text |

### Containment rules

1. A panel may contain a table, a form or a list. It may not contain another panel.
2. A `Notice` inside a panel drops its own border and keeps its tint and icon. This removes most of the nesting found.
3. One sentence and one button is a settings row, not a card (Observed, O13).
4. A label that repeats the heading of the box beneath it is removed.
5. `Panel` is the one container. The unused `Card` in `packages/ui` and the 28 hand-written panels move to it.

## 7.6 Radius

**Problem solved.** Two radius tokens exist, and a third value, 4 px, is hard-coded in 17 places, so a brand that changes the control radius gets mismatched corners (Verified, 02).

| Token | Value | Use | Change |
| --- | --- | --- | --- |
| `radius-inner` | `calc(var(--vx-radius-control) - 2px)`, 4 px by default | Tags, chips, menu items, grid cells, inline code, keys | New token for the hard-coded 4 px |
| `radius-control` | 6 px | Buttons, inputs, selects | Unchanged |
| `radius-panel` | 8 px | Panels, tables, menus, popovers | 10 → 8 |
| `radius-overlay` | 12 px | Dialogs, sheets, the command palette | New |
| Full | 9999 px | Avatars, the live dot, count pills | Unchanged |

**Why 8 px panels.** At 10 px with 16 px padding and dense rows, the corner curve is visible against the first row's edge. This is a judgment and the lowest-priority change in this document.

## 7.7 Control sizing

**Problem solved.** Text inputs come in four heights (28, 30, 32, 36) and small controls in three (24, 28, 32). A toolbar that mixes them cannot align, and `Audit.tsx:228-256` and `Runs.tsx:219-250` do exactly that (Verified, 02 §control sizing). Several targets are under 24 px (Verified, 05).

### Heights

| Size | Height | Text | Horizontal padding | Use |
| --- | --- | --- | --- | --- |
| `sm` | 28 | `body-sm` | 8 | Toolbars inside a pane, table cell editors, log controls, inspector actions |
| `md` | 32 | `body` | 12 | The console default: page actions, filters, form fields in panels |
| `lg` | 36 | `body` | 12 | Sign-in, dialogs on touch widths, tenant apps (the kit's default, unchanged) |

Every control type has all three: button, icon button, text input, select, combobox, segmented control, tabs, chips. A toolbar uses one size throughout.

The kit's default stays `lg` for tenant apps. The console sets `md` once through a density context, so no call site passes a size for the common case.

### Targets

| Rule | Value |
| --- | --- |
| Minimum pointer target | 24 × 24 px, or 24 px of spacing to the next target (WCAG 2.5.8) |
| Icon button | 28 × 28 with a 16 px icon. 32 × 32 on touch widths |
| Checkbox and radio | 16 px box inside a 24 px hit area |
| Chip remove, combobox clear, toast dismiss | 24 × 24 hit area around the glyph |
| Flow connection handle | 12 px visible inside a 24 px hit area. It is 6 × 6 today |
| Sort header | The whole header cell is the target |

### States every control has

Default, hover, pressed, focus-visible, selected or on where it applies, disabled, loading, and invalid for inputs.

| State | Treatment |
| --- | --- |
| Hover | Background one step toward `sunken`. No movement |
| Pressed | Background one step further. Missing everywhere today |
| Focus-visible | 2 px `focus` ring at 2 px offset |
| Selected / on | `selected` background and `action` text or edge. `aria-pressed` buttons get this. It is unstyled today |
| Disabled | `ink-subtle` text, `sunken` background, no hover, and a reason available on hover or focus |
| Loading | The label stays, a 14 px spinner replaces the icon, the control is `aria-busy` and not re-clickable. 72 `disabled={busy}` sites today, of which 5 change the label |
| Invalid | `danger` border at full strength, the error text below linked with `aria-describedby`. Red text only today |

## 7.8 Table density

**Problem solved.** Rows range from about 31 to 57 px across eight table styles. Runs rows are 57 px, or 82 px with a tag (Verified, 02; Observed, O3).

| Density | Row | Header | Cell text | Default for |
| --- | --- | --- | --- | --- |
| Compact | 28 | 28 | `body-sm`, identifiers in `code-sm` | Audit log, events, table rows, run steps, queue |
| Standard | 36 | 32 | `body`, identifiers in `code` | Runs, triggers, flows, scripts, members, most lists |
| Comfortable | 44 | 32 | `body`, optional second line in `meta` | Lists with a needed second line: approvals, domains |

Rules:

- Rows are single-line in compact and standard. A second line is allowed only in comfortable.
- The header is sticky, in `meta` at weight 500, `ink-subtle`, on `sunken`, with a `line-strong` rule beneath.
- Cell padding is 12 px horizontal. The first and last cells align with the page gutter.
- Text is left-aligned. Numbers, durations and counts are right-aligned in mono.
- The state column is first and sized to its longest label. "Waiting for approval" overflows its column today (Observed, O4).
- Truncation is at the end for prose and in the middle for paths and IDs. The full value shows on hover and on focus.
- A density preference per user switches lists between compact and standard. It is stored on the server with the user's other preferences.

## 7.9 Icons

**Problem solved.** Seven icon sizes between 12 and 18 px are in use with no rule. The shared kit uses text glyphs (`✓ × ‹ › ▲ ▼`) where the console uses icons, and stroke width is 1.75 in five places and 2 elsewhere (Verified, 02 §icons).

| Size | Use |
| --- | --- |
| 14 | Inline with `body-sm` or `meta` text. State marks |
| 16 | Inside controls: buttons, inputs, menu items, tabs |
| 20 | The rail, empty states, dialog headers |

Library: lucide, through `@vynxlabs/ui/icons`. Stroke 1.75 everywhere, set once in a wrapper. The kit's text glyphs become icons.

An icon alone is used only for universally read actions (close, copy, search, more) and always has an accessible name and a tooltip. Everything else has a text label.

## 7.10 Motion

**Problem solved.** There is one transition in the product. Dialogs, sheets and menus appear with none, so the interface reads as abrupt (Verified, 02 §motion). There is nothing to remove. This section defines the small set to add.

| Token | Duration | Easing | Use |
| --- | --- | --- | --- |
| `motion-instant` | 0 ms | none | Selection, row hover, tab change, filter result |
| `motion-fast` | 120 ms | ease-out | Hover and pressed backgrounds, focus ring |
| `motion-base` | 180 ms | ease-out | Menus, popovers and tooltips: fade and 4 px shift from the trigger |
| `motion-slow` | 240 ms | ease-out | Sheets from their edge, dialogs fade and scale from 0.98, inspector open |

Rules:

1. Motion shows where something came from or that something finished. Nothing else moves.
2. Nothing blocks input. An expert can act before a transition ends.
3. One thing loops: the running indicator, a slow rotation on the running icon. Running has no motion today.
4. A row that arrives by live update fades in over `motion-base` and does not shift what the user is reading. New rows above the viewport are announced by a "3 new" control at the top.
5. Under `prefers-reduced-motion`, all of the above is removed. The global rule in `tokens.css:172-177` stays. The running indicator becomes static, and the flow graph's programmatic `fitView` duration is set to 0.

### Perceived performance

| Threshold | Requirement |
| --- | --- |
| Under 100 ms | Selection, menu open, panel toggle, local filter and sort. These must not wait on the network |
| 100 ms to 1 s | No indicator. Keep the previous content in place, as `useLoad` already does with `keepPreviousData` |
| Over 1 s | A visible state at the place of the work: a button spinner, skeleton rows, "Saving…" |
| Over 10 s | A named stage or progress, elapsed time, and a way to cancel or leave |

Skeletons match the shape of what will load: rows for a table, lines for a key-value list. A centred spinner is used only where the shape is unknown.

## 7.11 Focus

**Problem solved.** The global ring is sound. One component removes it with an inline style, the docked inspector never takes or returns focus, and focus does not move on route change (Verified, 05).

| Rule | Value |
| --- | --- |
| Ring | 2 px solid `focus`, 2 px offset. 5.8:1 or better against every surface today |
| Removal | Never. `outline: none` is allowed only where the same element draws an equivalent ring |
| Inside a canvas | The ring is drawn on the node as a 2 px `focus` border plus a 2 px gap, so that it survives zoom |
| On a row | A 2 px inset ring on the row. The row is one tab stop, and arrow keys move within the table |
| Route change | Focus moves to the page's `h1`, which has `tabindex="-1"` |
| Overlay open | Focus moves into it. Overlay close returns focus to the control that opened it |
| Docked inspector | Opens with focus on its heading. `Esc` closes it and returns focus to the row |
| Skip link | "Skip to content" is the first tab stop |

## 7.12 Breakpoints and layout

**Problem solved.** Breakpoints are expressed twice, as Tailwind classes and as JS constants of which two are unused. There are 23 distinct `max-w-*` values and five prose measures. Wide screens gain only whitespace (Verified, 02 §responsive; Observed, O3).

| Name | Min width | Layout |
| --- | --- | --- |
| `sm` | 640 | Stacked forms become two columns where it helps |
| `md` | 768 | The rail appears |
| `lg` | 1024 | The section panel docks. Editors become available |
| `xl` | 1280 | The inspector docks. Editors show two panes |
| `2xl` | 1536 | Wider inspector (416 px). Tables show all priority-2 columns |
| `3xl` | 1920 | List and detail side by side. Run page shows three panes |

One constant set in `kit/layout.tsx` is the source for both CSS and JS.

### Width rules

| Surface | Width |
| --- | --- |
| Workbench (list, table, canvas, editor) | Full width, no cap |
| Object page | Full width. Prose inside it at 72ch |
| Form page | 720 px content column, with a preview or help column beside it from `xl` |
| Settings | 720 px content column |
| Sign-in, approval link, not found | 400 to 560 px, centred |

At `3xl` a list that would stretch gains a docked detail pane before its columns widen. A column never grows past the width its content needs.

## 7.13 What this specification does not change

| Kept | Reason |
| --- | --- |
| Both font stacks | No finding is solved by changing them |
| The 22 colour tokens' names and roles | The system is coherent. Only seven values move |
| The teal accent | It has good contrast in both themes and is the product's identity |
| The shell's dimensions: 64 px rail, 224 px panel, 48 px header | Sound, and tested at three widths |
| The motifs: signal path, port corner, junction dots | They carry meaning and are the product's own marks |
| Base UI as the primitive layer | Behaviour is already correct |
| The global reduced-motion rule | Correct as written |
| The kit's defaults for tenant apps | A constraint from phase 8 |

## 7.14 Enforcement

A specification that nothing checks decays. These checks are part of the foundation work (P2-12), not a follow-up.

| Check | Mechanism | Stops |
| --- | --- | --- |
| No arbitrary type sizes | A lint rule rejecting `text-[` and raw `text-xs` to `text-3xl` in `apps/console/src` and `packages/ui/src` | The 187 arbitrary sizes returning |
| No retired spacing steps | The same rule for `gap-2.5`, `gap-3.5`, `p-7` and arbitrary spacing outside the motif files | Scale drift |
| No hard-coded radius, shadow or z-index | The same rule for `rounded-[`, `shadow-`, `z-[` | Unnamed values |
| Approved primitives only | A lint rule rejecting raw `<table>`, and `ListScreen` and `ListCollection` once migrated | A seventh list |
| Token contrast | A unit test computing the ratios in 7.4 for both themes | A failing token |
| Token copies agree | The existing test, extended to the new tokens | Drift between copies |
| Visual regression | Screenshot comparison in `e2e/redesign.spec.ts`, which takes screenshots today without comparing them | Unintended visual change |
| Accessibility | axe in component tests and e2e | Regressions against 05 |
| The kit sheet shows everything | `/instance/kit` renders every component in every state and density | Undocumented variants |

## 7.15 Decision log

| # | Decision | Solves | Kind |
| --- | --- | --- | --- |
| 1 | Eleven-step spacing scale, one page gutter | 16 ad hoc steps, 8 px title shift | Verified problem, judgment on values |
| 2 | Ten type roles, add 13 px and 16 px, no arbitrary sizes | 187 arbitrary sizes, 7 heading sizes | Verified problem |
| 3 | 20 px page titles on working screens | Contrast and height spent on a redundant word | Judgment |
| 4 | Darken `ink-muted`, `ink-subtle`, `attention`, `success` in light. Lighten `ink-subtle` in dark | WCAG 1.4.3 failures | WCAG requirement |
| 5 | Add `line-control` | WCAG 1.4.11 failure on every input | WCAG requirement |
| 6 | Three control heights, console default 32 | Four input heights, misaligned toolbars | Verified problem, judgment on values |
| 7 | 24 px minimum targets | WCAG 2.5.8 | WCAG requirement |
| 8 | Three table densities, single-line rows | 57 px rows, eight row heights | Verified problem, supported by NN/g and Carbon |
| 9 | Named radius, elevation and layer tokens | Hard-coded 4 px, unnamed shadows and z-index | Verified problem |
| 10 | Panels do not nest. Notices lose their border inside panels | About 35 nested boxes | Judgment, after Kennedy's public writing on spacing over containment |
| 11 | Three icon sizes, one stroke, icons in the kit | Seven sizes, text glyphs | Verified problem |
| 12 | Four motion tokens, one looping indicator | Abrupt overlays, no running cue | Judgment |
| 13 | Focus moves on route change and into overlays, and returns | WCAG 2.4.3 | WCAG requirement |
| 14 | One breakpoint source, a `3xl` layout | Unused constants, stretched wide screens | Verified problem |
| 15 | Branding contrast check | Unchecked overrides | WCAG risk |
| 16 | Fonts unchanged | Nothing | Deliberate non-change |
