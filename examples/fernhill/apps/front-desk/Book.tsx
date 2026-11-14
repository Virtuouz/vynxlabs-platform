import { runScript, useQuery } from "@vynxlabs/app";
import {
  Button,
  DateStepper,
  Notice,
  NumberField,
  SelectField,
  TextAreaField,
  useToast,
} from "@vynxlabs/ui";
import { TriangleAlert } from "@vynxlabs/ui/icons";
import { useState } from "react";
import type { Reason } from "../../src/constants.ts";
import { ClientSearch } from "./Clients.tsx";
import {
  Appointments,
  attempt,
  type Client,
  Clients,
  clock,
  day,
  dayRange,
  Loading,
  messageOf,
  Panel,
  Pets,
  REASONS,
  todayIso,
  VISIT_MINUTES,
} from "./shared.tsx";

interface FreeTimes {
  closed: boolean;
  times: { starts_at: string; local: string }[];
}

/**
 * Books a visit. The free times come from `appointments/free-times`, so only a
 * time the booking script will accept is offered; if someone takes it first,
 * the script's refusal is shown as it gave it.
 */
export function Book({
  clinic,
  clinicOptions,
  clientCode,
  onBooked,
}: {
  clinic: string;
  clinicOptions: { value: string; label: string }[];
  clientCode?: string | undefined;
  onBooked: (number: string, clientCode: string) => void;
}) {
  const toast = useToast();
  const [client, setClient] = useState<string | undefined>(clientCode);
  const [pet, setPet] = useState("");
  const [where, setWhere] = useState(clinic);
  const [date, setDate] = useState(todayIso);
  const [reason, setReason] = useState<Reason>("Checkup");
  const [minutes, setMinutes] = useState<number | undefined>(VISIT_MINUTES.Checkup);
  const [vet, setVet] = useState("");
  const [slot, setSlot] = useState<string>();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const owner = useQuery(
    async () =>
      client
        ? ((await Clients().find({ filter: { column: "code", value: client }, limit: 1 }))[0] ??
          null)
        : null,
    [client],
  );
  const pets = useQuery(
    async () =>
      client
        ? Pets().find({ filter: { column: "client_code", value: client }, sort: ["name"] })
        : [],
    [client],
  );
  // The vets who have seen patients at this clinic lately, to choose from.
  const vets = useQuery(
    async () =>
      (
        await Appointments().aggregate({
          group: ["vet"],
          filter: { column: "clinic", value: where },
          limit: 20,
        })
      ).items
        .map((item) => item.by.vet)
        .filter((name): name is string => typeof name === "string" && name.length > 0)
        .sort(),
    [where],
  );
  const free = useQuery(
    () =>
      minutes
        ? runScript<FreeTimes>("appointments/free-times", {
            clinic: where,
            date,
            minutes,
            ...(vet ? { vet } : {}),
          })
        : Promise.resolve({ closed: false, times: [] }),
    [where, date, minutes, vet],
  );
  const sameDay = useQuery(
    () =>
      Appointments().find({
        filter: {
          and: [
            { column: "clinic", value: where },
            dayRange(date),
            { column: "status", op: "in", value: ["booked", "checked_in", "in_exam"] },
          ],
        },
        sort: ["starts_at"],
        limit: 200,
      }),
    [where, date],
  );

  const choose = (chosen: Client) => {
    setClient(chosen.code);
    setPet("");
    setProblem(undefined);
  };
  const ready = client && pet && slot && minutes && reason;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(undefined);
    const result = await attempt<{ number: string; starts_at: string }>("appointments/book", {
      pet,
      clinic: where,
      starts_at: slot,
      minutes,
      reason,
      ...(vet ? { vet } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      setSlot(undefined);
      free.reload();
      return;
    }
    toast.success(
      `Booked ${result.output.number} for ${day(date)} at ${clock(result.output.starts_at)}.`,
    );
    sameDay.reload();
    onBooked(result.output.number, client);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(16rem,20rem)]">
      <Panel title="Book a visit">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {client && owner.data ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-sunken px-3 py-2">
              <span>
                <span className="font-medium">{owner.data.name}</span>{" "}
                <span className="font-mono text-meta text-ink-muted">
                  {owner.data.code} · {owner.data.phone}
                </span>
              </span>
              <Button size="small" variant="quiet" onClick={() => setClient(undefined)}>
                Change
              </Button>
            </div>
          ) : (
            <ClientSearch label="Who is it for?" onChoose={choose} />
          )}

          {client ? (
            pets.data && pets.data.length === 0 ? (
              <Notice tone="attention">
                This client has no pets on file. Add one before booking.
              </Notice>
            ) : (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1 font-medium">Which pet?</legend>
                <div className="flex flex-wrap gap-2">
                  {(pets.data ?? []).map((one) => (
                    <label
                      key={one.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 ${
                        pet === one.id ? "border-action bg-action-soft" : "border-line"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pet"
                        value={one.id}
                        checked={pet === one.id}
                        onChange={() => setPet(one.id)}
                      />
                      <span>
                        {one.name} <span className="text-ink-muted">· {one.species}</span>
                      </span>
                      {one.alert ? (
                        <span className="inline-flex items-center gap-1 text-meta text-danger">
                          <TriangleAlert aria-hidden="true" size={13} />
                          {one.alert}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              name="clinic"
              label="Clinic"
              value={where}
              options={clinicOptions}
              onChange={(value) => {
                setWhere(value);
                setSlot(undefined);
              }}
            />
            <SelectField
              name="reason"
              label="Reason"
              value={reason}
              options={REASONS.map((value) => ({ value, label: value }))}
              onChange={(value) => {
                setReason(value as Reason);
                setMinutes(VISIT_MINUTES[value as Reason]);
                setSlot(undefined);
              }}
            />
            <NumberField
              name="minutes"
              label="Minutes"
              hint="What the reason usually takes. Change it for a longer visit."
              value={minutes}
              min={10}
              max={240}
              step={5}
              onChange={(value) => {
                setMinutes(value);
                setSlot(undefined);
              }}
            />
            <SelectField
              name="vet"
              label="Vet"
              value={vet}
              options={[
                { value: "", label: "Any vet" },
                ...(vets.data ?? []).map((name) => ({ value: name, label: name })),
              ]}
              onChange={(value) => {
                setVet(value);
                setSlot(undefined);
              }}
            />
          </div>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 font-medium">When? Pacific time</legend>
            <DateStepper
              value={date}
              min={todayIso()}
              locale="en-US"
              label="The day of the visit"
              onChange={(value) => {
                setDate(value);
                setSlot(undefined);
              }}
            />
            {free.error ? (
              <Notice tone="danger">{messageOf(free.error)}</Notice>
            ) : !free.data ? (
              <Loading what="free times" lines={2} />
            ) : free.data.closed ? (
              <p className="m-0 text-ink-muted">The clinic is closed that day.</p>
            ) : free.data.times.length === 0 ? (
              <p className="m-0 text-ink-muted">No free time that day. Try the next one.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
                {free.data.times.map((time) => (
                  <button
                    key={time.starts_at}
                    type="button"
                    aria-pressed={slot === time.starts_at}
                    onClick={() => setSlot(time.starts_at)}
                    className={`rounded-control border px-2 py-1.5 font-mono text-meta ${
                      slot === time.starts_at
                        ? "border-action bg-action text-action-ink"
                        : "border-line bg-surface hover:bg-sunken"
                    }`}
                  >
                    {clock(time.starts_at)}
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <TextAreaField
            name="notes"
            label="Notes"
            value={notes}
            rows={2}
            maxLength={500}
            onChange={setNotes}
          />

          {problem ? (
            <Notice tone="danger">
              <strong>Not booked.</strong> {problem}
            </Notice>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={!ready || busy}>
              {busy ? "Booking…" : slot ? `Book for ${clock(slot)}` : "Choose a time"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title={`Already booked, ${day(date)}`}>
        {sameDay.data ? (
          sameDay.data.length === 0 ? (
            <p className="m-0 text-ink-muted">The day is free.</p>
          ) : (
            <ul className="m-0 flex max-h-[28rem] list-none flex-col overflow-y-auto p-0">
              {sameDay.data.map((visit) => (
                <li
                  key={visit.id}
                  className="flex justify-between gap-2 border-line border-b py-1.5 text-meta last:border-b-0"
                >
                  <span className="font-mono">
                    {clock(visit.starts_at)}–
                    {clock(
                      new Date(
                        new Date(visit.starts_at).getTime() + visit.minutes * 60_000,
                      ).toISOString(),
                    )}
                  </span>
                  <span className="truncate text-ink-muted">{visit.vet ?? visit.pet_name}</span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <Loading what="the day's bookings" />
        )}
      </Panel>
    </div>
  );
}
