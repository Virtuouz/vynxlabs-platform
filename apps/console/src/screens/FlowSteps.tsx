import { FORM_RESERVED_NAMES } from "@volvel/manifest";
import {
  Button,
  CheckboxField,
  ComboboxField,
  MoveButtons,
  NumberField,
  type Option,
  SelectField,
  TextAreaField,
  TextField,
  useFlip,
  useKeys,
} from "@volvel/ui";
import { useEffect, useState } from "react";
import type { GraphNode } from "../FlowGraph.tsx";
import { ExpressionField } from "./ExpressionField.tsx";

/**
 * The settings of the steps a flow is drawn from, where a step has more to
 * it than an expression or two: a node with a form of its own, a webhook, a
 * form people fill in, and the answer to a request.
 */

type FlowNode = GraphNode & Record<string, unknown>;
/** A change to some fields, where undefined takes a field away. */
type Loose<T> = { [K in keyof T]?: T[K] | undefined };

/** What a field of a node's input may be chosen from. */
export type Picked = "connection" | "table" | "event";
const GRANT_FIELD: Record<Picked, "connections" | "tables" | "events"> = {
  connection: "connections",
  table: "tables",
  event: "events",
};

interface InputProperty {
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  "x-pick"?: Picked;
}

/** A script that is a step people pick: one the platform comes with, or one of the tenant's own. */
export interface PickableNode {
  path: string;
  label: string;
  /** The name of an icon from the kit's set: drawn beside the label in the palette. */
  icon?: string;
  category: string;
  description: string;
  takes: string[];
  input: { properties?: Record<string, InputProperty>; required?: string[] };
}

/** Text as an expression that gives it. */
export const quoted = (text: string) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** The text an expression gives, when the expression is nothing but that text. */
export function unquoted(expression: string | undefined): string | undefined {
  const match = /^'((?:[^'\\]|\\.)*)'$/.exec((expression ?? "").trim());
  return match ? (match[1] as string).replace(/\\(.)/g, "$1") : undefined;
}

/** A listed value written as the expression that gives it: text in quotes, a number or yes/no as itself. */
export const literalOf = (value: unknown): string =>
  typeof value === "string" ? quoted(value) : String(value);

/** Which of the listed values an expression is exactly, if it is one of them. */
export function listedBy(expression: string | undefined, listed: unknown[]): string | undefined {
  const text = (expression ?? "").trim();
  const found = listed.find((one) => literalOf(one) === text);
  return found === undefined ? undefined : String(found);
}

/** What the step must hand its script, given what was chosen in its fields. */
export function grantsFor(
  spec: PickableNode,
  inputs: Record<string, string>,
): Record<string, string[]> | undefined {
  const grants: Record<string, string[]> = {};
  for (const [name, property] of Object.entries(spec.input.properties ?? {})) {
    const kind = property["x-pick"];
    const chosen = unquoted(inputs[name]);
    if (!kind || !chosen || !spec.takes.includes(kind)) continue;
    const field = GRANT_FIELD[kind];
    grants[field] = [...new Set([...(grants[field] ?? []), chosen])];
  }
  return Object.keys(grants).length > 0 ? grants : undefined;
}

/**
 * A step's `with` after its fields changed from `before` to `after`: only what the
 * changed picks granted is added or taken away. A grant written in code, or for a
 * field chosen by an expression, is left as it is.
 */
