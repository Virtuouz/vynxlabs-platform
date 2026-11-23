# p31-cols

Fault: at 390 px a table's Definition tab hid the Rules and "When not given" columns, and the "Actions for <column>" menu sat past the right edge.

Fix: the Columns table is now `ColumnsTable` (apps/console/src/screens/Data.tsx, before `Definition`), using `useWide(640)` as `ListCollection` does. Under 640 px the rules, the default ("When not given: ...") and the actions menu stand under the column's name; from 640 up the columns and the button column are as before. `Definition` calls it with `columnActions` when editable.

Tests: apps/console/src/screens/columns-table.test.tsx (phone stacks and has no actions column; tablet keeps columns). e2e/polish-layout.spec.ts "a table's definition shows each column's rules and actions at first view at 390 px" (written, not run: no e2e allowed in the lane). The unit test could not fail before the fix as written (the piece did not exist); the phone case fails on the old markup, which had no `data-column-stack`.

Siblings: "Retired columns" table (3 columns, no hidden ones, actions in the last column) left as is; ListCollection already does this. Other DataTable callers with `priority` columns hiding data on a phone were not audited.

Walk: a table's Definition tab at 390/768/1440, light and dark, keyboard (the menu opens by Enter), reload. Not walked here.

Docs: tutorial your-first-table steps 5-6 may now be followed on a phone: Rules and When not given are under each name, the menu under that.
