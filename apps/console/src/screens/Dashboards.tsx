import type { InterfacePage } from "@vynxlabs/manifest";
import { WIDGET_TYPES } from "@vynxlabs/manifest";
import { heading } from "@vynxlabs/screens";
import {
  Button,
  CheckboxField,
  Dialog,
  EmptyState,
  Menu,
  MultiSelectField,
  Notice,
  TextField,
} from "@vynxlabs/ui";
import { useEffect, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { useHistory } from "../kit/history.ts";
import { Loading } from "../kit/LoadState.tsx";
import { PageHeader } from "../kit/PageHeader.tsx";
import { Page, when } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import type { Saving } from "./builder/EditorShell.tsx";
import { PageEditor, PageView } from "./builder/PageEditor.tsx";

interface Summary {
  id: string;
  title: string;
  mine: boolean;
  owner: string;
  shared: boolean;
  sharedWith?: { id: string; name: string }[];
  revision: number;
  updatedAt: string;
}
interface Dashboard extends Summary {
  page: InterfacePage;
  problems: { path: string; message: string }[];
}

/** A member's own dashboards in a workspace, and those other members have shared. */
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
      navigate(`${link}/dashboards/${made.id}`);
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
      description="Pages of your own over this workspace's tables: tables, cards, charts and totals. A dashboard is saved when you press Save, with nothing to deploy, and is yours unless you share it."
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
                <Link to={`${link}/dashboards/${row.id}`} className="font-medium text-action">
                  {row.title}
                </Link>
              ),
            },
            { header: "Whose", cell: (row) => (row.mine ? "Yours" : row.owner) },
            {
              header: "Seen by",
              cell: (row) =>
                row.shared ? (
                  "Everyone here"
                ) : row.sharedWith && row.sharedWith.length > 0 ? (
                  row.sharedWith.map((group) => group.name).join(", ")
                ) : (
                  <span className="text-ink-muted">Only you</span>
                ),
            },
            { header: "Changed", cell: (row) => when(row.updatedAt) },
          ]}
        />
      ) : null}
    </Page>
  );
}

/** A dashboard holds what is looked at: it writes and starts nothing, so it offers no form or action. */
const DASHBOARD_KINDS = WIDGET_TYPES.filter((kind) => kind !== "form" && kind !== "action");

/** One dashboard: worked on by the member whose it is, looked at by anyone it is shared with. */
export function DashboardView({ root, link, id }: { root: string; link: string; id: string }) {
  const [loaded, setLoaded] = useState<Dashboard>();
  const [missing, setMissing] = useState<string>();

  useEffect(() => {
    let current = true;
    api.get<Dashboard>(`${root}/dashboards/${id}`).then(
      (dashboard) => current && setLoaded(dashboard),
      (error: ApiError) => current && setMissing(error.message),
    );
    return () => {
      current = false;
    };
  }, [root, id]);

  if (missing) return <Notice tone="danger">{missing}</Notice>;
  if (!loaded) return <Loading />;
  if (!loaded.mine) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader
          title={loaded.title}
          description={`Shared by ${loaded.owner}. You see the rows you may read, which may not be the rows they see.`}
        />
        <PageView root={root} page={loaded.page} />
      </section>
    );
  }
  return <DashboardEditor root={root} link={link} id={id} first={loaded} />;
}

/**
 * The member's own dashboard, in the editor apps have: changes save by
 * themselves and can be undone; sharing is the step that makes it reach
 * other people.
 */
