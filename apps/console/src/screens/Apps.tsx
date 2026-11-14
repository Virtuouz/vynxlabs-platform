import { Button, Notice, SelectField, SideSheet, Tabs } from "@vynxlabs/ui";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText } from "../ask.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { Inspector, KeyValues } from "../kit/layout.tsx";
import { Mono, Tag } from "../kit/status.tsx";

export interface AppSummary {
  id: string;
  path: string;
  title: string;
  description: string | null;
  url: string;
  domains: { hostname: string; url: string; enabled: boolean }[];
  files: number;
  bytes: number;
  /** Who is bound at the app itself: "anyone", "every end user", an email or a group's name. */
  access: string[];
  builtWith?: "code" | "builder";
  interface?: string | null;
  /** The tables it reads: declared by its code, or its interface's widgets. */
  reads?: string[];
}

interface TableInfo {
  name: string;
  policy: { type: string };
}

const POLICY: Record<string, string> = {
  open: "everyone it is shared with sees every row",
  owner: "each person sees the rows they own",
  rules: "the table's row rules decide, person by person",
};

/** How many rows of a table someone in a group sees, worked out as that group would. */
function RowsFor({ root, table, group }: { root: string; table: string; group: string }) {
  const counted = useLoad<{ items: { values: { count?: number } }[] }>(
    `${root}/aggregate/${table}?asGroup=${group}`,
  );
  if (counted.error) return <span className="text-ink-subtle">—</span>;
  if (!counted.data) return <span className="text-ink-subtle">…</span>;
  return (
    <span className="font-mono text-telemetry">{counted.data.items[0]?.values.count ?? 0}</span>
  );
}

const external = (url: string, text: string) => (
  <a href={url} target="_blank" rel="noreferrer" className="break-all text-action">
    {text}
  </a>
);

export const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`
      : `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

interface Binding {
  id: string;
  scopeType: string;
  resourceId: string | null;
  principalType: string;
  principalId: string | null;
  principalLabel: string;
  roleName: string;
  managedByResource: boolean;
}
interface Named {
  id: string;
  name: string;
}
interface Stored {
  id: string;
  kind: string;
  path: string;
  body: { interface?: string; pages?: { widgets: { table?: string }[] }[] };
}

/**
 * Who may open one app. Opening an app made in the console is no use without
 * reading its tables, so sharing gives both: the app, and each table it shows.
 * Which rows a person then sees is the business of each table's row rules.
 */
