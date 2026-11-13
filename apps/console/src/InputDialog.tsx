import {
  Button,
  Dialog,
  Form,
  type FormSchema,
  Notice,
  type TabItem,
  Tabs,
  TextAreaField,
} from "@vynxlabs/ui";
import { useState } from "react";
import { failureText } from "./ask.tsx";

const SIMPLE = new Set(["string", "number", "integer", "boolean"]);

/** The schema as the kit's form can draw it, or nothing when it has parts the form cannot. */
export function formSchema(schema: Record<string, unknown> | undefined): FormSchema | undefined {
  if (schema?.type !== "object") return undefined;
  const properties = schema.properties as Record<string, { type?: unknown }> | undefined;
  if (!properties || Object.keys(properties).length === 0) return undefined;
  for (const property of Object.values(properties)) {
    if (typeof property.type !== "string" || !SIMPLE.has(property.type)) return undefined;
  }
  return schema as unknown as FormSchema;
}

/**
 * Asks for the input of a script or a flow: as a form when its schema is a
 * flat list of fields, and always as JSON for everything else.
 */
export function InputDialog({
  open,
  onClose,
  title,
  action,
  schema,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The button that starts it: "Run", "Start flow". */
  action: string;
  schema?: Record<string, unknown> | undefined;
  onSubmit: (input: unknown) => Promise<void>;
}) {
  const fields = formSchema(schema);
  const [text, setText] = useState("{}");
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  const send = async (input: unknown) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await onSubmit(input);
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  const json = (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        let input: unknown;
        try {
          input = JSON.parse(text);
        } catch {
          setProblem("That is not valid JSON.");
          return;
        }
        void send(input);
      }}
    >
      <TextAreaField name="input" label="Input, as JSON" value={text} rows={8} onChange={setText} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {action}
        </Button>
      </div>
    </form>
  );

  const tabs: TabItem[] = fields
    ? [
        {
          id: "form",
          label: "Form",
          content: (
            <Form schema={fields} submitLabel={action} disabled={busy} onSubmit={(v) => send(v)} />
          ),
        },
        { id: "json", label: "JSON", content: json },
      ]
    : [];

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {fields ? <Tabs label="How to give the input" tabs={tabs} /> : json}
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
      </div>
    </Dialog>
  );
}
