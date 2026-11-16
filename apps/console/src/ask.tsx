import { QueryClientProvider } from "@tanstack/react-query";
import {
  type Dialogs,
  DialogsProvider,
  type ToastOptions,
  ToastProvider,
  type Toasts,
  useDialogs,
  useToast,
} from "@vynxlabs/ui";
import { type ReactNode, useState } from "react";
import { type ApiError, makeQueryClient, setActiveClient } from "./api.ts";
import { setLeaveQuestion } from "./router.tsx";

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
      <ToastProvider>
        <DialogsProvider>
          <Bridge />
          {children}
        </DialogsProvider>
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
  success: (message: string, options?: ToastOptions) => need(toasts).success(message, options),
  error: (error: unknown) => need(toasts).danger(failureText(error)),
};
