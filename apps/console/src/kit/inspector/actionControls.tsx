/**
 * The step editor (board 4): what a widget does when it is used, as steps that
 * read as sentences. "When clicked", then 1 Ask to confirm, 2 Update the record,
 * 3 Run a workflow, 4 Show a message; "Add a step"; and, at the end, what the
 * action changes and who may do it, said where it acts (POLISH-010).
 *
 * Values are chosen from a menu, never typed as code. A dashboard offers only
 * narrow, message and rows. It draws from the widget's definition and the host's
 * lists (pages, flows, scripts, groups), so a pack's widget with an `action`
 * setting has this editor the day it is registered.
 */
import {
  Button,
  CheckboxField,
  Details,
  Menu,
  MoveButtons,
  SegmentedControl,
  SelectField,
  TextField,
} from "@volvel/ui";
import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  type Action,
  type ActionContext,
  type ActionValue,
  type AskedField,
  grantWords,
  inputWords,
  moved,
  newStep,
  type RecordRef,
  refsOf,
  refWords,
  STEP_WORDS,
  type Step,
  settableColumns,
  stepKindsFor,
  tableOfRef,
  typedConstant,
  valueFromKey,
  valueKey,
  valueOptions,
  withSteps,
} from "./actionModel.ts";
import { ConditionsEditor } from "./conditions.tsx";
import type { Env } from "./controls.tsx";
import { type ConfigSetting, heading, resultNames, visualOf, withSystemColumns } from "./model.ts";

/** What an action here may reach, from the widget, the page and the host's lists. */
export function actionContext(env: Env): ActionContext {
  const columnsOf = (table: string | undefined) =>
    table
      ? withSystemColumns(env.catalog.tables.find((one) => one.name === table)?.columns ?? [])
      : [];
  const own = Object.values(env.widget.data ?? {})
    .map((input) => visualOf(input)?.table)
    .find(Boolean);
  const events = Object.values(env.definition.events);
  const raisesRecord = events.some((one) => one.gives === "record");
  const thisTable = env.page?.record?.table;
  const kind = env.page?.kind ?? "page";
  return {
    surface: env.surface,
    thisTable,
    // A widget that gives a record (a row clicked) works on its own table; one that gives none has no clicked record.
    eventTable: raisesRecord ? own : undefined,
    defaultRef: raisesRecord || !thisTable ? "event" : "this",
    groupEvent: events.some((one) => one.gives === "group"),
    openAs: kind === "sheet" ? "sheet" : kind === "modal" ? "modal" : "page",
    columnsOf,
  };
}

// ---------------------------------------------------------------------------
// One value, from a menu

function ValuePicker({
  id,
  label,
  value,
  ctx,
  asked,
  onChange,
  optional,
}: {
  id: string;
  label: string;
  value: ActionValue | undefined;
  ctx: ActionContext;
  asked: readonly AskedField[];
  /** `undefined` takes the value away: only offered where a value may be left out. */
  onChange: (next: ActionValue | undefined, key?: string) => void;
  optional?: boolean;
}) {
  const key = valueKey(value);
  const options = valueOptions(ctx, asked);
  const known = key === "" || options.some((one) => one.value === key);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SelectField
        name={id}
        label={label}
        labelHidden
        value={key}
        options={[
          ...(optional || key === ""
            ? [{ value: "", label: optional ? "Nothing" : "Choose a value" }]
            : []),
          ...(known ? [] : [{ value: key, label: heading(key.split(":").pop() ?? key) }]),
          ...options,
        ]}
        onChange={(next) => onChange(next === "" ? undefined : valueFromKey(next, value))}
      />
      {value && "value" in value ? (
        <TextField
          name={`${id}-value`}
          label={`${label}: the value`}
          labelHidden
          placeholder="Value"
          required={false}
          value={value.value === undefined || value.value === null ? "" : String(value.value)}
          onChange={(text) => onChange({ value: typedConstant(text) }, `${id}:value`)}
        />
      ) : null}
    </div>
  );
}

