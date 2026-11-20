import { Button, type GridColumn, Notice, TextField } from "@volvel/ui";
import { Play, Save } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify, takenText } from "../ask.tsx";
import { count } from "../kit/format.ts";
import { ErrorState, Loading, LoadState } from "../kit/LoadState.tsx";
import { SectionLabel } from "../kit/layout.tsx";
import { ReadTable } from "../kit/ReadTable.tsx";
import { Code, StatePill, Tag } from "../kit/status.tsx";
import { Page } from "../ListScreen.tsx";
import { Link, useUrlParam } from "../router.tsx";

// The editor is large and is loaded when a query is first written.
const CodeEditor = lazy(() =>
  import("../editor/CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })),
);

interface Schema {
  tables: {
    name: string;
    display: string | null;
    columns: {
      name: string;
      type: string;
      references: string | null;
      values?: { value: string; label?: string; color?: string }[];
    }[];
  }[];
  functions: string[];
  /** Whether whoever is here holds `sql:read`. */
  maySql: boolean;
}

interface Result {
  columns: { name: string; type: string }[];
  rows: unknown[][];
  truncated: boolean;
  tables: string[];
  sql: string;
}

interface Parameter {
  name: string;
  type: string;
  label?: string;
  default?: unknown;
  required?: boolean;
}

interface SavedQuery {
  path: string;
  description: string;
  sql: string;
  parameters: Parameter[];
  ownership: string;
  draft: "new" | "changed" | "removed" | null;
}

/** Where in the text a refusal points, read from the path the API gives it. */
function placeOf(error: ApiError): { line: number; column: number } | undefined {
  const at = /\/(\d+):(\d+)$/.exec(error.fields?.[0]?.path ?? "");
  return at ? { line: Number(at[1]), column: Number(at[2]) } : undefined;
}

/** What was typed for a parameter, as the value the query is given. */
function typedValue(type: string, text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (type === "integer" || type === "number") return Number(trimmed);
  if (type === "boolean") return /^(true|yes|y|1)$/i.test(trimmed);
  return type === "text" ? text : trimmed;
}

/** The highest `$n` a query's text uses, outside quotes. */
export function parametersIn(text: string): number {
  const bare = text.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, "");
  return Math.max(0, ...[...bare.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])));
}

/**
 * Questions asked of the workspace's tables in SQL. A query only reads; it
 * names tables by their paths; each table's row policy applies to whoever
 * runs it. A query worth keeping is saved by name, and is then a resource
 * like any other: drafted, deployed and promoted.
 */
