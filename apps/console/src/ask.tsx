import {
  type Dialogs,
  DialogsProvider,
  ToastProvider,
  type Toasts,
  useDialogs,
  useToast,
} from "@vynxlabs/ui";
import type { ReactNode } from "react";
import type { ApiError } from "./api.ts";

let dialogs: Dialogs | undefined;
let toasts: Toasts | undefined;

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
  return (
    <ToastProvider>
      <DialogsProvider>
        <Bridge />
        {children}
      </DialogsProvider>
    </ToastProvider>
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

/** What an error says to a person: its message, then each field it names. */
export function failureText(error: unknown): string {
  const failure = error as Partial<ApiError> & Error;
  const fields = (failure.fields ?? []).map((field) =>
    field.path ? `${field.path}: ${field.message}` : field.message,
  );
  return [failure.message, ...fields].join(" ");
}

/** Says what just happened, in a corner of the page. */
export const notify = {
  success: (message: string) => need(toasts).success(message),
  error: (error: unknown) => need(toasts).danger(failureText(error)),
};
