# fix-limits

## w-limits 1: a limit is said at the field and refused, never cut silently
- Commit: "Phase 29: a field's length limit is said at the field and refused, not cut (w-limits 1, 2)".
- `packages/ui/src/Fields.tsx` `lengthLimit()`, used by `TextField` and `TextAreaField`: the native `maxLength` is no longer set on the box. A count ("9 of 10") shows from 80% of the limit (always with `showCount`); past the limit the field's error says "Use at most 10 characters. This is 14." (a caller's own error wins). What is typed or pasted is kept whole.
- Tests: `packages/ui/src/Fields.test.tsx` "w-limits 1" (two). Old assertions of the native attribute changed to its absence in `Dashboards.test.tsx`, `Interfaces.test.tsx` (2), `page-settings.test.tsx`, `builder-composition.test.tsx`.
- Callers (POLISH-013), all through the shared fields now: `Form.tsx`, `SchemaForm.tsx`, `kit/inspector/controls.tsx` (they pass the schema's limit), and every `TextField`/`TextAreaField` with `maxLength` in ResourceIdentity, Interfaces, Dashboards, FlowEditor, AddFormDialog, Environments, ScheduleForm, Account, Authoring, ResourceEditor, SingleSignOn, NewPageDialog, PageSettings, docs/PageDetails, docs/Docs, docs/DocEditor, and the inspector (tabsDrawer, ColumnEditor, fieldsList, LayoutPanel, tabsControl, filtersControl, filterDrawer, approvalsDrawer, buttonDrawer, actionControls, formDrawer, textDrawer, tableDrawer, heading).
- A person sees: a long paste stays in the box, with the count and a plain line over it, instead of losing its tail.
- Left out: a caller's Save is not blocked by the field alone; the server still refuses an over-long value (Form and SchemaForm already refuse on submit).

## w-limits 2: the add-row dialog says a required column is required
- `apps/console/src/screens/Data.tsx` `AddRow`: text, number, date and json fields and the enum select take `required={column.required}` (the row's `required` already means "needs a value", a column with a default being not required). The label shows the asterisk, not "optional". The form is `noValidate`; an empty required value is refused at its field: "number needs a value." Test: `Data.test.tsx` "w-limits 2"; the add-row test now expects that line.
- Siblings: `BooleanField`, `ReferenceField` (combobox) are unchanged: their option text already says "Choose" for required.

## Finished from Found
- `LimitNote` and `pastLimit` in `packages/ui/src/Fields.tsx` (exported): the count and the refusal for a box that is not a `TextField`. The raw inputs lost their native `maxLength`: `builder/BuilderHeader.tsx` (RenameField; Enter keeps it open past 100), `packages/screens/src/Frame.tsx` (widget title), `docs/Docs.tsx` (title and file name; submit refuses), `docs/DocEditor.tsx` (page title), `kit/inspector/heading.tsx`. The other files listed (AddFormDialog, NewPageDialog, FlowEditor, Environments) only hold shared fields. Test: `builder-frame.test.tsx` (101 characters kept, said, not saved).
- Add-row boolean and reference fields take `required` and are refused empty ("paid needs a value."). Test: `Data.test.tsx` second "w-limits 2".
- `actions.test.tsx` and `core-actions.test.tsx` (packages/screens, busy button) fail in this worktree for a reason outside this lane.

## Polish gate
States: over-limit error and count. Keyboard: unchanged, error is a role=alert. Copy: plain. Screens to walk: Data Add row (required marks, empty submit, 390 px), any name field with a 101-character paste.
