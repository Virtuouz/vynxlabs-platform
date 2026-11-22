import { Button, CheckboxField, Dialog, MoveButtons, SelectField, TextField } from "@volvel/ui";
import type { RecordData } from "@volvel/widgets";
import { ClipboardList, GripVertical, Pencil, Plus, Table } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type Catalog, heading } from "../../kit/inspector/model.ts";
import {
  askable,
  controlWords,
  defaultPlan,
  formWidget,
  type FormPlan,
  isSystem,
  manyOf,
  oneOf,
  type TableInfo,
} from "./records.ts";
import { corePack } from "./renderer.ts";
import { useTableInfo } from "./SampleRecord.tsx";

/** The two things a form can do, as the cards say them. */
const MODES = [
  { value: "create", title: "Create a record", icon: Plus },
  { value: "edit", title: "Edit a record", icon: Pencil },
] as const;

/**
 * "Add a form" (board 5): what it does, which table, which fields, where it opens,
 * and what happens after saving, in two columns; the right one draws the form as it
 * will be, from the same view the page uses, as the fields are chosen. A form is made
 * from a table: each field's control is picked from its column's type, and the columns
 * the platform sets (id, created and updated) are never asked. At a narrow width the
 * preview goes below.
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
  const [edited, setEdited] = useState<FormPlan>();
  useEffect(() => {
    if (open) {
      setTable(initialTable ?? catalog.tables[0]?.name);
      setEdited(undefined);
    }
  }, [open, initialTable, catalog.tables]);
  const info = useTableInfo(root, table);
  // What was changed holds while the table and what the form does are as they were; else the defaults of the new ones.
  const plan: FormPlan | undefined =
    edited && info && edited.table.name === info.name && edited.mode === mode
      ? edited
      : info
        ? defaultPlan(info, mode)
        : undefined;
  const noun = plan ? oneOf(plan.table.name).toLowerCase() : "record";
  const taken =
    plan?.where === "modal" &&
    takenTitles.some((one) => one.trim().toLowerCase() === plan.title.trim().toLowerCase());
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a form"
      size="wide"
      width={1040}
      icon={<ClipboardList size={16} />}
      footer={
        <>
          <p className="m-0 mr-auto min-w-0 text-body-sm text-ink-muted">
            {plan?.where === "modal" ? (
              <>
                Also adds a “{plan.title}” button
                {mode === "edit"
                  ? " to a page that is open on a record"
                  : ` to the ${table ? manyOf(table) : ""} table`}
                .
              </>
            ) : null}
          </p>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!plan || plan.fields.length === 0 || plan.title.trim() === ""}
            onClick={() => plan && onMake({ ...plan, title: plan.title.trim() })}
          >
            Create form
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-body-sm font-medium text-ink">
              What should this form do?
            </legend>
            <div role="radiogroup" aria-label="What should this form do?" className="grid grid-cols-2 gap-2">
              {MODES.map(({ value, title, icon: Icon }) => (
                // biome-ignore lint/a11y/useSemanticElements: a card chosen by looking at it
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 text-left ${
                    mode === value
                      ? "border-action bg-action-soft"
                      : "border-line bg-surface hover:border-line-strong"
                  }`}
                >
                  <Icon
                    aria-hidden="true"
                    size={16}
                    className={`mt-0.5 shrink-0 ${mode === value ? "text-action" : "text-ink-muted"}`}
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-ink">{title}</span>
                    <span className="text-body-sm text-ink-muted">
                      {value === "create"
                        ? `Adds a new ${noun}`
                        : `Changes the ${noun} that is open`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex items-end gap-2">
            <span
              aria-hidden="true"
              className="mb-px flex size-9 shrink-0 items-center justify-center rounded-control border border-line text-ink-muted"
            >
              <Table size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <SelectField
                label="Table"
                name="form-table"
                value={table ?? ""}
                options={catalog.tables.map((one) => ({
                  value: one.name,
                  label: heading(one.name),
                }))}
                onChange={setTable}
              />
            </div>
          </div>
          {plan && info ? (
            <>
              <Fields info={info} plan={plan} onChange={setEdited} />
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Opens as"
                  name="form-where"
                  value={plan.where}
                  options={[
                    { value: "modal", label: `Modal: “${plan.title}”` },
                    { value: "page", label: "On this page" },
                  ]}
                  onChange={(where) => setEdited({ ...plan, where: where === "page" ? "page" : "modal" })}
                />
                <SelectField
                  label="After saving"
                  name="form-after"
                  value={plan.message.trim() === "" ? "nothing" : "say"}
                  options={[
                    {
                      value: "say",
                      label: `${plan.where === "modal" ? "Close and say" : "Say"} “${
                        plan.message.trim() || `${oneOf(info.name)} ${mode === "create" ? "created" : "saved"}`
                      }”`,
                    },
                    { value: "nothing", label: plan.where === "modal" ? "Just close" : "Say nothing" },
                  ]}
                  onChange={(value) =>
                    setEdited({
                      ...plan,
                      message:
                        value === "nothing"
                          ? ""
                          : defaultPlan(info, mode).message,
                    })
                  }
                />
              </div>
              <TextField
                label={plan.where === "modal" ? "Title of the modal and its button" : "Title"}
                name="form-title"
                value={plan.title}
                maxLength={60}
                required
                {...(taken
                  ? {
                      hint: `A page of this app is already called “${plan.title.trim()}”. Another would have the same name in the pages list.`,
                    }
                  : {})}
                onChange={(title) => setEdited({ ...plan, title })}
              />
              {plan.message.trim() !== "" ? (
                <TextField
                  label="Message after saving"
                  name="form-message"
                  value={plan.message}
                  maxLength={200}
                  required={false}
                  onChange={(message) => setEdited({ ...plan, message })}
                />
              ) : null}
            </>
          ) : (
            <p className="m-0 text-body-sm text-ink-muted">Reading the table…</p>
          )}
        </div>
        <FormPreview info={info} plan={plan} />
      </div>
    </Dialog>
  );
}

/** The fields: a handle, a checkbox, the column, and the control it is drawn with. Dragging, or the buttons, changes the order. */
function Fields({
  info,
  plan,
  onChange,
}: {
  info: TableInfo;
  plan: FormPlan;
  onChange: (plan: FormPlan) => void;
}) {
  const columns = askable(info);
  // The chosen fields come first, in their order; the rest follow, unchecked.
  const ordered = [
    ...plan.fields.flatMap((name) => columns.filter((column) => column.name === name)),
    ...columns.filter((column) => !plan.fields.includes(column.name)),
  ];
  const automatic = info.columns.filter((column) => isSystem(column.name));
  const [dragging, setDragging] = useState<string>();
  const place = (name: string, to: number) => {
    const at = plan.fields.indexOf(name);
    if (at < 0 || to < 0 || to >= plan.fields.length || at === to) return;
    const next = [...plan.fields];
    next.splice(to, 0, ...next.splice(at, 1));
    onChange({ ...plan, fields: next });
  };
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-body-sm font-medium text-ink">Fields</legend>
      <ul className="m-0 flex list-none flex-col rounded-control border border-line p-1">
        {ordered.map((column) => {
          const on = plan.fields.includes(column.name);
          const at = plan.fields.indexOf(column.name);
          return (
            <li
              key={column.name}
              data-field={column.name}
              draggable={on}
              onDragStart={() => setDragging(column.name)}
              onDragEnd={() => setDragging(undefined)}
              onDragOver={(event) => {
                if (dragging && on) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging && on) place(dragging, at);
                setDragging(undefined);
              }}
              className={`flex items-center gap-2 rounded-control px-1.5 py-1 ${
                dragging === column.name ? "opacity-50" : ""
              }`}
            >
              <GripVertical
                aria-hidden="true"
                size={14}
                className={`shrink-0 ${on ? "cursor-grab text-ink-subtle" : "text-line"}`}
              />
              <CheckboxField
                label={heading(column.name)}
                name={`field-${column.name}`}
                checked={on}
                onChange={(checked) =>
                  onChange({
                    ...plan,
                    fields: checked
                      ? [...plan.fields, column.name]
                      : plan.fields.filter((one) => one !== column.name),
                  })
                }
              />
              <span className="ml-auto flex shrink-0 items-center gap-2 text-body-sm text-ink-muted">
                {controlWords(column)}
                {column.required ? <span className="text-ink-subtle">required</span> : null}
                {on ? (
                  <MoveButtons
                    label={heading(column.name)}
                    at={at}
                    count={plan.fields.length}
                    onMove={(by) => place(column.name, at + by)}
                  />
                ) : null}
              </span>
            </li>
          );
        })}
        {automatic.map((column) => (
          <li
            key={column.name}
            className="flex items-center gap-2 px-1.5 py-1 text-ink-subtle"
          >
            <GripVertical aria-hidden="true" size={14} className="shrink-0 text-line" />
            <input type="checkbox" disabled aria-label={heading(column.name)} className="size-4" />
            <span className="text-body-sm">{heading(column.name)}</span>
            <span className="ml-auto text-body-sm">Set automatically</span>
          </li>
        ))}
        {automatic.length === 0 ? (
          <li className="px-1.5 py-1 text-body-sm text-ink-subtle">
            Set automatically: id, created and updated.
          </li>
        ) : null}
      </ul>
      <p className="m-0 text-meta text-ink-muted">
        Drag to change the order. The right control for each column is picked from its type.
      </p>
    </fieldset>
  );
}

