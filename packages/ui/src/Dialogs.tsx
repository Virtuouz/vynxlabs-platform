import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "./Button.tsx";
import { Dialog } from "./Dialog.tsx";
import { TextAreaField, TextField } from "./Fields.tsx";

export interface ConfirmOptions {
  title: string;
  /** What will happen, in a sentence or two. */
  text?: ReactNode;
  /** The button that goes ahead. Name the action: "Delete", not "OK". */
  action?: string;
  cancel?: string;
  /** Marks an action that cannot be undone. */
  danger?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
  label: string;
  hint?: string;
  initial?: string;
  placeholder?: string;
  /** Refuses an empty answer. On by default. */
  required?: boolean;
  multiline?: boolean;
}

export interface TypeToConfirmOptions extends ConfirmOptions {
  /** What has to be typed, exactly, before the action is offered. */
  expected: string;
}

export interface Dialogs {
  /** Asks a yes or no question. Resolves to whether the person went ahead. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Asks for one line or one block of text. Resolves to it, or to `null` when canceled. */
  prompt: (options: PromptOptions) => Promise<string | null>;
  /** Asks the person to type a name before something is destroyed. */
  typeToConfirm: (options: TypeToConfirmOptions) => Promise<boolean>;
}

type Asked =
  | { kind: "confirm"; options: ConfirmOptions; answer: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; answer: (value: string | null) => void }
  | { kind: "type"; options: TypeToConfirmOptions; answer: (value: boolean) => void };

const DialogsContext = createContext<Dialogs | undefined>(undefined);

/**
 * Holds the questions an app asks before it acts: a confirmation, a short
 * answer, a name typed out before something is destroyed. Put one around the
 * app and ask through `useDialogs`. They take the place of the browser's own
 * `confirm`, `prompt` and `alert`, which cannot be styled, block the page,
 * and are switched off in some embedded browsers.
 */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [asked, setAsked] = useState<Asked>();
  const [text, setText] = useState("");
  const current = useRef<Asked | undefined>(undefined);

  const ask = useCallback((next: Asked) => {
    // A second question while one is open cancels the first.
    const before = current.current;
    if (before) before.kind === "prompt" ? before.answer(null) : before.answer(false);
    current.current = next;
    setText(next.kind === "prompt" ? (next.options.initial ?? "") : "");
    setAsked(next);
  }, []);

  const dialogs = useMemo<Dialogs>(
    () => ({
      confirm: (options) => new Promise((answer) => ask({ kind: "confirm", options, answer })),
      prompt: (options) => new Promise((answer) => ask({ kind: "prompt", options, answer })),
      typeToConfirm: (options) => new Promise((answer) => ask({ kind: "type", options, answer })),
    }),
    [ask],
  );

  const close = (went: boolean) => {
    const open = current.current;
    if (!open) return;
    current.current = undefined;
    setAsked(undefined);
    if (open.kind === "prompt") open.answer(went ? text : null);
    else open.answer(went);
  };

  const options = asked?.options;
  const required = asked?.kind === "prompt" ? (asked.options.required ?? true) : false;
  const ready =
    asked?.kind === "type"
      ? text === asked.options.expected
      : asked?.kind === "prompt"
        ? !required || text.trim() !== ""
        : true;

  return (
    <DialogsContext.Provider value={dialogs}>
      {children}
      <Dialog open={asked !== undefined} onClose={() => close(false)} title={options?.title ?? ""}>
        {asked ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) close(true);
            }}
          >
            {options?.text ? <div className="text-ink-muted">{options.text}</div> : null}
            {asked.kind === "prompt" ? (
              asked.options.multiline ? (
                <TextAreaField
                  name="answer"
                  label={asked.options.label}
                  value={text}
                  rows={4}
                  {...(asked.options.hint ? { hint: asked.options.hint } : {})}
                  {...(asked.options.placeholder ? { placeholder: asked.options.placeholder } : {})}
                  onChange={setText}
                />
              ) : (
                <TextField
                  name="answer"
                  label={asked.options.label}
                  value={text}
                  required={required}
                  {...(asked.options.hint ? { hint: asked.options.hint } : {})}
                  {...(asked.options.placeholder ? { placeholder: asked.options.placeholder } : {})}
                  onChange={setText}
                />
              )
            ) : null}
            {asked.kind === "type" ? (
              <TextField
                name="answer"
                label={`Type ${asked.options.expected} to confirm`}
                value={text}
                autoComplete="off"
                onChange={setText}
              />
            ) : null}
            <div className="flex justify-end gap-2">
              <Button onClick={() => close(false)}>{options?.cancel ?? "Cancel"}</Button>
              <Button
                type="submit"
                variant={options?.danger ? "danger-solid" : "primary"}
                disabled={!ready}
              >
                {options?.action ?? "Continue"}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </DialogsContext.Provider>
  );
}

/** The way to ask a question from anywhere under a `DialogsProvider`. */
export function useDialogs(): Dialogs {
  const dialogs = useContext(DialogsContext);
  if (!dialogs) throw new Error("useDialogs needs a DialogsProvider above it.");
  return dialogs;
}