export function updateGrants(
  spec: PickableNode,
  current: unknown,
  before: Record<string, string>,
  after: Record<string, string>,
): Record<string, string[]> | undefined {
  const had = grantsFor(spec, before) ?? {};
  const has = grantsFor(spec, after) ?? {};
  const kept = (current && typeof current === "object" ? current : {}) as Record<string, unknown>;
  const next: Record<string, string[]> = {};
  for (const [field, list] of Object.entries(kept)) {
    if (Array.isArray(list)) next[field] = list.map(String);
  }
  for (const field of new Set([...Object.keys(had), ...Object.keys(has)])) {
    const gone = (had[field] ?? []).filter((one) => !(has[field] ?? []).includes(one));
    const merged = [...(next[field] ?? []), ...(has[field] ?? [])].filter(
      (one, at, all) => !gone.includes(one) && all.indexOf(one) === at,
    );
    next[field] = merged;
  }
  for (const field of Object.keys(next)) if ((next[field] ?? []).length === 0) delete next[field];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Fields chosen one at a time, as the one expression that gives the same input. */
export const wholeOf = (inputs: Record<string, string>): string =>
  `{${Object.entries(inputs)
    .map(([name, expression]) => `${quoted(name)}: ${expression}`)
    .join(", ")}}`;

/** The fields of a node's input that must be given and are not. */
export function missingInputs(spec: PickableNode, node: FlowNode): string[] {
  if (node.input !== undefined) return [];
  const inputs = (node.inputs as Record<string, string> | undefined) ?? {};
  return (spec.input.required ?? [])
    .filter((name) => !(inputs[name] ?? "").trim())
    .map((name) => spec.input.properties?.[name]?.title ?? name);
}

/** A step's input, one field at a time, drawn from the script's own schema. */
export function NodeInputs({
  node,
  spec,
  choices,
  onChange,
}: {
  node: FlowNode;
  spec: PickableNode;
  choices: Record<Picked, Option[]>;
  onChange: (change: Partial<FlowNode>) => void;
}) {
  const whole = node.input !== undefined;
  const inputs = (node.inputs as Record<string, string> | undefined) ?? {};
  const set = (name: string, expression: string | undefined) => {
    const next = { ...inputs };
    if (expression === undefined || expression === "") delete next[name];
    else next[name] = expression;
    onChange({ inputs: next, with: updateGrants(spec, node.with, inputs, next) });
  };
  const required = new Set(spec.input.required ?? []);
  return (
    <>
      {spec.description ? (
        <p className="m-0 text-body-sm text-ink-muted">{spec.description}</p>
      ) : null}
      <SelectField
        name="input-mode"
        label="Its input"
        value={whole ? "whole" : "fields"}
        options={[
          { value: "fields", label: "Field by field" },
          { value: "whole", label: "As one expression" },
        ]}
        onChange={(mode) =>
          onChange(
            mode === "whole"
              ? { input: wholeOf(inputs), inputs: undefined }
              : { input: undefined, inputs: {} },
          )
        }
      />
      {whole ? (
        <ExpressionField
          name="input"
          label="Input"
          rows={3}
          value={(node.input as string | undefined) ?? ""}
          hint="An expression that gives the whole input. What the step may reach stays as it was chosen field by field."
          onChange={(input) => onChange({ input })}
        />
      ) : (
        Object.entries(spec.input.properties ?? {}).map(([name, property]) => {
          const label = `${property.title ?? name}${required.has(name) ? "" : " (optional)"}`;
          const kind = property["x-pick"];
          if (kind) {
            return (
              <ComboboxField
                key={name}
                label={label}
                options={choices[kind]}
                value={unquoted(inputs[name])}
                hint={property.description}
                empty={`This workspace has no ${kind} yet.`}
                onChange={(value) => set(name, value === undefined ? undefined : quoted(value))}
              />
            );
          }
          const listed = property.enum ?? (property.type === "boolean" ? [true, false] : undefined);
          // An expression that is not one of the listed values is shown as the expression it is.
          if (listed && (!inputs[name] || listedBy(inputs[name], listed) !== undefined)) {
            const yesNo = property.enum === undefined;
            return (
              <SelectField
                key={name}
                name={`input-${name}`}
                label={label}
                value={listedBy(inputs[name], listed) ?? ""}
                options={[
                  {
                    value: "",
                    label:
                      property.default === undefined
                        ? "Not set"
                        : `Default: ${yesNo ? (property.default ? "Yes" : "No") : property.default}`,
                  },
                  ...listed.map((one) => ({
                    value: String(one),
                    label: yesNo ? (one ? "Yes" : "No") : String(one),
                  })),
                ]}
                {...(property.description ? { hint: property.description } : {})}
                onChange={(value) => {
                  const one = listed.find((each) => String(each) === value);
                  set(name, one === undefined ? undefined : literalOf(one));
                }}
              />
            );
          }
          const text = property.type === "string";
          return (
            <ExpressionField
              key={name}
              name={`input-${name}`}
              label={label}
              rows={text ? 1 : 2}
              value={inputs[name] ?? ""}
              placeholder={text ? "'text', or trigger.field" : "An expression"}
              hint={[property.description, text ? "An expression: put plain text in quotes." : ""]
                .filter(Boolean)
                .join(" ")}
              onChange={(value) => set(name, value)}
            />
          );
        })
      )}
    </>
  );
}

export interface WebhookTrigger {
  type: "webhook";
  input?: "body" | "request";
  respond?: "now" | "flow";
  source?: string;
  verify?: {
    scheme: string;
    header: string;
    secret: string;
    encoding?: string;
    prefix?: string;
  };
}

/** What a webhook hands the flow, how it is checked, and who answers the request. */
export function WebhookSettings({
  trigger,
  sources,
  secrets,
  onChange,
  canRespond = true,
}: {
  /** False for a webhook that starts a script: only a flow can answer its request. */
  canRespond?: boolean;
  trigger: WebhookTrigger;
  /** Trigger sources that take a webhook's requests. */
  sources: Option[];
  secrets: Option[];
  onChange: (trigger: WebhookTrigger) => void;
}) {
  const put = (change: Loose<WebhookTrigger>) => {
    const next = { ...trigger, ...change } as Record<string, unknown>;
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    onChange(next as unknown as WebhookTrigger);
  };
  const verify = trigger.verify;
  return (
    <>
      <SelectField
        name="webhook-input"
        label="The flow is given"
        value={trigger.input ?? "body"}
        options={[
          { value: "body", label: "The body of the request" },
          { value: "request", label: "The whole request, headers included" },
        ]}
        onChange={(input) => put({ input: input === "request" ? "request" : undefined })}
      />
      {canRespond ? (
        <SelectField
          name="webhook-respond"
          label="The request is answered"
          value={trigger.respond ?? "now"}
          options={[
            { value: "now", label: "At once, when the flow has started" },
            { value: "flow", label: "By the flow, with an Answer step" },
          ]}
          {...(trigger.respond === "flow"
            ? { hint: "The caller waits up to 25 seconds for an Answer step." }
            : {})}
          onChange={(respond) =>
            put({
              respond: respond === "flow" ? "flow" : undefined,
              ...(respond === "flow" ? { source: undefined } : {}),
            })
          }
        />
      ) : null}
      <SelectField
        name="webhook-check"
        label="Each request is checked"
        value={trigger.source ? "source" : verify ? "verify" : "none"}
        options={[
          { value: "none", label: "Not at all: the address is the secret" },
          { value: "verify", label: "By a signature in a header" },
          ...(sources.length > 0 || trigger.source
            ? [{ value: "source", label: "By a trigger source of your own" }]
            : []),
        ]}
        onChange={(check) =>
          put(
            check === "verify"
              ? {
                  source: undefined,
                  verify: { scheme: "hmac-sha256", header: "x-signature", secret: "" },
                }
              : check === "source"
                ? { verify: undefined, respond: undefined, source: sources[0]?.value ?? "" }
                : { verify: undefined, source: undefined },
          )
        }
      />
      {trigger.source !== undefined ? (
        <ComboboxField
          label="Trigger source"
          options={sources}
          value={trigger.source || undefined}
          hint="It is handed each request on a worker, and decides what starts."
          onChange={(source) => put({ source: source ?? "" })}
        />
      ) : null}
      {verify ? (
        <>
          <SelectField
            name="verify-scheme"
            label="Signature"
            value={verify.scheme}
            options={[
              { value: "hmac-sha256", label: "HMAC SHA-256" },
              { value: "hmac-sha1", label: "HMAC SHA-1" },
            ]}
            onChange={(scheme) => put({ verify: { ...verify, scheme } })}
          />
          <TextField
            name="verify-header"
            label="Header it is sent in"
            value={verify.header}
            onChange={(header) => put({ verify: { ...verify, header } })}
          />
          <ComboboxField
            label="Secret it was signed with"
            options={secrets}
            value={verify.secret || undefined}
            empty="This workspace has no secrets yet."
            onChange={(secret) => put({ verify: { ...verify, secret: secret ?? "" } })}
          />
          <SelectField
            name="verify-encoding"
            label="Written as"
            value={verify.encoding ?? "hex"}
            options={[
              { value: "hex", label: "Hex" },
              { value: "base64", label: "Base64" },
            ]}
            onChange={(encoding) => {
              const { encoding: _was, ...rest } = verify;
              put({ verify: encoding === "base64" ? { ...rest, encoding } : rest });
            }}
          />
          <TextField
            name="verify-prefix"
            label="Text before it (optional)"
            value={verify.prefix ?? ""}
            required={false}
            placeholder="sha256="
            onChange={(prefix) => {
              const { prefix: _was, ...rest } = verify;
              put({ verify: prefix ? { ...rest, prefix } : rest });
            }}
          />
        </>
      ) : null}
    </>
  );
}

export interface FormField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  help?: string;
  options?: string[];
}
export interface FormTrigger {
  type: "form";
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  success?: string;
  access?: "anyone" | "signed_in";
}

