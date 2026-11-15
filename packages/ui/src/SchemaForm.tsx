import { type ReactNode, useRef, useState } from "react";
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
import { SegmentedControl } from "./Pickers.tsx";

/**
 * A form drawn from a JSON Schema: the part of JSON Schema 2020-12 that zod's
 * `toJSONSchema` writes. Nested objects, lists, choices, unions picked by a
 * field, and values that may be left as nothing. A part of a schema it cannot
 * draw is asked for as JSON, that part alone. The whole form can be switched
 * to JSON and back.
 *
 * It checks what it draws itself, with no code made at run time: the pages
 * apps are served on allow no `eval`. The server checks again, fully, and what
 * it refuses can be passed back as `errors`.
 */
export type JsonSchema = Record<string, unknown>;

/** Text typed into a JSON field that is not JSON yet. */
class Unparsed {
  constructor(readonly text: string) {}
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Up to this many choices are shown side by side. */
const FEW = 4;
/** A string this long or longer is asked for in a box of several lines. */
const LONG_TEXT = 200;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Unparsed);

/** A JSON Pointer segment, escaped. */
const segment = (name: string | number) => String(name).replace(/~/g, "~0").replace(/\//g, "~1");

/** The schema with what only says "or nothing" taken off, and whether it said so. */
function withoutNull(schema: JsonSchema): { schema: JsonSchema; nullable: boolean } {
  const type = schema.type;
  if (Array.isArray(type) && type.includes("null")) {
    const rest = type.filter((one) => one !== "null");
    return { schema: { ...schema, type: rest.length === 1 ? rest[0] : rest }, nullable: true };
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    const options = schema[key];
    if (!Array.isArray(options)) continue;
    const others = (options as JsonSchema[]).filter((option) => option.type !== "null");
    if (others.length === options.length - 1 && others.length === 1) {
      const { [key]: _gone, ...rest } = schema;
      return { schema: { ...rest, ...(others[0] as JsonSchema) }, nullable: true };
    }
  }
  return { schema, nullable: false };
}

interface Union {
  key: "anyOf" | "oneOf";
  /** The field whose constant value says which option it is. */
  by: string;
  options: { value: string; schema: JsonSchema }[];
}

/** A union of objects told apart by one field that is a constant in each, or nothing. */
function unionOf(schema: JsonSchema): Union | undefined {
  const key = Array.isArray(schema.oneOf)
    ? "oneOf"
    : Array.isArray(schema.anyOf)
      ? "anyOf"
      : undefined;
  if (!key) return undefined;
  const options = schema[key] as JsonSchema[];
  if (options.length < 2 || !options.every((option) => option.type === "object")) return undefined;
  const first = options[0]?.properties as Record<string, JsonSchema> | undefined;
  for (const name of Object.keys(first ?? {})) {
    const values = options.map((option) => {
      const property = (option.properties as Record<string, JsonSchema> | undefined)?.[name];
      const single =
        property?.const ??
        (Array.isArray(property?.enum) && property.enum.length === 1
          ? property.enum[0]
          : undefined);
      return typeof single === "string" ? single : undefined;
    });
    if (values.every((value) => value !== undefined) && new Set(values).size === values.length) {
      return {
        key,
        by: name,
        options: options.map((option, index) => ({
          value: values[index] as string,
          schema: option,
        })),
      };
    }
  }
  return undefined;
}

/** The values a choice offers, or nothing when it is no choice. */
function choicesOf(schema: JsonSchema): readonly (string | number | boolean)[] | undefined {
  if (Array.isArray(schema.enum)) return schema.enum as (string | number | boolean)[];
  if (schema.const !== undefined && typeof schema.const !== "object")
    return [schema.const as string];
  return undefined;
}

/** What drawing a schema comes to. `json` for what the form cannot draw. */
type Shape = "choice" | "string" | "number" | "boolean" | "object" | "list" | "union" | "json";

function shapeOf(schema: JsonSchema): Shape {
  if (choicesOf(schema)) return "choice";
  if (unionOf(schema)) return "union";
  const type = schema.type;
  if (type === "string") return "string";
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  if (type === "object" && isObject(schema.properties)) return "object";
  if (type === "array" && isObject(schema.items) && !Array.isArray(schema.prefixItems)) {
    const items = withoutNull(schema.items).schema;
    const inner = shapeOf(items);
    if (inner === "object" || inner === "union" || inner === "number" || inner === "choice")
      return "list";
    if (inner === "string" && !items.format) return "list";
  }
  return "json";
}

function labelOf(name: string, schema: JsonSchema): string {
  if (typeof schema.title === "string") return schema.title;
  const words = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What a value starts as: the one given, else the schema's default, else nothing. */
export function startValue(schema: JsonSchema, given: unknown): unknown {
  const { schema: plain } = withoutNull(schema);
  const value = given !== undefined ? given : plain.default;
  const shape = shapeOf(plain);
  if (shape === "object") {
    const properties = plain.properties as Record<string, JsonSchema>;
    const source = isObject(value) ? value : {};
    const out: Record<string, unknown> = {};
    for (const [name, property] of Object.entries(properties)) {
      const started = startValue(property, source[name]);
      if (started !== undefined) out[name] = started;
    }
    // What the schema does not name is kept, so that nothing given is lost.
    for (const [name, held] of Object.entries(source)) if (!(name in out)) out[name] = held;
    return out;
  }
  if (shape === "union" && value === undefined) {
    const union = unionOf(plain) as Union;
    const first = union.options[0] as Union["options"][number];
    return startValue(first.schema, { [union.by]: first.value });
  }
  if (shape === "union" && isObject(value)) {
    const union = unionOf(plain) as Union;
    const chosen = union.options.find((option) => option.value === value[union.by]);
    return chosen ? startValue(chosen.schema, value) : value;
  }
  if (shape === "choice" && value === undefined && plain.const !== undefined) return plain.const;
  return value;
}

/** The value as it is sent: nothing left empty. JSON half typed is kept, for `checkValue` to refuse. */
export function cleaned(value: unknown): unknown {
  if (value instanceof Unparsed) return value;
  if (Array.isArray(value)) return value.map(cleaned);
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [name, held] of Object.entries(value)) {
      const next = cleaned(held);
      if (next !== undefined) out[name] = next;
    }
    return out;
  }
  return value;
}

