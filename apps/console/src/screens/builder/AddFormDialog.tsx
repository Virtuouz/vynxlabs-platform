import {
  Button,
  CheckboxField,
  Dialog,
  MoveButtons,
  SegmentedControl,
  SelectField,
  TextField,
  useFlip,
} from "@volvel/ui";
import { useEffect, useState } from "react";
import { type Catalog, heading } from "../../kit/inspector/model.ts";
import {
  askable,
  controlWords,
  defaultPlan,
  type FormPlan,
  manyOf,
  oneOf,
  type TableInfo,
} from "./records.ts";
import { useTableInfo } from "./SampleRecord.tsx";

/**
 * "Add a form" (board 5): what it does, which table, which fields, where it
 * opens, and what happens after saving. A form is made from a table: each
 * field's control is picked from its column's type, and the columns the
 * platform sets (id, created and updated) are never asked.
 */
export function AddFormDialog({
  open,
  onClose,
  root,
  catalog,
  initialTable,
  takenTitles = [],
  onMake,
}: {
  open: boolean;
  onClose: () => void;
  root: string;
  catalog: Catalog;
  /** The table the page shows, when it shows one. */
  initialTable: string | undefined;
  /** The titles of the app's pages: a modal named as one of them is said to be so. */
  takenTitles?: string[];
  onMake: (plan: FormPlan) => void;
}) {
  const [table, setTable] = useState(initialTable ?? catalog.tables[0]?.name);
  const [mode, setMode] = useState<"create" | "edit">("create");
  useEffect(() => {
    if (open) setTable(initialTable ?? catalog.tables[0]?.name);
  }, [open, initialTable, catalog.tables]);
  const info = useTableInfo(root, table);
  return (
    <Dialog open={open} onClose={onClose} title="Add a form" size="wide">
      <div className="flex flex-col gap-4">
        <SegmentedControl
          label="What should this form do?"
          value={mode}
          onChange={setMode}
          options={[
            { value: "create", label: "Create a record" },
            { value: "edit", label: "Edit a record" },
          ]}
        />
        <p className="m-0 text-body-sm text-ink-muted">
          {mode === "create"
            ? `Adds a new ${table ? oneOf(table).toLowerCase() : "record"}.`
            : `Changes the ${table ? oneOf(table).toLowerCase() : "record"} that is open.`}
        </p>
        <SelectField
          label="Table"
          name="form-table"
          value={table ?? ""}
          options={catalog.tables.map((one) => ({ value: one.name, label: heading(one.name) }))}
          onChange={setTable}
        />
        {info ? (
          <Plan
            key={`${info.name}:${mode}`}
            info={info}
            mode={mode}
            takenTitles={takenTitles}
            onClose={onClose}
            onMake={onMake}
          />
        ) : (
          <p className="m-0 text-body-sm text-ink-muted">Reading the table…</p>
        )}
      </div>
    </Dialog>
  );
}

