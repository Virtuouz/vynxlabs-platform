import { appContext, logoUrl, signOut, useQuery, useSession } from "@vynxlabs/app";
import { Button, EmptyState, Notice, SelectField, ToastProvider } from "@vynxlabs/ui";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "./Board.tsx";
import { Book } from "./Book.tsx";
import { ClientsScreen } from "./Clients.tsx";
import { Callbacks, Stock } from "./Stock.tsx";
import { Appointments, Clinics, Loading, Registrations, useRemembered } from "./shared.tsx";
import "./styles.css";

const SECTIONS = [
  { id: "today", label: "Today" },
  { id: "book", label: "Book" },
  { id: "clients", label: "Clients" },
  { id: "stock", label: "Stock" },
  { id: "callbacks", label: "Callbacks" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

/** The section is kept in the address's hash, so reloading and the back button keep the place. */
const readSection = (): Section => {
  const hash = location.hash.slice(1) as Section;
  return SECTIONS.some((one) => one.id === hash) ? hash : "today";
};

function useSection(): [Section, (section: Section) => void] {
  const read = readSection;
  const [section, setSection] = useState<Section>(read);
  useEffect(() => {
    const update = () => setSection(readSection());
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return [section, (next) => (location.hash = next)];
}

/**
 * Which clinics the person sees. Front-desk staff see one: the table's rules
 * give them only their clinic's visits. A practice manager sees them all, and
 * chooses.
 */
function useClinics() {
  return useQuery(async () => {
    const [all, visible] = await Promise.all([
      Clinics().find({ sort: ["name"] }),
      Appointments().aggregate({ group: ["clinic"] }),
    ]);
    const mine = new Set(visible.items.map((item) => String(item.by.clinic)));
    return all.items.filter((clinic) => mine.has(clinic.code));
  });
}

function App() {
  const context = appContext();
  const { principal } = useSession();
  const [section, go] = useSection();
  const clinics = useClinics();
  const [chosen, choose] = useRemembered("fernhill-front-desk-clinic", "");
  const [client, setClient] = useState<string>();
  const [bookFor, setBookFor] = useState<string>();
  const options = useMemo(
    () => (clinics.data ?? []).map((clinic) => ({ value: clinic.code, label: clinic.name })),
    [clinics.data],
  );
  const clinic = options.some((one) => one.value === chosen) ? chosen : (options[0]?.value ?? "");
  const current = clinics.data?.find((one) => one.code === clinic);
  const waiting = useQuery(
    async () =>
      clinic
        ? (
            await Registrations().aggregate({
              filter: {
                and: [
                  { column: "clinic", value: clinic },
                  { column: "status", value: "new" },
                ],
              },
            })
          ).items[0]?.values.count
        : 0,
    [clinic, section],
  );

  const who = principal.name ?? principal.email ?? "Signed in";
  const body = () => {
    if (clinics.error) return <Notice tone="danger">{clinics.error.message}</Notice>;
    if (!clinics.data) return <Loading what="your clinic" />;
    if (!clinic) {
      return (
        <EmptyState title="No clinic is yours yet">
          Ask a practice manager to add you to your clinic's group. Until then there is nothing here
          for you to see.
        </EmptyState>
      );
    }
    switch (section) {
      case "book":
        return (
          <Book
            key={`${clinic}-${bookFor ?? ""}`}
            clinic={clinic}
            clinicOptions={options}
            clientCode={bookFor}
            onBooked={(_number, code) => {
              setBookFor(undefined);
              setClient(code);
              go("clients");
            }}
          />
        );
      case "clients":
        return (
          <ClientsScreen
            code={client}
            onChoose={setClient}
            onBook={(code) => {
              setBookFor(code);
              go("book");
            }}
          />
        );
      case "stock":
        return <Stock clinic={clinic} />;
      case "callbacks":
        return <Callbacks clinic={clinic} />;
      default:
        return (
          <Board
            clinic={clinic}
            onOpenClient={(code) => {
              setClient(code);
              go("clients");
            }}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-line border-b bg-surface">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={logoUrl()} alt="" className="size-8 shrink-0 rounded-control" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-semibold">{current?.name ?? context.app.title}</span>
              <span className="truncate text-meta text-ink-muted">
                Front desk{current ? ` · ${current.phone}` : ""}
              </span>
            </div>
          </div>
          <nav aria-label="Sections" className="hidden gap-1 md:flex">
            {SECTIONS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={section === item.id ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 font-medium no-underline ${
                  section === item.id
                    ? "bg-action-soft text-action"
                    : "text-ink-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                {item.label}
                {item.id === "callbacks" && Number(waiting.data ?? 0) > 0 ? (
                  <span className="rounded-full bg-attention px-1.5 font-mono text-micro text-canvas">
                    {waiting.data}
                  </span>
                ) : null}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {options.length > 1 ? (
              <div className="w-44">
                <SelectField
                  name="clinic"
                  label="Clinic"
                  value={clinic}
                  options={options}
                  onChange={choose}
                />
              </div>
            ) : null}
            <span className="hidden max-w-48 truncate text-meta text-ink-muted sm:inline">
              {who}
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
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 pb-24 sm:px-6 md:pb-8">
        {body()}
      </main>

      {/* On a phone the sections sit at the bottom, in reach of a thumb. */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-line border-t bg-surface md:hidden"
      >
        {SECTIONS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={section === item.id ? "page" : undefined}
            className={`relative flex min-h-14 items-center justify-center px-1 text-meta font-medium no-underline ${
              section === item.id ? "text-action" : "text-ink-muted"
            }`}
          >
            {item.label}
            {item.id === "callbacks" && Number(waiting.data ?? 0) > 0 ? (
              <span className="absolute top-2 right-2 size-2 rounded-full bg-attention">
                <span className="sr-only">, people waiting</span>
              </span>
            ) : null}
          </a>
        ))}
      </nav>
    </div>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
