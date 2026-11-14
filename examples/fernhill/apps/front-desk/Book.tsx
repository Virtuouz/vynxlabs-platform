import { useQuery } from "@vynxlabs/app";
import {
  Button,
  DateField,
  Notice,
  NumberField,
  SelectField,
  TextAreaField,
  useToast,
} from "@vynxlabs/ui";
import { useState } from "react";
import { ClientSearch } from "./Clients.tsx";
import {
  Appointments,
  attempt,
  type Client,
  Clients,
  clock,
  day,
  Panel,
  Pets,
  REASONS,
} from "./shared.tsx";

/** The next quarter hour from now, in clinic time, for the date and time field. */
function nextSlot() {
  const at = new Date(Date.now() + 15 * 60_000);
  at.setUTCMinutes(Math.ceil(at.getUTCMinutes() / 15) * 15, 0, 0);
  return at.toISOString().slice(0, 16);
}

/**
 * Books a visit. The booking script decides whether the time works: opening
 * hours and clashes are its rules, and its refusal is shown as it gave it.
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
  const [when, setWhen] = useState(nextSlot);
  const [minutes, setMinutes] = useState<number | undefined>(20);
  const [reason, setReason] = useState<string>("Check-up");
  const [vet, setVet] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const owner = useQuery(
    async () =>
      client
        ? ((await Clients().find({ filter: { column: "code", value: client }, limit: 1 }))
            .items[0] ?? null)
        : null,
    [client],
  );
  const pets = useQuery(
    async () =>
      client
        ? (await Pets().find({ filter: { column: "client_code", value: client }, sort: ["name"] }))
            .items
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
  const date = when.slice(0, 10);
  const sameDay = useQuery(
    () =>
      Appointments().find({
        filter: {
          and: [
            { column: "clinic", value: where },
            { column: "starts_at", op: "gte", value: `${date}T00:00:00Z` },
            { column: "starts_at", op: "lte", value: `${date}T23:59:59Z` },
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
  const ready = client && pet && when && minutes && reason;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(undefined);
    const result = await attempt<{ number: string; starts_at: string }>("appointments/book", {
      pet,
      clinic: where,
      starts_at: `${when}:00Z`,
      minutes,
      reason,
      ...(vet ? { vet } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    toast.success(
      `Booked ${result.output.number} for ${day(result.output.starts_at)} at ${clock(result.output.starts_at)}.`,
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
                        <span className="text-meta text-danger">⚠ {one.alert}</span>
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
              onChange={setWhere}
            />
            <DateField
              name="when"
              label="Date and time"
              hint="Clinic time (UTC)"
              withTime
              value={when}
              onChange={setWhen}
              required
            />
            <SelectField
              name="reason"
              label="Reason"
              value={reason}
              options={REASONS.map((value) => ({ value, label: value }))}
              onChange={setReason}
            />
            <NumberField
              name="minutes"
              label="Minutes"
              value={minutes}
              min={10}
              max={240}
              step={5}
              onChange={setMinutes}
            />
            <SelectField
              name="vet"
              label="Vet"
              value={vet}
              options={[
                { value: "", label: "Any vet" },
                ...(vets.data ?? []).map((name) => ({ value: name, label: name })),
              ]}
              onChange={setVet}
            />
          </div>
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
              {busy ? "Booking…" : "Book visit"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title={`Already booked, ${day(`${date}T12:00:00Z`)}`}>
        {sameDay.data ? (
          sameDay.data.items.length === 0 ? (
            <p className="m-0 text-ink-muted">The day is free.</p>
          ) : (
            <ul className="m-0 flex max-h-[28rem] list-none flex-col overflow-y-auto p-0">
              {sameDay.data.items.map((visit) => (
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
          <p className="m-0 text-ink-muted">Loading…</p>
        )}
      </Panel>
    </div>
  );
}
