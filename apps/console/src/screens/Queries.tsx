import { parameterMisfit, QUERY_PARAMETER_TYPES } from "@volvel/manifest";
import { Button, CheckboxField, type GridColumn, Notice, SelectField, TextField } from "@volvel/ui";
import { Play, Save } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { type ApiError, api, useLoad, useLoadOf } from "../api.ts";
import { ask, failureText, notify, takenText } from "../ask.tsx";
// The editor is large and is loaded when a query is first written.
import { plainEditorOnly } from "../editor/plain.ts";
import { DraftClash } from "../kit/DraftClash.tsx";
import { type DraftRead, putDraft } from "../kit/draftApi.ts";
import { useDraftSave } from "../kit/draftSave.ts";
import { count } from "../kit/format.ts";
import { formatCombo } from "../kit/keys.ts";
import { ErrorState, Loading, LoadState } from "../kit/LoadState.tsx";
import { SectionLabel } from "../kit/layout.tsx";
import { ReadTable } from "../kit/ReadTable.tsx";
import { RemoveDraftButton } from "../kit/RemoveDraftButton.tsx";
import { ReferenceList } from "../kit/references.tsx";
import { parametersIn } from "../kit/sqlParameters.ts";
import { Code, StatePill, Tag } from "../kit/status.tsx";
import { Page } from "../ListScreen.tsx";
import { navigate, useUrlParam } from "../router.tsx";
import { ResourceIdentity } from "./ResourceIdentity.tsx";

