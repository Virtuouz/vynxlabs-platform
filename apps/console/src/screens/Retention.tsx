import { TextField } from "@volvel/ui";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { count } from "../kit/format.ts";
import { ErrorState, Pending } from "../kit/LoadState.tsx";
import { SaveBar } from "../kit/SaveBar.tsx";
import { Page } from "../ListScreen.tsx";

type Kind = "runsDays" | "eventsDays" | "refusalsDays" | "auditDays";

interface Retention extends Record<Kind, number | null> {
  effective: Record<Kind, number>;
  defaults: Record<Kind, number>;
  bounds: Record<Kind, { min: number; max: number }>;
}

const KINDS: { key: Kind; label: string; about: string }[] = [
  {
    key: "runsDays",
    label: "Runs",
    about: "Script and flow runs, with their logs, steps and inputs and outputs, after they end.",
  },
  { key: "eventsDays", label: "Events", about: "Events published by scripts, flows and the API." },
  {
    key: "refusalsDays",
    label: "Refused requests",
    about: "Webhook requests and SCIM pushes that were turned away.",
  },
  {
    key: "auditDays",
    label: "Audit log",
    about:
      "Who changed what. Entries older than the period are hidden here and left out of the tenant's export at once. They leave with their month, which the instance exports whole to its object store before removing it, so they can be some time past the period. Until then, a longer period shows them again. Files that rows replaced or were deleted with are kept for this long too, and are deleted after it.",
  },
];

/** How long this tenant's history is kept, kind by kind, with the instance's default beside each. */
export function RetentionSettings({ base, bare = false }: { base: string; bare?: boolean }) {
  const loaded = useLoad<Retention>(`${base}/retention`);
  const [draft, setDraft] = useState<Partial<Record<Kind, string>>>({});
  const [busy, setBusy] = useState(false);
  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  if (!loaded.data) return <Pending of={loaded} />;
  const data = loaded.data;

  const value = (key: Kind) => draft[key] ?? (data[key] === null ? "" : String(data[key]));
  const problem = (key: Kind) => {
    const text = value(key).trim();
    if (text === "") return undefined;
    const days = Number(text);
    const { min, max } = data.bounds[key];
    return Number.isInteger(days) && days >= min && days <= max
      ? undefined
      : `A whole number of days from ${min} to ${max}.`;
  };
  const changed = KINDS.filter(({ key }) => draft[key] !== undefined);
  const invalid = KINDS.some(({ key }) => problem(key));
  /** The days a field asks for: its number, or the instance's default when it is empty. */
  const days = (key: Kind) => {
    const text = (draft[key] ?? "").trim();
    return text === "" ? data.defaults[key] : Number(text);
  };

  const save = async () => {
    if (changed.length === 0 || invalid) return;
    // A shorter period removes what is older within minutes: that is said, kind by kind, first.
    const shorter = changed.filter(({ key }) => days(key) < data.effective[key]);
    if (shorter.length > 0) {
      const sure = await ask.confirm({
        title:
          shorter.length === 1
            ? `Keep ${shorter[0]?.label.toLowerCase()} for less time?`
            : "Keep this history for less time?",
        text: (
          <div className="flex flex-col gap-2">
            <ul className="m-0 flex flex-col gap-1 pl-5">
              {shorter.map(({ key, label }) => (
                <li key={key}>
                  {label}: from {count(data.effective[key])} days to {count(days(key))}.
                </li>
              ))}
            </ul>
            {shorter.some(({ key }) => key !== "auditDays") && (
              <p className="m-0">
                {shorter.some(({ key }) => key === "auditDays")
                  ? `${shorter
                      .filter(({ key }) => key !== "auditDays")
                      .map(({ label }) => label)
                      .join(
                        ", ",
                      )} older than that are removed within minutes of saving, and cannot be brought back.`
                  : "Anything older is removed within minutes of saving, and cannot be brought back."}
              </p>
            )}
            {shorter.some(({ key }) => key === "auditDays") && (
              <p className="m-0">
                Audit log: entries older than the new period stop showing at once, and are left out
                of the tenant's export. They are removed with their month, some time after, and then
                cannot be brought back. Until then, if you lengthen the period again, they show
                again. Also, files that rows replaced, or were deleted with, longer ago than the new
                period are deleted too.
              </p>
            )}
          </div>
        ),
        action: "Save and remove older history",
        danger: true,
      });
      if (!sure) return;
    }
    setBusy(true);
    try {
      await api.put(
        `${base}/retention`,
        Object.fromEntries(
          changed.map(({ key }) => {
            const text = (draft[key] ?? "").trim();
            return [key, text === "" ? null : Number(text)];
          }),
        ),
      );
      setDraft({});
      loaded.reload();
      notify.success("Retention saved.");
    } catch (caught) {
      notify.error(caught);
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <form
        className="flex max-w-xl flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {KINDS.map(({ key, label, about }) => (
          <TextField
            key={key}
            name={key}
            label={`${label} (days)`}
            value={value(key)}
            required={false}
            placeholder={`${data.defaults[key]}, the instance's default`}
            hint={`${about} Now ${data.effective[key]} days.`}
            error={problem(key)}
            onChange={(next) => setDraft((was) => ({ ...was, [key]: next }))}
          />
        ))}
      </form>
      <SaveBar
        dirty={changed.length > 0}
        saving={busy}
        onSave={() => void save()}
        onDiscard={() => setDraft({})}
        what="retention"
      />
    </>
  );
  // In a sheet beside a list, the title is the sheet's own.
  if (bare) return body;
  return (
    <Page
      title="Retention"
      description="How long this tenant's history is kept. Runs, events and refused requests older than their period are removed within minutes; the audit log is different, as said under it. Leave a field empty to use the instance's default."
    >
      {body}
    </Page>
  );
}
