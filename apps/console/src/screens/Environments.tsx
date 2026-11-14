import { Badge, Button, Dialog, Notice, SelectField, TextField } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { ListScreen, Page, RemoveButton } from "../ListScreen.tsx";
import { navigate } from "../router.tsx";

const code = (text: string) => <code className="font-mono text-[13px]">{text}</code>;

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  type: "production" | "dev";
  linkedWorkspaceId: string | null;
  triggersPaused: boolean;
}

const failed = (error: unknown) => {
  const failure = error as ApiError;
  return [failure.message, ...(failure.fields ?? []).map((field) => field.message)].join(" ");
};

// ----- Pause, clone and delete: shown under a workspace's name -----

interface Clone {
  id: string;
  workspaceId: string;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  report: Record<string, number>;
}

export function WorkspaceControls({
  base,
  tenantId,
  workspace,
  reload,
}: {
  base: string;
  tenantId: string;
  workspace: WorkspaceSummary;
  reload: () => void;
}) {
  const root = `${base}/workspaces/${workspace.id}`;
  const [cloning, setCloning] = useState(false);
  const [problem, setProblem] = useState<string>();
  const setPaused = async (paused: boolean) => {
    setProblem(undefined);
    try {
      await api.patch(root, { triggersPaused: paused });
      reload();
    } catch (error) {
      setProblem(failed(error));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {workspace.triggersPaused ? (
        <Notice
          tone="attention"
          action={
            <Button size="small" onClick={() => setPaused(false)}>
              Resume triggers
            </Button>
          }
        >
          <strong>Triggers are paused.</strong> No schedule, webhook or event starts anything in
          this workspace. Runs you start by hand still work.
        </Notice>
      ) : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        {workspace.triggersPaused ? null : (
          <Button size="small" onClick={() => setPaused(true)}>
            Pause triggers
          </Button>
        )}
        <Button size="small" onClick={() => setCloning(true)}>
          Clone workspace
        </Button>
        {workspace.type === "dev" ? (
          <Button
            size="small"
            variant="danger"
            onClick={async () => {
              const sure = await ask.typeToConfirm({
                title: `Delete ${workspace.name}?`,
                text: "This deletes the workspace with its resources, secrets, run history, tables and files. It cannot be undone.",
                expected: workspace.slug,
                action: "Delete workspace",
                danger: true,
              });
              if (!sure) return;
              try {
                await api.delete(`${root}?confirm=${encodeURIComponent(workspace.slug)}`);
                navigate(`/t/${tenantId}/workspaces`);
              } catch (error) {
                setProblem(failed(error));
              }
            }}
          >
            Delete workspace
          </Button>
        ) : null}
      </div>
      <CloneDialog
        open={cloning}
        onClose={() => setCloning(false)}
        base={base}
        tenantId={tenantId}
        workspace={workspace}
      />
    </div>
  );
}

function CloneDialog({
  open,
  onClose,
  base,
  tenantId,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  base: string;
  tenantId: string;
  workspace: WorkspaceSummary;
}) {
  const [name, setName] = useState(`${workspace.name} copy`);
  const [slug, setSlug] = useState(`${workspace.slug}-copy`);
  const [data, setData] = useState("no");
  const [safety, setSafety] = useState("on");
  const [problem, setProblem] = useState<ApiError | string>();
  const [clone, setClone] = useState<Clone>();

  // The copying goes on after the request is answered. Ask how it is going until it ends.
  useEffect(() => {
    if (clone?.status !== "running") return;
    const timer = setInterval(async () => {
      try {
        setClone(await api.get<Clone>(`${base}/workspace-clones/${clone.id}`));
      } catch (error) {
        setProblem(failed(error));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [clone, base]);

  const field = (path: string) =>
    problem instanceof ApiError
      ? problem.fields.find((entry) => entry.path === `/body/${path}`)?.message
      : undefined;
  const count = (n: number | undefined, one: string, many: string) =>
    `${(n ?? 0).toLocaleString()} ${n === 1 ? one : many}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Clone ${workspace.name}`}
      description="The copy is a dev workspace linked to this one. Its triggers start paused."
    >
      {clone ? (
        <div className="flex flex-col gap-3">
          {clone.status === "running" ? (
            <p className="m-0" role="status">
              Copying…
            </p>
          ) : clone.status === "failed" ? (
            <Notice tone="danger">
              The clone failed, and nothing was copied. {clone.error} The empty workspace it left
              can be deleted.
            </Notice>
          ) : (
            <p className="m-0" role="status">
              Copied {count(clone.report.resources, "resource", "resources")},{" "}
              {count(clone.report.rows, "row", "rows")} in{" "}
              {count(clone.report.tables, "table", "tables")} and{" "}
              {count(clone.report.files, "file", "files")}.{" "}
              {clone.report.connections || clone.report.secrets
                ? "Its connections and secrets were copied: it can reach the same systems as the original."
                : "It has no connections or secret values, so it cannot reach a real system until you bind it."}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Close</Button>
            {clone.status === "running" ? null : (
              <Button
                variant="primary"
                onClick={() => {
                  const made = clone.workspaceId;
                  setClone(undefined);
                  onClose();
                  navigate(`/t/${tenantId}/workspaces/${made}/overview`);
                }}
              >
                Open the copy
              </Button>
            )}
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setProblem(undefined);
            try {
              setClone(
                await api.post<Clone>(`${base}/workspaces/${workspace.id}/clones`, {
                  name,
                  slug,
                  withData: data === "yes",
                  safe: safety === "on",
                }),
              );
            } catch (error) {
              setProblem(error as ApiError);
            }
          }}
        >
          <TextField
            label="Name"
            name="name"
            value={name}
            onChange={setName}
            error={field("name")}
          />
          <TextField
            label="Slug"
            name="slug"
            value={slug}
            onChange={setSlug}
            hint="Lowercase letters, digits and hyphens."
            error={field("slug")}
          />
          <SelectField
            label="Rows and files"
            name="data"
            value={data}
            onChange={setData}
            options={[
              { value: "no", label: "Leave them behind: empty tables" },
              { value: "yes", label: "Copy them" },
            ]}
          />
          <SelectField
            label="Safety"
            name="safety"
            value={safety}
            onChange={setSafety}
            hint={
              safety === "on"
                ? "The copy gets no connection, data source or secret value."
                : "The copy gets this workspace's connections and secrets. This is recorded in the audit log."
            }
            options={[
              { value: "on", label: "On: the copy cannot reach real systems" },
              { value: "off", label: "Off: the copy can act on the same systems" },
            ]}
          />
          {problem ? (
            <Notice tone="danger">{typeof problem === "string" ? problem : problem.message}</Notice>
          ) : null}
          <div className="mt-1 flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">
              Clone workspace
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// ----- Promotion: shown above a dev workspace's deployments -----

interface Summary {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  data?: string[];
  changes?: { change: string; kind: string; path: string }[];
}
interface Preview {
  target: { id: string; slug: string; name: string; type: string };
  bundle: { digest: string; version: number };
  possible: boolean;
  refusal: { detail: string; errors: { path: string; message: string }[] } | null;
  summary: Summary | null;
}

const CHANGE: Record<string, string> = {
  created: "Add",
  updated: "Change",
  deleted: "Remove",
};

export function Promotion({
  base,
  workspace,
  reload,
}: {
  base: string;
  workspace: WorkspaceSummary;
  reload: () => void;
}) {
  const root = `${base}/workspaces/${workspace.id}`;
  const others = useLoad<{ items: WorkspaceSummary[] }>(`${base}/workspaces`);
  const [preview, setPreview] = useState<Preview>();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [done, setDone] = useState<string>();
  if (workspace.type !== "dev") return null;
  const target = others.data?.items.find((item) => item.id === workspace.linkedWorkspaceId);

  const review = async () => {
    setProblem(undefined);
    setDone(undefined);
    try {
      setPreview(await api.get<Preview>(`${root}/promotion-preview`));
      setOpen(true);
    } catch (error) {
      setProblem(failed(error));
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4">
      <h2 className="m-0 text-base font-semibold">Promotion</h2>
      <p className="m-0 max-w-[70ch] text-ink-muted">
        Promoting activates the bundle that is running here in the workspace this one is linked to.
        It is the same bundle: nothing is rebuilt.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <SelectField
            label="Promotes to"
            name="link"
            value={workspace.linkedWorkspaceId ?? ""}
            options={[
              { value: "", label: "Nothing: not linked" },
              ...(others.data?.items ?? [])
                .filter((item) => item.id !== workspace.id)
                .map((item) => ({ value: item.id, label: `${item.name} (${item.type})` })),
            ]}
            onChange={async (value) => {
              setProblem(undefined);
              try {
                await api.patch(root, { linkedWorkspaceId: value === "" ? null : value });
                reload();
              } catch (error) {
                setProblem(failed(error));
              }
            }}
          />
        </div>
        {target ? (
          <Button variant="primary" onClick={review}>
            Review and promote
          </Button>
        ) : null}
      </div>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {done ? <Notice tone="attention">{done}</Notice> : null}

      <Dialog
        open={open && preview !== undefined}
        onClose={() => setOpen(false)}
        title={`Promote to ${preview?.target.name ?? ""}`}
        description={
          preview
            ? `Version ${preview.bundle.version} here, bundle ${preview.bundle.digest.slice(0, 12)}.`
            : ""
        }
      >
        {preview ? (
          <div className="flex flex-col gap-3">
            {preview.possible && preview.summary ? (
              <PreviewBody summary={preview.summary} target={preview.target.name} />
            ) : (
              <Notice tone="danger">
                <p className="m-0">It cannot be promoted yet. {preview.refusal?.detail}</p>
                {preview.refusal?.errors.length ? (
                  <ul className="mt-1 mb-0 list-disc pl-5">
                    {preview.refusal.errors.map((entry) => (
                      <li key={entry.path}>{entry.message}</li>
                    ))}
                  </ul>
                ) : null}
              </Notice>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              {preview.possible ? (
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      const result = await api.post<{ bundleVersion: number }>(
                        `${root}/promotions`,
                      );
                      setOpen(false);
                      setDone(
                        `Promoted to ${preview.target.name} as its version ${result.bundleVersion}.`,
                      );
                    } catch (error) {
                      setOpen(false);
                      setProblem(failed(error));
                    }
                  }}
                >
                  Promote
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

function PreviewBody({ summary, target }: { summary: Summary; target: string }) {
  const changes = summary.changes ?? [];
  const data = summary.data ?? [];
  if (changes.length === 0 && data.length === 0) {
    return <p className="m-0">{target} already runs this bundle. Promoting changes nothing.</p>;
  }
  return (
    <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
      <p className="m-0">
        This is what promoting will do in {target}. Nothing has been changed yet.
      </p>
      {changes.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {changes.map((entry) => (
            <li key={`${entry.kind}:${entry.path}`} className="flex items-center gap-2">
              <Badge
                tone={
                  entry.change === "deleted"
                    ? "danger"
                    : entry.change === "created"
                      ? "success"
                      : "action"
                }
              >
                {CHANGE[entry.change] ?? entry.change}
              </Badge>
              <span className="text-ink-muted">{entry.kind}</span>
              {code(entry.path)}
            </li>
          ))}
        </ul>
      ) : null}
      {data.length > 0 ? (
        <div>
          <p className="m-0 font-medium">To the data</p>
          <ul className="mt-1 mb-0 list-disc pl-5">
            {data.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ----- Export: a tenant section -----

export function TenantExport({ base, slug }: { base: string; slug: string }) {
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [history, setHistory] = useState("no");
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [problem, setProblem] = useState<string>();
  const mismatch = again !== "" && again !== passphrase;

  return (
    <Page
      title="Export"
      description="Everything this tenant has, in one file you can keep or take to another instance: resources, bindings, secrets, members, the audit log, tables and files. It is yours."
    >
      <form
        className="flex max-w-md flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (mismatch || passphrase !== again) return;
          setProblem(undefined);
          setState("working");
          try {
            const response = await fetch(`/api/v1${base}/exports`, {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ passphrase, history: history === "yes" }),
            });
            if (!response.ok) throw new ApiError(response.status, await response.json());
            const link = document.createElement("a");
            link.href = URL.createObjectURL(await response.blob());
            link.download = `${slug}-${new Date().toISOString().slice(0, 10)}.tar`;
            link.click();
            URL.revokeObjectURL(link.href);
            setState("done");
            setPassphrase("");
            setAgain("");
          } catch (error) {
            setState("idle");
            setProblem(failed(error));
          }
        }}
      >
        <TextField
          label="Passphrase"
          name="passphrase"
          type="password"
          value={passphrase}
          minLength={12}
          required
          autoComplete="new-password"
          onChange={setPassphrase}
          hint="At least 12 characters. It protects every secret in the file, and it is not stored: without it the secrets cannot be read. Pass it on separately from the file."
        />
        <TextField
          label="Passphrase again"
          name="again"
          type="password"
          value={again}
          required
          autoComplete="new-password"
          onChange={setAgain}
          error={mismatch ? "The two do not match." : undefined}
        />
        <SelectField
          label="Run, flow and event history"
          name="history"
          value={history}
          onChange={setHistory}
          options={[
            { value: "no", label: "Leave it out" },
            { value: "yes", label: "Include it" },
          ]}
          hint="History can make the file much larger."
        />
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {state === "done" ? (
          <Notice tone="attention">
            The export was downloaded. API keys and worker credentials are never in an export: make
            new ones wherever the tenant goes.
          </Notice>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={state === "working" || mismatch}>
            {state === "working" ? "Exporting…" : "Export tenant"}
          </Button>
        </div>
        <p className="m-0 text-[13px] text-ink-muted">
          The passphrase protects the secrets in the file. The rest of it, rows and files included,
          can be read by anyone who has the file, so keep it somewhere safe. For a large tenant, use
          the command line instead: {code("platform tenant export")}.
        </p>
      </form>
    </Page>
  );
}

// ----- For operators: database locations and import -----

interface Location {
  name: string;
  description: string;
  host: string;
  database: string;
  tenants: number;
  reachable: boolean;
  problem: string | null;
}

export function DatabaseLocations() {
  return (
    <ListScreen<Location>
      title="Database locations"
      description="Databases, other than the instance's own, where a tenant's custom tables can live. A tenant is placed in one when it is created or imported."
      path="/instance/database-locations"
      rowKey={(row) => row.name}
      columns={[
        { header: "Name", cell: (row) => code(row.name) },
        { header: "For", cell: (row) => <span className="text-ink-muted">{row.description}</span> },
        { header: "Database", cell: (row) => `${row.database} on ${row.host}` },
        { header: "Tenants", cell: (row) => row.tenants, align: "end" },
        {
          header: "Status",
          cell: (row) =>
            row.reachable ? (
              <Badge tone="success">Reachable</Badge>
            ) : (
              <span title={row.problem ?? ""}>
                <Badge tone="danger">Not reachable</Badge>
              </span>
            ),
        },
      ]}
      empty={{
        title: "No dedicated databases",
        text: "Every tenant's tables are in the instance's own database. Register another one to give a tenant a database of its own.",
      }}
      create={{
        action: "Register database",
        description:
          "The platform connects first and prepares the database. The user must own it and be allowed to create roles. Registering a name again changes its address.",
        fields: [
          {
            name: "name",
            label: "Name",
            placeholder: "acme-db",
            hint: "Lowercase letters, digits and hyphens.",
          },
          { name: "description", label: "What it is for", required: false },
          {
            name: "connectionString",
            label: "Connection string",
            type: "password",
            placeholder: "postgres://user:password@host:5432/database",
            hint: "Stored encrypted, and never shown again.",
          },
        ],
        submit: ({ name = "", description, connectionString }) =>
          api.put(`/instance/database-locations/${name}`, {
            connectionString,
            ...(description ? { description } : {}),
          }),
      }}
      rowActions={(row, reload) =>
        row.tenants > 0 ? null : (
          <RemoveButton
            confirm={`Remove "${row.name}" from this instance? Nothing in that database is touched.`}
            run={() => api.delete(`/instance/database-locations/${row.name}`)}
            onDone={reload}
          />
        )
      }
    />
  );
}

interface ImportReport {
  tenant: { id: string; slug: string; name: string; dataLocation: string | null };
  counts: Record<string, number>;
  members: { created: number; linked: number };
  objects: number;
  cancelled: { runs: number; flowRuns: number };
  pausedWorkspaces: number;
  notCarried: string[];
}

export function TenantImport() {
  const locations = useLoad<{ items: Location[] }>("/instance/database-locations");
  const [file, setFile] = useState<File>();
  const [passphrase, setPassphrase] = useState("");
  const [slug, setSlug] = useState("");
  const [location, setLocation] = useState("");
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [report, setReport] = useState<ImportReport>();

  return (
    <Page
      title="Import a tenant"
      description="Brings a tenant exported from another instance into this one, whole or not at all. The file is checked against its own list of contents before anything is written."
    >
      {report ? (
        <div className="flex max-w-[70ch] flex-col gap-3">
          <Notice tone="attention">
            <strong>{report.tenant.name}</strong> was imported:{" "}
            {Object.values(report.counts)
              .reduce((sum, n) => sum + n, 0)
              .toLocaleString()}{" "}
            rows and {report.objects.toLocaleString()} stored objects. Members created:{" "}
            {report.members.created}. Members linked to accounts already here:{" "}
            {report.members.linked}.
          </Notice>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            <li>
              Its custom tables are in{" "}
              {report.tenant.dataLocation
                ? `the database location "${report.tenant.dataLocation}".`
                : "the instance's own database."}
            </li>
            <li>
              All {report.pausedWorkspaces} workspaces arrived with their triggers paused. Resume
              each one when the instance it came from has stopped.
            </li>
            {report.cancelled.runs + report.cancelled.flowRuns > 0 ? (
              <li>
                {report.cancelled.runs} runs and {report.cancelled.flowRuns} flow runs were
                unfinished in the export, and are recorded as cancelled.
              </li>
            ) : null}
            {report.notCarried.map((line) => (
              <li key={line}>Not carried: {line}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => navigate(`/t/${report.tenant.id}/workspaces`)}>
              Open the tenant
            </Button>
            <Button onClick={() => setReport(undefined)}>Import another</Button>
          </div>
        </div>
      ) : (
        <form
          className="flex max-w-md flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file) return;
            setProblem(undefined);
            setWorking(true);
            try {
              const query = new URLSearchParams();
              if (slug) query.set("slug", slug);
              if (location) query.set("dataLocation", location);
              const response = await fetch(`/api/v1/instance/tenant-imports?${query}`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/x-tar", "x-export-passphrase": passphrase },
                body: file,
              });
              const body = await response.json();
              if (!response.ok) throw new ApiError(response.status, body);
              setReport(body as ImportReport);
              setPassphrase("");
              setFile(undefined);
            } catch (error) {
              setProblem(failed(error));
            } finally {
              setWorking(false);
            }
          }}
        >
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Export file
            <input
              type="file"
              accept=".tar,application/x-tar"
              required
              className="font-normal"
              onChange={(event) => setFile(event.currentTarget.files?.[0])}
            />
          </label>
          <TextField
            label="Its passphrase"
            name="passphrase"
            type="password"
            value={passphrase}
            required
            autoComplete="off"
            onChange={setPassphrase}
          />
          <TextField
            label="Slug on this instance"
            name="slug"
            value={slug}
            required={false}
            onChange={setSlug}
            hint="Leave empty to keep the slug it had."
          />
          <SelectField
            label="Where its custom tables go"
            name="location"
            value={location}
            onChange={setLocation}
            options={[
              { value: "", label: "The instance's own database" },
              ...(locations.data?.items ?? []).map((item) => ({
                value: item.name,
                label: `${item.name}: ${item.database} on ${item.host}`,
              })),
            ]}
          />
          {problem ? <Notice tone="danger">{problem}</Notice> : null}
          <div>
            <Button type="submit" variant="primary" disabled={working || !file}>
              {working ? "Importing…" : "Import tenant"}
            </Button>
          </div>
          <p className="m-0 text-[13px] text-ink-muted">
            The export must come from an instance at the same version as this one. For a large file,
            use the command line: {code("platform tenant import <file>")}.
          </p>
        </form>
      )}
    </Page>
  );
}

/** Lets an operator delete a tenant from the list, by typing its slug. */
export function DeleteTenantButton({
  tenant,
  onDone,
}: {
  tenant: { id: string; slug: string; name: string };
  onDone: () => void;
}) {
  return (
    <Button
      size="small"
      variant="danger"
      onClick={async () => {
        const sure = await ask.typeToConfirm({
          title: `Delete ${tenant.name}?`,
          text: "This deletes the tenant from this instance: every workspace, secret, table and file. Export it first if anything should be kept. It cannot be undone.",
          expected: tenant.slug,
          action: "Delete tenant",
          danger: true,
        });
        if (!sure) return;
        try {
          await api.post(`/tenants/${tenant.id}/deletion`, { confirm: tenant.slug });
          onDone();
        } catch (error) {
          notify.error(error);
        }
      }}
    >
      Delete
    </Button>
  );
}
