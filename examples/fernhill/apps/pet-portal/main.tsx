import {
  ApiError,
  appContext,
  logoUrl,
  RunError,
  runScript,
  signInUrl,
  signOut,
  table,
  useQuery,
  useSession,
} from "@vynxlabs/app";
import {
  Avatar,
  Badge,
  type BadgeTone,
  Button,
  Card,
  DateStepper,
  EmptyState,
  Notice,
  PageShell,
  SegmentedControl,
  SelectField,
  Skeleton,
  TextAreaField,
  ToastProvider,
  useToast,
} from "@vynxlabs/ui";
import {
  Bird,
  CalendarPlus,
  Cat,
  Clock,
  Dog,
  MapPin,
  PawPrint,
  Phone,
  Rabbit,
  Receipt,
  TriangleAlert,
} from "@vynxlabs/ui/icons";
import { type ReactNode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
// Values and clock helpers that import nothing, so they are safe in the browser.
import {
  type AppointmentStatus,
  dollars,
  REASONS,
  type Reason,
  STATUS_WORDS,
  TIME_ZONE,
  VISIT_MINUTES,
} from "../../src/constants.ts";
// Types only: none of the repository's server code reaches the browser.
import type { appointments, clients, clinics, invoices, pets } from "../../src/model.ts";
import { clockText, wallClock } from "../../src/time.ts";
import "./styles.css";

type Pet = NonNullable<typeof pets.__row>;
type Visit = NonNullable<typeof appointments.__row>;
type Invoice = NonNullable<typeof invoices.__row>;
type Clinic = NonNullable<typeof clinics.__row>;
type Client = NonNullable<typeof clients.__row>;

const UPCOMING = new Set(["booked", "checked_in", "in_exam"]);
const TONES: Record<AppointmentStatus, BadgeTone> = {
  booked: "action",
  checked_in: "attention",
  in_exam: "attention",
  done: "success",
  no_show: "danger",
  cancelled: "neutral",
};

// The clinics are in Portland. Every time is shown as the clinic's clock shows it.
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
const time = (iso: string) => clockText(iso, TIME_ZONE);
const longDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
/** Today at the clinics, as `YYYY-MM-DD`. */
const clinicToday = () => wallClock(new Date(), TIME_ZONE).date;

function age(born: string | null): string | null {
  if (!born) return null;
  const then = new Date(`${born}T00:00:00Z`);
  const now = new Date();
  let months =
    (now.getUTCFullYear() - then.getUTCFullYear()) * 12 + now.getUTCMonth() - then.getUTCMonth();
  if (now.getUTCDate() < then.getUTCDate()) months -= 1;
  if (months < 12) return `${Math.max(months, 0)} month${months === 1 ? "" : "s"} old`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} old`;
}

const messageOf = (error: unknown) =>
  error instanceof RunError || error instanceof ApiError || error instanceof Error
    ? error.message
    : String(error);

function SpeciesIcon({ species, size = 14 }: { species: string; size?: number }) {
  const Icon =
    species === "Dog"
      ? Dog
      : species === "Cat"
        ? Cat
        : species === "Rabbit"
          ? Rabbit
          : species === "Bird"
            ? Bird
            : PawPrint;
  return <Icon aria-hidden="true" size={size} />;
}

// ----- Where the person is in the portal: the address's hash -----

type Section = "home" | "visits" | "book" | "invoices";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "home", label: "My pets" },
  { id: "visits", label: "Visits" },
  { id: "book", label: "Book a visit" },
  { id: "invoices", label: "Invoices" },
];

function readHash(): [Section, string | undefined] {
  const [section, detail] = location.hash.replace(/^#/, "").split("/");
  return [
    (SECTIONS.some((one) => one.id === section) ? section : "home") as Section,
    detail || undefined,
  ];
}

function useHash(): [Section, string | undefined] {
  const [at, setAt] = useState(readHash);
  useEffect(() => {
    const update = () => {
      setAt(readHash());
      window.scrollTo({ top: 0 });
    };
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return at;
}

// ----- Everything the owner may see, loaded once -----

interface Mine {
  me: Client | undefined;
  pets: Pet[];
  visits: Visit[];
  invoices: Invoice[];
  clinics: Clinic[];
}

/** `clientId` is the owner's `client_id` attribute: which client row is theirs. */
function useMine(clientId: string | undefined) {
  return useQuery<Mine>(async () => {
    // The tables' rules give an owner their own rows and nobody else's.
    const [me, petRows, visitRows, invoiceRows, clinicRows] = await Promise.all([
      clientId
        ? table<typeof clients>("clients").find({
            filter: { column: "code", value: clientId },
            limit: 1,
          })
        : Promise.resolve([]),
      table<typeof pets>("pets").find({ sort: ["name"], limit: 100 }),
      table<typeof appointments>("appointments").find({ sort: ["-starts_at"], limit: 500 }),
      table<typeof invoices>("invoices").find({ sort: ["-issued_on"], limit: 500 }),
      table<typeof clinics>("clinics").find({ sort: ["name"] }),
    ]);
    return {
      me: me[0],
      pets: petRows,
      visits: visitRows,
      invoices: invoiceRows,
      clinics: clinicRows,
    };
  }, [clientId]);
}

// ----- Pieces -----

function StatusBadge({ status }: { status: string }) {
  const known = status as AppointmentStatus;
  return <Badge tone={TONES[known] ?? "neutral"}>{STATUS_WORDS[known] ?? status}</Badge>;
}

function PetAvatar({ pet }: { pet: Pick<Pet, "name" | "species"> }) {
  return (
    <span className="relative shrink-0">
      <Avatar name={pet.name} size="large" decorative />
      <span
        aria-hidden="true"
        className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-action text-action-ink"
      >
        <SpeciesIcon species={pet.species} size={12} />
      </span>
    </span>
  );
}

function ClinicLine({ clinic }: { clinic: Clinic | undefined }) {
  if (!clinic) return null;
  return (
    <div className="flex flex-col gap-1 text-sm text-ink-muted">
      <span className="flex items-center gap-1.5">
        <MapPin aria-hidden="true" size={14} />
        {clinic.name}, {clinic.address}
      </span>
      <a href={`tel:${clinic.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5">
        <Phone aria-hidden="true" size={14} />
        {clinic.phone}
      </a>
    </div>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-8 w-48" label={`Loading ${what}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-36 w-full rounded-panel" label={`Loading ${what}`} />
        ))}
      </div>
    </div>
  );
}

