import {
  Button,
  CheckboxField,
  ComboboxField,
  Dialog,
  EmptyState,
  Notice,
  type Option,
  SelectField,
  SideSheet,
  TextField,
} from "@volvel/ui";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { type ApiError, useLoad } from "./api.ts";
import { ask, noteWaiting, notify } from "./ask.tsx";
import { type Needs, useNeeds } from "./kit/Can.tsx";
import { type DataColumn, DataTable } from "./kit/DataTable.tsx";
import { keepPlace } from "./kit/focus.ts";
import { clock } from "./kit/format.ts";
import { Loading } from "./kit/LoadState.tsx";
import { PageHeader } from "./kit/layout.tsx";
import { usePagedList } from "./kit/paged.tsx";
import { READ_ONLY_WORDS, useReadOnly } from "./kit/ReadOnly.tsx";
import { useQueryValue } from "./router.tsx";
export interface FormField {
  name: string;
  label: string;
  /** `checkbox` gives "true" or "false". */
  type?: "text" | "email" | "password" | "number" | "checkbox";
  /** What a field holds before anything is entered, such as "true" for a box checked already. */
  initial?: string;
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /**
   * With `options`: nothing is chosen for the person, who has to pick one. For a
   * choice where the first option would be a costly guess, such as a workspace's type.
   */
  pick?: boolean;
  /**
   * A list to choose from that the API holds: a GET route returning `{ items }`,
   * and how one item becomes a choice. The field is then a searchable list, so
   * nobody types a name that has to match something elsewhere.
   */
  choose?: {
    path: string;
    option: (item: never) => Option | undefined;
    /** The route pages and takes `?search=`: what is typed is asked of the server. */
    search?: boolean;
  };
  /** Shows the field only while this holds for what has been entered so far. */
  when?: (values: Record<string, string>) => boolean;
  placeholder?: string;
  /**
   * Draws the field's own control, for a value no plain box says well: a choice that depends on
   * the type just chosen. It holds its value as text, like every other field.
   */
  render?: (control: {
    value: string;
    values: Record<string, string>;
    error: string | undefined;
    onChange: (value: string) => void;
  }) => ReactNode;
}

