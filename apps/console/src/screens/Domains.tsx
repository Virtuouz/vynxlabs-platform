import { Button, EmptyState, Notice, SelectField, SideSheet, TextField } from "@volvel/ui";
import { useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask } from "../ask.tsx";
import { NotAllowed, useCan } from "../kit/Can.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { Loading } from "../kit/LoadState.tsx";
import { SectionLabel } from "../kit/layout.tsx";
import { Code, StatePill } from "../kit/status.tsx";
import { useOpenRow } from "../kit/useOpenRow.ts";
import { CopyButton, Page, when } from "../ListScreen.tsx";
import { useUrlParam } from "../router.tsx";
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
  /** When a check first missed the record of a verified name: it stays verified, and this says so. */
  recordGoneAt: string | null;
  /** The DNS TXT record that shows whoever controls the name agrees. */
  challenge: { name: string; value: string };
  createdAt: string;
}
interface WorkspaceName {
  id: string;
  name: string;
}

const failed = (error: unknown) => {
  const failure = error as ApiError;
  if (failure.code === "domain_not_verified") {
    return "This hostname is not verified yet, so it cannot be enabled. Create the TXT record shown here, wait for DNS to carry it, and press Check now. For a name that exists only inside a network and cannot be checked from here, ask an operator of this instance to enable it.";
  }
  return [failure.message, ...(failure.fields ?? []).map((field) => field.message)].join(" ");
};

function State({ domain }: { domain: Domain }) {
  return (
    <span className="flex flex-wrap gap-3">
      <StatePill state={domain.enabled ? "on" : "off"} />
      {domain.verifiedAt && domain.recordGoneAt ? (
        <StatePill state="warning">Verified, record gone</StatePill>
      ) : (
        <StatePill state={domain.verifiedAt ? "verified" : "unverified"} />
      )}
    </span>
  );
}

/**
 * What a hostname serves: one app at its root, or the portal and every app by path. The choice
 * is made when a hostname is added and again when it is changed, so both ask it here.
 */
function useServes(
  base: string,
  workspaceId: string,
  active: boolean,
  start: { serves: "app" | "portal"; app: string },
) {
  const [serves, setServes] = useState(start.serves);
  const [app, setApp] = useState(start.app);
  const apps = useLoad<{ items: AppSummary[] }>(
    active && workspaceId ? `${base}/workspaces/${workspaceId}/apps` : null,
  );
  const choices = apps.data?.items ?? [];
  const appPath = choices.some((candidate) => candidate.path === app)
    ? app
    : (choices[0]?.path ?? "");
  const options = choices.map((candidate) => ({
    value: candidate.path,
    label: `${candidate.title} (${candidate.path})`,
  }));
  const fields = (
    <>
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
          options={options}
          {...(apps.data && choices.length === 0
            ? {
                hint: "This workspace has no apps. Deploy one first, or choose another workspace.",
              }
            : {})}
          error={apps.error?.message}
          onChange={setApp}
        />
      ) : null}
    </>
  );
  return {
    fields,
    /** What the API takes for `app`: the empty path is the portal. */
    chosen: serves === "portal" ? "" : appPath,
    ready: serves === "portal" || (!apps.loading && appPath !== ""),
    reset: (to: { serves: "app" | "portal"; app: string }) => {
      setServes(to.serves);
      setApp(to.app);
    },
  };
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
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const workspaceId = chosen || (workspaces[0]?.id ?? "");
  const serving = useServes(base, workspaceId, open, { serves: "app", app: "" });

  return (
    <SideSheet
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
              app: serving.chosen,
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
            serving.reset({ serves: "app", app: "" });
          }}
        />
        {serving.fields}
        <TextField
          label="Hostname"
          name="hostname"
          value={hostname}
          placeholder="portal.example.com"
          hint="The name alone, without https:// or a path."
          error={error?.fields?.find((field) => field.path.endsWith("/hostname"))?.message}
          onChange={setHostname}
        />
        {error ? <Notice tone="danger">{error.message}</Notice> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!serving.ready}>
            Add hostname
          </Button>
        </div>
      </form>
    </SideSheet>
  );
}

/** One line of the DNS record, with a button to copy it. */
function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="block text-body-sm text-ink-muted">{label}</span>
        <Code wrap>{value}</Code>
      </span>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

