import { Button, Details } from "@volvel/ui";
import type { ColumnInfo, RecordData, RowsData, WidgetViewProps } from "@volvel/widgets";
import { formatOfColumn, moneyText, parseMoney } from "@volvel/widgets";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import {
  type Tone as BadgeTone,
  type ColumnSpec,
  cellOf,
  defaultColumns,
  isCode,
  SYSTEM_COLUMNS,
} from "./cells.tsx";
import { labelOf } from "./format.ts";
import { NamedIcon, type Tone, VARIANT } from "./look.tsx";
import { CANNOT_NOW, useRunning } from "./press.tsx";

interface DetailField extends ColumnSpec {
  section?: string;
  hidden?: boolean;
}

interface DetailAction {
  id: string;
  label: string;
  tone?: Tone;
  icon?: string;
  action: unknown;
}

interface DetailConfig {
  heading?: string;
  /** The big figure under the heading: a column. Left out: the first money field. */
  figure?: string;
  status?: string;
  /** The tones the status chip gives each value, as the table it was made from has them. */
  statusBadges?: Record<string, BadgeTone>;
  fields?: DetailField[];
  actions?: DetailAction[];
  /** Tiles across. A number, or the digit as text. */
  across?: 1 | 2 | 3 | "1" | "2" | "3";
  /** Fields are edited in place: a click opens an editor, Enter saves through `config/edit`. */
  edit?: boolean;
}

/** What the host may add to a record: the name each reference points at, as a table's rows have. */
type NamedRecord = RecordData & { names?: RowsData["names"] };

const SHORT_TEXT = 80;

/** Tiles across, by the width of the widget's own cell: one on a phone, then as many as asked. */
const GRID = {
  1: "grid-cols-1",
  2: "grid-cols-1 @[16rem]/cell:grid-cols-2",
  3: "grid-cols-1 @[16rem]/cell:grid-cols-2 @[36rem]/cell:grid-cols-3",
} as const;

/** What a column holds that an editor here can't: never edited in place. */
const NOT_EDITABLE = new Set(["json", "uuid", "timestamp", "file"]);

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

/** The money a field is, in the widget's format or as the table says: how it is typed and kept. */
function moneyOf(
  field: DetailField,
  info: ColumnInfo | undefined,
): { currency: string; minorUnits: boolean } | undefined {
  const format = formatOfColumn(field.format, info);
  return format?.style === "currency"
    ? { currency: format.currency ?? "USD", minorUnits: format.minorUnits === true }
    : undefined;
}