function Plan({
  info,
  mode,
  takenTitles,
  onClose,
  onMake,
}: {
  info: TableInfo;
  mode: "create" | "edit";
  takenTitles: string[];
  onClose: () => void;
  onMake: (plan: FormPlan) => void;
}) {
  const [plan, setPlan] = useState<FormPlan>(() => defaultPlan(info, mode));
  const columns = askable(info);
  // The chosen fields come first, in their order; the rest follow, unchecked.
  const ordered = [
    ...plan.fields.flatMap((name) => columns.filter((column) => column.name === name)),
    ...columns.filter((column) => !plan.fields.includes(column.name)),
  ];
  const flip = useFlip<HTMLUListElement>(plan.fields.join(","));
  const move = (name: string, by: -1 | 1) => {
    const at = plan.fields.indexOf(name);
    const to = at + by;
    if (at < 0 || to < 0 || to >= plan.fields.length) return;
    const next = [...plan.fields];
    next.splice(to, 0, ...next.splice(at, 1));
    setPlan({ ...plan, fields: next });
  };
  const noun = oneOf(info.name).toLowerCase();
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1 text-body-sm font-medium text-ink">Fields</legend>
        <ul ref={flip} className="m-0 flex list-none flex-col p-0">
          {ordered.map((column) => {
            const on = plan.fields.includes(column.name);
            const at = plan.fields.indexOf(column.name);
            return (
              <li
                key={column.name}
                data-flip-key={column.name}
                className="flex items-center justify-between gap-3 py-1"
              >
                <CheckboxField
                  label={heading(column.name)}
                  name={`field-${column.name}`}
                  checked={on}
                  onChange={(checked) =>
                    setPlan({
                      ...plan,
                      fields: checked
                        ? [...plan.fields, column.name]
                        : plan.fields.filter((one) => one !== column.name),
                    })
                  }
                />
                <span className="flex items-center gap-2 text-body-sm text-ink-muted">
                  {controlWords(column)}
                  {column.required ? <span className="text-ink-subtle">required</span> : null}
                  {on ? (
                    <MoveButtons
                      label={heading(column.name)}
                      at={at}
                      count={plan.fields.length}
                      onMove={(by) => move(column.name, by)}
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
          <li className="py-1 text-body-sm text-ink-muted">
            Set automatically: id, created and updated.
          </li>
        </ul>
        <p className="m-0 text-body-sm text-ink-muted">
          The right control for each column is picked from its type. Required marks and checks come
          from the table.
        </p>
      </fieldset>
      <SegmentedControl
        label="Opens as"
        value={plan.where}
        onChange={(where) => setPlan({ ...plan, where })}
        options={[
          { value: "modal", label: `Modal “${plan.title}”` },
          { value: "page", label: "On this page" },
        ]}
      />
      <TextField
        label={plan.where === "modal" ? "Title of the modal and its button" : "Title"}
        name="form-title"
        value={plan.title}
        maxLength={60}
        required
        {...(plan.where === "modal" &&
        takenTitles.some((one) => one.trim().toLowerCase() === plan.title.trim().toLowerCase())
          ? {
              hint: `A page of this app is already called “${plan.title.trim()}”. Another would have the same name in the pages list.`,
            }
          : {})}
        onChange={(title) => setPlan({ ...plan, title })}
      />
      <TextField
        label={`After saving: ${plan.where === "modal" ? "close and say" : "say"}`}
        name="form-message"
        value={plan.message}
        maxLength={200}
        required={false}
        onChange={(message) => setPlan({ ...plan, message })}
      />
      <section
        aria-label="Preview"
        className="flex flex-col gap-2 rounded-panel border border-line p-4"
      >
        <h3 className="m-0 text-label text-ink-subtle uppercase">Preview</h3>
        <p className="m-0 font-medium text-ink">{plan.title}</p>
        {plan.fields.length === 0 ? (
          <p className="m-0 text-body-sm text-ink-muted">Choose at least one field.</p>
        ) : (
          plan.fields.map((name) => {
            const column = info.columns.find((one) => one.name === name);
            return column ? (
              <div key={name} className="flex flex-col gap-0.5">
                <span className="text-body-sm text-ink">
                  {heading(name)}
                  {column.required ? <span className="text-danger"> *</span> : null}
                </span>
                <span className="rounded-control border border-line px-2 py-1 text-body-sm text-ink-muted">
                  {controlWords(column)}
                </span>
              </div>
            ) : null;
          })
        )}
        <div className="flex justify-end gap-2">
          <span className="text-body-sm text-ink-muted">Cancel</span>
          <span className="text-body-sm font-medium text-action">
            {mode === "create" ? `Create ${noun}` : "Save"}
          </span>
        </div>
      </section>
      {plan.where === "modal" ? (
        <p className="m-0 text-body-sm text-ink-muted">
          Also adds a “{plan.title}” button
          {mode === "edit"
            ? " to a page that is open on a record"
            : ` to the ${manyOf(info.name)} page`}
          .
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={plan.fields.length === 0 || plan.title.trim() === ""}
          onClick={() => onMake({ ...plan, title: plan.title.trim() })}
        >
          Create form
        </Button>
      </div>
    </div>
  );
}
