import { useQuery } from "@vynxlabs/app";
import { Badge, Button, EmptyState, Notice, NumberField, useToast } from "@vynxlabs/ui";
import { useMemo, useState } from "react";
import {
  attempt,
  Inventory,
  Loading,
  Panel,
  pounds,
  type Registration,
  Registrations,
  type StockLine,
} from "./shared.tsx";

/** A clinic's stock, the low lines first. "Use" takes items out as the person using them. */
export function Stock({ clinic }: { clinic: string }) {
  const lines = useQuery(
    () =>
      Inventory().find({ filter: { column: "clinic", value: clinic }, sort: ["item"], limit: 500 }),
    [clinic],
  );
  const [category, setCategory] = useState("all");
  const all = lines.data?.items ?? [];
  const categories = useMemo(() => [...new Set(all.map((line) => line.category))].sort(), [all]);
  const shown = all
    .filter((line) => category === "all" || line.category === category)
    .sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || a.item.localeCompare(b.item));
  const low = all.filter(isLow);

  if (lines.error) {
    return (
      <Notice tone="danger" action={<Button onClick={lines.reload}>Try again</Button>}>
        {lines.error.message}
      </Notice>
    );
  }
  if (!lines.data) return <Loading what="stock" />;
  if (all.length === 0)
    return <EmptyState title="No stock lines">Nothing is recorded for this clinic.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      {low.length > 0 ? (
        <Notice tone="attention">
          {low.length} line{low.length === 1 ? " is" : "s are"} at or under the reorder level.{" "}
          {low.filter((line) => line.reorder_pending).length} already on order. The rest are ordered
          at the next stock check, within half an hour.
        </Notice>
      ) : null}
      <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
        <legend className="sr-only">Category</legend>
        {["all", ...categories].map((name) => (
          <Button
            key={name}
            size="small"
            variant={category === name ? "primary" : "secondary"}
            onClick={() => setCategory(name)}
          >
            {name === "all" ? "Everything" : name}
          </Button>
        ))}
      </fieldset>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {shown.map((line) => (
          <StockRow key={line.id} line={line} onUsed={lines.reload} />
        ))}
      </ul>
    </div>
  );
}

const isLow = (line: StockLine) => line.on_hand <= line.reorder_at;

function StockRow({ line, onUsed }: { line: StockLine; onUsed: () => void }) {
  const toast = useToast();
  const [quantity, setQuantity] = useState<number | undefined>(1);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const low = isLow(line);
  const use = async () => {
    if (!quantity) return;
    setBusy(true);
    setProblem(undefined);
    const result = await attempt<{ on_hand: number }>("inventory/use", { line: line.id, quantity });
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    toast.success(`${line.item}: ${result.output.on_hand} left.`);
    onUsed();
  };
  return (
    <li
      className={`flex flex-col gap-2 rounded-panel border bg-surface p-3 ${low ? "border-attention" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{line.item}</span>
          <span className="font-mono text-meta text-ink-muted">
            {line.sku} · {line.category} · {pounds(line.unit_cost)} each
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`font-mono text-title ${low ? "text-attention" : ""}`}>
            {line.on_hand}
          </span>
          {line.reorder_pending ? (
            <Badge tone="action">Ordering</Badge>
          ) : low ? (
            <Badge tone="attention">Low</Badge>
          ) : null}
        </div>
      </div>
      <p className="m-0 text-meta text-ink-subtle">
        Reorder at {line.reorder_at}, {line.reorder_qty} at a time.
      </p>
      <div className="flex items-end gap-2">
        <div className="w-24">
          <NumberField
            name={`use-${line.id}`}
            label="Use"
            value={quantity}
            min={1}
            max={Math.max(1, line.on_hand)}
            onChange={setQuantity}
          />
        </div>
        <Button size="small" disabled={busy || !quantity || line.on_hand === 0} onClick={use}>
          {busy ? "…" : "Take out"}
        </Button>
      </div>
      {problem ? (
        <p className="m-0 text-meta text-danger" role="alert">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

/** People who asked to register through the public form, for the clinic to call back. */
export function Callbacks({ clinic }: { clinic: string }) {
  const toast = useToast();
  const found = useQuery(
    () =>
      Registrations().find({
        filter: {
          and: [
            { column: "clinic", value: clinic },
            { column: "status", value: "new" },
          ],
        },
        sort: ["created_at"],
        limit: 200,
      }),
    [clinic],
  );
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const done = async (row: Registration) => {
    setBusy(row.id);
    setProblem(undefined);
    try {
      await Registrations().update(row.id, { status: "called back" });
      toast.success(`${row.name} marked as called back.`);
      found.reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(undefined);
    }
  };
  if (found.error) return <Notice tone="danger">{found.error.message}</Notice>;
  if (!found.data) return <Loading what="callbacks" />;
  const rows = found.data.items;
  return (
    <Panel title={`To call back (${rows.length})`}>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {rows.length === 0 ? (
        <EmptyState title="Nobody waiting">
          New registrations from the website appear here.
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 border-line border-b py-3 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {row.name}{" "}
                  <span className="font-normal text-ink-muted">
                    with {row.pet_name} ({row.species})
                  </span>
                </span>
                <span className="text-meta text-ink-muted">
                  <a href={`tel:${row.phone.replace(/\s+/g, "")}`}>{row.phone}</a>
                  {row.email ? ` · ${row.email}` : ""} · asked{" "}
                  {new Date(row.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <Button size="small" disabled={busy === row.id} onClick={() => done(row)}>
                {busy === row.id ? "…" : "Mark called back"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
