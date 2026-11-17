# Phase 16: visual refinement and micro-polish (UI/UX audit P4)

Status: built, all nine milestones, on branch `phase-16-uiux-p4`, off `main`. Not pushed.
Last updated: 2026-11-17

The UI/UX audit ranks seven items as P4 in [09-prioritized-uiux-roadmap.md](../uiux/09-prioritized-uiux-roadmap.md), the last stage. They apply the rules in [07-design-system-specification.md](../uiux/07-design-system-specification.md): formatting in §7.3, containment in §7.5, motion in §7.10. Each item was re-checked against `main` after phase 15.

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Page chrome (P4-1) | Every workbench's first row starts 212 to 400 px down at 1440 × 900 (below). List descriptions are always shown. Audit, Events and Members label their filters above them. Flows and Triggers put Notices above the table. Operator access is a full Notice above every tenant screen | `CollectionView`'s header is a full `PageHeader`; there is no help control or popover |
| Boxes (P4-2) | Notices inside panels keep their border. Workspace settings is four one-sentence cards and a hand-written red box. 94 hand-written `rounded-* border` boxes in the console. `Card` is unused | `Notice` is always bordered; there is no settings row |
| Icons (P4-3) | Sizes 12 and 30 beside 14, 16 and 20. Text glyphs (✓ × ▲▼ ▾▸ ‹ ›) in the kit, inline SVG closes in Dialog and SideSheet | No size scale; the kit predates lucide |
| Motion (P4-4) | Tooltips and context menus use `motion-fast` without the 4 px shift. Live rows on Runs appear without a fade, and push what you read down. The flow canvas animates its view under reduced motion | No `motion-instant`, nothing enforcing tokens, and no held "N new" rows |
| Production (P4-5) | A production workspace is marked by a 10.5 px amber tag that looks the same as "attention", which also marks "Paused" and "Instance · operator". The switcher says "(production)" in plain text | One tone for three meanings |
| Formatting (P4-6) | Five duration formatters ("1.2s", "1.2 s", "4 m 12 s"), about 14 for times, a `code` helper pasted in six screens. IDs truncate at the end | No formatting module |
| Truncation (P4-7) | Instance members' emails draw over the next column at 768, 1280 and 1440 px. Paths wrap or cut at the end, with no full value on hover | No middle truncation; `DataTable`'s `truncate` adds no `title` |

Some of the roadmap's evidence is out of date:
- Titles are already 20 px (`text-display`).
- Runs already has a compact header in two rows.
- Dialogs, sheets, menus and the running icon already move, on tokens, and stop under reduced motion.
- Icon strokes are already one width, through `LucideProvider`.
- Numeric columns can already be right-aligned.

