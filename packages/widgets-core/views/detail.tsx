import { Button, Details } from "@volvel/ui";
import type { ColumnInfo, RecordData, RowsData, WidgetViewProps } from "@volvel/widgets";
import type { ReactNode } from "react";
import { type ColumnSpec, cellOf, SYSTEM_COLUMNS } from "./cells.tsx";
import { labelOf } from "./format.ts";
import { CANNOT_NOW, useRunning } from "./press.tsx";

interface DetailField extends ColumnSpec {
  section?: string;
  hidden?: boolean;
}

interface DetailAction {
  id: string;
  label: string;
  tone?: "primary" | "default" | "danger";
  action: unknown;
}

interface DetailConfig {
  heading?: string;
  status?: string;
  fields?: DetailField[];
  actions?: DetailAction[];
}

/** What the host may add to a record: the name each reference points at, as a table's rows have. */
type NamedRecord = RecordData & { names?: RowsData["names"] };

const VARIANT = { primary: "primary", default: "secondary", danger: "danger-solid" } as const;

const SHORT_TEXT = 80;

/** A date as a person reads it: "Nov 20, 2026". Anything else says itself. */
function dateOf(value: unknown): string {
  if (typeof value !== "string") return String(value);
  const at = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(at.getTime())
    ? value
    : at.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** One value by its type: money by its format, dates, chips, names, yes and no, long text kept as written. */
function showField(
  field: DetailField,
  info: ColumnInfo | undefined,
  value: unknown,
  rows: RowsData,
): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-muted">Not set</span>;
  }
  if (info?.type === "date") return dateOf(value);
  if (info?.type === "boolean") return value ? "Yes" : "No";
  if (info?.type === "text" && typeof value === "string") {
    if (value.length > SHORT_TEXT || value.includes("\n")) {
      return <span className="block whitespace-pre-wrap break-words">{value}</span>;
    }
  }
  return cellOf(field, info, value, rows);
}

/** The fields to show: the config's, or every column that is not a system one. */
function fieldsOf(config: DetailConfig, columns: readonly ColumnInfo[]): DetailField[] {
  if (config.fields && config.fields.length > 0) return config.fields;
  return columns.filter((c) => !SYSTEM_COLUMNS.has(c.name)).map((c) => ({ column: c.name }));
}

/** Consecutive fields of one section, in the order given. */
function sectionsOf(fields: readonly DetailField[]): { name: string; fields: DetailField[] }[] {
  const out: { name: string; fields: DetailField[] }[] = [];
  for (const field of fields) {
    const name = field.section ?? "";
    const last = out.find((section) => section.name === name);
    if (last) last.fields.push(field);
    else out.push({ name, fields: [field] });
  }
  return out;
}

/** One record: a heading and its status, what can be done with it, and its fields. */
export function DetailView({ config, data, building, act, can }: WidgetViewProps<DetailConfig>) {
  const { running, run } = useRunning();
  const input = data.record as NamedRecord | undefined;
  if (input?.shape !== "record") return null;
  const record = input.record;
  if (record === null) {
    return (
      <p className="m-0 text-ink-muted">
        {building ? "Opens on a record of the table you choose in Data." : "Nothing is open."}
      </p>
    );
  }
  const rows: RowsData = {
    shape: "rows",
    columns: input.columns,
    rows: [record],
    ...(input.names ? { names: input.names } : {}),
  };
  const id = String(record.id ?? "");
  const infoOf = (name: string) => input.columns.find((column) => column.name === name);
  const all = fieldsOf(config, input.columns);
  const shown = all.filter((field) => !field.hidden);
  const hidden = all.filter((field) => field.hidden);
  const first = input.columns.find((column) => !SYSTEM_COLUMNS.has(column.name))?.name;
  const heading = config.heading ?? first;
  const status = config.status;
  const actions = config.actions ?? [];

  const draw = (field: DetailField) => (
    <div key={field.column} className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-body-sm text-ink-muted">
        {field.label ?? labelOf(input.columns, field.column)}
      </dt>
      <dd className="m-0 min-w-0 break-words">
        {showField(field, infoOf(field.column), record[field.column], rows)}
      </dd>
    </div>
  );
  const group = (list: readonly DetailField[]) => (
    <dl className="m-0 grid grid-cols-1 gap-4 @[28rem]/cell:grid-cols-2">{list.map(draw)}</dl>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {heading ? (
          <h3 className="m-0 min-w-0 break-words text-display font-semibold">
            {cellOf({ column: heading }, infoOf(heading), record[heading], rows)}
          </h3>
        ) : null}
        {status && record[status] !== null && record[status] !== undefined ? (
          <span>{cellOf({ column: status }, infoOf(status), record[status], rows)}</span>
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((item, at) => {
            const where = `config/actions/${at}/action`;
            const allowed = building ? false : (can?.(where, record) ?? true);
            return (
              <Button
                key={item.id}
                variant={VARIANT[item.tone ?? "default"]}
                disabled={!allowed || running !== undefined}
                loading={running === item.id}
                tooltip={!allowed && !building ? CANNOT_NOW : undefined}
                onClick={() => void run(item.id, () => act?.(where, { record: id }))}
              >
                {item.label}
              </Button>
            );
          })}
        </div>
      ) : null}
      {sectionsOf(shown).map((section) => (
        <section
          key={section.name}
          className="flex flex-col gap-3 rounded-control border border-line bg-surface p-4"
        >
          {section.name ? (
            <h4 className="m-0 text-body-sm font-medium text-ink-muted">{section.name}</h4>
          ) : null}
          {group(section.fields)}
        </section>
      ))}
      {hidden.length > 0 ? (
        <Details summary={`Show another field (${hidden.length} hidden)`}>{group(hidden)}</Details>
      ) : null}
    </div>
  );
}
