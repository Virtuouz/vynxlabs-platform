# Phase 19: dashboards placed by drag, motion that is kept, and navigation that does not jump

Status: being built, on branch `phase-19-dashboards-motion`, off `main` at 178a3cb. M1 and M2 built.
Last updated: 2026-11-19

Phase 18 was merged and a demo workspace put on the test instance. The owner walked it and wrote down what was wrong. Each item was checked in the code.

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Drawers | The widget editor on a dashboard appears and goes at once. So do about fifteen other sheets and dialogs | They are drawn only while wanted, with `open` written bare (`Dashboards.tsx:427` → `WidgetEditor.tsx:930`). Base UI gives no opening motion to what is born open, and the parent takes it off the page the moment it closes |
| Moves by arrow | A column, an enum value, a form field moved with its arrow is redrawn in its new place in one frame | Eight places swap two items in a list and draw again. `@dnd-kit` animates only what was dragged |
| Dashboard layout | Widgets are placed by order and one of five widths, moved earlier and later with arrows | Phase 18 chose that on purpose (`phase-18-data-insight.md:379`). The owner prefers the app builder's drag |
| Rows behind a number | The dialog is 30rem wide and its table 60vh tall, so it nearly always scrolls. Dashboard tables cannot be filtered or have their columns ordered | `RowsBehind` uses the regular `Dialog`; `ResultTable` is a plain `Grid` |
| Figures and refresh | A figure has no trend line. A dashboard never refreshes and does not say how old its numbers are | Nothing asks for a series; `useLoad` has no interval |
| Vocabulary | The owner's mock-up needs sparklines, a prior-period series, bars lying down, a heatmap and tables with bars and chips in their cells | Not in `packages/manifest/src/dashboard.ts` |
| Breadcrumb | Inside a dashboard the section is plain text; the workspace's name only opens the switcher | `DashboardView` never names its object to the shell (`kit/title.ts`) |
| Rail | Clicking an area such as Data goes straight to its first section, Tables. On a phone the same tap closes the menu, so reaching Dashboards from Scripts takes two openings | An area is a `Link` to `areaHome()` (`nav.ts:312`), and the drawer closes on any click in it (`Shell.tsx:1145`) |

## Decisions

| Area | Decision |
| --- | --- |
| Layout | A dashboard widget has a place and a size on twelve columns, as an app page's widget does, and is dragged. This reverses phase 18 |
| Rail | An area with more than one section reveals its sections and goes nowhere |
| Refresh | A dashboard refreshes every 5 minutes unless it says otherwise |
| Vocabulary | Trimmed by the owner on 2026-11-19 to eight options. Cut as scope creep: colour rules (`thresholds`, `tones`), a figure's `alertWhen`, `target` and `of`, a chart's `annotate`, a `share` mark (a stacked bar lying down does it), a widget's `note` and `link` and a dashboard's `footer` (a text widget does them), a table cell's second line and marker. Deferred: comparing with the year before, and exporting a whole dashboard |
| Left out | Subscribing to a dashboard by mail, and PDF export |

## M1: every sheet and dialog arrives and leaves with motion

**Built.**

- `SideSheet` and `Dialog` (`packages/ui`) open a frame after they are on the page (`useOpening`, `presence.tsx`), so one born open has an opening.
- `Closing` (`presence.tsx`) is how a sheet is opened for a subject: it keeps the sheet on the page, told it is shut and still given its subject, for as long as closing takes, then takes it away so the next starts afresh. Seventeen call sites use it: the widget editor, the dashboard's filters, rows behind a number, a role, a promotion review, drift, a group's members, an end user's attributes, an enum's values, a reference's delete rule, a batch's results, the three "run again" dialogs, the connection wizard from Scripts, an app action's question, and the new-schedule sheet in two places.
- Below 1280 px the inspector's sheet stays on the page shut, so it slides both ways (`kit/layout.tsx`). Phase 18 had left it.
- `Appear` (`presence.tsx`) is for a panel drawn by hand. The flow editor's "Steps to add" uses it.
- The docked inspector's wrapper and `Appear` carry `data-drawer` and the same `data-starting-style` and `data-ending-style` a Base UI popup does.

**Tests, in three layers.**

1. `enforce.test.ts`, "every sheet and dialog can arrive and leave with motion": no bare `open` on anything but `Inspector`; no `key` that changes as the thing closes; no `role="dialog"` and no panel fixed over the page outside the kit. `overlay-allowed:` exempts a line.
2. `packages/ui/src/presence.test.tsx`: a sheet and a dialog born open are drawn a frame later; `Closing` keeps its subject while it shuts; `Appear` carries both styles.
3. `e2e/test.ts`: every spec imports `test` from it. A script in every page watches each `[role="dialog"]` and `[data-drawer]` that is added or removed, and the test fails if one arrived without its starting style or left without its ending one. Leaving by going to another page, and a window made narrower, are not closings. Nothing is asked under reduced motion. A spec does nothing to get this, so a drawer added later is held to it by whichever spec opens it.

**Findings.**

- The browser fixture found what the static rule could not: the new-schedule sheet was kept on the page but given `key={String(open)}`, so closing it made a new one, shut, and the open one went in a frame. The static rule now names that too.
- The fixture's first form looked for the starting style when it was told a panel had arrived. The docked inspector measures itself and leaves its starting style before the browser tells anyone, so the fixture also listens for the attribute changing.
- A dialog that closes with motion is on the page a quarter of a second longer. One browser test pressed a "Done" behind it too soon and now waits.
- **Not done:** the flow editor's test panel. It is a split of the editor's own area and not a panel over it; opening it moves the canvas into a new parent, and animating that means rebuilding how the editor is laid out. It still appears at once.

## M2: what is moved by a button or a key is seen to move

**Built.**

- `useFlip` (`packages/ui/src/useFlip.ts`): give its ref to what holds the things and each thing a `data-flip-key`. When the order changes, each is played from where it was to where it is over `motion-base`, with the browser's own `animate`. Places are measured from the holder, so scrolling between draws moves nothing. Nothing plays under reduced motion or while a pointer drags.
- `MoveButtons` (`packages/ui/src/MoveButtons.tsx`): the one pair of buttons, up and down for a list, earlier and later along a row. They say where the thing went.
- `useKeys`: a name for each place in a list whose items have none, which stays with the item as it moves. The cases of a branch, a form's questions and a `SchemaForm` list were keyed by position, so React rewrote each row in place and nothing moved; now the row itself moves and what is being typed keeps focus.
- Used by the columns dialog (buttons and the handle's arrow keys; a drag pauses it), an enum's values, a branch's cases, a form trigger's questions, an app widget's fields, `SchemaForm` lists, and the dashboard's widgets (buttons only; M4 replaces them with dragging).

**Tests.** `useFlip.test.tsx` (what moved is played from where it was, what did not is not; reduced motion and a drag play nothing; `useKeys`). `enforce.test.ts`, "every move by a button or a key is animated by the shared pieces": no move buttons outside `MoveButtons`, and a file that moves things from the arrow keys uses `useFlip` or the shared placement; `move-allowed:` exempts an arrow that moves nothing. `e2e/columns.spec.ts` reads the column's transform frame by frame while its button moves it.

**Findings.**

- Three lists' buttons said "Up" and "Down" or "Move up" and "Move down" in words. They are the icon buttons now, named the same for a screen reader.
- **Not yet:** an app page's widgets moved with the arrow keys (`packages/screens/src/Renderer.tsx`). They come with M4, when that code becomes the shared placement.
