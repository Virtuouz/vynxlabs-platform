import {
  DASHBOARD_REFRESH,
  type DashboardBody,
  type DashboardRefresh,
  DEFAULT_DASHBOARD_REFRESH,
  filtersOf,
} from "@volvel/manifest";
import {
  Button,
  CheckboxField,
  Dialog,
  EmptyState,
  Menu,
  MultiSelectField,
  Notice,
  SelectField,
} from "@volvel/ui";
import { Ellipsis, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify, takenText } from "../ask.tsx";
import { useHelpTopic } from "../help/store.ts";
import { DataTable } from "../kit/DataTable.tsx";
import { useEvery } from "../kit/every.ts";
import { useHistory } from "../kit/history.ts";
import { useShortcut } from "../kit/keys.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { useTitleObject } from "../kit/title.ts";
import { useBleedWhile } from "../kit/workbench.ts";
import { Page } from "../ListScreen.tsx";
import { Link, navigate, useUrlParam } from "../router.tsx";
import { useViewer } from "../viewer.ts";
import { pageClient } from "./builder/client.ts";
import { NAME_MAX } from "./builder/names.ts";
import { PageEditor } from "./builder/PageEditor.tsx";
import { definitionOf, views } from "./builder/registry.ts";
import { type FilterValues, PageView } from "./builder/renderer.ts";

const NAME_TOO_LONG = `Use at most ${NAME_MAX} characters.`;

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
  /** For a resource: who keeps it, the repository (`code`) or the console (`ui`). */
  ownership?: "ui" | "code" | null;
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
  /** What it names that the workspace does not have. It is kept as it is. */
  problems?: { path: string; message: string }[];
}