const FIELD_TYPES: Option[] = [
  { value: "text", label: "A line of text" },
  { value: "textarea", label: "Several lines" },
  { value: "email", label: "An email address" },
  { value: "number", label: "A number" },
  { value: "date", label: "A date" },
  { value: "select", label: "One of a list" },
  { value: "checkbox", label: "A checkbox" },
];

/** A name for a field made from its label: what the value is called in the flow. */
export function fieldName(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^[^a-z]+|_+$/g, "")
      .slice(0, 40) || "field";
  let name = base;
  for (let n = 2; taken.includes(name) || ["website", "key", "return"].includes(name); n++) {
    name = `${base}_${n}`;
  }
  return name;
}

const optionLines = (text: string) =>
  [...new Set(text.split("\n").map((line) => line.trim()))].filter(Boolean);

/**
 * A choice list, one to a line. What is typed stays as typed, so Enter and a space are
 * kept; the list the form takes is read from it on each key, and the text is tidied
 * when the field is left or when the list is changed from elsewhere (undo).
 */
function OptionsField({
  name,
  options,
  onChange,
}: {
  name: string;
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const [text, setText] = useState(options.join("\n"));
  useEffect(() => {
    setText((now) =>
      JSON.stringify(optionLines(now)) === JSON.stringify(options) ? now : options.join("\n"),
    );
  }, [options]);
  return (
    <TextAreaField
      name={name}
      label="The list, one to a line"
      rows={3}
      value={text}
      onChange={(next) => {
        setText(next);
        onChange(optionLines(next));
      }}
      onBlur={() => setText(optionLines(text).join("\n"))}
    />
  );
}

/** A new form trigger, with one field to begin from. */
export const newForm = (): FormTrigger => ({
  type: "form",
  title: "Tell us",
  fields: [{ name: "message", label: "Message", type: "textarea", required: true }],
});

/** The form a flow is started by: what it asks, and of whom. */
export function FormDesigner({
  trigger,
  onChange,
}: {
  trigger: FormTrigger;
  onChange: (trigger: FormTrigger) => void;
}) {
  const put = (change: Loose<FormTrigger>) => {
    const next = { ...trigger, ...change } as Record<string, unknown>;
    for (const key of Object.keys(next)) {
      if (next[key] === undefined || next[key] === "") delete next[key];
    }
    onChange({ title: "", ...next } as unknown as FormTrigger);
  };
  const field = (index: number, change: Partial<FormField>) =>
    put({
      fields: trigger.fields.map((one, at) => {
        if (at !== index) return one;
        const next = { ...one, ...change } as Record<string, unknown>;
        if (next.type !== "select") delete next.options;
        else if (!Array.isArray(next.options)) next.options = ["One", "Two"];
        for (const key of ["help", "required"]) if (!next[key]) delete next[key];
        return next as unknown as FormField;
      }),
    });
  // A field has no name of its own while it is being named: this one stays with it as it moves.
  const names = useKeys(trigger.fields.length);
  const asked = useFlip<HTMLFieldSetElement>(names.keys.join(" "));
  const move = (index: number, by: number) => {
    const fields = [...trigger.fields];
    const [taken] = fields.splice(index, 1);
    fields.splice(index + by, 0, taken as FormField);
    names.move(index, index + by);
    put({ fields });
  };
  return (
    <>
      <TextField
        name="form-title"
        label="Title of the form"
        value={trigger.title}
        onChange={(title) => put({ title })}
      />
      <TextAreaField
        name="form-description"
        label="Text under the title (optional)"
        rows={2}
        value={trigger.description ?? ""}
        required={false}
        onChange={(description) => put({ description })}
      />
      <fieldset ref={asked} className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="p-0 text-body-sm font-medium">What it asks</legend>
        {trigger.fields.map((one, index) => (
          <div
            key={names.keys[index]}
            data-flip-key={names.keys[index]}
            className="flex flex-col gap-2 rounded-control border border-line bg-canvas p-2"
          >
            <TextField
              name={`field-label-${index}`}
              label="Question"
              value={one.label}
              onChange={(label) => field(index, { label })}
            />
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                name={`field-type-${index}`}
                label="Answered with"
                value={one.type}
                options={FIELD_TYPES}
                onChange={(type) => field(index, { type })}
              />
              <TextField
                name={`field-name-${index}`}
                label="Called, in the flow"
                value={one.name}
                hint={`trigger.${one.name}`}
                error={
                  FORM_RESERVED_NAMES.includes(one.name)
                    ? `"${one.name}" is kept for the form itself. Choose another name.`
                    : undefined
                }
                onChange={(name) =>
                  field(index, { name: name.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
                }
              />
            </div>
            {one.type === "select" ? (
              <OptionsField
                name={`field-options-${index}`}
                options={one.options ?? []}
                onChange={(options) => field(index, { options })}
              />
            ) : null}
            <TextField
              name={`field-help-${index}`}
              label="A word of help (optional)"
              value={one.help ?? ""}
              required={false}
              onChange={(help) => field(index, { help })}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CheckboxField
                name={`field-required-${index}`}
                label="Must be answered"
                checked={one.required === true}
                onChange={(required) => field(index, { required })}
              />
              <span className="flex gap-1">
                <MoveButtons
                  label={one.label}
                  at={index}
                  count={trigger.fields.length}
                  onMove={(by) => move(index, by)}
                />
                <Button
                  size="small"
                  variant="danger"
                  disabled={trigger.fields.length === 1}
                  aria-label={`Remove ${one.label}`}
                  onClick={() => {
                    names.remove(index);
                    put({ fields: trigger.fields.filter((_, at) => at !== index) });
                  }}
                >
                  Remove
                </Button>
              </span>
            </div>
          </div>
        ))}
        <div>
          <Button
            size="small"
            disabled={trigger.fields.length >= 30}
            onClick={() =>
              put({
                fields: [
                  ...trigger.fields,
                  {
                    name: fieldName(
                      "question",
                      trigger.fields.map((one) => one.name),
                    ),
                    label: "Question",
                    type: "text",
                  },
                ],
              })
            }
          >
            Add a question
          </Button>
        </div>
      </fieldset>
      <TextField
        name="form-submit"
        label="What the button says (optional)"
        value={trigger.submitLabel ?? ""}
        required={false}
        placeholder="Send"
        onChange={(submitLabel) => put({ submitLabel })}
      />
      <TextAreaField
        name="form-success"
        label="What is shown once it was sent (optional)"
        rows={2}
        value={trigger.success ?? ""}
        required={false}
        placeholder="Thank you. Your answer was sent."
        onChange={(success) => put({ success })}
      />
      <SelectField
        name="form-access"
        label="Who may send it"
        value={trigger.access ?? "anyone"}
        options={[
          { value: "anyone", label: "Anyone with the address" },
          { value: "signed_in", label: "Only people signed in to the portal" },
        ]}
        onChange={(access) => put({ access: access === "signed_in" ? "signed_in" : undefined })}
      />
      <p className="m-0 text-body-sm text-ink-muted">
        The form gets an address of its own once the flow is deployed. It is shown with the
        workspace's triggers.
      </p>
    </>
  );
}

/** What a flow answers the request that started it with. */
export function RespondSettings({
  node,
  onChange,
  headers,
}: {
  node: FlowNode;
  onChange: (change: Partial<FlowNode>) => void;
  /** An editor for a set of named expressions. */
  headers: (
    values: Record<string, string>,
    onChange: (values: Record<string, string>) => void,
  ) => React.ReactNode;
}) {
  return (
    <>
      <NumberField
        name="respond-status"
        label="Status"
        value={(node.status as number | undefined) ?? 200}
        min={200}
        max={599}
        onChange={(status) =>
          onChange({ status: status === 200 ? undefined : (status ?? undefined) })
        }
      />
      <ExpressionField
        name="respond-body"
        label="Body"
        rows={3}
        value={(node.body as string | undefined) ?? ""}
        hint="An expression. An object or a list is sent as JSON, and text as it is."
        onChange={(body) => onChange({ body: body === "" ? undefined : body })}
      />
      {headers((node.headers as Record<string, string> | undefined) ?? {}, (values) =>
        onChange({ headers: Object.keys(values).length > 0 ? values : undefined }),
      )}
      <p className="m-0 text-body-sm text-ink-muted">
        This answers a webhook whose request is answered by the flow. The first Answer step to run
        is the answer, and the flow carries on after it.
      </p>
    </>
  );
}
