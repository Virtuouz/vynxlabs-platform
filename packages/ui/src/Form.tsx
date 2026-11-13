import { useRef, useState } from "react";
import { Button } from "./Button.tsx";
import {
  CheckboxField,
  DateField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "./Fields.tsx";
import { Notice } from "./Notice.tsx";

/** One field of a form: the part of JSON Schema the form understands. */
export interface FormProperty {
  type: "string" | "number" | "integer" | "boolean";
  /** The field's label. Without one, the label is made from the property's name. */
  title?: string;
  /** Shown under the field as its hint. */
  description?: string;
  default?: string | number | boolean;
  /** The values to choose from. The field becomes a select. */
  enum?: readonly (string | number)[];
  /** `date`, `date-time` and `email` change the control. Any other format is plain text. */
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

/** A JSON Schema for a flat object. The fields are shown in the order of `properties`. */
export interface FormSchema {
  type: "object";
  title?: string;
  description?: string;
  properties: Record<string, FormProperty>;
  required?: readonly string[];
}

/** What a field holds while it is edited: text, a number, or a tick. */
type Draft = Record<string, string | number | boolean | undefined>;

/** A string this long or longer is asked for in a box of several lines. */
const LONG_TEXT = 200;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function labelOf(name: string, property: FormProperty): string {
  if (property.title) return property.title;
  const words = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** An instant as the text a date-and-time control holds: local time, to the minute. */
function toLocalText(instant: string): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return "";
  const two = (part: number) => String(part).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}:${two(at.getMinutes())}`;
}

/** What each field starts with: the given value, else the schema's default, else nothing. */
function startDraft(schema: FormSchema, value: Record<string, unknown> | undefined): Draft {
  const draft: Draft = {};
  for (const [name, property] of Object.entries(schema.properties)) {
    const given = value?.[name] ?? property.default;
    if (property.type === "boolean") draft[name] = given === true;
    else if (property.enum) draft[name] = given === undefined ? "" : String(given);
    else if (property.type === "string") {
      const text = typeof given === "string" ? given : "";
      draft[name] = property.format === "date-time" ? toLocalText(text) : text;
    } else draft[name] = typeof given === "number" ? given : undefined;
  }
  return draft;
}

/**
 * Checks what was typed against the schema and turns it into values of the
 * schema's types. An optional field left empty is left out of the values.
 * Returns a message for each field that does not pass.
 */
export function checkForm(
  schema: FormSchema,
  draft: Record<string, string | number | boolean | undefined>,
): { values: Record<string, unknown>; errors: Record<string, string> } {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const required = new Set(schema.required ?? []);

  for (const [name, property] of Object.entries(schema.properties)) {
    const held = draft[name];
    if (property.type === "boolean") {
      values[name] = held === true;
      continue;
    }
    if (held === undefined || held === "") {
      if (required.has(name)) errors[name] = "This is required.";
      continue;
    }
    if (property.enum) {
      const chosen = property.enum.find((option) => String(option) === String(held));
      if (chosen === undefined) errors[name] = "Choose one of the options.";
      else values[name] = chosen;
      continue;
    }
    if (property.type === "string") {
      const text = String(held);
      if (property.minLength !== undefined && text.length < property.minLength) {
        errors[name] = `Use at least ${property.minLength} characters.`;
      } else if (property.maxLength !== undefined && text.length > property.maxLength) {
        errors[name] = `Use at most ${property.maxLength} characters.`;
      } else if (property.format === "email" && !EMAIL.test(text)) {
        errors[name] = "Enter an email address.";
      } else if (property.format === "date-time") {
        const at = new Date(text);
        if (Number.isNaN(at.getTime())) errors[name] = "Enter a date and time.";
        else values[name] = at.toISOString();
      } else values[name] = text;
      continue;
    }
    const number = Number(held);
    if (Number.isNaN(number)) errors[name] = "Enter a number.";
    else if (property.type === "integer" && !Number.isInteger(number)) {
      errors[name] = "Enter a whole number.";
    } else if (property.minimum !== undefined && number < property.minimum) {
      errors[name] = `Enter ${property.minimum} or more.`;
    } else if (property.maximum !== undefined && number > property.maximum) {
      errors[name] = `Enter ${property.maximum} or less.`;
    } else values[name] = number;
  }
  return { values, errors };
}

export interface FormProps {
  schema: FormSchema;
  /** What the fields start with. Read once: give the form a new `key` to start again. */
  value?: Record<string, unknown>;
  /** Called with the checked values. While its promise is pending the button is disabled. */
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  submitLabel: string;
  /** Messages from the server, by field name. One the form found itself is shown first. */
  errors?: Record<string, string>;
  disabled?: boolean;
}

/** A form drawn from a JSON Schema. It checks what was typed before it submits. */
export function Form({ schema, value, onSubmit, submitLabel, errors, disabled }: FormProps) {
  const [draft, setDraft] = useState(() => startDraft(schema, value));
  const [found, setFound] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const required = new Set(schema.required ?? []);
  const off = disabled === true || busy;

  const set = (name: string, next: string | number | boolean | undefined) => {
    setDraft((before) => ({ ...before, [name]: next }));
    setFound(({ [name]: _cleared, ...rest }) => rest);
  };

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (off) return;
    const checked = checkForm(schema, draft);
    setFound(checked.errors);
    const first = Object.keys(checked.errors)[0];
    if (first !== undefined) {
      const control = form.current?.elements.namedItem(first);
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      await onSubmit(checked.values);
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={form} noValidate onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      {schema.title ? <h2 className="m-0 text-base font-semibold">{schema.title}</h2> : null}
      {schema.description ? <p className="m-0 text-ink-muted">{schema.description}</p> : null}
      {failure ? <Notice tone="danger">{failure}</Notice> : null}
      {Object.entries(schema.properties).map(([name, property]) => {
        const common = {
          name,
          label: labelOf(name, property),
          ...(property.description ? { hint: property.description } : {}),
          error: found[name] ?? errors?.[name],
          required: required.has(name),
          disabled: off,
        };
        const held = draft[name];
        if (property.type === "boolean") {
          return (
            <CheckboxField
              key={name}
              {...common}
              required={false}
              checked={held === true}
              onChange={(next) => set(name, next)}
            />
          );
        }
        if (property.enum) {
          const options = property.enum.map((option) => ({
            value: String(option),
            label: String(option),
          }));
          // A choice that may be left open, or has not been made yet, starts on an empty option.
          if (!common.required || held === "") options.unshift({ value: "", label: "" });
          return (
            <SelectField
              key={name}
              {...common}
              value={String(held ?? "")}
              options={options}
              onChange={(next) => set(name, next)}
            />
          );
        }
        if (property.type === "number" || property.type === "integer") {
          return (
            <NumberField
              key={name}
              {...common}
              value={typeof held === "number" ? held : undefined}
              {...(property.minimum !== undefined ? { min: property.minimum } : {})}
              {...(property.maximum !== undefined ? { max: property.maximum } : {})}
              {...(property.type === "integer" ? { step: 1 } : {})}
              onChange={(next) => set(name, next)}
            />
          );
        }
        const text = String(held ?? "");
        if (property.format === "date" || property.format === "date-time") {
          return (
            <DateField
              key={name}
              {...common}
              value={text}
              withTime={property.format === "date-time"}
              onChange={(next) => set(name, next)}
            />
          );
        }
        const limits = {
          ...(property.minLength !== undefined ? { minLength: property.minLength } : {}),
          ...(property.maxLength !== undefined ? { maxLength: property.maxLength } : {}),
        };
        if (property.maxLength !== undefined && property.maxLength >= LONG_TEXT) {
          return (
            <TextAreaField
              key={name}
              {...common}
              {...limits}
              value={text}
              onChange={(next) => set(name, next)}
            />
          );
        }
        return (
          <TextField
            key={name}
            {...common}
            {...limits}
            type={property.format === "email" ? "email" : "text"}
            value={text}
            onChange={(next) => set(name, next)}
          />
        );
      })}
      <div>
        <Button type="submit" variant="primary" disabled={off}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