const CodeEditor = lazy(() =>
  import("../editor/CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })),
);

interface Schema {
  tables: {
    name: string;
    /** False for a table whose path is too long for SQL to name: it can only be put on a page. */
    inSql?: boolean;
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
  /** Whether whoever is here may keep a query as a draft: whether they hold `resource:write`. */
  maySave?: boolean;
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
  title?: string;
  /** The deployed path, when a draft renames the query. */
  renamedFrom?: string;
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

/**
 * What was typed for a parameter, as the value the query is given: a value, or what is wrong with
 * the text in the words the server would use. Nothing is guessed: a word that is not a number is
 * not sent as nothing.
 */
export function readTyped(
  type: string,
  text: string,
): { value: unknown; problem?: undefined } | { problem: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null };
  let value: unknown = type === "text" ? text : trimmed;
  if (type === "integer" || type === "number") {
    value = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed) ? Number(trimmed) : trimmed;
  } else if (type === "boolean") {
    value = /^(true|yes)$/i.test(trimmed) ? true : /^(false|no)$/i.test(trimmed) ? false : trimmed;
  }
  const problem = parameterMisfit(type, value);
  return problem ? { problem: `Must be ${problem}.` } : { value };
}

/** The parameters a query's text uses: what is known of them, or a text one for each `$n`. */
function parametersFor(text: string, known: Parameter[]): Parameter[] {
  return Array.from(
    { length: parametersIn(text) },
    (_, at) => known[at] ?? { name: `$${at + 1}`, type: "text" },
  );
}

/** What is typed for a query, as saved together: the text, what it is for, and its parameters. */
interface QueryDraft {
  sql: string;
  description: string;
  declared: Parameter[];
}

/** The most rows one run may ask for, which the server holds to as well. */
const MOST_ROWS = 10_000;
const NAME = /^[a-z][a-z0-9_]*$/;
const NAME_WORDS = "Lowercase letters, digits and underscores, starting with a letter.";

/** What a parameter's default is, as typed. */
const defaultText = (value: unknown) =>
  value === undefined || value === null ? "" : String(value);

/** What is wrong with what each parameter says of itself: its name, and a default that does not fit. */
function declaredProblems(all: Parameter[]) {
  return all.map((one, at) => ({
    name: one.name.startsWith("$")
      ? undefined
      : !NAME.test(one.name)
        ? NAME_WORDS
        : all.some((other, place) => place !== at && other.name === one.name)
          ? "Another parameter has this name."
          : undefined,
    default:
      typeof one.default === "string" && one.default.trim() !== ""
        ? readTyped(one.type, one.default).problem
        : undefined,
  }));
}

/** A parameter as the manifest keeps it: a default as its type, an empty label and a false `required` left out. */
function written(one: Parameter, place: number): Parameter {
  const given = typeof one.default === "string" ? readTyped(one.type, one.default) : undefined;
  const value = given && "value" in given ? given.value : one.default;
  return {
    name: one.name.startsWith("$") ? `p${place + 1}` : one.name,
    type: one.type,
    ...(one.label?.trim() ? { label: one.label.trim() } : {}),
    ...(value !== undefined && value !== null && value !== "" ? { default: value } : {}),
    ...(one.required ? { required: true } : {}),
  };
}

/** A value for a parameter, typed as its type asks: a menu for yes or no, a date field for a date. */
function TypedField({
  name,
  label,
  type,
  value,
  onChange,
  error,
  hint,
}: {
  name: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  return type === "boolean" ? (
    <SelectField
      name={name}
      label={label}
      options={[
        { value: "", label: "Not set" },
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ]}
      value={value}
      onChange={onChange}
    />
  ) : (
    <TextField
      name={name}
      label={label}
      required={false}
      {...(type === "date" ? { type: "date" as const } : {})}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      value={value}
      onChange={onChange}
    />
  );
}

/**
 * Questions asked of the workspace's tables in SQL. A query only reads; it
 * names tables by their paths; each table's row policy applies to whoever
 * runs it. A query worth keeping is saved by name, and is then a resource
 * like any other: drafted, deployed and promoted.
 */
export function Queries({
  root,
  link,
  editable = true,
}: {
  root: string;
  link: string;
  /** Only a dev workspace keeps queries. Others are given what is promoted to them. */
  editable?: boolean;
}) {
  const schema = useLoad<Schema>(`${root}/queries/schema`);
  const saved = useLoad<{ items: SavedQuery[] }>(`${root}/queries`);
  const [open, setOpen] = useUrlParam("query", undefined, { push: true });
  const [text, setText] = useState("");
  const [typed, setTyped] = useState<Record<string, string>>({});
  // What the query says of itself, saved with its text.
  const [description, setDescription] = useState("");
  const [declared, setDeclared] = useState<Parameter[]>([]);
  /** How many rows a run asks for, as typed. */
  const [wanted, setWanted] = useState("1000");
  const [result, setResult] = useState<Result>();
  const [refusal, setRefusal] = useState<{ message: string; line?: number; column?: number }>();
  const [busy, setBusy] = useState(false);
  /** Run was pressed with a value that does not fit: the fields then say so, as they are typed. */
  const [attempted, setAttempted] = useState(false);
  const [took, setTook] = useState<number>();
  const [reveal, setReveal] = useState<{ line: number; column?: number; at: number }>();

  const listed = saved.data?.items.find((one) => one.path === open);
  // Saving is offered to whoever may do it, in a workspace where queries are kept.
  const mayKeep = editable && schema.data?.maySave !== false;
  // The list gives what is deployed. A query with a draft is opened as its draft: its text, its
  // parameters, and the revision a save is based on.
  const drafted = useLoadOf<DraftRead<Partial<SavedQuery>>>(
    listed?.draft ? `${root}/drafts/${listed.path}` : null,
  );
  const ready = !listed?.draft || drafted.data?.path === listed.path || drafted.error !== undefined;
  const removing = listed?.draft === "removed";
  const current: SavedQuery | undefined =
    listed && drafted.data?.body && !drafted.data.deleted && ready
      ? {
          ...listed,
          description: drafted.data.body.description ?? "",
          sql: drafted.data.body.sql ?? "",
          parameters: drafted.data.body.parameters ?? [],
        }
      : listed;
  // What a save sends is the text as it is when it goes out. A query saved for the first time
  // keeps its text on screen when its address changes to its name: it is not read back.
  const target = useRef<string>(undefined);
  const savedAs = useRef<string>(undefined);
  const creating = useRef(false);
  const createRefusal = useRef<unknown>(undefined);
  const keep = useDraftSave<QueryDraft, { revision: number }>({
    send: async (now, at) => {
      const all = parametersFor(now.sql, now.declared);
      // What is wrong with a parameter is said on its field: nothing is sent while it is.
      if (declaredProblems(all).some((one) => one.name || one.default)) {
        throw new Error("A parameter's name or default is not right. It is said on its field.");
      }
      return putDraft<{ revision: number }>(
        root,
        target.current as string,
        {
          kind: "query",
          schemaVersion: 1,
          body: {
            ...(now.description.trim() ? { description: now.description.trim() } : {}),
            sql: now.sql,
            ...(all.length > 0 ? { parameters: all.map(written) } : {}),
          },
        },
        // A query not yet named is a create: it never replaces what is at the path. One with no
        // draft yet makes its first.
        at ? { revision: at } : current ? { first: true } : { create: true },
      );
    },
    applied: (_answer, _sent, newest) => {
      const path = target.current as string;
      if (newest) {
        notify.success(`${path} is saved as a draft. It can be run by name once it is deployed.`, {
          link: { label: "Review and deploy", href: `${link}/release` },
        });
      }
      saved.reload();
      if (open !== path) {
        savedAs.current = path;
        setOpen(path);
      }
    },
    failed: (error) => {
      // While a new query is named, the refusal is said in the naming dialog instead.
      if (creating.current) createRefusal.current = error;
      else notify.error(error);
    },
  });
  /** Something about the query changed: on top of the newest, so that two changes both stay. */
  const edit = (part: Partial<QueryDraft>) => {
    const next = { sql: text, description, declared, ...keep.value(), ...part };
    if (part.sql !== undefined) setText(part.sql);
    if (part.description !== undefined) setDescription(part.description);
    if (part.declared) setDeclared(part.declared);
    keep.edit(next);
  };
  const changeText = (next: string) => edit({ sql: next });
  /** One parameter says something of itself: all of them are written out first, as they will be saved. */
  const change = (at: number, part: Partial<Parameter>) =>
    edit({
      declared: parametersFor(keep.value()?.sql ?? text, keep.value()?.declared ?? declared).map(
        (one, place) => (place === at ? { ...one, ...part } : one),
      ),
    });
  // Typed and not kept: a saved query's changes not yet saved, or a new query's text.
  const unkept = current ? keep.dirty : text.trim() !== "";
  /** Opens a saved query, or an empty one, asking first when what is typed would be lost. */
  const go = async (path: string | undefined) => {
    if (path === open) return;
    if (unkept) {
      const leave = await ask.confirm({
        title: "Leave without saving?",
        text: current
          ? `Your changes to ${current.path} are not saved.`
          : "This query is not saved.",
        action: "Leave",
        cancel: "Stay",
        danger: true,
      });
      if (!leave) return;
    }
    if (path === undefined) clearEditor();
    setOpen(path);
  };
  /** A query put on the screen as it is saved: nothing is unsaved. */
  const show = (one: QueryDraft, revision?: number) => {
    setText(one.sql);
    setDescription(one.description);
    setDeclared(one.declared);
    keep.reset(one, revision);
    setTyped({});
  };
  const clearEditor = () => {
    show({ sql: "", description: "", declared: [] });
    setResult(undefined);
    setRefusal(undefined);
    setTook(undefined);
  };
  // Opening a saved query puts its text in the editor, once its draft is read when it has one.
  // What is typed after is the editor's: a save, or a reload of the list, does not replace it.
  const shown = useRef<string>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of query replaces the text
  useEffect(() => {
    if (!current) return;
    const key = `${current.path}:${removing}`;
    // What was just saved from this screen is already here, with whatever was typed since.
    if (savedAs.current === current.path) {
      savedAs.current = undefined;
      shown.current = key;
      return;
    }
    if (shown.current === key || !ready) return;
    shown.current = key;
    show(
      { sql: current.sql, description: current.description, declared: current.parameters },
      drafted.data?.revision,
    );
    setResult(undefined);
    setRefusal(undefined);
  }, [current?.path, ready, removing]);
  /** What is saved at the open query now, put on the screen in place of what is there. */
  const takeTheirs = async () => {
    if (!listed) return;
    const [list, theirs] = await Promise.all([
      api.get<{ items: SavedQuery[] }>(`${root}/queries`),
      api
        .get<DraftRead<Partial<SavedQuery>>>(`${root}/drafts/${listed.path}`)
        .catch(() => undefined),
    ]);
    const now = list.items.find((one) => one.path === listed.path);
    const body = theirs && !theirs.deleted ? theirs.body : now;
    shown.current = `${listed.path}:${now?.draft === "removed"}`;
    show(
      {
        sql: body?.sql ?? "",
        description: body?.description ?? "",
        declared: body?.parameters ?? [],
      },
      theirs?.revision,
    );
    await saved.reload();
    await drafted.reload();
  };

  // The editor completes from what the workspace has.
  useEffect(() => {
    if (!schema.data || plainEditorOnly()) return;
    const known = schema.data;
    void import("../editor/monaco.ts").then(({ setSqlSchema }) =>
      setSqlSchema({ ...known, tables: known.tables.filter((table) => table.inSql !== false) }),
    );
  }, [schema.data]);

  const parameters = useMemo<Parameter[]>(() => parametersFor(text, declared), [text, declared]);
  const about = declaredProblems(parameters);

  /** What each parameter is given, or what is wrong with what was typed for it. */
  const readings = parameters.map((one, at) => {
    const given = typed[String(at)] ?? defaultText(one.default);
    // A parameter that is needed has no default to fall back on: it is asked for here.
    if (one.required && given.trim() === "") return { problem: "A value is needed." };
    return readTyped(one.type, given);
  });
  const problems = Object.fromEntries(
    parameters.flatMap((_one, at) => {
      const reading = readings[at];
      return reading?.problem ? [[String(at), reading.problem]] : [];
    }),
  );
  // Asked of the server by name, which asks no SQL of whoever runs: what is saved and deployed.
  const byName = current && !current.draft && !keep.dirty ? current : undefined;
  const mayRun = schema.data?.maySql === true || byName !== undefined;
  const asked = Number(wanted);
  const rowsProblem =
    Number.isInteger(asked) && asked >= 1 && asked <= MOST_ROWS && wanted.trim() !== ""
      ? undefined
      : `Must be a whole number from 1 to ${count(MOST_ROWS)}.`;

  const run = async () => {
    if (text.trim() === "" || busy || !mayRun) return;
    // A value that does not fit is said on its field, and nothing is asked of the server.
    if (Object.keys(problems).length > 0 || rowsProblem) {
      setRefusal(undefined);
      setResult(undefined);
      setAttempted(true);
      return;
    }
    setBusy(true);
    setRefusal(undefined);
    const started = performance.now();
    try {
      const values = readings.map((reading) => ("value" in reading ? reading.value : null));
      // Without `sql:read` a saved query is run by name, as the route allows: its own text, by
      // whoever may read the tables it names. A parameter left empty takes its default there.
      const answer =
        schema.data?.maySql || !byName
          ? await api.post<Result>(`${root}/queries/run`, {
              sql: text,
              ...(parameters.length > 0 ? { params: values } : {}),
              limit: asked,
            })
          : await api.get<Result>(
              `${root}/queries/saved/${byName.path}?${new URLSearchParams({
                limit: String(asked),
                ...(parameters.length > 0
                  ? {
                      params: JSON.stringify(
                        Object.fromEntries(
                          parameters.flatMap((one, at) =>
                            values[at] === null ? [] : [[one.name, values[at]]],
                          ),
                        ),
                      ),
                    }
                  : {}),
              })}`,
            );
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
    // Not for someone who may not keep one, and not for nothing: Mod+S on an empty query asks no name.
    if (removing || !ready || !mayKeep || text.trim() === "") return;
    if (current) {
      target.current = current.path;
      await keep.save(true);
      return;
    }
    // A new query is a create: a name that is taken is said on the field, keeping what was typed.
    await ask.prompt({
      title: "Save this query",
      text: "It is kept by name as a resource of the workspace: a draft until it is deployed.",
      label: "Name, such as reports/fees",
      action: "Save",
      submit: async (value) => {
        target.current = value.trim();
        createRefusal.current = undefined;
        creating.current = true;
        const went = await keep.save(true).finally(() => {
          creating.current = false;
        });
        if (went) return undefined;
        return takenText(createRefusal.current) ?? failureText(createRefusal.current);
      },
    });
  };

  if (schema.error) return <ErrorState error={schema.error} onRetry={schema.reload} />;
  if (!schema.data) return <Loading />;
  // A table whose path is too long for SQL to name is for pages, so it is not listed here.
  const sqlTables = schema.data.tables.filter((table) => table.inSql !== false);
  // An address that names a query this workspace does not have. One just saved is not that: its
  // list has not yet come back with it.
  const gone =
    open !== undefined && saved.data !== undefined && !listed && savedAs.current !== open;

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
            {/* The state is a flex item of its own: beside a long path it wraps, and never runs under the buttons. */}
            <span className="min-w-0 flex-[1_1_12rem] break-all font-mono text-code">
              {current ? current.path : gone ? `There is no query at ${open}.` : "A new query"}
            </span>
            {current?.draft === "new" ? (
              <span className="shrink-0">
                <StatePill state="draft">Draft, never deployed</StatePill>
              </span>
            ) : current?.draft ? (
              <span className="shrink-0">
                <Tag tone="draft">{current.draft === "removed" ? "Removing" : "Draft"}</Tag>
              </span>
            ) : null}
            {current || gone ? (
              <Button size="small" variant="quiet" onClick={() => void go(undefined)}>
                New query
              </Button>
            ) : null}
            {current ? (
              <ResourceIdentity
                root={root}
                link={link}
                row={{ path: current.path, kind: "query", ownership: current.ownership }}
                label="Name and path"
                unsaved={keep.dirty}
                removing={removing}
                onDone={(path) => {
                  saved.reload();
                  if (path !== current.path) {
                    // The text on screen is the query's: it is not read back under its new path.
                    savedAs.current = path;
                    setOpen(path);
                  }
                }}
              />
            ) : null}
            {current ? (
              <RemoveDraftButton
                root={root}
                kind="query"
                path={current.path}
                noun="query"
                size="small"
                state={
                  current.draft === "removed"
                    ? "removed"
                    : current.draft
                      ? "draft"
                      : current.ownership === "code"
                        ? "repository"
                        : "deployed"
                }
                onDone={(did) => {
                  if (did === "discarded" && current.draft === "new") {
                    saved.reload();
                    clearEditor();
                    // The query is gone, and so is its place in the history: Back must not
                    // return to an address that names it.
                    navigate(location.pathname, { replace: true });
                    return;
                  }
                  // The draft that renamed it is gone: the query is at the path it has deployed.
                  if (did === "discarded" && current.renamedFrom) {
                    saved.reload();
                    setOpen(current.renamedFrom);
                    return;
                  }
                  // A discarded draft or a removal taken back: the query is as it is deployed, and
                  // what was on screen is not the query's any more. A removal made opens as one.
                  void takeTheirs();
                }}
              />
            ) : null}
            <Button
              size="small"
              onClick={() => void save()}
              disabled={text.trim() === "" || removing || !ready || !mayKeep}
            >
              <Save aria-hidden="true" size={14} /> {current ? "Save" : "Save as…"}
            </Button>
            <Button variant="primary" loading={busy} disabled={!mayRun} onClick={() => void run()}>
              <Play aria-hidden="true" size={16} /> Run
            </Button>
          </div>
          {open !== undefined && saved.data && !listed && savedAs.current !== open ? (
            <Notice tone="attention">
              There is no saved query at {open}. It was discarded or removed, or the address is
              wrong. This is a new query.
            </Notice>
          ) : null}
          {removing ? (
            <Notice tone="attention">
              This query is removed in your drafts. Nothing changes until that draft is deployed.
              The text shown is what is deployed now. Keep this query to take the removal back.
            </Notice>
          ) : null}
          {mayKeep ? null : (
            <Notice tone="plain">
              {editable ? (
                <>
                  You can run queries here but not keep them: that takes the permission to write
                  resources (<code>resource:write</code>). Ask whoever manages roles in this tenant.
                </>
              ) : (
                <>
                  Queries are written in a dev workspace and promoted to this one, so they are not
                  saved here. They can be run by name once they are promoted.
                </>
              )}
            </Notice>
          )}
          {mayKeep && current?.ownership === "code" ? (
            <Notice tone="attention">
              This query is managed in the tenant's repository. Saving a draft of it takes it over.
            </Notice>
          ) : null}
          {keep.clashed ? <DraftClash what="query" mine={() => text} onTake={takeTheirs} /> : null}
          {schema.data.maySql ? null : (
            <Notice tone="plain">
              You cannot write or run SQL: that takes the permission to read with SQL (
              <code>sql:read</code>), which a role has only when it names it.{" "}
              {byName
                ? "This query is deployed, so it can be run by name."
                : current
                  ? "This query has changes that are not deployed, so it cannot be run by name yet."
                  : "A query kept here and deployed can be run by name by anyone who may read its tables."}
            </Notice>
          )}
          {current && !removing ? (
            <TextField
              name="description"
              label="What it is for"
              required={false}
              maxLength={500}
              value={description}
              hint="Shown beside the query in the list, and to whoever finds it by name."
              onChange={(value) => edit({ description: value })}
            />
          ) : null}
          {/* The editor draws its own frame: a second border around it is a box in a box. */}
          <div>
            <Suspense fallback={<Loading />}>
              <CodeEditor
                label="The query"
                language="sql"
                path={`queries/${open ?? "new"}.sql`}
                value={text}
                onChange={changeText}
                readOnly={removing || !schema.data.maySql}
                height="16rem"
                onRun={() => void run()}
                onSave={() => void save()}
                reveal={reveal}
              />
            </Suspense>
          </div>
          {parameters.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {parameters.map((one, at) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a parameter is its place, $1, $2, whatever it is called
                <div key={at} className="w-48">
                  <TypedField
                    name={`value-${at}`}
                    label={one.label ?? one.name}
                    type={one.type}
                    value={typed[String(at)] ?? defaultText(one.default)}
                    onChange={(value) => setTyped((now) => ({ ...now, [String(at)]: value }))}
                    {...(one.type === "text" || one.type === "date" || one.type === "boolean"
                      ? {}
                      : { hint: one.type })}
                    error={
                      problems[String(at)] && (attempted || typed[String(at)] !== undefined)
                        ? problems[String(at)]
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}
          {parameters.length > 0 && !removing ? (
            <details className="rounded-control border border-line px-3 py-2">
              <summary className="cursor-pointer text-body-sm font-medium">
                What each parameter is
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                {parameters.map((one, at) => (
                  <fieldset
                    // biome-ignore lint/suspicious/noArrayIndexKey: a parameter is its place, $1, $2, whatever it is called
                    key={at}
                    className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <legend className="mb-2 font-mono text-code-sm">{`$${at + 1}`}</legend>
                    <TextField
                      name={`name-${at}`}
                      label={`Name of parameter ${at + 1}`}
                      required={false}
                      maxLength={55}
                      placeholder={`p${at + 1}`}
                      value={one.name.startsWith("$") ? "" : one.name}
                      hint="What whoever runs the query calls it."
                      {...(about[at]?.name ? { error: about[at]?.name } : {})}
                      onChange={(value) =>
                        change(at, { name: value === "" ? `$${at + 1}` : value })
                      }
                    />
                    <SelectField
                      name={`type-${at}`}
                      label={`Type of parameter ${at + 1}`}
                      options={QUERY_PARAMETER_TYPES.map((type) => ({ value: type, label: type }))}
                      value={one.type}
                      onChange={(type) => change(at, { type })}
                    />
                    <TextField
                      name={`label-${at}`}
                      label={`Label of parameter ${at + 1}`}
                      required={false}
                      maxLength={100}
                      value={one.label ?? ""}
                      hint="What the field is called. The name when empty."
                      onChange={(value) => change(at, { label: value })}
                    />
                    <TypedField
                      name={`default-${at}`}
                      label={`Default of parameter ${at + 1}`}
                      type={one.type}
                      value={defaultText(one.default)}
                      error={about[at]?.default}
                      onChange={(value) => change(at, { default: value })}
                    />
                    <CheckboxField
                      name={`required-${at}`}
                      label={`Parameter ${at + 1} is needed`}
                      checked={one.required === true}
                      hint="A run with no value for it is refused."
                      onChange={(on) => change(at, { required: on })}
                    />
                  </fieldset>
                ))}
              </div>
            </details>
          ) : null}
          <div className="w-48">
            <TextField
              name="rows"
              label="Rows to return"
              type="number"
              required={false}
              value={wanted}
              hint={`Up to ${count(MOST_ROWS)}.`}
              {...(rowsProblem ? { error: rowsProblem } : {})}
              onChange={setWanted}
            />
          </div>
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
              Write a query and press Run, or {formatCombo("Mod+Enter")} in the editor. Start with{" "}
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
                      <a
                        href={`${link}/queries?query=${encodeURIComponent(one.path)}`}
                        aria-current={one.path === open ? "page" : undefined}
                        onClick={(event) => {
                          if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.button !== 0
                          )
                            return;
                          event.preventDefault();
                          void go(one.path);
                        }}
                        className={`flex flex-col rounded-control px-2 py-1 hover:bg-sunken ${
                          one.path === open ? "bg-action-soft" : ""
                        }`}
                      >
                        {one.title ? <span>{one.title}</span> : null}
                        <span
                          className={`font-mono ${one.title ? "text-meta text-ink-muted" : "text-code"}`}
                        >
                          {one.path}
                        </span>
                        {one.renamedFrom ? (
                          <span className="text-meta text-ink-muted">
                            Renamed from {one.renamedFrom}, once deployed.
                          </span>
                        ) : null}
                        {one.description ? (
                          <span className="text-meta text-ink-muted">{one.description}</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </LoadState>
          </section>
          {listed ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>Used by</SectionLabel>
              <ReferenceList root={root} link={link} kind="query" name={listed.path} />
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <SectionLabel>Tables</SectionLabel>
            {sqlTables.length === 0 ? (
              <p className="m-0 text-body-sm text-ink-muted">
                This workspace has no tables you may read.
              </p>
            ) : (
              sqlTables.map((table) => (
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
