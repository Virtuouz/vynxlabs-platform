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
  keepsKey,
  localWall,
  Menu,
  MoveButtons,
  MultiSelectField,
  Notice,
  Popover,
  parseValue,
  SelectField,
  SideSheet,
  showValue,
  TermText,
  TextAreaField,
  TextField,
  useFlip,
  utcOf,
  ValueChip,
} from "@volvel/ui";
import { Download, Ellipsis, Keyboard } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, useLoad, withCode } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { AttachedPages, workspaceOf } from "../help/glossary.tsx";
import { useAddressBox } from "../kit/addressBox.ts";
import { type Needs, useNeeds } from "../kit/Can.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { count, counted } from "../kit/format.ts";
import { HealthCell } from "../kit/health.tsx";
import { useHistory } from "../kit/history.ts";
import { useShortcut } from "../kit/keys.ts";
import { ErrorState, Loading, Pending } from "../kit/LoadState.tsx";
import { Inspector, useWide } from "../kit/layout.tsx";
import { ownershipSentence, ownershipWord, takeOverConsequence } from "../kit/ownership.ts";
import { UsedBy, useReferences } from "../kit/references.tsx";
import { Code, StatePill, Tag } from "../kit/status.tsx";
import { UndoRedo } from "../kit/UndoRedo.tsx";
import { ColumnsMenu, ViewsMenu } from "../kit/views.tsx";
import { type CreateConfig, CreateDialog, ListScreen, Page, RemoveButton } from "../ListScreen.tsx";
import { Link, navigate, useNavigationGuard, useUrlParam, useUrlState } from "../router.tsx";
import {
  ChangeTypeDialog,
  ColumnRulesDialog,
  DefaultField,
  draftsOf,
  hasNoDefault,
  IndexDialog,
  MAX_INDEXES,
  MoreColumnsField,
  typesFrom,
} from "./ColumnControls.tsx";
import { filterNode, toFilter } from "./gridFilter.ts";
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

/**
 * The Values field of a form that makes a column, shared by Create table and Add column: an
 * enum or a list of values with none could not be made, and said so with no field named.
 */
const VALUES_FIELD = {
  name: "values",
  label: "Values",
  required: false,
  placeholder: "new, paid, shipped",
  hint: "Separated by commas, in the order they are offered. Labels and colors are set afterwards, under Values.",
  when: (values: Record<string, string>) => values.type === "enum" || values.type === "enum_list",
};

/** What a column's definition holds when it is made with these values from a form. */
function newColumn(type: string, values: string | undefined) {
  return {
    type,
    ...(type === "enum" || type === "enum_list" ? { values: listOf(values ?? "") } : {}),
  };
}

/** One value an enum column offers, with what people read and the color it is drawn on. */
interface ColumnValue {
  value: string;
  label?: string;
  color?: string;
}

/** A value of an enum column as a chip: its label on its color. One the column no longer offers is plain. */
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
  /** What changing a row takes, and where: without it, rows are not changed and the line says so. */
  needs?: Needs | undefined;
  /** What the table is, whatever it is called: its saved views are kept under this. */
  tableId?: string | undefined;
  /** Where the table's indexes are changed, when the person may: a read stopped for taking too long points there. */
  indexesAt?: string | undefined;
}

type DataRow = Record<string, unknown>;

export { toFilter };

/**
 * The sort after a heading is pressed, as the address and the API write it (`a,-b`). A press
 * alone sorts by that column up, then down, then not at all. With Shift the column is added to
 * the others, after them, and pressing it again turns it down and then takes it off.
 */
export function nextSort(sort: GridSort[], column: string, additive: boolean): string | undefined {
  const here = sort.find((one) => one.column === column);
  const write = (list: GridSort[]) =>
    list.length > 0
      ? list.map((one) => `${one.descending ? "-" : ""}${one.column}`).join(",")
      : undefined;
  if (!additive) {
    // The column alone: another sort is let go of, and this one goes up, down, off.
    if (!here || sort.length > 1) return write([{ column, descending: false }]);
    return here.descending ? undefined : write([{ column, descending: true }]);
  }
  if (!here) return write([...sort, { column, descending: false }]);
  if (!here.descending)
    return write(sort.map((one) => (one.column === column ? { ...one, descending: true } : one)));
  return write(sort.filter((one) => one.column !== column));
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
  /** "any" when a row needs to satisfy one filter box and not every one. */
  match: { type: "string" },
  /** "1" when the first column scrolls away with the rest. It stays in view otherwise. */
  unlock: { type: "string" },
  density: { type: "string", default: "standard" },
  row: { type: "string", push: true },
  /** The cursors of the pages before this one, nearest last (`-` for the first page), so Previous survives a reload. */
  back: { type: "list" },
} as const;

const NONE_CHECKED: Set<string> = new Set();

const ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Whether text in a reference's filter box is what the server takes: IDs, `empty`, or `!` of them. */
function referenceFilterOk(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "" || /^(!\s*empty|!\s*null|not\s+empty|not\s+null|empty|null)$/i.test(trimmed))
    return true;
  return trimmed
    .split("|")
    .map((one) => one.trim().replace(/^(?:!=|!|not\s+)\s*/i, ""))
    .every((one) => ROW_ID.test(one));
}

