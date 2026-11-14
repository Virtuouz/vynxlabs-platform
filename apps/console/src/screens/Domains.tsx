import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Notice,
  SelectField,
  SideSheet,
  Table,
  TextField,
} from "@vynxlabs/ui";
import { useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask } from "../ask.tsx";
import { SectionLabel } from "../kit/layout.tsx";
import { StatePill } from "../kit/status.tsx";
import { CopyButton, Page, when } from "../ListScreen.tsx";
import type { AppSummary } from "./Apps.tsx";

interface Domain {
  id: string;
  workspaceId: string;
  app: string;
  hostname: string;
  url: string;
  enabled: boolean;
  verifiedAt: string | null;
  checkedAt: string | null;
  checkError: string | null;
  /** The DNS TXT record that shows whoever controls the name agrees. */
  challenge: { name: string; value: string };
  createdAt: string;
}
interface WorkspaceName {
  id: string;
  name: string;
}

const code = (text: string) => <code className="font-mono text-[13px] break-all">{text}</code>;

const failed = (error: unknown) => {
  const failure = error as ApiError;
  if (failure.code === "domain_not_verified") {
    return "This hostname is not verified yet, so it cannot be enabled. Create the TXT record shown here, wait for DNS to carry it, and press Check now. For a name that exists only inside a network and cannot be checked from here, ask an operator of this instance to enable it.";
  }
  return [failure.message, ...(failure.fields ?? []).map((field) => field.message)].join(" ");
};

function State({ domain }: { domain: Domain }) {
  return (
    <span className="flex flex-wrap gap-1">
      {domain.enabled ? <Badge tone="success">Enabled</Badge> : <Badge>Disabled</Badge>}
      {domain.verifiedAt ? (
        <Badge tone="action">Verified</Badge>
      ) : (
        <Badge tone="attention">Not verified</Badge>
      )}
    </span>
  );
}

function AddDialog({
  base,
  open,
  workspaces,
  onClose,
  onAdded,
}: {
  base: string;
  open: boolean;
  workspaces: WorkspaceName[];
  onClose: () => void;
  onAdded: (domain: Domain) => void;
}) {
  const [chosen, setChosen] = useState("");
  const [serves, setServes] = useState<"app" | "portal">("app");
  const [app, setApp] = useState("");
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const workspaceId = chosen || (workspaces[0]?.id ?? "");
  const apps = useLoad<{ items: AppSummary[] }>(
    open && workspaceId ? `${base}/workspaces/${workspaceId}/apps` : null,
  );
  const choices = apps.data?.items ?? [];
  const appPath = choices.some((candidate) => candidate.path === app)
    ? app
    : (choices[0]?.path ?? "");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a hostname"
      description="It serves what you choose once the hostname is verified and enabled."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const domain = await api.post<Domain>(`${base}/domains`, {
              workspaceId,
              app: serves === "portal" ? "" : appPath,
              hostname: hostname.trim(),
            });
            setHostname("");
            onAdded(domain);
          } catch (caught) {
            setError(caught as ApiError);
          } finally {
            setBusy(false);
          }
        }}
      >
        <SelectField
          label="Workspace"
          name="workspaceId"
          value={workspaceId}
          options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
          onChange={(value) => {
            setChosen(value);
            setApp("");
          }}
        />
        <SelectField
          label="Serves"
          name="serves"
          value={serves}
          options={[
            { value: "app", label: "One app, at the hostname's root" },
            { value: "portal", label: "The portal, and every app by its path" },
          ]}
          {...(serves === "portal"
            ? {
                hint: "The sign-in pages and the list of apps are at the root, and each app of the workspace is at /its-path/.",
              }
            : {})}
          onChange={(value) => setServes(value === "portal" ? "portal" : "app")}
        />
        {serves === "app" ? (
          <SelectField
            label="App"
            name="app"
            value={appPath}
            disabled={choices.length === 0}
            options={choices.map((candidate) => ({
              value: candidate.path,
              label: `${candidate.title} (${candidate.path})`,
            }))}
            {...(apps.data && choices.length === 0
              ? {
                  hint: "This workspace has no apps. Deploy one first, or choose another workspace.",
                }
              : {})}
            error={apps.error?.message}
            onChange={setApp}
          />
        ) : null}
        <TextField
          label="Hostname"
          name="hostname"
          value={hostname}
          placeholder="portal.example.com"
          hint="The name alone, without https:// or a path."
          error={error?.fields.find((field) => field.path.endsWith("/hostname"))?.message}
          onChange={setHostname}
        />
        {error ? <Notice tone="danger">{error.message}</Notice> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || (serves === "app" && (apps.loading || appPath === ""))}
          >
            Add hostname
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** One line of the DNS record, with a button to copy it. */
function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="block text-[13px] text-ink-muted">{label}</span>
        {code(value)}
      </span>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