/** Points a hostname at another app, or at the portal, without removing it and adding it again. */
function ChangeServes({
  base,
  domain,
  onChanged,
}: {
  base: string;
  domain: Domain;
  onChanged: (domain: Domain) => void;
}) {
  const serving = useServes(base, domain.workspaceId, true, {
    serves: domain.app === "" ? "portal" : "app",
    app: domain.app,
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const changed = serving.chosen !== domain.app;
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>What it serves</SectionLabel>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setProblem(undefined);
          try {
            onChanged(
              await api.patch<Domain>(`${base}/domains/${domain.id}`, { app: serving.chosen }),
            );
          } catch (error) {
            setProblem(failed(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {serving.fields}
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        <div>
          <Button type="submit" loading={busy} disabled={!changed || !serving.ready}>
            Change what it serves
          </Button>
        </div>
      </form>
    </section>
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
  const can = useCan(base, "domain:write");
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
          label:
            domain.verifiedAt && domain.recordGoneAt
              ? "Record found when verified, and not since"
              : "Record created and found",
          state:
            domain.verifiedAt && !domain.recordGoneAt
              ? ("ok" as const)
              : domain.checkError
                ? ("failed" as const)
                : ("queued" as const),
          detail: domain.verifiedAt
            ? domain.recordGoneAt
              ? `Verified ${when(domain.verifiedAt)}. The record has not been found since ${when(domain.recordGoneAt)}. The name stays verified: create the record again and check.`
              : `Verified ${when(domain.verifiedAt)}.`
            : domain.checkedAt
              ? `Not verified. Last checked ${when(domain.checkedAt)}.`
              : "Not checked yet.",
        },
        {
          label: "Enabled",
          state: domain.enabled ? ("ok" as const) : ("queued" as const),
          detail: domain.enabled
            ? domain.verifiedAt
              ? "Serving."
              : "Serving, though the name is not verified. An operator of this instance enabled it without proof, so the name opens this app for whoever points it here."
            : domain.verifiedAt
              ? "Serves nothing: the name answers “not served here” until it is enabled."
              : "Not enabled. Until it is verified, the name opens this instance's own address, as any name the instance does not know does.",
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
              disabled={busy || !can}
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
                disabled={busy || !can}
                onClick={async () => {
                  // Turning a hostname off stops it answering on one press: said first.
                  if (domain.enabled) {
                    const sure = await ask.confirm({
                      title: `Turn off ${domain.hostname}?`,
                      text: "The hostname stops answering, so the app is no longer served there and sign-ins made at that hostname end. The record stays; turn it on again to serve it.",
                      action: "Turn off",
                      danger: true,
                    });
                    if (!sure) return;
                  }
                  return run(async () =>
                    onChanged(
                      await api.patch<Domain>(`${base}/domains/${domain.id}`, {
                        enabled: !domain.enabled,
                      }),
                    ),
                  );
                }}
              >
                {domain.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!can}
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
          <ChangeServes
            key={`${domain.id}:${domain.app}`}
            base={base}
            domain={domain}
            onChanged={onChanged}
          />
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
  // The hostname open is in the address, so a link opens it and Back closes it.
  const [open, setOpen] = useUrlParam("hostname", undefined, { push: true });
  const [shown, setFresh] = useOpenRow(list, open);
  const setShown = (domain: Domain | undefined) => {
    setFresh(domain);
    setOpen(domain?.id);
  };
  const workspaceName = (id: string) =>
    workspaces.data?.items.find((workspace) => workspace.id === id)?.name ?? "";

  const can = useCan(base, "domain:write");
  const addButton = (
    <Button variant="primary" disabled={!can} onClick={() => setAdding(true)}>
      Add a hostname
    </Button>
  );

  return (
    <Page title="Domains" action={addButton}>
      {can ? null : <NotAllowed permission="domain:write" what="this tenant's hostnames" />}
      <div className="flex max-w-measure flex-col gap-2 text-ink-muted">
        <p className="m-0">
          A hostname of the client's own, public or internal to their network, serves one app at its
          root, or the portal with every app of a workspace by its path. Point the name at this
          instance with a CNAME or an address record. Whatever terminates TLS in front of the
          instance must hold the certificate for it: Volvel issues none.
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
        <DataTable<Domain>
          variant="static"
          framed
          label="Domains"
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
                    className="font-medium break-words text-action"
                  >
                    {row.hostname}
                  </a>
                ) : (
                  <span className="font-medium break-words">{row.hostname}</span>
                ),
            },
            {
              header: "Serves",
              cell: (row) => (
                <span>
                  {row.app === "" ? "The portal and every app" : <Code wrap>{row.app}</Code>}{" "}
                  <span className="text-ink-muted">in {workspaceName(row.workspaceId)}</span>
                </span>
              ),
            },
            { header: "State", cell: (row) => <State domain={row} /> },
            {
              header: "Last check",
              cell: (row) =>
                row.verifiedAt && row.recordGoneAt ? (
                  <span className="text-danger">
                    Verified {when(row.verifiedAt)}; record gone since {when(row.recordGoneAt)}
                  </span>
                ) : row.checkError ? (
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
        <Loading />
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
