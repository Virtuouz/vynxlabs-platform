/**
 * Form's Display tab (board 16, right): the fields with what each requires, then the two
 * buttons' words: what Submit says, and what happens after saving. The submit's steps are the
 * Actions tab's; "After saving" edits only the closing and the notice at the end of them.
 */
import type { Action, Step } from "@volvel/manifest";
import { DrawerRow, TextField, ToggleRow } from "@volvel/ui";
import { Check, MousePointerClick } from "lucide-react";
import { FieldsList } from "./fieldsList.tsx";
import { type Env, Group, setConfig } from "./recordShared.tsx";

const NOTE =
  "Required and checks come from the table. Click a field for its label, help text and when to show it.";

/** What the submit does at the end of its steps: whether it closes, and what it says. */
export function afterSaving(submit: Action | undefined): { close: boolean; say: string } {
  const steps = submit?.steps ?? [];
  const say = steps.find((one): one is Extract<Step, { do: "message" }> => one.do === "message");
  return { close: steps.some((one) => one.do === "close"), say: say?.text ?? "" };
}

/**
 * The submit with its closing and its notice set. The steps stay where they are: the close and the
 * first message are changed or taken away in place; one that is not there yet is added before the
 * first step that opens a page (so a close never closes the page just opened), else at the end.
 */
export function withAfterSaving(
  submit: Action | undefined,
  next: { close: boolean; say: string },
): Action {
  let steps: Step[] = [...(submit?.steps ?? [])];
  const at = steps.findIndex((one) => one.do === "message");
  if (!next.say.trim()) {
    if (at >= 0) steps.splice(at, 1);
  } else if (at >= 0) {
    steps[at] = { ...(steps[at] as Extract<Step, { do: "message" }>), text: next.say };
  }
  const has = steps.some((one) => one.do === "close");
  if (!next.close) steps = steps.filter((one) => one.do !== "close");
  const adding: Step[] = [];
  if (next.say.trim() && at < 0) adding.push({ do: "message", text: next.say, tone: "success" });
  if (next.close && !has) adding.push({ do: "close" });
  if (adding.length > 0) {
    const open = steps.findIndex((one) => one.do === "open");
    steps.splice(open >= 0 ? open : steps.length, 0, ...adding);
  }
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
      <Group label="Buttons">
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
      </Group>
    </>
  );
}