export function Queries({ root, link }: { root: string; link: string }) {
  const schema = useLoad<Schema>(`${root}/queries/schema`);
  const saved = useLoad<{ items: SavedQuery[] }>(`${root}/queries`);
  const [open, setOpen] = useUrlParam("query", undefined, { push: true });
  const [text, setText] = useState("");
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result>();
  const [refusal, setRefusal] = useState<{ message: string; line?: number; column?: number }>();
  const [busy, setBusy] = useState(false);
  const [took, setTook] = useState<number>();
  const [reveal, setReveal] = useState<{ line: number; column?: number; at: number }>();

  const current = saved.data?.items.find((one) => one.path === open);
  // Opening a saved query puts its text in the editor. What is typed after is the editor's.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of query replaces the text
  useEffect(() => {
    if (!current) return;
    setText(current.sql);
    setTyped({});
    setResult(undefined);
    setRefusal(undefined);
  }, [current?.path]);

  // The editor completes from what the workspace has.
  useEffect(() => {
    if (!schema.data) return;
    const known = schema.data;
    void import("../editor/monaco.ts").then(({ setSqlSchema }) => setSqlSchema(known));
  }, [schema.data]);

  const parameters = useMemo<Parameter[]>(() => {
    const used = parametersIn(text);
    return Array.from({ length: used }, (_, at) => {
      const known = current?.parameters[at];
      return known ?? { name: `$${at + 1}`, type: "text" };
    });
  }, [text, current]);

  const run = async () => {
    if (text.trim() === "" || busy) return;
    setBusy(true);
    setRefusal(undefined);
    const started = performance.now();
    try {
      const answer = await api.post<Result>(`${root}/queries/run`, {
        sql: text,
        ...(parameters.length > 0
          ? {
              params: parameters.map((one) =>
                typedValue(one.type, typed[one.name] ?? String(one.default ?? "")),
              ),
            }
          : {}),
      });
      setResult(answer);
      setTook(Math.round(performance.now() - started));
    } catch (error) {
      const caught = error as ApiError;
      const place = placeOf(caught);
      setResult(undefined);
      setRefusal({
        message: caught.fields?.[0]?.message ?? caught.message,
        ...(place ?? {}),
      });
      if (place) setReveal({ ...place, at: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const put = (path: string) =>
      api.put(`${root}/drafts/${path}`, {
        kind: "query",
        schemaVersion: 1,
        // A query not yet named is a create: it never replaces what is at the path.
        ...(current ? {} : { create: true }),
        body: {
          ...(current?.description ? { description: current.description } : {}),
          sql: text,
          ...(parameters.length > 0
            ? {
                parameters: parameters.map((one, at) => ({
                  name: one.name.startsWith("$") ? `p${at + 1}` : one.name,
                  type: one.type,
                  ...(one.label ? { label: one.label } : {}),
                  ...(one.default !== undefined ? { default: one.default } : {}),
                })),
              }
            : {}),
        },
      });
    const done = (path: string) => {
      notify.success(`${path} is saved as a draft. It can be run by name once it is deployed.`, {
        link: { label: "Review and deploy", href: `${link}/release` },
      });
      saved.reload();
      setOpen(path);
    };
    if (current) {
      try {
        await put(current.path);
        done(current.path);
      } catch (error) {
        notify.error(error);
      }
      return;
    }
    let made = "";
    const path = await ask.prompt({
      title: "Save this query",
      text: "It is kept by name as a resource of the workspace: a draft until it is deployed.",
      label: "Name, such as reports/fees",
      action: "Save",
      submit: async (value) => {
        try {
          await put(value.trim());
          made = value.trim();
          return undefined;
        } catch (error) {
          return takenText(error) ?? failureText(error);
        }
      },
    });
    if (path && made) done(made);
  };

  if (schema.error) return <ErrorState error={schema.error} onRetry={schema.reload} />;
  if (!schema.data) return <Loading />;

  const grid: GridColumn[] = (result?.columns ?? []).map((column) => ({
    name: column.name,
    type: column.type === "number" ? "number" : column.type === "json" ? "json" : "text",
  }));
  const rows = (result?.rows ?? []).map((row, at) => ({
    ...Object.fromEntries(
      (result?.columns ?? []).map((column, index) => [column.name, row[index]]),
    ),
    __at: String(at),
  }));

  return (
    <Page
      title="Queries"
      description="Ask a question of this workspace's tables in SQL. A query only reads. Name a table by its path, in double quotes when it has a slash or a dash. Each table's rules for who sees which rows apply to whoever runs it."
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 font-mono text-code">
              {current ? current.path : "A new query"}
              {current?.draft === "new" ? (
                <span className="ml-2">
                  <StatePill state="draft">Draft, never deployed</StatePill>
                </span>
              ) : current?.draft ? (
                <span className="ml-2">
                  <Tag tone="draft">{current.draft === "removed" ? "Removing" : "Draft"}</Tag>
                </span>
              ) : null}
            </span>
            {current ? (
              <Button size="small" variant="quiet" onClick={() => setOpen(undefined)}>
                New query
              </Button>
            ) : null}
            <Button size="small" onClick={() => void save()} disabled={text.trim() === ""}>
              <Save aria-hidden="true" size={14} /> {current ? "Save" : "Save as…"}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!schema.data.maySql}
              onClick={() => void run()}
            >
              <Play aria-hidden="true" size={16} /> Run
            </Button>
          </div>
          {schema.data.maySql ? null : (
            <Notice tone="plain">
              You can read the queries kept here, but not run SQL: that takes the permission to read
              with SQL (<code>sql:read</code>), which a role has only when it names it.
            </Notice>
          )}
          <div className="overflow-hidden rounded-panel border border-line">
            <Suspense fallback={<Loading />}>
              <CodeEditor
                label="The query"
                language="sql"
                path={`queries/${open ?? "new"}.sql`}
                value={text}
                onChange={setText}
                height="16rem"
                onRun={() => void run()}
                onSave={() => void save()}
                reveal={reveal}
              />
            </Suspense>
          </div>
          {parameters.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {parameters.map((one) => (
                <div key={one.name} className="w-48">
                  <TextField
                    name={one.name}
                    label={one.label ?? one.name}
                    required={false}
                    {...(one.type === "text" ? {} : { hint: one.type })}
                    value={typed[one.name] ?? String(one.default ?? "")}
                    onChange={(value) => setTyped((now) => ({ ...now, [one.name]: value }))}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {refusal ? (
            <Notice tone="danger">
              {refusal.line ? `Line ${refusal.line}, column ${refusal.column}: ` : ""}
              {refusal.message}
            </Notice>
          ) : null}
          {result ? (
            <section className="flex flex-col gap-2" aria-label="Result">
              <p className="m-0 text-body-sm text-ink-muted">
                {count(result.rows.length)} {result.rows.length === 1 ? "row" : "rows"}
                {result.truncated ? ", and there were more: the result was cut short" : ""}
                {took !== undefined ? ` · ${took} ms` : ""}
                {result.tables.length > 0 ? ` · read ${result.tables.join(", ")}` : ""}
              </p>
              {result.rows.length === 0 ? (
                <p className="m-0 rounded-panel border border-line border-dashed px-4 py-3 text-ink-muted">
                  The query ran and gave no rows.
                </p>
              ) : (
                <ReadTable
                  label="The query's result"
                  columns={grid}
                  rows={rows}
                  rowKey={(row) => String(row.__at)}
                />
              )}
            </section>
          ) : !refusal ? (
            <p className="m-0 text-ink-muted">
              Write a query and press Run, or ⌘↵ in the editor. Start with{" "}
              <Code>select * from </Code> and the editor offers the tables.
            </p>
          ) : null}
        </div>

        <aside
          className="flex w-full shrink-0 flex-col gap-5 lg:w-72"
          aria-label="Tables and saved queries"
        >
          <section className="flex flex-col gap-2">
            <SectionLabel>Saved queries</SectionLabel>
            <LoadState
              of={saved}
              what="saved queries"
              isEmpty={(data) => data.items.length === 0}
              empty={
                <p className="m-0 text-body-sm text-ink-muted">
                  None yet. A query that is saved can be run by name, by anyone who may read its
                  tables.
                </p>
              }
            >
              {(data) => (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {data.items.map((one) => (
                    <li key={one.path}>
                      <Link
                        to={`${link}/queries?query=${encodeURIComponent(one.path)}`}
                        current={one.path === open}
                        className={`flex flex-col rounded-control px-2 py-1 hover:bg-sunken ${
                          one.path === open ? "bg-action-soft" : ""
                        }`}
                      >
                        <span className="font-mono text-code">{one.path}</span>
                        {one.description ? (
                          <span className="text-meta text-ink-muted">{one.description}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </LoadState>
          </section>
          <section className="flex flex-col gap-2">
            <SectionLabel>Tables</SectionLabel>
            {schema.data.tables.length === 0 ? (
              <p className="m-0 text-body-sm text-ink-muted">
                This workspace has no tables you may read.
              </p>
            ) : (
              schema.data.tables.map((table) => (
                <details key={table.name} className="rounded-control border border-line px-2 py-1">
                  <summary className="cursor-pointer font-mono text-code">{table.name}</summary>
                  <ul className="mt-1 mb-1 flex list-none flex-col gap-0.5 p-0">
                    {table.columns.map((column) => (
                      <li key={column.name} className="flex justify-between gap-2 text-body-sm">
                        <span className="font-mono text-code-sm">{column.name}</span>
                        <span className="text-ink-muted">
                          {column.references ? `→ ${column.references}` : column.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))
            )}
          </section>
        </aside>
      </div>
    </Page>
  );
}