function ChoiceField({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: string | undefined;
  error: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const choose = field.choose as NonNullable<FormField["choose"]>;
  const [typed, setTyped] = useState("");
  // A route that pages is searched on the server, so what is past the first page is found.
  const list = usePagedList<never>(choose.path, {
    search: choose.search ? typed : "",
    limit: choose.search ? 50 : 0,
  });
  const options = (list.items ?? [])
    .map(choose.option)
    .filter((option): option is Option => option !== undefined);
  return (
    <ComboboxField
      label={field.label}
      options={options}
      value={value}
      hint={
        list.error
          ? list.error.message
          : list.hasMore && !typed
            ? "Showing the first of many. Type to search."
            : field.hint
      }
      error={error}
      placeholder={list.loading ? "Loading…" : (field.placeholder ?? "Choose")}
      empty={list.loading ? "Loading…" : "Nothing to choose from."}
      onChange={onChange}
      {...(choose.search ? { onSearch: setTyped } : {})}
    />
  );
}

export interface CreateConfig {
  /** The button, and the dialog title: "Create workspace". */
  action: string;
  description?: string;
  fields: FormField[];
  submit: (values: Record<string, string>) => Promise<unknown>;
  /** What to show once made, such as a key shown once. `dismiss` takes it away. */
  afterCreate?: (result: unknown, dismiss: () => void) => ReactNode;
  /**
   * What the confirmation says, naming what was made, and where it is. Without
   * it, "Created." is said; with `afterCreate`, what that shows says it.
   */
  done?: (
    result: unknown,
    values: Record<string, string>,
  ) => string | { message: string; link?: { label: string; href: string } };
}

export interface ListScreenProps<Row> {
  title: string;
  /** "section" when the list is one part of a screen with its own title, under it. */
  as?: "page" | "section";
  description?: string;
  /** A GET route returning `{ items: Row[] }`. */
  path: string;
  columns: DataColumn<Row>[];
  rowKey: (row: Row) => string;
  empty: { title: string; text?: string };
  create?: CreateConfig;
  /**
   * The create field that `?setup=<value>` fills: a refused deploy or promotion links to a list
   * with the name of what it lacks, and the dialog that makes it opens with that name in.
   */
  setupField?: string;
  /** Adds a last column of actions per row. */
  rowActions?: (row: Row, reload: () => void) => ReactNode;
  /**
   * A button beside the title, for a screen whose way to add something is not a dialog. With
   * `create`, it stands beside that button, for a second way in.
   */
  action?: ReactNode;
  /**
   * What changing this list takes, and where it is held. Without it, the create button is greyed
   * under a line that says what it takes, and the row actions are switched off, for someone who
   * may only read it (GOV-37).
   */
  needs?: Needs;
}

export function Page({
  title,
  description,
  action,
  width = "full",
  mono = false,
  fill = false,
  helpKey,
  children,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode;
  /** The title is a path or an ID. */
  mono?: boolean;
  /** `form` keeps a page of fields to a readable measure; `full` lets a list use the room. */
  width?: "full" | "form";
  /**
   * The page is a workbench (`nav.ts`): it fills the work area and does not scroll, so what
   * is under the title takes the height left, and one part of it scrolls.
   */
  fill?: boolean;
  /** Shows the description on a member's first visit, then folds it behind the title's help. */
  helpKey?: string;
  children: ReactNode;
}) {
  return (
    // A page that fills the window keeps its parts closer, so what it holds starts high (P4-1).
    <section
      className={`flex flex-1 flex-col ${fill ? "min-h-0 flex-1 gap-3 px-4 pt-3 pb-4 md:px-8" : "gap-5"} ${
        width === "form" ? "max-w-[52rem]" : ""
      }`}
    >
      <PageHeader
        title={title}
        mono={mono}
        description={description}
        actions={action}
        {...(helpKey ? { helpKey } : {})}
        // A workbench's heading, as the lists that fill the window have (P4-1).
        oneRow={fill}
      />
      {children}
    </section>
  );
}

export function CreateDialog({
  config,
  open,
  onClose,
  onCreated,
  initial,
}: {
  config: CreateConfig;
  open: boolean;
  onClose: () => void;
  onCreated: (result: unknown) => void;
  /** What the fields hold when it opens: changing something that exists starts from what it is. */
  initial?: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial ?? {});
  const [error, setError] = useState<ApiError>();
  const [unpicked, setUnpicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const formId = useId();
  // Opened again, it starts from what exists now: a save in between changed it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? {});
  }
  // The first reason the server gave for something no field of the form shows: "The table's
  // definition is not valid" alone would not say what to change.
  const unplaced = (caught: ApiError) =>
    caught.fields?.find((one) => !config.fields.some((field) => one.path === `/body/${field.name}`))
      ?.message;
  // A refusal every field of which is shown at its field is not said again in a banner.
  const placed = (caught: ApiError) =>
    (caught.fields ?? []).length > 0 &&
    (caught.fields ?? []).every((one) =>
      config.fields.some((field) => one.path === `/body/${field.name}`),
    );
  const fieldError = (name: string) =>
    unpicked.includes(name)
      ? "Choose one."
      : error?.fields?.find((field) => field.path === `/body/${name}`)?.message;
  // Cancelled means forgotten: what was typed, a password included, does not wait for the next time.
  const close = () => {
    setValues(initial ?? {});
    setError(undefined);
    setUnpicked([]);
    onClose();
  };

  // A form of more than three fields is configuration, not a quick question: it opens as a
  // sheet beside the page, with its buttons kept in view, rather than over it.
  const roomy = config.fields.length > 3;
  const readOnly = useReadOnly();
  const buttons = (
    <>
      <Button onClick={close}>Cancel</Button>
      {readOnly ? <span className="text-meta text-ink-muted">{READ_ONLY_WORDS}</span> : null}
      <Button
        type="submit"
        form={formId}
        variant="primary"
        loading={busy}
        disabled={readOnly}
        {...(readOnly ? { tooltip: READ_ONLY_WORDS } : {})}
      >
        {config.action}
      </Button>
    </>
  );
  const form = (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const missing = config.fields
          .filter((f) => f.pick && !(f.when && !f.when(values)) && !values[f.name])
          .map((f) => f.name);
        setUnpicked(missing);
        if (missing.length > 0) return;
        setBusy(true);
        setError(undefined);
        try {
          const defaults = Object.fromEntries([
            ...config.fields
              .filter((f) => f.options?.[0] && !f.pick)
              .map((f) => [f.name, f.options?.[0]?.value as string]),
            ...config.fields
              .filter((f) => f.initial !== undefined)
              .map((f) => [f.name, f.initial as string]),
          ]);
          const sent = { ...defaults, ...values };
          const result = await config.submit(sent);
          const said = config.done?.(result, sent) ?? (config.afterCreate ? undefined : "Created.");
          if (typeof said === "string") notify.success(said);
          else if (said) notify.success(said.message, said.link ? { link: said.link } : {});
          setValues(initial ?? {});
          onCreated(result);
        } catch (caught) {
          // A change that waits for a second person is asked, not failed: the form is done.
          if (noteWaiting(caught)) {
            setValues(initial ?? {});
            onClose();
          } else setError(caught as ApiError);
        } finally {
          setBusy(false);
        }
      }}
    >
      {config.fields.map((field) =>
        field.when && !field.when(values) ? null : field.render ? (
          <div key={field.name}>
            {field.render({
              value: values[field.name] ?? field.initial ?? "",
              values,
              error: fieldError(field.name),
              onChange: (value) => setValues((v) => ({ ...v, [field.name]: value })),
            })}
          </div>
        ) : field.type === "checkbox" ? (
          <CheckboxField
            key={field.name}
            name={field.name}
            label={field.label}
            checked={(values[field.name] ?? field.initial) === "true"}
            {...(field.hint ? { hint: field.hint } : {})}
            onChange={(checked) =>
              setValues((v) => ({ ...v, [field.name]: checked ? "true" : "false" }))
            }
          />
        ) : field.choose ? (
          <ChoiceField
            key={field.name}
            field={field}
            value={values[field.name]}
            error={fieldError(field.name)}
            onChange={(value) => setValues((v) => ({ ...v, [field.name]: value ?? "" }))}
          />
        ) : field.options ? (
          <SelectField
            key={field.name}
            name={field.name}
            label={field.label}
            options={
              field.pick ? [{ value: "", label: "Choose…" }, ...field.options] : field.options
            }
            value={values[field.name] ?? (field.pick ? "" : (field.options[0]?.value ?? ""))}
            {...(field.hint ? { hint: field.hint } : {})}
            error={fieldError(field.name)}
            onChange={(value) => setValues((v) => ({ ...v, [field.name]: value }))}
          />
        ) : (
          <TextField
            key={field.name}
            name={field.name}
            label={field.label}
            type={field.type ?? "text"}
            value={values[field.name] ?? ""}
            required={field.required ?? true}
            {...(field.placeholder ? { placeholder: field.placeholder } : {})}
            {...(field.hint ? { hint: field.hint } : {})}
            error={fieldError(field.name)}
            onChange={(value) => setValues((v) => ({ ...v, [field.name]: value }))}
          />
        ),
      )}
      {error && !placed(error) ? (
        <Notice tone="danger">{[error.message, unplaced(error)].filter(Boolean).join(" ")}</Notice>
      ) : null}
      {roomy ? null : <div className="mt-1 flex justify-end gap-2">{buttons}</div>}
    </form>
  );
  const about = config.description ? { description: config.description } : {};
  return roomy ? (
    <SideSheet open={open} onClose={close} title={config.action} {...about} footer={buttons}>
      {form}
    </SideSheet>
  ) : (
    <Dialog open={open} onClose={close} title={config.action} {...about}>
      {form}
    </Dialog>
  );
}

