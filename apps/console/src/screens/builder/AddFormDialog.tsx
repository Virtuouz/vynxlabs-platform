import {
  Button,
  CheckboxField,
  Dialog,
  LIFTED,
  MoveButtons,
  SelectField,
  TextField,
  useSortable,
} from "@volvel/ui";
import type { RecordData } from "@volvel/widgets";
import { ClipboardList, GripVertical, Pencil, Plus, Table } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type Catalog, heading } from "../../kit/inspector/model.ts";
import {
  askable,
  controlWords,
  defaultPlan,
  type FormPlan,
  formLine,
  formPlacement,
  formWidget,
  isSystem,
  oneOf,
  type PageContext,
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
  context,
  from,
  takenTitles = [],
  onMake,
}: {
  open: boolean;
  onClose: () => void;
  root: string;
  catalog: Catalog;
  /** The table the page shows, when it shows one. */
  initialTable: string | undefined;
  /** The page being built: where the form's button can go. */
  context: PageContext;
  /** The widget the form was added from, when it was a table: its button goes there first. */
  from?: string | undefined;
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
  const ready = plan !== undefined && plan.fields.length > 0 && plan.title.trim() !== "";
  const make = () => plan && ready && onMake({ ...plan, title: plan.title.trim() });
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
      width={902}
      icon={<ClipboardList size={16} />}
      footer={
        <>
          <p className="m-0 mr-auto min-w-0 text-body-sm text-ink-muted">
            {plan ? formLine(plan, formPlacement(context, plan, from)) : null}
          </p>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={make}>
            Create form
          </Button>
        </>
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Enter in a text box of the settings makes the form, as the button does */}
      <div
        className="grid gap-6 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.key !== "Enter" || event.defaultPrevented || target.tagName !== "INPUT") return;
          if ((target as HTMLInputElement).type !== "text") return;
          event.preventDefault();
          make();
        }}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-body-sm font-medium text-ink">
              What should this form do?
            </legend>
            <div
              role="radiogroup"
              aria-label="What should this form do?"
              className="grid grid-cols-2 gap-2"
            >
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
          <SelectField
            label="Table"
            name="form-table"
            icon={<Table size={16} />}
            value={table ?? ""}
            options={catalog.tables.map((one) => ({
              value: one.name,
              label: heading(one.name),
            }))}
            onChange={setTable}
          />
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
                  onChange={(where) =>
                    setEdited({ ...plan, where: where === "page" ? "page" : "modal" })
                  }
                />
                <SelectField
                  label="After saving"
                  name="form-after"
                  value={plan.message.trim() === "" ? "nothing" : "say"}
                  options={[
                    {
                      value: "say",
                      label: `${plan.where === "modal" ? "Close and say" : "Say"} “${
                        plan.message.trim() ||
                        `${oneOf(info.name)} ${mode === "create" ? "created" : "saved"}`
                      }”`,
                    },
                    {
                      value: "nothing",
                      label: plan.where === "modal" ? "Just close" : "Say nothing",
                    },
                  ]}
                  onChange={(value) =>
                    setEdited({
                      ...plan,
                      message: value === "nothing" ? "" : defaultPlan(info, mode).message,
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
  // Long text is last among them, as a form puts its free text at the end.
  const left = columns.filter((column) => !plan.fields.includes(column.name));
  const ordered = [
    ...plan.fields.flatMap((name) => columns.filter((column) => column.name === name)),
    ...left.filter((column) => column.type !== "long_text"),
    ...left.filter((column) => column.type === "long_text"),
  ];
  const automatic = info.columns.filter((column) => isSystem(column.name));
  const place = (name: string, to: number) => {
    const at = plan.fields.indexOf(name);
    if (at < 0 || to < 0 || to >= plan.fields.length || at === to) return;
    const next = [...plan.fields];
    next.splice(to, 0, ...next.splice(at, 1));
    onChange({ ...plan, fields: next });
  };
  const sort = useSortable({
    ids: plan.fields,
    nameOf: (name) => heading(name),
    onReorder: (fields) => onChange({ ...plan, fields }),
  });
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-body-sm font-medium text-ink">Fields</legend>
      <ul
        ref={sort.list}
        className="m-0 flex max-h-[min(19rem,34vh)] list-none flex-col overflow-y-auto rounded-control border border-line p-1"
      >
        {ordered.map((column) => {
          const on = plan.fields.includes(column.name);
          const at = plan.fields.indexOf(column.name);
          return (
            <li
              key={column.name}
              data-field={column.name}
              {...(on ? sort.row(column.name) : {})}
              onKeyDown={(event) => {
                if (on) sort.rowKeyDown(event, column.name);
              }}
              className={`group flex items-center gap-2 rounded-control px-1.5 py-1 ${LIFTED}`}
            >
              {on ? (
                <button
                  type="button"
                  {...sort.handle(column.name)}
                  aria-label={`Reorder ${heading(column.name)}. Alt and the up or down arrow move it.`}
                  className="grid size-5 shrink-0 cursor-grab place-items-center rounded-inner text-ink-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <GripVertical aria-hidden="true" size={14} />
                </button>
              ) : (
                <GripVertical aria-hidden="true" size={14} className="shrink-0 text-line" />
              )}
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
                {controlWords(column, plan.mode)}
                {on ? (
                  <span className="flex opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 pointer-coarse:opacity-100">
                    <MoveButtons
                      label={heading(column.name)}
                      at={at}
                      count={plan.fields.length}
                      onMove={(by) => place(column.name, at + by)}
                    />
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
        {automatic.map((column) => (
          <li key={column.name} className="flex items-center gap-2 px-1.5 py-1 text-ink-subtle">
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
      <span role="status" className="sr-only">
        {sort.said}
      </span>
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
        record: plan.mode === "edit" ? {} : null,
        columns: info.columns.map((column) => ({
          name: column.name,
          label: heading(column.name),
          type: column.type,
          ...(column.required ? { required: true } : {}),
          ...(column.default !== undefined ? { default: column.default } : {}),
          ...(column.references ? { references: column.references } : {}),
          ...(column.description ? { description: column.description } : {}),
          ...(column.type === "enum" ? { values: column.values.map((value) => ({ value })) } : {}),
        })),
      };
      body = (
        <div className="flex flex-col gap-2 rounded-panel border border-line bg-sunken p-4">
          <h4 className="m-0 text-title font-semibold text-ink">{plan.title}</h4>
          <View
            config={widget.config}
            data={{ record }}
            size={{ w: 12, h: 10, narrow: true }}
            emit={() => undefined}
            building={false}
            act={async () => ({ ok: true })}
            close={() => undefined}
            choices={async () => []}
          />
        </div>
      );
    }
  }
  return (
    <section
      aria-label="Preview"
      className="flex min-w-0 flex-col gap-3 md:border-l md:border-line md:pl-6"
    >
      <h3 className="m-0 text-label text-ink-subtle uppercase">Preview</h3>
      <div inert className="pointer-events-none">
        {body}
      </div>
      <p className="m-0 text-body-sm text-ink-muted">
        Required marks and checks come from the table. Labels, help text and sections can be changed
        after.
      </p>
    </section>
  );
}
