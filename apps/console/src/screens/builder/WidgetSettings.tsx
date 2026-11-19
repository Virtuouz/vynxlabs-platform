import type { InterfacePage, PageWidget, WidgetAction, WidgetLink } from "@vynxlabs/manifest";
import { type Filter, heading, type TableInfo } from "@vynxlabs/screens";
import {
  Button,
  CheckboxField,
  ComboboxField,
  MoveButtons,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  useFlip,
} from "@vynxlabs/ui";
import { Plus, Trash2 } from "lucide-react";
import { ActionSettings, RowActionsSettings, type TargetFacts } from "../ActionSettings.tsx";
import { BUCKETS, FUNCTIONS, OPERATORS, SYSTEM } from "./data.ts";
import { FormatSettings } from "./Format.tsx";
import { linkChoices } from "./links.ts";

export function WidgetSettings({
  root,
  factsOf,
  widget,
  page,
  tables,
  tableNames,
  onChange,
  onRemove,
}: {
  root: string;
  factsOf: (action: WidgetAction) => TargetFacts | undefined;
  widget: PageWidget;
  page: InterfacePage;
  tables: Record<string, TableInfo>;
  tableNames: string[];
  onChange: (change: (widget: PageWidget) => void) => void;
  onRemove: () => void;
}) {
  const info = widget.table ? tables[widget.table] : undefined;
  const columns = info?.columns ?? [];
  const options = (list: { name: string }[]) =>
    list.map((column) => ({ value: column.name, label: heading(column.name) }));
  const summary = widget.summary;
  // The names a widget's rows have: its totals' names, or its table's columns.
  const shownNames = summary
    ? [
        ...summary.groupBy.map((group) => ({ name: group.column })),
        ...summary.aggregates.map((aggregate) => ({ name: aggregate.as })),
      ]
    : columns;
  const fields = widget.fields ?? [];
  const shownFields = useFlip<HTMLDivElement>(fields.map((field) => field.column).join("\n"));
  const links = linkChoices(widget, page, tables);
  const conditions: { column: string; op?: string; value?: unknown }[] =
    widget.filter === undefined
      ? []
      : "and" in (widget.filter as object)
        ? ((widget.filter as { and: Filter[] }).and as { column: string }[])
        : [widget.filter as { column: string }];
  const setConditions = (next: typeof conditions) =>
    onChange((draft) => {
      if (next.length === 0) delete draft.filter;
      else draft.filter = next.length === 1 ? next[0] : { and: next };
    });
  const section = "mt-4 mb-0 text-body-sm font-semibold tracking-wide text-ink-muted uppercase";

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Title"
        name="title"
        value={widget.title ?? ""}
        maxLength={100}
        onChange={(title) =>
          onChange((draft) => {
            if (title) draft.title = title;
            else delete draft.title;
          })
        }
      />
      {widget.type === "action" ? (
        <ActionSettings
          root={root}
          action={widget.action}
          page={page}
          tables={tables}
          facts={widget.action ? factsOf(widget.action) : undefined}
          onChange={(action) =>
            onChange((draft) => {
              if (action) draft.action = action;
              else delete draft.action;
            })
          }
        />
      ) : widget.type === "text" ? (
        <TextAreaField
          label="Text"
          name="text"
          rows={6}
          value={widget.options?.text ?? ""}
          onChange={(text) =>
            onChange((draft) => {
              draft.options = { ...draft.options, text };
            })
          }
        />
      ) : (
        <ComboboxField
          label="Table"
          options={tableNames.map((name) => ({ value: name, label: name }))}
          value={widget.table}
          placeholder="Choose a table"
          onChange={(table) =>
            onChange((draft) => {
              if (table === draft.table) return;
              // Everything below was about the other table's columns.
              for (const key of ["summary", "fields", "sort", "filter", "link"] as const) {
                delete draft[key];
              }
              if (table) draft.table = table;
              else delete draft.table;
            })
          }
        />
      )}

      {widget.table && (widget.type === "table" || widget.type === "chart") ? (
        <>
          <CheckboxField
            label="Show totals in place of rows"
            name="totals"
            checked={summary !== undefined}
            hint="Count, add up or average the rows, for the whole table or for each group."
            onChange={(on) =>
              onChange((draft) => {
                delete draft.fields;
                delete draft.sort;
                if (on) draft.summary = { groupBy: [], aggregates: [{ fn: "count", as: "count" }] };
                else delete draft.summary;
              })
            }
          />
          {summary ? (
            <div className="flex flex-col gap-2 rounded-control border border-line p-2">
              {summary.groupBy.map((group, index) => {
                const type = columns.find((column) => column.name === group.column)?.type;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a group has no identity but its place
                  <div key={index} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <SelectField
                        label={`Group ${index + 1}`}
                        name={`group-${index}`}
                        value={group.column}
                        options={options(columns)}
                        onChange={(column) =>
                          onChange((draft) => {
                            const target = draft.summary?.groupBy[index];
                            if (target) {
                              target.column = column;
                              delete target.bucket;
                            }
                          })
                        }
                      />
                    </div>
                    {type === "timestamp" || type === "date" ? (
                      <SelectField
                        label="Gathered"
                        name={`bucket-${index}`}
                        value={group.bucket ?? ""}
                        options={BUCKETS}
                        onChange={(bucket) =>
                          onChange((draft) => {
                            const target = draft.summary?.groupBy[index];
                            if (!target) return;
                            if (bucket) target.bucket = bucket as "day";
                            else delete target.bucket;
                          })
                        }
                      />
                    ) : null}
                    <Button
                      aria-label={`Remove group ${index + 1}`}
                      onClick={() =>
                        onChange((draft) => {
                          draft.summary?.groupBy.splice(index, 1);
                        })
                      }
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
              {summary.groupBy.length < 3 && columns.length > 0 ? (
                <Button
                  size="small"
                  onClick={() =>
                    onChange((draft) => {
                      const free = columns.find(
                        (column) =>
                          !["json", "file"].includes(column.type) &&
                          !draft.summary?.groupBy.some((group) => group.column === column.name) &&
                          !SYSTEM.some((system) => system.name === column.name),
                      );
                      if (free) draft.summary?.groupBy.push({ column: free.name });
                    })
                  }
                >
                  <Plus size={14} aria-hidden="true" /> Group by a column
                </Button>
              ) : null}
              {summary.aggregates.map((aggregate, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a total has no identity but its place
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label={`Total ${index + 1}`}
                    name={`fn-${index}`}
                    value={aggregate.fn}
                    options={FUNCTIONS}
                    onChange={(fn) =>
                      onChange((draft) => {
                        const target = draft.summary?.aggregates[index];
                        if (!target) return;
                        target.fn = fn as "count";
                        const numeric = columns.find((column) =>
                          ["integer", "number"].includes(column.type),
                        )?.name;
                        if (fn === "count") delete target.column;
                        else if (target.column === undefined && numeric) target.column = numeric;
                        target.as = target.column ? `${fn}_${target.column}`.slice(0, 63) : "count";
                      })
                    }
                  />
                  {aggregate.fn !== "count" ? (
                    <div className="min-w-0 flex-1">
                      <SelectField
                        label="Of"
                        name={`of-${index}`}
                        value={aggregate.column ?? ""}
                        options={options(
                          columns.filter((column) =>
                            aggregate.fn === "sum" || aggregate.fn === "avg"
                              ? ["integer", "number"].includes(column.type)
                              : ["integer", "number", "timestamp", "date", "text"].includes(
                                  column.type,
                                ),
                          ),
                        )}
                        onChange={(column) =>
                          onChange((draft) => {
                            const target = draft.summary?.aggregates[index];
                            if (!target) return;
                            target.column = column;
                            target.as = `${target.fn}_${column}`.slice(0, 63);
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {summary.aggregates.length > 1 ? (
                    <Button
                      aria-label={`Remove total ${index + 1}`}
                      onClick={() =>
                        onChange((draft) => {
                          draft.summary?.aggregates.splice(index, 1);
                        })
                      }
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              ))}
              {summary.aggregates.length < 5 ? (
                <Button
                  size="small"
                  onClick={() =>
                    onChange((draft) => {
                      const numeric = columns.find((column) =>
                        ["integer", "number"].includes(column.type),
                      );
                      const taken = new Set(draft.summary?.aggregates.map((one) => one.as));
                      const next = numeric
                        ? { fn: "sum" as const, column: numeric.name, as: `sum_${numeric.name}` }
                        : { fn: "count" as const, as: "count" };
                      if (!taken.has(next.as)) draft.summary?.aggregates.push(next);
                    })
                  }
                >
                  <Plus size={14} aria-hidden="true" /> Add a total
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {widget.table && widget.type === "chart" ? (
        <>
          <h3 className={section}>What to draw</h3>
          <SelectField
            label="Shape"
            name="mark"
            value={widget.options?.mark ?? ""}
            options={[
              { value: "", label: "Choose a shape" },
              { value: "bar", label: "Bars" },
              { value: "line", label: "A line" },
              { value: "area", label: "An area" },
              { value: "pie", label: "A pie" },
            ]}
            onChange={(mark) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (mark) draft.options.mark = mark as "bar";
                else delete draft.options.mark;
              })
            }
          />
          {(["x", "y", "series"] as const).map((axis) => (
            <SelectField
              key={axis}
              label={
                axis === "x"
                  ? "Along the bottom, or each slice"
                  : axis === "y"
                    ? "How much"
                    : "A color for each"
              }
              name={axis}
              value={widget.options?.[axis] ?? ""}
              options={[
                { value: "", label: axis === "series" ? "Nothing" : "Choose" },
                ...options(shownNames),
              ]}
              onChange={(name) =>
                onChange((draft) => {
                  draft.options = { ...draft.options };
                  if (name) draft.options[axis] = name;
                  else delete draft.options[axis];
                })
              }
            />
          ))}
          <FormatSettings
            name="chart"
            label="How much is written as"
            format={widget.options?.format}
            onChange={(format) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (format) draft.options.format = format;
                else delete draft.options.format;
              })
            }
          />
        </>
      ) : null}

      {widget.table && widget.type === "figure" ? (
        <>
          <h3 className={section}>Number</h3>
          <FormatSettings
            name="figure"
            label="Written as"
            format={widget.options?.format}
            onChange={(format) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (format) draft.options.format = format;
                else delete draft.options.format;
                if (Object.keys(draft.options).length === 0) delete draft.options;
              })
            }
          />
        </>
      ) : null}

      {widget.table && widget.type !== "text" && widget.type !== "chart" ? (
        <>
          <h3 className={section}>{widget.type === "form" ? "Asks for" : "Shows"}</h3>
          {fields.length === 0 && widget.type !== "form" ? (
            <p className="m-0 text-body-sm text-ink-muted">
              {summary ? "Every group and total." : "The table's first columns. Add one to choose."}
            </p>
          ) : null}
          <div ref={shownFields} className="flex flex-col gap-3 empty:hidden">
            {fields.map((field, index) => {
              const column = columns.find((candidate) => candidate.name === field.column);
              const target = column?.references ? tables[column.references] : undefined;
              return (
                <div
                  key={field.column}
                  data-flip-key={field.column}
                  className="flex flex-col gap-2 rounded-control border border-line p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate text-body-sm">{heading(field.column)}</strong>
                    <span className="flex gap-1">
                      <MoveButtons
                        label={field.column}
                        at={index}
                        count={fields.length}
                        onMove={(by) =>
                          onChange((draft) => {
                            const list = draft.fields ?? [];
                            [list[index + by], list[index]] = [
                              list[index] as (typeof list)[number],
                              list[index + by] as (typeof list)[number],
                            ];
                          })
                        }
                      />
                      <Button
                        size="small"
                        aria-label={`Remove ${field.column}`}
                        onClick={() =>
                          onChange((draft) => {
                            draft.fields?.splice(index, 1);
                            if (draft.fields?.length === 0) delete draft.fields;
                          })
                        }
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </span>
                  </div>
                  <TextField
                    label={`Called (${field.column})`}
                    name={`label-${field.column}`}
                    value={field.label ?? ""}
                    placeholder={heading(field.column)}
                    maxLength={100}
                    onChange={(label) =>
                      onChange((draft) => {
                        const one = draft.fields?.[index];
                        if (!one) return;
                        if (label) one.label = label;
                        else delete one.label;
                      })
                    }
                  />
                  {target && widget.type !== "form" ? (
                    <SelectField
                      label={`Shown as (${field.column})`}
                      name={`show-${field.column}`}
                      value={field.show ?? ""}
                      options={[
                        { value: "", label: "Its ID" },
                        ...options(
                          target.columns.filter((one) => !SYSTEM.some((s) => s.name === one.name)),
                        ),
                      ]}
                      onChange={(show) =>
                        onChange((draft) => {
                          const one = draft.fields?.[index];
                          if (!one) return;
                          if (show) one.show = show;
                          else delete one.show;
                        })
                      }
                    />
                  ) : null}
                  {widget.type !== "form" &&
                  (summary
                    ? summary.aggregates.some(
                        (aggregate) =>
                          aggregate.as === field.column &&
                          (aggregate.fn === "count" ||
                            ["integer", "number"].includes(
                              columns.find((one) => one.name === aggregate.column)?.type ?? "",
                            )),
                      )
                    : column?.type === "integer" || column?.type === "number") ? (
                    <FormatSettings
                      name={field.column}
                      label={`Written as (${field.column})`}
                      format={field.format}
                      onChange={(format) =>
                        onChange((draft) => {
                          const one = draft.fields?.[index];
                          if (!one) return;
                          if (format) one.format = format;
                          else delete one.format;
                        })
                      }
                    />
                  ) : null}
                  {!summary && (widget.type === "table" || widget.type === "cards") ? (
                    <CheckboxField
                      label={`Can be changed here (${field.column})`}
                      name={`editable-${field.column}`}
                      checked={field.editable ?? false}
                      onChange={(editable) =>
                        onChange((draft) => {
                          const one = draft.fields?.[index];
                          if (!one) return;
                          if (editable) one.editable = true;
                          else delete one.editable;
                        })
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <SelectField
            label="Add"
            name="add-field"
            value=""
            options={[
              { value: "", label: "Choose what to add" },
              ...options(
                shownNames.filter(
                  (column) =>
                    !fields.some((field) => field.column === column.name) &&
                    !(
                      widget.type === "form" && SYSTEM.some((system) => system.name === column.name)
                    ),
                ),
              ),
            ]}
            onChange={(name) => {
              if (!name) return;
              onChange((draft) => {
                draft.fields = [...(draft.fields ?? []), { column: name }];
              });
            }}
          />
          {widget.type !== "form" ? (
            <p className="m-0 text-meta text-ink-muted">
              Leaving a value out only keeps it off the screen. Whoever may read the row can still
              be sent it. What keeps rows from people is the table's row rules.
            </p>
          ) : null}
        </>
      ) : null}

      {widget.table && widget.type !== "text" && widget.type !== "form" ? (
        <>
          <h3 className={section}>Order and filter</h3>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SelectField
                label="Sorted by"
                name="sort"
                value={widget.sort?.[0]?.column ?? ""}
                options={[{ value: "", label: "As they come" }, ...options(shownNames)]}
                onChange={(column) =>
                  onChange((draft) => {
                    if (column)
                      draft.sort = [{ column, ...(draft.sort?.[0]?.desc ? { desc: true } : {}) }];
                    else delete draft.sort;
                  })
                }
              />
            </div>
            {widget.sort?.[0] ? (
              <SelectField
                label="Direction"
                name="direction"
                value={widget.sort[0].desc ? "desc" : "asc"}
                options={[
                  { value: "asc", label: "Up" },
                  { value: "desc", label: "Down" },
                ]}
                onChange={(direction) =>
                  onChange((draft) => {
                    const first = draft.sort?.[0];
                    if (!first) return;
                    if (direction === "desc") first.desc = true;
                    else delete first.desc;
                  })
                }
              />
            ) : null}
          </div>
          {conditions.map((condition, index) => {
            const type = columns.find((column) => column.name === condition.column)?.type ?? "text";
            const change = (patch: object) =>
              setConditions(
                conditions.map((one, at) => (at === index ? { ...one, ...patch } : one)),
              );
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: a condition has no identity but its place
                key={index}
                className="flex flex-wrap items-end gap-2 rounded-control border border-line p-2"
              >
                <SelectField
                  label={`Only rows where (${index + 1})`}
                  name={`where-${index}`}
                  value={condition.column}
                  options={options(columns.filter((column) => column.type !== "json"))}
                  onChange={(column) => change({ column, value: undefined })}
                />
                <SelectField
                  label="Test"
                  name={`op-${index}`}
                  value={condition.op ?? "eq"}
                  options={OPERATORS.filter((op) => op.value !== "contains" || type === "text")}
                  onChange={(op) => change({ op })}
                />
                {condition.op !== "is_null" ? (
                  <TextField
                    label="Value"
                    name={`value-${index}`}
                    value={condition.value === undefined ? "" : String(condition.value)}
                    onChange={(text) =>
                      change({
                        value:
                          type === "integer" || type === "number"
                            ? text === "" || Number.isNaN(Number(text))
                              ? undefined
                              : Number(text)
                            : type === "boolean"
                              ? text === "true"
                              : text,
                      })
                    }
                  />
                ) : null}
                <Button
                  aria-label={`Remove condition ${index + 1}`}
                  onClick={() => setConditions(conditions.filter((_, at) => at !== index))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </div>
            );
          })}
          {summary && conditions.length === 0 ? (
            <p className="m-0 text-meta text-ink-muted">
              A condition narrows what is counted or added up here, besides the page's filters: for
              example, only the invoices whose status is unpaid.
            </p>
          ) : null}
          {conditions.length < 20 && columns.length > 0 ? (
            <Button
              size="small"
              onClick={() =>
                setConditions([
                  ...conditions,
                  {
                    column:
                      (columns.find((column) => !SYSTEM.includes(column)) ?? columns[0])?.name ??
                      "id",
                    op: "eq",
                  },
                ])
              }
            >
              <Plus size={14} aria-hidden="true" /> Add a condition
            </Button>
          ) : null}
        </>
      ) : null}

      {widget.table && widget.type !== "text" ? (
        <>
          <h3 className={section}>Follows</h3>
          <SelectField
            label="What it shows follows"
            name="link"
            value={widget.link ? JSON.stringify(widget.link) : ""}
            options={[
              {
                value: "",
                label: widget.type === "form" ? "Nothing" : "Nothing: it shows the table",
              },
              ...links.map((choice) => ({ value: choice.value, label: choice.label })),
              // A link that the page no longer allows is still shown, so that it can be seen and taken off.
              ...(widget.link &&
              !links.some((choice) => choice.value === JSON.stringify(widget.link))
                ? [{ value: JSON.stringify(widget.link), label: "A link that no longer fits" }]
                : []),
            ]}
            hint={
              links.length === 0
                ? "Nothing else on this page can be followed yet. A widget can follow one over the same table, or one a column of its table refers to."
                : "Choosing a row in the other widget decides what this one shows."
            }
            onChange={(value) =>
              onChange((draft) => {
                if (value) draft.link = JSON.parse(value) as WidgetLink;
                else delete draft.link;
              })
            }
          />
        </>
      ) : null}

      {widget.type === "form" ? (
        <>
          <TextField
            label="Button"
            name="submitLabel"
            value={widget.options?.submitLabel ?? ""}
            placeholder="Add"
            maxLength={60}
            onChange={(submitLabel) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (submitLabel) draft.options.submitLabel = submitLabel;
                else delete draft.options.submitLabel;
              })
            }
          />
          <TextField
            label="Says afterwards"
            name="success"
            value={widget.options?.success ?? ""}
            placeholder="Added."
            maxLength={300}
            onChange={(success) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (success) draft.options.success = success;
                else delete draft.options.success;
              })
            }
          />
        </>
      ) : null}
      {(widget.type === "table" || widget.type === "cards") && !summary ? (
        <>
          <CheckboxField
            label="Rows can be added here"
            name="allowAdd"
            checked={widget.options?.allowAdd ?? false}
            onChange={(allowAdd) =>
              onChange((draft) => {
                draft.options = { ...draft.options, allowAdd };
              })
            }
          />
          {widget.type === "table" ? (
            <CheckboxField
              label="Rows can be deleted here"
              name="allowDelete"
              checked={widget.options?.allowDelete ?? false}
              onChange={(allowDelete) =>
                onChange((draft) => {
                  draft.options = { ...draft.options, allowDelete };
                })
              }
            />
          ) : null}
        </>
      ) : null}

      <h3 className={section}>Place and size</h3>
      <p className="m-0 text-meta text-ink-muted">
        The page is twelve columns wide. A widget can also be dragged by its heading and stretched
        by its bottom right corner.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["x", "From the left", 0, 11],
            ["y", "From the top", 0, 199],
            ["w", "Width", 1, 12],
            ["h", "Height", 1, 40],
          ] as const
        ).map(([key, label, min, max]) => (
          <NumberField
            key={key}
            label={label}
            name={key}
            min={min}
            max={max}
            step={1}
            value={widget.at[key]}
            onChange={(value) =>
              onChange((draft) => {
                if (value === undefined) return;
                draft.at[key] = Math.min(max, Math.max(min, Math.round(value)));
                // A widget ends where the page does.
                if (draft.at.x + draft.at.w > 12) draft.at.w = 12 - draft.at.x;
              })
            }
          />
        ))}
      </div>
      {widget.type === "table" && widget.table && !summary ? (
        <>
          <h3 className={section}>Row actions</h3>
          <RowActionsSettings
            root={root}
            widget={widget}
            page={page}
            tables={tables}
            factsOf={factsOf}
            onChange={(actions) =>
              onChange((draft) => {
                if (actions) draft.actions = actions;
                else delete draft.actions;
              })
            }
          />
        </>
      ) : null}
      <div className="mt-2">
        <Button variant="danger" onClick={onRemove}>
          Remove this widget
        </Button>
      </div>
    </div>
  );
}
