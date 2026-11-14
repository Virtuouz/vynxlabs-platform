import type { InterfacePage } from "@vynxlabs/manifest";
import { heading } from "@vynxlabs/screens";
import {
  Badge,
  Button,
  CheckboxField,
  EmptyState,
  MultiSelectField,
  Notice,
  Table,
  TextField,
} from "@vynxlabs/ui";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { Page, when } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { PageEditor, PageView } from "./Interfaces.tsx";

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
      description="Pages of your own over this workspace's tables: tables, cards, charts and totals. A dashboard is saved as you make it, with nothing to deploy, and is yours unless you share it."
      action={action}
    >
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <Table<Summary>
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
                  <Badge tone="action">Everyone here</Badge>
                ) : row.sharedWith && row.sharedWith.length > 0 ? (
                  <Badge tone="action">
                    {row.sharedWith.map((group) => group.name).join(", ")}
                  </Badge>
                ) : (
                  <Badge>Only you</Badge>
                ),
            },
            { header: "Changed", cell: (row) => when(row.updatedAt) },
          ]}
        />
      ) : null}
    </Page>
  );
}

/** One dashboard: worked on by the member whose it is, looked at by anyone it is shared with. */
export function DashboardView({ root, link, id }: { root: string; link: string; id: string }) {
  const [loaded, setLoaded] = useState<Dashboard>();
  const [missing, setMissing] = useState<string>();
  const [title, setTitle] = useState("");
  const [page, setPage] = useState<InterfacePage>();
  const [selected, setSelected] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    api.get<Dashboard>(`${root}/dashboards/${id}`).then(
      (dashboard) => {
        if (!current) return;
        setLoaded(dashboard);
        setTitle(dashboard.title);
        setPage(dashboard.page);
      },
      (error: ApiError) => current && setMissing(error.message),
    );
    return () => {
      current = false;
    };
  }, [root, id]);

  if (missing) return <Notice tone="danger">{missing}</Notice>;
  if (!loaded || !page) return <p className="text-ink-muted">Loading…</p>;

  const back = (
    <Link to={`${link}/dashboards`} className="flex w-fit items-center gap-1 text-action">
      <ArrowLeft size={16} aria-hidden="true" /> All dashboards
    </Link>
  );
  if (!loaded.mine) {
    return (
      <section className="flex flex-col gap-4">
        {back}
        <header>
          <h1 className="m-0 text-xl font-semibold tracking-tight">{loaded.title}</h1>
          <p className="mt-1 mb-0 text-ink-muted">
            Shared by {loaded.owner}. You see the rows you may read, which may not be the rows they
            see.
          </p>
        </header>
        <PageView root={root} page={page} />
      </section>
    );
  }

  const put = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const saved = await api.put<Dashboard>(`${root}/dashboards/${id}`, {
        ...body,
        revision: loaded.revision,
      });
      setLoaded(saved);
      notify.success(done);
      return true;
    } catch (error) {
      notify.error(error);
      return false;
    } finally {
      setBusy(false);
    }
  };
  /** Where a problem is, in the words of the page. */
  const where = (path: string) => {
    const index = /\/widgets\/(\d+)/.exec(path)?.[1];
    const widget = index === undefined ? undefined : page.widgets[Number(index)];
    return widget ? widget.title || heading(widget.id) : "The page";
  };

  return (
    <section className="flex flex-col gap-4">
      {back}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-80 max-w-full">
          <TextField
            label="Name of the dashboard"
            name="dashboard-title"
            value={title}
            maxLength={100}
            required
            onChange={(next) => {
              setTitle(next);
              setDirty(true);
            }}
          />
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-muted" role="status">
            {dirty ? "Changes not saved." : `Saved ${when(loaded.updatedAt)}.`}
          </span>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
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
                notify.error(failureText(error));
              }
            }}
          >
            Delete
          </Button>
          <Button
            variant="primary"
            disabled={busy || !dirty || title.trim() === ""}
            onClick={async () => {
              if (await put({ title: title.trim(), page }, "The dashboard was saved.")) {
                setDirty(false);
              }
            }}
          >
            Save
          </Button>
        </span>
      </header>
      <CheckboxField
        label="Show it to everyone in this workspace"
        name="shared"
        checked={loaded.shared}
        disabled={busy}
        hint="They can look and not change it. Each person sees only the rows they may read."
        onChange={(shared) =>
          void put(
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
            void put(
              { sharedWith },
              sharedWith.length === 0
                ? "Only you can see it now."
                : "The groups you chose can now see it.",
            )
          }
        />
      )}
      {loaded.problems.length > 0 && !dirty ? (
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
      ) : null}
      <PageEditor
        root={root}
        page={page}
        selected={selected}
        onSelect={setSelected}
        onChange={(apply) => {
          setPage((before) => {
            if (!before) return before;
            const next = structuredClone(before);
            apply(next);
            return next;
          });
          setDirty(true);
        }}
      />
    </section>
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
