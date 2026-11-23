import { displayGuess, ENUM_COLORS, enumColor } from "@volvel/manifest";
import {
  Button,
  Closing,
  ComboboxField,
  DateField,
  Dialog,
  EmptyState,
  Grid,
  type GridColumn,
  type GridSort,
  Menu,
  MoveButtons,
  MultiSelectField,
  Notice,
  Popover,
  parseValue,
  SelectField,
  SideSheet,
  showValue,
  TextAreaField,
  TextField,
  useFlip,
  ValueChip,
} from "@volvel/ui";
import { Download, Ellipsis, Keyboard } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { AttachedPages, workspaceOf } from "../help/glossary.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { count } from "../kit/format.ts";
import { HealthCell } from "../kit/health.tsx";
import { useHistory } from "../kit/history.ts";
import { useShortcut } from "../kit/keys.ts";
import { ErrorState, Loading, Pending } from "../kit/LoadState.tsx";
import { Inspector } from "../kit/layout.tsx";
import { Code, StatePill, Tag } from "../kit/status.tsx";
import { UndoRedo } from "../kit/UndoRedo.tsx";
import { ColumnsMenu, ViewsMenu } from "../kit/views.tsx";
import { type CreateConfig, CreateDialog, ListScreen, Page, RemoveButton } from "../ListScreen.tsx";
import { Link, navigate, useNavigationGuard, useUrlParam, useUrlState } from "../router.tsx";
import { ResourceIdentity } from "./ResourceIdentity.tsx";
import {
  type Policy,
  policyText,
  RowRulesEditor,
  type Rule,
  ruleText,
  SeeItAs,
} from "./RowRules.tsx";

const PAGE = 50;

const TYPES: { value: string; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "integer", label: "Whole number" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes or no" },
  { value: "timestamp", label: "Date and time" },
  { value: "date", label: "Date" },
  { value: "json", label: "JSON" },
  { value: "uuid", label: "ID" },
  { value: "reference", label: "Row of another table" },
  { value: "file", label: "File" },
  { value: "enum", label: "One of a list" },
  { value: "enum_list", label: "Several of a list" },
];

/** One value an enum column offers, with what people read and the colour it is drawn on. */
interface ColumnValue {
  value: string;
  label?: string;
  color?: string;
}

/** A value of an enum column as a chip: its label on its colour. One the column no longer offers is plain. */
function ValueOf({ column, value }: { column: RowColumn; value: string }) {
  const found = column.values?.find((one) => one.value === value);
  return <ValueChip color={enumColor(found?.color)}>{found?.label ?? value}</ValueChip>;
}
const typeLabel = (type: string) => TYPES.find((entry) => entry.value === type)?.label ?? type;

// ----- Rows: shared by workspace tables and the tables of an external source -----

interface RowColumn {
  name: string;
  /** What the column holds, shown behind its heading's ⓘ. */
  description?: string | undefined;
  type: string;
  required: boolean;
  /** False for columns the platform fills in, and for types it only reads. */
  writable: boolean;
  /** For an enum or an enum_list: the values it offers, in order. */
  values?: ColumnValue[];
  /** For a reference: the table it points to. */
  references?: string | null;
}

interface RowsBrowserProps {
  /** The name the grid is announced by. */
  label: string;
  /** Lists rows with GET and adds one with POST. */
  rowsPath: string;
  /** The address of one row, or null when rows cannot be changed. */
  rowPath: ((key: string) => string) | null;
  keyColumn: string | null;
  /** Whether a row can be added, when that is not what changing one takes (a source's table with no key). */
  canAdd?: boolean;
  columns: RowColumn[];
  /** Where files are uploaded to, when the table can hold them. */
  filesPath?: string;
  /** Explains why rows cannot be changed, when they cannot. */
  readOnlyNote?: string;
}

type DataRow = Record<string, unknown>;

/** What was typed in a filter box, as the filter the data API takes. */
export function toFilter(type: string, text: string): object | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (/^(empty|null)$/i.test(trimmed)) return { op: "is_null", value: true };
  if (type === "text") return { op: "contains", value: trimmed };
  // An enum is found by a value spelled out, a list by one value it has.
  if (type === "enum") return { op: "eq", value: trimmed };
  if (type === "enum_list") return { op: "has", value: trimmed };
  const compared = /^(>=|<=|>|<)\s*(.+)$/.exec(trimmed);
  const op = compared
    ? { ">=": "gte", "<=": "lte", ">": "gt", "<": "lt" }[compared[1] as ">"]
    : "eq";
  return { op, value: parseValue(type, compared ? (compared[2] as string) : trimmed) };
}

/** What the rows of a table show: in the address, so a link opens the same view. */
const ROWS_URL = {
  sort: { type: "string" },
  filter: { type: "string" },
  page: { type: "string" },
  /** The columns shown, in order. Empty means every column, as the table has them. */
  cols: { type: "list" },
  /** What links and saved views from before phase 18 say: the columns left out. Read, never written. */
  hide: { type: "list" },
  /** "1" when the first column scrolls away with the rest. It stays in view otherwise. */
  unlock: { type: "string" },
  density: { type: "string", default: "standard" },
  row: { type: "string", push: true },
} as const;

const NONE_CHECKED: Set<string> = new Set();

