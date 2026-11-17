import { Button, Dialog, Menu, type MenuItem, Tooltip } from "@vynxlabs/ui";
import { ArrowDown, ArrowUp, Bookmark, Columns3 } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, copyText, notify } from "../ask.tsx";
import { navigate } from "../router.tsx";
import type { Density } from "./DataTable.tsx";

/**
 * Saved views of a list (phase 15, P3-4): its filters, sort, columns and
 * density, by name, private to the member who saved them. A view is the
 * list's address, less the row that is open, so its link is the view: anyone
 * who may see the list opens it the same.
 */

interface SavedView {
  id: string;
  name: string;
  state: { query?: string; density?: Density };
}

/** The address's query as a view keeps it: without the open row, its names in a fixed order. */
export function viewQuery(search: string, omit: string[]): string {
  const query = new URLSearchParams(search);
  for (const name of omit) query.delete(name);
  // By name only: a list's values keep their order, which is meaning (the columns' order).
  const pairs = [...query.entries()].sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(pairs).toString();
}

export function ViewsMenu({
  tenantId,
  workspaceId,
  list,
  omit = [],
  density,
}: {
  tenantId: string;
  /** Absent for a list of the tenant's own, such as its audit log. */
  workspaceId?: string | undefined;
  /** Which list: `runs`, `audit`, `events`. */
  list: string;
  /** Address keys that are not the view: the open row, for one. */
  omit?: string[];
  /** The list's density, kept with a view and put back with it. */
  density?: { value: Density; set: (next: Density) => void } | undefined;
}) {
  const where = new URLSearchParams({
    tenant: tenantId,
    ...(workspaceId ? { workspace: workspaceId } : {}),
    list,
  });
  const views = useLoad<{ items: SavedView[] }>(`/me/views?${where}`);
  const [chosen, setChosen] = useState<string>();
  const current = viewQuery(location.search, omit);
  // Only what has the shape of a view: anything else is not shown.
  const items = (views.data?.items ?? []).filter(
    (view) => typeof view?.id === "string" && typeof view.state === "object" && view.state !== null,
  );
  const same = (view: SavedView) =>
    (view.state.query ?? "") === current &&
    (density === undefined ||
      view.state.density === undefined ||
      view.state.density === density.value);
  const showing = items.find(same);
  const last = items.find((view) => view.id === chosen);
  const state = () => ({ query: current, ...(density ? { density: density.value } : {}) });

  const apply = (view: SavedView) => {
    setChosen(view.id);
    const query = view.state.query ?? "";
    navigate(`${location.pathname}${query ? `?${query}` : ""}`);
    if (view.state.density && density) density.set(view.state.density);
  };
  const save = async () => {
    const name = await ask.prompt({
      title: "Save this view",
      label: "Name",
      action: "Save",
      placeholder: "Failed in the last day",
    });
    if (!name) return;
    try {
      const made = await api.post<SavedView>("/me/views", {
        tenantId,
        ...(workspaceId ? { workspaceId } : {}),
        list,
        name,
        state: state(),
      });
      setChosen(made.id);
      views.reload();
      notify.success(
        `Saved as “${made.name}”. Only you see it in this menu; its link opens it for anyone.`,
      );
    } catch (error) {
      notify.error(error);
    }
  };
  const update = async (view: SavedView) => {
    try {
      await api.patch(`/me/views/${view.id}`, { state: state() });
      views.reload();
      notify.success(`“${view.name}” now shows this.`);
    } catch (error) {
      notify.error(error);
    }
  };
  const rename = async (view: SavedView) => {
    const name = await ask.prompt({
      title: `Rename “${view.name}”`,
      label: "Name",
      action: "Rename",
      initial: view.name,
    });
    if (!name || name === view.name) return;
    await api.patch(`/me/views/${view.id}`, { name }).then(views.reload, notify.error);
  };
  const remove = async (view: SavedView) => {
    const sure = await ask.confirm({
      title: `Delete the view “${view.name}”?`,
      text: "Links to it still open the same list: the view is in the link.",
      action: "Delete",
      danger: true,
    });
    if (!sure) return;
    await api.delete(`/me/views/${view.id}`).then(views.reload, notify.error);
    if (chosen === view.id) setChosen(undefined);
  };

  const menu: MenuItem[] = [
    ...items.map((view) => ({
      label: view.name,
      icon: <Bookmark aria-hidden="true" size={14} />,
      current: showing?.id === view.id,
      onSelect: () => apply(view),
    })),
    {
      label: "Save this view…",
      separated: items.length > 0,
      onSelect: () => void save(),
    },
    ...(last && !same(last)
      ? [{ label: `Save over “${last.name}”`, onSelect: () => void update(last) }]
      : []),
    ...(showing
      ? [
          { label: `Rename “${showing.name}”…`, onSelect: () => void rename(showing) },
          { label: `Delete “${showing.name}”`, danger: true, onSelect: () => void remove(showing) },
        ]
      : []),
    {
      label: "Copy a link to this view",
      separated: true,
      onSelect: () => {
        const query = current;
        void copyText(
          `${location.origin}${location.pathname}${query ? `?${query}` : ""}`,
          "Link to this view copied.",
        );
      },
    },
  ];

  return (
    <Menu
      ariaLabel="Saved views"
      align="end"
      triggerClassName={`flex h-7 items-center gap-1.5 rounded-control text-meta hover:bg-sunken ${
        showing
          ? "border border-line-control bg-surface px-2"
          : "w-7 justify-center text-ink-muted hover:text-ink"
      }`}
      label={
        <>
          <Bookmark aria-hidden="true" size={showing ? 14 : 16} />
          {/* The view showing is named; otherwise the button is its icon, named for screen readers. */}
          {showing ? <span className="max-w-32 truncate">{showing.name}</span> : null}
        </>
      }
      items={menu}
    />
  );
}

