import { Button, Dialog, type JsonSchema, Notice, SchemaForm } from "@volvel/ui";
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

/** The input of a flow run kept in storage because it was large: the page shows where, not what. */
export const isStoredInput = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 1 &&
  typeof (value as { stored?: unknown }).stored === "string" &&
  /^flow-runs\/.+\.json$/.test((value as { stored: string }).stored);

/** When and how first a run starts, if the person chose: both left out start it now, at 0. */
export interface RunTimingChoice {
  startAfter?: string;
  priority?: number;
}

/** The time a date-time field holds as one instant, or undefined when it holds none. */
const instantOf = (value: string): string | undefined => {
  const at = value ? new Date(value) : undefined;
  return at && !Number.isNaN(at.getTime()) ? at.toISOString() : undefined;
};

/**
 * "Start: Now or Later" and a priority, for a dialog that starts a script run. Read when the
 * form is sent: a time that has passed, or a priority outside -100 to 100, is refused in words.
 */
function useRunTiming(enabled: boolean) {
  const [start, setStart] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [priority, setPriority] = useState("");
  const read = (): RunTimingChoice => {
    const choice: RunTimingChoice = {};
    if (start === "later") {
      const instant = instantOf(at);
      if (!instant) throw new Error("Choose when it starts, or start it now.");
      if (Date.parse(instant) <= Date.now()) throw new Error("Choose a time that has not passed.");
      choice.startAfter = instant;
    }
    if (priority.trim() !== "") {
      const number = Number(priority);
      if (!Number.isInteger(number) || number < -100 || number > 100) {
        throw new Error("Priority is a whole number from -100 to 100.");
      }
      if (number !== 0) choice.priority = number;
    }
    return choice;
  };
  const fields = enabled ? (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-meta text-ink-muted">
        Start
        <select
          value={start}
          onChange={(event) => setStart(event.currentTarget.value === "later" ? "later" : "now")}
          className="h-9 rounded-control border border-line-control bg-surface px-2 text-body-sm text-ink"
        >
          <option value="now">Now</option>
          <option value="later">Later</option>
        </select>
      </label>
      {start === "later" ? (
        <label className="flex flex-col gap-1 text-meta text-ink-muted">
          Starts at
          <input
            type="datetime-local"
            value={at}
            onChange={(event) => setAt(event.currentTarget.value)}
            className="h-9 rounded-control border border-line-control bg-surface px-2 text-body-sm text-ink"
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-meta text-ink-muted">
        Priority
        <input
          type="number"
          inputMode="numeric"
          min={-100}
          max={100}
          placeholder="0"
          value={priority}
          onChange={(event) => setPriority(event.currentTarget.value)}
          className="h-9 w-24 rounded-control border border-line-control bg-surface px-2 text-body-sm text-ink"
        />
      </label>
      <p className="m-0 basis-full text-meta text-ink-subtle">
        A later run waits as queued until its time. A higher priority goes first when runs wait for
        a worker.
      </p>
    </div>
  ) : null;
  return { fields, read };
}

export function InputDialog({
  open,
  onClose,
  title,
  action,
  schema,
  initial,
  timing,
  onSame,
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
  /** Asks when it starts and with what priority; `onSubmit` is given the choice as a second argument. */
  timing?: boolean;
  /** Starts it again with the input it had, for an input too large to be shown and edited. */
  onSame?: () => Promise<void>;
  onSubmit: (input: unknown, timing: RunTimingChoice) => Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {/* A new form each time it opens, from what it is given then. */}
      {open && onSame && isStoredInput(initial) ? (
        <TooLarge action={action} onCancel={onClose} onSame={onSame} />
      ) : open ? (
        <MaskedAware
          schema={schema}
          initial={initial}
          action={action}
          timing={timing}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

function TooLarge({
  action,
  onCancel,
  onSame,
}: {
  action: string;
  onCancel: () => void;
  onSame: () => Promise<void>;
}) {
  const [problem, setProblem] = useState<string>();
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="attention">
        This input is too large to show or change here. It can be run again with the same input.
      </Notice>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            setProblem(undefined);
            onSame().catch((error) => setProblem(failureText(error)));
          }}
        >
          {action} with the same input
        </Button>
      </div>
    </div>
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
  timing,
  onCancel,
  onSubmit,
}: {
  schema?: Record<string, unknown> | undefined;
  initial?: unknown;
  action: string;
  timing?: boolean | undefined;
  onCancel: () => void;
  onSubmit: (input: unknown, timing: RunTimingChoice) => Promise<void>;
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
        timing={timing}
        onCancel={onCancel}
        onSubmit={async (input, choice) => {
          if (JSON.stringify(input ?? null).includes(JSON.stringify(MASKED))) {
            throw new Error(`Replace each "${MASKED}" with its real value first.`);
          }
          if (timing) await onSubmit(input, choice);
          else await (onSubmit as (input: unknown) => Promise<void>)(input);
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
  timing,
  onCancel,
  onSubmit,
}: {
  schema?: Record<string, unknown> | undefined;
  initial?: unknown;
  action: string;
  timing?: boolean | undefined;
  onCancel?: () => void;
  onSubmit: (input: unknown, timing: RunTimingChoice) => Promise<void>;
}) {
  const later = useRunTiming(Boolean(timing));
  const [problem, setProblem] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const drawn = schema && Object.keys(schema).length > 0 ? (schema as JsonSchema) : {};
  return (
    <div className="flex flex-col gap-3">
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {later.fields}
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
            // Only a dialog that asks about timing says anything about it.
            if (timing) await onSubmit(input ?? {}, later.read());
            else await (onSubmit as (input: unknown) => Promise<void>)(input ?? {});
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
