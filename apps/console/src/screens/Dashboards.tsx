import {
  DASHBOARD_FILTER_TYPES,
  DASHBOARD_REFRESH,
  type DashboardBody,
  type DashboardFilter,
  type DashboardRefresh,
  type DashboardWidget,
  DEFAULT_DASHBOARD_REFRESH,
  placeWidgets,
  RELATIVE_RANGES,
  WIDGET_SIZE,
  type WidgetPlace,
} from "@vynxlabs/manifest";
import { settle, usePlacement } from "@vynxlabs/screens";
import {
  Button,
  CheckboxField,
  Closing,
  Dialog,
  EmptyState,
  Menu,
  MultiSelectField,
  Notice,
  SelectField,
  TextField,
} from "@vynxlabs/ui";
import { Ellipsis, Move, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ApiError, api, invalidatePrefix, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { useShortcut } from "../kit/keys.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { useTitleObject } from "../kit/title.ts";
import { Page } from "../ListScreen.tsx";
import { Link, navigate, useUrlParam } from "../router.tsx";
import { type FilterSetting, filterValues, RANGE_LABELS } from "./dashboards/model.ts";
import { WidgetEditor } from "./dashboards/WidgetEditor.tsx";
import { FilterBar, WidgetCard } from "./dashboards/Widgets.tsx";

const REFRESH_WORDS: Record<Exclude<DashboardRefresh, "off">, string> = {
  1: "minute",
  5: "5 minutes",
  15: "15 minutes",
  60: "hour",
};

interface Summary {
  id: string;
  kind: "member" | "resource";
  path: string | null;
  title: string;
  mine: boolean;
  owner: string;
  shared: boolean;
  sharedWith?: { id: string; name: string }[];
  revision: number;
  updatedAt: string;
}
interface Dashboard extends Summary {
  body: DashboardBody;
  /** It was made before dashboards asked queries, and is shown converted. */
  upgraded: boolean;
}

/** Dashboards in a workspace: the reader's own, those shared with them, and those the workspace keeps. */
export function Dashboards({ root, link }: { root: string; link: string }) {
  const list = useLoad<{ items: Summary[] }>(`${root}/dashboards`);
  const create = async () => {
    const title = await ask.prompt({
      title: "New dashboard",
      text: "It is yours alone until you choose to share it.",
      label: "Name",
      action: "Make the dashboard",
    });
    if (!title) return;
    try {
      const made = await api.post<Dashboard>(`${root}/dashboards`, { title });
      navigate(`${link}/dashboards/${made.id}?edit=1`);
    } catch (error) {
      notify.error(error);
    }
  };
  const action = (
    <Button variant="primary" onClick={create}>
      New dashboard
    </Button>
  );
  return (
    <Page
      title="Dashboards"
      description="Questions asked of this workspace's tables, and their answers drawn: figures, charts, tables and pivots. Build a question from menus, use a query the workspace keeps, or write SQL. Everyone who looks at a dashboard sees the rows they may read."
      action={action}
    >
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <DataTable<Summary>
          variant="static"
          framed
          label="Dashboards"
          rows={list.data.items}
          rowKey={(row) => row.id}
          empty={
            <EmptyState title="No dashboards yet" action={action}>
              Make one to keep an eye on the tables you care about.
            </EmptyState>
          }
          columns={[
            {
              header: "Dashboard",
              cell: (row) => (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Link to={`${link}/dashboards/${row.id}`} className="font-medium text-action">
                    {row.title}
                  </Link>
                  {row.kind === "resource" ? <Tag>Resource</Tag> : null}
                </span>
              ),
            },
            {
              header: "Whose",
              cell: (row) =>
                row.kind === "resource" ? "The workspace's" : row.mine ? "Yours" : row.owner,
            },
            {
              header: "Seen by",
              cell: (row) =>
                row.kind === "resource" || row.shared ? (
                  "Everyone here"
                ) : row.sharedWith && row.sharedWith.length > 0 ? (
                  row.sharedWith.map((group) => group.name).join(", ")
                ) : (
                  <span className="text-ink-muted">Only you</span>
                ),
            },
            { header: "Changed", cell: (row) => <Time value={row.updatedAt} mode="ago" /> },
          ]}
        />
      ) : null}
    </Page>
  );
}

