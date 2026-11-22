/**
 * "Rows it uses": the group every data widget's Data tab starts with (board 8). Source is a row;
 * the page's filters are chips, checked while followed; "Only include" is a sentence for each
 * condition and a dashed "+ Condition"; "Sorted by" is a row that opens the sort and how many.
 * Sort and limit are always rows, never behind "More data options".
 */
import {
  type DataInput,
  type FilterBinding,
  groupName,
  type PageFilter,
  type VisualCondition,
  type VisualQuery,
} from "@volvel/manifest";
import {
  AddChip,
  Button,
  CheckChip,
  ChipSet,
  ConditionEditor,
  type ConditionValue,
  Details,
  DrawerBlock,
  DrawerEditor,
  DrawerGroup,
  DrawerRow,
  MultiSelectField,
  SelectField,
  SentenceChip,
  SortEditor,
  type SortField,
  TextField,
} from "@volvel/ui";
import { Code2, Database, Plus, Table2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Loading } from "../LoadState.tsx";
import { useColumnValues } from "./catalog.ts";
import {
  conditionColumns,
  fromEditor,
  isComplete,
  operatorsFor,
  sentenceOf,
  spokenType,
  toEditor,
} from "./conditionWords.ts";
import type { Env } from "./controls.tsx";
import {
  bindFilter,
  type CatalogColumn,
  type DataPart,
  dataParts,
  defaultInputs,
  filterColumn,
  heading,
  MAX_SEARCH_COLUMNS,
  resultNames,
  searchColumns,
  sourcesOf,
  visualOf,
  withInput,
} from "./model.ts";
import {
  ChoiceList,
  columnsOf,
  iconOfType,
  NUMERIC,
  TEMPORAL,
  writeVisual,
} from "./queryParts.tsx";

