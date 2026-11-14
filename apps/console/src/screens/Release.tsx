import { Button, Notice, SideSheet, TextField } from "@vynxlabs/ui";
import { ArrowRight, History, Rocket, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import {
  EmptyCanvas,
  KeyValues,
  PageHeader,
  Panel,
  SectionLabel,
  Stepper,
} from "../kit/layout.tsx";
import { Junction } from "../kit/motifs.tsx";
import { EnvTag, Mono, StatePill, Tag } from "../kit/status.tsx";
import { Link, navigate } from "../router.tsx";
import { Deployments } from "./Execution.tsx";
import { fromNow } from "./Overview.tsx";

interface Workspace {
  id: string;
  name: string;
  type: "production" | "dev";
  linkedWorkspaceId: string | null;
}

interface DraftRow {
  path: string;
  kind: string;
  deleted: boolean;
  change: "create" | "update" | "delete" | "take_over";
  updatedAt: string;
  about?: string[];
}

interface Summary {
  created: number;
  updated: number;
  deleted: number;
  data: string[];
  changes: { change: string; kind: string; path: string }[];
  warnings?: { path: string; message: string }[];
}

interface Refusal {
  code: string;
  detail: string;
  errors: { path: string; message: string }[];
}

interface Ledger {
  id: string;
  bundleVersion: number;
  message?: string | null;
  createdBy?: string;
  createdAt: string;
  promotedFromWorkspaceId: string | null;
  runningIn?: { id: string; name: string; type: string }[];
  summary: { created?: number; updated?: number; deleted?: number };
}

interface PromotionPreview {
  target: { id: string; name: string; type: string };
  bundle: { digest: string; version: number };
  possible: boolean;
  refusal: Refusal | null;
  summary: Summary | null;
  tried: { runs: number; failed: number; flowRuns: number; flowRunsFailed: number };
  triggers: number;
}

const CHANGE_TAG: Record<DraftRow["change"], [string, "draft" | "live" | "danger" | "repository"]> =
  {
    create: ["New", "live"],
    update: ["Changed", "draft"],
    delete: ["Removed", "danger"],
    take_over: ["Taken over", "repository"],
  };

const KIND_LABEL: Record<string, string> = {
  flow: "Flows",
  script: "Scripts",
  interface: "Apps",
  app: "Apps",
  table: "Tables",
  connector: "Connectors",
  trigger_source: "Trigger sources",
};

export type ReleaseStep = "review" | "deploy" | "promote";

/**
 * Releasing what was made here: review the drafts and deploy them to this dev
 * workspace, then promote what runs here to production. Two different acts,
 * with production's always the amber one.
 */
export function Release({
  base,
  root,
  link,
  workspace,
  step: initial,
  reload,
}: {
  base: string;
  root: string;
  link: string;
  workspace: Workspace;
  step: ReleaseStep;
  reload: () => void;
}) {
  const [step, setStep] = useState<ReleaseStep>(
    workspace.type === "production" ? "deploy" : initial,
  );
  const drafts = useLoad<{ items: DraftRow[] }>(workspace.type === "dev" ? `${root}/drafts` : null);
  const workspaces = useLoad<{ items: Workspace[] }>(`${base}/workspaces`);
  const target = workspaces.data?.items.find((one) => one.id === workspace.linkedWorkspaceId);
  const count = drafts.data?.items.length ?? 0;
  const [deployed, setDeployed] = useState<string>();

  const steps =
    workspace.type === "production"
      ? [{ key: "deploy", label: "What runs here", detail: "Versions and rollback" }]
      : [
          {
            key: "review",
            label: "Review draft",
            detail: `${count} change${count === 1 ? "" : "s"}`,
          },
          { key: "deploy", label: "Deploy to dev", detail: workspace.name },
          ...(workspace.linkedWorkspaceId
            ? [{ key: "promote", label: "Promote", detail: target?.name ?? "Linked workspace" }]
            : []),
        ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Release"
        title={workspace.type === "production" ? "Versions" : "Release"}
        description={
          workspace.type === "production"
            ? "What runs here, and what ran before. Rolling back activates an earlier version; promotion from the dev workspace is how changes arrive."
            : "Drafts become a version of this dev workspace when deployed. A version reaches production only when it is promoted, and that is a separate, deliberate step."
        }
        meta={<EnvTag type={workspace.type} />}
      />
      {steps.length > 1 ? (
        <Panel className="px-3 py-2">
          <Stepper steps={steps} current={step} onChoose={(key) => setStep(key as ReleaseStep)} />
        </Panel>
      ) : null}
      {deployed ? <Notice tone="success">{deployed}</Notice> : null}
      {step === "review" ? (
        <ReviewStep
          root={root}
          link={link}
          drafts={drafts.data?.items}
          error={drafts.error?.message}
          reload={drafts.reload}
          onDeployed={(text) => {
            setDeployed(text);
            drafts.reload();
            reload();
            setStep("deploy");
          }}
        />
      ) : step === "deploy" ? (
        <LedgerStep root={root} workspace={workspace} />
      ) : target ? (
        <PromoteStep root={root} link={link} workspace={workspace} target={target} />
      ) : null}
    </div>
  );
}

function ReviewStep({
  root,
  link,
  drafts,
  error,
  reload,
  onDeployed,
}: {
  root: string;
  link: string;
  drafts: DraftRow[] | undefined;
  error: string | undefined;
  reload: () => void;
  onDeployed: (said: string) => void;
}) {
  const count = drafts?.length ?? 0;
  const preview = useLoad<{ possible: boolean; refusal: Refusal | null; summary: Summary | null }>(
    count > 0 ? `${root}/changes/preview` : null,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string>();

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!drafts) return <p className="text-ink-muted">Loading…</p>;
  if (drafts.length === 0)
    return (
      <div className="flex flex-col gap-3">
        <EmptyCanvas
          title="Nothing waiting to be deployed"
          text="Save a flow, a script or an app in this workspace and it appears here, with what it changes."
        />
      </div>
    );

  const groups = [...new Set(drafts.map((row) => KIND_LABEL[row.kind] ?? row.kind))];
  const editLink = (row: DraftRow) =>
    row.deleted
      ? undefined
      : row.kind === "flow"
        ? `${link}/flows/edit/${row.path}`
        : row.kind === "script"
          ? `${link}/scripts/edit/${row.path}`
          : row.kind === "interface"
            ? `${link}/screens/${row.path}`
            : undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group} className="flex flex-col gap-2">
            <SectionLabel>{group}</SectionLabel>
            <Panel as="div" className="divide-y divide-line">
              {drafts
                .filter((row) => (KIND_LABEL[row.kind] ?? row.kind) === group)
                .map((row) => {
                  const to = editLink(row);
                  return (
                    <div key={row.path} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          {to ? (
                            <Link to={to} className="truncate font-mono text-telemetry">
                              {row.path}
                            </Link>
                          ) : (
                            <Mono className="truncate">{row.path}</Mono>
                          )}
                          <Tag tone={CHANGE_TAG[row.change][1]}>{CHANGE_TAG[row.change][0]}</Tag>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-meta text-ink-subtle">
                            saved {fromNow(row.updatedAt)}
                          </span>
                          <Button size="small" variant="quiet" onClick={() => setHistory(row.path)}>
                            <History aria-hidden="true" size={13} /> Earlier
                          </Button>
                          <Button
                            size="small"
                            variant="danger"
                            onClick={async () => {
                              const sure = await ask.confirm({
                                title: `Set aside the draft of ${row.path}?`,
                                text: "It goes back to how it was last deployed. The draft stays in its history, and can be brought back.",
                                action: "Set aside",
                                danger: true,
                              });
                              if (!sure) return;
                              await api
                                .delete(`${root}/drafts/${row.path}`)
                                .then(reload, notify.error);
                              preview.reload();
                            }}
                          >
                            Set aside
                          </Button>
                        </span>
                      </div>
                      {row.about && row.about.length > 0 ? (
                        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-meta text-ink-muted">
                          {row.about.map((line) => (
                            <li key={line} className="flex items-start gap-2">
                              <span className="mt-[5px]">
                                <Junction kind="plain" size={5} />
                              </span>
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
            </Panel>
          </section>
        ))}
      </div>
      <Panel className="flex h-fit flex-col gap-3 p-4">
        <SectionLabel>Deploy to this dev workspace</SectionLabel>
        {preview.error ? <Notice tone="danger">{preview.error.message}</Notice> : null}
        {preview.data?.refusal ? (
          <Notice tone="danger">
            <strong>These changes cannot be deployed yet.</strong> {preview.data.refusal.detail}
            <ul className="mt-2 mb-0 pl-5">
              {preview.data.refusal.errors.map((one) => (
                <li key={`${one.path} ${one.message}`}>
                  <Mono>{one.path}</Mono> {one.message}
                </li>
              ))}
            </ul>
          </Notice>
        ) : preview.data?.summary ? (
          <>
            <p className="m-0 text-ink-muted">
              Deploying creates {preview.data.summary.created}, changes{" "}
              {preview.data.summary.updated} and removes {preview.data.summary.deleted}.
              {preview.data.summary.data.length > 0
                ? ` ${preview.data.summary.data.join(" ")}`
                : ""}
            </p>
            {(preview.data.summary.warnings ?? []).length > 0 ? (
              <Notice tone="attention">
                <span className="flex items-center gap-1.5 font-medium">
                  <TriangleAlert aria-hidden="true" size={14} /> Not bound here, and the deploy
                  still works
                </span>
                <ul className="mt-1 mb-0 pl-5">
                  {(preview.data.summary.warnings ?? []).map((one) => (
                    <li key={one.path}>
                      {one.message}. A run that reaches it fails until it is bound.
                    </li>
                  ))}
                </ul>
              </Notice>
            ) : null}
          </>
        ) : (
          <p className="m-0 text-ink-muted">Checking what a deploy would do…</p>
        )}
        <TextField
          name="message"
          label="What changed"
          value={message}
          required={false}
          placeholder="Send large orders for approval"
          hint="Kept with the version, and used as the commit message when the workspace follows a branch."
          onChange={setMessage}
        />
        <Button
          variant="primary"
          disabled={busy || !preview.data?.possible}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await api.post<{ bundleVersion: number; applied: string[] }>(
                `${root}/changes/deploy`,
                message ? { message } : {},
              );
              setMessage("");
              onDeployed(
                `Deployed as version ${result.bundleVersion}: ${result.applied.join(", ")}.`,
              );
            } catch (caught) {
              notify.error(caught);
              preview.reload();
            } finally {
              setBusy(false);
            }
          }}
        >
          Deploy {count} {count === 1 ? "change" : "changes"}
        </Button>
        <p className="m-0 text-meta text-ink-subtle">
          This deploys to this dev workspace only. Production is untouched.
        </p>
      </Panel>
      <DraftHistory
        root={root}
        path={history}
        onClose={() => setHistory(undefined)}
        onRestored={reload}
      />
    </div>
  );
}

function DraftHistory({
  root,
  path,
  onClose,
  onRestored,
}: {
  root: string;
  path: string | undefined;
  onClose: () => void;
  onRestored: () => void;
}) {
  const history = useLoad<{
    items: {
      id: string;
      revision: number;
      reason: string;
      savedAt: string;
      keptAt: string;
      deleted: boolean;
    }[];
  }>(path ? `${root}/draft-history/${path}` : null);
  return (
    <SideSheet
      open={path !== undefined}
      onClose={onClose}
      title={`Earlier versions of ${path ?? ""}`}
      description="Each save keeps what it replaced. Bringing one back makes it the draft again."
    >
      {history.error ? (
        <Notice tone="danger">{history.error.message}</Notice>
      ) : !history.data ? (
        <p className="m-0 text-ink-muted">Loading…</p>
      ) : history.data.items.length === 0 ? (
        <p className="m-0 text-ink-muted">No earlier versions yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {history.data.items.map((one) => (
            <li
              key={one.id}
              className="flex items-center justify-between gap-2 rounded-control border border-line px-3 py-2"
            >
              <span className="flex flex-col">
                <span>
                  Revision <Mono>{one.revision}</Mono>{" "}
                  {one.reason === "set_aside" ? <Tag tone="neutral">Set aside</Tag> : null}
                </span>
                <span className="text-meta text-ink-subtle">saved {fromNow(one.savedAt)}</span>
              </span>
              <Button
                size="small"
                onClick={async () => {
                  try {
                    await api.post(`${root}/draft-history/${one.id}/restore`, {});
                    onRestored();
                    onClose();
                  } catch (caught) {
                    notify.error(caught);
                  }
                }}
              >
                Bring back
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SideSheet>
  );
}

function LedgerStep({ root, workspace }: { root: string; workspace: Workspace }) {
  const ledger = useLoad<{ items: Ledger[] }>(`${root}/deployments`);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionLabel>Versions of {workspace.name}</SectionLabel>
        {ledger.error ? (
          <Notice tone="danger">{ledger.error.message}</Notice>
        ) : !ledger.data ? (
          <p className="text-ink-muted">Loading…</p>
        ) : ledger.data.items.length === 0 ? (
          <EmptyCanvas title="Nothing deployed here yet" />
        ) : (
          <Panel as="div" className="divide-y divide-line">
            {ledger.data.items.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <Mono className="w-12 shrink-0 text-ink">v{row.bundleVersion}</Mono>
                <span className="min-w-0 flex-1 truncate">
                  {row.message ?? (row.promotedFromWorkspaceId ? "Promoted" : "No message")}
                </span>
                <span className="text-meta text-ink-subtle">
                  {row.createdBy ?? "—"} · {fromNow(row.createdAt)}
                </span>
                <span className="flex gap-1">
                  {(row.runningIn ?? []).map((one) => (
                    <Tag key={one.id} tone={one.type === "production" ? "production" : "dev"}>
                      Running in {one.name}
                    </Tag>
                  ))}
                </span>
              </div>
            ))}
          </Panel>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <SectionLabel>Bundles and rollback</SectionLabel>
        <Deployments root={root} />
      </section>
    </div>
  );
}

function PromoteStep({
  root,
  link,
  workspace,
  target,
}: {
  root: string;
  link: string;
  workspace: Workspace;
  target: Workspace;
}) {
  const preview = useLoad<PromotionPreview>(`${root}/promotion-preview`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    bundleVersion: number;
    release?: { status: string; branch: string | null; problem?: string };
  }>();
  const [problem, setProblem] = useState<string>();
  const data = preview.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <Panel className="flex flex-col gap-1.5 p-4">
          <span className="text-label text-ink-subtle uppercase">From</span>
          <span className="flex items-center gap-2 font-medium">
            {workspace.name} <EnvTag type="dev" />
          </span>
          <span className="text-meta text-ink-muted">
            Runs <Mono>v{data?.bundle.version ?? "…"}</Mono>
          </span>
        </Panel>
        <ArrowRight
          aria-hidden="true"
          className="mx-auto rotate-90 text-ink-subtle md:rotate-0"
          size={18}
        />
        <Panel className="flex flex-col gap-1.5 border-attention/40 p-4">
          <span className="text-label text-ink-subtle uppercase">To</span>
          <span className="flex items-center gap-2 font-medium">
            {target.name} <EnvTag type={target.type} />
          </span>
          <span className="text-meta text-ink-muted">
            Gets the same bundle, by its digest. Nothing is rebuilt.
          </span>
        </Panel>
      </div>

      {preview.error ? <Notice tone="danger">{preview.error.message}</Notice> : null}
      {!data ? (
        <p className="text-ink-muted">Working out what promoting would do…</p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="flex flex-col gap-2">
            <SectionLabel>What changes in {target.name}</SectionLabel>
            <Panel className="flex flex-col gap-2 p-4">
              {data.refusal ? (
                <Notice tone="danger">
                  <strong>It cannot be promoted yet.</strong> {data.refusal.detail}
                  <ul className="mt-2 mb-0 pl-5">
                    {data.refusal.errors.map((one) => (
                      <li key={`${one.path} ${one.message}`}>
                        <Mono>{one.path}</Mono> {one.message}
                      </li>
                    ))}
                  </ul>
                </Notice>
              ) : data.summary ? (
                <>
                  <p className="m-0 text-ink-muted">
                    Creates {data.summary.created}, changes {data.summary.updated} and removes{" "}
                    {data.summary.deleted}.
                  </p>
                  {data.summary.changes.length > 0 ? (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {data.summary.changes.map((one) => (
                        <li
                          key={`${one.kind}-${one.path}`}
                          className="flex items-center gap-2 text-meta"
                        >
                          <Tag
                            tone={
                              one.change === "deleted"
                                ? "danger"
                                : one.change === "created"
                                  ? "live"
                                  : "draft"
                            }
                          >
                            {one.change}
                          </Tag>
                          <Mono>{one.path}</Mono>
                          <span className="text-ink-subtle">{one.kind}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {data.summary.data.length > 0 ? (
                    <p className="m-0 text-meta text-ink-muted">{data.summary.data.join(" ")}</p>
                  ) : (
                    <p className="m-0 text-meta text-ink-muted">No table changes.</p>
                  )}
                </>
              ) : null}
            </Panel>
          </section>
          <section className="flex flex-col gap-2">
            <SectionLabel>Before it goes</SectionLabel>
            <Panel className="flex flex-col gap-3 p-4">
              <KeyValues
                rows={[
                  {
                    label: "Tried here",
                    value: `${data.tried.runs + data.tried.flowRuns} runs, ${data.tried.failed + data.tried.flowRunsFailed} failed`,
                    mono: true,
                  },
                  { label: "Triggers there", value: `${data.triggers} stay running`, mono: true },
                ]}
              />
              {data.tried.runs + data.tried.flowRuns === 0 ? (
                <Notice tone="attention">
                  This version has not run here yet. Try it before it reaches production.
                </Notice>
              ) : data.tried.failed + data.tried.flowRunsFailed > 0 ? (
                <Notice tone="attention">
                  Some of its runs here failed.{" "}
                  <Link to={`${link}/runs?status=failed`}>See them</Link>
                </Notice>
              ) : (
                <StatePill state="succeeded">Every run here succeeded</StatePill>
              )}
            </Panel>
          </section>
        </div>
      )}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {result ? (
        <Notice tone="success">
          {target.name} now runs version {result.bundleVersion}.
          {result.release?.status === "done" ? ` Committed to ${result.release.branch}.` : ""}
          {result.release?.status === "failed"
            ? ` The release branch was not updated: ${result.release.problem ?? "the push failed"}. Try again from Git sync.`
            : ""}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="promote"
          disabled={busy || !data?.possible}
          onClick={async () => {
            const sure = await ask.confirm({
              title: `Promote to ${target.name}?`,
              text: `${target.name} starts running version ${data?.bundle.version} at once. Runs in progress there finish on the version they started with.`,
              action: "Promote to production",
              danger: true,
            });
            if (!sure) return;
            setBusy(true);
            setProblem(undefined);
            try {
              setResult(await api.post(`${root}/promotions`, {}));
              preview.reload();
            } catch (caught) {
              setProblem(failureText(caught));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Rocket aria-hidden="true" size={15} /> Promote to{" "}
          {target.type === "production" ? "production" : target.name}
        </Button>
        <Button variant="quiet" onClick={() => navigate(`${link}/settings`)}>
          Change where this promotes to
        </Button>
      </div>
    </div>
  );
}