function Heading({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-2xl font-semibold">{title}</h1>
        {text ? <p className="m-0 mt-1 text-ink-muted">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

const bookButton = (
  <Button variant="primary" href="#book">
    <CalendarPlus aria-hidden="true" size={16} />
    Book a visit
  </Button>
);

// ----- My pets -----

function Home({ mine }: { mine: Mine }) {
  const now = Date.now();
  const unpaid = mine.invoices.filter((invoice) => invoice.status === "unpaid");
  const owed = unpaid.reduce((sum, invoice) => sum + invoice.total, 0);
  const nextFor = (pet: Pet) =>
    mine.visits
      .filter(
        (visit) =>
          visit.pet === pet.id &&
          UPCOMING.has(visit.status) &&
          Date.parse(visit.starts_at) > now - 3_600_000,
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const firstName = mine.me?.name.split(" ")[0];
  const home = mine.clinics.find((clinic) => clinic.code === mine.me?.home_clinic);

  return (
    <div className="grid gap-5">
      <Heading
        title={firstName ? `Hello, ${firstName}` : "Hello"}
        text={home ? `Your clinic is ${home.name}.` : "Here is everything we have for your pets."}
        action={bookButton}
      />

      {unpaid.length > 0 ? (
        <Notice
          tone="attention"
          action={
            <Button size="small" href="#invoices">
              See invoices
            </Button>
          }
        >
          You have {unpaid.length} unpaid {unpaid.length === 1 ? "invoice" : "invoices"} for{" "}
          <strong>{dollars(owed)}</strong>.
        </Notice>
      ) : null}

      {mine.pets.length === 0 ? (
        <EmptyState title="No pets on your account yet">
          If you registered recently, your clinic adds your pets when they call you back.
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {mine.pets.map((pet) => {
            const next = nextFor(pet);
            const facts = [pet.breed, age(pet.born), pet.weight_lb ? `${pet.weight_lb} lb` : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={pet.id} className="flex">
                <Card className="w-full">
                  <div className="flex items-start gap-3">
                    <PetAvatar pet={pet} />
                    <div className="min-w-0">
                      <h2 className="m-0 text-lg font-semibold">{pet.name}</h2>
                      <p className="m-0 text-sm text-ink-muted">
                        {pet.species}
                        {facts ? ` · ${facts}` : ""}
                      </p>
                    </div>
                  </div>
                  {pet.alert ? (
                    <p className="m-0 flex items-start gap-1.5 text-sm text-attention">
                      <TriangleAlert aria-hidden="true" size={15} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="sr-only">Our note: </span>
                        {pet.alert}
                      </span>
                    </p>
                  ) : null}
                  <div className="mt-auto rounded-control bg-sunken px-3 py-2.5 text-sm">
                    {next ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <Clock aria-hidden="true" size={15} />
                          <span>
                            <strong>{day(next.starts_at)}</strong> at {time(next.starts_at)} ·{" "}
                            {next.reason}
                          </span>
                        </span>
                        <StatusBadge status={next.status} />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-ink-muted">No visit booked</span>
                        <a href={`#book/${pet.id}`} className="font-medium">
                          Book for {pet.name}
                        </a>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ----- Visits -----

function VisitCard({
  visit,
  clinic,
  upcoming,
}: {
  visit: Visit;
  clinic: Clinic | undefined;
  upcoming: boolean;
}) {
  const at = new Date(visit.starts_at);
  return (
    <li>
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex w-14 shrink-0 flex-col items-center rounded-control bg-action-soft py-1.5 text-action">
              <span className="text-xs font-medium uppercase">
                {at.toLocaleDateString("en-US", { month: "short", timeZone: TIME_ZONE })}
              </span>
              <span className="text-xl font-semibold leading-tight">
                {at.toLocaleDateString("en-US", { day: "numeric", timeZone: TIME_ZONE })}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="m-0 flex items-center gap-1.5 font-semibold">
                <SpeciesIcon species={visit.species ?? ""} />
                {visit.pet_name} · {visit.reason}
              </p>
              <p className="m-0 text-sm text-ink-muted">
                {day(visit.starts_at)}, {time(visit.starts_at)} for {visit.minutes} minutes
                {visit.vet ? ` with ${visit.vet}` : ""}
              </p>
              {upcoming ? (
                <ClinicLine clinic={clinic} />
              ) : (
                <p className="m-0 text-sm text-ink-muted">{clinic?.name ?? visit.clinic}</p>
              )}
              {visit.notes ? <p className="m-0 text-sm">{visit.notes}</p> : null}
            </div>
          </div>
          <div className="shrink-0">
            <StatusBadge status={visit.status} />
          </div>
        </div>
      </Card>
    </li>
  );
}

function Visits({ mine }: { mine: Mine }) {
  const now = Date.now();
  const clinicOf = (code: string) => mine.clinics.find((clinic) => clinic.code === code);
  const upcoming = mine.visits
    .filter((visit) => UPCOMING.has(visit.status) && Date.parse(visit.starts_at) > now - 3_600_000)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = mine.visits.filter((visit) => !upcoming.includes(visit));

  return (
    <div className="grid gap-6">
      <Heading
        title="Visits"
        text="Times are Pacific time, as the clinic's clock shows them."
        action={bookButton}
      />
      <section aria-labelledby="upcoming" className="grid gap-3">
        <h2 id="upcoming" className="m-0 text-lg font-semibold">
          Coming up
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing booked">Book a visit and it will show here.</EmptyState>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {upcoming.map((visit) => (
              <VisitCard key={visit.id} visit={visit} clinic={clinicOf(visit.clinic)} upcoming />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="past" className="grid gap-3">
        <h2 id="past" className="m-0 text-lg font-semibold">
          Past visits
        </h2>
        {past.length === 0 ? (
          <p className="m-0 text-ink-muted">No past visits yet.</p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {past.map((visit) => (
              <VisitCard
                key={visit.id}
                visit={visit}
                clinic={clinicOf(visit.clinic)}
                upcoming={false}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ----- Booking -----

interface FreeTimes {
  closed: boolean;
  times: { starts_at: string; local: string }[];
}

function Book({
  mine,
  chosenPet,
  onBooked,
}: {
  mine: Mine;
  chosenPet: string | undefined;
  onBooked: () => void;
}) {
  const toast = useToast();
  const [pet, setPet] = useState(chosenPet ?? mine.pets[0]?.id ?? "");
  const [clinic, setClinic] = useState(mine.me?.home_clinic ?? mine.clinics[0]?.code ?? "");
  const [reason, setReason] = useState<Reason>("Checkup");
  const [date, setDate] = useState(clinicToday);
  const [slot, setSlot] = useState<string>();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    if (chosenPet) setPet(chosenPet);
  }, [chosenPet]);

  const minutes = VISIT_MINUTES[reason];
  const place = mine.clinics.find((one) => one.code === clinic);
  // Only the times the clinic can take: the script sees every visit, and shows no one's.
  const free = useQuery<FreeTimes>(
    () => runScript<FreeTimes>("appointments/free-times", { clinic, date, minutes }),
    [clinic, date, minutes],
  );

  // A different clinic, day or kind of visit offers different times.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these are what the chosen time depends on
  useEffect(() => {
    setSlot(undefined);
    setProblem(undefined);
  }, [clinic, date, reason]);

  if (mine.pets.length === 0) {
    return (
      <EmptyState title="There is no pet to book for">
        Your clinic adds your pets to your account. Call them to book your first visit.
      </EmptyState>
    );
  }

  const book = async () => {
    if (!slot) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const booked = await runScript<{ number: string; starts_at: string }>("appointments/book", {
        pet,
        clinic,
        starts_at: slot,
        minutes,
        reason,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      toast.success(
        `Booked: ${day(booked.starts_at)} at ${time(booked.starts_at)}. Reference ${booked.number}.`,
      );
      setNotes("");
      setSlot(undefined);
      onBooked();
      location.hash = "visits";
    } catch (error) {
      // Someone may have taken the time since the list was read: show the list again.
      setProblem(messageOf(error));
      setSlot(undefined);
      free.reload();
    } finally {
      setBusy(false);
    }
  };

  const times = free.loading ? undefined : free.data;

  return (
    <div className="grid max-w-2xl gap-5">
      <Heading
        title="Book a visit"
        text="Choose a time and we will text you a reminder the day before."
      />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Who is it for?"
            name="pet"
            value={pet}
            onChange={setPet}
            options={mine.pets.map((one) => ({
              value: one.id,
              label: `${one.name} (${one.species})`,
            }))}
          />
          <SelectField
            label="What for?"
            name="reason"
            value={reason}
            onChange={(value) => setReason(value as Reason)}
            options={REASONS.map((one) => ({ value: one, label: one }))}
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Which clinic?</span>
          <SegmentedControl
            label="Which clinic?"
            value={clinic}
            onChange={setClinic}
            options={mine.clinics.map((one) => ({
              value: one.code,
              label:
                one.code === mine.me?.home_clinic
                  ? `${one.name.replace("Fernhill ", "")} (yours)`
                  : one.name.replace("Fernhill ", ""),
            }))}
          />
        </div>
        <ClinicLine clinic={place} />
      </Card>

      <Card>
        <fieldset className="m-0 grid gap-3 border-0 p-0">
          <legend className="mb-1 flex items-center gap-1.5 p-0 font-semibold">
            <Clock aria-hidden="true" size={16} />
            Choose a time
            <span className="font-normal text-ink-muted">· {minutes} minutes, Pacific time</span>
          </legend>
          <DateStepper
            value={date}
            onChange={setDate}
            min={clinicToday()}
            label="Which day?"
            locale="en-US"
          />
          {free.error ? (
            <Notice tone="danger" action={<Button onClick={free.reload}>Try again</Button>}>
              We could not read the free times. {free.error.message}
            </Notice>
          ) : !times ? (
            <Skeleton lines={2} label="Finding free times" />
          ) : times.closed ? (
            <p className="m-0 text-ink-muted">
              {place?.name ?? "The clinic"} is closed that day. Choose another day.
            </p>
          ) : times.times.length === 0 ? (
            <p className="m-0 text-ink-muted">No times are free that day. Choose another day.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {times.times.map((one) => {
                const on = one.starts_at === slot;
                return (
                  <button
                    key={one.starts_at}
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => setSlot(one.starts_at)}
                    className={`h-10 rounded-control border text-sm font-medium tabular-nums disabled:cursor-not-allowed disabled:opacity-50 ${
                      on
                        ? "border-action bg-action text-action-ink"
                        : "border-line bg-surface text-ink hover:bg-action-soft"
                    }`}
                  >
                    {time(one.starts_at)}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      </Card>

      <Card>
        <TextAreaField
          label="Anything we should know? (optional)"
          name="notes"
          rows={3}
          maxLength={500}
          value={notes}
          onChange={setNotes}
        />
        {problem ? (
          <Notice tone="danger">
            <strong>We could not book that time.</strong> {problem}
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink-muted">
            {slot
              ? `${mine.pets.find((one) => one.id === pet)?.name}, ${day(slot)} at ${time(slot)}`
              : "Choose a time above"}
          </span>
          <Button variant="primary" disabled={!slot || busy} onClick={book}>
            {busy ? "Booking…" : "Book this visit"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ----- Invoices -----

interface Line {
  label: string;
  amount: number;
}
const linesOf = (value: unknown): Line[] =>
  Array.isArray(value)
    ? value.filter(
        (line): line is Line =>
          typeof line === "object" && line !== null && "label" in line && "amount" in line,
      )
    : [];

function InvoiceCard({ invoice, mine }: { invoice: Invoice; mine: Mine }) {
  const toast = useToast();
  const visit = mine.visits.find((one) => one.id === invoice.appointment);
  const lines = linesOf(invoice.lines);
  const paid = invoice.status === "paid";
  return (
    <li>
      <Card
        footer={
          !paid ? (
            <Button
              size="small"
              onClick={() =>
                toast.success(
                  "To pay, use the PayFern link in the text we sent you, or pay at the front desk.",
                )
              }
            >
              Pay now
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Receipt aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <p className="m-0 font-semibold">{invoice.number}</p>
              <p className="m-0 text-sm text-ink-muted">
                {longDate(invoice.issued_on)}
                {visit ? ` · ${visit.pet_name}, ${visit.reason}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-lg font-semibold tabular-nums">{dollars(invoice.total)}</span>
            {paid ? (
              <Badge tone="success">Paid{invoice.paid_at ? ` ${day(invoice.paid_at)}` : ""}</Badge>
            ) : (
              <Badge tone="attention">Unpaid</Badge>
            )}
          </div>
        </div>
        {lines.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-muted">What it is for</summary>
            <table className="mt-2 w-full border-collapse">
              <caption className="sr-only">Lines of invoice {invoice.number}</caption>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.label} className="border-line border-t">
                    <td className="py-1.5">{line.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{dollars(line.amount)}</td>
                  </tr>
                ))}
                <tr className="border-line border-t font-semibold">
                  <td className="py-1.5">Total</td>
                  <td className="py-1.5 text-right tabular-nums">{dollars(invoice.total)}</td>
                </tr>
              </tbody>
            </table>
          </details>
        ) : null}
      </Card>
    </li>
  );
}

function Invoices({ mine }: { mine: Mine }) {
  const unpaid = mine.invoices.filter((invoice) => invoice.status === "unpaid");
  const paid = mine.invoices.filter((invoice) => invoice.status !== "unpaid");
  const owed = unpaid.reduce((sum, invoice) => sum + invoice.total, 0);
  return (
    <div className="grid gap-6">
      <Heading
        title="Invoices"
        text={
          unpaid.length > 0
            ? `${dollars(owed)} to pay across ${unpaid.length} ${unpaid.length === 1 ? "invoice" : "invoices"}.`
            : "Everything is paid. Thank you."
        }
      />
      {mine.invoices.length === 0 ? (
        <EmptyState title="No invoices yet">An invoice is written after each visit.</EmptyState>
      ) : (
        <>
          {unpaid.length > 0 ? (
            <section aria-labelledby="to-pay" className="grid gap-3">
              <h2 id="to-pay" className="m-0 text-lg font-semibold">
                To pay
              </h2>
              <ul className="m-0 grid list-none gap-3 p-0">
                {unpaid.map((invoice) => (
                  <InvoiceCard key={invoice.id} invoice={invoice} mine={mine} />
                ))}
              </ul>
            </section>
          ) : null}
          {paid.length > 0 ? (
            <section aria-labelledby="paid" className="grid gap-3">
              <h2 id="paid" className="m-0 text-lg font-semibold">
                Paid
              </h2>
              <ul className="m-0 grid list-none gap-3 p-0">
                {paid.map((invoice) => (
                  <InvoiceCard key={invoice.id} invoice={invoice} mine={mine} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

// ----- Signed out -----

function Welcome() {
  const context = appContext();
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="grid w-full max-w-md gap-5 rounded-panel border border-line bg-surface p-6 text-center sm:p-8">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-action-soft text-action">
          <PawPrint aria-hidden="true" size={28} />
        </span>
        <div>
          <h1 className="m-0 text-2xl font-semibold">Fernhill pet portal</h1>
          <p className="m-0 mt-2 text-ink-muted">
            See your pets' visits, book the next one, and keep track of invoices.
          </p>
        </div>
        <Button variant="primary" href={signInUrl()} className="w-full justify-center">
          Sign in
        </Button>
        <p className="m-0 text-sm text-ink-muted">
          New to Fernhill?{" "}
          <a href={`${context.portal}/`} className="font-medium">
            Register with us
          </a>
        </p>
      </div>
    </main>
  );
}

// ----- The portal -----

function Portal() {
  const context = appContext();
  const { principal, attributes } = useSession();
  const [section, detail] = useHash();
  const owner = principal.type === "end_user";
  // The account's client_id attribute says which client row is the owner's own.
  const mine = useMine(owner ? attributes.client_id : undefined);

  const body = mine.error ? (
    <Notice tone="danger" action={<Button onClick={mine.reload}>Try again</Button>}>
      We could not load your account. {mine.error.message}
    </Notice>
  ) : !mine.data ? (
    <Loading what={section === "home" ? "your pets" : section} />
  ) : section === "visits" ? (
    <Visits mine={mine.data} />
  ) : section === "book" ? (
    <Book mine={mine.data} chosenPet={detail} onBooked={mine.reload} />
  ) : section === "invoices" ? (
    <Invoices mine={mine.data} />
  ) : (
    <Home mine={mine.data} />
  );

  return (
    <PageShell
      title="Fernhill pets"
      logo={logoUrl()}
      nav={SECTIONS.map((one) => ({
        label: one.label,
        href: `#${one.id}`,
        current: one.id === section,
      }))}
      actions={
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="hidden max-w-48 truncate sm:inline">
            {mine.data?.me?.name ?? principal.name ?? principal.email}
          </span>
          <Button
            size="small"
            onClick={async () => {
              await signOut();
              location.assign(`${context.portal}/sign-in`);
            }}
          >
            Sign out
          </Button>
        </span>
      }
    >
      {!owner ? (
        <div className="mb-4">
          <Notice tone="plain">
            You are signed in as staff. This portal shows a pet owner's own records; staff see every
            client's rows here.
          </Notice>
        </div>
      ) : owner && mine.data && !mine.data.me ? (
        <div className="mb-4">
          <Notice tone="attention">
            Your account is not linked to a client record yet. Call your clinic and they will link
            it.
          </Notice>
        </div>
      ) : null}
      {body}
    </PageShell>
  );
}

function App() {
  const { signedIn } = useSession();
  return signedIn ? <Portal /> : <Welcome />;
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
