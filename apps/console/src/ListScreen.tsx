import {
  Button,
  type Column,
  Dialog,
  EmptyState,
  Notice,
  SelectField,
  Table,
  TextField,
} from "@vynxlabs/ui";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { type ApiError, useLoad } from "./api.ts";

export interface FormField {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number";
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface CreateConfig {
  /** The button, and the dialog title: "Create workspace". */
  action: string;
  description?: string;
  fields: FormField[];
  submit: (values: Record<string, string>) => Promise<unknown>;
  /** Something to show once after creating, such as a key that is only shown now. */
  afterCreate?: (result: unknown) => ComponentChildren;
}

export interface ListScreenProps<Row> {
  title: string;
  description?: string;
  /** A GET route returning `{ items: Row[] }`. */
  path: string;
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  empty: { title: string; text?: string };
  create?: CreateConfig;
  /** Adds a last column of actions per row. */
  rowActions?: (row: Row, reload: () => void) => ComponentChildren;
}

export function Page({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string | undefined;
  action?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="flex flex-col gap-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="m-0 text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p class="mt-1 mb-0 max-w-[70ch] text-ink-muted">{description}</p> : null}
        </div>
        {action}
      </header>
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
        class="flex flex-col gap-3"
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
          field.options ? (
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
              onInput={(value) => setValues((v) => ({ ...v, [field.name]: value }))}
            />
          ),
        )}
        {error ? <Notice tone="danger">{error.message}</Notice> : null}
        <div class="mt-1 flex justify-end gap-2">
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
  const [created, setCreated] = useState<ComponentChildren>();
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
  ) : undefined;

  return (
    <Page title={props.title} description={props.description} action={createButton}>
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
        <p class="text-ink-muted">Loading…</p>
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
    </Page>
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
        if (!window.confirm(question)) return;
        try {
          await run();
          onDone();
        } catch (error) {
          window.alert((error as Error).message);
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
