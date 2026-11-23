import { QueryClientProvider } from "@tanstack/react-query";
import { isErrorCode } from "@volvel/manifest";
import {
  type Dialogs,
  DialogsProvider,
  type ToastOptions,
  ToastProvider,
  type Toasts,
  TooltipProvider,
  setFailureExplainer,
  useDialogs,
  useToast,
} from "@volvel/ui";
import { type ReactNode, useState } from "react";
import { ApiError, makeQueryClient, setActiveClient } from "./api.ts";
import { openHelp } from "./help/store.ts";
import { navigate, setLeaveQuestion } from "./router.tsx";

let dialogs: Dialogs | undefined;
let toasts: Toasts | undefined;

// Leaving a page with unsaved changes is asked in the console's own dialog.
setLeaveQuestion((message) =>
  dialogs
    ? dialogs.confirm({
        title: "Leave without saving?",
        text: message,
        action: "Leave",
        cancel: "Stay",
        danger: true,
      })
    : Promise.resolve(true),
);

function Bridge() {
  dialogs = useDialogs();
  toasts = useToast();
  return null;
}

/**
 * Puts the console's dialogs and toasts around a screen. Row actions and
 * other handlers that are not components reach them through `ask` and
 * `notify`, so a screen never falls back on the browser's own dialogs.
 */
export function Providers({ children }: { children: ReactNode }) {
  // One cache for this page, made once. A test that draws a screen gets a fresh one.
  const [client] = useState(makeQueryClient);
  setActiveClient(client);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider navigate={navigate}>
        <TooltipProvider>
          <DialogsProvider>
            <Bridge />
            {children}
          </DialogsProvider>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function need<T>(value: T | undefined): T {
  if (!value) throw new Error("The console's Providers are not on the page.");
  return value;
}

/** Asks before acting. Each resolves when the person answers. */
export const ask: Dialogs = {
  confirm: (options) => need(dialogs).confirm(options),
  prompt: (options) => need(dialogs).prompt(options),
  typeToConfirm: (options) => need(dialogs).typeToConfirm(options),
};

/**
 * What an error says to a person: its message, each field it names, and the
 * server's request ID, which whoever runs the instance can look up.
 */
export function failureText(error: unknown): string {
  const said = failureWords(error);
  if (error instanceof ApiError && isErrorCode(error.code)) explainable.set(said, error.code);
  // A short list: only what was just shown can be asked about.
  if (explainable.size > 40) explainable.delete(explainable.keys().next().value as string);
  return said;
}

/** The code of each failure whose words were just made, so a notice of those words can lead to what the code means. */
const explainable = new Map<string, string>();

// A failure shown inside a dialog says the same as the one a toast would, and leads on in the same way.
setFailureExplainer((words) => {
  const code = explainable.get(words);
  return code
    ? { label: "What does this mean?", onClick: () => openHelp(`errors#${code}`) }
    : undefined;
});

function failureWords(error: unknown): string {
  // Whatever was thrown (a string, an object with no message, nothing at all), a person is told something.
  if (typeof error === "string" && error.trim()) return error.trim();
  const failure = (error ?? {}) as Partial<ApiError> & Error;
  const fields = (failure.fields ?? []).map((field) =>
    field.path ? `${field.path}: ${field.message}` : field.message,
  );
  const id = failure.requestId ? `Request ID ${failure.requestId}.` : "";
  const said = [failure.message, ...fields, id].filter(Boolean).join(" ").trim();
  return said || "Something went wrong, and nothing more is known. Try again.";
}

/**
 * For a create the server refused because the path is held: the sentence for the path
 * field, which keeps what was typed. Nothing for any other failure.
 */
export function takenText(error: unknown): string | undefined {
  return (error as Partial<ApiError> | undefined)?.code === "path_taken"
    ? "Something already exists at this path. Choose another, or open that one."
    : undefined;
}

/** Says what just happened, in a corner of the page. */
/**
 * For a failure the API gave a code for: the way to what the code means and
 * what to do about it, in the help. A toast that already offers something to
 * do keeps its own.
 */
function explained(error: unknown): ToastOptions {
  if (!(error instanceof ApiError) || !isErrorCode(error.code)) return {};
  const code = error.code;
  return {
    action: { label: "What does this mean?", onClick: () => openHelp(`errors#${code}`) },
  };
}

/** Whether a change was asked for and waits for a second person: nothing failed and nothing changed yet. */
export function isWaiting(error: unknown): boolean {
  return error instanceof ApiError && error.code === "awaiting_approval";
}

/**
 * Says that a change waits, in a toast that leads to Access changes. For a dialog that asked for a
 * change: when this returns true the dialog is done and closes, and asking again would only
 * make a second waiting access change. Returns false for any other error, which the dialog shows.
 */
export function noteWaiting(error: unknown): boolean {
  if (!isWaiting(error)) return false;
  const tenant = /^\/t\/([^/]+)/.exec(window.location.pathname)?.[1];
  need(toasts).info(failureText(error), {
    title: "Waits for approval",
    ...(tenant ? { link: { label: "Open Access changes", href: `/t/${tenant}/releases` } } : {}),
  });
  return true;
}

export const notify = {
  /** What was done, naming the result. A link leads to it, such as the thing just made. */
  success: (message: string, options?: ToastOptions) => need(toasts).success(message, options),
  info: (message: string, options?: ToastOptions) => need(toasts).info(message, options),
  error: (error: unknown, options?: ToastOptions) =>
    noteWaiting(error)
      ? 0
      : need(toasts).danger(failureText(error), { ...explained(error), ...options }),
};

/** Puts text on the clipboard and says so. */
export async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(done);
  } catch {
    notify.error(new Error("The clipboard could not be reached. Copy it from the page instead."));
  }
}
