import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "plain" | "success" | "danger";

export interface ToastOptions {
  /** Something to do about what just happened, such as Undo. Pressing it also closes the toast. */
  action?: { label: string; onClick: () => void };
}

export interface Toasts {
  /** Shows a message. Returns its ID, for `dismiss`. */
  show: (message: string, tone?: ToastTone, options?: ToastOptions) => number;
  success: (message: string, options?: ToastOptions) => number;
  /** A failure. It stays until it is dismissed, so it can be read at any pace. */
  danger: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const tones: Record<ToastTone, string> = {
  plain: "border-line bg-surface",
  success: "border-success/40 bg-success-soft",
  danger: "border-danger/40 bg-danger-soft",
};

interface Shown {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastOptions["action"];
}

const ToastContext = createContext<Toasts | undefined>(undefined);

/**
 * Holds the short messages that confirm what just happened, in a corner of
 * the page. Put one around the app.
 *
 * A message leaves by itself, except a failure, which stays until dismissed.
 * Pointing at the messages, or moving focus into them, holds them until the
 * pointer or focus leaves. Each is read out by screen readers once.
 */
export function ToastProvider({
  duration = 5000,
  children,
}: {
  /** How long a message stays, in milliseconds. A message with an action stays twice as long. */
  duration?: number;
  children: ReactNode;
}) {
  const [shown, setShown] = useState<Shown[]>([]);
  // The messages on screen, kept here as well so that `show` can look at them as it is called.
  const list = useRef<Shown[]>([]);
  const commit = useCallback((next: Shown[]) => {
    list.current = next;
    setShown(next);
  }, []);
  const next = useRef(1);
  // Each timed message: when it is due to leave, or how long it has left while held.
  const timers = useRef(
    new Map<
      number,
      { timer: ReturnType<typeof setTimeout> | undefined; due: number; left: number }
    >(),
  );
  const held = useRef(false);

  const dismiss = useCallback(
    (id: number) => {
      clearTimeout(timers.current.get(id)?.timer);
      timers.current.delete(id);
      commit(list.current.filter((toast) => toast.id !== id));
    },
    [commit],
  );

  const start = useCallback(
    (id: number, ms: number) => {
      timers.current.set(id, {
        timer: held.current ? undefined : setTimeout(() => dismiss(id), ms),
        due: Date.now() + ms,
        left: ms,
      });
    },
    [dismiss],
  );

  const toasts = useMemo<Toasts>(() => {
    const show = (message: string, tone: ToastTone = "plain", options: ToastOptions = {}) => {
      // The same message again replaces the one shown rather than stacking a copy. It is
      // a new element, so a screen reader says it again.
      const twin = list.current.find((toast) => toast.message === message && toast.tone === tone);
      if (twin) {
        clearTimeout(timers.current.get(twin.id)?.timer);
        timers.current.delete(twin.id);
      }
      const id = next.current++;
      const toast = { id, message, tone, ...(options.action ? { action: options.action } : {}) };
      commit([...list.current.filter((one) => one !== twin), toast]);
      if (tone !== "danger") start(id, options.action ? duration * 2 : duration);
      return id;
    };
    return {
      show,
      success: (message, options) => show(message, "success", options),
      danger: (message, options) => show(message, "danger", options),
      dismiss,
    };
  }, [commit, dismiss, duration, start]);

  /** Holds every timed message while the pointer or focus is on them. */
  const hold = useCallback(() => {
    if (held.current) return;
    held.current = true;
    const now = Date.now();
    for (const entry of timers.current.values()) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
      entry.left = Math.max(entry.due - now, 0);
    }
  }, []);
  const release = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    const now = Date.now();
    for (const [id, entry] of timers.current) {
      entry.due = now + entry.left;
      entry.timer = setTimeout(() => dismiss(id), entry.left);
    }
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const entry of pending.values()) clearTimeout(entry.timer);
    };
  }, []);

  const card = (toast: Shown) => (
    <div
      key={toast.id}
      role={toast.tone === "danger" ? "alert" : undefined}
      data-tone={toast.tone}
      className={`pointer-events-auto flex max-w-full items-center gap-3 rounded-control border px-3 py-2 text-ink shadow-lg sm:max-w-96 ${tones[toast.tone]}`}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className="shrink-0 rounded-[4px] px-1.5 py-0.5 font-medium text-action hover:bg-action-soft"
          onClick={() => {
            toast.action?.onClick();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 rounded-[4px] px-1 text-ink-muted hover:text-ink"
        onClick={() => dismiss(toast.id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );

  return (
    <ToastContext.Provider value={toasts}>
      {children}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: holding the messages while they are pointed at is not an action */}
      <div
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-[80] flex flex-col items-end gap-2"
        onMouseEnter={hold}
        onMouseLeave={release}
        onFocus={hold}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) release();
        }}
      >
        {/*
         * Both lists are always on the page, so what is added to them is read out once, as it
         * appears: the others politely, a failure as an alert. The text is never in the page twice.
         */}
        <div aria-live="polite" className="flex flex-col items-end gap-2">
          {shown.filter((toast) => toast.tone !== "danger").map(card)}
        </div>
        <div className="flex flex-col items-end gap-2">
          {shown.filter((toast) => toast.tone === "danger").map(card)}
        </div>
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