function ShareDialog({
  root,
  app,
  onClose,
  onChanged,
}: {
  root: string;
  app: AppSummary | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [base = "", workspaceId = ""] = root.split("/workspaces/");
  const open = app !== undefined;
  const bindings = useLoad<{ items: Binding[] }>(
    open ? `${base}/bindings?workspaceId=${workspaceId}` : null,
  );
  const resources = useLoad<{ items: Stored[] }>(open ? `${root}/resources` : null);
  const groups = useLoad<{ items: Named[] }>(open ? `${base}/groups?limit=200` : null);
  const endUserGroups = useLoad<{ items: Named[] }>(
    open ? `${base}/end-user-groups?limit=200` : null,
  );
  const roles = useLoad<{ items: Named[] }>(open ? `${base}/roles?limit=200` : null);
  const [who, setWho] = useState("end_users");
  const [may, setMay] = useState("portal_reader");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const stored = resources.data?.items ?? [];
  const shown = stored.find(
    (one) =>
      one.kind === "interface" && one.path === stored.find((x) => x.id === app?.id)?.body.interface,
  );
  const tablePaths =
    app?.reads ??
    [
      ...new Set(
        (shown?.body.pages ?? []).flatMap((page) =>
          page.widgets.map((widget) => widget.table).filter((table): table is string => !!table),
        ),
      ),
    ].sort();
  const tableInfo = useLoad<{ items: TableInfo[] }>(open ? `${root}/tables` : null);
  const [tab, setTab] = useState("who");
  const tables = stored.filter((one) => one.kind === "table" && tablePaths.includes(one.path));
  const targets = app ? [app.id, ...tables.map((table) => table.id)] : [];
  const atApp = (bindings.data?.items ?? []).filter(
    (binding) => binding.scopeType === "resource" && binding.resourceId === app?.id,
  );
  const options = [
    { value: "end_users", label: "Every end user who signs in" },
    ...(endUserGroups.data?.items ?? []).map((group) => ({
      value: `end_user_group:${group.id}`,
      label: `End users in ${group.name}`,
    })),
    ...(groups.data?.items ?? []).map((group) => ({
      value: `group:${group.id}`,
      label: `Members in ${group.name}`,
    })),
    { value: "anonymous", label: "Anyone, without signing in" },
  ];
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await action();
      bindings.reload();
      onChanged();
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  const audienceGroups = atApp.filter(
    (binding) => binding.principalType === "group" || binding.principalType === "end_user_group",
  );

  const who_ = (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between gap-2 rounded-control border border-line px-3 py-2">
        <span>Staff whose role lets them read this workspace</span>
        <span className="text-meta text-ink-subtle">always</span>
      </div>
      {atApp.length === 0 ? (
        <p className="m-0 text-ink-muted">Nobody else yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {atApp.map((binding) => (
            <li
              key={binding.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3 py-2"
            >
              <span>
                {binding.principalLabel}{" "}
                <span className="text-ink-muted">
                  {binding.roleName === "portal_reader"
                    ? "may read"
                    : binding.roleName === "portal_user"
                      ? "may read and change"
                      : `as ${binding.roleName}`}
                </span>
              </span>
              {binding.managedByResource ? (
                <Tag tone="repository">From repository</Tag>
              ) : (
                <Button
                  size="small"
                  disabled={busy}
                  aria-label={`Stop sharing with ${binding.principalLabel}`}
                  onClick={() =>
                    run(async () => {
                      // The same people's access to the app's tables goes with it.
                      const theirs = (bindings.data?.items ?? []).filter(
                        (other) =>
                          !other.managedByResource &&
                          other.scopeType === "resource" &&
                          targets.includes(other.resourceId ?? "") &&
                          other.principalType === binding.principalType &&
                          other.principalId === binding.principalId &&
                          other.roleName === binding.roleName,
                      );
                      for (const one of theirs) await api.delete(`${base}/bindings/${one.id}`);
                    })
                  }
                >
                  Stop sharing
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-3 border-line border-t pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const [principalType, principalId] = who.split(":");
            const roleId = roles.data?.items.find((role) => role.name === may)?.id;
            if (!roleId) throw new Error("The role for this was not found.");
            for (const resourceId of targets) {
              const held = (bindings.data?.items ?? []).some(
                (binding) =>
                  binding.resourceId === resourceId &&
                  binding.principalType === principalType &&
                  binding.principalId === (principalId ?? null) &&
                  binding.roleName === may,
              );
              if (held) continue;
              await api.post(`${base}/bindings`, {
                workspaceId,
                resourceId,
                principalType,
                ...(principalId ? { principalId } : {}),
                roleId,
              });
            }
          });
        }}
      >
        <span className="text-label text-ink-subtle uppercase">Add an audience</span>
        <SelectField
          label="Share with"
          name="who"
          value={who}
          options={options}
          onChange={setWho}
        />
        <SelectField
          label="They may"
          name="may"
          value={may}
          options={[
            { value: "portal_reader", label: "Read" },
            { value: "portal_user", label: "Read and change" },
          ]}
          onChange={setMay}
        />
        <p className="m-0 text-meta text-ink-muted">
          {tables.length > 0
            ? `Given along with the app: its ${tables.length === 1 ? "table" : "tables"} ${tables
                .map((table) => table.path)
                .join(", ")}. Which rows each person sees is decided by each table's row rules.`
            : "Only the app is given. If it reads tables, give access to those under Access."}
        </p>
        {who === "anonymous" ? (
          <Notice tone="attention">
            Anyone who has the address can then open the app and read what its tables let everyone
            read.
          </Notice>
        ) : null}
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy || !resources.data || !roles.data}>
            Share
          </Button>
        </div>
      </form>
    </div>
  );

  const reads = (
    <div className="flex flex-col gap-4 pt-4">
      {tablePaths.length === 0 ? (
        <p className="m-0 text-ink-muted">
          {app?.builtWith === "code"
            ? "Its code declares no tables. Ask its developer to list them with `reads` in defineApp."
            : "It shows no table."}
        </p>
      ) : (
        tablePaths.map((table) => {
          const policy = tableInfo.data?.items?.find((one) => one.name === table)?.policy?.type;
          return (
            <div key={table} className="flex flex-col gap-2 rounded-control border border-line p-3">
              <span className="flex items-center justify-between gap-2">
                <Mono>{table}</Mono>
                {policy ? <Tag>{policy === "rules" ? "Row rules" : policy}</Tag> : null}
              </span>
              <span className="text-meta text-ink-muted">
                {policy
                  ? `Of its rows, ${POLICY[policy] ?? "its policy decides"}.`
                  : "Its policy is not known here."}
              </span>
              {audienceGroups.length > 0 && policy && policy !== "open" ? (
                <div className="flex flex-col gap-1">
                  {audienceGroups.map((binding) => (
                    <span
                      key={binding.id}
                      className="flex items-center justify-between gap-2 text-meta"
                    >
                      <span className="text-ink-muted">
                        Someone in {binding.principalLabel} sees
                      </span>
                      <span>
                        {binding.principalId ? (
                          <RowsFor root={root} table={table} group={binding.principalId} />
                        ) : (
                          "—"
                        )}{" "}
                        rows
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}
      {atApp.some((binding) => binding.principalType === "anonymous") ? (
        <Notice tone="attention">
          Anyone with the address can open it. Whatever its tables let everyone read is public.
        </Notice>
      ) : null}
    </div>
  );

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={app ? `Share ${app.title}` : ""}
      description={app?.url}
      size="wide"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <Tabs
        label="Sharing"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "who", label: "Who has access", content: who_ },
          { id: "reads", label: "What they can read", content: reads },
        ]}
      />
    </SideSheet>
  );
}

/** The apps deployed to a workspace: where each is served and who may open it. */
export function Apps({ root }: { root: string }) {
  const [sharing, setSharing] = useState<AppSummary>();
  const [version, setVersion] = useState(0);
  return (
    <>
      <AppList key={version} root={root} onShare={setSharing} />
      <ShareDialog
        root={root}
        app={sharing}
        onClose={() => {
          setSharing(undefined);
          setVersion((before) => before + 1);
        }}
        onChanged={() => {}}
      />
    </>
  );
}

function AppList({ root, onShare }: { root: string; onShare: (app: AppSummary) => void }) {
  const list = useLoad<{ items: AppSummary[] }>(`${root}/apps`);
  const [chosen, setChosen] = useState<string>();
  const open = list.data?.items.find((row) => row.id === chosen);
  return (
    <CollectionView<AppSummary>
      title="Published apps"
      description="What end users and staff can open: apps built in the repository, and apps made in the App Builder. Each has an address here, and can have hostnames of the tenant's own under Domains."
      columns={[
        {
          header: "App",
          cell: (row) => (
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{row.title}</span>
              <Mono className="truncate text-ink-subtle">{row.path}</Mono>
            </span>
          ),
        },
        {
          header: "Address",
          priority: 2,
          cell: (row) => (
            <span className="flex min-w-0 flex-col">
              {external(row.url, row.url.replace(/^https?:\/\//, ""))}
              {row.domains
                .filter((domain) => domain.enabled)
                .map((domain) => (
                  <span key={domain.hostname}>{external(domain.url, domain.hostname)}</span>
                ))}
            </span>
          ),
        },
        {
          header: "Open to",
          priority: 3,
          cell: (row) =>
            row.access.length > 0 ? (
              <span className={row.access.includes("anyone") ? "text-attention" : ""}>
                {row.access.join(", ")}
              </span>
            ) : (
              <span className="text-ink-subtle">Staff only</span>
            ),
        },
        {
          header: "Built",
          cell: (row) =>
            row.builtWith === "builder" ? (
              <Tag tone="draft">App Builder</Tag>
            ) : (
              <Tag tone="repository">Repository</Tag>
            ),
        },
      ]}
      rows={list.data?.items}
      rowKey={(row) => row.id}
      selected={chosen}
      onSelect={(row) => setChosen(row.id)}
      error={list.error?.message}
      empty={{
        title: "No apps yet",
        text: "An app is defined in the tenant's repository with defineApp, or made in the App Builder. It is served once it is deployed here.",
      }}
      inspector={
        open ? (
          <Inspector
            open
            label="The chosen app"
            title={open.title}
            eyebrow={open.path}
            onClose={() => setChosen(undefined)}
            footer={
              <>
                <Button variant="primary" onClick={() => onShare(open)}>
                  Share
                </Button>
                <a
                  href={open.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-meta"
                >
                  Open the live app <ArrowUpRight aria-hidden="true" size={13} />
                </a>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              {open.description ? <p className="m-0 text-ink-muted">{open.description}</p> : null}
              {open.access.includes("anyone") ? (
                <Notice tone="attention">
                  Anyone with the address can open it, without signing in.
                </Notice>
              ) : null}
              <KeyValues
                rows={[
                  { label: "Address", value: external(open.url, open.url) },
                  ...open.domains.map((domain) => ({
                    label: domain.enabled ? "Hostname" : "Hostname (off)",
                    value: external(domain.url, domain.hostname),
                  })),
                  {
                    label: "Built",
                    value:
                      open.builtWith === "builder"
                        ? `In the App Builder (${open.interface})`
                        : "In the repository",
                  },
                  ...(open.builtWith !== "builder"
                    ? [
                        {
                          label: "Files",
                          value: `${open.files.toLocaleString()}, ${size(open.bytes)}`,
                          mono: true,
                        },
                      ]
                    : []),
                  {
                    label: "Reads",
                    value: open.reads?.length ? open.reads.join(", ") : "Nothing declared",
                    mono: true,
                  },
                  {
                    label: "Open to",
                    value:
                      open.access.length > 0
                        ? open.access.join(", ")
                        : "Staff whose role lets them read this workspace",
                  },
                ]}
              />
            </div>
          </Inspector>
        ) : null
      }
    />
  );
}