/** The fields to show: the config's, or every column that is not a system one. */
function fieldsOf(config: DetailConfig, columns: readonly ColumnInfo[]): DetailField[] {
  if (config.fields && config.fields.length > 0) return config.fields;
  return defaultColumns(columns).map((c) => ({ column: c.name }));
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

const CONTROL =
  "min-h-control w-full rounded-control border border-line-control bg-surface px-2 text-ink focus-visible:outline-2 focus-visible:outline-action";

/**
 * The editor of one field, by its column's type. Enter saves (Shift+Enter is a new line in
 * long text), Escape cancels; what the server says is wrong is said under the field.
 */
function FieldEditor({
  column,
  info,
  value,
  label,
  choices,
  money,
  save,
  stop,
}: {
  column: string;
  info: ColumnInfo | undefined;
  value: unknown;
  label: string;
  /** The column is money: typed as the person writes an amount, kept as the table keeps it. */
  money?: { currency: string; minorUnits: boolean } | undefined;
  choices: WidgetViewProps["choices"];
  save: (value: unknown) => Promise<string | undefined>;
  stop: () => void;
}) {
  const type = info?.type ?? "text";
  const [draft, setDraft] = useState(
    value === null || value === undefined
      ? ""
      : money && typeof value === "number"
        ? moneyText(value, money)
        : String(value),
  );
  const [problem, setProblem] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [offered, setOffered] = useState<readonly { value: string; label: string }[]>([]);
  useEffect(() => {
    if (type === "reference" && choices) void choices("record", column, "").then(setOffered);
  }, [type, choices, column]);

  // Several choices: the list it holds, ticked and unticked, kept in order of the choices.
  const [ticked, setTicked] = useState<string[]>(Array.isArray(value) ? (value as string[]) : []);
  const commit = async () => {
    if (saving) return;
    if (type === "enum_list") {
      setSaving(true);
      const failed = await save(
        (info?.values ?? []).map((one) => one.value).filter((one) => ticked.includes(one)),
      );
      setSaving(false);
      if (failed === undefined) stop();
      else setProblem(failed || "It could not be saved.");
      return;
    }
    let amount: number | null | undefined;
    if (money) {
      const read = parseMoney(draft, money);
      if (!read.ok) {
        setProblem(read.message);
        return;
      }
      amount = read.value ?? null;
    }
    const parsed: unknown =
      amount !== undefined
        ? amount
        : draft === ""
          ? null
          : type === "number" || type === "integer"
            ? Number(draft)
            : type === "boolean"
              ? draft === "true"
              : draft;
    setSaving(true);
    const failed = await save(parsed);
    setSaving(false);
    if (failed === undefined) stop();
    else setProblem(failed || "It could not be saved.");
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop();
    } else if (event.key === "Enter" && !(event.shiftKey && type === "text")) {
      event.preventDefault();
      void commit();
    }
  };
  const common = {
    "aria-label": label,
    "aria-invalid": problem ? true : undefined,
    "aria-busy": saving || undefined,
    disabled: saving,
    onKeyDown: keys,
    className: CONTROL,
  };
  const listed =
    type === "enum"
      ? (info?.values ?? []).map((one) => ({ value: one.value, label: one.label ?? one.value }))
      : type === "boolean"
        ? [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]
        : offered;
  const control =
    type === "enum_list" ? (
      <fieldset
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        className="m-0 flex flex-col gap-1 border-0 p-0"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            stop();
          }
        }}
      >
        {(info?.values ?? []).map((one, at) => (
          <label key={one.value} className="flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              // biome-ignore lint/a11y/noAutofocus: opened by the person's own click, the editor takes the keys
              autoFocus={at === 0}
              checked={ticked.includes(one.value)}
              disabled={saving}
              onChange={(event) =>
                setTicked((now) =>
                  event.target.checked ? [...now, one.value] : now.filter((x) => x !== one.value),
                )
              }
            />
            {one.label ?? one.value}
          </label>
        ))}
        <span className="flex gap-2">
          <Button size="small" variant="primary" loading={saving} onClick={() => void commit()}>
            Save
          </Button>
          <Button size="small" onClick={stop}>
            Cancel
          </Button>
        </span>
      </fieldset>
    ) : type === "enum" || type === "boolean" || type === "reference" ? (
      <select
        {...common}
        // biome-ignore lint/a11y/noAutofocus: opened by the person's own click, the editor takes the keys
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      >
        <option value="">Not set</option>
        {listed.map((one) => (
          <option key={one.value} value={one.value}>
            {one.label}
          </option>
        ))}
      </select>
    ) : typeof value === "string" && value.includes("\n") ? (
      <textarea
        {...common}
        // biome-ignore lint/a11y/noAutofocus: opened by the person's own click, the editor takes the keys
        autoFocus
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    ) : (
      <input
        {...common}
        // biome-ignore lint/a11y/noAutofocus: opened by the person's own click, the editor takes the keys
        autoFocus
        type={
          money
            ? "text"
            : type === "number" || type === "integer"
              ? "number"
              : type === "date"
                ? "date"
                : "text"
        }
        {...(money ? { inputMode: "decimal" as const, placeholder: moneyText(0, money) } : {})}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  return (
    <div className="flex flex-col gap-1">
      {control}
      {problem ? (
        <p role="alert" className="m-0 text-meta text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One record: its heading (the number, large, in the code face) with its status, what can be
 * done with it, and its fields as tiles, 1, 2 or 3 across, under their section headings. With
 * `edit`, a click on a tile edits that field in place.
 */
export function DetailView({
  config,
  data,
  building,
  viewing,
  act,
  can,
  why,
  choices,
}: WidgetViewProps<DetailConfig>) {
  const { running, run } = useRunning();
  // Which field is being edited in place.
  const [editing, setEditing] = useState<string>();
  const input = data.record as NamedRecord | undefined;
  if (input?.shape !== "record") return null;
  const record = input.record;
  if (record === null) {
    return (
      <p className="m-0 text-ink-muted">
        {building
          ? "Opens on a record of the table you choose in Data."
          : "There is nothing here for you yet."}
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
  const first = defaultColumns(input.columns)[0]?.name;
  const heading = config.heading ?? first;
  const status = config.status;
  // A record with a money figure reads as the boards draw it: its number small, the figure big.
  const figure =
    config.figure ??
    shown.find((field) => moneyOf(field, infoOf(field.column)) && field.column !== heading)?.column;
  const figured = figure !== undefined && record[figure] !== null && record[figure] !== undefined;
  const actions = config.actions ?? [];
  const wanted = Number(config.across);
  const across: 1 | 2 | 3 = wanted === 1 || wanted === 3 ? wanted : 2;
  const editable = config.edit === true && !building && act !== undefined;
  // The server edits only the fields shown: a hidden one is read, not changed, here.
  const canEdit = (column: string) =>
    editable &&
    !all.some((field) => field.column === column && field.hidden) &&
    !SYSTEM_COLUMNS.has(column) &&
    !NOT_EDITABLE.has(infoOf(column)?.type ?? "text");
  const saveField = async (column: string, value: unknown): Promise<string | undefined> => {
    const outcome = await act?.("config/edit", { record: id, inputs: { [column]: value } });
    if (!outcome || outcome.ok) return undefined;
    if ("cancelled" in outcome) return "";
    return outcome.fields?.[column] ?? outcome.message;
  };

  const draw = (field: DetailField) => {
    const label = field.label ?? labelOf(input.columns, field.column);
    const open = editing === field.column;
    const pressable = canEdit(field.column) && !open;
    return (
      <div
        key={field.column}
        data-field={field.column}
        className={`flex min-w-0 flex-col gap-0.5 rounded-inner ${
          pressable
            ? "-mx-2 -my-1 cursor-text px-2 py-1 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-action"
            : ""
        }`}
        {...(pressable
          ? {
              role: "button",
              tabIndex: 0,
              "aria-label": `Edit ${label}`,
              onClick: () => setEditing(field.column),
              onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                if (
                  event.target === event.currentTarget &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  setEditing(field.column);
                }
              },
            }
          : {})}
      >
        <dt className="text-meta text-ink-muted">{label}</dt>
        <dd className="m-0 min-w-0 break-words">
          {open ? (
            <FieldEditor
              column={field.column}
              info={infoOf(field.column)}
              value={record[field.column]}
              label={label}
              choices={choices}
              money={moneyOf(field, infoOf(field.column))}
              save={(value) => saveField(field.column, value)}
              stop={() => setEditing(undefined)}
            />
          ) : (
            showField(field, infoOf(field.column), record[field.column], rows)
          )}
        </dd>
      </div>
    );
  };
  const group = (list: readonly DetailField[]) => (
    <dl
      className={`m-0 grid gap-x-6 gap-y-4 rounded-panel border border-line bg-surface p-4 ${GRID[across]}`}
    >
      {list.map(draw)}
    </dl>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-x-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {heading ? (
            <h3
              className={`m-0 min-w-0 break-words ${isCode(record[heading]) ? "font-mono" : ""} ${
                figured ? "text-meta font-normal text-ink-muted" : "text-display font-semibold"
              }`}
            >
              {cellOf({ column: heading }, infoOf(heading), record[heading], rows)}
            </h3>
          ) : null}
          {figured && figure ? (
            <span className="text-[22px] leading-7 font-semibold tracking-[-0.01em] tabular-nums">
              {cellOf(
                shown.find((field) => field.column === figure) ?? { column: figure },
                infoOf(figure),
                record[figure],
                rows,
              )}
            </span>
          ) : null}
        </div>
        {status && record[status] !== null && record[status] !== undefined ? (
          <span className="shrink-0">
            {cellOf(
              {
                column: status,
                as: "badge",
                ...(config.statusBadges ? { badges: config.statusBadges } : {}),
              },
              infoOf(status),
              record[status],
              rows,
            )}
          </span>
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((item, at) => {
            const where = `config/actions/${at}/action`;
            const decides = !building || viewing === true;
            const allowed = decides ? (can?.(where, record) ?? true) : false;
            return (
              <Button
                key={item.id}
                variant={VARIANT[item.tone ?? "default"]}
                disabled={!allowed || running !== undefined}
                loading={running === item.id}
                tooltip={!allowed && decides ? (why?.(where, record) ?? CANNOT_NOW) : undefined}
                onClick={() => void run(item.id, () => act?.(where, { record: id }))}
              >
                <NamedIcon name={item.icon} />
                {item.label}
              </Button>
            );
          })}
        </div>
      ) : null}
      {sectionsOf(shown).map((section) => (
        <section key={section.name} className="flex flex-col gap-2">
          {section.name ? (
            <h4 className="m-0 text-meta font-semibold tracking-wide text-ink-muted uppercase">
              {section.name}
            </h4>
          ) : null}
          {group(section.fields)}
        </section>
      ))}
      {hidden.length > 0 ? (
        <Details summary={`+ Show another field (${hidden.length} hidden)`}>
          {group(hidden)}
        </Details>
      ) : null}
    </div>
  );
}
