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
        <InputForm
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