/** A titled list with an optional create dialog. Most console screens are one of these. */
export function ListScreen<Row>(props: ListScreenProps<Row>) {
  const list = useLoad<{ items: Row[] }>(props.path);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ReactNode>();
  const { create, setupField } = props;
  const [setup, setSetup] = useQueryValue("setup");
  const [filling, setFilling] = useState<string>();
  useEffect(() => {
    // Only a list that makes things this way reads it: Connections reads its own.
    if (!setup || !create || !setupField) return;
    setFilling(setup);
    setCreating(true);
    setSetup(null);
  }, [setup, create, setupField, setSetup]);

  const { can, line, reason } = useNeeds(props.needs);
  const columns: DataColumn<Row>[] = props.rowActions
    ? [
        ...props.columns,
        {
          header: "",
          align: "end",
          cell: (row) => (
            <fieldset disabled={!can} className="contents">
              {props.rowActions?.(row, list.reload)}
            </fieldset>
          ),
        },
      ]
    : props.columns;
  const createButton = create ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      {props.action}
      <Button
        variant="primary"
        disabled={!can}
        {...(reason ? { tooltip: reason } : {})}
        onClick={() => setCreating(true)}
      >
        {create.action}
      </Button>
    </span>
  ) : (
    props.action
  );

  return (
    <ListFrame
      as={props.as}
      title={props.title}
      description={props.description}
      action={createButton}
    >
      {created ? <Notice tone="attention">{created}</Notice> : null}
      {line}
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <DataTable
          variant="static"
          framed
          label={props.title}
          columns={columns}
          rows={list.data.items}
          rowKey={props.rowKey}
          empty={
            <EmptyState title={props.empty.title} action={createButton}>
              {props.empty.text}
            </EmptyState>
          }
        />
      ) : (
        <Loading />
      )}
      {create && can ? (
        <CreateDialog
          // A name given by the address starts the form again, with the name in.
          key={filling ?? ""}
          config={create}
          open={creating}
          {...(filling && setupField ? { initial: { [setupField]: filling } } : {})}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCreated(create.afterCreate?.(result, () => setCreated(undefined)));
            list.reload();
          }}
        />
      ) : null}
    </ListFrame>
  );
}

