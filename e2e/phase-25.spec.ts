import { test } from "./test.ts";

/**
 * Phase 25, to be walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * on a throwaway instance. Each test is one item of the exit criterion in
 * docs/phases/phase-25-one-widget-system.md, titled with the POLISH rule
 * (docs/polish/polish-prevention-rules.md) it checks.
 *
 * This is a skeleton: each test is `fixme` until the console's page editor (stream C) and the
 * renderer (stream B) are merged, and its steps are written as comments, in the words of the
 * drawings. The integrator fills in the selectors from the built screens, and takes `fixme` off.
 *
 * Shared set-up, to write once in `beforeAll`:
 * - sign in as Maya Brooks (the owner) on Fernhill's `clinics` workspace, as phase-24.spec.ts does;
 * - the app is "Clinic performance" (`screens/performance`), its Money page; the dashboard is
 *   "Visits by clinic" (`boards/clinic-visits`) in the sandbox, or the dev workspace's own;
 * - under names of the walk's own (`p25-<stamp>`) for anything it writes, and removed in `afterAll`.
 *
 * Not walked here, and why: records, forms and buttons (phases 26 and 27); a widget packaged and run
 * from another developer's code (decision 0005 designs it, and does not build it).
 */

test.describe.configure({ mode: "serial" });

test.fixme("POLISH-002: Invoiced by week is made a line of the sum of Total by week, in five choices, in the Data and Display tabs", async () => {
  // - open the app builder, Clinic performance, the Money page, and click the "Invoiced by week" widget;
  // - the inspector shows its tabs: Data, Display, and (no count) Actions and Rules, hidden when empty;
  // - Data: Source is Invoices; Value is "Sum of Total"; Break down by is "Issued on · Weekly";
  //   Display: Chart type is "Line". That is five choices in all;
  // - the inspector is not scrolled for any of them, at 1440×900 and at 1440×640;
  // - the same inspector, with the same words, opens for a chart on the dashboards screen (POLISH-002).
});

test.fixme("POLISH-003: Average invoice is changed to the average of Total, and Unpaid to a count where Status is Unpaid", async () => {
  // - select "Average invoice": Data, Value, choose "Average of Total"; the number on the page changes;
  // - select "Unpaid": Data, Value, choose "Count"; Only include: Status is Unpaid (already there);
  //   the number is now a count of invoices, not dollars; "Numbers look like" under Display is a plain number;
  // - Undo puts each back; reload keeps what was saved as a draft.
});

test.fixme("POLISH-003: a widget's title is changed by clicking it, and a widget is moved, stretched, duplicated, removed and brought back", async () => {
  // - click the title "By clinic" on the page: it becomes a field; type "Invoiced by clinic"; Enter;
  // - select the widget: a chip says its size and place, "4 × 8 · col 9 · row 6";
  // - drag it, and stretch it by its corner: the chip follows, and says "8 × 5 · col 1 · row 3";
  // - from the keyboard: arrows move it a cell, Shift+arrows size it, and the move is announced in a status region;
  // - Esc deselects; Cmd or Ctrl+D duplicates it; Delete removes it; Undo brings it back with what it asked;
  // - a widget cannot be made smaller than its definition's minimum (POLISH-007: all by keyboard, axe clean).
});

test.fixme("POLISH-011: a Text widget is added from Add to page and written in Markdown with an alert and steps", async () => {
  // - Add to page, category Content, "Text": it is placed at the end of the page;
  // - Display: the Text control is a Markdown editor with a preview and the components it may use;
  // - write an alert (:::alert[In dollars]{type=info} ... :::) and numbered steps; the page shows both drawn
  //   as the documentation draws them, in light and in dark;
  // - an unknown component is said, in words, and not drawn as raw text.
});

test.fixme("POLISH-002: the labs Goal widget is added from Add to page, set to Invoiced this month of $60,000, and configured in the same inspector", async () => {
  // - Add to page: "Goal" is listed under its category, with its pack's name ("labs") beside it;
  // - Data: Value is "Sum of Total" of Invoices; Display: Target 60,000 and "Numbers look like" Currency
  //   from cents (the same format control a Stat has); label "Invoiced this month";
  // - the widget draws progress toward $60,000 with its label; Fernhill's own Money page already has one;
  // - nothing in the inspector looks different from a core widget's (POLISH-002).
});

test.fixme("POLISH-002: on the dashboards screen, Clinic visits is changed in the same editor, and Add to page offers only widgets that read", async () => {
  // - Dashboards, "Visits by clinic", Edit: the same shell, inspector, canvas and keys as the app builder;
  // - Add to page lists Table, List, Stat, Chart, Pivot and Text, and nothing that writes or asks for input;
  // - add a Stat over a saved query or SQL (a dashboard may write SQL; an app's page may not);
  // - Done; the dashboard shows the new widget after a reload (POLISH-006).
});

test.fixme("POLISH-001: Clinic performance is published, and a front-desk end user and a manager see the rows their groups allow", async () => {
  // - Publish, and its dialog says what it will do; Publish again from there;
  // - as a front-desk end user (their clinic's group): Invoices, Visits and Stock show only that clinic's rows,
  //   the Clinic filter offers only their clinic, and the totals are theirs;
  // - as Maya or a practice manager: every clinic's rows;
  // - a widget over a table the viewer may not read draws the frame's "You can't see this" and not zero;
  // - an empty range ("Last 7 days" with nothing issued) is drawn as empty, and a failure as failed.
});

test.fixme("POLISH-005: the builder and the served app hold at 768 and 390 px, in light and dark, with a reload", async () => {
  // - the page editor at 768: the inspector is a sheet under the canvas; at 390: one column, widgets stacked
  //   in the order their definitions' phone layout says (a table as a list);
  // - nothing is found only in a hidden column; one scroller per region (POLISH-004);
  // - the served app at 390: the filter bar wraps, the Goal and the Stats are readable;
  // - reload keeps the selected page, the filters (in the address) and the draft (POLISH-006).
});