const CodeEditor = lazy(() =>
  import("../../editor/CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })),
);

type Kind = "table" | "query" | "sql";
const kindOf = (input: DataInput | undefined): Kind | undefined =>
  !input
    ? undefined
    : "visual" in input.source
      ? "table"
      : "query" in input.source
        ? "query"
        : "sql";

export interface RowsParts {
  source: boolean;
  conditions: boolean;
  sort: boolean;
  limit: boolean;
}

/** Which rows of the group an input's hints ask for. */
export function rowsPartsOf(parts: readonly DataPart[], input: string): RowsParts {
  const mine = parts.filter((one) => one.input === input).map((one) => one.control);
  return {
    source: mine.includes("source"),
    conditions: mine.includes("conditions"),
    sort: mine.includes("sort"),
    limit: mine.includes("limit"),
  };
}

/**
 * The group "Rows it uses" for one input of a widget. Which rows it has is what the widget's data
 * hints declare for the input (or `show`, when a drawer says so itself).
 */
export function RowsItUses({
  env,
  input,
  show,
}: {
  env: Env;
  input: string;
  show?: Partial<RowsParts>;
}) {
  const declared = rowsPartsOf(dataParts(env.definition), input);
  const rows = { ...declared, ...show };
  const data = env.widget.data?.[input];
  const visual = visualOf(data);
  const columns = columnsOf(env, visual);
  const [writing, setWriting] = useState(false);
  const showSql = kindOf(data) === "sql" || writing;
  const declaredInput = env.definition.data[input];
  const label = rows.source ? "Source" : (declaredInput?.label ?? "Rows");
  return (
    <DrawerGroup label="Rows it uses">
      {rows.source ? (
        <SourceRow
          env={env}
          input={input}
          label={label}
          writing={writing}
          setWriting={setWriting}
        />
      ) : null}
      {showSql ? <SqlBlock env={env} input={input} /> : null}
      {data && !visual && !showSql ? (
        <DrawerBlock>
          <p className="m-0 text-body-sm text-ink-muted">It gives its own columns.</p>
        </DrawerBlock>
      ) : null}
      {data && rows.source && env.filters.length > 0 ? (
        <FollowChips env={env} input={input} columns={columns} />
      ) : null}
      {data && rows.source && env.filters.length === 0 && env.addFilters ? (
        <DrawerBlock>
          <p className="m-0 text-body-sm text-ink-muted">
            Add Search and filter to let people narrow this page.
          </p>
          <div>
            <Button size="small" onClick={env.addFilters}>
              <Plus aria-hidden="true" size={14} /> Add Search and filter
            </Button>
          </div>
        </DrawerBlock>
      ) : null}
      {visual && rows.conditions ? (
        <ConditionsBlock env={env} input={input} visual={visual} columns={columns} />
      ) : null}
      {visual && (rows.sort || rows.limit) ? (
        <SortRow
          env={env}
          input={input}
          visual={visual}
          columns={columns}
          withSort={rows.sort}
          withLimit={rows.limit}
        />
      ) : null}
    </DrawerGroup>
  );
}

// ---------------------------------------------------------------------------
// Source

function SourceRow({
  env,
  input,
  label,
  writing,
  setWriting,
}: {
  env: Env;
  input: string;
  label: string;
  writing: boolean;
  setWriting: (next: boolean) => void;
}) {
  const declared = env.definition.data[input];
  const data = env.widget.data?.[input];
  const current = kindOf(data);
  const { catalog } = env;
  const offered = sourcesOf(declared, env.surface).filter(
    (kind) => kind !== "sql" || catalog.maySql || current === "sql",
  );
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (current && current !== "sql") setWriting(false);
  }, [current, setWriting]);
  const key = `source:${env.widget.id}:${input}`;

  /** A table chosen starts the input over for that table, following the filters whose column it has. */
  const choose = (table: string) => {
    const start = defaultInputs(env.definition, table, catalog)[input] ?? {
      source: { visual: { table } },
    };
    let widget = withInput(env.widget, input, start);
    for (const filter of env.filters) widget = bindFilter(widget, filter, catalog, env.neighbours);
    env.write(widget, "choosing a table", key);
  };
  const options = [
    ...(offered.includes("table")
      ? catalog.tables.map((one) => ({
          value: `table:${one.name}`,
          label: heading(one.name),
          icon: Table2,
        }))
      : []),
    ...(offered.includes("query")
      ? catalog.queries.map((one) => ({
          value: `query:${one.path}`,
          label: `Query: ${one.path}`,
          icon: Database,
          ...(one.description ? { hint: one.description } : {}),
        }))
      : []),
    ...(offered.includes("sql") ? [{ value: "sql:", label: "SQL written here", icon: Code2 }] : []),
  ];
  const value =
    current === "sql" || writing
      ? "sql:"
      : data && "visual" in data.source && data.source.visual.table
        ? `table:${data.source.visual.table}`
        : data && "query" in data.source
          ? `query:${data.source.query}`
          : undefined;
  const chosen = options.find((one) => one.value === value);
  return (
    <DrawerRow
      label={label}
      icon={chosen?.icon ?? Table2}
      value={chosen?.label}
      open={open}
      onOpenChange={setOpen}
      editorTitle="Where it reads from"
      editorFooter={false}
      editor={
        <ChoiceList
          label="Where it reads from"
          value={value}
          options={options}
          onChange={(next) => {
            if (next === value) return;
            setOpen(false);
            if (next === "sql:") {
              setWriting(true);
              if (current !== "sql")
                env.write(withInput(env.widget, input, undefined), "choosing SQL", key);
            } else if (next.startsWith("query:")) {
              setWriting(false);
              env.write(
                withInput(env.widget, input, { source: { query: next.slice(6) } }),
                "choosing a query",
                key,
              );
            } else {
              setWriting(false);
              choose(next.slice(6));
            }
          }}
        />
      }
    />
  );
}