/**
 * Which columns a list shows, and in what order: a check to show or hide
 * each, and Move up and Move down, so the order is changed by keyboard as
 * easily as by pointer. The first column says what a row is and stays.
 */
export function ColumnsMenu({
  columns,
  shown,
  onChange,
}: {
  /** Every column but the first, which always shows. */
  columns: { key: string; label: string }[];
  /** The keys shown, in order; absent means every column, as defined. */
  shown: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const order = shown && shown.length > 0 ? shown : columns.map((column) => column.key);
  const hidden = columns.filter((column) => !order.includes(column.key));
  const labelOf = (key: string) => columns.find((column) => column.key === key)?.label ?? key;
  const set = (next: string[]) => {
    const all = columns.map((column) => column.key);
    // Every column, in the order defined, is no choice at all: kept out of the address.
    onChange(
      next.length === all.length && next.every((key, at) => key === all[at]) ? undefined : next,
    );
  };
  const move = (key: string, by: -1 | 1) => {
    const at = order.indexOf(key);
    const to = at + by;
    if (at < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[at], next[to]] = [next[to] as string, next[at] as string];
    set(next);
  };
  return (
    <>
      <Tooltip label="Choose and order the columns">
        <button
          type="button"
          aria-label="Columns"
          onClick={() => setOpen(true)}
          className="inline-flex size-7 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <Columns3 aria-hidden="true" size={16} />
        </button>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} title="Columns">
        <div className="flex flex-col gap-3">
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Shown, in order">
            {order.map((key, at) => (
              <li
                key={key}
                className="flex items-center gap-2 rounded-control px-2 py-1 hover:bg-sunken"
              >
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked
                    disabled={order.length === 1}
                    onChange={() => set(order.filter((one) => one !== key))}
                    className="size-4 accent-[var(--color-action)]"
                  />
                  <span className="truncate">{labelOf(key)}</span>
                </label>
                <Button
                  size="small"
                  variant="quiet"
                  aria-label={`Move ${labelOf(key)} up`}
                  disabled={at === 0}
                  onClick={() => move(key, -1)}
                >
                  <ArrowUp aria-hidden="true" size={14} />
                </Button>
                <Button
                  size="small"
                  variant="quiet"
                  aria-label={`Move ${labelOf(key)} down`}
                  disabled={at === order.length - 1}
                  onClick={() => move(key, 1)}
                >
                  <ArrowDown aria-hidden="true" size={14} />
                </Button>
              </li>
            ))}
          </ul>
          {hidden.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Hidden">
              {hidden.map((column) => (
                <li key={column.key} className="flex items-center gap-2 px-2 py-1">
                  <label className="flex items-center gap-2 text-ink-muted">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => set([...order, column.key])}
                      className="size-4 accent-[var(--color-action)]"
                    />
                    {column.label}
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex justify-between gap-2">
            <Button size="small" variant="quiet" onClick={() => onChange(undefined)}>
              Show every column
            </Button>
            <Button size="small" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
