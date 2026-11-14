import { RunError, runScript, table } from "@vynxlabs/app";
import { Badge, type BadgeTone } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
// Types only: none of the repository's server code reaches the browser.
import type {
  appointments,
  clients,
  clinics,
  inventory,
  invoices,
  pets,
  registrations,
} from "../../src/model.ts";

/**
 * The same lists as the scripts use. They are copied, not imported: importing
 * a value from `src/` would put the SDK and its schemas in the page.
 */
export const REASONS = [
  "Check-up",
  "Vaccination",
  "Dental",
  "Surgery",
  "Lameness",
  "Skin",
  "Follow-up",
] as const;

/** Which status may follow which, as `appointments/set-status` allows. */
export const NEXT: Record<
  string,
  { status: string; label: string; tone?: "primary" | "danger" }[]
> = {
  booked: [
    { status: "checked_in", label: "Check in", tone: "primary" },
    { status: "no_show", label: "No-show" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  checked_in: [
    { status: "in_exam", label: "To exam room", tone: "primary" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  in_exam: [{ status: "done", label: "Finish visit", tone: "primary" }],
  done: [],
  no_show: [{ status: "booked", label: "Rebook" }],
  cancelled: [{ status: "booked", label: "Restore" }],
};

export const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  booked: { label: "Booked", tone: "neutral" },
  checked_in: { label: "Checked in", tone: "action" },
  in_exam: { label: "In exam", tone: "attention" },
  done: { label: "Done", tone: "success" },
  no_show: { label: "No-show", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function StatusBadge({ status }: { status: string }) {
  const known = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={known.tone}>{known.label}</Badge>;
}

// ----- Tables, typed by their definitions -----

export const Appointments = () => table<typeof appointments>("appointments");
export const Pets = () => table<typeof pets>("pets");
export const Clients = () => table<typeof clients>("clients");
export const Clinics = () => table<typeof clinics>("clinics");
export const Inventory = () => table<typeof inventory>("inventory");
export const Invoices = () => table<typeof invoices>("invoices");
export const Registrations = () => table<typeof registrations>("registrations");

export type Appointment = NonNullable<typeof appointments.__row>;
export type Pet = NonNullable<typeof pets.__row>;
export type Client = NonNullable<typeof clients.__row>;
export type Clinic = NonNullable<typeof clinics.__row>;
export type StockLine = NonNullable<typeof inventory.__row>;
export type Registration = NonNullable<typeof registrations.__row>;

// ----- Formatting. Clinic times are kept in UTC, as the booking script checks them. -----

export const pounds = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const shiftDay = (date: string, by: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + by * 86_400_000).toISOString().slice(0, 10);

export const dayRange = (date: string) => ({
  and: [
    { column: "starts_at", op: "gte" as const, value: `${date}T00:00:00Z` },
    { column: "starts_at", op: "lte" as const, value: `${date}T23:59:59Z` },
  ],
});

/** The message a script or the API gave, for showing beside what was tried. */
export const messageOf = (error: unknown) =>
  error instanceof RunError
    ? (error.run.error?.message ?? error.message)
    : error instanceof Error
      ? error.message
      : String(error);

/** Runs a script and hands back its error message instead of throwing. */
export async function attempt<Output>(
  script: string,
  input: unknown,
): Promise<{ ok: true; output: Output } | { ok: false; message: string }> {
  try {
    return { ok: true, output: await runScript<Output>(script, input) };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/** Calls `tick` every `ms`, while the page is visible. */
export function useEvery(ms: number, tick: () => void) {
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, ms);
    return () => clearInterval(timer);
  }, [ms, tick]);
}

/** A value kept in this browser, for small conveniences such as the clinic chosen. */
export function useRemembered(key: string, initial: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  return [
    value,
    (next: string) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Private browsing may refuse; nothing depends on it.
      }
    },
  ];
}

/** A panel with a heading, the app's one card style. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-panel border border-line bg-surface ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="m-0 text-body font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="m-0 py-6 text-center text-ink-muted" aria-live="polite">
      Loading {what}…
    </p>
  );
}