/** The form as it will be drawn, by the view the page uses, from the fields chosen. */
function FormPreview({ info, plan }: { info: TableInfo | undefined; plan: FormPlan | undefined }) {
  const View = corePack.views["core/form"];
  let body: ReactNode = <p className="m-0 text-body-sm text-ink-muted">Reading the table…</p>;
  if (info && plan && View) {
    if (plan.fields.length === 0) {
      body = <p className="m-0 text-body-sm text-ink-muted">Choose at least one field.</p>;
    } else {
      const widget = formWidget(plan, "preview", { x: 0, y: 0, w: 12, h: 10 });
      const record: RecordData = {
        shape: "record",
        record: null,
        columns: info.columns.map((column) => ({
          name: column.name,
          label: heading(column.name),
          type: column.type,
          ...(column.required ? { required: true } : {}),
          ...(column.references ? { references: column.references } : {}),
          ...(column.type === "enum"
            ? { values: column.values.map((value) => ({ value })) }
            : {}),
        })),
      };
      body = (
        <div className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4">
          <h4 className="m-0 text-title font-semibold text-ink">{plan.title}</h4>
          <View
            config={widget.config}
            data={{ record }}
            size={{ w: 12, h: 10, narrow: true }}
            emit={() => undefined}
            building
            choices={async () => []}
          />
        </div>
      );
    }
  }
  return (
    <section aria-label="Preview" className="flex min-w-0 flex-col gap-3 md:border-l md:border-line md:pl-6">
      <h3 className="m-0 text-label text-ink-subtle uppercase">Preview</h3>
      <div inert className="pointer-events-none">
        {body}
      </div>
      <p className="m-0 text-body-sm text-ink-muted">
        Required marks and checks come from the table. Labels, help text and sections can be
        changed after.
      </p>
    </section>
  );
}