/**
 * Checks a value against a schema, as far as the form draws it. Returns a
 * message for each place that does not pass, by JSON Pointer; an empty object
 * when it all passes.
 */
export function checkValue(schema: JsonSchema, value: unknown, at = ""): Record<string, string> {
  const errors: Record<string, string> = {};
  check(schema, value, at, errors);
  return errors;
}

function check(schema: JsonSchema, value: unknown, at: string, errors: Record<string, string>) {
  if (value instanceof Unparsed) {
    errors[at] = "This is not valid JSON.";
    return;
  }
  const { schema: plain, nullable } = withoutNull(schema);
  if (value === null) {
    if (!nullable && plain.type !== "null") errors[at] = "This needs a value.";
    return;
  }
  if (value === undefined) return;
  const shape = shapeOf(plain);
  const choices = choicesOf(plain);
  if (shape === "choice" && choices) {
    if (!choices.some((choice) => choice === value)) errors[at] = "Choose one of the options.";
    return;
  }
  if (shape === "string") {
    if (typeof value !== "string") {
      errors[at] = "Enter text.";
      return;
    }
    const format = plain.format;
    if (typeof plain.minLength === "number" && value.length < plain.minLength) {
      errors[at] =
        plain.minLength === 1 ? "This is required." : `Use at least ${plain.minLength} characters.`;
    } else if (typeof plain.maxLength === "number" && value.length > plain.maxLength) {
      errors[at] = `Use at most ${plain.maxLength} characters.`;
    } else if (format === "email" && !EMAIL.test(value)) {
      errors[at] = "Enter an email address.";
    } else if (format === "uri" && !URL.canParse(value)) {
      errors[at] = "Enter an address, such as https://example.com.";
    } else if (format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors[at] = "Enter a date.";
    } else if (format === "date-time" && Number.isNaN(new Date(value).getTime())) {
      errors[at] = "Enter a date and time.";
    } else if (typeof plain.pattern === "string" && format !== "email") {
      let matches = true;
      try {
        matches = new RegExp(plain.pattern, "u").test(value);
      } catch {
        // A pattern this browser cannot read is the server's to check.
      }
      if (!matches) errors[at] = "This is not in the expected form.";
    }
    return;
  }
  if (shape === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors[at] = "Enter a number.";
    } else if (plain.type === "integer" && !Number.isInteger(value)) {
      errors[at] = "Enter a whole number.";
    } else if (typeof plain.minimum === "number" && value < plain.minimum) {
      errors[at] = `Enter ${plain.minimum} or more.`;
    } else if (typeof plain.maximum === "number" && value > plain.maximum) {
      errors[at] = `Enter ${plain.maximum} or less.`;
    } else if (typeof plain.exclusiveMinimum === "number" && value <= plain.exclusiveMinimum) {
      errors[at] = `Enter more than ${plain.exclusiveMinimum}.`;
    } else if (typeof plain.exclusiveMaximum === "number" && value >= plain.exclusiveMaximum) {
      errors[at] = `Enter less than ${plain.exclusiveMaximum}.`;
    }
    return;
  }
  if (shape === "boolean") {
    if (typeof value !== "boolean") errors[at] = "Choose yes or no.";
    return;
  }
  if (shape === "object") {
    if (!isObject(value)) {
      errors[at] = "This needs fields.";
      return;
    }
    const properties = plain.properties as Record<string, JsonSchema>;
    for (const name of (plain.required as string[] | undefined) ?? []) {
      const held = value[name];
      if (held === undefined || held === "") errors[`${at}/${segment(name)}`] = "This is required.";
    }
    for (const [name, property] of Object.entries(properties)) {
      const pointer = `${at}/${segment(name)}`;
      if (errors[pointer]) continue;
      check(property, value[name], pointer, errors);
    }
    return;
  }
  if (shape === "union") {
    const union = unionOf(plain) as Union;
    const chosen = isObject(value)
      ? union.options.find((option) => option.value === value[union.by])
      : undefined;
    if (!chosen) errors[`${at}/${segment(union.by)}`] = "Choose one of the options.";
    else check(chosen.schema, value, at, errors);
    return;
  }
  if (shape === "list") {
    if (!Array.isArray(value)) {
      errors[at] = "This needs a list.";
      return;
    }
    if (typeof plain.minItems === "number" && value.length < plain.minItems) {
      errors[at] = `Add at least ${plain.minItems}.`;
    } else if (typeof plain.maxItems === "number" && value.length > plain.maxItems) {
      errors[at] = `Keep at most ${plain.maxItems}.`;
    }
    value.forEach((item, index) => {
      check(plain.items as JsonSchema, item, `${at}/${index}`, errors);
    });
  }
}

