/**
 * Form's Display tab (board 16, right): the fields with what each requires, then the two
 * buttons' words: what Submit says, and what happens after saving. The submit's steps are the
 * Actions tab's; "After saving" edits only the closing and the notice at the end of them.
 */
import type { Action, Step } from "@volvel/manifest";
import { DrawerGroup, DrawerRow, TextField, ToggleRow } from "@volvel/ui";
import { Check, MousePointerClick } from "lucide-react";
import { FieldsList } from "./fieldsList.tsx";
import { type Env, setConfig } from "./shared.tsx";

const NOTE =
  "Required and checks come from the table. Click a field for its label, help text and when to show it.";

/** What the submit does at the end of its steps: whether it closes, and what it says. */
export function afterSaving(submit: Action | undefined): { close: boolean; say: string } {
  const steps = submit?.steps ?? [];
  const say = steps.find((one): one is Extract<Step, { do: "message" }> => one.do === "message");
  return { close: steps.some((one) => one.do === "close"), say: say?.text ?? "" };
}

/** The submit with its closing and its notice set; the steps before them are kept. */
export function withAfterSaving(
  submit: Action | undefined,
  next: { close: boolean; say: string },
): Action {
  const kept = (submit?.steps ?? []).filter((one) => one.do !== "close" && one.do !== "message");
  const steps: Step[] = [...kept];
  if (next.say.trim()) steps.push({ do: "message", text: next.say, tone: "success" });
  if (next.close) steps.push({ do: "close" });
  return { ...(submit ?? { steps: [] }), steps };
}

export function afterWords(submit: Action | undefined): string {
  const { close, say } = afterSaving(submit);
  const parts = [close ? "Close" : undefined, say ? `say “${say}”` : undefined].filter(
    (one): one is string => one !== undefined,
  );
  if (parts.length === 0) return "Nothing more";
  const text = parts.join(" and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function FormDisplaySection({ env }: { env: Env }) {
  const submit = env.config.submit as Action | undefined;
  const after = afterSaving(submit);
  const label = typeof env.config.submitLabel === "string" ? env.config.submitLabel : "Save";
  const write = (next: { close: boolean; say: string }) =>
    setConfig(env, "submit", withAfterSaving(submit, next), "what happens after saving", true);
  return (
    <>
      <FieldsList env={env} kind="form" note={() => NOTE} />
      <DrawerGroup label="Buttons">
        <DrawerRow
          label="Submit says"
          icon={MousePointerClick}
          value={label}
          editorTitle="The button says"
          editorFooter={false}
          editor={
            <TextField
              name={`${env.widget.id}-submit-label`}
              label="Submit says"
              required={false}
              value={label}
              maxLength={40}
              onChange={(text) => setConfig(env, "submitLabel", text, "what submit says", true)}
            />
          }
        />
        <DrawerRow
          label="After saving"
          icon={Check}
          value={afterWords(submit)}
          editorTitle="After saving"
          editorFooter={false}
          editor={
            <div className="flex flex-col gap-3">
              <ToggleRow
                label="Close the sheet or dialog"
                checked={after.close}
                onChange={(close) => write({ ...after, close })}
              />
              <TextField
                name={`${env.widget.id}-after-say`}
                label="Say"
                hint="A notice, when it is saved."
                required={false}
                value={after.say}
                maxLength={120}
                onChange={(say) => write({ ...after, say })}
              />
            </div>
          }
        />
      </DrawerGroup>
    </>
  );
}
