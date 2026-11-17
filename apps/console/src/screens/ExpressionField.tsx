import { TextAreaField, TextField } from "@vynxlabs/ui";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { failureText } from "../ask.tsx";

/** How long after the last key the value is asked for. */
export const PREVIEW_DELAY_MS = 400;
/** How much of a value is shown under its field. */
const SHOWN = 160;

/**
 * Where a flow editor's expressions are worked out: against a test run, or
 * the newest run of the flow. `version` changes when that run does.
 */
export interface PreviewSource {
  root: string;
  flowRun?: string | undefined;
  flow?: string | undefined;
  version: string;
}
export const ExpressionPreview = createContext<PreviewSource | null>(null);

interface Answer {
  value?: unknown;
  error?: string;
  note?: string;
  flowRun: { id: string } | null;
}

/** A value as one short line of JSON. */
export function shortJson(value: unknown): string {
  const text = JSON.stringify(value) ?? "null";
  return text.length > SHOWN ? `${text.slice(0, SHOWN - 1)}…` : text;
}

/**
 * A field that holds a CEL expression, with what it gives under it: worked
 * out against the editor's last test run, as the run would have, a moment
 * after typing stops.
 */
export function ExpressionField({
  name,
  label,
  value,
  onChange,
  hint,
  placeholder,
  rows,
  condition,
  items,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  placeholder?: string | undefined;
  /** Several lines; one when left out. */
  rows?: number | undefined;
  /** It must give true or false, as a branch's case must. */
  condition?: boolean | undefined;
  /** A foreach's items: this expression sees the first of them as `item`. */
  items?: string | undefined;
}) {
  const source = useContext(ExpressionPreview);
  const [answer, setAnswer] = useState<Answer>();
  const asked = useRef(0);
  const expression = value.trim();

  // biome-ignore lint/correctness/useExhaustiveDependencies: asked again when the run it is worked out against changes, not the object around it
  useEffect(() => {
    if (!source || expression === "" || (!source.flowRun && !source.flow)) {
      setAnswer(undefined);
      return;
    }
    const mine = ++asked.current;
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ expression });
      if (source.flowRun) query.set("flowRun", source.flowRun);
      else if (source.flow) query.set("flow", source.flow);
      if (items?.trim()) query.set("items", items.trim());
      try {
        const said = await api.get<Answer>(`${source.root}/expressions/value?${query}`);
        // Only the answer to the latest question is shown.
        if (mine === asked.current) setAnswer(said);
      } catch (error) {
        if (mine === asked.current) setAnswer({ error: failureText(error), flowRun: null });
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [source?.root, source?.flowRun, source?.flow, source?.version, expression, items]);

  const props = {
    name,
    label,
    value,
    onChange,
    ...(hint ? { hint } : {}),
    ...(placeholder ? { placeholder } : {}),
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {rows ? <TextAreaField {...props} rows={rows} required={false} /> : <TextField {...props} />}
      <Preview answer={answer} condition={condition === true} />
    </div>
  );
}

function Preview({ answer, condition }: { answer: Answer | undefined; condition: boolean }) {
  if (!answer) return null;
  const line = "m-0 min-w-0 break-words font-mono text-code-sm";
  if (answer.error) {
    return (
      <p className={`${line} text-danger`} role="status">
        {answer.error}
      </p>
    );
  }
  if (!("value" in answer)) {
    return answer.note ? (
      <p className="m-0 text-meta text-ink-subtle" role="status">
        {answer.note}
      </p>
    ) : null;
  }
  const notBoolean = condition && typeof answer.value !== "boolean";
  return (
    <p className={`${line} ${notBoolean ? "text-danger" : "text-ink-muted"}`} role="status">
      <span className="font-sans text-ink-subtle">Gives </span>
      {shortJson(answer.value)}
      {notBoolean ? <span className="font-sans"> — a case must give true or false.</span> : null}
      {answer.note ? <span className="font-sans text-ink-subtle"> {answer.note}</span> : null}
    </p>
  );
}
