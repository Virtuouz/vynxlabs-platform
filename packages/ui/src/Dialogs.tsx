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
  /** Things the question is about, each with a way to go and see it. Going closes the question as "no". */
  links?: { label: string; onSelect: () => void }[];
}

export interface PromptOptions extends ConfirmOptions {
  label: string;
  hint?: string;
  initial?: string;
  placeholder?: string;
  /** Refuses an empty answer. On by default. */
  required?: boolean;
  multiline?: boolean;
  /** The most characters the field takes. */
  maxLength?: number;
  /**
   * Does what the answer is for, before the dialog closes. It resolves to a sentence to show
   * on the field, which keeps what was typed, or to nothing when it went through.
   */
  submit?: (value: string) => Promise<string | undefined>;
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
  const [fieldError, setFieldError] = useState<string>();
  const [working, setWorking] = useState(false);
  const current = useRef<Asked | undefined>(undefined);

  const ask = useCallback((next: Asked) => {
    // A second question while one is open cancels the first.
    const before = current.current;
    if (before) before.kind === "prompt" ? before.answer(null) : before.answer(false);
    current.current = next;
    setText(next.kind === "prompt" ? (next.options.initial ?? "") : "");
    setFieldError(undefined);
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
              if (!ready || working) return;
              const submit = asked.kind === "prompt" ? asked.options.submit : undefined;
              if (!submit) return close(true);
              setWorking(true);
              setFieldError(undefined);
              submit(text)
                .then((refused) => (refused ? setFieldError(refused) : close(true)))
                // A failure that was not foreseen is said on the field too, keeping what was typed.
                .catch((caught: unknown) =>
                  setFieldError(caught instanceof Error ? caught.message : String(caught)),
                )
                .finally(() => setWorking(false));
            }}
          >
            {options?.text ? <div className="text-ink-muted">{options.text}</div> : null}
            {options?.links && options.links.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
                {options.links.map((one) => (
                  <li key={one.label} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-ink">{one.label}</span>
                    <button
                      type="button"
                      aria-label={`Show ${one.label}`}
                      className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-meta text-action underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                      onClick={() => {
                        close(false);
                        one.onSelect();
                      }}
                    >
                      Show it
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
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
                  {...(asked.options.maxLength ? { maxLength: asked.options.maxLength } : {})}
                  {...(fieldError ? { error: fieldError } : {})}
                  {...(asked.options.hint ? { hint: asked.options.hint } : {})}
                  {...(asked.options.placeholder ? { placeholder: asked.options.placeholder } : {})}
                  onChange={(value) => {
                    setFieldError(undefined);
                    setText(value);
                  }}
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
              {/* A question with nothing to type starts on the safe answer: the main button, or Cancel when it destroys. */}
              <Button
                onClick={() => close(false)}
                {...(asked.kind === "confirm" && options?.danger ? { "data-autofocus": "" } : {})}
              >
                {options?.cancel ?? "Cancel"}
              </Button>
              <Button
                type="submit"
                {...(asked.kind === "confirm" && !options?.danger ? { "data-autofocus": "" } : {})}
                variant={options?.danger ? "danger-solid" : "primary"}
                disabled={!ready}
                loading={working}
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