interface NodeProps {
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  pointer: string;
  label: string;
  required: boolean;
  errors: Record<string, string>;
  disabled: boolean;
}

/** One value of the form, drawn as its schema says. */
function Node(props: NodeProps): ReactNode {
  const { schema, value, onChange, pointer, label, required, errors, disabled } = props;
  const { schema: plain, nullable } = withoutNull(schema);
  if (nullable) {
    const none = value === null;
    return (
      <div className="flex flex-col gap-1">
        {none ? (
          <p className="m-0 text-[13px] font-medium text-ink">{label}</p>
        ) : (
          <Node {...props} schema={plain} />
        )}
        <CheckboxField
          name={`${pointer}#none`}
          label={`No ${label.toLowerCase()}`}
          checked={none}
          disabled={disabled}
          onChange={(checked) => onChange(checked ? null : startValue(plain, undefined))}
        />
      </div>
    );
  }
  const error = errors[pointer];
  const hint = typeof plain.description === "string" ? plain.description : undefined;
  const common = {
    name: pointer || "/",
    label,
    ...(hint ? { hint } : {}),
    error,
    required,
    disabled,
  };
  const shape = shapeOf(plain);

  if (shape === "choice") {
    const choices = choicesOf(plain) as readonly (string | number | boolean)[];
    const index = choices.indexOf(value as string | number | boolean);
    if (choices.length <= FEW && required) {
      return (
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-ink" aria-hidden>
            {label}
          </span>
          <SegmentedControl
            label={label}
            value={index < 0 ? "" : String(index)}
            options={choices.map((choice, at) => ({ value: String(at), label: String(choice) }))}
            onChange={(at) => onChange(choices[Number(at)])}
          />
          {error ? (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {error}
            </p>
          ) : hint ? (
            <p className="m-0 text-[13px] text-ink-muted">{hint}</p>
          ) : null}
        </div>
      );
    }
    const options = choices.map((choice, at) => ({ value: String(at), label: String(choice) }));
    if (!required || index < 0) options.unshift({ value: "", label: "" });
    return (
      <SelectField
        {...common}
        value={index < 0 ? "" : String(index)}
        options={options}
        onChange={(at) => onChange(at === "" ? undefined : choices[Number(at)])}
      />
    );
  }

  if (shape === "boolean") {
    return (
      <CheckboxField
        {...common}
        required={false}
        checked={value === true}
        onChange={(checked) => onChange(checked)}
      />
    );
  }

  if (shape === "number") {
    return (
      <NumberField
        {...common}
        value={typeof value === "number" ? value : undefined}
        {...(typeof plain.minimum === "number" ? { min: plain.minimum } : {})}
        {...(typeof plain.maximum === "number" ? { max: plain.maximum } : {})}
        {...(plain.type === "integer" ? { step: 1 } : {})}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (shape === "string") {
    const text = typeof value === "string" ? value : "";
    const set = (next: string) => onChange(next === "" ? undefined : next);
    if (plain.format === "date") {
      return <DateField {...common} value={text} onChange={set} />;
    }
    if (plain.format === "date-time") {
      return (
        <DateField
          {...common}
          withTime
          value={localText(text)}
          onChange={(next) => {
            const at = new Date(next);
            set(next === "" ? "" : Number.isNaN(at.getTime()) ? next : at.toISOString());
          }}
        />
      );
    }
    const limits = {
      ...(typeof plain.minLength === "number" ? { minLength: plain.minLength } : {}),
      ...(typeof plain.maxLength === "number" ? { maxLength: plain.maxLength } : {}),
    };
    if (typeof plain.maxLength === "number" && plain.maxLength >= LONG_TEXT) {
      return <TextAreaField {...common} {...limits} value={text} onChange={set} />;
    }
    return (
      <TextField
        {...common}
        {...limits}
        type={
          plain.format === "email" ? "email" : plain.format === "password" ? "password" : "text"
        }
        value={text}
        onChange={set}
      />
    );
  }

  if (shape === "object") {
    const properties = plain.properties as Record<string, JsonSchema>;
    const needed = new Set((plain.required as string[] | undefined) ?? []);
    const held = isObject(value) ? value : {};
    const fields = Object.entries(properties).map(([name, property]) => (
      <Node
        key={name}
        schema={property}
        value={held[name]}
        onChange={(next) => onChange({ ...held, [name]: next })}
        pointer={`${pointer}/${segment(name)}`}
        label={labelOf(name, property)}
        required={needed.has(name)}
        errors={errors}
        disabled={disabled}
      />
    ));
    if (pointer === "") return <div className="flex flex-col gap-4">{fields}</div>;
    return (
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-control border border-line p-3">
        <legend className="px-1 text-[13px] font-medium text-ink">{label}</legend>
        {hint ? <p className="m-0 text-[13px] text-ink-muted">{hint}</p> : null}
        {error ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        {fields}
      </fieldset>
    );
  }

  if (shape === "union") {
    const union = unionOf(plain) as Union;
    const held = isObject(value) ? value : {};
    const chosen = union.options.find((option) => option.value === held[union.by]);
    const pick = (next: string) => {
      const option = union.options.find((one) => one.value === next);
      if (!option) return;
      // What the options share is kept; the rest starts again.
      const shared = Object.fromEntries(
        Object.entries(held).filter(
          ([name]) => name !== union.by && name in ((option.schema.properties as object) ?? {}),
        ),
      );
      onChange(startValue(option.schema, { ...shared, [union.by]: next }));
    };
    const rest = chosen
      ? {
          ...chosen.schema,
          properties: Object.fromEntries(
            Object.entries(chosen.schema.properties as Record<string, JsonSchema>).filter(
              ([name]) => name !== union.by,
            ),
          ),
        }
      : undefined;
    const choice = (
      <SelectField
        name={`${pointer}/${segment(union.by)}`}
        label={pointer === "" ? labelOf(union.by, {}) : label}
        value={chosen?.value ?? ""}
        required
        disabled={disabled}
        error={errors[`${pointer}/${segment(union.by)}`]}
        options={[
          ...(chosen ? [] : [{ value: "", label: "" }]),
          ...union.options.map((option) => ({
            value: option.value,
            label: typeof option.schema.title === "string" ? option.schema.title : option.value,
          })),
        ]}
        onChange={pick}
      />
    );
    return (
      <div className="flex flex-col gap-3">
        {choice}
        {/* An option that is nothing but its name, such as a bearer token, has nothing more to ask. */}
        {rest && Object.keys(rest.properties).length > 0 ? (
          <Node
            {...props}
            schema={rest}
            pointer={pointer}
            value={held}
            onChange={(next) => onChange({ ...(next as object), [union.by]: chosen?.value })}
            // The subform's fields sit under the choice, not in a box of their own.
            label={label}
          />
        ) : null}
      </div>
    );
  }

  if (shape === "list") {
    return <ListNode {...props} schema={plain} />;
  }

  return <JsonNode {...props} schema={plain} />;
}

/** A list: rows that can be added, removed and moved, each drawn by the items' schema. */
function ListNode({ schema, value, onChange, pointer, label, errors, disabled }: NodeProps) {
  const items = schema.items as JsonSchema;
  const list = Array.isArray(value) ? value : [];
  const hint = typeof schema.description === "string" ? schema.description : undefined;
  const set = (index: number, next: unknown) =>
    onChange(list.map((held, at) => (at === index ? next : held)));
  const move = (index: number, by: number) => {
    const next = [...list];
    const [taken] = next.splice(index, 1);
    next.splice(index + by, 0, taken);
    onChange(next);
  };
  const itemLabel = typeof items.title === "string" ? items.title : "Item";
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-control border border-line p-3">
      <legend className="px-1 text-[13px] font-medium text-ink">{label}</legend>
      {hint ? <p className="m-0 text-[13px] text-ink-muted">{hint}</p> : null}
      {errors[pointer] ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {errors[pointer]}
        </p>
      ) : null}
      {list.map((held, index) => (
        <div
          // The position is what a row is: rows have no identity of their own.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          className="flex min-w-0 flex-col gap-2 border-line border-b pb-2 last:border-b-0"
        >
          <Node
            schema={items}
            value={held}
            onChange={(next) => set(index, next)}
            pointer={`${pointer}/${index}`}
            label={`${itemLabel} ${index + 1}`}
            required
            errors={errors}
            disabled={disabled}
          />
          <div className="flex flex-wrap gap-1">
            <Button
              size="small"
              disabled={disabled || index === 0}
              aria-label={`Move ${itemLabel.toLowerCase()} ${index + 1} up`}
              onClick={() => move(index, -1)}
            >
              Up
            </Button>
            <Button
              size="small"
              disabled={disabled || index === list.length - 1}
              aria-label={`Move ${itemLabel.toLowerCase()} ${index + 1} down`}
              onClick={() => move(index, 1)}
            >
              Down
            </Button>
            <Button
              size="small"
              disabled={disabled}
              aria-label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(list.filter((_, at) => at !== index))}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button
          size="small"
          disabled={disabled}
          onClick={() => onChange([...list, startValue(items, undefined)])}
        >
          Add {itemLabel.toLowerCase()}
        </Button>
      </div>
    </fieldset>
  );
}

/** What the form cannot draw, asked for as JSON: this part alone. */
function JsonNode({
  value,
  onChange,
  pointer,
  label,
  required,
  errors,
  disabled,
  schema,
}: NodeProps) {
  const [text, setText] = useState(() =>
    value instanceof Unparsed
      ? value.text
      : value === undefined
        ? ""
        : JSON.stringify(value, null, 2),
  );
  const hint =
    typeof schema.description === "string" ? `${schema.description} As JSON.` : "As JSON.";
  return (
    <TextAreaField
      name={pointer || "/"}
      label={label}
      hint={hint}
      error={errors[pointer]}
      required={required}
      disabled={disabled}
      rows={4}
      value={text}
      onChange={(next) => {
        setText(next);
        if (next.trim() === "") return onChange(undefined);
        try {
          onChange(JSON.parse(next));
        } catch {
          onChange(new Unparsed(next));
        }
      }}
    />
  );
}

/** An instant as a date-and-time control holds it: local time, to the minute. */
function localText(instant: string): string {
  if (!instant) return "";
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return instant;
  const two = (part: number) => String(part).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}:${two(at.getMinutes())}`;
}

export interface SchemaFormProps {
  schema: JsonSchema;
  /** What the form starts with. Read once: give the form a new `key` to start again. */
  value?: unknown;
  /** Called with the checked value. While its promise is pending the button is disabled. */
  /** Without it, the form is part of a larger one: no button, and `onChange` says what it holds. */
  onSubmit?: (value: unknown) => void | Promise<void>;
  submitLabel?: string;
  /** Shown beside the submit button, for a form in a dialog. */
  onCancel?: () => void;
  /** Messages from the server, by JSON Pointer into the value (`/customer/email`). */
  errors?: Record<string, string>;
  disabled?: boolean;
  /** Called with the value as it is edited, checked or not. */
  onChange?: (value: unknown) => void;
}

/** A form drawn from a JSON Schema, with a JSON view of the whole value beside it. */
export function SchemaForm({
  schema,
  value,
  onSubmit,
  submitLabel,
  onCancel,
  errors,
  disabled,
  onChange,
}: SchemaFormProps) {
  const [held, setHeld] = useState<unknown>(() => startValue(schema, value));
  const [mode, setMode] = useState<"fields" | "json">(() =>
    shapeOf(withoutNull(schema).schema) === "json" ? "json" : "fields",
  );
  // A form that starts as JSON shows what it was given.
  const [text, setText] = useState(() => {
    if (shapeOf(withoutNull(schema).schema) !== "json") return "";
    const given = cleaned(startValue(schema, value));
    return given === undefined ? "" : JSON.stringify(given, null, 2);
  });
  const [found, setFound] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const off = disabled === true || busy;
  const drawable = shapeOf(withoutNull(schema).schema) !== "json";

  const change = (next: unknown) => {
    setHeld(next);
    setFound({});
    onChange?.(cleaned(next));
  };

  const fromText = (): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: text.trim() === "" ? undefined : JSON.parse(text) };
    } catch {
      setFound({ "": "That is not valid JSON." });
      return { ok: false };
    }
  };

  const switchTo = (next: "fields" | "json") => {
    if (next === mode) return;
    if (next === "json") {
      const current = cleaned(held);
      setText(current instanceof Unparsed ? "" : JSON.stringify(current ?? {}, null, 2));
      setFound({});
      setMode("json");
      return;
    }
    const parsed = fromText();
    if (!parsed.ok) return;
    setHeld(startValue(schema, parsed.value));
    setFound({});
    setMode("fields");
    onChange?.(cleaned(startValue(schema, parsed.value)));
  };

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (off) return;
    let value = cleaned(held);
    if (mode === "json") {
      const parsed = fromText();
      if (!parsed.ok) return;
      value = parsed.value;
    }
    const problems = checkValue(schema, value);
    // At the top, nothing given is an object with nothing in it.
    if (value === undefined && withoutNull(schema).schema.type === "object") value = {};
    setFound(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      if (mode === "fields") {
        const control = form.current?.querySelector(`[name="${CSS.escape(first || "/")}"]`);
        if (control instanceof HTMLElement) control.focus();
      }
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      await onSubmit?.(value);
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const shown = { ...errors, ...found };
  const jsonErrors = Object.entries(shown)
    .map(([pointer, message]) => (pointer ? `${pointer}: ${message}` : message))
    .join(" ");

  const inner = (
    <>
      {failure ? <Notice tone="danger">{failure}</Notice> : null}
      {drawable ? (
        <SegmentedControl
          label="How to give it"
          size="small"
          value={mode}
          options={[
            { value: "fields", label: "Fields" },
            { value: "json", label: "JSON" },
          ]}
          onChange={switchTo}
        />
      ) : null}
      {mode === "fields" ? (
        <Node
          schema={schema}
          value={held}
          onChange={change}
          pointer=""
          label={typeof schema.title === "string" ? schema.title : "Input"}
          required
          errors={shown}
          disabled={off}
        />
      ) : (
        <TextAreaField
          name="json"
          label="As JSON"
          rows={10}
          value={text}
          disabled={off}
          {...(jsonErrors ? { error: jsonErrors } : {})}
          onChange={(next) => {
            setText(next);
            setFound({});
            if (!onSubmit) {
              try {
                onChange?.(next.trim() === "" ? undefined : JSON.parse(next));
              } catch {
                onChange?.(new Unparsed(next));
              }
            }
          }}
        />
      )}
      {onSubmit ? (
        <div className="flex flex-wrap justify-end gap-2">
          {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
          <Button type="submit" variant="primary" disabled={off}>
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
  if (!onSubmit) return <div className="flex min-w-0 max-w-xl flex-col gap-4">{inner}</div>;
  return (
    <form ref={form} noValidate onSubmit={submit} className="flex min-w-0 max-w-xl flex-col gap-4">
      {inner}
    </form>
  );
}
