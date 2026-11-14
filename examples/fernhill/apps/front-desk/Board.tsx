import { useQuery } from "@vynxlabs/app";
import { Badge, Button, EmptyState, Notice, useToast } from "@vynxlabs/ui";
import { useCallback, useMemo, useState } from "react";
import {
  type Appointment,
  Appointments,
  attempt,
  clock,
  day,
  dayRange,
  Loading,
  NEXT,
  type Pet,
  Pets,
  StatusBadge,
  shiftDay,
  todayIso,
  useEvery,
} from "./shared.tsx";

/** The columns of the board, in the order a visit moves through them. */
const COLUMNS = [
  { status: "booked", title: "Booked" },
  { status: "checked_in", title: "Checked in" },
  { status: "in_exam", title: "In exam" },
  { status: "done", title: "Done" },
] as const;

/**
 * The day at one clinic: every visit by where it stands, with the next steps
 * on each. Refreshes itself every half minute while the page is in view.
 */
export function Board({
  clinic,
  onOpenClient,
}: {
  clinic: string;
  onOpenClient: (code: string) => void;
}) {
  const [date, setDate] = useState(todayIso);
  const visits = useQuery(
    () =>
      Appointments().find({
        filter: { and: [{ column: "clinic", value: clinic }, dayRange(date)] },
        sort: ["starts_at"],
        limit: 500,
      }),
    [clinic, date],
  );
  const items = visits.data?.items ?? [];
  const petIds = useMemo(() => [...new Set(items.map((visit) => visit.pet))].sort(), [items]);
  const pets = useQuery(
    () =>
      petIds.length === 0
        ? Promise.resolve({ items: [] as Pet[], nextCursor: null })
        : Pets().find({ filter: { column: "id", op: "in", value: petIds }, limit: 500 }),
    [petIds.join(",")],
  );
  const petById = useMemo(
    () => new Map((pets.data?.items ?? []).map((pet) => [pet.id, pet])),
    [pets.data],
  );
  const reload = useCallback(() => visits.reload(), [visits.reload]);
  useEvery(30_000, reload);

  const now = Date.now();
  const late = items.filter(
    (visit) => visit.status === "booked" && new Date(visit.starts_at).getTime() < now,
  );
  const closed = items.filter(
    (visit) => visit.status === "no_show" || visit.status === "cancelled",
  );
  const isToday = date === todayIso();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="m-0 flex items-center gap-1 border-0 p-0">
          <legend className="sr-only">Day</legend>
          <Button
            size="small"
            onClick={() => setDate(shiftDay(date, -1))}
            aria-label="The day before"
          >
            ‹
          </Button>
          <span className="min-w-36 text-center font-semibold" aria-live="polite">
            {isToday ? "Today, " : ""}
            {day(`${date}T12:00:00Z`)}
          </span>
          <Button
            size="small"
            onClick={() => setDate(shiftDay(date, 1))}
            aria-label="The day after"
          >
            ›
          </Button>
          {isToday ? null : (
            <Button size="small" variant="quiet" onClick={() => setDate(todayIso())}>
              Today
            </Button>
          )}
        </fieldset>
        <Summary items={items} late={late.length} />
      </div>

      {visits.error ? (
        <Notice tone="danger" action={<Button onClick={visits.reload}>Try again</Button>}>
          {visits.error.message}
        </Notice>
      ) : null}
      {late.length > 0 && isToday ? (
        <Notice tone="attention">
          {late.length === 1 ? "One patient is" : `${late.length} patients are`} late:{" "}
          {late.map((visit) => `${visit.pet_name} (${clock(visit.starts_at)})`).join(", ")}. Check
          them in, or mark a no-show.
        </Notice>
      ) : null}

      {!visits.data && visits.loading ? (
        <Loading what="the day's visits" />
      ) : items.length === 0 ? (
        <EmptyState title="No visits this day">Book one from the Book tab.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const here = items.filter((visit) => visit.status === column.status);
            return (
              <section
                key={column.status}
                aria-label={column.title}
                className="flex min-w-0 flex-col gap-2 rounded-panel bg-sunken p-2"
              >
                <h2 className="m-0 flex items-center justify-between px-1.5 pt-1 text-label text-ink-muted uppercase">
                  {column.title}
                  <span className="font-mono">{here.length}</span>
                </h2>
                {here.length === 0 ? (
                  <p className="m-0 px-1.5 pb-2 text-meta text-ink-subtle">Nobody.</p>
                ) : (
                  here.map((visit) => (
                    <VisitCard
                      key={visit.id}
                      visit={visit}
                      pet={petById.get(visit.pet)}
                      late={late.includes(visit)}
                      onChanged={reload}
                      onOpenClient={onOpenClient}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}

      {closed.length > 0 ? (
        <details className="rounded-panel border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-2.5 font-medium">
            No-shows and cancelled ({closed.length})
          </summary>
          <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
            {closed.map((visit) => (
              <VisitCard
                key={visit.id}
                visit={visit}
                pet={petById.get(visit.pet)}
                late={false}
                onChanged={reload}
                onOpenClient={onOpenClient}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function Summary({ items, late }: { items: Appointment[]; late: number }) {
  const done = items.filter((visit) => visit.status === "done").length;
  const open = items.filter((visit) =>
    ["booked", "checked_in", "in_exam"].includes(visit.status),
  ).length;
  return (
    <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-muted">
      <div className="flex gap-1">
        <dt>Visits</dt>
        <dd className="m-0 font-mono text-ink">{items.length}</dd>
      </div>
      <div className="flex gap-1">
        <dt>Still to see</dt>
        <dd className="m-0 font-mono text-ink">{open}</dd>
      </div>
      <div className="flex gap-1">
        <dt>Seen</dt>
        <dd className="m-0 font-mono text-ink">{done}</dd>
      </div>
      {late > 0 ? (
        <div className="flex gap-1 text-attention">
          <dt>Late</dt>
          <dd className="m-0 font-mono">{late}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function VisitCard({
  visit,
  pet,
  late,
  onChanged,
  onOpenClient,
}: {
  visit: Appointment;
  pet: Pet | undefined;
  late: boolean;
  onChanged: () => void;
  onOpenClient: (code: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const move = async (status: string, label: string) => {
    setBusy(status);
    setProblem(undefined);
    const result = await attempt("appointments/set-status", { appointment: visit.id, status });
    setBusy(undefined);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    toast.success(`${visit.pet_name}: ${label.toLowerCase()}.`);
    onChanged();
  };
  return (
    <article
      aria-label={`${clock(visit.starts_at)} ${visit.pet_name}`}
      className={`flex flex-col gap-2 rounded-control border bg-surface p-3 ${
        late ? "border-attention" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-telemetry text-ink-muted">
            {clock(visit.starts_at)} · {visit.minutes} min
          </span>
          <span className="truncate font-semibold">
            {visit.pet_name}
            <span className="font-normal text-ink-muted">
              {" "}
              · {visit.species ?? pet?.species ?? "—"}
            </span>
          </span>
        </div>
        {late ? <Badge tone="attention">Late</Badge> : <StatusBadge status={visit.status} />}
      </div>
      <div className="flex flex-col gap-0.5 text-meta text-ink-muted">
        <span>
          {visit.reason}
          {visit.vet ? ` · ${visit.vet}` : ""}
        </span>
        <button
          type="button"
          onClick={() => onOpenClient(visit.client_code)}
          className="self-start p-0 font-mono text-action underline-offset-2 hover:underline"
        >
          {visit.client_code}
        </button>
      </div>
      {pet?.alert ? (
        <p
          className="m-0 rounded-control bg-danger-soft px-2 py-1 text-meta text-danger"
          role="note"
        >
          ⚠ {pet.alert}
        </p>
      ) : null}
      {visit.notes ? <p className="m-0 text-meta text-ink-subtle">{visit.notes}</p> : null}
      {problem ? (
        <p className="m-0 text-meta text-danger" role="alert">
          {problem}
        </p>
      ) : null}
      {(NEXT[visit.status] ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {(NEXT[visit.status] ?? []).map((next) => (
            <Button
              key={next.status}
              size="small"
              variant={
                next.tone === "primary"
                  ? "primary"
                  : next.tone === "danger"
                    ? "danger"
                    : "secondary"
              }
              disabled={busy !== undefined}
              onClick={() => move(next.status, next.label)}
            >
              {busy === next.status ? "…" : next.label}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
