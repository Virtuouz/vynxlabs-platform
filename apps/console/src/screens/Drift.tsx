import { Closing, SideSheet } from "@vynxlabs/ui";
import { useState } from "react";
import { useLoad } from "../api.ts";
import { DiffView } from "../kit/DiffView.tsx";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { FilterChips, Panel, SectionLabel } from "../kit/layout.tsx";
import { Mono, type State, StatePill } from "../kit/status.tsx";
import { useUrlParam } from "../router.tsx";

type DriftState = "in_sync" | "changed" | "only_here" | "only_there";

interface DriftItem {
  path: string;
  kind: string;
  state: DriftState;
  ownership: string;
  about: string[];
  staysOnPromote: boolean;
}

interface Drift {
  target: { id: string; name: string; slug: string; type: string };
  versions: { here: number | null; there: number | null };
  counts: Record<DriftState, number>;
  items: DriftItem[];
}

const WORDS = (here: string, there: string): Record<DriftState, [string, State]> => ({
  changed: [`Changed in ${here}`, "warning"],
  only_here: [`Only in ${here}`, "ahead"],
  only_there: [`Only in ${there}`, "behind"],
  in_sync: ["In sync", "synced"],
});

/** The first letter lowered, and the names after it kept as they are. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * How this workspace's resources differ from those of the workspace it
 * promotes to, now: each resource changed, only on one side, or the same,
 * with what differs.
 */
export function DriftView({ root, hereName }: { root: string; hereName: string }) {
  const drift = useLoad<Drift>(`${root}/drift`);
  const [shown, setShown] = useUrlParam<DriftState | "differs">("show", "differs");
  const [open, setOpen] = useState<DriftItem>();
  const data = drift.data;
  const there = data?.target.name ?? "production";
  const words = WORDS(hereName, there);
  const items = (data?.items ?? []).filter((item) =>
    shown === "differs" ? item.state !== "in_sync" : item.state === shown,
  );
  const differs = data ? data.counts.changed + data.counts.only_here + data.counts.only_there : 0;
  return (
    <section className="flex flex-col gap-2" aria-label="Drift">
      <SectionLabel>
        How {hereName} differs from {there}
      </SectionLabel>
      {drift.error ? <ErrorState error={drift.error} onRetry={drift.reload} /> : null}
      {!data ? (
        <p className="m-0 text-ink-muted">Comparing…</p>
      ) : (
        <Panel className="flex flex-col gap-3 p-4">
          <p className="m-0 text-meta text-ink-muted">
            {hereName} runs <Mono>v{data.versions.here ?? "–"}</Mono>, {there} runs{" "}
            <Mono>v{data.versions.there ?? "–"}</Mono>.{" "}
            {differs === 0
              ? `${hereName} and ${there} run the same resources.`
              : `${differs} of ${data.items.length} resources differ.`}
          </p>
          <FilterChips
            label="Which resources"
            value={shown}
            onChange={(next) => setShown(next as DriftState | "differs")}
            options={[
              { value: "differs", label: "All that differ", count: differs },
              { value: "changed", label: words.changed[0], count: data.counts.changed },
              { value: "only_here", label: words.only_here[0], count: data.counts.only_here },
              { value: "only_there", label: words.only_there[0], count: data.counts.only_there },
              { value: "in_sync", label: "In sync", count: data.counts.in_sync },
            ]}
          />
          {items.length === 0 ? (
            <p className="m-0 text-ink-muted">Nothing here.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {items.map((item) => (
                <li key={item.path}>
                  <button
                    type="button"
                    className="flex w-full min-w-0 flex-col gap-0.5 px-1 py-2 text-left hover:bg-selected md:flex-row md:items-center md:gap-3"
                    onClick={() => setOpen(item)}
                  >
                    <span className="flex min-w-0 items-center gap-2 md:w-[45%]">
                      <Mono>{item.path}</Mono>
                      <span className="shrink-0 text-meta text-ink-subtle">{item.kind}</span>
                    </span>
                    <StatePill state={words[item.state][1]}>{words[item.state][0]}</StatePill>
                    <span className="min-w-0 truncate text-meta text-ink-muted">
                      {item.staysOnPromote
                        ? "Made there: a promotion leaves it."
                        : (item.about[0] ?? "")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <Closing subject={open}>
        {(open, shown) => (
          <DriftSheet
            open={shown}
            root={root}
            item={open}
            hereName={hereName}
            thereName={there}
            onClose={() => setOpen(undefined)}
          />
        )}
      </Closing>
    </section>
  );
}

/** One resource on both sides: what differs, in sentences and line by line. */
function DriftSheet({
  root,
  item,
  hereName,
  thereName,
  open,
  onClose,
}: {
  root: string;
  item: DriftItem;
  hereName: string;
  thereName: string;
  open: boolean;
  onClose: () => void;
}) {
  const one = useLoad<{
    here: unknown;
    there: unknown;
    about: string[];
  }>(`${root}/drift/${item.path}`);
  return (
    <SideSheet
      open={open}
      size="wide"
      onClose={onClose}
      title={item.path}
      description={`A ${item.kind}, ${lowerFirst(WORDS(hereName, thereName)[item.state][0])}.`}
    >
      <div className="flex flex-col gap-4">
        {one.error ? <ErrorState error={one.error} onRetry={one.reload} /> : null}
        {(one.data?.about ?? item.about).length > 0 ? (
          <ul className="m-0 flex flex-col gap-1 pl-5">
            {(one.data?.about ?? item.about).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {one.data ? (
          <DiffView
            before={one.data.there}
            after={one.data.here}
            beforeLabel={thereName}
            afterLabel={hereName}
            testId="drift-diff"
          />
        ) : (
          <Loading />
        )}
      </div>
    </SideSheet>
  );
}
