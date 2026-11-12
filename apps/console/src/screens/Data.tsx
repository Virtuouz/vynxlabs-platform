import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Grid,
  type GridColumn,
  type GridSort,
  Notice,
  parseValue,
  SelectField,
  Table,
  TextField,
} from "@vynxlabs/ui";
import { useState } from "preact/hooks";
import { type ApiError, api, useLoad } from "../api.ts";
import { CreateDialog, ListScreen, Page, RemoveButton } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";

const code = (text: string) => <code class="font-mono text-[13px]">{text}</code>;
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

function RowsBrowser(props: RowsBrowserProps) {
  const { columns, keyColumn, rowPath } = props;
  const [sort, setSort] = useState<GridSort>();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterError, setFilterError] = useState<string>();
  /** The cursors of the pages before this one, so "Previous" has somewhere to go. */
  const [trail, setTrail] = useState<(string | null)[]>([null]);
  const [adding, setAdding] = useState(false);

  let filter: object | undefined;
  try {
    const parts = columns.flatMap((column) => {
      const built = toFilter(column.type, filters[column.name] ?? "");
      return built ? [{ column: column.name, ...built }] : [];
    });
    if (parts.length > 0) filter = { and: parts };
  } catch (error) {
    if (filterError !== (error as Error).message) setFilterError((error as Error).message);
  }
  const query = new URLSearchParams({ limit: String(PAGE) });
  if (filter) query.set("filter", JSON.stringify(filter));
  if (sort) query.set("sort", `${sort.descending ? "-" : ""}${sort.column}`);
  const cursor = trail[trail.length - 1];
  if (cursor) query.set("cursor", cursor);
  const page = useLoad<{ items: DataRow[]; nextCursor: string | null }>(
    `${props.rowsPath}?${query}`,
  );
  const canChange = rowPath !== null && keyColumn !== null;
  const keyOf = (row: DataRow) => String(row[keyColumn ?? ""] ?? JSON.stringify(row));
  // Rows saved in place since this page was loaded. They are shown as saved without loading again.
  const [saved, setSaved] = useState<{ of: unknown; rows: Record<string, DataRow> }>();
  const changed = saved && saved.of === page.data ? saved.rows : {};
  const rows = (page.data?.items ?? []).map((row) => changed[keyOf(row)] ?? row);
  const restart = () => setTrail([null]);
  const grid: GridColumn[] = columns.map((column) => ({
    name: column.name,
    type: column.type,
    editable: canChange && column.writable && column.type !== "file",
    sortable: column.type !== "json",
    filterable: !["json", "ARRAY"].includes(column.type),
  }));

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="m-0 text-[13px] text-ink-muted">
          {props.readOnlyNote ??
            "Select a value to change it. In a filter, type text to look for, or a comparison such as > 100. Type empty to find rows with no value."}
        </p>
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add row
        </Button>
      </div>
      {filterError ? <Notice tone="danger">{filterError}</Notice> : null}
      {page.error ? (
        <Notice tone="danger" action={<Button onClick={page.reload}>Try again</Button>}>
          {page.error.message}
        </Notice>
      ) : null}
      <Grid<DataRow>
        label={props.label}
        columns={grid}
        rows={rows}
        rowKey={keyOf}
        sort={sort}
        onSort={(column) => {
          setSort((current) =>
            current?.column !== column
              ? { column, descending: false }
              : current.descending
                ? undefined
                : { column, descending: true },
          );
          restart();
        }}
        filters={filters}
        onFilter={(column, text) => {
          setFilterError(undefined);
          setFilters((current) => ({ ...current, [column]: text }));
          restart();
        }}
        {...(canChange
          ? {
              onEdit: async (row: DataRow, column: string, value: unknown) => {
                const now = await api.patch<DataRow>(rowPath(keyOf(row)), { [column]: value });
                setSaved({ of: page.data, rows: { ...changed, [keyOf(row)]: now } });
              },
              rowActions: (row: DataRow) => (
                <RemoveButton
                  label="Delete"
                  confirm="Delete this row? This cannot be undone."
                  run={() => api.delete(rowPath(keyOf(row)))}
                  onDone={page.reload}
                />
              ),
            }
          : {})}
        cell={(row, column) => {
          const value = row[column.name];
          if (column.type === "file" && typeof value === "string" && props.filesPath) {
            return (
              <a class="text-action" href={`/api/v1${props.filesPath}/${value}/content`}>
                Download
              </a>
            );
          }
          if (column.name === keyColumn && column.type === "uuid") {
            return <span class="font-mono text-[12px] text-ink-muted">{String(value)}</span>;
          }
          return undefined;
        }}
        empty={
          !page.data
            ? "Loading…"
            : filter
              ? "No rows match the filters."
              : "This table has no rows yet."
        }
      />
      <div class="flex items-center justify-between gap-3 text-[13px] text-ink-muted">
        <span>
          {rows.length === 0
            ? ""
            : `Rows ${(trail.length - 1) * PAGE + 1} to ${(trail.length - 1) * PAGE + rows.length}`}
        </span>
        <span class="flex gap-2">
          <Button
            size="small"
            disabled={trail.length === 1}
            onClick={() => setTrail((current) => current.slice(0, -1))}
          >
            Previous
          </Button>
          <Button
            size="small"
            disabled={!page.data?.nextCursor}
            onClick={() =>
              setTrail((current) => [...current, page.data?.nextCursor as string | null])
            }
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

  return (
    <Dialog open={open} onClose={onClose} title="Add row">
      <form
        class="flex max-h-[70vh] flex-col gap-3 overflow-y-auto"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {columns.map((column) =>
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
            <label key={column.name} class="flex flex-col gap-1 text-[13px] font-medium">
              {column.name}
              <input
                type="file"
                class="font-normal"
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
              onInput={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
            />
          ),
        )}
        {failure ? <Notice tone="danger">{failure}</Notice> : null}
        <div class="mt-1 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Add row
          </Button>
        </div>
      </form>
    </Dialog>
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

const policyText = (policy: { type: string; column?: string }) =>
  policy.type === "owner"
    ? `Each person sees their own rows (${policy.column})`
    : "Everyone with access";

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
            <span class="inline-flex items-center gap-2">
              <Link to={`${link}/tables/${row.name}`} class="font-medium text-action">
                {row.name}
              </Link>
              {row.status === "retired" ? <Badge tone="attention">Retired</Badge> : null}
            </span>
          ),
        },
        {
          header: "What it holds",
          cell: (row) => <span class="text-ink-muted">{row.description}</span>,
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
  policy: { type: string; column?: string };
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
  const [view, setView] = useState<"rows" | "definition">("rows");
  if (table.error) return <Notice tone="danger">{table.error.message}</Notice>;
  if (!table.data) return <p class="text-ink-muted">Loading…</p>;
  const data = table.data;
  const retired = data.status === "retired";
  const active = data.columns.filter((column) => column.status === "active");
  const tab = (value: typeof view, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      class={`h-8 rounded-control px-3 font-medium ${view === value ? "bg-action-soft text-action" : "text-ink-muted hover:text-ink"}`}
      onClick={() => setView(value)}
    >
      {label}
    </button>
  );

  return (
    <Page
      title={data.name}
      description={`${data.rowCount.toLocaleString()} ${data.rowCount === 1 ? "row" : "rows"}. ${policyText(data.policy)}. Managed in the ${data.managedIn === "code" ? "repository" : "console"}.`}
      action={
        <Link to={`${link}/tables`} class="text-action">
          All tables
        </Link>
      }
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
        <div class="flex gap-1">
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
      run={() => api.post(`${root}/table-purges`, { table, ...(column ? { column } : {}) })}
      onDone={onDone}
    />
  );
}

