import { type ComponentChildren, createContext } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";

export type ToastTone = "plain" | "success" | "danger";

export interface Toasts {
  /** Shows a message. Returns its ID, for `dismiss`. */
  show: (message: string, tone?: ToastTone) => number;
  success: (message: string) => number;
  danger: (message: string) => number;
  dismiss: (id: number) => void;
}

const tones: Record<ToastTone, string> = {
  plain: "border-line bg-surface",
  success: "border-success/40 bg-success-soft",
  danger: "border-danger/40 bg-danger-soft",
};

const ToastContext = createContext<Toasts | undefined>(undefined);

/**
 * Holds the short messages that confirm what just happened, in a corner of
 * the page. Put one around the app. Each message leaves by itself.
 */
export function ToastProvider({
  duration = 5000,
  children,
}: {
  /** How long a message stays, in milliseconds. */
  duration?: number;
  children: ComponentChildren;
}) {
  const [shown, setShown] = useState<{ id: number; message: string; tone: ToastTone }[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setShown((toasts) => toasts.filter((toast) => toast.id !== id));
  }, []);

  const toasts = useMemo<Toasts>(() => {
    const show = (message: string, tone: ToastTone = "plain") => {
      const id = next.current++;
      setShown((toasts) => [...toasts, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    };
    return {
      show,
      success: (message) => show(message, "success"),
      danger: (message) => show(message, "danger"),
      dismiss,
    };
  }, [dismiss, duration]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <ToastContext.Provider value={toasts}>
      {children}
      <div class="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2">
        {shown.map((toast) => (
          <div
            key={toast.id}
            role="status"
            class={`pointer-events-auto flex max-w-full items-center gap-3 rounded-control border px-3 py-2 text-ink shadow-lg sm:max-w-96 ${tones[toast.tone]}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              class="rounded-[4px] px-1 text-ink-muted hover:text-ink"
              onClick={() => dismiss(toast.id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** The way to show a toast from anywhere under a `ToastProvider`. */
export function useToast(): Toasts {
  const toasts = useContext(ToastContext);
  if (!toasts) throw new Error("useToast needs a ToastProvider above it.");
  return toasts;
}
