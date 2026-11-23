# Fixed: lane sweep-build (missing parts built: joins, chart axes and sort, manual start fields)

No migration, no contract change. Every test was seen failing before its change. No browser walk (the integrator walks).

## WID-M10 visual query `joins`
- Tests: `rows-it-uses.test.tsx` three "WID-M10". **Changed:** `model.ts` `columnsNamed(catalog, table, joins)` (joined columns are `via.column`), `followable`, `MAX_JOINS`; `queryParts.tsx` `columnsOf` and `controls.tsx` `columnOptions` pass `joins`, so every control that lists columns (Only include, Sorted by, breakdown, measures, search columns) offers them; `rowsItUses.tsx` `AlsoFrom` (a chip for each table the chosen one points to, up to six; "Columns from X" chips write `columns`; switching one off removes its columns, conditions and sort; disabled while a Breakdown or Values uses it, and says so); `packages/ui` `CheckChip` takes `disabled`.
- Siblings (POLISH-013): `RowsItUses` is the one piece every visual source uses (`dataControls.tsx` generic Data tab; table, list, stat, form, detail through it). Chart, stat, goal, pivot draw their own Data sections that hide `RowsItUses`; they get joined columns through `columnsOf`, but have no "Also from" row (left: say if wanted). Table widget's own column list (`tableData.ts`) still reads the table only; a joined column is shown as `customer_city`.
- Screens: any table or list widget on a table with a reference column: Data tab, Also from, at 390 px, keyboard (chips are buttons), reload.

## WID-M6 rest: chart x, y, sort
- Tests: `charts.test.tsx` two "WID-M6". **Changed:** `chartDrawer.tsx` `AxisRows` ("Along the bottom", "Up the side", when there are two or more to choose; writes `config.x`, `config.y`; the chart already drew them, `chartSpec.ts:262`) and a "Sorted by" row in the Order group (`SortRow`, now exported from `rowsItUses.tsx`). The chart keeps the query's row order (`sort: null`), so the sort is drawn. Left: "Bars in order" still wins over a sort when set.
- Screens: chart drawer, Data tab Order group; Display tab Look group with two breakdowns and two measures.

## Manual start input as fields
- Tests: `FlowEditorWalk.test.tsx` "a manual start's input is a form of fields ..." and "a schema the form cannot show ...". **Changed:** new `screens/inputSchema.ts` (`fieldsOf`, `schemaOf`, `problemsOf`); `FlowStepFields.tsx` `InputSchemaField` now draws `SchemaFields` above the JSON box: name, type (text, number, whole number, yes or no), required, description, shortest/longest or smallest/largest, remove, "Add a field". Form writes the JSON box; typing JSON updates the form; invalid JSON disables the form and says so; a schema with anything else (oneOf, enum, pattern, nested) shows "The form cannot show this schema. <why> Edit the JSON below." and keeps the box.
- Siblings: `InputSchemaField` is only drawn by `FlowEditor.tsx`. Other JSON-schema boxes: `Authoring.tsx:197` (a script's input schema, in a code file's settings) and `ResourceEditor.tsx:611` (an event's payload) are not changed; they could take `SchemaFields` if wanted.
- Gate: states empty/invalid/unshowable done; keyboard by native fields; copy plain. Screens: flow editor, manual start, at 390 px.
