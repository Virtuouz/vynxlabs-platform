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
  TextAreaField,
  TextField,
} from "@volvel/ui";
import { Ellipsis, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify, takenText } from "../ask.tsx";
import { useHelpTopic } from "../help/store.ts";
import { DataTable } from "../kit/DataTable.tsx";
import { putDraft, readDraft } from "../kit/draftApi.ts";
import { useEvery } from "../kit/every.ts";
import { useHistory } from "../kit/history.ts";
import { useShortcut } from "../kit/keys.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { RemoveDraftButton } from "../kit/RemoveDraftButton.tsx";
import { StatePill, Tag } from "../kit/status.tsx";
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
import { ResourceIdentity } from "./ResourceIdentity.tsx";

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
  /** What it is for, from its body. */
  description?: string;
  mine: boolean;
  owner: string;
  shared: boolean;
  sharedWith?: { id: string; name: string }[];
  revision: number;
  updatedAt: string;
}

/** Where a dashboard the workspace keeps stands: what is deployed, and what a draft does to it. */
type Stand = "deployed" | "draft" | "new" | "removed" | "repository";

interface Dashboard extends Summary {
  body: DashboardBody;
  /** What it names that the workspace does not have. It is kept as it is. */
  problems?: { path: string; message: string }[];
  /** For a resource, in a dev workspace: its draft is read with it. */
  stand?: Stand;
}

/** A draft of a dashboard, as the list of drafts gives it. */
interface DraftRow {
  path: string;
  kind: string;
  key: string;
  title: string | null;
  deleted: boolean;
  renamedFrom?: string;
}

/** The address of a dashboard the workspace keeps: by its path, which a draft has and an ID does not. */
const AT = "at/";
const resourceAddress = (link: string, path: string) => `${link}/dashboards/${AT}${path}`;

/** A dashboard row in the list, and what a draft does to it. */
interface ListRow extends Summary {
  draft: "new" | "changed" | "removed" | null;
  renamedFrom?: string;
}

/** The list the workspace shows: its dashboards, the drafts that change them, and the drafts of ones not deployed yet. */
function withDrafts(items: Summary[], drafts: DraftRow[]): ListRow[] {
  const mine = drafts.filter((one) => one.kind === "dashboard");
  const rows: ListRow[] = items.map((row) => {
    if (row.kind !== "resource") return { ...row, draft: null };
    const draft = mine.find((one) => one.path === row.path || one.renamedFrom === row.path);
    if (!draft) return { ...row, draft: null };
    return {
      ...row,
      path: draft.path,
      title: draft.title ?? row.title,
      draft: draft.deleted ? "removed" : "changed",
      ...(draft.renamedFrom ? { renamedFrom: draft.renamedFrom } : {}),
    };
  });
  const deployed = new Set(items.map((row) => row.path));
  for (const draft of mine) {
    if (draft.deleted || draft.renamedFrom || deployed.has(draft.path)) continue;
    rows.push({
      id: draft.path,
      kind: "resource",
      path: draft.path,
      ownership: "ui",
      title: draft.title ?? draft.path,
      mine: false,
      owner: "The workspace",
      shared: true,
      revision: 1,
      updatedAt: new Date().toISOString(),
      draft: "new",
    });
  }
  return rows;
}

