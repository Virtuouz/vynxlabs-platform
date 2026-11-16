import { Dialog, type JsonSchema, Notice, SchemaForm } from "@vynxlabs/ui";
import { useState } from "react";
import type { ApiError } from "./api.ts";
import { failureText } from "./ask.tsx";

/**
 * What the server refused, by place in the input: its `/input/...` paths made
 * pointers into the value the form holds.
 */
export function inputErrors(error: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of (error as Partial<ApiError>).fields ?? []) {
    if (!field.path.startsWith("/input")) continue;
    errors[field.path.slice("/input".length)] = field.message;
  }
  return errors;
}

/**
 * Asks for the input of a script or a flow, as fields drawn from its schema,
 * with JSON beside them. With no schema, as JSON.
 */
/** What the server shows in place of a value it masks: a secret-looking one. */
export const MASKED = "[redacted]";

/** The value without its masked parts, and the paths of what was left out. */
export function withoutMasked(value: unknown, path = ""): { value: unknown; masked: string[] } {
  if (value === MASKED) return { value: undefined, masked: [path] };
  if (Array.isArray(value)) {
    const masked: string[] = [];
    const items = value.map((item, index) => {
      const inner = withoutMasked(item, `${path}[${index}]`);
      masked.push(...inner.masked);
      return inner.value;
    });
    return { value: items, masked };
  }
  if (typeof value === "object" && value !== null) {
    const masked: string[] = [];
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      const kept = withoutMasked(inner, path ? `${path}.${key}` : key);
      masked.push(...kept.masked);
      if (kept.value !== undefined) out[key] = kept.value;
    }
    return { value: out, masked };
  }
  return { value, masked: [] };
}

export function InputDialog({
  open,
  onClose,
  title,
  action,
  schema,
  initial,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The button that starts it: "Run", "Start flow". */
  action: string;
  schema?: Record<string, unknown> | undefined;
  /** What the fields start with, such as the input of a run being run again. */
  initial?: unknown;
  onSubmit: (input: unknown) => Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {/* A new form each time it opens, from what it is given then. */}
      {open ? (
        <MaskedAware
          schema={schema}
          initial={initial}
          action={action}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

/**
 * A form started from a shown payload: values the server masked are left out,
 * named, and must be entered again, so a masked placeholder is never sent as input.
 */
function MaskedAware({
  schema,
  initial,
  action,
  onCancel,
  onSubmit,
}: {
  schema?: Record<string, unknown> | undefined;
  initial?: unknown;
  action: string;
  onCancel: () => void;
  onSubmit: (input: unknown) => Promise<void>;
}) {
  const { value, masked } = withoutMasked(initial);
  const top = masked.filter((path) => path && !/[.[]/.test(path));
  // Masked fields at the top level become required, so the form asks for them.
  const asked =
    schema && top.length > 0
      ? {
          ...schema,
          required: [...new Set([...((schema.required as string[] | undefined) ?? []), ...top])],
        }
      : schema;
  return (
    <div className="flex flex-col gap-3">
      {masked.length > 0 ? (
        <Notice tone="attention">
          {masked.length === 1 ? "One value was" : `${masked.length} values were`} masked when shown
          ({masked.join(", ")}). Enter {masked.length === 1 ? "it" : "them"} again to run with{" "}
          {masked.length === 1 ? "it" : "them"}.
        </Notice>
      ) : null}
      <InputForm
        schema={asked}
        initial={masked.length > 0 ? value : initial}
        action={action}
        onCancel={onCancel}
        onSubmit={async (input) => {
          if (JSON.stringify(input ?? null).includes(JSON.stringify(MASKED))) {
            throw new Error(`Replace each "${MASKED}" with its real value first.`);
          }
          await onSubmit(input);
        }}
      />
    </div>
  );
}

/** The input form on its own, for a page that asks for input without a dialog. */
export function InputForm({
  schema,
  initial,
  action,
  onCancel,
  onSubmit,
}: {
  schema?: Record<string, unknown> | undefined;
  initial?: unknown;
  action: string;
  onCancel?: () => void;
  onSubmit: (input: unknown) => Promise<void>;
}) {
  const [problem, setProblem] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const drawn = schema && Object.keys(schema).length > 0 ? (schema as JsonSchema) : {};
  return (
    <div className="flex flex-col gap-3">
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <SchemaForm
        schema={drawn}
        value={initial ?? (drawn.type === "object" || !schema ? {} : undefined)}
        submitLabel={action}
        errors={errors}
        {...(onCancel ? { onCancel } : {})}
        onSubmit={async (input) => {
          setProblem(undefined);
          setErrors({});
          try {
            await onSubmit(input ?? {});
          } catch (error) {
            const placed = inputErrors(error);
            setErrors(placed);
            if (Object.keys(placed).length === 0) setProblem(failureText(error));
            else setProblem("Some of the input is not what it takes. See the fields below.");
          }
        }}
      />
    </div>
  );
}