function SqlBlock({ env, input }: { env: Env; input: string }) {
  const data = env.widget.data?.[input];
  const key = `source:${env.widget.id}:${input}`;
  return (
    <div className="overflow-hidden">
      <Suspense fallback={<Loading />}>
        <CodeEditor
          label="The widget's query"
          language="sql"
          path={`widgets/${env.widget.id}-${input}.sql`}
          value={data && "sql" in data.source ? data.source.sql : ""}
          height="10rem"
          onChange={(sql) => {
            const values =
              data && "sql" in data.source && data.source.values
                ? { values: data.source.values }
                : {};
            env.write(
              withInput(
                env.widget,
                input,
                sql.trim() ? { ...(data ?? {}), source: { sql, ...values } } : undefined,
              ),
              "writing the query",
              key,
            );
          }}
        />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page's filters

/**
 * "Follows 4 page filters · click to switch one off": a chip for each filter, checked while this
 * input follows it and dashed while it does not. Under them, where each followed filter goes: the
 * columns a search looks in, the column a filter narrows, or the parameter of a saved query or SQL.
 */
function FollowChips({
  env,
  input,
  columns,
}: {
  env: Env;
  input: string;
  columns: { name: string; type?: string }[];
}) {
  const data = env.widget.data?.[input] as DataInput;
  const visual = visualOf(data);
  const bindings = data.filters ?? [];
  const save = (next: FilterBinding[], words: string) => {
    const { filters: _before, ...rest } = data;
    env.write(
      withInput(env.widget, input, next.length > 0 ? { ...rest, filters: next } : rest),
      words,
      `follows:${env.widget.id}:${input}`,
    );
  };
  const follow = (filter: PageFilter): FilterBinding[] => {
    if (visual && filter.type === "search") {
      const looks = searchColumns(env.widget, visual.table, env.catalog);
      const text = columns.filter((one) => one.type === "text").map((one) => one.name);
      return [{ filter: filter.name, columns: looks.length > 0 ? looks : text.slice(0, 1) }];
    }
    if (visual) {
      const column = columns.some((one) => one.name === filterColumn(filter))
        ? filterColumn(filter)
        : (columns[0]?.name ?? "id");
      return [{ filter: filter.name, column }];
    }
    return filter.type === "date_range"
      ? [
          { filter: filter.name, parameter: `${filter.name}_from`, part: "from" },
          { filter: filter.name, parameter: `${filter.name}_to`, part: "to" },
        ]
      : [{ filter: filter.name, parameter: filter.name }];
  };
  const followed = env.filters.filter((filter) =>
    bindings.some((one) => one.filter === filter.name),
  );
  const nameOf = (filter: PageFilter) => filter.label ?? heading(filter.name);
  return (
    <DrawerBlock
      label={`Follows ${env.filters.length} page ${env.filters.length === 1 ? "filter" : "filters"} · click to switch one off`}
    >
      <ChipSet label="Page filters this follows">
        {env.filters.map((filter) => (
          <CheckChip
            key={filter.name}
            checked={bindings.some((one) => one.filter === filter.name)}
            onChange={(on) =>
              save(
                on
                  ? [...bindings, ...follow(filter)]
                  : bindings.filter((one) => one.filter !== filter.name),
                `changing which filters ${env.widget.title || "the widget"} follows`,
              )
            }
          >
            {nameOf(filter)}
          </CheckChip>
        ))}
      </ChipSet>
      {followed.length > 0 ? (
        <Details summary={<span className="text-body-sm">Where each one goes</span>}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {followed.map((filter) => {
              const mine = bindings.filter((one) => one.filter === filter.name);
              const name = nameOf(filter);
              return (
                <li key={filter.name} className="flex flex-col gap-1">
                  {visual && filter.type === "search" ? (
                    <MultiSelectField
                      label={`Columns ${name} looks in`}
                      options={columns
                        .filter((one) => one.type === "text")
                        .map((one) => ({ value: one.name, label: heading(one.name) }))}
                      value={mine[0]?.columns ?? (mine[0]?.column ? [mine[0].column] : [])}
                      placeholder="None"
                      hint={`Up to ${MAX_SEARCH_COLUMNS}. A row is kept when any of them has the words.`}
                      onChange={(next) => {
                        const chosen = next.slice(0, MAX_SEARCH_COLUMNS);
                        // A search that looks nowhere is not following.
                        save(
                          chosen.length === 0
                            ? bindings.filter((one) => one.filter !== filter.name)
                            : bindings.map((one) =>
                                one.filter === filter.name
                                  ? { filter: filter.name, columns: chosen }
                                  : one,
                              ),
                          "changing the columns a search looks in",
                        );
                      }}
                    />
                  ) : null}
                  {visual && filter.type !== "search" ? (
                    <SelectField
                      name={`${env.widget.id}-${input}-bind-${filter.name}`}
                      label={`Column that ${name} narrows`}
                      value={mine[0]?.column ?? ""}
                      options={columns.map((column) => ({
                        value: column.name,
                        label: heading(column.name),
                      }))}
                      onChange={(column) =>
                        save(
                          bindings.map((one) =>
                            one.filter === filter.name ? { ...one, column } : one,
                          ),
                          "changing the column a filter narrows",
                        )
                      }
                    />
                  ) : null}
                  {!visual
                    ? mine.map((binding) => (
                        <TextField
                          key={binding.part ?? "value"}
                          name={`${env.widget.id}-${input}-param-${filter.name}-${binding.part ?? "value"}`}
                          label={`Parameter that ${name} fills${binding.part ? ` (${binding.part})` : ""}`}
                          value={binding.parameter ?? ""}
                          onChange={(parameter) =>
                            save(
                              bindings.map((one) =>
                                one === binding ? { ...one, parameter } : one,
                              ),
                              "changing the parameter a filter fills",
                            )
                          }
                        />
                      ))
                    : null}
                </li>
              );
            })}
          </ul>
        </Details>
      ) : null}
    </DrawerBlock>
  );
}

// ---------------------------------------------------------------------------
// Only include

/** The editor of one condition: the kit's, with the column's own words and, where known, its values. */
function ConditionBody({
  columns: given,
  start,
  onChange,
  root,
  table,
}: {
  columns: readonly CatalogColumn[];
  start: ConditionValue;
  onChange: (next: ConditionValue) => void;
  /** Where the table's column values are read from, and which table. */
  root?: string | undefined;
  table?: string | undefined;
}) {
  // What is typed is kept as typed (a list with its commas) while the query takes what it means.
  const [draft, setDraft] = useState(start);
  const chosen = given.find((one) => one.name === draft.field);
  // The values the column holds, with how many rows each has, as the server counts them.
  const read = useColumnValues(root, table, chosen);
  const columns = given.map((one) =>
    one.name === draft.field && read && !(one.values && one.values.length > 0)
      ? { ...one, values: read }
      : one,
  );
  const column = columns.find((one) => one.name === draft.field);
  return (
    <ConditionEditor
      columns={conditionColumns(columns)}
      operators={operatorsFor}
      choices={(field) => {
        const values = columns.find((one) => one.name === field)?.values;
        return values && values.length > 0
          ? values.map((one) => ({
              value: one.value,
              ...(one.count === undefined ? {} : { count: one.count }),
            }))
          : undefined;
      }}
      value={draft}
      onChange={(next) => {
        setDraft(next);
        onChange(next);
      }}
      {...(spokenType(column) === "choice"
        ? { note: `${heading(draft.field)} is a choice column, so you pick from its values` }
        : {})}
    />
  );
}

function ConditionsBlock({
  env,
  input,
  visual,
  columns,
}: {
  env: Env;
  input: string;
  visual: VisualQuery;
  columns: CatalogColumn[];
}) {
  const conditions = visual.filters ?? [];
  const write = (filters: VisualCondition[], words: string, key?: string) =>
    writeVisual(env, input, { ...visual, filters }, words, key);
  /** The condition at `at`, replaced by what the editor made of it (a "not" of several is several). */
  const replace = (at: number, next: ConditionValue) =>
    write(
      conditions.flatMap((one, index) => (index === at ? fromEditor(next) : [one])),
      "changing a condition",
      `condition:${env.widget.id}:${input}:${at}`,
    );
  // A new condition starts on the most useful column: a choice (a few known values) first,
  // else a date of the table's own, else a number.
  const first =
    columns.find(
      (one) =>
        spokenType(one) === "choice" ||
        one.type === "enum" ||
        one.type === "boolean" ||
        // A text column the server counted to a few values is a choice in all but its type.
        (one.type === "text" &&
          one.distinct !== undefined &&
          one.distinct > 1 &&
          one.distinct <= 12),
    ) ??
    columns.find(
      (one) => TEMPORAL.has(one.type) && !["created_at", "updated_at"].includes(one.name),
    ) ??
    columns.find((one) => NUMERIC.has(one.type)) ??
    columns[1] ??
    columns[0];
  const [draft, setDraft] = useState<ConditionValue | undefined>();
  const [adding, setAdding] = useState(false);
  return (
    <DrawerBlock label="Only include">
      <ChipSet label="Conditions rows must meet">
        {conditions.map((condition, at) => {
          const column = columns.find((one) => one.name === condition.column);
          const sentence = sentenceOf(condition, column);
          return (
            <SentenceChip
              // biome-ignore lint/suspicious/noArrayIndexKey: a part of a query has no identity but its place in the list
              key={`${condition.column}-${at}`}
              removeLabel={`Remove ${sentence.before} ${sentence.value}`.trim()}
              onRemove={() =>
                write(
                  conditions.filter((_, index) => index !== at),
                  "removing a condition",
                )
              }
              wrapEdit={(button) => (
                <DrawerEditor trigger={button} title="Only include rows where">
                  <ConditionBody
                    columns={columns}
                    root={env.catalog.root}
                    table={visual.table}
                    start={toEditor(condition, column)}
                    onChange={(next) => replace(at, next)}
                  />
                </DrawerEditor>
              )}
            >
              {sentence.before}
              {sentence.value ? (
                <>
                  {" "}
                  <strong>{sentence.value}</strong>
                </>
              ) : null}
            </SentenceChip>
          );
        })}
        {conditions.length < 20 && first ? (
          <DrawerEditor
            open={adding}
            onOpenChange={(next) => {
              setAdding(next);
              if (next)
                setDraft({
                  field: first.name,
                  test: operatorsFor(spokenType(first))[0]?.test ?? "eq",
                });
            }}
            title="Only include rows where"
            doneLabel="Add"
            onDone={() => {
              if (draft && isComplete(draft)) {
                write([...conditions, ...fromEditor(draft)], "adding a condition");
              }
            }}
            trigger={<AddChip>Condition</AddChip>}
          >
            {draft ? (
              <ConditionBody
                columns={columns}
                root={env.catalog.root}
                table={visual.table}
                start={draft}
                onChange={setDraft}
              />
            ) : null}
          </DrawerEditor>
        ) : null}
      </ChipSet>
    </DrawerBlock>
  );
}

// ---------------------------------------------------------------------------
// Sorted by, and how many

const LIMITS = [5, 10, 25, 50, 100, 500, 1000];

/** Which two words a sort's direction is said in, by what the field holds. */
function wordsOf(type: string): {
  desc: string;
  asc: string;
  phrase: { desc: string; asc: string };
} {
  if (TEMPORAL.has(type) || type === "date")
    return {
      desc: "Newest",
      asc: "Oldest",
      phrase: { desc: "newest first", asc: "oldest first" },
    };
  if (type === "integer" || type === "number" || type === "measure")
    return {
      desc: "Largest",
      asc: "Smallest",
      phrase: { desc: "largest first", asc: "smallest first" },
    };
  return { desc: "Z to A", asc: "A to Z", phrase: { desc: "Z to A", asc: "A to Z" } };
}

function SortRow({
  env,
  input,
  visual,
  columns,
  withSort,
  withLimit,
}: {
  env: Env;
  input: string;
  visual: VisualQuery;
  columns: CatalogColumn[];
  withSort: boolean;
  withLimit: boolean;
}) {
  const sorts = visual.sort ?? [];
  const summary = env.definition.data[input]?.shape === "summary";
  const typeOfResult = (name: string): string => {
    if ((visual.measures ?? []).some((one) => one.as === name)) return "measure";
    const group = (visual.groupBy ?? []).find((one) => groupName(one) === name);
    const column = columns.find((one) => one.name === (group?.column ?? name));
    return group?.bucket ? "date" : (column?.type ?? "text");
  };
  const fields: SortField[] = withSort
    ? summary
      ? resultNames(env.widget.data?.[input]).map((name) => ({
          id: name,
          label: heading(name),
          icon: iconOfType(typeOfResult(name) === "measure" ? "number" : typeOfResult(name)),
          words: wordsOf(typeOfResult(name)),
        }))
      : columns.map((column) => ({
          id: column.name,
          label: heading(column.name),
          icon: iconOfType(column.type, column.references),
          words: wordsOf(column.type),
        }))
    : [];
  const typeOfField = (id: string) =>
    summary ? typeOfResult(id) : (columns.find((one) => one.name === id)?.type ?? "text");

  const direction = (one: { descending?: boolean }) =>
    (one.descending ? "desc" : "asc") as "asc" | "desc";
  const limitOptions = [
    { value: undefined, label: "All rows" },
    ...[...new Set([...LIMITS, ...(visual.limit ? [visual.limit] : [])])]
      .sort((a, b) => a - b)
      .map((value) => ({ value, label: String(value) })),
  ];
  const lead = sorts[0];
  const phrase = lead
    ? `${heading(lead.by)}, ${wordsOf(typeOfField(lead.by)).phrase[lead.descending ? "desc" : "asc"]}${sorts.length > 1 ? ` · then ${sorts.length - 1} more` : ""}`
    : undefined;
  return (
    <DrawerRow
      label={withSort ? "Sorted by" : "Show at most"}
      value={
        withSort
          ? (phrase ?? <span className="text-ink-muted">As they come</span>)
          : visual.limit === undefined
            ? "All rows"
            : visual.limit
      }
      hint={withSort && visual.limit !== undefined ? `at most ${visual.limit}` : undefined}
      editorTitle={withSort ? "Sorted by" : "Show at most"}
      editor={
        <div className="flex flex-col gap-3">
          <SortEditor
            fields={fields}
            sorts={sorts.map((one) => ({ field: one.by, direction: direction(one) }))}
            onChange={(next) =>
              writeVisual(
                env,
                input,
                {
                  ...visual,
                  sort: next.map((one) => ({
                    by: one.field,
                    ...(one.direction === "desc" ? { descending: true } : {}),
                  })),
                },
                "changing the order",
                `sort:${env.widget.id}:${input}`,
              )
            }
            {...(withLimit
              ? {
                  limit: visual.limit,
                  limitOptions,
                  onLimit: (limit: number | undefined) => {
                    const { limit: _before, ...rest } = visual;
                    writeVisual(
                      env,
                      input,
                      limit === undefined ? rest : { ...rest, limit },
                      "changing how many",
                      `limit:${env.widget.id}:${input}`,
                    );
                  },
                }
              : {})}
          />
          {sorts.length === 1 ? (
            <div>
              <button
                type="button"
                onClick={() =>
                  writeVisual(env, input, { ...visual, sort: [] }, "removing the order")
                }
                className="cursor-pointer text-body-sm text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                Don't sort
              </button>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
