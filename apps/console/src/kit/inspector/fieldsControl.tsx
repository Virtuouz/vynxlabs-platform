/**
 * Two small controls: a page of the interface, chosen by name, and the fields of
 * a table as a list that can be dragged into order, each with its label, help,
 * section, "must be filled in" and "hidden" (a form's fields, a record detail's).
 * What a field offers follows what its widget's schema allows, so a pack's own
 * `fields` setting is drawn the same way.
 */
import {
  Button,
  CheckboxField,
  LIFTED,
  MoveButtons,
  SelectField,
  TextField,
  useSortable,
} from "@volvel/ui";
import { GripVertical } from "lucide-react";
import { moved } from "./actionModel.ts";
import { columnOptions, type Env } from "./controls.tsx";
import { type ConfigSetting, heading } from "./model.ts";

const KIND_WORDS = { record: "record page", sheet: "side sheet", modal: "dialog" } as const;

/** A page of the interface, chosen by name. */
export function PageControl({
  env,
  field,
  label,
  help,
  value,
  onChange,
}: {
  env: Env;
  field: string;
  label: string;
  help: string | undefined;
  value: string;
  onChange: (next: string) => void;
}) {
  const known = value === "" || env.pages.some((page) => page.id === value);
  return (
    <SelectField
      name={field}
      label={label}
      hint={
        env.pages.length === 0 ? "This interface has no pages to choose from yet." : (help ?? "")
      }
      value={value}
      options={[
        { value: "", label: "Not chosen" },
        ...(known ? [] : [{ value, label: value }]),
        ...env.pages.map((page) => ({
          value: page.id,
          label: `${page.title}${page.kind && page.kind !== "page" ? ` (${KIND_WORDS[page.kind]})` : ""}`,
        })),
      ]}
      onChange={onChange}
    />
  );
}

export interface FieldSetting {
  column: string;
  label?: string;
  help?: string;
  section?: string;
  required?: boolean;
  hidden?: boolean;
  [more: string]: unknown;
}

const KEPT = new Set(["id", "created_at", "updated_at"]);

/** The fields of a table, in order, each with its words. */
export function FieldsControl({
  env,
  field,
  setting,
  value,
  onChange,
}: {
  env: Env;
  field: string;
  setting: ConfigSetting;
  value: FieldSetting[] | undefined;
  onChange: (next: FieldSetting[] | undefined) => void;
}) {
  const props = ((setting.schema.items ?? {}) as { properties?: Record<string, unknown> })
    .properties;
  const can = (name: string) => Boolean(props && name in props);
  // A form never offers the columns the platform keeps; a detail may show them.
  const options = columnOptions(env, setting.hint.of).filter(
    (one) => can("hidden") || !KEPT.has(one.value),
  );
  const rows: FieldSetting[] = value?.length
    ? value
    : options.map((one) => ({ column: one.value }));
  // The grip drags; the arrows and Alt+Up/Down move one place: all slide (useSortable).
  const sort = useSortable({
    ids: rows.map((one) => one.column),
    nameOf: (column) => heading(column),
    onReorder: (ids) => {
      const by = new Map(rows.map((row) => [row.column, row]));
      onChange(ids.flatMap((id) => (by.has(id) ? [by.get(id) as FieldSetting] : [])));
    },
  });
  const change = (at: number, patch: Partial<FieldSetting>) => {
    onChange(
      rows.map((row, index) => {
        if (index !== at) return row;
        const merged = { ...row, ...patch };
        for (const key of ["label", "help", "section"] as const)
          if (!merged[key]) delete merged[key];
        for (const key of ["required", "hidden"] as const) if (!merged[key]) delete merged[key];
        return merged;
      }),
    );
  };
  const left = options.filter((one) => !rows.some((row) => row.column === one.value));
  const hiddenCount = rows.filter((row) => row.hidden).length;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium text-ink">{setting.hint.label}</legend>
      {setting.hint.help ? (
        <p className="m-0 text-body-sm text-ink-muted">{setting.hint.help}</p>
      ) : null}
      <ul ref={sort.list} className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row, at) => (
          <li
            key={row.column}
            {...sort.row(row.column)}
            className={`flex flex-col gap-2 rounded-control border border-line bg-surface p-2 ${LIFTED}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-body-sm font-medium text-ink">
                <button
                  type="button"
                  {...sort.handle(row.column)}
                  aria-label={`Reorder ${heading(row.column)}. Alt and the up or down arrow move it.`}
                  className="grid size-6 shrink-0 cursor-grab place-items-center rounded-inner text-ink-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <GripVertical aria-hidden="true" size={14} />
                </button>
                <span className="truncate">{heading(row.column)}</span>
              </span>
              <MoveButtons
                label={heading(row.column)}
                at={at}
                count={rows.length}
                onMove={(by) => onChange(moved(rows, at, at + by))}
              />
            </div>
            {can("label") ? (
              <TextField
                name={`${field}-${row.column}-label`}
                label={`Label of ${heading(row.column)}`}
                labelHidden
                placeholder={heading(row.column)}
                required={false}
                value={row.label ?? ""}
                onChange={(label) => change(at, { label })}
              />
            ) : null}
            {can("help") ? (
              <TextField
                name={`${field}-${row.column}-help`}
                label={`Help under ${heading(row.column)}`}
                labelHidden
                placeholder="Help under the field"
                required={false}
                value={row.help ?? ""}
                onChange={(help) => change(at, { help })}
              />
            ) : null}
            {can("section") ? (
              <TextField
                name={`${field}-${row.column}-section`}
                label={`Section of ${heading(row.column)}`}
                labelHidden
                placeholder="Section"
                required={false}
                value={row.section ?? ""}
                onChange={(section) => change(at, { section })}
              />
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {can("required") ? (
                <CheckboxField
                  name={`${field}-${row.column}-required`}
                  label="Must be filled in"
                  checked={row.required === true}
                  onChange={(required) => change(at, { required })}
                />
              ) : null}
              {can("hidden") ? (
                <CheckboxField
                  name={`${field}-${row.column}-hidden`}
                  label="Hidden"
                  checked={row.hidden === true}
                  onChange={(hidden) => change(at, { hidden })}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <span role="status" className="sr-only">
        {sort.said}
      </span>
      {left.length > 0 ? (
        <SelectField
          name={`${field}-add`}
          label="Show another field"
          labelHidden
          value=""
          options={[
            {
              value: "",
              label: `+ Show another field${hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}`,
            },
            ...left.map((one) => ({ value: one.value, label: one.label })),
          ]}
          onChange={(next) => next && onChange([...rows, { column: next }])}
        />
      ) : null}
      {value?.length ? (
        <div>
          <Button size="small" variant="quiet" onClick={() => onChange(undefined)}>
            Show every field again
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
