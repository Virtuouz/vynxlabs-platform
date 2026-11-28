import { RunError, runScript, table } from "@volvel/app";
// Types only: none of the repository's server code reaches the browser. The tables are typed by name, by .platform/volvel-env.d.ts.
import type { Row, TableOf } from "@volvel/sdk";
import { Badge, type BadgeTone, Skeleton } from "@volvel/ui";
import { useEffect } from "react";
// These two files import nothing, so they are safe in the browser.
import {
  type AppointmentStatus,
  dollars,
  NEXT_STATUS,
  STATUS_WORDS,
  TIME_ZONE,
} from "../../src/constants.ts";
import { clockText, instantAt, wallClock } from "../../src/time.ts";

export { CLINICS, REASONS, VISIT_MINUTES } from "../../src/constants.ts";

/** What each move is called on a button, and how loud it is. */
const MOVES: Record<AppointmentStatus, { label: string; tone?: "primary" | "danger" }> = {
  checked_in: { label: "Check in", tone: "primary" },
  in_exam: { label: "To exam room", tone: "primary" },
  done: { label: "Finish visit", tone: "primary" },
  no_show: { label: "No-show" },
  cancelled: { label: "Cancel", tone: "danger" },
  booked: { label: "Rebook" },
};

/** The moves a visit can make next, as `appointments/set-status` allows them. */
export const nextMoves = (status: string) =>
  (NEXT_STATUS[status as AppointmentStatus] ?? []).map((next) => ({
    status: next,
    // A canceled visit is restored, not rebooked.
    label: status === "cancelled" && next === "booked" ? "Restore" : MOVES[next].label,
    tone: MOVES[next].tone,
  }));

const TONES: Record<AppointmentStatus, BadgeTone> = {
  booked: "neutral",
  checked_in: "action",
  in_exam: "attention",
  done: "success",
  no_show: "danger",
  cancelled: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const known = status as AppointmentStatus;
  return <Badge tone={TONES[known] ?? "neutral"}>{STATUS_WORDS[known] ?? status}</Badge>;
}

// ----- Tables, typed by their paths -----

export const Appointments = () => table<TableOf<"appointments">>("appointments");
export const Pets = () => table<TableOf<"pets">>("pets");
export const Clients = () => table<TableOf<"clients">>("clients");
export const Clinics = () => table<TableOf<"clinics">>("clinics");
export const Inventory = () => table<TableOf<"inventory">>("inventory");
export const Invoices = () => table<TableOf<"invoices">>("invoices");
export const Registrations = () => table<TableOf<"registrations">>("registrations");

export type Appointment = Row<"appointments">;
export type Pet = Row<"pets">;
export type Client = Row<"clients">;
export type Clinic = Row<"clinics">;
export type StockLine = Row<"inventory">;
export type Registration = Row<"registrations">;

// ----- Formatting. Every clinic keeps Pacific time, and money is kept in cents. -----

export { dollars };

/** "8:30 AM" at the clinic. */
export const clock = (iso: string) => clockText(iso, TIME_ZONE);

/** "Mon, Nov 16" for a clinic day, `YYYY-MM-DD`. */
export const day = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instantAt(date, 12 * 60, TIME_ZONE));

/** Today at the clinics. */
export const todayIso = () => wallClock(new Date(), TIME_ZONE).date;

/** The clinic day of an instant. */
export const dayOf = (iso: string) => wallClock(new Date(iso), TIME_ZONE).date;

/** A clinic day's visits, from midnight to midnight Pacific time. */
export const dayRange = (date: string) => ({
  and: [
    { column: "starts_at", op: "gte" as const, value: instantAt(date, 0, TIME_ZONE).toISOString() },
    {
      column: "starts_at",
      op: "lt" as const,
      value: instantAt(date, 24 * 60, TIME_ZONE).toISOString(),
    },
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

export function Loading({ what, lines = 3 }: { what: string; lines?: number }) {
  return <Skeleton lines={lines} label={`Loading ${what}`} className="py-2" />;
}
