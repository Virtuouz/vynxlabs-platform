import { useQuery } from "@vynxlabs/app";
import { Badge, Button, EmptyState, Notice, TextField } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import {
  Appointments,
  type Client,
  Clients,
  clock,
  day,
  Invoices,
  Loading,
  Panel,
  Pets,
  pounds,
  StatusBadge,
} from "./shared.tsx";

/** Waits until typing stops before a value is used. */
function useSettled(value: string, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * Finds owners by name, phone, client code, or a pet's name. Only the owners
 * the person may see come back: the tables' rules decide, not this screen.
 */
export function ClientSearch({
  onChoose,
  chosen,
  label = "Find a client",
}: {
  onChoose: (client: Client) => void;
  chosen?: string | undefined;
  label?: string;
}) {
  const [text, setText] = useState("");
  const query = useSettled(text.trim());
  const found = useQuery(async () => {
    if (query.length < 2) return [] as Client[];
    const owners = await Clients().find({
      filter: {
        or: [
          { column: "name", op: "contains", value: query },
          { column: "phone", op: "contains", value: query },
          { column: "code", value: query.toUpperCase() },
        ],
      },
      limit: 20,
    });
    const byPet = await Pets().find({
      filter: { column: "name", op: "contains", value: query },
      limit: 20,
    });
    const known = new Set(owners.items.map((owner) => owner.code));
    const more = [...new Set(byPet.items.map((pet) => pet.client_code))].filter(
      (code) => !known.has(code),
    );
    const extra =
      more.length === 0
        ? []
        : (await Clients().find({ filter: { column: "code", op: "in", value: more }, limit: 20 }))
            .items;
    return [...owners.items, ...extra];
  }, [query]);
  const rows = found.data ?? [];
  return (
    <div className="flex flex-col gap-2">
      <TextField
        name="client-search"
        label={label}
        value={text}
        placeholder="Name, phone, C-1042, or a pet's name"
        onChange={setText}
        autoComplete="off"
      />
      {found.error ? <Notice tone="danger">{found.error.message}</Notice> : null}
      {query.length >= 2 && !found.loading && rows.length === 0 ? (
        <p className="m-0 text-meta text-ink-muted">Nobody matches “{query}”.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="m-0 flex max-h-72 list-none flex-col overflow-y-auto rounded-control border border-line p-0">
          {rows.map((client) => (
            <li key={client.id} className="border-line border-b last:border-b-0">
              <button
                type="button"
                aria-pressed={chosen === client.code}
                onClick={() => onChoose(client)}
                className={`flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left ${
                  chosen === client.code ? "bg-action-soft" : "hover:bg-sunken"
                }`}
              >
                <span className="font-medium">{client.name}</span>
                <span className="font-mono text-meta text-ink-muted">
                  {client.code} · {client.phone}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One owner: how to reach them, their animals, their visits and what they owe. */
export function ClientDetail({ code, onBook }: { code: string; onBook: (code: string) => void }) {
  const data = useQuery(async () => {
    const [client] = (await Clients().find({ filter: { column: "code", value: code }, limit: 1 }))
      .items;
    if (!client) return null;
    const [pets, visits, unpaid] = await Promise.all([
      Pets().find({ filter: { column: "client_code", value: code }, sort: ["name"], limit: 50 }),
      Appointments().find({
        filter: { column: "client_code", value: code },
        sort: ["-starts_at"],
        limit: 100,
      }),
      Invoices().aggregate({
        measures: ["count", "sum:total"],
        filter: {
          and: [
            { column: "client_code", value: code },
            { column: "status", value: "unpaid" },
          ],
        },
      }),
    ]);
    return {
      client,
      pets: pets.items,
      visits: visits.items,
      unpaid: unpaid.items[0]?.values ?? {},
    };
  }, [code]);

  if (data.error) return <Notice tone="danger">{data.error.message}</Notice>;
  if (!data.data) return <Loading what="the client" />;
  if (data.data === null) {
    return (
      <EmptyState title="No such client">
        Nobody with the code {code} is on your clinic's books.
      </EmptyState>
    );
  }
  const { client, pets, visits, unpaid } = data.data;
  const now = Date.now();
  const upcoming = visits
    .filter((visit) => new Date(visit.starts_at).getTime() >= now && visit.status === "booked")
    .reverse();
  const past = visits.filter((visit) => !upcoming.includes(visit));
  const owed = Number(unpaid["sum:total"] ?? 0);
  const owedCount = Number(unpaid.count ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-title">{client.name}</h2>
          <p className="m-0 font-mono text-meta text-ink-muted">
            {client.code} · registered at {client.home_clinic}
          </p>
        </div>
        <Button variant="primary" onClick={() => onBook(client.code)}>
          Book a visit
        </Button>
      </div>
      <dl className="m-0 grid gap-x-6 gap-y-2 sm:grid-cols-3">
        <div>
          <dt className="text-label text-ink-subtle uppercase">Phone</dt>
          <dd className="m-0">
            <a href={`tel:${client.phone.replace(/\s+/g, "")}`}>{client.phone}</a>
          </dd>
        </div>
        <div>
          <dt className="text-label text-ink-subtle uppercase">Email</dt>
          <dd className="m-0 break-all">{client.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-label text-ink-subtle uppercase">Unpaid</dt>
          <dd className={`m-0 font-mono ${owed > 0 ? "text-danger" : ""}`}>
            {owed > 0
              ? `${pounds(owed)} on ${owedCount} invoice${owedCount === 1 ? "" : "s"}`
              : "Nothing"}
          </dd>
        </div>
      </dl>
      {client.notes ? <Notice tone="plain">{client.notes}</Notice> : null}

      <Panel title={`Pets (${pets.length})`}>
        {pets.length === 0 ? (
          <p className="m-0 text-ink-muted">No pets on file.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {pets.map((pet) => (
              <li
                key={pet.id}
                className="flex flex-col gap-1 rounded-control border border-line p-3"
              >
                <span className="font-semibold">
                  {pet.name} <span className="font-normal text-ink-muted">· {pet.species}</span>
                </span>
                <span className="text-meta text-ink-muted">
                  {[
                    pet.breed,
                    pet.born ? `born ${pet.born}` : null,
                    pet.weight_kg ? `${pet.weight_kg} kg` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {pet.alert ? (
                  <span className="self-start">
                    <Badge tone="danger">⚠ {pet.alert}</Badge>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Coming up (${upcoming.length})`}>
          <VisitList visits={upcoming} empty="Nothing booked." />
        </Panel>
        <Panel title="Past visits">
          <VisitList visits={past.slice(0, 15)} empty="No visits yet." />
        </Panel>
      </div>
    </div>
  );
}

function VisitList({
  visits,
  empty,
}: {
  visits: {
    id: string;
    starts_at: string;
    pet_name: string;
    reason: string;
    clinic: string;
    status: string;
  }[];
  empty: string;
}) {
  if (visits.length === 0) return <p className="m-0 text-ink-muted">{empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {visits.map((visit) => (
        <li
          key={visit.id}
          className="flex flex-wrap items-center justify-between gap-2 border-line border-b py-2 last:border-b-0"
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">
              {visit.pet_name} · {visit.reason}
            </span>
            <span className="font-mono text-meta text-ink-muted">
              {day(visit.starts_at)} {clock(visit.starts_at)} · {visit.clinic}
            </span>
          </span>
          <StatusBadge status={visit.status} />
        </li>
      ))}
    </ul>
  );
}

/** Search on one side, the owner chosen on the other; stacked on a phone. */
export function ClientsScreen({
  code,
  onChoose,
  onBook,
}: {
  code: string | undefined;
  onChoose: (code: string | undefined) => void;
  onBook: (code: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
      <div className={code ? "hidden lg:block" : ""}>
        <Panel>
          <ClientSearch chosen={code} onChoose={(client) => onChoose(client.code)} />
        </Panel>
      </div>
      <div className={code ? "" : "hidden lg:block"}>
        {code ? (
          <div className="flex flex-col gap-3">
            <div className="lg:hidden">
              <Button size="small" variant="quiet" onClick={() => onChoose(undefined)}>
                ‹ Back to search
              </Button>
            </div>
            <ClientDetail code={code} onBook={onBook} />
          </div>
        ) : (
          <EmptyState title="Choose a client">
            Search on the left by name, phone, client code or a pet's name.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