function DashboardEditor({
  root,
  link,
  id,
  first,
}: {
  root: string;
  link: string;
  id: string;
  first: Dashboard;
}) {
  const [loaded, setLoaded] = useState(first);
  const [draft, setDraft] = useState({ title: first.title, page: first.page });
  const [selected, setSelected] = useState<string>();
  const [saving, setSaving] = useState<Saving>("saved");
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const revision = useRef(first.revision);
  const latest = useRef(draft);
  latest.current = draft;
  const history = useHistory(
    () => latest.current,
    (back) => {
      dirty.current = true;
      setDraft(back);
    },
  );
  const change = (next: (before: typeof draft) => typeof draft, label: string, key?: string) => {
    history.record(label, key);
    dirty.current = true;
    setDraft(next);
  };

  // A change is saved a moment after the last one, as an app's page is.
  const hurried = useRef(false);
  const [hurry, setHurry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `hurry` only starts the save now
  useEffect(() => {
    if (!dirty.current || draft.title.trim() === "") return;
    setSaving("waiting");
    const wait = hurried.current ? 0 : 700;
    hurried.current = false;
    const timer = setTimeout(async () => {
      dirty.current = false;
      setSaving("saving");
      try {
        const saved = await api.put<Dashboard>(`${root}/dashboards/${id}`, {
          title: draft.title.trim(),
          page: draft.page,
          revision: revision.current,
        });
        revision.current = saved.revision;
        setLoaded(saved);
        setSaving("saved");
      } catch (error) {
        setSaving({ failed: failureText(error) });
      }
    }, wait);
    return () => clearTimeout(timer);
  }, [draft, root, id, hurry]);
  /** ⌘S saves at once. */
  const saveNow = () => {
    hurried.current = true;
    setHurry((count) => count + 1);
  };

  /** Sharing is said at once, as publishing an app is. */
  const share = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const saved = await api.put<Dashboard>(`${root}/dashboards/${id}`, {
        ...body,
        revision: revision.current,
      });
      revision.current = saved.revision;
      setLoaded(saved);
      notify.success(done);
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };
  const page = draft.page;
  /** Where a problem is, in the words of the page. */
  const where = (path: string) => {
    const index = /\/widgets\/(\d+)/.exec(path)?.[1];
    const widget = index === undefined ? undefined : page.widgets[Number(index)];
    return widget ? widget.title || heading(widget.id) : "The page";
  };
  const audience = loaded.shared
    ? "everyone here"
    : (loaded.sharedWith ?? []).length > 0
      ? (loaded.sharedWith ?? []).map((group) => group.name).join(", ")
      : undefined;

  return (
    <>
      <PageEditor
        root={root}
        page={page}
        selected={selected}
        onSelect={setSelected}
        kinds={DASHBOARD_KINDS}
        onChange={(apply, label = "a change", key) =>
          change(
            (before) => {
              const next = structuredClone(before.page);
              apply(next);
              return { ...before, page: next };
            },
            label,
            key,
          )
        }
        shell={{
          title: draft.title || "Untitled dashboard",
          saving,
          savedWords: audience ? `Saved. Seen by ${audience}.` : "Saved. Only you see it.",
          history,
          saveNow,
          more: (
            <Menu
              ariaLabel="More for this dashboard"
              label="More"
              items={[
                {
                  label: "Delete the dashboard",
                  danger: true,
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
                      notify.success(`Deleted ${loaded.title}.`);
                      navigate(`${link}/dashboards`);
                    } catch (error) {
                      notify.error(error);
                    }
                  },
                },
              ]}
            />
          ),
          primary: (
            <Button variant="primary" onClick={() => setSharing(true)}>
              Share
            </Button>
          ),
          after: (
            <div className="w-80 max-w-full">
              <TextField
                label="Name of the dashboard"
                name="dashboard-title"
                value={draft.title}
                maxLength={100}
                required
                onChange={(title) =>
                  change((before) => ({ ...before, title }), "renaming the dashboard", "title")
                }
              />
            </div>
          ),
          notices:
            loaded.problems.length > 0 && saving === "saved" ? (
              <Notice tone="attention">
                <strong>Something on this dashboard cannot be shown:</strong>
                <ul className="mt-1 mb-0 pl-5">
                  {loaded.problems.map((problem) => (
                    <li key={`${problem.path} ${problem.message}`}>
                      {where(problem.path)}: {problem.message}.
                    </li>
                  ))}
                </ul>
              </Notice>
            ) : null,
        }}
      />
      <Dialog open={sharing} onClose={() => setSharing(false)} title={`Share ${loaded.title}`}>
        <div className="flex flex-col gap-4">
          <CheckboxField
            label="Show it to everyone in this workspace"
            name="shared"
            checked={loaded.shared}
            disabled={busy}
            hint="They can look and not change it. Each person sees only the rows they may read."
            onChange={(shared) =>
              void share(
                { shared },
                shared ? "Everyone in this workspace can now see it." : "Only you can see it now.",
              )
            }
          />
          {loaded.shared ? null : (
            <SharedWith
              root={root}
              chosen={(loaded.sharedWith ?? []).map((group) => group.id)}
              disabled={busy}
              onChange={(sharedWith) =>
                void share(
                  { sharedWith },
                  sharedWith.length === 0
                    ? "Only you can see it now."
                    : "The groups you chose can now see it.",
                )
              }
            />
          )}
          <div className="flex justify-end">
            <Button onClick={() => setSharing(false)}>Done</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** The groups of members a dashboard is shown to, when it is not shown to everyone. */
function SharedWith({
  root,
  chosen,
  disabled,
  onChange,
}: {
  root: string;
  chosen: string[];
  disabled: boolean;
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
      disabled={disabled}
      placeholder="Nobody else"
      hint="Members in them can look and not change it. Each sees only the rows they may read."
      onChange={onChange}
    />
  );
}