interface TableBody {
  description?: string;
  columns: Record<string, Record<string, unknown>>;
  policy?: { type: string; column?: string };
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
    <div class="flex flex-col gap-5">
      {table.status === "active" && !editable ? (
        <Notice tone="attention">
          This table is defined in the tenant's repository. To change it, change{" "}
          {code("defineTable")} there and deploy.
        </Notice>
      ) : null}
      {failure ? <Notice tone="danger">{failure}</Notice> : null}
      <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <h2 class="m-0 text-base font-semibold">Columns</h2>
          {editable ? <Button onClick={() => setAdding(true)}>Add column</Button> : null}
        </div>
        <Table<TableColumn>
          rows={active}
          rowKey={(row) => row.name}
          empty={<p class="m-0 text-ink-muted">No columns.</p>}
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
                      <span class="inline-flex gap-1">
                        <Button
                          size="small"
                          variant="quiet"
                          onClick={() => {
                            const next = window.prompt(`New name for "${row.name}"`, row.name);
                            if (!next || next === row.name) return;
                            void quietly(
                              change((body) => {
                                const { renamedFrom: _old, ...kept } = body.columns[row.name] ?? {};
                                delete body.columns[row.name];
                                body.columns[next] = { ...kept, renamedFrom: row.name };
                                if (body.policy?.column === row.name) body.policy.column = next;
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
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Retire "${row.name}"? It is hidden and its data kept. You can bring it back.`,
                              )
                            )
                              return;
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
        <p class="m-0 text-[13px] text-ink-muted">
          Every table also has {code("id")}, {code("created_at")} and {code("updated_at")}, which
          the platform fills in.
        </p>
      </section>

      {retired.length > 0 ? (
        <section class="flex flex-col gap-2">
          <h2 class="m-0 text-base font-semibold">Retired columns</h2>
          <p class="m-0 max-w-[70ch] text-ink-muted">
            These left the definition. They are hidden from rows, and what they held is kept until
            someone deletes it here.
          </p>
          <Table<TableColumn>
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
                  <span class="inline-flex gap-1">
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

      <section class="flex flex-col gap-2">
        <h2 class="m-0 text-base font-semibold">Who sees rows</h2>
        <p class="m-0 max-w-[70ch]">
          {table.policy.type === "owner" ? (
            <>
              Each person sees and changes only the rows where {code(table.policy.column ?? "")} is
              their own ID. People who hold the "all rows" permission see every row.
            </>
          ) : (
            "Everyone with permission to read this table's data sees every row."
          )}
        </p>
        {editable ? (
          <div class="max-w-xs">
            <SelectField
              name="policy"
              label="Rule"
              value={table.policy.type === "owner" ? (table.policy.column ?? "") : ""}
              options={[
                { value: "", label: "Everyone with access" },
                ...active
                  .filter((column) => column.type === "uuid")
                  .map((column) => ({ value: column.name, label: `Owner is in ${column.name}` })),
              ]}
              hint="An owner column holds IDs."
              onChange={(column) =>
                void quietly(
                  change((body) => {
                    body.policy = column ? { type: "owner", column } : { type: "open" };
                  }),
                )
              }
            />
          </div>
        ) : null}
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="m-0 text-base font-semibold">Where it is stored</h2>
        <p class="m-0 max-w-[70ch] text-ink-muted">
          In Postgres, as {code(`${table.stored.schema}.${table.stored.table}`)}. It is your data:
          you can read it there directly at any time.
        </p>
      </section>

      {editable ? (
        <section class="flex flex-col items-start gap-2">
          <h2 class="m-0 text-base font-semibold">Retire this table</h2>
          <p class="m-0 max-w-[70ch] text-ink-muted">
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
              hint: "Only for a row of another table.",
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
              <Link to={`${link}/sources/${row.path}`} class="font-medium text-action">
                {row.path}
              </Link>
            ) : (
              code(row.path)
            ),
        },
        { header: "For", cell: (row) => <span class="text-ink-muted">{row.description}</span> },
        {
          header: "Points to",
          cell: (row) =>
            row.bound ? (
              `${row.config?.database} on ${row.config?.host}, as ${row.config?.user}`
            ) : (
              <Badge tone="attention">Not connected</Badge>
            ),
        },
        { header: "Password", cell: (row) => (row.hasPassword ? "Set" : row.bound ? "None" : "") },
      ]}
      rowActions={(row, reload) =>
        row.bound ? (
          <RemoveButton
            label="Disconnect"
            confirm={`Disconnect "${row.path}"? Scripts that use it will fail until it is connected again. Nothing in that database changes.`}
            run={() => api.delete(`${root}/data-source-bindings/${row.path}`)}
            onDone={reload}
          />
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
            placeholder: "erp",
            hint: "The name scripts use for it.",
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
  const [chosen, setChosen] = useState<string>();
  const items = tables.data?.items ?? [];
  const table = items.find((candidate) => candidate.name === chosen) ?? items[0];

  return (
    <Page
      title={path}
      description="An external database. Rows are read and written there directly. The platform does not change its structure, and its own access rules apply."
      action={
        <Link to={`${link}/sources`} class="text-action">
          All data sources
        </Link>
      }
    >
      {tables.error ? (
        <Notice tone="danger" action={<Button onClick={tables.reload}>Try again</Button>}>
          {tables.error.message}
        </Notice>
      ) : !tables.data ? (
        <p class="text-ink-muted">Loading…</p>
      ) : !table ? (
        <EmptyState title="No tables found">
          The database was reached, but the schema it is connected to has no tables.
        </EmptyState>
      ) : (
        <div class="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
          <nav aria-label="Tables of this source" class="flex flex-col gap-0.5">
            {items.map((item) => (
              <button
                type="button"
                key={item.name}
                aria-current={item.name === table.name ? "true" : undefined}
                class={`truncate rounded-control px-2.5 py-1.5 text-left ${
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
