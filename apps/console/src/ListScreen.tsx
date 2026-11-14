import {
  Button,
  type Column,
  ComboboxField,
  Dialog,
  EmptyState,
  Notice,
  type Option,
  SelectField,
  Table,
  TextField,
} from "@vynxlabs/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { type ApiError, useLoad } from "./api.ts";
import { ask, notify } from "./ask.tsx";

import { PageHeader } from "./kit/layout.tsx";
export interface FormField {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number";
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /**
   * A list to choose from that the API holds: a GET route returning `{ items }`,
   * and how one item becomes a choice. The field is then a searchable list, so
   * nobody types a name that has to match something elsewhere.
   */
  choose?: { path: string; option: (item: never) => Option | undefined };
  /** Shows the field only while this holds for what has been entered so far. */
  when?: (values: Record<string, string>) => boolean;
  placeholder?: string;
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
  const list = useLoad<{ items: never[] }>(choose.path);
  const options = (list.data?.items ?? [])
    .map(choose.option)
    .filter((option): option is Option => option !== undefined);
  return (
    <ComboboxField
      label={field.label}
      options={options}
      value={value}
      hint={list.error ? list.error.message : field.hint}
      error={error}
      placeholder={list.loading ? "Loading…" : (field.placeholder ?? "Choose")}
      empty={list.loading ? "Loading…" : "Nothing to choose from."}
      onChange={onChange}
    />
  );
}

export interface CreateConfig {
  /** The button, and the dialog title: "Create workspace". */
  action: string;
  description?: string;
  fields: FormField[];
  submit: (values: Record<string, string>) => Promise<unknown>;
  /** Something to show once after creating, such as a key that is only shown now. */
  afterCreate?: (result: unknown) => ReactNode;
}

export interface ListScreenProps<Row> {
  title: string;
  /** "section" when the list is one part of a screen with its own title, under it. */
  as?: "page" | "section";
  description?: string;
  /** A GET route returning `{ items: Row[] }`. */
  path: string;
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  empty: { title: string; text?: string };
  create?: CreateConfig;
  /** Adds a last column of actions per row. */
  rowActions?: (row: Row, reload: () => void) => ReactNode;
  /** A button beside the title, for a screen whose way to add something is not a dialog. */
  action?: ReactNode;
}

export function Page({
  title,
  description,
  action,
  width = "full",
  children,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode;
  /** `form` keeps a page of fields to a readable measure; `full` lets a list use the room. */
  width?: "full" | "form";
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-5 ${width === "form" ? "max-w-[52rem]" : ""}`}>
      <PageHeader title={title} description={description} actions={action} />
      {children}
    </section>
  );
}

export function CreateDialog({
  config,
  open,
  onClose,
  onCreated,
}: {
  config: CreateConfig;
  open: boolean;
  onClose: () => void;
  onCreated: (result: unknown) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const fieldError = (name: string) =>
    error?.fields.find((field) => field.path === `/body/${name}`)?.message;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={config.action}
      {...(config.description ? { description: config.description } : {})}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const defaults = Object.fromEntries(
              config.fields
                .filter((f) => f.options?.[0])
                .map((f) => [f.name, f.options?.[0]?.value as string]),
            );
            const result = await config.submit({ ...defaults, ...values });
            setValues({});
            onCreated(result);
          } catch (caught) {
            setError(caught as ApiError);
          } finally {
            setBusy(false);
          }
        }}
      >
        {config.fields.map((field) =>
          field.when && !field.when(values) ? null : field.choose ? (
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
              options={field.options}
              value={values[field.name] ?? field.options[0]?.value ?? ""}
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
        {error ? <Notice tone="danger">{error.message}</Notice> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {config.action}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A titled list with an optional create dialog. Most console screens are one of these. */
export function ListScreen<Row>(props: ListScreenProps<Row>) {
  const list = useLoad<{ items: Row[] }>(props.path);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ReactNode>();
  const { create } = props;

  const columns: Column<Row>[] = props.rowActions
    ? [
        ...props.columns,
        { header: "", align: "end", cell: (row) => props.rowActions?.(row, list.reload) },
      ]
    : props.columns;
  const createButton = create ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      {create.action}
    </Button>
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
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <Table
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
        <p className="text-ink-muted">Loading…</p>
      )}
      {create ? (
        <CreateDialog
          config={create}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCreated(create.afterCreate?.(result));
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
          {description ? <p className="m-0 max-w-[70ch] text-ink-muted">{description}</p> : null}
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
}: {
  label?: string;
  confirm: string;
  run: () => Promise<unknown>;
  onDone: () => void;
}) {
  return (
    <Button
      variant="danger"
      size="small"
      onClick={async () => {
        if (
          !(await ask.confirm({ title: `${label}?`, text: question, action: label, danger: true }))
        )
          return;
        try {
          await run();
          onDone();
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
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      size="small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select it and copy" : label}
    </Button>
  );
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
