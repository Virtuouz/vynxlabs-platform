import { appContext, logoUrl, signOut, totalOf, useQuery, useSession } from "@vynxlabs/app";
import {
  Avatar,
  Button,
  EmptyState,
  Notice,
  PageShell,
  SegmentedControl,
  ToastProvider,
} from "@vynxlabs/ui";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "./Board.tsx";
import { Book } from "./Book.tsx";
import { ClientsScreen } from "./Clients.tsx";
import { Callbacks, Stock } from "./Stock.tsx";
import { CLINICS, Clinics, Loading, Registrations, useRemembered } from "./shared.tsx";
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
  const [section, setSection] = useState<Section>(readSection);
  useEffect(() => {
    const update = () => setSection(readSection());
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return [section, (next) => (location.hash = next)];
}

function App() {
  const context = appContext();
  const { principal, groups } = useSession();
  const [section, go] = useSection();
  // Front-desk staff are in their clinic's group. Anyone else here, such as a practice
  // manager signed in as staff, sees every clinic and chooses.
  const groupList = groups.join(",");
  const own = useMemo(
    () => CLINICS.filter((code) => groupList.split(",").includes(code)) as string[],
    [groupList],
  );
  const clinics = useQuery(() => Clinics().find({ sort: ["name"] }));
  const [chosen, choose] = useRemembered("fernhill-front-desk-clinic", "");
  const [client, setClient] = useState<string>();
  const [bookFor, setBookFor] = useState<string>();
  const mine = useMemo(
    () => (clinics.data ?? []).filter((clinic) => own.length === 0 || own.includes(clinic.code)),
    [clinics.data, own],
  );
  const options = mine.map((clinic) => ({
    value: clinic.code,
    label: clinic.name.replace(/^Fernhill /, ""),
  }));
  const clinic = options.some((one) => one.value === chosen) ? chosen : (options[0]?.value ?? "");
  const current = mine.find((one) => one.code === clinic);
  const waiting = useQuery(
    async () =>
      clinic
        ? totalOf(
            await Registrations().aggregate({
              filter: {
                and: [
                  { column: "clinic", value: clinic },
                  { column: "status", value: "new" },
                ],
              },
            }),
            "count",
          )
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
            clinicOptions={mine.map((one) => ({ value: one.code, label: one.name }))}
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
    <PageShell
      title={current?.name ?? context.app.title}
      subtitle={`Front desk${current ? ` · ${current.phone}` : ""}`}
      logo={logoUrl()}
      width="full"
      nav={SECTIONS.map((item) => ({
        label: item.label,
        current: section === item.id,
        onSelect: () => go(item.id),
        ...(item.id === "callbacks" ? { count: waiting.data ?? 0 } : {}),
      }))}
      actions={
        <>
          {options.length > 1 ? (
            <SegmentedControl
              label="Clinic"
              size="small"
              value={clinic}
              options={options}
              onChange={choose}
            />
          ) : null}
          <span className="hidden items-center gap-2 text-meta text-ink-muted sm:inline-flex">
            <Avatar name={who} size="small" decorative />
            <span className="max-w-40 truncate">{who}</span>
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
        </>
      }
    >
      {body()}
    </PageShell>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
