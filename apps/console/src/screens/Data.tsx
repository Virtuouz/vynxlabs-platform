import {
  Button,
  EmptyState,
  Grid,
  type GridColumn,
  type GridSort,
  Menu,
  Notice,
  parseValue,
  SelectField,
  SideSheet,
  showValue,
  TextField,
} from "@vynxlabs/ui";
import { Columns3, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { ErrorState, Loading, Pending } from "../kit/LoadState.tsx";
import { Inspector } from "../kit/layout.tsx";
import { StatePill } from "../kit/status.tsx";
import { ViewsMenu } from "../kit/views.tsx";
import { CreateDialog, ListScreen, Page, RemoveButton, when } from "../ListScreen.tsx";
import { Link, navigate, useUrlParam, useUrlState } from "../router.tsx";
import {
  type Policy,
  policyText,
  RowRulesEditor,
  type Rule,
  ruleText,
  SeeItAs,
} from "./RowRules.tsx";

const code = (text: string) => <code className="font-mono text-code">{text}</code>;
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
];
const typeLabel = (type: string) => TYPES.find((entry) => entry.value === type)?.label ?? type;

// ----- Rows: shared by workspace tables and the tables of an external source -----

interface RowColumn {
  name: string;
  type: string;
  required: boolean;
  /** False for columns the platform fills in, and for types it only reads. */
  writable: boolean;
}

interface RowsBrowserProps {
  /** The name the grid is announced by. */
  label: string;
  /** Lists rows with GET and adds one with POST. */
  rowsPath: string;
  /** The address of one row, or null when rows cannot be changed. */
  rowPath: ((key: string) => string) | null;
  keyColumn: string | null;
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
  hide: { type: "list" },
  density: { type: "string", default: "standard" },
  row: { type: "string", push: true },
} as const;