/** A whole screen, or a titled part of one under the screen's own title. */
function ListFrame({
  as,
  title,
  description,
  action,
  children,
}: {
  as: "page" | "section" | undefined;
  title: string;
  description: string | undefined;
  action: ReactNode;
  children: ReactNode;
}) {
  if (as !== "section") {
    return (
      <Page title={title} description={description} action={action}>
        {children}
      </Page>
    );
  }
  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-title">{title}</h2>
          {description ? <p className="m-0 max-w-measure text-ink-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A row action that asks before it removes something. */
export function RemoveButton({
  label = "Remove",
  confirm: question,
  run,
  onDone,
  affected,
  usesUnread = false,
  typeToConfirm,
  disabled,
}: {
  label?: string;
  /** Why it cannot be done now, shown as the button's title; the button is then off. */
  disabled?: string | undefined;
  confirm: string;
  run: () => Promise<unknown>;
  onDone: () => void;
  /** What uses the thing and is affected, named in the confirmation so its reach is seen first. */
  affected?: string[] | undefined;
  /** What uses it is not known (still loading, or could not be read): the confirmation says so. */
  usesUnread?: boolean | undefined;
  /** For what cannot be undone: the name to type before the action is offered. */
  typeToConfirm?: string | undefined;
}) {
  return (
    <Button
      variant="danger"
      size="small"
      disabled={disabled !== undefined}
      {...(disabled !== undefined ? { title: disabled } : {})}
      onClick={async (event) => {
        const settle = keepPlace(event.currentTarget);
        const text = usesUnread
          ? `${question} What uses it could not be read, so what it affects is not listed here.`
          : affected?.length
            ? `${question} Used by ${affected.length}: ${listed(affected)}.`
            : question;
        const options = { title: `${label}?`, text, action: label, danger: true };
        const sure = typeToConfirm
          ? await ask.typeToConfirm({ ...options, expected: typeToConfirm })
          : await ask.confirm(options);
        if (!sure) return;
        try {
          await run();
          onDone();
          settle();
        } catch (error) {
          notify.error(error);
        }
      }}
    >
      {label}
    </Button>
  );
}

/** Copies a value that has to be passed on by hand, such as a link or a DNS record. */
/** "a, b and 3 more", for a sentence. */
export function listed(names: string[], most = 5): string {
  if (names.length <= most) {
    return names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : (names[0] ?? "");
  }
  return `${names.slice(0, most).join(", ")} and ${names.length - most} more`;
}

export function CopyButton({
  value,
  label = "Copy",
  onCopied,
}: {
  value: string;
  label?: string;
  /** Called once the value is on the clipboard. */
  onCopied?: () => void;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      size="small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
          onCopied?.();
        } catch {
          setState("failed");
        }
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select it and copy" : label}
    </Button>
  );
}

/** A time in text: "16:38:54" today, "2026-11-16 16:38:54" another day. */
export const when = (iso: string) => clock(iso);