/** A name a filter or a widget can go by, made from what a person called it. */
const slug = (text: string, taken: string[], fallback: string, separator: "_" | "-") => {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, separator)
      .replace(new RegExp(`^[^a-z]+|\\${separator}+$`, "g"), "")
      .slice(0, 30) || fallback;
  let name = base;
  for (let n = 2; taken.includes(name); n += 1) name = `${base}${separator}${n}`;
  return name;
};

/** One dashboard: looked at by anyone it is open to, and changed by the member whose it is. */
export function DashboardView({ root, link, id }: { root: string; link: string; id: string }) {
  const [loaded, setLoaded] = useState<Dashboard>();
  const [missing, setMissing] = useState<ApiError>();
  const [mode, setMode] = useUrlParam("edit");
  const [set, setSet] = useUrlParam("f");
  const [editing, setEditing] = useState<DashboardWidget>();
  const [filtering, setFiltering] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Its name is the last crumb, which makes "Dashboards" before it the way back to the list.
  useTitleObject(loaded?.title);

  useEffect(() => {
    let current = true;
    setLoaded(undefined);
    api.get<Dashboard>(`${root}/dashboards/${id}`).then(
      (dashboard) => current && setLoaded(dashboard),
      (error: ApiError) => current && setMissing(error),
    );
    return () => {
      current = false;
    };
  }, [root, id]);

  // What the filters are set to, kept in the address so a link shows the same thing.
  const settings = useMemo<Record<string, FilterSetting>>(() => {
    try {
      return set ? (JSON.parse(set) as Record<string, FilterSetting>) : {};
    } catch {
      return {};
    }
  }, [set]);
  const body = loaded?.body;
  const values = useMemo(() => filterValues(body?.filters ?? [], settings), [body, settings]);

  // When each widget's answer was read. The dashboard is as old as the oldest of them.
  const [readAt, setReadAt] = useState<Record<string, number>>({});
  const noteRead = useCallback(
    (widgetId: string, at: number) =>
      setReadAt((before) => (before[widgetId] === at ? before : { ...before, [widgetId]: at })),
    [],
  );
  // What the layout was before each change made here, for ⌘Z.
  const undone = useRef<DashboardWidget[][]>([]);
  const saving = useRef<(widgets: DashboardWidget[]) => void>(() => {});
  const editingNow = loaded?.kind === "member" && loaded.mine && mode === "1";
  useShortcut(
    "undo",
    () => {
      const before = undone.current.pop();
      if (!before) return false;
      saving.current(before);
    },
    { enabled: editingNow },
  );
  const placement = usePlacement({
    places: JSON.stringify(placeWidgets(body?.widgets ?? []).map((one) => [one.id, one.at])),
    onMove: editingNow ? (widgetId, at) => placing.current(widgetId, at) : undefined,
    least: { w: 2, h: 2 },
  });
  const placing = useRef<(id: string, at: WidgetPlace) => void>(() => {});
  // The grid places widgets where the page is wide enough; narrower, they are one column in order.
  const [placed, setPlaced] = useState(false);
  const measured = useRef<ResizeObserver | undefined>(undefined);
  const gridRef = placement.grid;
  const grid = useCallback(
    (node: HTMLDivElement | null) => {
      gridRef.current = node;
      measured.current?.disconnect();
      if (!node || typeof ResizeObserver !== "function") return;
      // 48rem: where `@3xl` begins.
      measured.current = new ResizeObserver(() => setPlaced(node.clientWidth >= 768));
      measured.current.observe(node);
    },
    [gridRef],
  );

  if (missing) return <ErrorState error={missing} />;
  if (!loaded || !body) return <Loading />;
  const mine = loaded.kind === "member" && loaded.mine;
  const edit = mine && mode === "1";

  /** Saves the dashboard with what changed, and shows it as saved. */
  const save = async (change: {
    body?: DashboardBody;
    title?: string;
    shared?: boolean;
    sharedWith?: string[];
  }) => {
    try {
      const saved = await api.put<Dashboard>(`${root}/dashboards/${id}`, {
        ...change,
        revision: loaded.revision,
      });
      setLoaded(saved);
      return true;
    } catch (error) {
      notify.error(error);
      return false;
    }
  };
  const withWidgets = (widgets: DashboardWidget[]) => save({ body: { ...body, widgets } });
  // Every widget with a place: its own, or one given to it in order if it has none yet.
  const widgets = placeWidgets(body.widgets);
  const place = (widgetId: string, at: WidgetPlace) => {
    const next = widgets.map((one) => ({ ...one, at: one.id === widgetId ? at : { ...one.at } }));
    // It stays where it was put, and whatever it now lies on moves down out of its way.
    settle(next, widgetId);
    undone.current.push(body.widgets);
    void withWidgets(next);
  };
  placing.current = place;
  saving.current = (before) => void withWidgets(before);
  const add = () =>
    setEditing({
      id: slug(
        "widget",
        body.widgets.map((one) => one.id),
        "widget",
        "-",
      ),
      type: "table",
      source: { visual: { table: "" } },
    });
  const refresh = body.refresh ?? DEFAULT_DASHBOARD_REFRESH;
  // Nothing asks again under someone who is changing it.
  const every = refresh === "off" || edit ? undefined : refresh * 60_000;
  const asking = widgets.filter((one) => one.type !== "text").map((one) => one.id);
  const times = asking.map((one) => readAt[one]).filter((at): at is number => at !== undefined);
  const asOf = times.length === asking.length && times.length > 0 ? Math.min(...times) : undefined;
  const audience = loaded.shared
    ? "Everyone in this workspace"
    : (loaded.sharedWith ?? []).length > 0
      ? (loaded.sharedWith ?? []).map((group) => group.name).join(", ")
      : "Only you";

  return (
    <Page
      title={loaded.title}
      description={
        loaded.kind === "resource"
          ? `A dashboard the workspace keeps, at ${loaded.path}. It is changed where resources are, and reaches production by promotion.`
          : mine
            ? `Yours. Seen by: ${audience.toLowerCase()}.`
            : `${loaded.owner}'s, shared with you. You see the rows you may read.`
      }
      action={
        <span className="flex flex-wrap items-center gap-2">
          {mine ? (
            <>
              <Button onClick={() => setSharing(true)}>Share</Button>
              <Button
                variant={edit ? "primary" : "secondary"}
                aria-pressed={edit}
                onClick={() => setMode(edit ? undefined : "1")}
              >
                {edit ? "Done" : "Edit"}
              </Button>
              <Menu
                ariaLabel="More"
                align="end"
                triggerClassName="inline-flex size-8 items-center justify-center rounded-control border border-line-control hover:bg-sunken"
                label={<Ellipsis aria-hidden="true" size={16} />}
                items={[
                  {
                    label: "Rename…",
                    onSelect: async () => {
                      const title = await ask.prompt({
                        title: "Rename the dashboard",
                        label: "Name",
                        initial: loaded.title,
                        action: "Rename",
                      });
                      if (title) void save({ title });
                    },
                  },
                  {
                    label: "Keep it as a resource of the workspace…",
                    onSelect: async () => {
                      const path = await ask.prompt({
                        title: "Keep it as a resource",
                        text: "A copy is saved as a draft of a dashboard resource: versioned, deployed and promoted with the rest of the workspace, and open to everyone who may see dashboards. Yours stays as it is.",
                        label: "Its path, such as boards/lending",
                        action: "Save the draft",
                      });
                      if (!path) return;
                      try {
                        await api.put(`${root}/drafts/${path}`, {
                          kind: "dashboard",
                          schemaVersion: 1,
                          body: { ...body, title: loaded.title },
                        });
                        notify.success(`${path} is saved as a draft. Deploy it to keep it.`, {
                          link: { label: "Review and deploy", href: `${link}/release` },
                        });
                      } catch (error) {
                        notify.error(error);
                      }
                    },
                  },
                  {
                    label: "Delete…",
                    danger: true,
                    separated: true,
                    onSelect: async () => {
                      const sure = await ask.confirm({
                        title: `Delete ${loaded.title}?`,
                        text: "The dashboard is removed for you and for anyone it is shared with. No table and no row is touched.",
                        action: "Delete",
                        danger: true,
                      });
                      if (!sure) return;
                      try {
                        await api.delete(`${root}/dashboards/${id}`);
                        navigate(`${link}/dashboards`);
                      } catch (error) {
                        notify.error(error);
                      }
                    },
                  },
                ]}
              />
            </>
          ) : null}
        </span>
      }
    >
      {asking.length > 0 ? (
        <p
          className="-mt-3 m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-muted"
          data-freshness=""
        >
          <span>
            Last refreshed {asOf ? <Time value={new Date(asOf)} mode="clock" /> : "…"}
            {" · "}
            {refresh === "off"
              ? "Does not refresh by itself"
              : edit
                ? "Not refreshing while it is being changed"
                : `Refreshes every ${REFRESH_WORDS[refresh]}`}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-control px-1 text-action hover:underline"
            onClick={() => invalidatePrefix(`${root}/dashboards/${id}/widgets`)}
          >
            <RefreshCw aria-hidden="true" size={14} /> Refresh now
          </button>
        </p>
      ) : null}
      {loaded.upgraded ? (
        <Notice tone="plain">
          This dashboard was made before dashboards asked queries. It is shown as it reads now, and
          is kept that way the next time it is saved.
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterBar
          root={root}
          filters={body.filters ?? []}
          settings={settings}
          onChange={(next) =>
            setSet(Object.keys(next).length > 0 ? JSON.stringify(next) : undefined)
          }
        />
        {edit ? (
          <span className="flex flex-wrap items-end gap-2">
            <div className="w-44">
              <SelectField
                name="refresh"
                label="Refreshes"
                value={String(refresh)}
                options={DASHBOARD_REFRESH.map((one) => ({
                  value: String(one),
                  label: one === "off" ? "Never by itself" : `Every ${REFRESH_WORDS[one]}`,
                }))}
                onChange={(next) =>
                  void save({
                    body: {
                      ...body,
                      refresh: next === "off" ? "off" : (Number(next) as DashboardRefresh),
                    },
                  })
                }
              />
            </div>
            <Button onClick={() => setFiltering(true)}>Filters</Button>
            <Button variant="primary" onClick={add}>
              <Plus aria-hidden="true" size={16} /> Add a widget
            </Button>
          </span>
        ) : null}
      </div>
      {body.widgets.length === 0 ? (
        <EmptyState
          title="Nothing on it yet"
          action={
            mine ? (
              <Button
                variant="primary"
                onClick={() => {
                  setMode("1");
                  add();
                }}
              >
                Add a widget
              </Button>
            ) : undefined
          }
        >
          A widget asks a question of the workspace's tables and draws the answer: a figure, a
          chart, a table or a pivot.
        </EmptyState>
      ) : (
        // Laid out by the room it is given: twelve columns of rows 40 px tall where there is
        // room, and one column, top to bottom and left to right, where there is not.
        <div className="@container">
          <div
            ref={grid}
            className="grid grid-cols-1 gap-3 @3xl:auto-rows-[2.5rem] @3xl:grid-cols-12"
          >
            {[...widgets]
              .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
              .map((widget) => (
                <WidgetCard
                  key={widget.id}
                  root={root}
                  dashboard={id}
                  revision={loaded.revision}
                  body={body}
                  widget={widget}
                  values={values}
                  at={placement.at(widget.id, widget.at)}
                  placed={placed}
                  held={placement.held?.id === widget.id}
                  every={every}
                  onAsOf={noteRead}
                  onShow={
                    edit && widget.type === "table"
                      ? (show) => {
                          const { show: _before, ...options } = widget.options ?? {};
                          void withWidgets(
                            widgets.map((one) =>
                              one.id === widget.id
                                ? { ...one, options: { ...options, ...(show ? { show } : {}) } }
                                : one,
                            ),
                          );
                        }
                      : undefined
                  }
                  onGrab={
                    edit
                      ? (event, how) => placement.grab(event, widget.id, widget.at, how)
                      : undefined
                  }
                  tools={
                    edit ? (
                      <>
                        <Button
                          size="small"
                          variant="quiet"
                          aria-label={`Move ${widget.title || widget.id}: drag its heading, or press the arrow keys. Shift and the arrow keys change its size`}
                          {...placement.keys(widget.id, widget.title || widget.id, widget.at)}
                        >
                          <Move aria-hidden="true" size={14} />
                        </Button>
                        <Button
                          size="small"
                          variant="quiet"
                          aria-label={`Edit ${widget.title || widget.id}`}
                          onClick={() => setEditing(widget)}
                        >
                          <Pencil aria-hidden="true" size={14} />
                        </Button>
                        <Button
                          size="small"
                          variant="quiet"
                          aria-label={`Remove ${widget.title || widget.id}`}
                          onClick={async () => {
                            const sure = await ask.confirm({
                              title: `Remove ${widget.title || "this widget"}?`,
                              text: "It is taken off the dashboard. No table and no row is touched.",
                              action: "Remove",
                              danger: true,
                            });
                            if (sure) {
                              const rest = widgets
                                .filter((one) => one.id !== widget.id)
                                .map((one) => ({ ...one, at: { ...one.at } }));
                              // What was under it rises into the room it leaves.
                              settle(rest, undefined);
                              undone.current.push(body.widgets);
                              void withWidgets(rest);
                            }
                          }}
                        >
                          <Trash2 aria-hidden="true" size={14} />
                        </Button>
                      </>
                    ) : undefined
                  }
                />
              ))}
          </div>
          <span role="status" className="sr-only">
            {placement.said}
          </span>
        </div>
      )}

      <Closing subject={editing}>
        {(editing, shown) => (
          <WidgetEditor
            open={shown}
            key={editing.id}
            root={root}
            body={body}
            widget={editing}
            onClose={() => setEditing(undefined)}
            onSave={async (widget) => {
              const there = widgets.some((one) => one.id === widget.id);
              // A new one goes under the rest, as big as its kind is to begin with.
              const under = widgets.reduce((low, one) => Math.max(low, one.at.y + one.at.h), 0);
              const done = await withWidgets(
                there
                  ? widgets.map((one) => (one.id === widget.id ? { ...widget, at: one.at } : one))
                  : [
                      ...widgets,
                      { ...widget, at: { x: 0, y: under, ...WIDGET_SIZE[widget.type] } },
                    ],
              );
              if (done) setEditing(undefined);
            }}
          />
        )}
      </Closing>
      <Closing subject={filtering}>
        {(_filtering, shown) => (
          <FiltersDialog
            open={shown}
            root={root}
            body={body}
            onClose={() => setFiltering(false)}
            onSave={async (next) => {
              if (await save({ body: next })) setFiltering(false);
            }}
          />
        )}
      </Closing>
      <Dialog open={sharing} onClose={() => setSharing(false)} title={`Share ${loaded.title}`}>
        <div className="flex flex-col gap-4">
          <CheckboxField
            label="Show it to everyone in this workspace"
            name="shared"
            checked={loaded.shared}
            hint="They can look and not change it. Each person sees only the rows they may read."
            onChange={(shared) => void save({ shared })}
          />
          {loaded.shared ? null : (
            <SharedWith
              root={root}
              chosen={(loaded.sharedWith ?? []).map((group) => group.id)}
              onChange={(sharedWith) => void save({ sharedWith })}
            />
          )}
          <div className="flex justify-end">
            <Button onClick={() => setSharing(false)}>Done</Button>
          </div>
        </div>
      </Dialog>
    </Page>
  );
}

/** The groups of members a dashboard is shown to, when it is not shown to everyone. */
function SharedWith({
  root,
  chosen,
  onChange,
}: {
  root: string;
  chosen: string[];
  onChange: (groups: string[]) => void;
}) {
  const tenantBase = root.split("/workspaces/")[0] ?? "";
  const groups = useLoad<{ items: { id: string; name: string }[] }>(
    `${tenantBase}/groups?limit=200`,
  );
  if (!groups.data || groups.data.items.length === 0) return null;
  return (
    <MultiSelectField
      label="Or show it to these groups"
      options={groups.data.items.map((group) => ({ value: group.id, label: group.name }))}
      value={chosen}
      placeholder="Nobody else"
      hint="Members in them can look and not change it. Each sees only the rows they may read."
      onChange={onChange}
    />
  );
}

const FILTER_LABELS: Record<DashboardFilter["type"], string> = {
  date_range: "A range of dates",
  choice: "One of a list",
  text: "Text to look for",
  number: "A number",
};

/**
 * The dashboard's filters: what each is called and what it is when nobody has
 * set it. A filter narrows the widgets that are told, each in its own
 * settings, which column or parameter it goes to.
 */
function FiltersDialog({
  root,
  body,
  open,
  onClose,
  onSave,
}: {
  root: string;
  body: DashboardBody;
  open: boolean;
  onClose: () => void;
  onSave: (body: DashboardBody) => Promise<void>;
}) {
  const [filters, setFilters] = useState<DashboardFilter[]>(body.filters ?? []);
  const [busy, setBusy] = useState(false);
  const schema = useLoad<{ tables: { name: string; columns: { name: string }[] }[] }>(
    `${root}/queries/schema`,
  );
  const change = (at: number, next: Partial<DashboardFilter>) =>
    setFilters((before) =>
      before.map((one, index) => {
        if (index !== at) return one;
        const merged = { ...one, ...next } as Record<string, unknown>;
        for (const key of Object.keys(merged)) {
          if (merged[key] === undefined || merged[key] === "") delete merged[key];
        }
        return merged as unknown as DashboardFilter;
      }),
    );
  const removed = (body.filters ?? []).filter(
    (one) => !filters.some((kept) => kept.name === one.name),
  );
  return (
    <Dialog open={open} onClose={onClose} title="Filters">
      <div className="flex flex-col gap-4">
        <p className="m-0 text-ink-muted">
          Whoever reads the dashboard sets these. Each widget says, in its own settings, which of
          its columns or parameters a filter goes to.
        </p>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {filters.map((filter, at) => (
            <li
              key={filter.name}
              className="flex flex-col gap-2 rounded-panel border border-line p-3"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <TextField
                    name={`label-${filter.name}`}
                    label="Called"
                    value={filter.label ?? filter.name}
                    onChange={(label) => change(at, { label })}
                  />
                </div>
                <div className="w-44">
                  <SelectField
                    name={`type-${filter.name}`}
                    label="It is"
                    value={filter.type}
                    options={DASHBOARD_FILTER_TYPES.map((type) => ({
                      value: type,
                      label: FILTER_LABELS[type],
                    }))}
                    onChange={(type) => {
                      const { default: _default, choices: _choices, from: _from, ...kept } = filter;
                      setFilters((before) =>
                        before.map((one, index) =>
                          index === at ? { ...kept, type: type as DashboardFilter["type"] } : one,
                        ),
                      );
                    }}
                  />
                </div>
                <Button
                  size="small"
                  variant="quiet"
                  onClick={() => setFilters((before) => before.filter((_, index) => index !== at))}
                >
                  Remove
                </Button>
              </div>
              {filter.type === "date_range" ? (
                <div className="w-56">
                  <SelectField
                    name={`default-${filter.name}`}
                    label="When nobody has set it"
                    value={typeof filter.default === "string" ? filter.default : ""}
                    options={[
                      { value: "", label: "All time" },
                      ...RELATIVE_RANGES.map((name) => ({
                        value: name,
                        label: RANGE_LABELS[name],
                      })),
                    ]}
                    onChange={(value) => change(at, { default: value || undefined })}
                  />
                </div>
              ) : filter.type === "choice" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-56">
                    <SelectField
                      name={`from-${filter.name}`}
                      label="Offers the values of"
                      value={filter.from ? `${filter.from.table} ${filter.from.column}` : ""}
                      options={[
                        { value: "", label: "A list written here" },
                        ...(schema.data?.tables ?? []).flatMap((table) =>
                          table.columns.map((column) => ({
                            value: `${table.name} ${column.name}`,
                            label: `${table.name}: ${column.name}`,
                          })),
                        ),
                      ]}
                      onChange={(value) => {
                        const [table, column] = value.split(" ");
                        const { from: _from, choices: _choices, ...kept } = filter;
                        setFilters((before) =>
                          before.map((one, index) =>
                            index === at
                              ? table && column
                                ? { ...kept, from: { table, column } }
                                : kept
                              : one,
                          ),
                        );
                      }}
                    />
                  </div>
                  {filter.from ? null : (
                    <div className="min-w-48 flex-1">
                      <TextField
                        name={`choices-${filter.name}`}
                        label="The values, with commas"
                        required={false}
                        value={(filter.choices ?? []).join(", ")}
                        onChange={(text) => {
                          const choices = text
                            .split(",")
                            .map((one) => one.trim())
                            .filter(Boolean);
                          const { choices: _choices, ...kept } = filter;
                          setFilters((before) =>
                            before.map((one, index) =>
                              index === at
                                ? choices.length > 0
                                  ? { ...kept, choices }
                                  : kept
                                : one,
                            ),
                          );
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div>
          <Button
            size="small"
            disabled={filters.length >= 8}
            onClick={() =>
              setFilters((before) => [
                ...before,
                {
                  name: slug(
                    "filter",
                    before.map((one) => one.name),
                    "filter",
                    "_",
                  ),
                  label: "Dates",
                  type: "date_range",
                  default: "last_30_days",
                },
              ])
            }
          >
            Add a filter
          </Button>
        </div>
        {removed.length > 0 ? (
          <Notice tone="plain">
            {removed.map((one) => one.label ?? one.name).join(", ")} will be taken off, and off
            every widget that used {removed.length === 1 ? "it" : "them"}.
          </Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const kept = new Set(filters.map((one) => one.name));
                const { filters: _filters, ...rest } = body;
                await onSave({
                  ...rest,
                  ...(filters.length > 0 ? { filters } : {}),
                  // A widget no longer names a filter that is gone.
                  widgets: body.widgets.map((widget) => {
                    const { filters: bound, options, ...bare } = widget;
                    const still = (bound ?? []).filter((one) => kept.has(one.filter));
                    const { compareTo, ...others } = options ?? {};
                    const drawn =
                      compareTo && kept.has(compareTo) ? { ...others, compareTo } : others;
                    return {
                      ...bare,
                      ...(still.length > 0 ? { filters: still } : {}),
                      ...(Object.keys(drawn).length > 0 ? { options: drawn } : {}),
                    };
                  }),
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Save the filters
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