/** Dashboards in a workspace: the reader's own, those shared with them, and those the workspace keeps. */
export function Dashboards({ root, link }: { root: string; link: string }) {
  const list = useLoad<{ items: Summary[]; mayCreate?: boolean }>(`${root}/dashboards`);
  // An older server does not say, and then it is offered, as it always was.
  const mayCreate = list.data?.mayCreate !== false;
  // Someone who may not read drafts sees the dashboards as deployed.
  const drafts = useLoad<{ items: DraftRow[] }>(`${root}/drafts`);
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
      ) : !list.data || (drafts.loading && !drafts.data && !drafts.error) ? (
        <Loading what="dashboards" />
      ) : (
        <DataTable<ListRow>
          variant="static"
          framed
          label="Dashboards"
          rows={withDrafts(list.data.items, drafts.data?.items ?? [])}
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
                <span className="flex min-w-0 flex-col">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Link
                      to={
                        row.kind === "resource" && row.path
                          ? resourceAddress(link, row.path)
                          : `${link}/dashboards/${row.id}`
                      }
                      className="font-medium text-action"
                    >
                      {row.title}
                    </Link>
                    {row.kind === "resource" ? <Tag>Resource</Tag> : null}
                    {row.draft === "new" ? (
                      <StatePill state="draft">Draft, never deployed</StatePill>
                    ) : row.draft === "removed" ? (
                      <StatePill state="draft">Removing</StatePill>
                    ) : row.draft ? (
                      <StatePill state="draft" />
                    ) : null}
                  </span>
                  {row.renamedFrom ? (
                    <span className="text-meta text-ink-muted">
                      Renamed from {row.renamedFrom}, once deployed.
                    </span>
                  ) : null}
                  {row.description ? (
                    <span className="text-meta text-ink-muted">{row.description}</span>
                  ) : null}
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
            {
              header: "Changed",
              cell: (row) => (row.draft === "new" ? "" : <Time value={row.updatedAt} mode="ago" />),
            },
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
export function DashboardView({
  root,
  link,
  id,
  editable = false,
}: {
  root: string;
  link: string;
  /** A member's dashboard by its ID, or one the workspace keeps by `at/<path>` (or its ID). */
  id: string;
  /** A dev workspace: a dashboard the workspace keeps is changed here, as a draft. */
  editable?: boolean;
}) {
  const [loaded, setLoaded] = useState<Dashboard>();
  const [missing, setMissing] = useState<ApiError>();
  /** Counted up by Try again, so the read is made once more. */
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useUrlParam("edit");
  const viewer = useViewer(root);
  const [set, setSet] = useUrlParam("f");
  const [selected, setSelected] = useState<string>();
  const [sharing, setSharing] = useState(false);
  const [describing, setDescribing] = useState(false);
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

  /**
   * The dashboard as it stands: a member's as it is kept; one the workspace keeps as its draft
   * when it has one in a dev workspace, and as it is deployed otherwise.
   */
  const fetchDashboard = useCallback(async (): Promise<Dashboard> => {
    const byPath = id.startsWith(AT) ? id.slice(AT.length) : undefined;
    const base =
      byPath === undefined ? await api.get<Dashboard>(`${root}/dashboards/${id}`) : undefined;
    const path = byPath ?? (base?.kind === "resource" ? base.path : null);
    if (!path || (!editable && base)) return base as Dashboard;
    // A dashboard the workspace keeps: what is deployed, and the draft over it.
    const draft = editable ? await readDraft<DashboardBody>(root, path) : undefined;
    const deployed = await api
      .get<{
        id: string;
        kind: string;
        body: DashboardBody;
        title: string | null;
        ownership: "ui" | "code";
        updatedAt: string;
      }>(`${root}/resources/${draft?.renamedFrom ?? path}`)
      .catch((error: ApiError) => {
        if (error.status === 404) return undefined;
        throw error;
      });
    const kept = deployed && deployed.kind === "dashboard" ? deployed : undefined;
    if (!kept && !draft) throw new ApiError(404, { detail: "There is no dashboard here." });
    const shown = draft && !draft.deleted ? draft.body : (kept?.body as DashboardBody);
    const stand: Stand = !draft
      ? kept?.ownership === "code"
        ? "repository"
        : "deployed"
      : draft.deleted
        ? "removed"
        : kept
          ? "draft"
          : "new";
    return {
      id: kept?.id ?? path,
      kind: "resource",
      path,
      ownership: kept?.ownership ?? "ui",
      title: (draft && !draft.deleted ? draft.title : null) ?? kept?.title ?? shown.title ?? path,
      mine: false,
      owner: "The workspace",
      shared: true,
      sharedWith: [],
      revision: draft?.revision ?? 0,
      updatedAt: kept?.updatedAt ?? new Date().toISOString(),
      body: shown,
      stand,
    };
  }, [root, id, editable]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is Try again: it asks once more
  useEffect(() => {
    let current = true;
    setLoaded(undefined);
    setMissing(undefined);
    forget();
    fetchDashboard().then(
      (dashboard) => current && setLoaded(dashboard),
      (error: ApiError) => current && setMissing(error),
    );
    return () => {
      current = false;
    };
  }, [fetchDashboard, forget, attempt]);

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
  const resource = loaded?.kind === "resource" ? loaded : undefined;
  /** Whoever is here may change it: the member whose it is, or anyone in a dev workspace for one the workspace keeps. */
  const changeable =
    (loaded?.kind === "member" && loaded.mine) ||
    (resource !== undefined && editable && resource.stand !== "removed");
  const editingNow = changeable && mode === "1";
  // A dashboard the workspace keeps is read as its draft while it has one, or is being changed.
  const draftReads =
    resource !== undefined &&
    editable &&
    (editingNow || resource.stand === "draft" || resource.stand === "new");
  useBleedWhile(editingNow);
  useHelpTopic(editingNow ? "data-dashboards-editor" : undefined);
  useShortcut("undo", history.undo, { enabled: editingNow });
  useShortcut("redo", history.redo, { enabled: editingNow });

  // When each widget's answer was read. The dashboard is as old as the oldest of them.
  const [readAt, setReadAt] = useState<Record<string, number>>({});
  // What the widgets are asked of: a member's by its ID, one the workspace keeps by its path.
  const asked = resource?.path ?? id;
  const client = useMemo(() => {
    const inner = pageClient(root, { of: "dashboard", id: asked }, draftReads === true);
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
  }, [root, asked, draftReads]);

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
  const edit = editingNow;

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
        if (resource) {
          // A dashboard the workspace keeps is saved as a draft, on the draft it read (or on none).
          const saved = await putDraft<{ body: DashboardBody; revision: number }>(
            root,
            resource.path as string,
            {
              kind: "dashboard",
              schemaVersion: 3,
              body: (change.body ?? resource.body) as unknown as Record<string, unknown>,
            },
            line.revision > 0 ? { revision: line.revision } : { first: true },
          );
          line.revision = saved.revision;
          line.waiting -= 1;
          if (line.waiting === 0) {
            setLoaded((now) =>
              now
                ? {
                    ...now,
                    body: saved.body,
                    revision: saved.revision,
                    stand: now.stand === "new" ? "new" : "draft",
                  }
                : now,
            );
            setRefreshKey((n) => n + 1);
          }
          return true;
        }
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
    const kept = await fetchDashboard().catch(() => undefined);
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

  const describeLabel = resource ? "Description…" : "Name and description…";
  const menuItems = [
    {
      label: describeLabel,
      onSelect: () => setDescribing(true),
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
  ];
  const menu = (
    <Menu
      ariaLabel="More"
      align="end"
      triggerClassName="inline-flex size-8 items-center justify-center rounded-control border border-line-control hover:bg-sunken"
      label={<Ellipsis aria-hidden="true" size={16} />}
      // A dashboard the workspace keeps is named by its path and removed as a resource: those are beside Edit.
      items={menuItems.filter((one) => !resource || one.label === describeLabel)}
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
  const describeDialog = (
    <DescribeDialog
      open={describing}
      onClose={() => setDescribing(false)}
      name={resource ? undefined : loaded.title}
      description={body.description ?? ""}
      onSave={(next) => {
        setDescribing(false);
        const { description: _was, ...rest } = body;
        const description = next.description.trim();
        void save({
          ...(next.name !== undefined && next.name !== loaded.title ? { title: next.name } : {}),
          ...(description !== (body.description ?? "")
            ? { body: { ...rest, ...(description ? { description } : {}) } }
            : {}),
        });
      }}
    />
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
          source={{ of: "dashboard", id: asked }}
          draft={draftReads === true}
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
                {resource ? null : <Button onClick={() => setSharing(true)}>Share</Button>}
                {menu}
              </>
            ),
          }}
        />
        {sharingDialog}
        {describeDialog}
      </>
    );
  }

  const whose =
    loaded.kind === "resource"
      ? `Kept by the workspace, at ${loaded.path}. You see the rows you may read.`
      : mine
        ? `Yours. Seen by: ${audience.toLowerCase()}.`
        : `${loaded.owner}'s, shared with you. You see the rows you may read.`;
  const stand = resource?.stand;
  return (
    <Page
      title={loaded.title}
      description={body.description || whose}
      action={
        <span className="flex flex-wrap items-center gap-2">
          {stand === "new" ? (
            <StatePill state="draft">Draft, never deployed</StatePill>
          ) : stand === "draft" ? (
            <StatePill state="draft" />
          ) : stand === "removed" ? (
            <StatePill state="draft">Removing</StatePill>
          ) : null}
          {mine ? (
            <>
              <Button onClick={() => setSharing(true)}>Share</Button>
              <Button variant="secondary" onClick={() => setMode("1")}>
                Edit
              </Button>
              {menu}
            </>
          ) : resource && editable ? (
            <>
              {stand === "removed" ? null : (
                <Button variant="secondary" onClick={() => setMode("1")}>
                  Edit
                </Button>
              )}
              {stand === "removed" || stand === "repository" ? null : (
                <ResourceIdentity
                  root={root}
                  link={link}
                  row={{ path: resource.path as string, kind: "dashboard", ownership: "ui" }}
                  label="Name and path"
                  onDone={(next) => {
                    if (next !== resource.path) navigate(resourceAddress(link, next));
                    else setAttempt((n) => n + 1);
                  }}
                />
              )}
              <RemoveDraftButton
                root={root}
                kind="dashboard"
                path={resource.path as string}
                noun="dashboard"
                state={
                  stand === "new" || stand === "draft"
                    ? "draft"
                    : stand === "removed"
                      ? "removed"
                      : stand === "repository"
                        ? "repository"
                        : "deployed"
                }
                onDone={(did) => {
                  if (did === "discarded" && stand === "new") navigate(`${link}/dashboards`);
                  else setAttempt((n) => n + 1);
                }}
              />
              {stand === "removed" ? null : menu}
            </>
          ) : null}
        </span>
      }
    >
      {body.description ? <p className="-mt-3 m-0 text-body-sm text-ink-muted">{whose}</p> : null}
      {loaded.problems && loaded.problems.length > 0 ? (
        <Notice tone="attention">
          <p className="m-0">
            It reads what this workspace does not have. It is kept as it is, and what reads it waits:
          </p>
          <ul className="m-0 list-disc pl-5">
            {loaded.problems.map((one) => (
              <li key={`${one.path}:${one.message}`}>{one.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {resource && editable && stand === "repository" ? (
        <Notice tone="attention">
          This dashboard is defined by the code in the tenant's repository. Changing it here saves a
          draft that takes it over: once deployed it is a file the console and the repository both
          edit. Then remove its definition from the code, or the next deploy from the repository
          takes it back.
        </Notice>
      ) : null}
      {stand === "removed" ? (
        <Notice tone="attention">
          This dashboard is removed in your drafts. Nothing changes until that draft is deployed.
          What is shown is what is deployed now. Keep this dashboard to take the removal back.
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
      {describeDialog}
    </Page>
  );
}

/** What a dashboard is called and what it is for. A dashboard the workspace keeps is named by its path elsewhere, so only its description is asked. */
function DescribeDialog({
  open,
  onClose,
  name,
  description,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  /** Its name, when it can be changed here. */
  name: string | undefined;
  description: string;
  onSave: (next: { name: string | undefined; description: string }) => void;
}) {
  const [named, setNamed] = useState(name ?? "");
  const [about, setAbout] = useState(description);
  // Opened again, it starts from what is kept now.
  useEffect(() => {
    if (!open) return;
    setNamed(name ?? "");
    setAbout(description);
  }, [open, name, description]);
  const missing = name !== undefined && named.trim() === "";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={name === undefined ? "What this dashboard is for" : "Name and description"}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (missing) return;
          onSave({ name: name === undefined ? undefined : named.trim(), description: about });
        }}
      >
        {name === undefined ? null : (
          <TextField
            name="name"
            label="Name"
            value={named}
            maxLength={100}
            {...(missing ? { error: "Give the dashboard a name." } : {})}
            onChange={setNamed}
          />
        )}
        <TextAreaField
          name="description"
          label="What it is for"
          rows={3}
          required={false}
          maxLength={500}
          value={about}
          hint="Shown under its name, and in the list of dashboards."
          onChange={setAbout}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={missing}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
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
    const refused = (groups.error as ApiError).status === 403;
    return (
      <Notice tone={refused ? "plain" : "danger"}>
        {refused
          ? `You can't list the groups here: that takes the group:read permission. It can be shown to everyone in the workspace, or kept to you.${now}`
          : `The groups could not be read: ${groups.error.message}.${now}`}{" "}
        {refused ? null : (
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
