import { Badge, Button, Dialog, Notice, SelectField } from "@vynxlabs/ui";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText } from "../ask.tsx";
import { ListScreen } from "../ListScreen.tsx";

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
  const tablePaths = [
    ...new Set(
      (shown?.body.pages ?? []).flatMap((page) =>
        page.widgets.map((widget) => widget.table).filter((table): table is string => !!table),
      ),
    ),
  ].sort();
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={app ? `Who can open ${app.title}` : ""}
      description="Staff whose role lets them read this workspace can always open it."
    >
      <div className="flex flex-col gap-4">
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
                  <Badge tone="action">From repository</Badge>
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
          className="flex flex-col gap-3 border-line border-t pt-3"
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
          <p className="m-0 text-[13px] text-ink-muted">
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
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Done</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !resources.data || !roles.data}
            >
              Share
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
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
  return (
    <ListScreen<AppSummary>
      title="Apps"
      description="Apps built in the repository, and apps made in the console, served by this instance. Each has an address here, and can have hostnames of the tenant's own under Domains."
      path={`${root}/apps`}
      rowKey={(row) => row.id}
      columns={[
        {
          header: "App",
          cell: (row) => (
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{row.title}</span>
              <code className="font-mono text-[13px] text-ink-muted">{row.path}</code>
              {row.description ? <span className="text-ink-muted">{row.description}</span> : null}
            </span>
          ),
        },
        {
          header: "Address",
          cell: (row) => (
            <span className="flex flex-col gap-0.5">
              {external(row.url, row.url)}
              {row.domains
                .filter((domain) => domain.enabled)
                .map((domain) => (
                  <span key={domain.hostname}>{external(domain.url, domain.hostname)}</span>
                ))}
            </span>
          ),
        },
        {
          header: "Files",
          cell: (row) => (
            <span className="whitespace-nowrap">
              {row.files.toLocaleString()} {row.files === 1 ? "file" : "files"}, {size(row.bytes)}
            </span>
          ),
        },
        {
          header: "Open to",
          cell: (row) =>
            row.access.length > 0 ? (
              row.access.join(", ")
            ) : (
              <span className="text-ink-muted">
                Only staff whose role lets them read this workspace
              </span>
            ),
        },
      ]}
      rowActions={(row) => <Button onClick={() => onShare(row)}>Share</Button>}
      empty={{
        title: "No apps yet",
        text: "An app is defined in the tenant's repository with defineApp. It arrives here, with its files, when the repository is deployed to this workspace.",
      }}
    />
  );
}