function RowsBrowser(
  props: RowsBrowserProps & {
    fill?: boolean;
    /** What leads the toolbar's row, such as the table's tabs, so they take no row of their own. */
    lead?: ReactNode;
  },
) {
  const { columns, keyColumn, rowPath } = props;
  const [url, setUrl] = useUrlState(ROWS_URL);
  const sort: GridSort | undefined = url.sort
    ? { column: url.sort.replace(/^-/, ""), descending: url.sort.startsWith("-") }
    : undefined;
  const applied = (() => {
    try {
      return url.filter ? (JSON.parse(url.filter) as Record<string, string>) : {};
    } catch {
      return {};
    }
  })();
  // What is typed reaches the address, and the server, once typing pauses.
  const [typed, setTyped] = useState<Record<string, string>>(applied);
  useEffect(() => {
    const timer = setTimeout(() => {
      const kept = Object.fromEntries(Object.entries(typed).filter(([, text]) => text.trim()));
      const next = Object.keys(kept).length > 0 ? JSON.stringify(kept) : undefined;
      if (next !== url.filter) setUrl({ filter: next, page: undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [typed, url.filter, setUrl]);
  const [filterError, setFilterError] = useState<string>();
  /** The cursors of the pages before this one, so "Previous" has somewhere to go. */
  const [back, setBack] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  // What is checked belongs to the page, order and filter it was checked on: on another, it is
  // not there to see, and a delete must not take it along.
  const scope = `${url.page ?? ""}|${url.sort ?? ""}|${url.filter ?? ""}`;
  const [picked, setPicked] = useState<{ scope: string; ids: Set<string> }>({
    scope,
    ids: new Set(),
  });
  const checked = picked.scope === scope ? picked.ids : NONE_CHECKED;
  const setChecked = (ids: Set<string>) => setPicked({ scope, ids });
  // The columns shown, in order: as chosen, or all of them less what an older link hides.
  const known = new Set(columns.map((column) => column.name));
  const chosen = url.cols.filter((name) => known.has(name));
  const hidden = new Set(url.hide);
  const order =
    chosen.length > 0
      ? chosen
      : columns.filter((column) => !hidden.has(column.name)).map((column) => column.name);
  const lockFirst = url.unlock !== "1";
  const compact = url.density === "compact";

  let filter: object | undefined;
  try {
    const parts = columns.flatMap((column) => {
      const built = toFilter(column.type, applied[column.name] ?? "");
      return built ? [{ column: column.name, ...built }] : [];
    });
    if (parts.length > 0) filter = { and: parts };
  } catch (error) {
    if (filterError !== (error as Error).message) setFilterError((error as Error).message);
  }
  const query = new URLSearchParams({ limit: String(PAGE) });
  if (filter) query.set("filter", JSON.stringify(filter));
  if (url.sort) query.set("sort", url.sort);
  if (url.page) query.set("cursor", url.page);
  // What stands for the rows a reference points to comes with the page, for up to five of them.
  const pointing = columns.filter((column) => column.references).slice(0, 5);
  if (pointing.length > 0) query.set("expand", pointing.map((column) => column.name).join(","));
  const page = useLoad<{
    items: DataRow[];
    nextCursor: string | null;
    expanded?: Record<string, Record<string, unknown>>;
  }>(`${props.rowsPath}?${query}`);
  const canChange = rowPath !== null && keyColumn !== null;
  /** A row may be added to a table with no key: only changing and deleting need one. */
  const canAdd = props.canAdd ?? canChange;
  const keyOf = (row: DataRow) => String(row[keyColumn ?? ""] ?? JSON.stringify(row));
  // Rows saved in place since this page was loaded. They are shown as saved without loading again.
  const [saved, setSaved] = useState<{ of: unknown; rows: Record<string, DataRow> }>();
  const changed = saved && saved.of === page.data ? saved.rows : {};
  const rows = (page.data?.items ?? []).map((row) => changed[keyOf(row)] ?? row);
  const toFirst = { page: undefined } as const;
  // How many rows the filters leave, from the totals of a custom table. A source has none.
  const custom = props.rowsPath.includes("/rows/");
  const totalPath = custom
    ? `${props.rowsPath.replace("/rows/", "/aggregate/")}${filter ? `?filter=${encodeURIComponent(JSON.stringify(filter))}` : ""}`
    : null;
  const total = useLoad<{ items: { values: { count?: number } }[] }>(totalPath);
  const counted = total.data?.items[0]?.values.count;
  const open = rows.find((row) => keyOf(row) === url.row);
  // Edits typed in the inspector and not saved: another row, or closing it, asks first.
  const unsaved = useRef(false);
  const choose = async (next: string | undefined) => {
    if (next !== url.row && unsaved.current) {
      const leave = await ask.confirm({
        title: "Leave without saving?",
        text: "Your changes to this row are not saved.",
        action: "Leave",
        cancel: "Stay",
        danger: true,
      });
      if (!leave) return;
    }
    unsaved.current = false;
    setUrl({ row: next });
  };
  // Several rows are deleted at once in the platform's own tables; a source's rows one by one.
  const canBatch = canChange && custom;
  const exportQuery = new URLSearchParams();
  if (filter) exportQuery.set("filter", JSON.stringify(filter));
  if (url.sort) exportQuery.set("sort", url.sort);
  const exportHref = custom
    ? `/api/v1${props.rowsPath.replace("/rows/", "/rows-export/")}?${exportQuery}`
    : null;
  const grid: GridColumn[] = order
    .flatMap((name) => columns.find((column) => column.name === name) ?? [])
    .map((column) => ({
      name: column.name,
      description: column.description,
      type: column.type,
      editable: canChange && column.writable && column.type !== "file",
      sortable: !["json", "enum_list"].includes(column.type),
      filterable: !["json", "ARRAY"].includes(column.type),
    }));
  const saveRow = async (row: DataRow, values: Record<string, unknown>) => {
    if (!rowPath) return;
    const now = await api.patch<DataRow>(rowPath(keyOf(row)), values);
    setSaved({ of: page.data, rows: { ...changed, [keyOf(row)]: now } });
  };
  const deleteChecked = async () => {
    const ids = [...checked];
    const sure = await ask.confirm({
      title: `Delete ${ids.length === 1 ? "this row" : `these ${ids.length} rows`}?`,
      text: "They are removed for everyone. This cannot be undone.",
      action: ids.length === 1 ? "Delete the row" : `Delete ${ids.length} rows`,
      danger: true,
    });
    if (!sure) return;
    try {
      const done = await api.post<{ deleted: string[]; missing: string[] }>(
        props.rowsPath.replace("/rows/", "/row-deletions/"),
        { ids },
      );
      notify.success(
        `${done.deleted.length} ${done.deleted.length === 1 ? "row" : "rows"} deleted.${
          done.missing.length > 0
            ? ` ${done.missing.length} were gone already, or were not yours to delete.`
            : ""
        }`,
      );
      setChecked(new Set());
      page.reload();
    } catch (error) {
      notify.error(error);
    }
  };

  const fill = props.fill === true;
  return (
    <div className={`flex flex-col gap-3 ${fill ? "min-h-0 flex-1" : ""}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        {props.lead}
        {/* What a read-only table says stands in the row. The keys are behind a button: two
            lines above every grid kept its first row far from the top (P4-1). */}
        {props.readOnlyNote ? (
          <p className="m-0 text-body-sm text-ink-muted">{props.readOnlyNote}</p>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {props.readOnlyNote ? null : (
            <Popover
              title="Keys in the table"
              trigger={
                <Button size="small" variant="quiet">
                  <Keyboard aria-hidden="true" size={14} /> Keys
                </Button>
              }
            >
              <p className="m-0">
                Arrow keys move between cells; Enter or F2 changes one, Escape puts it back. In a
                filter, type text to look for, or a comparison such as &gt; 100. Type empty to find
                rows with no value.
              </p>
            </Popover>
          )}
          <ColumnsMenu
            columns={columns.map((column) => ({ key: column.name, label: column.name }))}
            shown={order.length === columns.length && chosen.length === 0 ? undefined : order}
            onChange={(next) => setUrl({ cols: next ?? [], hide: [] })}
          >
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={lockFirst}
                onChange={() => setUrl({ unlock: lockFirst ? "1" : undefined })}
                className="mt-0.5 size-4 accent-[var(--color-action)]"
              />
              <span className="flex flex-col">
                Lock the first column
                <span className="text-body-sm text-ink-muted">
                  It stays in view when the table is scrolled sideways. Put the column you want
                  first.
                </span>
              </span>
            </label>
          </ColumnsMenu>
          <Button
            size="small"
            aria-pressed={compact}
            onClick={() => setUrl({ density: compact ? "standard" : "compact" })}
          >
            {compact ? "Standard rows" : "Compact rows"}
          </Button>
          {viewsOf(props.rowsPath) ? (
            <ViewsMenu {...(viewsOf(props.rowsPath) as ViewsOf)} omit={["row", "page"]} />
          ) : null}
          {exportHref ? (
            <Button size="small" href={exportHref} download>
              <Download aria-hidden="true" size={14} /> CSV
            </Button>
          ) : null}
          {canAdd ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add row
            </Button>
          ) : null}
        </span>
      </div>
      {filterError ? <Notice tone="danger">{filterError}</Notice> : null}
      {page.error ? <ErrorState error={page.error} what="the rows" onRetry={page.reload} /> : null}
      {checked.size > 0 && canBatch ? (
        <div
          role="toolbar"
          aria-label="What to do with the checked rows"
          className="flex flex-wrap items-center gap-3 rounded-control bg-action-soft px-3 py-2"
        >
          <span className="text-body-sm font-medium">
            {checked.size} {checked.size === 1 ? "row" : "rows"} checked
          </span>
          <Button size="small" variant="danger" onClick={() => void deleteChecked()}>
            Delete
          </Button>
          <Button size="small" variant="quiet" onClick={() => setChecked(new Set())}>
            Uncheck all
          </Button>
        </div>
      ) : null}
      <div className={`flex min-h-0 gap-4 ${fill ? "flex-1" : ""}`}>
        <div className={`min-w-0 flex-1 ${fill ? "flex min-h-0 flex-col" : ""}`}>
          {/* grid-allowed: a table's own rows, edited in place and filtered by the server */}
          <Grid<DataRow>
            fill={fill}
            navigation="grid"
            lockFirst={lockFirst}
            density={compact ? "compact" : "standard"}
            label={props.label}
            columns={grid}
            rows={rows}
            rowKey={keyOf}
            selectedKey={url.row}
            onSelect={(row) => void choose(keyOf(row))}
            {...(canBatch ? { checked, onCheck: setChecked } : {})}
            sort={sort}
            onSort={(column) => {
              const next =
                sort?.column !== column ? column : sort.descending ? undefined : `-${column}`;
              setBack([]);
              setUrl({ sort: next, ...toFirst });
            }}
            filters={typed}
            onFilter={(column, text) => {
              setFilterError(undefined);
              setBack([]);
              setTyped((current) => ({ ...current, [column]: text }));
            }}
            {...(canChange
              ? {
                  onEdit: (row: DataRow, column: string, value: unknown) =>
                    saveRow(row, { [column]: value }),
                }
              : {})}
            cell={(row, column) => {
              const value = row[column.name];
              if (column.type === "file" && typeof value === "string" && props.filesPath) {
                return (
                  <a className="text-action" href={`/api/v1${props.filesPath}/${value}/content`}>
                    Download
                  </a>
                );
              }
              const meta = columns.find((one) => one.name === column.name);
              if (meta && column.type === "enum" && typeof value === "string") {
                return <ValueOf column={meta} value={value} />;
              }
              if (meta && column.type === "enum_list" && Array.isArray(value)) {
                return (
                  <span className="inline-flex flex-wrap gap-1">
                    {value.map((one) => (
                      <ValueOf key={String(one)} column={meta} value={String(one)} />
                    ))}
                  </span>
                );
              }
              if (column.type === "reference" && typeof value === "string") {
                // The row it points to, by what that table says stands for a row.
                const label = page.data?.expanded?.[column.name]?.[value];
                if (label !== undefined && label !== null) return String(label);
                return (
                  <span className="font-mono text-code-sm text-ink-muted">{String(value)}</span>
                );
              }
              if (column.name === keyColumn && column.type === "uuid") {
                return (
                  <span className="font-mono text-code-sm text-ink-muted">{String(value)}</span>
                );
              }
              return undefined;
            }}
            empty={
              !page.data
                ? ""
                : filter
                  ? "No rows match the filters."
                  : "This table has no rows yet."
            }
          />
        </div>
        <Inspector
          open={open !== undefined}
          label="The chosen row"
          title="Row"
          eyebrow={open ? keyOf(open) : undefined}
          subject={url.row}
          onClose={() => void choose(undefined)}
          footer={
            open && canChange && rowPath ? (
              <RemoveButton
                label="Delete row"
                confirm="Delete this row? It is removed for everyone. This cannot be undone."
                run={() => api.delete(rowPath(keyOf(open)))}
                onDone={() => {
                  setUrl({ row: undefined });
                  page.reload();
                }}
              />
            ) : undefined
          }
        >
          {open ? (
            <RowEditor
              key={keyOf(open)}
              row={open}
              columns={columns}
              editable={canChange}
              rowsPath={props.rowsPath}
              filesPath={props.filesPath}
              onSave={(values) => saveRow(open, values)}
              onDirty={(now) => {
                unsaved.current = now;
              }}
            />
          ) : null}
        </Inspector>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 text-body-sm text-ink-muted">
        <span>
          {rows.length === 0
            ? ""
            : `${rows.length} ${rows.length === 1 ? "row" : "rows"} on this page${
                typeof counted === "number"
                  ? `, of ${count(counted)}${filter ? " that match" : ""}`
                  : ""
              }`}
        </span>
        <span className="flex gap-2">
          <Button
            size="small"
            disabled={!url.page}
            onClick={() => {
              const before = back.at(-1);
              setBack((current) => current.slice(0, -1));
              setUrl({ page: before || undefined });
            }}
          >
            Previous
          </Button>
          <Button
            size="small"
            disabled={!page.data?.nextCursor}
            onClick={() => {
              // One step forward: the page shown now is where Previous comes back to.
              setBack((current) => [...current, url.page ?? ""]);
              setUrl({ page: page.data?.nextCursor ?? undefined });
            }}
          >
            Next
          </Button>
        </span>
      </div>
      <AddRow
        open={adding}
        onClose={() => setAdding(false)}
        columns={columns.filter((column) => column.writable)}
        rowsPath={props.rowsPath}
        {...(props.filesPath ? { filesPath: props.filesPath } : {})}
        onAdded={() => {
          setAdding(false);
          page.reload();
        }}
      />
    </div>
  );
}

/** A row's values, changed in the inspector beside the grid and saved together. */
/** What an enum column offers in a form: nothing, then each value by its label. A value it holds and no longer offers stays in the list. */
function valueOptions(column: RowColumn, held: string) {
  const offered = (column.values ?? []).map((one) => ({
    value: one.value,
    label: one.label ?? one.value,
  }));
  return [
    { value: "", label: column.required ? "Choose" : "No value" },
    ...offered,
    ...(held && !offered.some((one) => one.value === held)
      ? [{ value: held, label: `${held} (no longer offered)` }]
      : []),
  ];
}
const listOf = (text: string) =>
  text
    .split(",")
    .map((one) => one.trim())
    .filter(Boolean);

/** A yes/no column: one control in every form, a select, since a typed word is only refused at save. */
function BooleanField({
  column,
  value,
  error,
  onChange,
}: {
  column: RowColumn;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <SelectField
      name={column.name}
      label={column.name}
      value={value}
      options={[
        { value: "", label: column.required ? "Choose" : "No value" },
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ]}
      error={error}
      onChange={onChange}
    />
  );
}

/** How many rows of the table a reference points to are offered by name, before the typing. */
const OFFERED = 50;
/** How long after the last key what is typed is sent to the server. */
const TYPING_MS = 250;

/**
 * A reference column: the row it points to is chosen by what its table says stands for a row,
 * as the grid shows it, and the ID is not typed. What is typed is sent to the server, which
 * finds the rows whose name contains it, so a row past the first page can be found. Where the
 * table cannot be read, the ID is typed.
 */
function ReferenceField({
  column,
  rowsPath,
  value,
  error,
  onChange,
}: {
  column: RowColumn;
  rowsPath: string;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const target = column.references ?? "";
  const root = rowsPath.includes("/rows/") ? rowsPath.split("/rows/")[0] : undefined;
  const table = useLoad<{
    display?: string | null;
    columns?: { name: string; type: string; status?: string }[];
  }>(root ? `${root}/tables/${target}` : null);
  // What stands for a row, or, when the table names none, its name or title, or its first text
  // column: a person picks a pet by its name, never by an ID (A2-06; Fernhill's pets name none).
  const display = table.data?.display ?? displayGuess(table.data?.columns ?? []);
  const [typed, setTyped] = useState("");
  const [sent, setSent] = useState("");
  useEffect(() => {
    if (typed === sent) return;
    const timer = setTimeout(() => setSent(typed), TYPING_MS);
    return () => clearTimeout(timer);
  }, [typed, sent]);
  const filter =
    display && sent
      ? `&filter=${encodeURIComponent(JSON.stringify({ column: display, op: "contains", value: sent }))}`
      : "";
  const rows = useLoad<{ items: DataRow[]; nextCursor: string | null }>(
    root && table.data ? `${root}/rows/${target}?limit=${OFFERED}${filter}` : null,
  );
  const labelOf = (row: DataRow) => {
    const named = display ? row[display] : undefined;
    return named === undefined || named === null ? String(row.id) : String(named);
  };
  // The same list until the server answers again: a list that changes under the box resets what is typed in it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: labelOf follows display
  const options = useMemo(
    () => (rows.data?.items ?? []).map((row) => ({ value: String(row.id), label: labelOf(row) })),
    [rows.data, display],
  );
  const held = value !== "" && !options.some((one) => one.value === value);
  // The row now chosen is shown by its name even when it is not among those listed.
  const heldRow = useLoad<DataRow>(
    root && table.data && held ? `${root}/row/${value}/${target}` : null,
  );
  const heldLabel = heldRow.data ? labelOf(heldRow.data) : value;
  const offered = useMemo(
    () => (held ? [{ value, label: heldLabel }, ...options] : options),
    [held, value, heldLabel, options],
  );
  if (!root || table.error || rows.error) {
    return (
      <TextField
        name={column.name}
        label={column.name}
        value={value}
        required={false}
        hint={`The ID of a row of ${target}`}
        error={error}
        onChange={onChange}
      />
    );
  }
  const chosen = options.find((one) => one.value === value)?.label ?? heldLabel;
  return (
    <ComboboxField
      label={column.name}
      options={offered}
      value={value || undefined}
      error={error}
      hint={
        rows.data?.nextCursor
          ? `A row of ${target}. Type to find more.`
          : `A row of ${target}${column.required ? "" : ", optional"}`
      }
      placeholder={rows.data ? "Choose a row" : "Loading…"}
      onChange={(next) => onChange(next ?? "")}
      // Choosing a row puts its name in the box: that is not a search for it.
      {...(display ? { onSearch: (text: string) => setTyped(text === chosen ? "" : text) } : {})}
    />
  );
}

/**
 * The file in a file column, replaced or removed from the inspector. Each is asked about first,
 * and says that the old file stays in the row's history, so nothing is lost by saying yes.
 */
function FileField({
  column,
  value,
  filesPath,
  editable,
  onSave,
}: {
  column: RowColumn;
  value: unknown;
  filesPath: string | undefined;
  editable: boolean;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const has = typeof value === "string" && value !== "";
  const change = async (next: File | null) => {
    const sure = await ask.confirm({
      title: next ? `Replace the file in ${column.name}?` : `Remove the file from ${column.name}?`,
      text: `${
        next ? `${next.name} takes its place. ` : "The row will have no file. "
      }The old file stays in this row's history, until that history expires.`,
      action: next ? "Replace" : "Remove",
      danger: next === null,
    });
    if (!sure) return;
    setBusy(true);
    try {
      const stored = next
        ? await api.upload<{ id: string }>(
            `${filesPath}?name=${encodeURIComponent(next.name)}`,
            next,
          )
        : null;
      await onSave({ [column.name]: stored ? stored.id : null });
      notify.success(next ? "File replaced." : "File removed.");
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-sm text-ink-muted">{column.name}</span>
      <div className="flex flex-wrap items-center gap-2">
        {has && filesPath ? (
          <a className="text-action" href={`/api/v1${filesPath}/${value}/content`}>
            Download
          </a>
        ) : (
          <span className="font-mono text-code">{has ? String(value) : "—"}</span>
        )}
        {editable && filesPath ? (
          <>
            <input
              ref={input}
              type="file"
              hidden
              aria-label={`New file for ${column.name}`}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void change(file);
              }}
            />
            <Button loading={busy} onClick={() => input.current?.click()}>
              Replace
            </Button>
            {has ? (
              <Button disabled={busy} onClick={() => void change(null)}>
                Remove
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Text longer than this is edited in a text area, as the kit's forms do. */
const LONG_TEXT = 200;

function RowEditor({
  row,
  columns,
  editable,
  rowsPath,
  filesPath,
  onSave,
  onDirty,
}: {
  row: DataRow;
  columns: RowColumn[];
  editable: boolean;
  rowsPath: string;
  filesPath?: string | undefined;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  /** Whether there are edits not saved, for the table to ask before another row is chosen. */
  onDirty: (dirty: boolean) => void;
}) {
  const [text, setText] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const shown = (column: RowColumn) =>
    column.type === "enum_list"
      ? showValue("enum_list", row[column.name])
      : column.type === "json" || typeof row[column.name] === "object"
        ? row[column.name] === null || row[column.name] === undefined
          ? ""
          : JSON.stringify(row[column.name], null, 2)
        : row[column.name] === null || row[column.name] === undefined
          ? ""
          : String(row[column.name]);
  const dirty = Object.keys(text).length > 0;
  useNavigationGuard(dirty, "Your changes to this row are not saved.");
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  // JSON, and text that is already long or runs over lines, gets room to be read.
  const roomy = (column: RowColumn) => {
    const value = shown(column);
    return column.type === "json" || value.length > LONG_TEXT || value.includes("\n");
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const values: Record<string, unknown> = {};
        const wrong: Record<string, string> = {};
        for (const [name, typed] of Object.entries(text)) {
          const column = columns.find((one) => one.name === name);
          if (!column) continue;
          try {
            values[name] = parseValue(column.type, typed);
          } catch (error) {
            wrong[name] = (error as Error).message;
          }
        }
        setErrors(wrong);
        if (Object.keys(wrong).length > 0) return;
        setBusy(true);
        try {
          await onSave(values);
          notify.success("Row saved.");
          setText({});
        } catch (error) {
          notify.error(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      {columns.map((column) =>
        editable && column.writable && column.type === "boolean" ? (
          <BooleanField
            key={column.name}
            column={column}
            value={text[column.name] ?? shown(column)}
            error={errors[column.name]}
            onChange={(value) => setText((current) => ({ ...current, [column.name]: value }))}
          />
        ) : editable && column.writable && column.type === "reference" && column.references ? (
          <ReferenceField
            key={column.name}
            column={column}
            rowsPath={rowsPath}
            value={text[column.name] ?? shown(column)}
            error={errors[column.name]}
            onChange={(value) => setText((current) => ({ ...current, [column.name]: value }))}
          />
        ) : editable && column.writable && column.type === "enum" ? (
          <SelectField
            key={column.name}
            name={column.name}
            label={column.name}
            value={text[column.name] ?? shown(column)}
            options={valueOptions(column, text[column.name] ?? shown(column))}
            error={errors[column.name]}
            onChange={(value) => setText((current) => ({ ...current, [column.name]: value }))}
          />
        ) : editable && column.writable && column.type === "enum_list" ? (
          <MultiSelectField
            key={column.name}
            label={column.name}
            value={listOf(text[column.name] ?? shown(column))}
            options={valueOptions(column, "").slice(1)}
            error={errors[column.name]}
            onChange={(value) =>
              setText((current) => ({ ...current, [column.name]: value.join(",") }))
            }
          />
        ) : editable && column.writable && column.type !== "file" && roomy(column) ? (
          <TextAreaField
            key={column.name}
            name={column.name}
            label={column.name}
            value={text[column.name] ?? shown(column)}
            required={false}
            error={errors[column.name]}
            onChange={(value) => setText((current) => ({ ...current, [column.name]: value }))}
          />
        ) : editable && column.writable && column.type !== "file" ? (
          <TextField
            key={column.name}
            name={column.name}
            label={column.name}
            value={text[column.name] ?? shown(column)}
            required={false}
            error={errors[column.name]}
            onChange={(value) => setText((current) => ({ ...current, [column.name]: value }))}
          />
        ) : column.type === "file" ? (
          <FileField
            key={column.name}
            column={column}
            value={row[column.name]}
            filesPath={filesPath}
            editable={editable && column.writable}
            onSave={onSave}
          />
        ) : (
          <div key={column.name} className="flex flex-col gap-0.5">
            <span className="text-body-sm text-ink-muted">{column.name}</span>
            <span className="font-mono text-code break-words">
              {showValue(column.type, row[column.name]) || "—"}
            </span>
          </div>
        ),
      )}
      {editable ? (
        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
            Save row
          </Button>
          {dirty ? (
            <Button
              onClick={() => {
                setText({});
                setErrors({});
              }}
            >
              Discard
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function AddRow({
  open,
  onClose,
  columns,
  rowsPath,
  filesPath,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  columns: RowColumn[];
  rowsPath: string;
  filesPath?: string;
  onAdded: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const row: DataRow = {};
    const found: Record<string, string> = {};
    for (const column of columns) {
      if (column.type === "file") continue;
      try {
        const value = parseValue(column.type, values[column.name] ?? "");
        if (value !== null) row[column.name] = value;
      } catch (error) {
        found[column.name] = (error as Error).message;
      }
    }
    setErrors(found);
    setFailure(undefined);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      for (const [column, file] of Object.entries(files)) {
        const stored = await api.upload<{ id: string }>(
          `${filesPath}?name=${encodeURIComponent(file.name)}`,
          file,
        );
        row[column] = stored.id;
      }
      await api.post(rowsPath, row);
      notify.success("Row added.");
      setValues({});
      setFiles({});
      onAdded();
    } catch (caught) {
      const error = caught as ApiError;
      setErrors(
        Object.fromEntries(
          (error.fields ?? []).map((field) => [field.path.slice(1), field.message]),
        ),
      );
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  };

  const ordered = [
    ...columns.filter((column) => column.required),
    ...columns.filter((column) => !column.required),
  ];
  const firstOptional = ordered.find((column) => !column.required)?.name;
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="Add row"
      description="Required values first. A value left empty is stored as none, or the column's default."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-row" variant="primary" loading={busy}>
            Add row
          </Button>
        </>
      }
    >
      <form
        id="add-row"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {ordered.length > 0 && ordered[0]?.required ? (
          <p className="m-0 text-label text-ink-subtle uppercase">Required</p>
        ) : null}
        {ordered.map((column) => [
          column.name === firstOptional ? (
            <p
              key={`${column.name}-heading`}
              className="m-0 mt-2 text-label text-ink-subtle uppercase"
            >
              Optional
            </p>
          ) : null,
          column.type === "boolean" ? (
            <BooleanField
              key={column.name}
              column={column}
              value={values[column.name] ?? ""}
              error={errors[column.name]}
              onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
            />
          ) : column.type === "reference" && column.references ? (
            <ReferenceField
              key={column.name}
              column={column}
              rowsPath={rowsPath}
              value={values[column.name] ?? ""}
              error={errors[column.name]}
              onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
            />
          ) : column.type === "enum" ? (
            <SelectField
              key={column.name}
              name={column.name}
              label={column.name}
              value={values[column.name] ?? ""}
              options={valueOptions(column, "")}
              error={errors[column.name]}
              onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
            />
          ) : column.type === "enum_list" ? (
            <MultiSelectField
              key={column.name}
              label={column.name}
              value={listOf(values[column.name] ?? "")}
              options={valueOptions(column, "").slice(1)}
              error={errors[column.name]}
              onChange={(value) =>
                setValues((current) => ({ ...current, [column.name]: value.join(",") }))
              }
            />
          ) : column.type === "file" ? (
            <label key={column.name} className="flex flex-col gap-1 text-body-sm font-medium">
              {column.name}
              <input
                type="file"
                className="font-normal"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  setFiles((current) => {
                    const { [column.name]: _removed, ...rest } = current;
                    return file ? { ...rest, [column.name]: file } : rest;
                  });
                }}
              />
            </label>
          ) : column.type === "date" || column.type === "timestamp" ? (
            <DateField
              key={column.name}
              name={column.name}
              label={column.name}
              value={values[column.name] ?? ""}
              required={false}
              {...(column.type === "timestamp" ? { withTime: true, timeZone: "UTC" as const } : {})}
              hint={`${typeLabel(column.type)}${column.required ? "" : ", optional"}${column.type === "timestamp" ? "." : ""}`}
              error={errors[column.name]}
              onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
            />
          ) : column.type === "json" ? (
            <TextAreaField
              key={column.name}
              name={column.name}
              label={column.name}
              value={values[column.name] ?? ""}
              required={false}
              hint={`${typeLabel(column.type)}${column.required ? "" : ", optional"}`}
              error={errors[column.name]}
              onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
            />
          ) : (
            <TextField
              key={column.name}
              name={column.name}
              label={column.name}
              value={values[column.name] ?? ""}
              required={false}
              hint={`${typeLabel(column.type)}${column.required ? "" : ", optional"}`}
              error={errors[column.name]}
              onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
            />
          ),
        ])}
        {failure ? <Notice tone="danger">{failure}</Notice> : null}
      </form>
    </SideSheet>
  );
}

// ----- Tables -----

interface TableSummary {
  name: string;
  description: string;
  status: "active" | "retired";
  managedIn: "code" | "ui";
  columnCount: number;
  rowCount: number;
  policy: { type: string; column?: string };
}

export function Tables({ root, link }: { root: string; link: string }) {
  return (
    <ListScreen<TableSummary>
      title="Tables"
      description="The data this workspace keeps. A table defined in the repository changes when a bundle is deployed. Nothing is ever dropped by a deploy: what leaves a definition is retired and its data kept."
      path={`${root}/tables`}
      rowKey={(row) => `${row.name}:${row.status}`}
      columns={[
        {
          header: "Table",
          cell: (row) => (
            <span className="inline-flex items-center gap-2">
              <Link to={`${link}/tables/${row.name}`} className="font-medium text-action">
                {row.name}
              </Link>
              {row.status === "retired" ? <StatePill state="retired" /> : null}
            </span>
          ),
        },
        {
          header: "What it holds",
          priority: 2,
          cell: (row) => <span className="text-ink-muted">{row.description}</span>,
        },
        {
          header: "Managed in",
          priority: 3,
          cell: (row) => (row.managedIn === "code" ? "Repository" : "Console"),
        },
        { header: "Who sees rows", priority: 3, cell: (row) => policyText(row.policy) },
        { header: "Columns", priority: 2, cell: (row) => row.columnCount, align: "end" },
        { header: "Rows", cell: (row) => count(row.rowCount), align: "end" },
      ]}
      empty={{
        title: "No tables yet",
        text: "Define a table in the tenant's repository with defineTable and deploy it, or create one here to try things out.",
      }}
      create={{
        action: "Create table",
        description:
          "A table made here is managed in the console. Every table also gets an ID and the times each row was created and changed.",
        fields: [
          {
            name: "name",
            label: "Name",
            placeholder: "notes",
            hint: "Lowercase letters, digits and dashes.",
          },
          { name: "column", label: "First column", placeholder: "title" },
          {
            name: "type",
            label: "It holds",
            options: TYPES.filter((type) => type.value !== "reference"),
          },
        ],
        submit: async ({ name = "", column = "", type = "text" }) => {
          await api.put(`${root}/resources/${name}`, {
            kind: "table",
            schemaVersion: 1,
            ownership: "ui",
            body: { columns: { [column]: { type } } },
            // A new table: one already at this name is said so, not replaced.
            create: true,
          });
          navigate(`${link}/tables/${name}`);
        },
      }}
    />
  );
}

interface TableColumn {
  /** Tells apart two retired columns that had one name. */
  id?: string;
  name: string;
  /** What the column holds, when its definition says. */
  description?: string;
  type: string;
  required: boolean;
  unique: boolean;
  default: unknown;
  references: string | null;
  /** For a reference: restrict, set_null or cascade. */
  onDelete?: string | null;
  values?: ColumnValue[];
  /** Values the column had and no longer offers. Rows may still hold them. */
  retiredValues?: string[];
  status: "active" | "retired";
  held: number | null;
}

interface TableDetail {
  id?: string;
  name: string;
  /** What the table is for, when its definition says. */
  description?: string;
  status: "active" | "retired";
  managedIn: "code" | "ui";
  policy: { type: string; column?: string; rules?: Rule[] };
  /** The column that stands for a row where another table refers to it. */
  display?: string | null;
  rowCount: number;
  stored: { schema: string; table: string };
  columns: TableColumn[];
}

const SYSTEM_COLUMNS: RowColumn[] = [
  { name: "created_at", type: "timestamp", required: true, writable: false },
  { name: "updated_at", type: "timestamp", required: true, writable: false },
  { name: "id", type: "uuid", required: true, writable: false },
];

export function TableView({ root, name, link }: { root: string; name: string; link: string }) {
  const table = useLoad<TableDetail>(`${root}/tables/${name}`);
  const [view, setView] = useUrlParam<"rows" | "definition">("view", "rows", { push: true });
  // A workbench has no page padding of its own, so these two carry it.
  if (table.error) {
    return (
      <div className="px-4 py-4 md:px-8">
        <ErrorState error={table.error} onRetry={table.reload} />
      </div>
    );
  }
  if (!table.data) {
    return (
      <div className="px-4 py-4 md:px-8">
        <Pending of={table} />
      </div>
    );
  }
  const data = table.data;
  const retired = data.status === "retired";
  const active = data.columns.filter((column) => column.status === "active");
  const tab = (value: typeof view, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      className={`h-8 rounded-control px-3 font-medium ${view === value ? "bg-action-soft text-action" : "text-ink-muted hover:text-ink"}`}
      onClick={() => setView(value)}
    >
      {label}
    </button>
  );

  return (
    <Page
      fill
      helpKey="table"
      title={data.name}
      description={`${data.description ? `${data.description.replace(/\.?\s*$/, ".")} ` : ""}${count(data.rowCount)} ${data.rowCount === 1 ? "row" : "rows"}. ${policyText(data.policy)}. Managed in the ${data.managedIn === "code" ? "repository" : "console"}.`}
    >
      <AttachedPages {...workspaceOf(root)} kind="table" path={data.name} />
      {retired ? (
        <Notice
          tone="attention"
          action={
            <PurgeButton
              root={root}
              table={data.name}
              {...(data.id ? { tableId: data.id } : {})}
              onDone={() => navigate(`${link}/tables`)}
            />
          }
        >
          This table is retired. It left its definition, so nothing can read or write it, and its{" "}
          {count(data.rowCount)} rows are kept. Deploying a definition with this name brings it
          back.
        </Notice>
      ) : view === "rows" ? null : (
        <div className="flex shrink-0 gap-1">
          {tab("rows", "Rows")}
          {tab("definition", "Definition")}
        </div>
      )}
      {!retired && view === "rows" ? (
        <RowsBrowser
          fill
          lead={
            <div className="flex shrink-0 gap-1">
              {tab("rows", "Rows")}
              {tab("definition", "Definition")}
            </div>
          }
          key={active.map((column) => column.name).join(",")}
          label={`Rows of ${data.name}`}
          rowsPath={`${root}/rows/${data.name}`}
          rowPath={(key) => `${root}/row/${key}/${data.name}`}
          keyColumn="id"
          filesPath={`${root}/files`}
          columns={[
            ...active.map((column) => ({
              name: column.name,
              description: column.description,
              type: column.type,
              required:
                column.required && (column.default === null || column.default === undefined),
              writable: true,
              ...(column.values ? { values: column.values } : {}),
              references: column.references,
            })),
            ...SYSTEM_COLUMNS,
          ]}
        />
      ) : (
        // The one scroller of this tab: the page itself does not scroll.
        <div className="min-h-0 flex-1 overflow-auto">
          <Definition root={root} link={link} table={data} reload={table.reload} />
        </div>
      )}
    </Page>
  );
}

function PurgeButton({
  root,
  table,
  column,
  columnId,
  tableId,
  onDone,
}: {
  root: string;
  table: string;
  column?: string;
  /** Which retired column, for two that had the name. */
  columnId?: string;
  tableId?: string;
  onDone: () => void;
}) {
  const what = column ? `the retired column "${column}"` : `the retired table "${table}"`;
  return (
    <RemoveButton
      label="Delete for good"
      confirm={`Delete ${what} and everything in it? This is the one action that destroys data, and it cannot be undone.`}
      typeToConfirm={column ?? table}
      run={() =>
        api.post(`${root}/table-purges`, {
          table,
          ...(column ? { column } : {}),
          ...(columnId ? { columnId } : {}),
          ...(tableId ? { tableId } : {}),
        })
      }
      onDone={onDone}
    />
  );
}

/** What a reference does when the row it points to is deleted. */
const ON_DELETE = [
  {
    value: "restrict",
    label: "Refuse the deletion",
    short: "A row that is pointed to cannot be deleted",
  },
  {
    value: "set_null",
    label: "Empty this column",
    short: "Emptied when the row it points to is deleted",
  },
  {
    value: "cascade",
    label: "Delete this row too",
    short: "Deleted when the row it points to is deleted",
  },
];

function OnDeleteDialog({
  column,
  open,
  onClose,
  onSave,
}: {
  column: TableColumn;
  open: boolean;
  onClose: () => void;
  onSave: (onDelete: string) => Promise<void>;
}) {
  const [rule, setRule] = useState(column.onDelete ?? "restrict");
  const [busy, setBusy] = useState(false);
  // Why the save was refused: said here, with the choice kept, until it is saved or canceled.
  const [error, setError] = useState<string>();
  return (
    <Dialog open={open} onClose={onClose} title={`When a row ${column.name} points to is deleted`}>
      <div className="flex flex-col gap-4">
        <SelectField
          name="onDelete"
          label={`What happens to the row that holds ${column.name}`}
          value={rule}
          options={ON_DELETE.map((one) => ({ value: one.value, label: one.label }))}
          onChange={setRule}
        />
        {rule === "cascade" ? (
          <Notice tone="attention">
            Deleting a row of {column.references} will delete every row here that points to it.
          </Notice>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await onSave(rule);
                onClose();
              } catch (caught) {
                setError(failureText(caught));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

const COLOR_NAMES = Object.keys(ENUM_COLORS);

interface EditedValue {
  /** Stays the same while the value is retyped, so the list does not lose its place. */
  key: number;
  value: string;
  label: string;
  color: string;
  /** The value as it was when the dialog opened: retyped, rows that hold it are rewritten. */
  was?: string;
}

/** The values of an enum column: what each is called, the colour it is drawn on, and their order. */
function ValuesDialog({
  column,
  open,
  onClose,
  onSave,
}: {
  column: TableColumn;
  open: boolean;
  onClose: () => void;
  onSave: (values: (string | Record<string, string>)[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<EditedValue[]>(() =>
    (column.values ?? []).map((one, key) => ({
      key,
      value: one.value,
      label: one.label ?? "",
      color: one.color ?? "",
      was: one.value,
    })),
  );
  const [busy, setBusy] = useState(false);
  // Why the save was refused: said here, with everything typed kept, until it is saved or canceled.
  const [error, setError] = useState<string>();
  const edit = (key: number, change: Partial<EditedValue>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const move = (at: number, by: -1 | 1) =>
    setRows((current) => {
      const to = at + by;
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[at], next[to]] = [next[to] as EditedValue, next[at] as EditedValue];
      return next;
    });
  const list = useFlip<HTMLUListElement>(rows.map((row) => row.key).join(" "));
  const typed = rows.map((row) => row.value.trim());
  const ownColor = (color: string) => color !== "" && !COLOR_NAMES.includes(color);
  const problem = typed.some((value) => value === "")
    ? "Every value needs to be typed."
    : new Set(typed).size !== typed.length
      ? "Two values are the same."
      : rows.some((row) => ownColor(row.color) && !/^#[0-9a-fA-F]{6}$/.test(row.color))
        ? "A color of your own is written as # and six digits, such as #7c3aed."
        : rows.length === 0
          ? "A column needs at least one value."
          : undefined;
  const gone = (column.values ?? [])
    .map((one) => one.value)
    .filter((value) => !rows.some((row) => row.was === value));
  return (
    <Dialog open={open} onClose={onClose} title={`Values of ${column.name}`}>
      <div className="flex flex-col gap-4">
        <ul
          ref={list}
          className="m-0 flex list-none flex-col gap-3 p-0"
          aria-label="Values, in order"
        >
          {rows.map((row, at) => (
            <li
              key={row.key}
              data-flip-key={row.key}
              className="flex flex-col gap-2 rounded-panel border border-line p-3"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-32 flex-1">
                  <TextField
                    name={`value-${row.key}`}
                    label="Value"
                    value={row.value}
                    onChange={(value) => edit(row.key, { value })}
                  />
                </div>
                <div className="min-w-32 flex-1">
                  <TextField
                    name={`label-${row.key}`}
                    label="Shown as"
                    required={false}
                    value={row.label}
                    onChange={(label) => edit(row.key, { label })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-40">
                  <SelectField
                    name={`color-${row.key}`}
                    label="Color"
                    value={ownColor(row.color) ? "custom" : row.color}
                    options={[
                      { value: "", label: "None" },
                      ...COLOR_NAMES.map((name) => ({ value: name, label: name })),
                      { value: "custom", label: "One of your own" },
                    ]}
                    onChange={(color) =>
                      edit(row.key, { color: color === "custom" ? "#7c3aed" : color })
                    }
                  />
                </div>
                {ownColor(row.color) ? (
                  <div className="w-32">
                    <TextField
                      name={`hex-${row.key}`}
                      label="As #rrggbb"
                      value={row.color}
                      onChange={(color) => edit(row.key, { color })}
                    />
                  </div>
                ) : null}
                <span className="flex h-control items-center">
                  <ValueChip color={enumColor(row.color || undefined)}>
                    {row.label || row.value || "Value"}
                  </ValueChip>
                </span>
                <span className="ml-auto inline-flex gap-1">
                  <MoveButtons
                    label={row.value || "this value"}
                    at={at}
                    count={rows.length}
                    onMove={(by) => move(at, by)}
                  />
                  <Button
                    size="small"
                    variant="quiet"
                    onClick={() =>
                      setRows((current) => current.filter((one) => one.key !== row.key))
                    }
                  >
                    Remove
                  </Button>
                </span>
              </div>
              {row.was !== undefined && row.was !== row.value.trim() && row.value.trim() !== "" ? (
                <p className="m-0 text-body-sm text-ink-muted">
                  Rows that hold <Code>{row.was}</Code> will hold <Code>{row.value.trim()}</Code>.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <div>
          <Button
            size="small"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  key: Math.max(-1, ...current.map((one) => one.key)) + 1,
                  value: "",
                  label: "",
                  color: "",
                },
              ])
            }
          >
            Add a value
          </Button>
        </div>
        {gone.length > 0 ? (
          <Notice tone="plain">
            {gone.join(", ")} will no longer be offered. Rows that hold{" "}
            {gone.length === 1 ? "it" : "them"} keep {gone.length === 1 ? "it" : "them"}.
          </Notice>
        ) : null}
        {problem ? (
          <Notice tone="danger">{problem}</Notice>
        ) : error ? (
          <Notice tone="danger">{error}</Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={problem !== undefined}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await onSave(
                  rows.map((row) => {
                    const value = row.value.trim();
                    const full: Record<string, string> = {
                      value,
                      ...(row.label.trim() ? { label: row.label.trim() } : {}),
                      ...(row.color ? { color: row.color } : {}),
                      ...(row.was !== undefined && row.was !== value
                        ? { renamedFrom: row.was }
                        : {}),
                    };
                    return Object.keys(full).length === 1 ? value : full;
                  }),
                );
                onClose();
              } catch (caught) {
                setError(failureText(caught));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface TableBody {
  description?: string;
  columns: Record<string, Record<string, unknown>>;
  policy?: { type: string; column?: string; rules?: Rule[] };
  [key: string]: unknown;
}

/** Stops a change that would put a column over one that has its name, and says so. */
function takenColumn(body: TableBody, name: string) {
  if (body.columns[name] || ["id", "created_at", "updated_at"].includes(name))
    throw new Error(
      `There is already a column called "${name}". Choose another name, or change that one.`,
    );
}

/**
 * The definition to save to go back to `state` from `now`. What was renamed since keeps its data
 * when it goes back, so each is given the name it has now as the one it was called: a column,
 * and a value of a choice.
 */
export function bodyToRestore(state: TableBody, now: TableBody | undefined): TableBody {
  const back = structuredClone(state);
  for (const [name, column] of Object.entries(now?.columns ?? {})) {
    const from = column.renamedFrom;
    if (typeof from === "string" && back.columns[from] && !back.columns[name]) {
      back.columns[from] = { ...back.columns[from], renamedFrom: name };
    }
    const wasValues = back.columns[name]?.values;
    if (!Array.isArray(column.values) || !Array.isArray(wasValues)) continue;
    type Entry = string | { value: string; renamedFrom?: string };
    const worded = (one: Entry) => (typeof one === "string" ? one : one.value);
    for (const entry of column.values as Entry[]) {
      if (typeof entry === "string" || typeof entry.renamedFrom !== "string") continue;
      const at = (wasValues as Entry[]).findIndex((one) => worded(one) === entry.renamedFrom);
      if (at < 0 || (wasValues as Entry[]).some((one) => worded(one) === entry.value)) continue;
      const old = wasValues[at] as Entry;
      wasValues[at] = {
        ...(typeof old === "string" ? { value: old } : old),
        renamedFrom: entry.value,
      };
    }
  }
  return back;
}

interface ColumnAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

function Definition({
  root,
  link,
  table,
  reload,
}: {
  root: string;
  link: string;
  table: TableDetail;
  reload: () => void;
}) {
  const editable = table.managedIn === "ui" && table.status === "active";
  // `/tenants/<id>`, the part of the workspace's address the tenant's people are listed under.
  const tenantBase = root.split("/workspaces/")[0];
  const [adding, setAdding] = useState(false);
  // The column whose values, or whose rule for a delete, are being changed.
  const [optionsOf, setOptionsOf] = useState<TableColumn>();
  const [failure, setFailure] = useState<string>();
  // What was chosen for "What stands for a row" shows at once, until the save has answered.
  const [chosenDisplay, setChosenDisplay] = useState<string>();
  // The rules editor is started afresh when the rules change from elsewhere (an undo, a deploy),
  // and not when its own save comes back: it would lose its "Saved" and its place.
  const rules = useRef<{ json: string; own: string | undefined; version: number }>({
    json: JSON.stringify(table.policy),
    own: undefined,
    version: 0,
  });
  const policyNow = JSON.stringify(table.policy);
  if (policyNow !== rules.current.json) {
    rules.current.json = policyNow;
    if (policyNow !== rules.current.own) rules.current.version += 1;
  }
  const active = table.columns.filter((column) => column.status === "active");
  const retired = table.columns.filter((column) => column.status === "retired");
  // The definition as last saved from here, and every change made to it, for ⌘Z.
  const stored = useRef<TableBody>(undefined);
  // The version of the definition as this screen last read or saved it. A save names it, so that
  // one made after someone else's change is refused and does not take their change back.
  const held = useRef<number>(undefined);
  const restoring = useRef<(state: TableBody) => void>(() => {});
  const history = useHistory<TableBody | undefined>(
    () => stored.current,
    (state) => state && restoring.current(state),
  );
  restoring.current = async (state) => {
    setFailure(undefined);
    const now = stored.current;
    const back = bodyToRestore(state, now);
    try {
      const saved = await api.put<{ version?: number }>(`${root}/resources/${table.name}`, {
        kind: "table",
        schemaVersion: 1,
        ownership: "ui",
        body: back,
        ...(held.current !== undefined ? { version: held.current } : {}),
      });
      stored.current = back;
      held.current = saved.version;
    } catch (error) {
      // What is saved is not what the history thinks it is: it cannot be trusted any more.
      history.clear();
      setFailure(`${failureText(error)} Undo and redo start again from what is saved now.`);
    }
    reload();
  };
  useShortcut("undo", history.undo, { enabled: editable });
  useShortcut("redo", history.redo, { enabled: editable });
  const describeTable = async () => {
    const next = await ask.prompt({
      title: `What ${table.name} is for`,
      label: "Description",
      hint: "In plain words, 500 characters at most. Shown under the table's name. Leave it empty to say nothing.",
      initial: table.description ?? "",
      action: "Save",
      required: false,
      multiline: true,
    });
    if (next === null) return;
    const said = next.trim().slice(0, 500);
    if (said === (table.description ?? "")) return;
    await change(
      (body) => {
        if (said === "") delete body.description;
        else body.description = said;
      },
      { label: `the description of ${table.name}` },
    ).catch(() => undefined);
  };

  /** Loads the stored definition, changes it, and saves it. The platform works out what to do. */
  const change = async (
    edit: (body: TableBody) => void,
    {
      report = true,
      label = "the change",
    }: {
      /** Off where a dialog says what went wrong itself, so it is not said twice. */
      report?: boolean;
      /** What undoing it is called: "the rename of status". */
      label?: string;
    } = {},
  ) => {
    setFailure(undefined);
    try {
      const resource = await api.get<{ body: TableBody; version?: number }>(
        `${root}/resources/${table.name}`,
      );
      const body = structuredClone(resource.body);
      const before = structuredClone(resource.body);
      edit(body);
      const saved = await api.put<{ version?: number }>(`${root}/resources/${table.name}`, {
        kind: "table",
        schemaVersion: 1,
        ownership: "ui",
        body,
        ...(resource.version !== undefined ? { version: resource.version } : {}),
      });
      held.current = saved.version;
      // What it was before is what undoing takes back to; what it is now, what redoing does.
      stored.current = before;
      history.record(label);
      stored.current = body;
      reload();
    } catch (error) {
      if (report) {
        const caught = error as ApiError;
        const first = caught.fields?.[0];
        setFailure(first ? `${caught.message} ${first.message}` : caught.message);
      }
      throw error;
    }
  };
  const quietly = (run: Promise<unknown>) => run.catch(() => undefined);

  /** What can be done to a column, as buttons where there is room and as one menu on a phone. */
  const columnActions = (row: TableColumn): ColumnAction[] => [
    ...(row.values || row.references
      ? [
          {
            label: row.values ? "Values" : "On delete",
            onSelect: () => setOptionsOf(row),
          },
        ]
      : []),
    {
      label: "Describe",
      onSelect: async () => {
        const next = await ask.prompt({
          title: `What ${row.name} holds`,
          label: "Description",
          hint: "In plain words, 500 characters at most. Shown on the column's heading. Leave it empty to say nothing.",
          initial: row.description ?? "",
          action: "Save",
          required: false,
          multiline: true,
        });
        if (next === null) return;
        const said = next.trim().slice(0, 500);
        if (said === (row.description ?? "")) return;
        void quietly(
          change(
            (body) => {
              const column = body.columns[row.name];
              if (!column) return;
              if (said === "") delete column.description;
              else column.description = said;
            },
            { label: `the description of ${row.name}` },
          ),
        );
      },
    },
    {
      label: "Rename",
      onSelect: async () => {
        await ask.prompt({
          title: `Rename ${row.name}`,
          label: "New name",
          initial: row.name,
          action: "Rename",
          // Said on the field, with the name kept: no request is made for a name that is taken.
          submit: async (typed) => {
            const next = typed.trim();
            if (!next || next === row.name) return undefined;
            try {
              await change(
                (body) => {
                  takenColumn(body, next);
                  const { renamedFrom: _old, ...kept } = body.columns[row.name] ?? {};
                  delete body.columns[row.name];
                  body.columns[next] = { ...kept, renamedFrom: row.name };
                  if (body.policy?.column === row.name) body.policy.column = next;
                  // A rule that looks at the column follows it to its new name.
                  for (const rule of body.policy?.rules ?? []) {
                    if ("column" in rule.when && rule.when.column === row.name) {
                      rule.when.column = next;
                    }
                  }
                },
                { label: `renaming ${row.name} to ${next}`, report: false },
              );
              return undefined;
            } catch (error) {
              return failureText(error);
            }
          },
        });
      },
    },
    {
      label: "Retire",
      danger: true,
      disabled: active.length === 1,
      onSelect: async () => {
        const sure = await ask.confirm({
          title: `Retire ${row.name}?`,
          text: "It is hidden and its data kept. You can bring it back.",
          action: "Retire",
          danger: true,
        });
        if (!sure) return;
        void quietly(
          change((body) => delete body.columns[row.name], { label: `retiring ${row.name}` }),
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {table.status === "active" && !editable ? (
        <Notice tone="attention">
          This table is defined in the tenant's repository. To change it, change{" "}
          <Code>{"defineTable"}</Code> there and deploy.
        </Notice>
      ) : null}
      {failure ? <Notice tone="danger">{failure}</Notice> : null}
      {editable ? (
        <section className="flex flex-wrap items-center gap-2" aria-label="About this table">
          <ResourceIdentity
            root={root}
            link={link}
            row={{ path: table.name, kind: "table", ownership: "ui" }}
            label="Rename table"
            onDone={() => {}}
          />
          <Button size="small" onClick={() => void describeTable()}>
            {table.description ? "Describe the table again" : "Describe the table"}
          </Button>
          <span className="ml-auto">
            <UndoRedo history={history} />
          </span>
        </section>
      ) : null}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-title font-semibold">Columns</h2>
          {editable ? <Button onClick={() => setAdding(true)}>Add column</Button> : null}
        </div>
        <DataTable<TableColumn>
          variant="static"
          framed
          label="Columns"
          rows={active}
          rowKey={(row) => row.name}
          empty={<p className="m-0 text-ink-muted">No columns.</p>}
          columns={[
            {
              header: "Column",
              cell: (row) => (
                <span className="flex flex-col gap-0.5">
                  <Code>{row.name}</Code>
                  {row.description ? (
                    <span className="max-w-measure text-meta text-ink-muted">
                      {row.description}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              header: "Holds",
              cell: (row) =>
                row.references ? (
                  <span className="flex flex-col">
                    <span>A row of {row.references}</span>
                    <span className="text-meta text-ink-muted">
                      {ON_DELETE.find((one) => one.value === (row.onDelete ?? "restrict"))?.short}
                    </span>
                  </span>
                ) : row.values ? (
                  <span className="flex flex-col gap-1">
                    <span>{typeLabel(row.type)}</span>
                    <span className="inline-flex flex-wrap gap-1">
                      {row.values.map((one) => (
                        <ValueChip key={one.value} color={enumColor(one.color)}>
                          {one.label ?? one.value}
                        </ValueChip>
                      ))}
                    </span>
                    {row.retiredValues && row.retiredValues.length > 0 ? (
                      <span className="text-meta text-ink-muted">
                        No longer offered, kept on the rows that hold them:{" "}
                        {row.retiredValues.join(", ")}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  typeLabel(row.type)
                ),
            },
            {
              header: "Rules",
              priority: 2,
              cell: (row) =>
                [row.required ? "Required" : "", row.unique ? "No two rows alike" : ""]
                  .filter(Boolean)
                  .join(", "),
            },
            {
              header: "When not given",
              priority: 3,
              cell: (row) =>
                row.default === null || row.default === undefined ? (
                  ""
                ) : (
                  <Code>{JSON.stringify(row.default)}</Code>
                ),
            },
            ...(editable
              ? [
                  {
                    header: "",
                    align: "end" as const,
                    cell: (row: TableColumn) => {
                      const actions = columnActions(row);
                      return (
                        <>
                          <span className="hidden gap-1 sm:inline-flex">
                            {actions.map((one) => (
                              <Button
                                key={one.label}
                                size="small"
                                variant={one.danger ? "danger" : "quiet"}
                                {...(one.disabled ? { disabled: true } : {})}
                                onClick={one.onSelect}
                              >
                                {one.label}
                              </Button>
                            ))}
                          </span>
                          {/* A phone has no room for four buttons: one menu holds them. */}
                          <span className="sm:hidden">
                            <Menu
                              ariaLabel={`Actions for ${row.name}`}
                              align="end"
                              triggerClassName="inline-flex size-9 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
                              label={<Ellipsis aria-hidden="true" size={16} />}
                              items={actions.filter((one) => !one.disabled)}
                            />
                          </span>
                        </>
                      );
                    },
                  },
                ]
              : []),
          ]}
        />
        <p className="m-0 text-body-sm text-ink-muted">
          Every table also has <Code>{"id"}</Code>, <Code>{"created_at"}</Code> and{" "}
          <Code>{"updated_at"}</Code>, which the platform fills in.
        </p>
      </section>

      {retired.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-title font-semibold">Retired columns</h2>
          <p className="m-0 max-w-measure text-ink-muted">
            These left the definition. They are hidden from rows, and what they held is kept until
            someone deletes it here.
          </p>
          <DataTable<TableColumn>
            variant="static"
            framed
            label="Retired columns"
            rows={retired}
            rowKey={(row) => row.id ?? row.name}
            empty={null}
            columns={[
              { header: "Column", cell: (row) => <Code>{row.name}</Code> },
              { header: "Held", cell: (row) => typeLabel(row.type) },
              {
                header: "Still holds",
                cell: (row) => `${count(row.held ?? 0)} ${row.held === 1 ? "value" : "values"}`,
              },
              {
                header: "",
                align: "end",
                cell: (row) => (
                  <span className="inline-flex gap-1">
                    {editable ? (
                      <Button
                        size="small"
                        variant="quiet"
                        onClick={() =>
                          void quietly(
                            change(
                              (body) => {
                                takenColumn(body, row.name);
                                body.columns[row.name] = {
                                  type: row.type,
                                  ...(row.references ? { references: row.references } : {}),
                                  // An enum comes back with every value its rows may hold.
                                  ...(row.values
                                    ? { values: [...row.values, ...(row.retiredValues ?? [])] }
                                    : {}),
                                };
                              },
                              { label: `bringing back ${row.name}` },
                            ),
                          )
                        }
                      >
                        Bring back
                      </Button>
                    ) : null}
                    <PurgeButton
                      root={root}
                      table={table.name}
                      column={row.name}
                      {...(row.id ? { columnId: row.id } : {})}
                      onDone={reload}
                    />
                  </span>
                ),
              },
            ]}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-title font-semibold">What stands for a row</h2>
        <p className="m-0 max-w-measure text-ink-muted">
          Where another table points to a row of this one, this column is shown in place of the
          row's ID.
        </p>
        {editable ? (
          <div className="max-w-xs">
            <SelectField
              name="display"
              label="The column that stands for a row"
              labelHidden
              value={chosenDisplay ?? table.display ?? ""}
              options={[
                { value: "", label: "None: the row's ID" },
                ...active
                  .filter((column) => !["json", "file", "enum_list"].includes(column.type))
                  .map((column) => ({ value: column.name, label: column.name })),
              ]}
              onChange={(display) => {
                setChosenDisplay(display);
                void quietly(
                  change(
                    (body) => {
                      if (display) body.display = display;
                      else delete body.display;
                    },
                    { label: "the change to what stands for a row" },
                  ),
                ).finally(() => setChosenDisplay(undefined));
              }}
            />
          </div>
        ) : (
          <p className="m-0">{table.display ? <Code>{table.display}</Code> : "The row's ID."}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-title font-semibold">Who sees rows</h2>
        {editable ? (
          <RowRulesEditor
            key={`${table.name}:${rules.current.version}`}
            policy={table.policy as Policy}
            columns={active}
            onSave={(policy) => {
              rules.current.own = JSON.stringify(policy);
              return change(
                (body) => {
                  body.policy = policy;
                },
                { label: "the change to who sees rows" },
              );
            }}
          />
        ) : (
          <div className="max-w-measure">
            <p className="m-0">{policyText(table.policy)}.</p>
            {table.policy.type === "rules" ? (
              <ul className="mt-2 mb-0 pl-5">
                {(table.policy.rules ?? []).map((rule) => (
                  <li key={ruleText(rule)}>{ruleText(rule)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        {table.policy.type !== "open" && tenantBase ? (
          <SeeItAs root={root} table={table.name} usersPath={`${tenantBase}/end-users?limit=200`} />
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-title font-semibold">Where it is stored</h2>
        <p className="m-0 max-w-measure text-ink-muted">
          In Postgres, as <Code wrap>{`${table.stored.schema}.${table.stored.table}`}</Code>. It is
          your data: you can read it there directly at any time.
        </p>
      </section>

      {editable ? (
        <section className="flex flex-col items-start gap-2">
          <h2 className="m-0 text-title font-semibold">Retire this table</h2>
          <p className="m-0 max-w-measure text-ink-muted">
            The table is hidden and its rows kept. Deleting them for good is a separate step.
          </p>
          <RemoveButton
            label="Retire table"
            confirm={`Retire "${table.name}"? Its rows are kept, and nothing can read or write them until it is brought back.`}
            run={() => api.delete(`${root}/resources/${table.name}`)}
            onDone={() => navigate(`${link}/tables`)}
          />
        </section>
      ) : null}

      <Closing subject={optionsOf?.values || optionsOf?.references ? optionsOf : undefined}>
        {(optionsOf, shown) =>
          optionsOf.values ? (
            <ValuesDialog
              open={shown}
              column={optionsOf}
              onClose={() => setOptionsOf(undefined)}
              onSave={(values) =>
                change(
                  (body) => {
                    const column = body.columns[optionsOf.name];
                    if (column) column.values = values;
                  },
                  { report: false, label: `the values of ${optionsOf.name}` },
                )
              }
            />
          ) : (
            <OnDeleteDialog
              open={shown}
              column={optionsOf}
              onClose={() => setOptionsOf(undefined)}
              onSave={(onDelete) =>
                change(
                  (body) => {
                    const column = body.columns[optionsOf.name];
                    if (!column) return;
                    if (onDelete === "restrict") delete column.onDelete;
                    else column.onDelete = onDelete;
                  },
                  { report: false, label: `what happens on delete for ${optionsOf.name}` },
                )
              }
            />
          )
        }
      </Closing>
      <CreateDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => setAdding(false)}
        config={{
          action: "Add column",
          description:
            "A required column on a table that already has rows needs a value to give those rows.",
          fields: [
            { name: "name", label: "Name", placeholder: "status" },
            { name: "type", label: "It holds", options: TYPES },
            {
              name: "references",
              label: "Which table",
              required: false,
              when: (values) => values.type === "reference",
              choose: {
                path: `${root}/tables`,
                option: (item: { name: string }) => ({ value: item.name, label: item.name }),
              },
            },
            {
              name: "onDelete",
              label: "When the row it points to is deleted",
              required: false,
              when: (values) => values.type === "reference",
              options: ON_DELETE.map((one) => ({ value: one.value, label: one.label })),
            },
            {
              name: "values",
              label: "Values",
              required: false,
              placeholder: "new, paid, shipped",
              hint: "Separated by commas, in the order they are offered. Labels and colors are set afterwards, under Values.",
              when: (values) => values.type === "enum" || values.type === "enum_list",
            },
            {
              name: "required",
              label: "Must every row have one?",
              options: [
                { value: "no", label: "No" },
                { value: "yes", label: "Yes" },
              ],
            },
            {
              name: "fallback",
              label: "Value when none is given",
              required: false,
              hint: "Optional.",
            },
          ],
          submit: ({
            name = "",
            type = "text",
            references,
            onDelete,
            values,
            required,
            fallback,
          }) =>
            change(
              (body) => {
                takenColumn(body, name);
                body.columns[name] = {
                  type,
                  ...(type === "reference" && references ? { references } : {}),
                  ...(type === "reference" && onDelete && onDelete !== "restrict"
                    ? { onDelete }
                    : {}),
                  ...(type === "enum" || type === "enum_list"
                    ? { values: listOf(values ?? "") }
                    : {}),
                  ...(required === "yes" ? { required: true } : {}),
                  ...(fallback ? { default: parseValue(type, fallback) } : {}),
                };
              },
              { label: `adding ${name}` },
            ),
        }}
      />
    </div>
  );
}

// ----- External data sources -----

interface SourceBinding {
  path: string;
  description: string;
  defined: boolean;
  bound: boolean;
  /** Declared by a workspace linked to this one: it arrives with the next promotion. */
  arrives?: boolean;
  health?: {
    ok: boolean;
    problem: string | null;
    latencyMs: number | null;
    checkedAt: string;
  } | null;
  config: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    schema?: string;
    ssl?: boolean;
  } | null;
  hasPassword: boolean;
}

const SOURCE_FIELDS = [
  { name: "host", label: "Host", placeholder: "db.example.com" },
  { name: "port", label: "Port", type: "number", placeholder: "5432", required: false },
  { name: "database", label: "Database" },
  { name: "user", label: "User" },
  { name: "password", label: "Password", type: "password", required: false },
  {
    name: "schema",
    label: "Schema",
    placeholder: "public",
    required: false,
    hint: "The schema whose tables are offered.",
  },
  {
    name: "ssl",
    label: "Encrypt the connection",
    // A new source starts encrypted. The server's certificate is checked, so a database with a
    // private certificate authority needs No until that is arranged (D41).
    initial: "yes",
    hint: "The server's certificate is checked. Choose No for a database whose certificate a public authority did not sign.",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
] satisfies CreateConfig["fields"];

/** What a form of a source's details sends. */
function sourceBody({
  host,
  port,
  database,
  user,
  password,
  schema,
  ssl,
}: Record<string, string | undefined>) {
  return {
    config: {
      host,
      port: port ? Number(port) : 5432,
      database,
      user,
      ...(schema ? { schema } : {}),
      ...(ssl === "yes" ? { ssl: true } : {}),
    },
    ...(password ? { password } : {}),
  };
}

/** Changes how a connected source is reached, from what it is now. The password stays unless one is typed. */
function ChangeSource({
  root,
  row,
  onDone,
}: {
  root: string;
  row: SourceBinding;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const config = row.config;
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        Change
      </Button>
      <CreateDialog
        open={open}
        onClose={() => setOpen(false)}
        initial={{
          host: config?.host ?? "",
          port: config?.port !== undefined ? String(config.port) : "",
          database: config?.database ?? "",
          user: config?.user ?? "",
          schema: config?.schema ?? "",
          ssl: config?.ssl ? "yes" : "no",
        }}
        onCreated={() => {
          setOpen(false);
          onDone();
        }}
        config={{
          action: `Change ${row.path}`,
          description: `How ${row.path} is reached. Leave the password empty to keep the stored one. It is dropped when the host, port or user changes or encryption is turned off: then type it again. Scripts that use it read the new details at once.`,
          fields: SOURCE_FIELDS,
          done: () => `${row.path} was changed.`,
          submit: (values) =>
            api.put(`${root}/data-source-bindings/${row.path}`, sourceBody(values)),
        }}
      />
    </>
  );
}

/** Tests a data source from the server. The same word and the same busy state as a connection's Test. */
function TestSource({
  root,
  row,
  onDone,
}: {
  root: string;
  row: SourceBinding;
  onDone: () => void;
}) {
  const [testing, setTesting] = useState(false);
  return (
    <Button
      size="small"
      loading={testing}
      onClick={async () => {
        setTesting(true);
        try {
          const result = await api.post<{ ok: boolean; problem: string | null }>(
            `${root}/data-source-checks/${row.path}`,
            {},
          );
          if (result.ok) notify.success(`${row.path}: reached.`);
          else notify.error(new Error(`${row.path}: ${result.problem ?? "not reached"}`));
          onDone();
        } catch (caught) {
          notify.error(caught);
        } finally {
          setTesting(false);
        }
      }}
    >
      {testing ? "Testing…" : "Test"}
    </Button>
  );
}

export function Sources({ root, link }: { root: string; link: string }) {
  return (
    <ListScreen<SourceBinding>
      title="Data sources"
      setupField="path"
      description="Databases outside the platform that this workspace reads and writes. The address and password are set here, never in the repository, so dev and production can point at different databases."
      path={`${root}/data-source-bindings`}
      rowKey={(row) => row.path}
      columns={[
        {
          header: "Source",
          cell: (row) => (
            <span className="inline-flex flex-wrap items-center gap-2">
              {row.bound ? (
                <Link to={`${link}/sources/${row.path}`} className="font-medium text-action">
                  {row.path}
                </Link>
              ) : (
                <Code>{row.path}</Code>
              )}
              {row.arrives ? <Tag tone="neutral">Arrives with the next promotion</Tag> : null}
            </span>
          ),
        },
        // On a phone a source keeps its name and its health; where it points, from a tablet up.
        {
          header: "For",
          priority: 3,
          cell: (row) => <span className="text-ink-muted">{row.description}</span>,
        },
        {
          header: "Points to",
          priority: 2,
          cell: (row) =>
            row.bound ? (
              `${row.config?.database} on ${row.config?.host}, as ${row.config?.user}`
            ) : (
              <StatePill state="unbound" />
            ),
        },
        {
          header: "Password",
          priority: 3,
          cell: (row) => (row.hasPassword ? "Set" : row.bound ? "None" : ""),
        },
        {
          header: "Health",
          cell: (row) => (row.bound ? <HealthCell health={row.health} /> : ""),
        },
      ]}
      rowActions={(row, reload) =>
        row.bound ? (
          <span className="inline-flex gap-2">
            <TestSource root={root} row={row} onDone={reload} />
            <ChangeSource root={root} row={row} onDone={reload} />
            <RemoveButton
              label="Unbind"
              confirm={`Unbind "${row.path}"? Scripts that use it will fail until it is bound again. Nothing in that database changes.`}
              run={() => api.delete(`${root}/data-source-bindings/${row.path}`)}
              onDone={reload}
            />
          </span>
        ) : null
      }
      empty={{
        title: "No data sources yet",
        text: "Connect a Postgres database you already have. Its tables can then be browsed here and used by scripts.",
      }}
      create={{
        action: "Connect database",
        description:
          "Connecting a source that is already connected replaces its details. Leave the password empty to keep the stored one. It is dropped when the host, port or user changes or encryption is turned off: then type it again. The platform never changes the database's structure.",
        fields: [
          {
            name: "path",
            label: "Source",
            hint: "The data sources this workspace's resources declare.",
            choose: {
              path: `${root}/data-source-bindings`,
              option: (item: { path: string; description?: string }) => ({
                value: item.path,
                label: item.path,
                ...(item.description ? { hint: item.description } : {}),
              }),
            },
          },
          ...SOURCE_FIELDS,
        ],
        submit: ({ path = "", ...details }) =>
          api.put(`${root}/data-source-bindings/${path}`, sourceBody(details)),
      }}
    />
  );
}

interface SourceTable {
  name: string;
  key: string | null;
  columns: RowColumn[];
}

export function SourceView({ root, path, link }: { root: string; path: string; link: string }) {
  const tables = useLoad<{ items: SourceTable[] }>(`${root}/data-source-tables/${path}`);
  const [chosen, setChosen] = useUrlParam("item", undefined, { push: true });
  const items = tables.data?.items ?? [];
  const table = items.find((candidate) => candidate.name === chosen) ?? items[0];

  return (
    <Page
      fill
      helpKey="source"
      title={path}
      description="An external database. Rows are read and written there directly. The platform does not change its structure, and its own access rules apply."
      action={
        <Link to={`${link}/sources`} className="text-action">
          All data sources
        </Link>
      }
    >
      {tables.error ? (
        <Notice tone="danger" action={<Button onClick={tables.reload}>Try again</Button>}>
          {tables.error.message}
        </Notice>
      ) : !tables.data ? (
        <Loading />
      ) : !table ? (
        <EmptyState title="No tables found">
          The database was reached, but the schema it is connected to has no tables.
        </EmptyState>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:gap-4">
          {/* The list of tables scrolls on its own, beside the rows (A2-08). */}
          <nav
            aria-label="Tables of this source"
            className="flex max-h-32 shrink-0 flex-col gap-0.5 overflow-y-auto md:max-h-none md:w-48"
          >
            {items.map((item) => (
              <button
                type="button"
                key={item.name}
                aria-current={item.name === table.name ? "true" : undefined}
                // A list held to a height scrolls: its entries keep theirs (on a phone it is a strip).
                className={`shrink-0 truncate rounded-control px-3 py-1.5 text-left ${
                  item.name === table.name
                    ? "bg-action-soft font-medium text-action"
                    : "text-ink-muted hover:text-ink"
                }`}
                onClick={() => setChosen(item.name)}
              >
                {item.name}
              </button>
            ))}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <RowsBrowser
              fill
              key={table.name}
              label={`Rows of ${table.name}`}
              rowsPath={`${root}/source-rows/${encodeURIComponent(table.name)}/${path}`}
              rowPath={
                table.key
                  ? (key) =>
                      `${root}/source-row/${encodeURIComponent(table.name)}/${encodeURIComponent(key)}/${path}`
                  : null
              }
              keyColumn={table.key}
              canAdd
              columns={table.columns}
              {...(table.key
                ? {}
                : {
                    readOnlyNote:
                      "This table has no primary key, so rows can be added but not changed or deleted.",
                  })}
            />
          </div>
        </div>
      )}
    </Page>
  );
}

type ViewsOf = { tenantId: string; workspaceId: string; list: string };
/** A table's rows have saved views of their own, named for the table, kept to what a list name may be. */
function viewsOf(rowsPath: string): ViewsOf | undefined {
  const match = /^\/tenants\/([^/]+)\/workspaces\/([^/]+)\/rows\/(.+)$/.exec(rowsPath);
  if (!match) return undefined;
  const [, tenantId, workspaceId, table] = match as unknown as [string, string, string, string];
  const slug = `rows-${table.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    .slice(0, 40)
    .replace(/-+$/, "");
  return { tenantId, workspaceId, list: slug };
}