function DetailsDialog({
  base,
  domain,
  onClose,
  onChanged,
  onRemoved,
}: {
  base: string;
  domain: Domain | undefined;
  onClose: () => void;
  onChanged: (domain: Domain) => void;
  onRemoved: () => void;
}) {
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const close = () => {
    setProblem(undefined);
    onClose();
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await action();
    } catch (error) {
      setProblem(failed(error));
    } finally {
      setBusy(false);
    }
  };

  const steps = domain
    ? [
        {
          label: "Record created and found",
          state: domain.verifiedAt
            ? ("ok" as const)
            : domain.checkError
              ? ("failed" as const)
              : ("queued" as const),
          detail: domain.verifiedAt
            ? `Verified ${when(domain.verifiedAt)}.`
            : domain.checkedAt
              ? `Not verified. Last checked ${when(domain.checkedAt)}.`
              : "Not checked yet.",
        },
        {
          label: "Enabled",
          state: domain.enabled ? ("ok" as const) : ("queued" as const),
          detail: domain.enabled ? "Serving." : "Serves nothing until enabled.",
        },
      ]
    : [];

  return (
    <SideSheet
      open={domain !== undefined}
      onClose={close}
      title={domain?.hostname ?? ""}
      description={
        domain
          ? domain.app === ""
            ? "The portal and every app"
            : `Serves ${domain.app}`
          : undefined
      }
      footer={
        domain ? (
          <div className="flex w-full flex-wrap justify-between gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                const sure = await ask.confirm({
                  title: `Remove ${domain.hostname}?`,
                  text: "The app is no longer served there, and sign-ins made at that hostname end.",
                  action: "Remove",
                  danger: true,
                });
                if (!sure) return;
                return run(async () => {
                  await api.delete(`${base}/domains/${domain.id}`);
                  onRemoved();
                });
              }}
            >
              Remove
            </Button>
            <span className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    onChanged(
                      await api.patch<Domain>(`${base}/domains/${domain.id}`, {
                        enabled: !domain.enabled,
                      }),
                    ),
                  )
                }
              >
                {domain.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    onChanged(await api.post<Domain>(`${base}/domains/${domain.id}/checks`)),
                  )
                }
              >
                Check now
              </Button>
            </span>
          </div>
        ) : undefined
      }
    >
      {domain ? (
        <div className="flex flex-col gap-5">
          <State domain={domain} />
          <section className="flex flex-col gap-2">
            <SectionLabel>1 · Point the name here</SectionLabel>
            <p className="m-0 text-ink-muted">
              A CNAME or an address record to this instance, and a certificate for the name wherever
              TLS ends in front of it.
            </p>
          </section>
          <section className="flex flex-col gap-2">
            <SectionLabel>2 · Show the name agrees</SectionLabel>
            <p className="m-0">
              Create this TXT record where the hostname's DNS is managed. It shows that whoever
              controls the name agrees to this tenant using it.
            </p>
            <div className="flex flex-col gap-3 rounded-control border border-line bg-sunken p-3">
              <RecordLine label="Record name" value={domain.challenge.name} />
              <RecordLine label="Record value" value={domain.challenge.value} />
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <SectionLabel>3 · Check and enable</SectionLabel>
            <ul className="m-0 flex list-none flex-col gap-2 p-0" role="status">
              {steps.map((step) => (
                <li key={step.label} className="flex flex-col gap-0.5">
                  <StatePill state={step.state}>{step.label}</StatePill>
                  <span className="text-meta text-ink-muted">{step.detail}</span>
                </li>
              ))}
            </ul>
            {domain.checkError ? <Notice tone="attention">{domain.checkError}</Notice> : null}
            {problem ? <Notice tone="danger">{problem}</Notice> : null}
          </section>
        </div>
      ) : null}
    </SideSheet>
  );
}

