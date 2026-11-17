# Phase 16: visual refinement and micro-polish (UI/UX audit P4)

Status: in progress, on branch `phase-16-uiux-p4`, off `main`. Not pushed.
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

**Nested bordered boxes:** none on the screens measured as seeded. The audit's ~35 were mostly Notices inside panels, which show only in states the seed doesn't reach (SSO configured, a workspace paused, a failed test). Milestone 4 adds those states to the measure.