/** Dashboards in a workspace: the reader's own, those shared with them, and those the workspace keeps. */
export function Dashboards({ root, link }: { root: string; link: string }) {
  const list = useLoad<{ items: Summary[]; mayCreate?: boolean }>(`${root}/dashboards`);
  // An older server does not say, and then it is offered, as it always was.
  const mayCreate = list.data?.mayCreate !== false;
  const create = async () => {
    let made: Dashboard | undefined;
    // The refusal of a name is said on the field, which keeps what was typed.
    await ask.prompt({
      title: "New dashboard",
      text: "It is yours alone until you choose to share it.",
      label: "Name",
      action: "Make the dashboard",
      maxLength: NAME_MAX,
      submit: async (value) => {
        if (value.trim().length > NAME_MAX) return NAME_TOO_LONG;
        try {
          made = await api.post<Dashboard>(`${root}/dashboards`, { title: value.trim() });
          return undefined;
        } catch (error) {
          return takenText(error) ?? failureText(error);
        }
      },
    });
    if (made) navigate(`${link}/dashboards/${made.id}?edit=1`);
  };
  const action = mayCreate ? (
    <Button variant="primary" onClick={create}>
      New dashboard
    </Button>
  ) : undefined;
  return (
    <Page
      title="Dashboards"
      description="Questions asked of this workspace's tables, and their answers drawn: figures, charts, tables and pivots. Build a question from menus, use a query the workspace keeps, or write SQL. Everyone who looks at a dashboard sees the rows they may read."
      {...(action ? { action } : {})}
    >
      {list.error ? (
        <ErrorState what="dashboards" error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading what="dashboards" />
      ) : (
        <DataTable<Summary>
          variant="static"
          framed
          label="Dashboards"
          rows={list.data.items}
          rowKey={(row) => row.id}
          empty={
            <EmptyState title="No dashboards yet" action={action}>
              {mayCreate
                ? "Make one to keep an eye on the tables you care about."
                : "Making one takes the dashboard:write permission, which your role does not have here. Ask whoever manages roles in this tenant."}
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
      )}
    </Page>
  );
}

/**
 * One dashboard: looked at by anyone it is open to, and changed by the member whose it is.
 * Changing it is the one page editor (`builder/PageEditor`), the one an app's builder uses.
 * What is only about dashboards is here: sharing, how often it refreshes, and how old what it shows is.
 */
export function DashboardView({ root, link, id }: { root: string; link: string; id: string }) {
  const [loaded, setLoaded] = useState<Dashboard>();
  const [missing, setMissing] = useState<ApiError>();
  /** Counted up by Try again, so the read is made once more. */
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useUrlParam("edit");
  const viewer = useViewer(root);
  const [set, setSet] = useUrlParam("f");
  const [selected, setSelected] = useState<string>();
  const [sharing, setSharing] = useState(false);
  /** Saves that have been asked for and not yet answered. */
  const [pending, setPending] = useState(0);
  /** Counted up when a save is kept, when it is time to refresh, and by "Refresh now". */
  const [refreshKey, setRefreshKey] = useState(0);
  // Its name is the last crumb, which makes "Dashboards" before it the way back to the list.
  useTitleObject(loaded?.title);
  // Every change made to what the dashboard holds, a hundred back: where its widgets are,
  // what they ask, its filters and how often it refreshes. Not its name or who sees it.
  const restoring = useRef<(next: DashboardBody) => void>(() => {});
  const history = useHistory<DashboardBody | undefined>(
    () => loaded?.body,
    (state) => state && restoring.current(state),
  );
  const forget = history.clear;
  const queue = useRef({ waiting: 0, revision: 0, last: Promise.resolve() });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is Try again: it asks once more
  useEffect(() => {
    let current = true;
    setLoaded(undefined);
    setMissing(undefined);
    forget();
    api.get<Dashboard>(`${root}/dashboards/${id}`).then(
      (dashboard) => current && setLoaded(dashboard),
      (error: ApiError) => current && setMissing(error),
    );
    return () => {
      current = false;
    };
  }, [root, id, forget, attempt]);

  // What the filters are set to, kept in the address so a link shows the same thing.
  const filterValues = useMemo<FilterValues>(() => {
    try {
      const parsed = set ? JSON.parse(set) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }, [set]);
  const body = loaded?.body;
  const editingNow = loaded?.kind === "member" && loaded.mine && mode === "1";
  useBleedWhile(editingNow);
  useHelpTopic(editingNow ? "data-dashboards-editor" : undefined);
  useShortcut("undo", history.undo, { enabled: editingNow });
  useShortcut("redo", history.redo, { enabled: editingNow });

  // When each widget's answer was read. The dashboard is as old as the oldest of them.
  const [readAt, setReadAt] = useState<Record<string, number>>({});
  const client = useMemo(() => {
    const inner = pageClient(root, { of: "dashboard", id });
    // Everything the page client does (actions, the rows behind, a filter's values), with
    // each read noted for how old the dashboard is.
    return {
      ...inner,
      read: async (
        widget: string,
        filters: FilterValues,
        options?: Parameters<typeof inner.read>[2],
      ) => {
        const note = (at: number) =>
          setReadAt((before) => (before[widget] === at ? before : { ...before, [widget]: at }));
        try {
          const answer = await inner.read(widget, filters, options);
          note(Date.now());
          return answer;
        } catch (error) {
          // A widget that could not be read is told as -1: it does not hold the age back, and is counted.
          note(-1);
          throw error;
        }
      },
    };
  }, [root, id]);

  const refresh = body?.refresh ?? DEFAULT_DASHBOARD_REFRESH;
  // Nothing asks again under someone who is changing it.
  const every = refresh === "off" || editingNow ? undefined : refresh * 60_000;
  // A tab that is hidden is not read for: it is read once when it is shown again, if one was due.
  useEvery(() => setRefreshKey((n) => n + 1), every);

  if (missing) {
    return (
      <ErrorState what="this dashboard" error={missing} onRetry={() => setAttempt((n) => n + 1)} />
    );
  }
  if (!loaded || !body) return <Loading />;
  const mine = loaded.kind === "member" && loaded.mine;
  const edit = mine && mode === "1";

  /**
   * Every save goes through one queue, one after another, each on the revision the one before it
   * made. A rename, a share and a change made just before it are saved in the order they were
   * made, and none is refused as saved elsewhere because another of this screen's own was still
   * in flight. Only the last answer is shown as saved: an earlier one would draw over a later change.
   */
  const send = (
    change: { body?: DashboardBody; title?: string; shared?: boolean; sharedWith?: string[] },
    onFailure?: () => Promise<void>,
  ): Promise<boolean> => {
    const line = queue.current;
    line.waiting += 1;
    setPending((n) => n + 1);
    const run = line.last.then(async () => {
      try {
        const saved = await api.put<Dashboard>(`${root}/dashboards/${id}`, {
          ...change,
          revision: line.revision,
        });
        line.revision = saved.revision;
        line.waiting -= 1;
        if (line.waiting === 0) {
          setLoaded(saved);
          setRefreshKey((n) => n + 1);
        }
        return true;
      } catch (error) {
        line.waiting -= 1;
        notify.error(error);
        await onFailure?.();
        return false;
      } finally {
        setPending((n) => n - 1);
      }
    });
    line.last = run.then(() => undefined);
    return run;
  };
  /** After a save that was refused: what was drawn was not kept, so show what the server has. */
  const showWhatIsKept = async () => {
    const kept = await api.get<Dashboard>(`${root}/dashboards/${id}`).catch(() => undefined);
    if (kept && queue.current.waiting === 0) setLoaded(kept);
  };
  /** Saves the dashboard with what changed, and shows it as saved. */
  const save = (change: {
    body?: DashboardBody;
    title?: string;
    shared?: boolean;
    sharedWith?: string[];
  }) => send(change, showWhatIsKept);
  /**
   * A change to what the dashboard holds, drawn at once and saved after. Waiting for the save
   * would draw a dragged widget back where it began, and then play it to where it was put.
   * Saves go one after another, each on the revision the one before it made, so several
   * changes made quickly (arrow keys held down, undo pressed three times) are all kept.
   */
  if (queue.current.waiting === 0) queue.current.revision = loaded.revision;
  const keep = (next: DashboardBody) => {
    setLoaded({ ...loaded, body: next });
    void send({ body: next }, showWhatIsKept);
  };
  restoring.current = keep;

  const audience = loaded.shared
    ? "Everyone in this workspace"
    : (loaded.sharedWith ?? []).length > 0
      ? (loaded.sharedWith ?? []).map((group) => group.name).join(", ")
      : "Only you";
  const asking = body.widgets
    .filter((one) => Object.keys(definitionOf(one.type)?.data ?? {}).length > 0)
    .map((one) => one.id);
  const answered = asking.filter((one) => readAt[one] !== undefined);
  const unread = answered.filter((one) => (readAt[one] ?? 0) < 0).length;
  const times = answered.map((one) => readAt[one] ?? 0).filter((at) => at > 0);
  // The oldest of what was read; with nothing read yet it says it is reading, never a bare "…".
  const asOf = times.length > 0 ? Math.min(...times) : undefined;
  const reading = answered.length < asking.length;

  const menu = (
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
              maxLength: NAME_MAX,
              submit: async (value) => (value.trim().length > NAME_MAX ? NAME_TOO_LONG : undefined),
            });
            if (title) void save({ title });
          },
        },
        {
          label: "Keep it as a resource of the workspace…",
          onSelect: async () => {
            let made = "";
            const path = await ask.prompt({
              title: "Keep it as a resource",
              text: "A copy is saved as a draft of a dashboard resource: versioned, deployed and promoted with the rest of the workspace, and open to everyone who may see dashboards. Yours stays as it is.",
              label: "Its path, such as boards/lending",
              action: "Save the draft",
              submit: async (value) => {
                try {
                  await api.put(`${root}/drafts/${value.trim()}`, {
                    kind: "dashboard",
                    schemaVersion: 3,
                    body: { ...body, title: loaded.title },
                    create: true,
                  });
                  made = value.trim();
                  return undefined;
                } catch (error) {
                  return takenText(error) ?? failureText(error);
                }
              },
            });
            if (!path || !made) return;
            notify.success(`${made} is saved as a draft. Deploy it to keep it.`, {
              link: { label: "Review and deploy", href: `${link}/release` },
            });
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
  );
  const sharingDialog = (
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
            named={(loaded.sharedWith ?? []).map((group) => group.name)}
            onChange={(sharedWith) => void save({ sharedWith })}
          />
        )}
        <div className="flex justify-end">
          <Button onClick={() => setSharing(false)}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
  const refreshSelect = (
    <div className="w-56">
      <SelectField
        inline
        name="refresh"
        label="Refreshes"
        value={String(refresh)}
        options={DASHBOARD_REFRESH.map((one) => ({
          value: String(one),
          label: one === "off" ? "Never by itself" : `Every ${REFRESH_WORDS[one]}`,
        }))}
        onChange={(next) => {
          history.record("the change to how often it refreshes");
          keep({ ...body, refresh: next === "off" ? "off" : (Number(next) as DashboardRefresh) });
        }}
      />
    </div>
  );

  if (edit) {
    return (
      <>
        <PageEditor
          root={root}
          link={link}
          surface="dashboard"
          source={{ of: "dashboard", id }}
          value={{ widgets: body.widgets }}
          selected={selected}
          onSelect={setSelected}
          refreshKey={refreshKey}
          onChange={(next, label, key) => {
            history.record(label, key);
            keep({ ...body, widgets: next.widgets });
          }}
          shell={{
            bleed: true,
            title: loaded.title,
            saving: pending > 0 ? "saving" : "saved",
            savedWords: "Saved.",
            history,
            primary: (
              <Button variant="primary" onClick={() => setMode(undefined)}>
                Done
              </Button>
            ),
            roomyMore: (
              <>
                {refreshSelect}
                <Button onClick={() => setSharing(true)}>Share</Button>
                {menu}
              </>
            ),
          }}
        />
        {sharingDialog}
      </>
    );
  }

  return (
    <Page
      title={loaded.title}
      description={
        loaded.kind === "resource"
          ? `Kept by the workspace, at ${loaded.path}. You see the rows you may read.`
          : mine
            ? `Yours. Seen by: ${audience.toLowerCase()}.`
            : `${loaded.owner}'s, shared with you. You see the rows you may read.`
      }
      action={
        <span className="flex flex-wrap items-center gap-2">
          {mine ? (
            <>
              <Button onClick={() => setSharing(true)}>Share</Button>
              <Button variant="secondary" onClick={() => setMode("1")}>
                Edit
              </Button>
              {menu}
            </>
          ) : null}
        </span>
      }
    >
      {loaded.problems && loaded.problems.length > 0 ? (
        <Notice tone="attention">
          <p className="m-0">
            It reads what this workspace does not have. It is kept as it is, and what reads it
            waits:
          </p>
          <ul className="m-0 list-disc pl-5">
            {loaded.problems.map((one) => (
              <li key={`${one.path}:${one.message}`}>{one.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {asking.length > 0 ? (
        <p
          className="-mt-3 m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-muted"
          data-freshness=""
        >
          <span>
            {asOf ? (
              <>
                Last refreshed <Time value={new Date(asOf)} mode="clock" />
              </>
            ) : reading ? (
              "Refreshing"
            ) : (
              "Nothing could be read"
            )}
            {unread > 0
              ? ` · ${unread === 1 ? "1 widget" : `${unread} widgets`} could not be read`
              : ""}
            {" · "}
            {refresh === "off"
              ? "Does not refresh by itself"
              : `Refreshes every ${REFRESH_WORDS[refresh]}`}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-control px-1 text-action hover:underline"
            onClick={() => setRefreshKey((n) => n + 1)}
          >
            <RefreshCw aria-hidden="true" size={14} /> Refresh now
          </button>
        </p>
      ) : null}
      {body.widgets.length === 0 ? (
        <EmptyState
          title="Nothing on it yet"
          action={
            mine ? (
              <Button variant="primary" onClick={() => setMode("1")}>
                Add to page
              </Button>
            ) : undefined
          }
        >
          A widget asks a question of the workspace's tables and draws the answer: a number, a
          chart, a table or a pivot.
        </EmptyState>
      ) : (
        <PageView
          widgets={body.widgets}
          filters={filtersOf(body.widgets)}
          registry={views}
          client={client}
          filterValues={filterValues}
          onFilterValues={(next) => {
            const kept = Object.fromEntries(
              Object.entries(next).filter(([, value]) => value !== undefined),
            );
            setSet(Object.keys(kept).length > 0 ? JSON.stringify(kept) : undefined);
          }}
          refreshKey={refreshKey}
          foldKey={`dashboard.${id}`}
          {...(viewer ? { user: viewer, groupNames: viewer.groupNames ?? {} } : {})}
        />
      )}
      {sharingDialog}
    </Page>
  );
}

/** The groups of members a dashboard is shown to, when it is not shown to everyone. */
function SharedWith({
  root,
  chosen,
  named,
  onChange,
}: {
  root: string;
  chosen: string[];
  /** The names of the groups it is shown to now, for when the list of groups cannot be read. */
  named: string[];
  onChange: (groups: string[]) => void;
}) {
  const tenantBase = root.split("/workspaces/")[0] ?? "";
  const groups = useLoad<{ items: { id: string; name: string }[] }>(`${tenantBase}/groups`);
  const now = named.length > 0 ? ` It stays shown to ${named.join(", ")}.` : "";
  if (groups.error) {
    return (
      <Notice tone={(groups.error as ApiError).status === 403 ? "plain" : "danger"}>
        {(groups.error as ApiError).status === 403
          ? `You can't list the groups here: that takes the group:read permission. It can be shown to everyone in the workspace, or kept to you.${now}`
          : `The groups could not be read: ${groups.error.message}.${now}`}{" "}
        {(groups.error as ApiError).status === 403 ? null : (
          <Button size="small" onClick={groups.reload}>
            Try again
          </Button>
        )}
      </Notice>
    );
  }
  if (!groups.data) return <p className="m-0 text-ink-muted">Loading the groups…</p>;
  if (groups.data.items.length === 0) {
    return (
      <p className="m-0 text-ink-muted">
        This tenant has no groups yet, so it can be shown to everyone in the workspace or kept to
        you.
      </p>
    );
  }
  return (
    <MultiSelectField
      label="Or show it to these groups"
      options={groups.data.items.map((group) => ({ value: group.id, label: group.name }))}
      value={chosen}
      placeholder="Nobody else"
      inline
      hint="Members in them can look and not change it. Each sees only the rows they may read."
      onChange={onChange}
    />
  );
}