function RowsBrowser(props: RowsBrowserProps) {
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
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const hidden = new Set(url.hide);
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
  const page = useLoad<{ items: DataRow[]; nextCursor: string | null }>(
    `${props.rowsPath}?${query}`,
  );
  const canChange = rowPath !== null && keyColumn !== null;
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
  // Several rows are deleted at once in the platform's own tables; a source's rows one by one.
  const canBatch = canChange && custom;
  const exportQuery = new URLSearchParams();
  if (filter) exportQuery.set("filter", JSON.stringify(filter));
  if (url.sort) exportQuery.set("sort", url.sort);
  const exportHref = custom
    ? `/api/v1${props.rowsPath.replace("/rows/", "/rows-export/")}?${exportQuery}`
    : null;
  const grid: GridColumn[] = columns
    .filter((column) => !hidden.has(column.name))
    .map((column) => ({
      name: column.name,
      type: column.type,
      editable: canChange && column.writable && column.type !== "file",
      sortable: column.type !== "json",
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-body-sm text-ink-muted">
          {props.readOnlyNote ??
            "Arrow keys move between cells; Enter or F2 changes one, Escape puts it back. In a filter, type text to look for, or a comparison such as > 100. Type empty to find rows with no value."}
        </p>
        <span className="flex flex-wrap items-center gap-2">
          <Menu
            ariaLabel="Columns shown"
            triggerClassName="inline-flex h-7 items-center gap-1.5 rounded-control border border-line px-3 text-body-sm hover:bg-sunken"
            label={
              <>
                <Columns3 aria-hidden="true" size={14} /> Columns
                {hidden.size > 0 ? (
                  <span className="text-ink-muted">({columns.length - hidden.size})</span>
                ) : null}
              </>
            }
            items={columns.map((column) => ({
              label: column.name,
              current: !hidden.has(column.name),
              onSelect: () => {
                const next = new Set(hidden);
                if (next.has(column.name)) next.delete(column.name);
                else if (next.size < columns.length - 1) next.add(column.name);
                setUrl({ hide: [...next] });
              },
            }))}
          />
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
          {canChange ? (
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
      <div className="flex min-h-0 gap-4">
        <div className="min-w-0 flex-1">
          <Grid<DataRow>
            navigation="grid"
            density={compact ? "compact" : "standard"}
            label={props.label}
            columns={grid}
            rows={rows}
            rowKey={keyOf}
            selectedKey={url.row}
            onSelect={(row) => setUrl({ row: keyOf(row) })}
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
          onClose={() => setUrl({ row: undefined })}
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
              onSave={(values) => saveRow(open, values)}
            />
          ) : null}
        </Inspector>
      </div>
      <div className="flex items-center justify-between gap-3 text-body-sm text-ink-muted">
        <span>
          {rows.length === 0
            ? ""
            : `${rows.length} ${rows.length === 1 ? "row" : "rows"} on this page${
                typeof counted === "number"
                  ? `, of ${counted.toLocaleString()}${filter ? " that match" : ""}`
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
function RowEditor({
  row,
  columns,
  editable,
  onSave,
}: {
  row: DataRow;
  columns: RowColumn[];
  editable: boolean;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [text, setText] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const shown = (column: RowColumn) =>
    column.type === "json" || typeof row[column.name] === "object"
      ? row[column.name] === null || row[column.name] === undefined
        ? ""
        : JSON.stringify(row[column.name])
      : row[column.name] === null || row[column.name] === undefined
        ? ""
        : String(row[column.name]);
  const dirty = Object.keys(text).length > 0;
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
        editable && column.writable && column.type !== "file" ? (
          <TextField
            key={column.name}
            name={column.name}
            label={column.name}
            value={text[column.name] ?? shown(column)}
            required={false}
            error={errors[column.name]}
            onChange={(value) => setText((current) => ({ ...current, [column.name]: value }))}
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
            <SelectField
              key={column.name}
              name={column.name}
              label={column.name}
              value={values[column.name] ?? ""}
              options={[
                { value: "", label: column.required ? "Choose" : "No value" },
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
              ]}
              error={errors[column.name]}
              onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
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
          cell: (row) => <span className="text-ink-muted">{row.description}</span>,
        },
        {
          header: "Managed in",
          cell: (row) => (row.managedIn === "code" ? "Repository" : "Console"),
        },
        { header: "Who sees rows", cell: (row) => policyText(row.policy) },
        { header: "Columns", cell: (row) => row.columnCount, align: "end" },
        { header: "Rows", cell: (row) => row.rowCount.toLocaleString(), align: "end" },
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
          });
          navigate(`${link}/tables/${name}`);
        },
      }}
    />
  );
}

interface TableColumn {
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  default: unknown;
  references: string | null;
  status: "active" | "retired";
  held: number | null;
}

interface TableDetail {
  name: string;
  status: "active" | "retired";
  managedIn: "code" | "ui";
  policy: { type: string; column?: string; rules?: Rule[] };
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
  if (table.error) return <ErrorState error={table.error} onRetry={table.reload} />;
  if (!table.data) return <Pending of={table} />;
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
      title={data.name}
      description={`${data.rowCount.toLocaleString()} ${data.rowCount === 1 ? "row" : "rows"}. ${policyText(data.policy)}. Managed in the ${data.managedIn === "code" ? "repository" : "console"}.`}
    >
      {retired ? (
        <Notice
          tone="attention"
          action={
            <PurgeButton root={root} table={data.name} onDone={() => navigate(`${link}/tables`)} />
          }
        >
          This table is retired. It left its definition, so nothing can read or write it, and its{" "}
          {data.rowCount.toLocaleString()} rows are kept. Deploying a definition with this name
          brings it back.
        </Notice>
      ) : (
        <div className="flex gap-1">
          {tab("rows", "Rows")}
          {tab("definition", "Definition")}
        </div>
      )}
      {!retired && view === "rows" ? (
        <RowsBrowser
          key={active.map((column) => column.name).join(",")}
          label={`Rows of ${data.name}`}
          rowsPath={`${root}/rows/${data.name}`}
          rowPath={(key) => `${root}/row/${key}/${data.name}`}
          keyColumn="id"
          filesPath={`${root}/files`}
          columns={[
            ...active.map((column) => ({
              name: column.name,
              type: column.type,
              required:
                column.required && (column.default === null || column.default === undefined),
              writable: true,
            })),
            ...SYSTEM_COLUMNS,
          ]}
        />
      ) : (
        <Definition root={root} link={link} table={data} reload={table.reload} />
      )}
    </Page>
  );
}

function PurgeButton({
  root,
  table,
  column,
  onDone,
}: {
  root: string;
  table: string;
  column?: string;
  onDone: () => void;
}) {
  const what = column ? `the retired column "${column}"` : `the retired table "${table}"`;
  return (
    <RemoveButton
      label="Delete for good"
      confirm={`Delete ${what} and everything in it? This is the one action that destroys data, and it cannot be undone.`}
      typeToConfirm={column ?? table}
      run={() => api.post(`${root}/table-purges`, { table, ...(column ? { column } : {}) })}
      onDone={onDone}
    />
  );
}

interface TableBody {
  description?: string;
  columns: Record<string, Record<string, unknown>>;
  policy?: { type: string; column?: string; rules?: Rule[] };
  [key: string]: unknown;
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
  const [failure, setFailure] = useState<string>();
  const active = table.columns.filter((column) => column.status === "active");
  const retired = table.columns.filter((column) => column.status === "retired");

  /** Loads the stored definition, changes it, and saves it. The platform works out what to do. */
  const change = async (edit: (body: TableBody) => void) => {
    setFailure(undefined);
    try {
      const resource = await api.get<{ body: TableBody }>(`${root}/resources/${table.name}`);
      const body = structuredClone(resource.body);
      edit(body);
      await api.put(`${root}/resources/${table.name}`, {
        kind: "table",
        schemaVersion: 1,
        ownership: "ui",
        body,
      });
      reload();
    } catch (error) {
      const caught = error as ApiError;
      const first = caught.fields?.[0];
      setFailure(first ? `${caught.message} ${first.message}` : caught.message);
      throw error;
    }
  };
  const quietly = (run: Promise<unknown>) => run.catch(() => undefined);

  return (
    <div className="flex flex-col gap-5">
      {table.status === "active" && !editable ? (
        <Notice tone="attention">
          This table is defined in the tenant's repository. To change it, change{" "}
          {code("defineTable")} there and deploy.
        </Notice>
      ) : null}
      {failure ? <Notice tone="danger">{failure}</Notice> : null}
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
            { header: "Column", cell: (row) => code(row.name) },
            {
              header: "Holds",
              cell: (row) => (row.references ? `A row of ${row.references}` : typeLabel(row.type)),
            },
            {
              header: "Rules",
              cell: (row) =>
                [row.required ? "Required" : "", row.unique ? "No two rows alike" : ""]
                  .filter(Boolean)
                  .join(", "),
            },
            {
              header: "When not given",
              cell: (row) =>
                row.default === null || row.default === undefined
                  ? ""
                  : code(JSON.stringify(row.default)),
            },
            ...(editable
              ? [
                  {
                    header: "",
                    align: "end" as const,
                    cell: (row: TableColumn) => (
                      <span className="inline-flex gap-1">
                        <Button
                          size="small"
                          variant="quiet"
                          onClick={async () => {
                            const next = await ask.prompt({
                              title: `Rename ${row.name}`,
                              label: "New name",
                              initial: row.name,
                              action: "Rename",
                            });
                            if (!next || next === row.name) return;
                            void quietly(
                              change((body) => {
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
                              }),
                            );
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="small"
                          variant="danger"
                          disabled={active.length === 1}
                          onClick={async () => {
                            const sure = await ask.confirm({
                              title: `Retire ${row.name}?`,
                              text: "It is hidden and its data kept. You can bring it back.",
                              action: "Retire",
                              danger: true,
                            });
                            if (!sure) return;
                            void quietly(change((body) => delete body.columns[row.name]));
                          }}
                        >
                          Retire
                        </Button>
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
        <p className="m-0 text-body-sm text-ink-muted">
          Every table also has {code("id")}, {code("created_at")} and {code("updated_at")}, which
          the platform fills in.
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
            rowKey={(row) => row.name}
            empty={null}
            columns={[
              { header: "Column", cell: (row) => code(row.name) },
              { header: "Held", cell: (row) => typeLabel(row.type) },
              {
                header: "Still holds",
                cell: (row) =>
                  `${(row.held ?? 0).toLocaleString()} ${row.held === 1 ? "value" : "values"}`,
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
                            change((body) => {
                              body.columns[row.name] = {
                                type: row.type,
                                ...(row.references ? { references: row.references } : {}),
                              };
                            }),
                          )
                        }
                      >
                        Bring back
                      </Button>
                    ) : null}
                    <PurgeButton root={root} table={table.name} column={row.name} onDone={reload} />
                  </span>
                ),
              },
            ]}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-title font-semibold">Who sees rows</h2>
        {editable ? (
          <RowRulesEditor
            key={JSON.stringify(table.policy)}
            policy={table.policy as Policy}
            columns={active}
            onSave={(policy) =>
              change((body) => {
                body.policy = policy;
              })
            }
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
          In Postgres, as {code(`${table.stored.schema}.${table.stored.table}`)}. It is your data:
          you can read it there directly at any time.
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
          submit: ({ name = "", type = "text", references, required, fallback }) =>
            change((body) => {
              body.columns[name] = {
                type,
                ...(type === "reference" && references ? { references } : {}),
                ...(required === "yes" ? { required: true } : {}),
                ...(fallback ? { default: parseValue(type, fallback) } : {}),
              };
            }),
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
  } | null;
  hasPassword: boolean;
}

export function Sources({ root, link }: { root: string; link: string }) {
  return (
    <ListScreen<SourceBinding>
      title="Data sources"
      description="Databases outside the platform that this workspace reads and writes. The address and password are set here, never in the repository, so dev and production can point at different databases."
      path={`${root}/data-source-bindings`}
      rowKey={(row) => row.path}
      columns={[
        {
          header: "Source",
          cell: (row) =>
            row.bound ? (
              <Link to={`${link}/sources/${row.path}`} className="font-medium text-action">
                {row.path}
              </Link>
            ) : (
              code(row.path)
            ),
        },
        { header: "For", cell: (row) => <span className="text-ink-muted">{row.description}</span> },
        {
          header: "Points to",
          cell: (row) =>
            row.bound ? (
              `${row.config?.database} on ${row.config?.host}, as ${row.config?.user}`
            ) : (
              <StatePill state="disconnected" />
            ),
        },
        { header: "Password", cell: (row) => (row.hasPassword ? "Set" : row.bound ? "None" : "") },
        {
          header: "Reached",
          cell: (row) =>
            !row.bound ? (
              ""
            ) : !row.health ? (
              <span className="text-ink-muted">Not checked yet</span>
            ) : row.health.ok ? (
              <span className="text-success" title={`Checked ${when(row.health.checkedAt)}`}>
                Yes{row.health.latencyMs !== null ? `, ${row.health.latencyMs} ms` : ""}
              </span>
            ) : (
              <span className="text-danger" title={row.health.problem ?? ""}>
                No: {row.health.problem}
              </span>
            ),
        },
      ]}
      rowActions={(row, reload) =>
        row.bound ? (
          <span className="inline-flex gap-2">
            <Button
              size="small"
              onClick={async () => {
                try {
                  const result = await api.post<{ ok: boolean; problem: string | null }>(
                    `${root}/data-source-checks/${row.path}`,
                    {},
                  );
                  if (result.ok) notify.success(`${row.path} answered.`);
                  else notify.error(new Error(`${row.path} did not answer: ${result.problem}`));
                  reload();
                } catch (caught) {
                  notify.error(caught);
                }
              }}
            >
              Test connection
            </Button>
            <RemoveButton
              label="Disconnect"
              confirm={`Disconnect "${row.path}"? Scripts that use it will fail until it is connected again. Nothing in that database changes.`}
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
          "Connecting a source that is already connected replaces its details. Leave the password empty to keep the stored one. The platform never changes the database's structure.",
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
            options: [
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ],
          },
        ],
        submit: ({ path = "", host, port, database, user, password, schema, ssl }) =>
          api.put(`${root}/data-source-bindings/${path}`, {
            config: {
              host,
              port: port ? Number(port) : 5432,
              database,
              user,
              ...(schema ? { schema } : {}),
              ...(ssl === "yes" ? { ssl: true } : {}),
            },
            ...(password ? { password } : {}),
          }),
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
        <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
          <nav aria-label="Tables of this source" className="flex flex-col gap-0.5">
            {items.map((item) => (
              <button
                type="button"
                key={item.name}
                aria-current={item.name === table.name ? "true" : undefined}
                className={`truncate rounded-control px-3 py-1.5 text-left ${
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
          <RowsBrowser
            key={table.name}
            label={`Rows of ${table.name}`}
            rowsPath={`${root}/source-rows/${table.name}/${path}`}
            rowPath={
              table.key
                ? (key) => `${root}/source-row/${table.name}/${encodeURIComponent(key)}/${path}`
                : null
            }
            keyColumn={table.key}
            columns={table.columns}
            {...(table.key
              ? {}
              : {
                  readOnlyNote:
                    "This table has no primary key, so rows can be read and added but not changed or deleted.",
                })}
          />
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