export function Domains({ base }: { base: string }) {
  const list = useLoad<{ items: Domain[] }>(`${base}/domains`);
  const workspaces = useLoad<{ items: WorkspaceName[] }>(`${base}/workspaces`);
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState<Domain>();
  const workspaceName = (id: string) =>
    workspaces.data?.items.find((workspace) => workspace.id === id)?.name ?? "";

  const addButton = (
    <Button variant="primary" onClick={() => setAdding(true)}>
      Add a hostname
    </Button>
  );

  return (
    <Page title="Domains" action={addButton}>
      <div className="flex max-w-[75ch] flex-col gap-2 text-ink-muted">
        <p className="m-0">
          A hostname of the client's own, public or internal to their network, serves one app at its
          root, or the portal with every app of a workspace by its path. Point the name at this
          instance with a CNAME or an address record. Whatever terminates TLS in front of the
          instance must hold the certificate for it: the platform issues none.
        </p>
        <p className="m-0">
          Then create the TXT record shown for the hostname and run a check. Once the check finds
          the record, the hostname is verified and can be enabled.
        </p>
      </div>
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <Table<Domain>
          rows={list.data.items}
          rowKey={(row) => row.id}
          columns={[
            {
              header: "Hostname",
              cell: (row) =>
                row.enabled ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium break-all text-action"
                  >
                    {row.hostname}
                  </a>
                ) : (
                  <span className="font-medium break-all">{row.hostname}</span>
                ),
            },
            {
              header: "Serves",
              cell: (row) => (
                <span>
                  {row.app === "" ? "The portal and every app" : code(row.app)}{" "}
                  <span className="text-ink-muted">in {workspaceName(row.workspaceId)}</span>
                </span>
              ),
            },
            { header: "State", cell: (row) => <State domain={row} /> },
            {
              header: "Last check",
              cell: (row) =>
                row.checkError ? (
                  <span className="text-danger">{row.checkError}</span>
                ) : row.checkedAt ? (
                  <span className="whitespace-nowrap text-ink-muted">
                    Passed {when(row.checkedAt)}
                  </span>
                ) : (
                  <span className="text-ink-muted">Not checked yet</span>
                ),
            },
            {
              header: "",
              align: "end",
              cell: (row) => (
                <Button size="small" onClick={() => setShown(row)}>
                  Details<span className="sr-only"> of {row.hostname}</span>
                </Button>
              ),
            },
          ]}
          empty={
            <EmptyState title="No hostnames yet" action={addButton}>
              Every app already has an address on this instance. Add a hostname when the client
              wants one of their own for an app.
            </EmptyState>
          }
        />
      ) : (
        <p className="text-ink-muted">Loading…</p>
      )}
      <AddDialog
        base={base}
        open={adding}
        workspaces={workspaces.data?.items ?? []}
        onClose={() => setAdding(false)}
        onAdded={(domain) => {
          setAdding(false);
          setShown(domain);
          list.reload();
        }}
      />
      <DetailsDialog
        base={base}
        domain={shown}
        onClose={() => setShown(undefined)}
        onChanged={(domain) => {
          setShown(domain);
          list.reload();
        }}
        onRemoved={() => {
          setShown(undefined);
          list.reload();
        }}
      />
    </Page>
  );
}