function RowsBrowser(
  props: RowsBrowserProps & {
    fill?: boolean;
    /** What leads the toolbar's row, such as the table's tabs, so they take no row of their own. */
    lead?: ReactNode;
  },
) {
  const { columns, keyColumn, rowPath } = props;
  const [url, setUrl] = useUrlState(ROWS_URL);
  const sort: GridSort[] = url.sort
    ? url.sort
        .split(",")
        .filter(Boolean)
        .map((entry) => ({ column: entry.replace(/^-/, ""), descending: entry.startsWith("-") }))
    : [];
  const applied = (() => {
    try {
      return url.filter ? (JSON.parse(url.filter) as Record<string, string>) : {};
    } catch {
      return {};
    }
  })();
  // What is typed reaches the address, and the server, once typing pauses. A filter put in the
  // address from elsewhere (a saved view, a link, Back) is what the boxes show.
  const [typed, setTyped] = useAddressBox<Record<string, string>>(
    url.filter,
    (text) => {
      try {
        return text ? (JSON.parse(text) as Record<string, string>) : {};
      } catch {
        return {};
      }
    },
    (boxes) => {
      const kept = Object.fromEntries(Object.entries(boxes).filter(([, text]) => text.trim()));
      return Object.keys(kept).length > 0 ? JSON.stringify(kept) : undefined;
    },
    (next) => setUrl({ filter: next, page: undefined, back: [] }),
  );
  const [adding, setAdding] = useState(false);
  // What is checked belongs to the page, order and filter it was checked on: on another, it is
  // not there to see, and a delete must not take it along.
  const scope = `${url.page ?? ""}|${url.sort ?? ""}|${url.filter ?? ""}|${url.match ?? ""}`;
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

  // What the filter boxes hold in the address, as a filter, and what in them cannot be read.
  // Worked out from the text each time, so a message goes with the text that caused it.
  const parts: object[] = [];
  const filterErrors: Record<string, string> = {};
  for (const column of columns) {
    try {
      const text = applied[column.name] ?? "";
      // The server finds a reference by its row's ID alone; a name would be refused there.
      if (column.references && !referenceFilterOk(text))
        throw new Error(
          "A reference is found by its row's ID, or by empty. Open the row to copy its ID.",
        );
      const built = toFilter(column.type, text);
      if (built) parts.push(filterNode(column.name, built));
    } catch (error) {
      filterErrors[column.name] = (error as Error).message;
    }
  }
  const filterBroken = Object.keys(filterErrors).length > 0;
  // While a box cannot be read nothing is asked for: showing every row as if it were filtered,
  // or exporting them, would say something the filter does not.
  const any = url.match === "any";
  const filter: object | undefined =
    parts.length > 0 && !filterBroken ? (any ? { or: parts } : { and: parts }) : undefined;
  const query = new URLSearchParams({ limit: String(PAGE) });
  if (filter) query.set("filter", JSON.stringify(filter));
  if (url.sort) query.set("sort", url.sort);
  if (url.page) query.set("cursor", url.page);
  // What stands for the rows a reference points to comes with the page, for up to five of the
  // columns shown, in the order shown.
  const pointing = order
    .flatMap((name) => columns.find((column) => column.name === name) ?? [])
    .filter((column) => column.references)
    .slice(0, 5);
  if (pointing.length > 0) query.set("expand", pointing.map((column) => column.name).join(","));
  const page = useLoad<{
    items: DataRow[];
    nextCursor: string | null;
    expanded?: Record<string, Record<string, unknown>>;
  }>(filterBroken ? null : `${props.rowsPath}?${query}`);
  const pageData = filterBroken ? undefined : page.data;
  const may = useNeeds(props.needs);
  const canChange = rowPath !== null && keyColumn !== null && may.can;
  /** A row may be added to a table with no key: only changing and deleting need one. */
  const canAdd = props.canAdd ?? (rowPath !== null && keyColumn !== null);
  const keyOf = (row: DataRow) => String(row[keyColumn ?? ""] ?? JSON.stringify(row));
  // Rows saved in place since this page was loaded. They are shown as saved without loading again.
  const [saved, setSaved] = useState<{ of: unknown; rows: Record<string, DataRow> }>();
  const changed = saved && saved.of === pageData ? saved.rows : {};
  const rows = (pageData?.items ?? []).map((row) => changed[keyOf(row)] ?? row);
  const toFirst = { page: undefined, back: [] as string[] };
  // How many rows the filters leave, from the totals of a custom table. A source has none.
  const custom = props.rowsPath.includes("/rows/");
  const totalPath = custom
    ? `${props.rowsPath.replace("/rows/", "/aggregate/")}${filter ? `?filter=${encodeURIComponent(JSON.stringify(filter))}` : ""}`
    : null;
  const total = useLoad<{ items: { values: { count?: number } }[] }>(totalPath);
  const counted = (filterBroken ? undefined : total.data)?.items[0]?.values.count;
  const shown = rows.find((row) => keyOf(row) === url.row);
  // A link to a row that is not on the page shown reads the row by its ID, where a table can.
  const lookup = useLoad<DataRow>(
    url.row && !shown && pageData && rowPath && custom ? rowPath(url.row) : null,
  );
  const open = shown ?? lookup.data;
  const goneRow = url.row && !shown && lookup.error ? lookup.error : undefined;
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
  const exportHref =
    custom && !filterBroken
      ? `/api/v1${props.rowsPath.replace("/rows/", "/rows-export/")}?${exportQuery}`
      : null;
  const grid: GridColumn[] = order
    .flatMap((name) => columns.find((column) => column.name === name) ?? [])
    .map((column) => ({
      name: column.name,
      description: column.description,
      type: column.type,
      editable: canChange && column.writable && column.type !== "file",
      control: CELL_CONTROLS.has(column.type),
      clearable: !column.required,
      sortable: !["json", "enum_list"].includes(column.type),
      filterable: !["json", "ARRAY"].includes(column.type),
    }));
  const saveRow = async (row: DataRow, values: Record<string, unknown>) => {
    if (!rowPath) return;
    const now = await api.patch<DataRow>(rowPath(keyOf(row)), values);
    setSaved({ of: pageData, rows: { ...changed, [keyOf(row)]: now } });
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
      {may.line}
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
                Arrow keys move between cells; Enter or F2 changes one, Escape puts it back. Shift
                with Enter or a click on a heading adds a column to the sort.
              </p>
              <p className="m-0 mt-2">In a filter, type:</p>
              <ul className="m-0 mt-1 flex flex-col gap-0.5 pl-5">
                <li>text to look for, or a value to match</li>
                <li>
                  <Code>{"> 100"}</Code>, <Code>{">= 100"}</Code>, <Code>{"< 100"}</Code> or{" "}
                  <Code>{"<= 100"}</Code>
                </li>
                <li>
                  <Code>{"10..20"}</Code> for a range, both ends included. <Code>{"10.."}</Code> and{" "}
                  <Code>{"..20"}</Code> leave one end open
                </li>
                <li>
                  <Code>{"!x"}</Code> for rows that are not exactly x, <Code>{"!~x"}</Code> for text
                  that does not hold x
                </li>
                <li>
                  <Code>{"a | b"}</Code> for rows that are a or b
                </li>
                <li>
                  <Code>empty</Code> for rows with no value, <Code>{"!empty"}</Code> for rows with
                  one
                </li>
              </ul>
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
          {parts.length > 1 ? (
            <SelectField
              inline
              name="match"
              label="Rows must match"
              value={any ? "any" : "all"}
              options={[
                { value: "all", label: "every filter" },
                { value: "any", label: "any filter" },
              ]}
              onChange={(next) => setUrl({ match: next === "any" ? "any" : undefined, ...toFirst })}
            />
          ) : null}
          {viewsOf(props.rowsPath, props.tableId) ? (
            <ViewsMenu
              {...(viewsOf(props.rowsPath, props.tableId) as ViewsOf)}
              omit={["row", "page", "back"]}
            />
          ) : null}
          {exportHref ? (
            <Button size="small" href={exportHref} download>
              <Download aria-hidden="true" size={14} /> CSV
            </Button>
          ) : custom ? (
            <Button size="small" disabled>
              <Download aria-hidden="true" size={14} /> CSV
            </Button>
          ) : null}
          {canAdd ? (
            <Button
              variant="primary"
              disabled={!may.can}
              {...(may.reason ? { tooltip: may.reason } : {})}
              onClick={() => setAdding(true)}
            >
              Add row
            </Button>
          ) : null}
        </span>
      </div>
      {url.row && !shown && pageData && !open && (goneRow || !custom || !rowPath) ? (
        <Notice
          tone="attention"
          action={
            <Button size="small" onClick={() => void choose(undefined)}>
              Close
            </Button>
          }
        >
          {goneRow && (goneRow as { status?: number }).status !== 404
            ? "That row could not be read. Try the link again."
            : custom && rowPath
              ? "That row is gone: it was deleted, or its ID is not one of this table's."
              : "That row is not on this page, and this source cannot read one row alone."}
        </Notice>
      ) : null}
      {filterBroken ? (
        <Notice tone="danger">
          {Object.entries(filterErrors)
            .map(([column, message]) => `${column}: ${message}`)
            .join(" ")}
        </Notice>
      ) : null}
      {page.error ? (
        <ErrorState
          error={page.error}
          what="the rows"
          onRetry={page.reload}
          help={
            props.indexesAt && (page.error as Partial<ApiError>).code === "too_slow" ? (
              <>
                An index on the columns you filter and sort by makes this faster.{" "}
                <Link to={props.indexesAt} className="text-action underline">
                  Add an index
                </Link>
              </>
            ) : undefined
          }
        />
      ) : null}
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
            onSort={(column, additive) => {
              setUrl({ sort: nextSort(sort, column, additive), ...toFirst });
            }}
            editor={({ column: edited, value, save, cancel }) => {
              const meta = columns.find((one) => one.name === edited.name);
              return meta && CELL_CONTROLS.has(meta.type) ? (
                <CellControl
                  column={meta}
                  value={value}
                  rowsPath={props.rowsPath}
                  save={save}
                  cancel={cancel}
                />
              ) : undefined;
            }}
            filters={typed}
            filterErrors={filterErrors}
            onFilter={(column, text) => {
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
                const label = pageData?.expanded?.[column.name]?.[value];
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
              !pageData ? "" : filter ? "No rows match the filters." : "This table has no rows yet."
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
              const before = url.back.at(-1);
              setUrl({
                back: url.back.slice(0, -1),
                page: before && before !== "-" ? before : undefined,
              });
            }}
          >
            Previous
          </Button>
          <Button
            size="small"
            disabled={!pageData?.nextCursor}
            onClick={() => {
              // One step forward: the page shown now is where Previous comes back to.
              setUrl({
                back: [...url.back, url.page ?? "-"],
                page: pageData?.nextCursor ?? undefined,
              });
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

/** The types whose cell is changed in the grid by a control of its own, not by typing the raw value. */
const CELL_CONTROLS = new Set(["enum", "enum_list", "reference", "date", "timestamp"]);

/**
 * The control that changes one cell of the grid, where a value is chosen and not typed: a list's
 * value in a select, and a several-valued list, a row of another table, a day or a moment in a
 * small dialog that holds the field the row's inspector has. Escape puts the cell back.
 */
function CellControl({
  column,
  value,
  rowsPath,
  save,
  cancel,
}: {
  column: RowColumn;
  value: unknown;
  rowsPath: string;
  save: (next: unknown) => Promise<void>;
  cancel: () => void;
}) {
  const held = Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];
  const [text, setText] = useState(
    column.type === "enum_list"
      ? held.join(",")
      : column.type === "timestamp" && typeof value === "string"
        ? localWall(value, "T")
        : value == null
          ? ""
          : String(value),
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The dialog is put on the page shut and opened, so that it arrives with its motion.
  const [arrived, setArrived] = useState(false);
  useEffect(() => setArrived(true), []);
  if (column.type === "enum") {
    return (
      <select
        // biome-ignore lint/a11y/noAutofocus: the person just asked to change this cell
        autoFocus
        aria-label={column.name}
        value={text}
        disabled={busy}
        className="-mx-1.5 h-7 w-[calc(100%+0.75rem)] min-w-24 rounded-inner border border-action bg-surface px-1.5 text-ink"
        onChange={(event) => {
          const next = event.currentTarget.value;
          setText(next);
          setBusy(true);
          void save(next === "" ? null : next)
            .catch(() => undefined)
            .finally(() => setBusy(false));
        }}
        onBlur={cancel}
        onKeyDown={(event) => {
          // The grid's own keys are not for a cell being changed; the page's go on.
          if (keepsKey(event)) event.stopPropagation();
          if (event.key === "Escape") cancel();
        }}
      >
        {valueOptions(column, held[0] ?? "").map((one) => (
          <option key={one.value} value={one.value}>
            {one.label}
          </option>
        ))}
      </select>
    );
  }
  const offered = valueOptions(column, "").slice(1);
  const options = [
    ...offered,
    ...held
      .filter((one) => !offered.some((known) => known.value === one))
      .map((one) => ({ value: one, label: `${one} (no longer offered)` })),
  ];
  return (
    // A press inside the dialog bubbles through the portal to the row, which would choose it.
    // biome-ignore lint/a11y/noStaticElementInteractions: only keeps the press from reaching the row behind the dialog.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog's own controls take the keys.
    <span onClick={(event) => event.stopPropagation()}>
      <Dialog open={arrived} onClose={cancel} title={`Change ${column.name}`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(undefined);
            setBusy(true);
            try {
              await save(parseValue(column.type, text));
            } catch (caught) {
              setError(failureText(caught));
            } finally {
              setBusy(false);
            }
          }}
        >
          {column.type === "enum_list" ? (
            <MultiSelectField
              label={column.name}
              inline
              value={listOf(text)}
              options={options}
              onChange={(next) => setText(next.join(","))}
            />
          ) : column.type === "reference" ? (
            <ReferenceField column={column} rowsPath={rowsPath} value={text} onChange={setText} />
          ) : (
            <DateField
              name={column.name}
              label={column.name}
              value={text}
              required={false}
              {...(column.type === "timestamp" ? { withTime: true, hint: "Your time zone." } : {})}
              onChange={setText}
            />
          )}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button onClick={cancel}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </span>
  );
}

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
      required={column.required}
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
 * What a typed search asks of a table whose rows are named by this column: text is looked for
 * inside the name, a number or a yes or no is matched whole, and a column that cannot be searched
 * (JSON, a file, a list) or text that does not read as its type asks for nothing.
 */
export function pickerFilter(
  display: string | undefined,
  type: string | undefined,
  text: string,
): object | null {
  const typed = text.trim();
  if (!display || typed === "") return null;
  if (type === undefined || type === "text")
    return { column: display, op: "contains", value: text };
  if (["json", "file", "enum_list"].includes(type)) return null;
  try {
    return { column: display, op: "eq", value: parseValue(type, typed) };
  } catch {
    return null;
  }
}

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
  const asked = pickerFilter(
    display,
    table.data?.columns?.find((one) => one.name === display)?.type,
    sent,
  );
  const filter = asked ? `&filter=${encodeURIComponent(JSON.stringify(asked))}` : "";
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
  // The ID is typed only where the table cannot be read at all. A search that fails keeps the picker.
  if (!root || table.error || (rows.error && !filter)) {
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
      required={column.required}
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

/** The button of a file field, in the inspector and in Add row: it chooses a file, or replaces the one there is. */
function ChooseFileButton({
  chosen,
  loading,
  onClick,
}: {
  chosen: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <Button {...(loading !== undefined ? { loading } : {})} onClick={onClick}>
      {chosen ? "Replace" : "Choose a file"}
    </Button>
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
    // With no file there is nothing to replace and no history to say: choosing one just adds it.
    const sure =
      (!has && next) ||
      (await ask.confirm({
        title: next
          ? `Replace the file in ${column.name}?`
          : `Remove the file from ${column.name}?`,
        text: `${
          next ? `${next.name} takes its place. ` : "The row will have no file. "
        }The old file stays in this row's history, until that history expires.`,
        action: next ? "Replace" : "Remove",
        danger: next === null,
      }));
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
      notify.success(next ? (has ? "File replaced." : "File added.") : "File removed.");
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
            <ChooseFileButton chosen={has} loading={busy} onClick={() => input.current?.click()} />
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

/** What a refused save says of each field it names, by the column's name: for the field itself. */
function fieldMessages(error: unknown): Record<string, string> {
  return Object.fromEntries(
    ((error as ApiError).fields ?? []).map((field) => [field.path.slice(1), field.message]),
  );
}

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
          : column.type === "timestamp"
            ? // The reader's own clock, as a date field holds it; what is stored shows on hover.
              localWall(String(row[column.name]), "T")
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
          // A refusal that names fields says so under each; one that names none is a toast.
          const named = fieldMessages(error);
          setErrors(named);
          if (Object.keys(named).length === 0) notify.error(error);
          else notify.error(new Error((error as Error).message));
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
        ) : editable &&
          column.writable &&
          (column.type === "date" || column.type === "timestamp") ? (
          <DateField
            key={column.name}
            name={column.name}
            label={column.name}
            value={text[column.name] ?? shown(column)}
            required={column.required}
            {...(column.type === "timestamp" ? { withTime: true } : {})}
            {...(column.type === "timestamp" && typeof row[column.name] === "string"
              ? { hint: `Your time zone. Stored as ${utcOf(String(row[column.name]))}` }
              : {})}
            error={errors[column.name]}
            onChange={(value) => setText((current) => ({ ...current, [column.name]: value }))}
          />
        ) : editable && column.writable && column.type !== "file" && roomy(column) ? (
          <TextAreaField
            key={column.name}
            name={column.name}
            label={column.name}
            value={text[column.name] ?? shown(column)}
            required={column.required}
            error={errors[column.name]}
            onChange={(value) => setText((current) => ({ ...current, [column.name]: value }))}
          />
        ) : editable && column.writable && column.type !== "file" ? (
          <TextField
            key={column.name}
            name={column.name}
            label={column.name}
            value={text[column.name] ?? shown(column)}
            required={column.required}
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
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The files this form has stored, by column, so a try that is refused does not store them again.
  const uploaded = useRef<Record<string, { file: File; id: string }>>({});
  // Opened again, it does not still hold what the last try was refused for.
  useEffect(() => {
    if (open) {
      setErrors({});
      setFailure(undefined);
    }
  }, [open]);

  const submit = async () => {
    const row: DataRow = {};
    const found: Record<string, string> = {};
    for (const column of columns) {
      if (column.type === "file") continue;
      if (column.required && (values[column.name] ?? "").trim() === "") {
        found[column.name] = `${column.name} needs a value.`;
        continue;
      }
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
        // A file already stored for this form is kept between tries: a refused row does not
        // upload it again and leave one that no row names.
        let stored = uploaded.current[column];
        if (stored?.file !== file) {
          const made = await api.upload<{ id: string }>(
            `${filesPath}?name=${encodeURIComponent(file.name)}`,
            file,
          );
          stored = { file, id: made.id };
          uploaded.current[column] = stored;
        }
        row[column] = stored.id;
      }
      await api.post(rowsPath, row);
      notify.success("Row added.");
      setValues({});
      setFiles({});
      uploaded.current = {};
      onAdded();
    } catch (caught) {
      setErrors(fieldMessages(caught));
      setFailure((caught as Error).message);
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
        noValidate
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
              required={column.required}
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
            <div key={column.name} className="flex flex-col gap-1">
              <span className="text-body-sm text-ink-muted">{column.name}</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  hidden
                  aria-label={`File for ${column.name}`}
                  ref={(node) => {
                    fileInputs.current[column.name] = node;
                  }}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    setFiles((current) => {
                      const { [column.name]: _removed, ...rest } = current;
                      return file ? { ...rest, [column.name]: file } : rest;
                    });
                  }}
                />
                <ChooseFileButton
                  chosen={Boolean(files[column.name])}
                  onClick={() => fileInputs.current[column.name]?.click()}
                />
                {files[column.name] ? (
                  <>
                    <span className="font-mono text-code break-all">
                      {files[column.name]?.name}
                    </span>
                    <Button
                      onClick={() => {
                        const input = fileInputs.current[column.name];
                        if (input) input.value = "";
                        setFiles((current) => {
                          const { [column.name]: _removed, ...rest } = current;
                          return rest;
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <span className="text-ink-subtle">No file chosen</span>
                )}
              </div>
            </div>
          ) : column.type === "date" || column.type === "timestamp" ? (
            <DateField
              key={column.name}
              name={column.name}
              label={column.name}
              value={values[column.name] ?? ""}
              required={column.required}
              {...(column.type === "timestamp" ? { withTime: true } : {})}
              hint={`${typeLabel(column.type)}${column.required ? "" : ", optional"}${column.type === "timestamp" ? ", in your time zone." : ""}`}
              error={errors[column.name]}
              onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
            />
          ) : column.type === "json" ? (
            <TextAreaField
              key={column.name}
              name={column.name}
              label={column.name}
              value={values[column.name] ?? ""}
              required={column.required}
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
              required={column.required}
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
  /** Tells apart two retired tables that had one name. */
  id?: string;
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
      needs={{ base: root, permission: "resource:write", what: "this workspace's tables" }}
      description="The data this workspace keeps. A table defined in the repository changes when a bundle is deployed. Nothing is ever dropped by a deploy: what leaves a definition is retired and its data kept."
      path={`${root}/tables`}
      rowKey={(row) => `${row.name}:${row.status}:${row.id ?? ""}`}
      columns={[
        {
          header: "Table",
          // The list is table-layout: fixed, so widths are the only say a column has. A name is not cut:
          // the longest real ones (purchase_orders, supplier_contacts) fit.
          width: "w-[12rem]",
          cell: (row) => (
            <span className="inline-flex items-center gap-2">
              <Link
                to={`${link}/tables/${row.name}${row.status === "retired" && row.id ? `?id=${row.id}` : ""}`}
                className="min-w-0 truncate font-medium text-action"
              >
                {row.name}
              </Link>
              {/* The pill keeps its word whole: it is the name that gives way. */}
              {row.status === "retired" ? (
                <span className="shrink-0">
                  <StatePill state="retired" />
                </span>
              ) : null}
            </span>
          ),
        },
        {
          header: "What it holds",
          priority: 2,
          // The words get the room the short columns leave: at 1440 they were four lines in a quarter.
          width: "w-[34%]",
          cell: (row) => (
            <span className="text-ink-muted">
              {row.description ? <TermText>{row.description}</TermText> : null}
            </span>
          ),
        },
        {
          header: "Managed in",
          priority: 3,
          cell: (row) => ownershipWord(row.managedIn),
        },
        { header: "Who sees rows", priority: 3, cell: (row) => policyText(row.policy) },
        { header: "Columns", priority: 2, cell: (row) => row.columnCount, align: "end" },
        { header: "Rows", cell: (row) => count(row.rowCount), align: "end" },
      ]}
      empty={{
        title: "No tables yet",
        text: "Write a <path>.table.yaml file in your repository's resources folder (or use defineTable in code) and deploy it, or create one here to try things out.",
      }}
      create={{
        action: "Create table",
        description:
          "A table made here is managed as files, which the console and the repository both edit. Every table also gets an ID and the times each row was created and changed.",
        fields: [
          {
            name: "name",
            label: "Name",
            placeholder: "notes",
            hint: "Lowercase letters, digits and dashes.",
          },
          {
            name: "description",
            label: "What it holds",
            required: false,
            placeholder: "Notes taken in meetings",
            hint: "In plain words. Shown under the table's name.",
            maxLength: 500,
          },
          { name: "column", label: "First column", placeholder: "title" },
          { name: "type", label: "It holds", options: TYPES },
          {
            name: "references",
            label: "Which table",
            required: false,
            when: (values) => values.type === "reference",
            choose: {
              path: `${root}/tables`,
              option: (item: { name: string; status?: string }) =>
                item.status === "retired" ? undefined : { value: item.name, label: item.name },
            },
          },
          VALUES_FIELD,
          {
            name: "more",
            label: "More columns",
            render: ({ value, onChange }) => (
              <MoreColumnsField root={root} value={value} onChange={onChange} />
            ),
          },
          {
            name: "policy",
            label: "Who sees rows",
            options: [
              { value: "open", label: "Everyone who may use the table sees every row" },
              { value: "owner", label: "Each person sees only the rows they added" },
            ],
            hint: "Changed later, with more rules, under Definition. A table of each person's own rows gets an owner_id column that holds who added the row.",
          },
        ],
        submit: async ({
          name = "",
          description = "",
          column = "",
          type = "text",
          references,
          values,
          more,
          policy = "open",
        }) => {
          const made: Record<string, Record<string, unknown>> = {};
          const add = (columnName: string, kind: string, listed?: string, table?: string) => {
            if (!columnName.trim()) throw new Error("Name every column, or remove the empty one.");
            if (made[columnName] || ["id", "created_at", "updated_at"].includes(columnName))
              throw new Error(
                `There is already a column called "${columnName}". Choose another name.`,
              );
            if (kind === "reference" && !table)
              throw new Error(`Choose the table that "${columnName}" points to.`);
            made[columnName] = {
              ...newColumn(kind, listed),
              ...(kind === "reference" ? { references: table } : {}),
            };
          };
          add(column, type, values, references);
          for (const extra of draftsOf(more ?? ""))
            add(extra.name.trim(), extra.type, extra.values, extra.references);
          if (policy === "owner" && !made.owner_id) made.owner_id = { type: "uuid" };
          await api.put(`${root}/resources/${name}`, {
            kind: "table",
            schemaVersion: 1,
            ownership: "ui",
            body: {
              ...(description.trim() ? { description: description.trim() } : {}),
              columns: made,
              ...(policy === "owner" ? { policy: { type: "owner", column: "owner_id" } } : {}),
            },
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
  /** The indexes the definition lists, each a list of column names. */
  indexes?: string[][];
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
  // Two retired tables can have had one name: the list opens the one it shows by its ID.
  const [which] = useUrlParam("id");
  const table = useLoad<TableDetail>(`${root}/tables/${name}${which ? `?id=${which}` : ""}`);
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
      description={`${data.description ? `${data.description.replace(/\.?\s*$/, ".")} ` : ""}${counted(data.rowCount, "row")}. ${policyText(data.policy)}. ${ownershipSentence(data.managedIn, retired)}`}
    >
      <AttachedPages {...workspaceOf(root)} kind="table" path={data.name} />
      {retired ? (
        <Notice
          tone="attention"
          action={
            <span className="flex flex-wrap gap-2">
              {data.managedIn === "ui" ? (
                <BringBackButton root={root} table={data} onDone={table.reload} />
              ) : null}
              <PurgeButton
                root={root}
                table={data.name}
                {...(data.id ? { tableId: data.id } : {})}
                onDone={() => navigate(`${link}/tables`)}
              />
            </span>
          }
        >
          This table is retired. It left its definition, so nothing can read or write it, and its{" "}
          {counted(data.rowCount, "row")} {data.rowCount === 1 ? "is" : "are"} kept.{" "}
          {data.managedIn === "ui"
            ? "Bring it back to use it again, with its columns, its rows and who sees them as they were."
            : "Deploying a definition with this name brings it back."}
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
          tableId={data.id}
          {...(data.managedIn === "ui"
            ? { indexesAt: `${link}/tables/${data.name}?view=definition&at=indexes` }
            : {})}
          needs={{
            base: root,
            permission: "data:write",
            what: "the rows of this table",
            resource: { kind: "table", path: data.name },
          }}
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

/**
 * The definition a retired table comes back with: its active columns as the catalog holds them,
 * and who sees its rows. What the definition said that the catalog does not (the columns' words)
 * is not kept, and retired columns stay retired.
 */
export function bodyOfRetired(table: TableDetail): TableBody {
  const columns: TableBody["columns"] = {};
  for (const column of table.columns.filter((one) => one.status === "active")) {
    columns[column.name] = {
      type: column.type,
      ...(column.required ? { required: true } : {}),
      ...(column.unique ? { unique: true } : {}),
      ...(column.default !== null && column.default !== undefined
        ? { default: column.default }
        : {}),
      ...(column.references ? { references: column.references } : {}),
      ...(column.references && column.onDelete && column.onDelete !== "restrict"
        ? { onDelete: column.onDelete }
        : {}),
      ...(column.values ? { values: column.values } : {}),
      ...(column.description ? { description: column.description } : {}),
    };
  }
  return {
    columns,
    ...(table.description ? { description: table.description } : {}),
    policy: table.policy as TableBody["policy"],
    ...(table.display ? { display: table.display } : {}),
    ...(table.indexes && table.indexes.length > 0 ? { indexes: table.indexes } : {}),
  } as TableBody;
}

/** Makes a retired table of the console active again, by saving the definition it had. */
function BringBackButton({
  root,
  table,
  onDone,
}: {
  root: string;
  table: TableDetail;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Bringing a table back saves its definition again: `PUT resources/*` asks resource:write.
  const need = useNeeds({ base: root, permission: "resource:write", what: "this table" });
  return (
    <Button
      size="small"
      loading={busy}
      {...(need.can ? {} : { disabled: true, tooltip: need.reason })}
      onClick={async () => {
        setBusy(true);
        try {
          await api.put(`${root}/resources/${table.name}`, {
            kind: "table",
            schemaVersion: 1,
            ownership: "ui",
            body: bodyOfRetired(table),
          });
          notify.success(`The table ${table.name} is back, with its rows.`);
          onDone();
        } catch (error) {
          notify.error(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      Bring back
    </Button>
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
  // `POST table-purges` asks table:write, which a person who may edit definitions need not hold.
  const need = useNeeds({ base: root, permission: "table:write", what: "retired data" });
  return (
    <RemoveButton
      label="Delete for good"
      disabled={need.can ? undefined : need.reason}
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

/** The values of an enum column: what each is called, the color it is drawn on, and their order. */
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
  /** The column that stands for a row where another table refers to it. */
  display?: string;
  indexes?: string[][];
  [key: string]: unknown;
}

/**
 * Renames a column, or with no new name retires it, everywhere the definition names it: the
 * column that stands for a row, the indexes, and the rules for who sees rows. One piece for
 * both, so a rename never leaves a name behind that the server then refuses, and a retire
 * never leaves an index or a display on a column that is gone. A column a rule needs to say
 * whose a row is cannot be retired until that rule is changed, and the message says which.
 */
export function moveColumn(body: TableBody, from: string, to?: string) {
  const policy = body.policy;
  const rules = policy?.rules ?? [];
  if (to === undefined) {
    if (policy?.type === "owner" && policy.column === from) {
      throw new Error(
        `"${from}" says whose a row is, in this table's rule for who sees rows. Change that rule, then retire the column.`,
      );
    }
    const used = rules.findIndex((rule) => "column" in rule.when && rule.when.column === from);
    if (used >= 0) {
      throw new Error(
        `"${from}" is used by rule ${used + 1} of who sees rows. Change that rule, then retire the column.`,
      );
    }
  }
  const { [from]: definition, ...others } = body.columns;
  body.columns = others;
  if (to !== undefined && definition) {
    const { renamedFrom: _old, ...kept } = definition;
    body.columns[to] = { ...kept, renamedFrom: from };
  }
  if (body.display === from) {
    if (to !== undefined) body.display = to;
    else delete body.display;
  }
  if (body.indexes) {
    const moved = body.indexes
      .map((index) =>
        to !== undefined
          ? index.map((name) => (name === from ? to : name))
          : index.filter((name) => name !== from),
      )
      .filter((index) => index.length > 0);
    if (moved.length > 0) body.indexes = moved;
    else delete body.indexes;
  }
  if (to !== undefined) {
    if (policy?.column === from) policy.column = to;
    for (const rule of rules) {
      if ("column" in rule.when && rule.when.column === from) rule.when.column = to;
    }
  }
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

/**
 * A value as text with its keys in order, so that two that say the same compare equal whatever order
 * the store returned their keys in (a rule comes back with `when` before `allow`).
 */
function sameJson(value: unknown): string {
  return JSON.stringify(value, (_key, each) =>
    each && typeof each === "object" && !Array.isArray(each)
      ? Object.fromEntries(Object.entries(each).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : each,
  );
}

/**
 * A table's columns. From a tablet up each is a row of cells with its actions as buttons in the last
 * one. On a phone the Rules and "When not given" cells are hidden by priority, and a last column
 * would sit past the right edge, so the rules and the default stand under the name and the actions
 * are one menu there, both seen at first view and reached with no sideways scroll.
 */
export function ColumnsTable({
  rows,
  actionsOf,
}: {
  rows: TableColumn[];
  actionsOf: ((row: TableColumn) => ColumnAction[]) | undefined;
}) {
  const roomy = useWide(640);
  const rulesOf = (row: TableColumn) =>
    [row.required ? "Required" : "", row.unique ? "No two rows alike" : ""]
      .filter(Boolean)
      .join(", ");
  const defaultOf = (row: TableColumn) =>
    row.default === null || row.default === undefined ? (
      ""
    ) : (
      <Code>{showValue(row.type, row.default)}</Code>
    );
  return (
    <DataTable<TableColumn>
      variant="static"
      framed
      label="Columns"
      rows={rows}
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
                  <TermText>{row.description}</TermText>
                </span>
              ) : null}
              {roomy ? null : (
                <span data-column-stack className="flex flex-col gap-1 text-meta">
                  {rulesOf(row) ? <span>{rulesOf(row)}</span> : null}
                  {row.default === null || row.default === undefined ? null : (
                    <span>When not given: {defaultOf(row)}</span>
                  )}
                  {actionsOf ? (
                    <span>
                      <Menu
                        ariaLabel={`Actions for ${row.name}`}
                        triggerClassName="inline-flex size-9 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
                        label={<Ellipsis aria-hidden="true" size={16} />}
                        items={actionsOf(row).filter((one) => !one.disabled)}
                      />
                    </span>
                  ) : null}
                </span>
              )}
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
          cell: rulesOf,
        },
        {
          header: "When not given",
          priority: 3,
          cell: defaultOf,
        },
        ...(actionsOf && roomy
          ? [
              {
                header: "",
                align: "end" as const,
                // Up to five buttons: they wrap inside the column, and it keeps room for two rows of them.
                wide: true,
                cell: (row: TableColumn) => (
                  <span className="flex flex-wrap justify-end gap-1">
                    {actionsOf(row).map((one) => (
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
                ),
              },
            ]
          : []),
      ]}
    />
  );
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
  // A definition is saved as a resource of the workspace: `PUT resources/*` asks resource:write.
  const mayDefine = useNeeds({
    base: root,
    permission: "resource:write",
    what: "this table's definition",
  });
  const editable = table.managedIn === "ui" && table.status === "active" && mayDefine.can;
  // A production workspace changes by a deploy only: a table in code is not taken over there.
  const production = useLoad<{ type?: string }>(root).data?.type === "production";
  const [takingOver, setTakingOver] = useState(false);
  // `/tenants/<id>`, the part of the workspace's address the tenant's people are listed under.
  const tenantBase = root.split("/workspaces/")[0];
  const [adding, setAdding] = useState(false);
  // The column whose values, or whose rule for a delete, are being changed.
  const [optionsOf, setOptionsOf] = useState<TableColumn>();
  // The column whose rules (required, no two alike, what it is given) or whose type is being changed.
  const [rulesOf, setRulesOf] = useState<TableColumn>();
  const [typeOf, setTypeOf] = useState<TableColumn>();
  const [indexing, setIndexing] = useState(false);
  // A link from a read that was stopped for taking too long lands here, on the indexes.
  const [at] = useUrlParam("at", "");
  const indexesHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (at === "indexes") indexesHeading.current?.scrollIntoView?.({ block: "start" });
  }, [at]);
  const indexes = table.indexes ?? [];
  const [failure, setFailure] = useState<string>();
  // What was chosen for "What stands for a row" shows at once, until the save has answered.
  const [chosenDisplay, setChosenDisplay] = useState<string>();
  // The rules editor is started afresh when the rules change from elsewhere (an undo, a deploy),
  // and not when its own save comes back: it would lose its "Saved" and its place.
  const rules = useRef<{ json: string; own: string | undefined; version: number }>({
    json: sameJson(table.policy),
    own: undefined,
    version: 0,
  });
  const policyNow = sameJson(table.policy);
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
      // Another window's change is on the page already (it is read again below): it is not to be reloaded.
      setFailure(
        error instanceof ApiError && error.code === "draft_changed"
          ? `Someone else changed ${table.name} after you opened it. This page shows what is saved now, so undo and redo start again from there.`
          : `${failureText(error)} Undo and redo start again from what is saved now.`,
      );
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
      maxLength: 500,
    });
    if (next === null) return;
    const said = next.trim();
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
        setFailure(withCode(first ? `${caught.message} ${first.message}` : caught.message, caught));
      }
      throw error;
    }
  };
  const quietly = (run: Promise<unknown>) => run.catch(() => undefined);

  /** Takes a table defined in code over: saves its definition as files, which the console edits. */
  const takeOver = async () => {
    const sure = await ask.confirm({
      title: `Take over ${table.name} in the console?`,
      text: (
        <>
          {takeOverConsequence("table")} Scripts typed against its <Code>{"defineTable"}</Code>{" "}
          export should use <Code>{`ctx.table("${table.name}")`}</Code>, which is typed from the
          generated types.
        </>
      ),
      action: "Take over",
    });
    if (!sure) return;
    setTakingOver(true);
    setFailure(undefined);
    try {
      const resource = await api.get<{ body: TableBody; version?: number }>(
        `${root}/resources/${table.name}`,
      );
      const saved = await api.put<{ version?: number }>(`${root}/resources/${table.name}`, {
        kind: "table",
        schemaVersion: 1,
        ownership: "ui",
        takeOver: true,
        body: resource.body,
        ...(resource.version !== undefined ? { version: resource.version } : {}),
      });
      held.current = saved.version;
      stored.current = resource.body;
      notify.success(`${table.name} is managed in the console now.`);
      reload();
    } catch (error) {
      const caught = error as ApiError;
      setFailure(withCode(caught.message, caught));
    } finally {
      setTakingOver(false);
    }
  };

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
    ...(hasNoDefault(row.type) && row.type === "file"
      ? []
      : [{ label: "Rules", onSelect: () => setRulesOf(row) }]),
    ...(row.references || typesFrom(row.type).length > 1
      ? [
          {
            label: row.references ? "Change table" : "Change type",
            onSelect: () => setTypeOf(row),
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
          maxLength: 500,
        });
        if (next === null) return;
        const said = next.trim();
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
                  moveColumn(body, row.name, next);
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
          change((body) => moveColumn(body, row.name), { label: `retiring ${row.name}` }),
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {table.status === "active" && table.managedIn !== "ui" ? (
        <Notice
          tone="attention"
          action={
            production || !mayDefine.can ? undefined : (
              <Button size="small" loading={takingOver} onClick={() => void takeOver()}>
                Take over in the console
              </Button>
            )
          }
        >
          This table is defined in code, in the tenant's repository. To change it, change{" "}
          <Code>{"defineTable"}</Code> there and deploy
          {production
            ? ". A production workspace changes by a deploy only."
            : ", or take it over here: it is then managed as files, and you remove its definition from the code after a volvel pull."}
        </Notice>
      ) : null}
      {table.managedIn === "ui" || table.status === "active" ? mayDefine.line : null}
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
        <ColumnsTable rows={active} actionsOf={editable ? columnActions : undefined} />
        <p className="m-0 text-body-sm text-ink-muted">
          Every table also has <Code>{"id"}</Code>, <Code>{"created_at"}</Code> and{" "}
          <Code>{"updated_at"}</Code>, which Volvel fills in.
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
              { header: "Held", priority: 2, cell: (row) => typeLabel(row.type) },
              {
                header: "Still holds",
                priority: 2,
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

      <section className="flex flex-col gap-2" aria-labelledby="indexes-heading">
        <h2
          id="indexes-heading"
          ref={indexesHeading}
          tabIndex={-1}
          className="m-0 text-title font-semibold"
        >
          Indexes
        </h2>
        <p className="m-0 max-w-measure text-ink-muted">
          An index on the columns rows are filtered or sorted by keeps a read of a large table from
          being stopped for taking too long. It makes writes a little slower.
        </p>
        {indexes.length === 0 ? (
          <p className="m-0 text-ink-muted">No indexes. Only the ID is indexed.</p>
        ) : (
          <DataTable<{ columns: string[] }>
            variant="static"
            framed
            label="Indexes"
            rows={indexes.map((columns) => ({ columns }))}
            rowKey={(row) => row.columns.join(",")}
            empty={null}
            columns={[
              {
                header: "Columns, in order",
                cell: (row) => <Code>{row.columns.join(", ")}</Code>,
              },
              ...(editable
                ? [
                    {
                      header: "",
                      align: "end" as const,
                      cell: (row: { columns: string[] }) => (
                        <Button
                          size="small"
                          variant="quiet"
                          aria-label={`Remove the index on ${row.columns.join(", ")}`}
                          onClick={() =>
                            void quietly(
                              change(
                                (body) => {
                                  const left = (body.indexes ?? []).filter(
                                    (one) => one.join(",") !== row.columns.join(","),
                                  );
                                  if (left.length > 0) body.indexes = left;
                                  else delete body.indexes;
                                },
                                { label: `removing the index on ${row.columns.join(", ")}` },
                              ),
                            )
                          }
                        >
                          Remove
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
        {editable ? (
          <div>
            <Button
              size="small"
              disabled={indexes.length >= MAX_INDEXES}
              onClick={() => setIndexing(true)}
            >
              Add an index
            </Button>
            {indexes.length >= MAX_INDEXES ? (
              <span className="ml-2 text-body-sm text-ink-muted">
                A table has at most {MAX_INDEXES} indexes. Remove one to add another.
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-title font-semibold">Who sees rows</h2>
        {editable ? (
          <RowRulesEditor
            key={`${table.name}:${rules.current.version}`}
            policy={table.policy as Policy}
            columns={active}
            onSave={(policy) => {
              rules.current.own = sameJson(policy);
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
          <SeeItAs
            root={root}
            table={table.name}
            usersPath={`${tenantBase}/end-users`}
            columns={table.columns}
            groupsPaths={{
              endUsers: `${tenantBase}/end-user-groups`,
              members: `${tenantBase}/groups`,
            }}
          />
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
      <IndexDialog
        key={indexes.length}
        open={indexing}
        columns={[...active.map((column) => column.name), "created_at", "updated_at", "id"]}
        existing={indexes}
        onClose={() => setIndexing(false)}
        onSave={(columns) =>
          change(
            (body) => {
              body.indexes = [...(body.indexes ?? []), columns];
            },
            { report: false, label: `the index on ${columns.join(", ")}` },
          )
        }
      />
      <Closing subject={rulesOf}>
        {(column, shown) => (
          <ColumnRulesDialog
            key={column.name}
            open={shown}
            column={column}
            onClose={() => setRulesOf(undefined)}
            onSave={(edit) =>
              change(
                (body) => {
                  const definition = body.columns[column.name];
                  if (definition) edit(definition);
                },
                { report: false, label: `the rules of ${column.name}` },
              )
            }
          />
        )}
      </Closing>
      <Closing subject={typeOf}>
        {(column, shown) => (
          <ChangeTypeDialog
            key={column.name}
            root={root}
            open={shown}
            column={column}
            onClose={() => setTypeOf(undefined)}
            onSave={(edit) =>
              change(
                (body) => {
                  const definition = body.columns[column.name];
                  if (definition) edit(definition);
                },
                {
                  report: false,
                  label: column.references
                    ? `the table ${column.name} points to`
                    : `the type of ${column.name}`,
                },
              )
            }
          />
        )}
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
            VALUES_FIELD,
            {
              name: "required",
              label: "Must every row have one?",
              options: [
                { value: "no", label: "No" },
                { value: "yes", label: "Yes" },
              ],
            },
            {
              name: "unique",
              label: "Must every row's value be different?",
              options: [
                { value: "no", label: "No" },
                { value: "yes", label: "Yes: no two rows alike" },
              ],
              when: (values) => !["json", "file", "enum_list"].includes(values.type ?? "text"),
            },
            {
              name: "fallback",
              label: "Value when none is given",
              required: false,
              when: (values) => !hasNoDefault(values.type ?? "text"),
              render: ({ value, values, error, onChange }) => (
                <DefaultField
                  // A new control when the type changes: a yes/no and a date hold different text.
                  key={values.type ?? "text"}
                  type={values.type ?? "text"}
                  values={listOf(values.values ?? "")}
                  value={value}
                  error={error}
                  onChange={onChange}
                />
              ),
            },
          ],
          done: (_result, sent) => `The column ${sent.name} was added.`,
          submit: ({
            name = "",
            type = "text",
            references,
            onDelete,
            values,
            required,
            unique,
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
                  ...(unique === "yes" ? { unique: true } : {}),
                  ...(fallback && !hasNoDefault(type)
                    ? { default: parseValue(type, fallback) }
                    : {}),
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
  /** Some resource of the workspace declares it, so there is a declaration to edit. */
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

/** Whether a password kept for the source would reach somewhere else (the server's D10, as the form sees it). */
function pointsElsewhere(was: SourceBinding["config"], now: Record<string, string | undefined>) {
  if (!was) return false;
  return (
    (was.host ?? "").toLowerCase() !== (now.host ?? "").toLowerCase() ||
    (was.port ?? 5432) !== (now.port ? Number(now.port) : 5432) ||
    was.user !== now.user ||
    (was.ssl === true && now.ssl !== "yes")
  );
}

/** Changes how a connected source is reached, from what it is now. The password stays unless one is typed. */
function ChangeSource({
  root,
  row,
  onDone,
  need,
}: {
  root: string;
  row: SourceBinding;
  onDone: () => void;
  need: { can: boolean; reason?: string | undefined };
}) {
  const [open, setOpen] = useState(false);
  const config = row.config;
  return (
    <>
      <Button
        size="small"
        disabled={!need.can}
        {...(need.reason ? { tooltip: need.reason } : {})}
        onClick={() => setOpen(true)}
      >
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
          fields: [
            ...SOURCE_FIELDS,
            ...(row.hasPassword
              ? [
                  {
                    name: "removePassword",
                    label: "Remove the stored password",
                    type: "checkbox" as const,
                    required: false,
                    hint: "For a database that lets this user in without one. Scripts that use it then connect with no password.",
                  },
                ]
              : []),
          ],
          done: () => `${row.path} was changed.`,
          submit: (values) => {
            // The stored password does not go to another address: it is asked for here, not lost in silence.
            if (row.hasPassword && !values.password && pointsElsewhere(config, values))
              throw new Error(
                "The host, port, user or encryption changed, so the stored password will not be sent there. Type the password again.",
              );
            const body = sourceBody(values);
            if (values.removePassword === "true" && values.password)
              throw new Error("Either type a new password or remove the stored one, not both.");
            return api.put(
              `${root}/data-source-bindings/${row.path}`,
              values.removePassword === "true" ? { ...body, password: null } : body,
            );
          },
        }}
      />
    </>
  );
}

/** Connects a source that is declared and not yet reached: its own button, with its name already in. */
function ConnectSource({
  root,
  row,
  onDone,
}: {
  root: string;
  row: SourceBinding;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const need = useSourceWrite(root);
  return (
    <>
      <Button
        size="small"
        variant="primary"
        disabled={!need.can}
        {...(need.reason ? { tooltip: need.reason } : {})}
        aria-label={`Connect ${row.path}`}
        onClick={() => setOpen(true)}
      >
        Connect
      </Button>
      <CreateDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          onDone();
        }}
        config={{
          action: `Connect ${row.path}`,
          description:
            "Where this workspace reaches the database. The password is stored sealed and never shown again. Volvel never changes the database's structure.",
          fields: SOURCE_FIELDS,
          done: () => `${row.path} was connected.`,
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
  need,
}: {
  root: string;
  row: SourceBinding;
  onDone: () => void;
  need: { can: boolean; reason?: string | undefined };
}) {
  const [testing, setTesting] = useState(false);
  return (
    <Button
      size="small"
      loading={testing}
      disabled={!need.can}
      {...(need.reason ? { tooltip: need.reason } : {})}
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
  const sourceUses = useReferences(root, "data_source");
  // Declaring a source is a resource of the workspace, which `PUT resources/*` guards.
  const declare = useNeeds({
    base: root,
    permission: "resource:write",
    what: "this workspace's data sources",
  });
  return (
    <ListScreen<SourceBinding>
      title="Data sources"
      needs={{ base: root, permission: "data_source:write", what: "this workspace's data sources" }}
      setupField="path"
      description="Databases outside Volvel that this workspace reads and writes. The address and password are set here, never in the repository, so dev and production can point at different databases."
      path={`${root}/data-source-bindings`}
      rowKey={(row) => row.path}
      action={
        <Button
          disabled={!declare.can}
          {...(declare.reason ? { tooltip: declare.reason } : {})}
          onClick={() => navigate(`${link}/resources/new/data_source`)}
        >
          Declare source
        </Button>
      }
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
          cell: (row) => (
            <span className="text-ink-muted">
              {row.description ? <TermText>{row.description}</TermText> : null}
            </span>
          ),
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
          header: "Used by",
          priority: 2,
          cell: (row) => (
            <UsedBy
              uses={sourceUses(row.path)}
              failed={sourceUses.failed}
              loaded={sourceUses.loaded}
              link={link}
            />
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
      rowActions={(row, reload) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          {row.defined ? (
            declare.can ? (
              <Link
                to={`${link}/resources/edit/data_source/${row.path}`}
                aria-label={`Edit ${row.path}`}
                className="text-action"
              >
                Edit
              </Link>
            ) : (
              <Button
                size="small"
                disabled
                aria-label={`Edit ${row.path}`}
                {...(declare.reason ? { tooltip: declare.reason } : {})}
              >
                Edit
              </Button>
            )
          ) : null}
          {row.bound ? (
            // The list's column of actions says where they sit and wraps them (kit/rowActions.tsx).
            <SourceActions root={root} row={row} onDone={reload} />
          ) : (
            <ConnectSource root={root} row={row} onDone={reload} />
          )}
        </span>
      )}
      empty={{
        title: "No data sources yet",
        text: "Connect a Postgres database you already have. Its tables can then be browsed here and used by scripts.",
      }}
      create={{
        action: "Connect database",
        description:
          "Connecting a source that is already connected replaces its details. Leave the password empty to keep the stored one. It is dropped when the host, port or user changes or encryption is turned off: then type it again. Volvel never changes the database's structure.",
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

/** What the server asks to test, connect, change or remove a source here: `data_source:write`. */
function useSourceWrite(root: string) {
  return useNeeds({
    base: root,
    permission: "data_source:write",
    what: "this workspace's data sources",
  });
}

/** Test, Change and Remove from here of a bound data source: the list's row and the source's own page share them. */
function SourceActions({
  root,
  row,
  onDone,
  onUnbound = onDone,
  className = "",
}: {
  root: string;
  row: SourceBinding;
  onDone: () => void;
  /** Told once the source is unbound, when that leaves nothing to show (its page). */
  onUnbound?: () => void;
  className?: string;
}) {
  const need = useSourceWrite(root);
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <TestSource root={root} row={row} onDone={onDone} need={need} />
      <ChangeSource root={root} row={row} onDone={onDone} need={need} />
      <RemoveButton
        label="Remove from here"
        disabled={need.can ? undefined : need.reason}
        confirm={`Remove "${row.path}" from here? Scripts that use it will fail until it is set up again. Nothing in that database changes.`}
        run={() => api.delete(`${root}/data-source-bindings/${row.path}`)}
        onDone={onUnbound}
      />
    </span>
  );
}

interface SourceTable {
  name: string;
  key: string | null;
  columns: (RowColumn & { hasDefault?: boolean })[];
}

/**
 * What a source that could not be read says. An answer with no reason of its own, from a source
 * set to encrypt, most likely met a server that does not offer encrypted connections: said so, with
 * the way out, instead of "Internal Server Error".
 */
export function sourceFailure(message: string, binding: SourceBinding | undefined): string {
  if (!/^internal server error\.?$/i.test(message.trim())) return message;
  return binding?.config?.ssl
    ? `${binding.path} could not be read. It is set to encrypt, and its server may not support encrypted connections. Choose Change and turn Encrypt off, or ask whoever runs the database.`
    : message;
}

export function SourceView({ root, path, link }: { root: string; path: string; link: string }) {
  const tables = useLoad<{ items: SourceTable[] }>(`${root}/data-source-tables/${path}`);
  const [chosen, setChosen] = useUrlParam("item", undefined, { push: true });
  const items = tables.data?.items ?? [];
  const table = items.find((candidate) => candidate.name === chosen) ?? items[0];
  // What is done to the source is done here as in the list: its binding is read for the buttons.
  const bindings = useLoad<{ items: SourceBinding[] }>(`${root}/data-source-bindings`);
  const binding = bindings.data?.items.find((one) => one.path === path);

  return (
    <Page
      fill
      helpKey="source"
      title={path}
      description="An external database. Rows are read and written there directly. Volvel does not change its structure, and its own access rules apply."
      action={
        <span className="flex flex-wrap items-center gap-3">
          {binding?.bound ? (
            <SourceActions
              root={root}
              row={binding}
              onDone={() => {
                bindings.reload();
                tables.reload();
              }}
              onUnbound={() => navigate(`${link}/sources`)}
            />
          ) : null}
          <Link to={`${link}/sources`} className="text-action">
            All data sources
          </Link>
        </span>
      }
    >
      {tables.error ? (
        <Notice tone="danger" action={<Button onClick={tables.reload}>Try again</Button>}>
          {sourceFailure(tables.error.message, binding)}
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
              needs={{
                base: root,
                permission: "data_source:write",
                what: "the rows of this table",
              }}
              canAdd
              // A column the database fills in (a sequence, a default) is not asked for.
              columns={table.columns.map((column) => ({
                ...column,
                required: column.required && !column.hasDefault,
              }))}
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
/** A table's rows have saved views of their own, named for the table, kept to what a list name may be (a letter, then up to 39 letters, digits and dashes). */
export function viewsOf(rowsPath: string, tableId?: string): ViewsOf | undefined {
  const match = /^\/tenants\/([^/]+)\/workspaces\/([^/]+)\/rows\/(.+)$/.exec(rowsPath);
  if (!match) return undefined;
  const [, tenantId, workspaceId, table] = match as unknown as [string, string, string, string];
  // By what the table is: two names that differ only in marks are two lists, and a renamed
  // table keeps its views. The random end of its ID, since the start of one is a time.
  const slug = tableId
    ? `rows-${tableId
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
        .slice(-20)}`
    : `rows-${table.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 40).replace(/-+$/, "");
  return { tenantId, workspaceId, list: slug };
}
