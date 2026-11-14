import { Notice } from "@vynxlabs/ui";
import { CircleCheck, CirclePause, Cpu, Globe, LifeBuoy } from "lucide-react";
import type { ReactNode } from "react";
import { useLoad } from "../api.ts";
import { actionWords } from "../audit-words.ts";
import { KeyValues, NextStep, PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { EnvTag, Mono, StatePill } from "../kit/status.tsx";
import { when } from "../ListScreen.tsx";
import { Link } from "../router.tsx";
import type { TenantCounts, WorkspaceCounts } from "../Shell.tsx";

interface Workspace {
  id: string;
  slug: string;
  name: string;
  type: "production" | "dev";
  linkedWorkspaceId: string | null;
  triggersPaused: boolean;
}

interface AuditEntry {
  id: string;
  occurredAt: string;
  actorLabel: string | null;
  actorType: string;
  action: string;
}

const linkClass = "text-action hover:underline";

/** A link that reads as the step to take, beside a notice. */
const Go = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className={`${linkClass} text-[13px] font-medium`}>
    {children}
  </Link>
);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A tenant at a glance: what asks for someone, each workspace with its release
 * and its failures, who is here, and what changed last.
 */
export function TenantOverview({ base, tenantId }: { base: string; tenantId: string }) {
  const tenant = useLoad<{ name: string; slug: string }>(base);
  const counts = useLoad<TenantCounts>(`${base}/summary`);
  const workspaces = useLoad<{ items: Workspace[] }>(`${base}/workspaces`);
  const recent = useLoad<{ items: AuditEntry[] }>(`${base}/audit?limit=8`);
  const c = counts.data;
  const t = (slug: string) => `/t/${tenantId}/${slug}`;

  const attention: ReactNode[] = [];
  if (c?.approvalsWaiting) {
    attention.push(
      <NextStep
        key="approvals"
        tone="attention"
        icon={<CirclePause aria-hidden="true" size={15} />}
        title={`${plural(c.approvalsWaiting, "approval")} waiting`}
        detail="A flow is paused until someone decides."
        action={<Go to={t("approvals")}>Decide</Go>}
      />,
    );
  }
  if (c?.domainsToFix) {
    attention.push(
      <NextStep
        key="domains"
        tone="attention"
        icon={<Globe aria-hidden="true" size={15} />}
        title={`${plural(c.domainsToFix, "hostname")} to check`}
        detail="Its last check failed, or it is waiting on its DNS record before it can serve."
        action={<Go to={t("domains")}>Check</Go>}
      />,
    );
  }
  if (c?.operatorAccessActive) {
    attention.push(
      <NextStep
        key="operators"
        tone="attention"
        icon={<LifeBuoy aria-hidden="true" size={15} />}
        title={`${plural(c.operatorAccessActive, "operator")} inside this tenant now`}
        detail="Under an access grant you can end at any time."
        action={<Go to={t("operator-access")}>Review</Go>}
      />,
    );
  }
  if (c?.workersOnline === 0) {
    attention.push(
      <NextStep
        key="workers"
        tone="danger"
        icon={<Cpu aria-hidden="true" size={15} />}
        title="No worker is online"
        detail="Runs wait in the queue until one connects."
        action={<Go to={t("workers")}>Workers</Go>}
      />,
    );
  }

  const items = workspaces.data?.items ?? [];
  const production = items.filter((one) => one.type === "production");
  const ordered = [...production, ...items.filter((one) => one.type === "dev")];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Tenant"
        title={tenant.data?.name ?? "Overview"}
        description="What asks for someone, how each workspace stands, and what changed last."
        meta={tenant.data ? <Mono>{tenant.data.slug}</Mono> : null}
      />
      {counts.error ? <Notice tone="danger">{counts.error.message}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="attention" className="flex flex-col gap-2">
            <SectionLabel>
              <span id="attention">Needs attention</span>
            </SectionLabel>
            <Panel className="divide-y divide-line">
              {!c ? (
                <p className="m-0 px-4 py-3 text-ink-muted">Loading…</p>
              ) : attention.length > 0 ? (
                attention
              ) : (
                <NextStep
                  tone="success"
                  icon={<CircleCheck aria-hidden="true" size={15} />}
                  title="Nothing needs you"
                  detail="No approvals waiting, every hostname works, and workers are online."
                />
              )}
            </Panel>
          </section>

          <section aria-labelledby="workspaces" className="flex flex-col gap-2">
            <SectionLabel action={<Go to={t("workspaces")}>All workspaces</Go>}>
              <span id="workspaces">Workspaces</span>
            </SectionLabel>
            {workspaces.error ? (
              <Notice tone="danger">{workspaces.error.message}</Notice>
            ) : (
              <Panel className="divide-y divide-line">
                {!workspaces.data ? (
                  <p className="m-0 px-4 py-3 text-ink-muted">Loading…</p>
                ) : ordered.length === 0 ? (
                  <p className="m-0 px-4 py-3 text-ink-muted">
                    No workspaces yet. <Go to={t("workspaces")}>Create one</Go>
                  </p>
                ) : (
                  ordered
                    .slice(0, 12)
                    .map((workspace) => (
                      <WorkspaceLine
                        key={workspace.id}
                        base={base}
                        tenantId={tenantId}
                        workspace={workspace}
                        target={items.find((one) => one.id === workspace.linkedWorkspaceId)}
                      />
                    ))
                )}
              </Panel>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="glance" className="flex flex-col gap-2">
            <SectionLabel>
              <span id="glance">At a glance</span>
            </SectionLabel>
            <Panel className="p-4">
              <KeyValues
                rows={[
                  { label: "Workspaces", value: c?.workspaces ?? "—" },
                  {
                    label: "Members",
                    value:
                      c?.members === null || c?.members === undefined ? (
                        "—"
                      ) : (
                        <Link to={t("members")} className={linkClass}>
                          {c.members}
                        </Link>
                      ),
                  },
                  {
                    label: "Workers online",
                    value: c?.workersOnline ?? "—",
                  },
                  {
                    label: "Hostnames to fix",
                    value: c?.domainsToFix ?? "—",
                  },
                ]}
              />
            </Panel>
          </section>

          <section aria-labelledby="recent" className="flex flex-col gap-2">
            <SectionLabel action={<Go to={t("audit")}>Audit log</Go>}>
              <span id="recent">Recent changes</span>
            </SectionLabel>
            <Panel>
              {recent.error ? (
                <p className="m-0 px-4 py-3 text-ink-muted">
                  The audit log is not open to you here.
                </p>
              ) : !recent.data ? (
                <p className="m-0 px-4 py-3 text-ink-muted">Loading…</p>
              ) : recent.data.items.length === 0 ? (
                <p className="m-0 px-4 py-3 text-ink-muted">Nothing has changed yet.</p>
              ) : (
                <ol className="m-0 flex list-none flex-col p-0">
                  {recent.data.items.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-0.5 border-line border-b px-4 py-2.5 last:border-b-0"
                    >
                      <span className="truncate font-medium" title={entry.action}>
                        {actionWords(entry.action)}
                      </span>
                      <span className="text-meta text-ink-muted">
                        {entry.actorLabel ?? entry.actorType} · {when(entry.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </section>
        </div>
      </div>
    </div>
  );
}

/** One workspace: its kind, its release, what failed today and what is waiting in it. */
function WorkspaceLine({
  base,
  tenantId,
  workspace,
  target,
}: {
  base: string;
  tenantId: string;
  workspace: Workspace;
  target: Workspace | undefined;
}) {
  const summary = useLoad<WorkspaceCounts>(`${base}/workspaces/${workspace.id}/summary`);
  const s = summary.data;
  const failed = s?.failedRuns.count ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            to={`/t/${tenantId}/workspaces/${workspace.id}/overview`}
            className="font-medium text-action hover:underline"
          >
            {workspace.name}
          </Link>
          <EnvTag type={workspace.type} />
        </span>
        <span className="text-meta text-ink-muted">
          {s?.version ? `Running v${s.version}` : "Nothing deployed"}
          {target ? ` · promotes to ${target.name}` : ""}
          {workspace.triggersPaused ? " · triggers paused" : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta">
        {s ? (
          <>
            {failed > 0 ? (
              <StatePill state="failed">{plural(failed, "failed run")} today</StatePill>
            ) : (
              <StatePill state="ok">No failures today</StatePill>
            )}
            {s.drafts ? <StatePill state="info">{plural(s.drafts, "draft")}</StatePill> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