/** "Status becomes [Paid]" rows, and "+ Set another field". */
function FieldSetter({
  id,
  table,
  set,
  verb,
  ctx,
  asked,
  onChange,
}: {
  id: string;
  table: string | undefined;
  set: Record<string, ActionValue>;
  verb: string;
  ctx: ActionContext;
  asked: readonly AskedField[];
  onChange: (next: Record<string, ActionValue>, key?: string) => void;
}) {
  const columns = settableColumns(ctx.columnsOf(table));
  const left = columns.filter((column) => !(column.name in set));
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(set).map(([name, value]) => (
        <div key={name} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-sm font-medium text-ink">
              {heading(name)} <span className="font-normal text-ink-muted">{verb}</span>
            </span>
            <Button
              size="small"
              variant="quiet"
              aria-label={`Stop setting ${heading(name)}`}
              onClick={() => {
                const { [name]: _gone, ...rest } = set;
                onChange(rest);
              }}
            >
              <X aria-hidden="true" size={14} />
            </Button>
          </div>
          <ValuePicker
            id={`${id}-${name}`}
            label={`${heading(name)} ${verb}`}
            value={value}
            ctx={ctx}
            asked={asked}
            onChange={(next, key) => next && onChange({ ...set, [name]: next }, key)}
          />
        </div>
      ))}
      {left.length > 0 ? (
        <SelectField
          name={`${id}-add`}
          label="Set another field"
          labelHidden
          value=""
          options={[
            { value: "", label: "+ Set another field" },
            ...left.map((column) => ({ value: column.name, label: heading(column.name) })),
          ]}
          onChange={(name) => name && onChange({ ...set, [name]: { value: "" } })}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The cards

function Card({
  number,
  title,
  count,
  onMove,
  onRemove,
  children,
}: {
  number: number;
  title: string;
  count: number;
  onMove?: ((by: -1 | 1) => void) | undefined;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="m-0 flex min-w-0 items-center gap-2 text-body-sm font-medium text-ink">
          <span
            aria-hidden="true"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken text-meta"
          >
            {number}
          </span>
          <span className="min-w-0 break-words">
            <span className="sr-only">Step {number}: </span>
            {title}
          </span>
        </h4>
        <div className="flex shrink-0 items-center">
          {onMove ? (
            <MoveButtons label={`step ${number}`} at={number - 1} count={count} onMove={onMove} />
          ) : null}
          <Button
            size="small"
            variant="quiet"
            aria-label={`Remove step ${number}`}
            onClick={onRemove}
          >
            <X aria-hidden="true" size={14} />
          </Button>
        </div>
      </div>
      {children}
    </li>
  );
}

const SLUG = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "")
    .slice(0, 40);

function ConfirmCard({
  id,
  number,
  count,
  confirm,
  onChange,
  onRemove,
}: {
  id: string;
  number: number;
  count: number;
  confirm: NonNullable<Action["confirm"]>;
  onChange: (next: NonNullable<Action["confirm"]>, key?: string) => void;
  onRemove: () => void;
}) {
  const ask = confirm.ask ?? [];
  const setAsk = (next: AskedField[]) => {
    const { ask: _before, ...rest } = confirm;
    onChange(next.length ? { ...rest, ask: next } : rest);
  };
  return (
    <Card number={number} title="Ask to confirm" count={count} onRemove={onRemove}>
      <TextField
        name={`${id}-confirm-title`}
        label="Confirmation title"
        hint="Write {column} to use a field of the record, as in Mark {number} as paid?"
        required={false}
        maxLength={120}
        value={confirm.title}
        onChange={(title) => onChange({ ...confirm, title }, `${id}:confirm-title`)}
      />
      <TextField
        name={`${id}-confirm-text`}
        label="Confirmation text"
        required={false}
        maxLength={500}
        value={confirm.text ?? ""}
        onChange={(text) => {
          const { text: _before, ...rest } = confirm;
          onChange(text ? { ...rest, text } : rest, `${id}:confirm-text`);
        }}
      />
      <TextField
        name={`${id}-confirm-button`}
        label="The button says"
        required={false}
        maxLength={40}
        value={confirm.button ?? ""}
        onChange={(button) => {
          const { button: _before, ...rest } = confirm;
          onChange(button ? { ...rest, button } : rest, `${id}:confirm-button`);
        }}
      />
      {ask.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ask.map((field, at) => (
            <li
              key={field.name}
              className="flex flex-col gap-1 rounded-control border border-line p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 basis-32">
                  <TextField
                    name={`${id}-ask-${at}-label`}
                    label={`Question ${at + 1}`}
                    labelHidden
                    placeholder="What to ask, such as Reason"
                    required={false}
                    maxLength={80}
                    value={field.label}
                    onChange={(label) =>
                      setAsk(ask.map((one, index) => (index === at ? { ...one, label } : one)))
                    }
                  />
                </div>
                <div className="w-32 max-w-full">
                  <SelectField
                    name={`${id}-ask-${at}-type`}
                    label={`Kind of answer ${at + 1}`}
                    labelHidden
                    value={field.type}
                    options={[
                      { value: "text", label: "A line" },
                      { value: "long_text", label: "Some text" },
                      { value: "number", label: "A number" },
                      { value: "date", label: "A date" },
                      { value: "choice", label: "One of a list" },
                    ]}
                    onChange={(type) =>
                      setAsk(
                        ask.map((one, index) =>
                          index === at ? { ...one, type: type as AskedField["type"] } : one,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  size="small"
                  variant="quiet"
                  aria-label={`Stop asking question ${at + 1}`}
                  onClick={() => setAsk(ask.filter((_, index) => index !== at))}
                >
                  <X aria-hidden="true" size={14} />
                </Button>
              </div>
              {field.type === "choice" ? (
                <TextField
                  name={`${id}-ask-${at}-choices`}
                  label={`Choices of question ${at + 1}`}
                  labelHidden
                  placeholder="One, two, three"
                  required={false}
                  value={(field.choices ?? []).join(", ")}
                  onChange={(text) =>
                    setAsk(
                      ask.map((one, index) =>
                        index === at
                          ? {
                              ...one,
                              choices: text
                                .split(",")
                                .map((choice) => choice.trim())
                                .filter(Boolean),
                            }
                          : one,
                      ),
                    )
                  }
                />
              ) : null}
              <CheckboxField
                name={`${id}-ask-${at}-required`}
                label="It must be answered"
                checked={field.required === true}
                onChange={(required) =>
                  setAsk(ask.map((one, index) => (index === at ? { ...one, required } : one)))
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
      {ask.length < 6 ? (
        <div>
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              const taken = new Set(ask.map((one) => one.name));
              let name = "reason";
              for (let n = 2; taken.has(name); n += 1) name = `answer_${n}`;
              setAsk([
                ...ask,
                { name, label: ask.length === 0 ? "Reason" : "Answer", type: "text" },
              ]);
            }}
          >
            <Plus aria-hidden="true" size={14} /> Ask for a field
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Which record a step works on, said as a choice when there are two. */
function RecordChoice({
  id,
  label,
  ctx,
  value,
  onChange,
}: {
  id: string;
  label: string;
  ctx: ActionContext;
  value: RecordRef;
  onChange: (next: RecordRef) => void;
}) {
  const refs = refsOf(ctx);
  if (refs.length <= 1) {
    return <p className="m-0 text-body-sm text-ink">{heading(refWords(ctx, value))}</p>;
  }
  return (
    <SelectField
      name={id}
      label={label}
      labelHidden
      value={value}
      options={refs.map((ref) => ({ value: ref, label: heading(refWords(ctx, ref)) }))}
      onChange={(next) => onChange(next as RecordRef)}
    />
  );
}

/** The inputs a flow or script is given. */
function InputMapper({
  id,
  schema,
  input,
  ctx,
  asked,
  onChange,
}: {
  id: string;
  schema: { properties?: Record<string, unknown> } | null | undefined;
  input: Record<string, ActionValue> | undefined;
  ctx: ActionContext;
  asked: readonly AskedField[];
  onChange: (next: Record<string, ActionValue> | undefined, key?: string) => void;
}) {
  const names = Object.keys(schema?.properties ?? {});
  const put = (next: Record<string, ActionValue>, key?: string) =>
    onChange(Object.keys(next).length ? next : undefined, key);
  const refs = refsOf(ctx);
  return (
    <div className="flex flex-col gap-2">
      {names.length > 0 ? (
        names.map((name) => (
          <div key={name} className="flex flex-col gap-1">
            <span className="text-body-sm font-medium text-ink">
              {heading(name)} <span className="font-normal text-ink-muted">gets</span>
            </span>
            <ValuePicker
              id={`${id}-${name}`}
              label={`${heading(name)} gets`}
              value={input?.[name]}
              ctx={ctx}
              asked={asked}
              optional
              onChange={(next, key) => {
                const { [name]: _before, ...rest } = input ?? {};
                put(next ? { ...rest, [name]: next } : rest, key);
              }}
            />
          </div>
        ))
      ) : refs.length > 0 ? (
        <SelectField
          name={`${id}-record`}
          label="What it is given"
          labelHidden
          value={
            input && "id" in input && "record" in (input.id as object)
              ? ((input.id as { of?: RecordRef }).of ?? "this")
              : ""
          }
          options={[
            { value: "", label: "Nothing" },
            ...refs.map((ref) => ({ value: ref, label: heading(refWords(ctx, ref)) })),
          ]}
          onChange={(ref) =>
            put(
              ref
                ? { id: { record: "id", ...(ref === "event" ? { of: "event" as const } : {}) } }
                : {},
            )
          }
        />
      ) : null}
      {Object.keys(input ?? {}).length > 0 ? (
        <p className="m-0 text-body-sm text-ink-muted">{inputWords(input, ctx)}</p>
      ) : null}
    </div>
  );
}

function StepCard({
  id,
  number,
  count,
  step,
  env,
  ctx,
  asked,
  onChange,
  onMove,
  onRemove,
}: {
  id: string;
  number: number;
  count: number;
  step: Step;
  env: Env;
  ctx: ActionContext;
  asked: readonly AskedField[];
  onChange: (next: Step, key?: string) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const card = (title: string, body: ReactNode) => (
    <Card number={number} title={title} count={count} onMove={onMove} onRemove={onRemove}>
      {body}
    </Card>
  );
  switch (step.do) {
    case "update":
      return card(
        "Update the record",
        <>
          <RecordChoice
            id={`${id}-record`}
            label="Which record"
            ctx={ctx}
            value={step.record}
            onChange={(record) => onChange({ ...step, record })}
          />
          <FieldSetter
            id={id}
            table={tableOfRef(ctx, step.record)}
            set={step.set}
            verb="becomes"
            ctx={ctx}
            asked={asked}
            onChange={(set, key) => onChange({ ...step, set }, key)}
          />
        </>,
      );
    case "create":
      return card(
        "Create a record",
        <>
          <SelectField
            name={`${id}-table`}
            label="Table"
            value={step.table}
            options={[
              ...(step.table === "" ? [{ value: "", label: "Choose a table" }] : []),
              ...env.catalog.tables.map((table) => ({
                value: table.name,
                label: heading(table.name),
              })),
            ]}
            onChange={(table) => onChange({ ...step, table, set: {} })}
          />
          <FieldSetter
            id={id}
            table={step.table}
            set={step.set}
            verb="is"
            ctx={ctx}
            asked={asked}
            onChange={(set, key) => onChange({ ...step, set }, key)}
          />
        </>,
      );
    case "delete":
      return card(
        "Delete the record",
        <RecordChoice
          id={`${id}-record`}
          label="Which record"
          ctx={ctx}
          value={step.record}
          onChange={(record) => onChange({ ...step, record })}
        />,
      );
    case "flow":
    case "script": {
      const flow = step.do === "flow";
      const list = flow
        ? env.flows.map((one) => ({ path: one.path, schema: one.manualInput }))
        : env.scripts.map((one) => ({ path: one.path, schema: one.inputSchema }));
      const chosen = list.find((one) => one.path === step.path);
      return card(
        flow ? "Run a workflow" : "Run a script",
        <>
          <SelectField
            name={`${id}-path`}
            label={flow ? "Workflow" : "Script"}
            hint={
              list.length === 0
                ? flow
                  ? "No flow in this workspace can be run by hand yet. Give one a manual trigger."
                  : "This workspace has no scripts yet."
                : ""
            }
            value={step.path}
            options={[
              { value: "", label: flow ? "Choose a workflow" : "Choose a script" },
              ...(step.path && !chosen ? [{ value: step.path, label: step.path }] : []),
              ...list.map((one) => ({ value: one.path, label: one.path })),
            ]}
            onChange={(path) => {
              const { input: _before, ...rest } = step;
              onChange({ ...rest, path });
            }}
          />
          {step.path ? (
            <InputMapper
              id={id}
              schema={chosen?.schema}
              input={step.input}
              ctx={ctx}
              asked={asked}
              onChange={(input, key) => {
                const { input: _before, ...rest } = step;
                onChange(input ? { ...rest, input } : rest, key);
              }}
            />
          ) : null}
        </>,
      );
    }
    case "open": {
      const target = env.pages.find((one) => one.id === step.page);
      const needsRecord = target ? target.kind !== undefined && target.kind !== "page" : false;
      const refs = refsOf(ctx);
      return card(
        "Open a page",
        <>
          <SelectField
            name={`${id}-page`}
            label="Page"
            value={step.page}
            options={[
              ...(step.page === "" ? [{ value: "", label: "Choose a page" }] : []),
              ...(step.page && !target ? [{ value: step.page, label: step.page }] : []),
              ...env.pages.map((page) => ({
                value: page.id,
                label: `${page.title}${page.kind && page.kind !== "page" ? ` (${KIND_WORDS[page.kind]})` : ""}`,
              })),
            ]}
            onChange={(page) => {
              const next = env.pages.find((one) => one.id === page);
              const { record: _before, ...rest } = step;
              onChange(
                next?.kind !== "page" && refs.length > 0
                  ? { ...rest, page, record: step.record ?? ctx.defaultRef }
                  : { ...rest, page },
              );
            }}
          />
          {needsRecord && refs.length > 0 ? (
            <SelectField
              name={`${id}-record`}
              label="Opens on"
              value={step.record ?? ""}
              options={refs.map((ref) => ({
                value: ref,
                label: ref === "event" ? "On the clicked record" : "On this record",
              }))}
              onChange={(record) => onChange({ ...step, record: record as RecordRef })}
            />
          ) : null}
        </>,
      );
    }
    case "close":
      return card(
        "Close",
        <p className="m-0 text-body-sm text-ink-muted">
          Closes the {ctx.openAs === "modal" ? "dialog" : "sheet"} this page is open in.
        </p>,
      );
    case "message":
      return card(
        "Show a message",
        <>
          <TextField
            name={`${id}-text`}
            label="The message says"
            required={false}
            maxLength={300}
            value={step.text}
            onChange={(text) => onChange({ ...step, text }, `${id}:text`)}
          />
          <SegmentedControl
            label="It looks"
            options={[
              { value: "success", label: "Good news" },
              { value: "info", label: "Just so you know" },
            ]}
            value={step.tone ?? "success"}
            onChange={(tone) => onChange({ ...step, tone: tone as "success" | "info" })}
          />
        </>,
      );
    case "narrow": {
      const groups = [
        ...new Set(Object.values(env.widget.data ?? {}).flatMap((input) => resultNames(input))),
      ];
      return card(
        "Narrow a filter",
        <>
          <SelectField
            name={`${id}-filter`}
            label="Filter"
            hint={
              env.filters.length === 0
                ? "The page has no filters yet. Add Search and filter to it."
                : ""
            }
            value={step.filter}
            options={[
              { value: "", label: "Choose a filter" },
              ...env.filters.map((one) => ({
                value: one.name,
                label: one.label ?? heading(one.name),
              })),
            ]}
            onChange={(filter) => onChange({ ...step, filter })}
          />
          <SelectField
            name={`${id}-from`}
            label="To the value of"
            value={step.from}
            options={[
              { value: "", label: "Choose what was clicked" },
              ...(step.from && !groups.includes(step.from)
                ? [{ value: step.from, label: heading(step.from) }]
                : []),
              ...groups.map((name) => ({ value: name, label: heading(name) })),
            ]}
            onChange={(from) => onChange({ ...step, from })}
          />
        </>,
      );
    }
    case "rows":
      return card(
        "Show the rows behind",
        <p className="m-0 text-body-sm text-ink-muted">
          Opens the rows behind what was clicked, in a side sheet. It only reads.
        </p>,
      );
  }
}

const KIND_WORDS = {
  page: "page",
  record: "record page",
  sheet: "side sheet",
  modal: "dialog",
} as const;

// ---------------------------------------------------------------------------
// The editor

/** The steps of one action, with its conditions and what it grants. */
export function ActionEditor({
  env,
  id,
  heading: when,
  action,
  onChange,
}: {
  env: Env;
  id: string;
  /** "When clicked": the event, or what presses it. */
  heading: string;
  action: Action | undefined;
  onChange: (next: Action | undefined, key?: string) => void;
}) {
  const ctx = actionContext(env);
  const current: Action = action ?? { steps: [] };
  const asked = current.confirm?.ask ?? [];
  const empty = !current.confirm && current.steps.length === 0;
  const put = (next: Action, key?: string) =>
    onChange(!next.confirm && next.steps.length === 0 && !next.when ? undefined : next, key);
  const kinds = stepKindsFor(ctx);
  const offset = current.confirm ? 1 : 0;
  const count = current.steps.length + offset;
  const firstPage = env.pages[0]?.id;
  const items = [
    ...(!current.confirm && ctx.surface !== "dashboard"
      ? [
          {
            label: "Ask to confirm",
            onSelect: () => put({ ...current, confirm: { title: "Are you sure?" } }),
          },
        ]
      : []),
    ...kinds.map((kind) => ({
      label: STEP_WORDS[kind].title,
      onSelect: () => put(withSteps(current, [...current.steps, newStep(kind, ctx, firstPage)])),
    })),
  ];
  const place = (at: number, by: -1 | 1) => {
    if (at + by < 0 || at + by >= current.steps.length) return;
    put(withSteps(current, moved(current.steps, at, at + by)));
  };
  const failure =
    ctx.openAs === "sheet"
      ? "Show the error and keep the sheet open"
      : ctx.openAs === "modal"
        ? "Show the error and keep the dialog open"
        : "Show the error and stop";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="m-0 text-body-sm font-medium text-ink">{when}</p>
      {empty ? (
        <p className="m-0 flex h-control items-center rounded-control border border-line px-3 text-ink-muted">
          Nothing
        </p>
      ) : null}
      {count > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {current.confirm ? (
            <ConfirmCard
              id={id}
              number={1}
              count={count}
              confirm={current.confirm}
              onChange={(confirm, key) => put({ ...current, confirm }, key)}
              onRemove={() => {
                const { confirm: _before, ...rest } = current;
                put(rest);
              }}
            />
          ) : null}
          {current.steps.map((step, at) => (
            <StepCard
              // biome-ignore lint/suspicious/noArrayIndexKey: a step has no identity but its place in the list
              key={`${step.do}-${at}`}
              id={`${id}-step-${at + 1}`}
              number={at + 1 + offset}
              count={count}
              step={step}
              env={env}
              ctx={ctx}
              asked={asked}
              onChange={(next, key) =>
                put(
                  withSteps(
                    current,
                    current.steps.map((one, index) => (index === at ? next : one)),
                  ),
                  key,
                )
              }
              onMove={(by) => place(at, by)}
              onRemove={() =>
                put(
                  withSteps(
                    current,
                    current.steps.filter((_, index) => index !== at),
                  ),
                )
              }
            />
          ))}
        </ol>
      ) : null}
      <div>
        <Menu
          ariaLabel="Add a step"
          label={
            <span className="inline-flex items-center gap-1">
              <Plus aria-hidden="true" size={14} /> Add a step
            </span>
          }
          triggerClassName="inline-flex h-control items-center rounded-control border border-line-control px-3 text-body-sm hover:bg-sunken"
          items={items}
        />
      </div>
      {count > 0 ? (
        <p className="m-0 text-body-sm text-ink-muted">
          <span className="font-medium text-ink">If something fails</span> {failure}.
        </p>
      ) : null}
      {count > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-ink">Can be pressed when</span>
          <ConditionsEditor
            id={`${id}-when`}
            conditions={current.when}
            ctx={ctx}
            groups={env.groups}
            onChange={(when, key) => {
              const { when: _before, ...rest } = current;
              put(when ? { ...rest, when } : rest, key);
            }}
          />
          {!current.when ? (
            <p className="m-0 text-body-sm text-ink-muted">Always, for anyone who can open it.</p>
          ) : null}
        </div>
      ) : null}
      {current.steps.length > 0 ? (
        <p className="m-0 rounded-control border border-line p-3 text-body-sm text-ink-muted">
          {grantWords(current, ctx)}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The controls

/** A setting that holds one action (a form's "When it is sent"). */
export function ActionControl({
  env,
  id,
  label,
  help,
  action,
  onChange,
}: {
  env: Env;
  id: string;
  label: string;
  help: string | undefined;
  action: Action | undefined;
  onChange: (next: Action | undefined, key?: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <ActionEditor env={env} id={id} heading={label} action={action} onChange={onChange} />
      {help ? <p className="m-0 text-body-sm text-ink-muted">{help}</p> : null}
    </div>
  );
}

interface LabelledAction {
  id: string;
  label: string;
  tone?: string;
  action: Action;
}

/** A setting that holds a list of labelled actions (a table's row actions). */
export function ActionsControl({
  env,
  id,
  setting,
  onChange,
}: {
  env: Env;
  id: string;
  setting: ConfigSetting;
  onChange: (next: LabelledAction[] | undefined) => void;
}) {
  const value = env.config[setting.name];
  const list = Array.isArray(value) ? (value as LabelledAction[]) : [];
  const items = (setting.schema.items ?? {}) as {
    properties?: { tone?: { enum?: string[] } };
  };
  const tones = items.properties?.tone?.enum ?? ["default"];
  const max = typeof setting.schema.maxItems === "number" ? setting.schema.maxItems : 6;
  const toneWords: Record<string, string> = {
    primary: "Main",
    default: "Plain",
    danger: "Careful",
  };
  const set = (at: number, patch: Partial<LabelledAction>) =>
    onChange(list.map((one, index) => (index === at ? { ...one, ...patch } : one)));
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium text-ink">{setting.hint.label}</legend>
      {setting.hint.help ? (
        <p className="m-0 text-body-sm text-ink-muted">{setting.hint.help}</p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.map((one, at) => (
          <li key={one.id} className="flex flex-col gap-2 rounded-control border border-line p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  name={`${id}-${one.id}-label`}
                  label={`Label of action ${at + 1}`}
                  labelHidden
                  maxLength={40}
                  required={false}
                  value={one.label}
                  onChange={(text) => set(at, { label: text })}
                />
              </div>
              <MoveButtons
                label={one.label || `action ${at + 1}`}
                at={at}
                count={list.length}
                onMove={(by) => onChange(moved(list, at, at + by))}
              />
              <Button
                size="small"
                variant="quiet"
                aria-label={`Remove ${one.label || `action ${at + 1}`}`}
                onClick={() => onChange(list.filter((_, index) => index !== at))}
              >
                <X aria-hidden="true" size={14} />
              </Button>
            </div>
            {tones.length > 1 ? (
              <SegmentedControl
                label={`How ${one.label || "it"} looks`}
                options={tones.map((tone) => ({
                  value: tone,
                  label: toneWords[tone] ?? heading(tone),
                }))}
                value={one.tone ?? tones[0] ?? "default"}
                onChange={(tone) => set(at, { tone })}
              />
            ) : null}
            <Details summary={<>Steps of {one.label || `action ${at + 1}`}</>}>
              <div className="pt-1">
                <ActionEditor
                  env={env}
                  id={`${id}-${one.id}`}
                  heading="When pressed"
                  action={one.action}
                  onChange={(next) => set(at, { action: next ?? { steps: [] } })}
                />
              </div>
            </Details>
          </li>
        ))}
      </ul>
      {list.length < max ? (
        <div>
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              const taken = new Set(list.map((one) => one.id));
              const base = SLUG("action") || "action";
              let name = base;
              for (let n = 2; taken.has(name); n += 1) name = `${base}-${n}`;
              onChange([
                ...list,
                { id: name, label: "Action", tone: tones[0] ?? "default", action: { steps: [] } },
              ]);
            }}
          >
            <Plus aria-hidden="true" size={14} /> Add an action
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