**Exit criterion:** the Acceptance rows of P4-1 to P4-7 pass. In short:
- on each workbench at 1440 × 900 the first data row starts within 160 px of the top;
- the nesting scan reports no bordered container inside a bordered container, outside theme previews;
- only icon sizes 14, 16 and 20 are used, outside the brand mark and motifs;
- every transition uses a token, and none runs under reduced motion;
- a production workspace carries three marks that agree (P4-5's acceptance is a usability test, which this phase can't run: an e2e check that the marks are present and agree stands in, and the test is left for the validation plan in [10](../uiux/10-validation-plan.md));
- one module formats every duration and time, and no timestamp wraps at 1280 px or wider;
- no text draws over another element at 390, 768, 1280 and 1440 px.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-16-uiux-p4`, milestones one after another, one commit each `Phase 16: …` |
| Scope | All seven items |
| List descriptions | Shown on a member's first visit to each list, then folded behind a help control. Whether it has been seen is a member preference. Empty states keep the sentence |
| Operator access | A one-line strip under the header that can be hidden. While hidden, a status indicator in the header stays and brings it back |
| Kit `Card` | Removed now, noted as breaking for tenant developers |

## Milestones

| # | Milestone | Items |
| --- | --- | --- |
| 0 | Branch, this document, and the measures (`e2e/measure.ts`, `e2e/polish.spec.ts`) | |
| 1 | One formatting module, `Time`, `Identifier`, one `Code` | P4-6 |
| 2 | Middle and end truncation with the full value, columns sized to their labels | P4-7 |
| 3 | Descriptions behind help, one toolbar row, the operator strip | P4-1 |
| 4 | Borderless notices in panels, settings rows, `Card` removed | P4-2 |
| 5 | Three icon sizes, kit glyphs as icons | P4-3 |
| 6 | Motion tokens everywhere, live rows that fade or wait, reduced motion on the canvas | P4-4 |
| 7 | A production tone, and three marks that agree | P4-5 |
| 8 | The kit sheet, every picture retaken, the changelog and wrap-up | |

## Baseline

Measured by `e2e/polish.spec.ts` ("the measures are recorded") on `main` after phase 15, at 1440 × 900, in a tenant seen through operator access, with a failed run of a long-named script and a flow waiting for approval.

**First data row, px from the top** (target 160):

| Workbench | Top | Workbench | Top |
| --- | --- | --- | --- |
| Runs | 296 | Members | 395 |
| Triggers | 387 | End users | 363 |
| Events | 343 | End-user groups | 297 |
| Flows | 400 | Audit | 390 |
| Scripts | 346 | Tenants | 212 |
| Apps | 317 | Instance members | 234 |
| Approvals | 350 | Operators | 254 |
| | | Instance audit | 292 |

**Text drawn over its neighbour:** instance members at 768, 1280 and 1440 px (each email in its column, 111 to 117 cells). None elsewhere.

**Nested bordered boxes:** none on the screens measured as seeded. The audit's ~35 were mostly Notices inside panels, which show only in states the seed doesn't reach (SSO tested, a domain with a problem, recovery codes just made). Milestone 4 fixes those in the code, and a rule in `enforce.test.ts` stops new hand-drawn panels.

## Findings

### Milestone 0: the measures
- `e2e/measure.ts` measures three things the acceptance rows name, as plain data: the first data row's top, text drawn past its own box without being clipped, and bordered boxes inside bordered boxes. `polish.spec.ts` records them, then asserts them as each milestone meets them.
- `EmptyState` (kit and console) carry `data-empty-state`, so an empty list's "first row" is its empty state.

### Milestone 1: one formatting module (P4-6)
- `kit/format.ts` holds 07 §7.3: `duration`, `ago` (largest unit, a date past a week), `clock` (time today, full date otherwise), `stamp`, `fullTime` (local, UTC, age), `count`, `bytes`, `between`, `middle`, `inZone`. The kit's `duration` moved to `packages/ui/src/format.ts` with the same shape ("4m 12s", not "4 m 12 s"), and the console re-exports it.
- About twenty formatters went: `fromNow` (two units, used in 15 files), `stamp` and Audit's copy of it, three `took`s, `waitWords`, `clockTime`, `hourOf`, the console's `time` for "waiting until", the Draft-saved sum in the flow editor, and eleven bare `toLocale…` calls. Six pasted `code` helpers became `Code` in `kit/status.tsx`.
- `Time` draws a time on one line with its full form in a tooltip. `Identifier` replaces `CopyableId`: middle-cut at 12, the whole in its tooltip and for screen readers, with copy. Run facts, list times and the run page's attempt times use them.
- `enforce.test.ts` fails on `toLocale…` or `new Intl…` outside `kit/format.ts`, on a `code` helper, and on a duration built by hand.

### Milestone 2: truncation (P4-7)
- `Truncate` cuts prose at its end and a path before its last part, in CSS: the head shrinks first (`bil…/record-payment`). The whole value is one hidden text for screen readers and tests, and a hover title while it is cut (`fullOnHover`, also on `StatePill` and `DataTable`'s `truncate` cells).
- Paths use it on Runs, Scripts, Flows, Triggers, Release drafts and palette results.
- **Found by the measure:** instance members' emails drew over the next column at 768 px and wider. Email columns are now cut, with the whole on hover.
- No column needed the planned `fit` option: once every cell clips, the overdraw check passes everywhere, "Waiting for approval" included.

### Milestone 3: page chrome (P4-1)
- **Where the 160 px is measured from.** The roadmap's "282 px" counted from the window's top, through the shell's header. The work area's top is the honest line for a page's own chrome: the shell header and the operator strip are the console's. Before this phase, with the operator notice, lists started 212 to 400 px from the window's top.
- `PageHeader` takes `helpKey`: the description shows the first time, is marked read at once (a `seen:<list>` preference, newly allowed by the server), and is behind an ⓘ `Popover` (new in the kit) from the next visit. `CollectionView` derives the key from its title. Empty states keep the sentence.
- `oneRow`: the title, toolbar and actions share one row from `lg`, wrapping below it; actions render once, placed with `order`.
- `labelHidden` on `TextField` and `SelectField`; Audit, Events, Members and End users use it. Audit's "Show older entries" moved under the list.
- `HeadNote` puts a sentence about the whole list beside its title: Flows' waiting runs, Triggers paused.
- **Operator access** is `OperatorStrip`, under the shell's header, about 32 px. The tenant screen hands it its grant through a small store. "Hide" keeps an `operator.strip` preference naming the grant; the `OperatorMark` in the header shows the notice again or ends access. On a phone the strip keeps its room for its buttons; the role and time are read, not shown.
- **Found:** fresh, "/" reopens the last place a member was, so the spec reaches the tenants list from inside the app.

### Milestone 4: fewer boxes (P4-2)
- 07 §7.5 rule 5 says `Card` moves to `Panel`. `Card` was used by the Fernhill examples (7 times), not unused as the audit thought, so `Panel` moved into the kit with `Card`'s heading, action, footer and `onSelect`, plus `padded`; `Card` is gone and the examples use `Panel`. The console's `Panel` is the kit's.
- A `Notice` or `Facts` inside a `Panel` drops its border (a context; `ContainedArea` for other containers, `bare` on `Notice`). Docked inspectors and sheets are panes, not boxes, so their notices keep their border.
- Workspace settings' four cards and red danger box are one panel of `SettingsRow`s.
- Nested boxes fixed: SSO's addresses, test result and each domain; the recovery codes; Git sync's chosen side; sign-in's email; the approval page. Twelve hand-drawn panels became `Panel`; a form and a disclosure stay drawn by hand, marked `panel-allowed:`.

### Milestone 5: icons (P4-3)
- Size 12 (seven uses) became 14. Size 30 and 24 are the brand mark, 5 the junction motif.
- The kit's characters became lucide icons: ✓ in `Menu` and `Combobox`, × in `Combobox` and Roles' chips, ▲▼ in `Grid`, ▾▸ and ↑↓ in `LogViewer`, ‹ › in the day picker, and the inline SVG closes of `Dialog` and `SideSheet`.
- `@vynxlabs/ui/icons` exports `ICON` and `STROKE`; `PageShell` gives tenant apps the console's stroke.
- **The screenshot threshold again:** an icon for a glyph, or a chevron 2 px larger, changes under 0.2% of a picture, so `--update-snapshots` never rewrote it. Each milestone from here retook its pictures whole (`=all`) and kept those that moved. A time inside visually hidden text was masked at its full width over the strip's buttons; `screenshot.css` no longer draws such a time.

### Milestone 6: motion (P4-4)
- Most of it was there. Added: `motion-instant`; Tooltip and ContextMenu on `motion-base` with the 4 px shift; `animate-arrive` (a fade from the action tint over 180 ms).
- `useArrivals` holds runs that arrive while the reader is down the list or has rows checked; an "N new runs" pill floats below the header and batch bar, and moves nothing. Rows that land in view fade in.
- `glide()` sets the flow canvas's moves to 0 ms under reduced motion.
- `enforce.test.ts` fails on a transition without a motion token, a `duration-*` of its own, an animation outside spin, pulse and arrive, or a reduced-motion rule that stops less than everything.
- **Determinism:** the "seen" descriptions made pictures depend on which spec opened a list first. Screenshot specs now mark every list read (`readEveryList`) before taking any.

### Milestone 7: production (P4-5)
- The production tag is filled amber, every other tag outlined; the switcher shows each entry's tag (a new `detail` on `Menu` items); a 2 px amber rule runs under the header in production. "Instance · operator" is neutral.
- "promotes to" was planned from `md`: it crowded a tablet's header to "S…" and "R", so it shows from `lg`.
- The acceptance is a usability test. The e2e checks what it relies on: all three marks seen without scrolling at 390, 768 and 1440 px in production, and none in dev. The usability test is left for the validation plan.
- **A flake:** the keyboard spec pressed `/` before the runs list had bound it, once in a loaded run; it now presses until it is.

### Milestone 8: wrap-up
- The kit sheet gains "Values, cut and whole": `Time`, `Identifier`, both `Truncate`s, a notice inside a panel, a one-row header with help and a `HeadNote`, the tags, and settings rows.
- CHANGELOG and `master-spec.md` (operator access may be folded to a mark, never removed).
- **Not built:** `DataTable`'s `fit` (not needed, above); search-as-you-type on Events (its Show button stays); the help popover on Runs, whose description was already one line beside its title; middle truncation in breadcrumbs (they already clip, and the overdraw check passes).
- **A flake not fixed:** the data grid spec once found its page at another spec's tenant, reopened by "reopen the last place" after sign-in; it passes alone and passed in every other run.

## Exit criterion

| Acceptance | Result |
| --- | --- |
| P4-1: each workbench's first row within 160 px at 1440 × 900 | Met: 77 to 130 px into the work area (Runs and Audit 130, Members 113) (`polish.spec`) |
| P4-2: no bordered container inside a bordered container, outside theme previews | Met on every measured screen; hand-drawn panels fail `enforce.test.ts` |
| P4-3: only sizes 14, 16, 20 outside the brand mark and motifs | Met (`enforce.test.ts`) |
| P4-4: every transition uses a token; none under reduced motion | Met (`enforce.test.ts`; `polish.spec` with reduced motion) |
| P4-5: everyone states the environment correctly | Stood in for by the three marks at three widths (`polish.spec`); the usability test is left to the validation plan |
| P4-6: one module formats every duration and time; no timestamp wraps at 1280 px+ | Met (`enforce.test.ts`; `polish.spec`) |
| P4-7: no text overdraws at 390, 768, 1280, 1440 | Met on every measured screen (`polish.spec`) |
