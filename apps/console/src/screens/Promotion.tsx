import { Button, Notice, SideSheet, TextAreaField } from "@vynxlabs/ui";
import { GitPullRequestArrow } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { Panel, SectionLabel } from "../kit/layout.tsx";
import { Mono, StatePill } from "../kit/status.tsx";
import { fromNow } from "./Overview.tsx";
import { PreviewPanels, type PromotionPreview } from "./Release.tsx";

/** A request for a promotion, as the API shows it. */
export interface PromotionRequest {
  id: string;
  source: { id: string; slug: string; name: string };
  target: { id: string; slug: string; name: string };
  version: number;
  digest: string;
  note: string | null;
  status: "pending" | "promoted" | "declined" | "withdrawn" | "superseded";
  requestedBy: { type: string; id: string | null; name: string };
  createdAt: string;
  decidedBy: { type: string; id: string | null; name: string } | null;
  decidedAt: string | null;
  comment: string | null;
  sourceVersionNow: number | null;
  mayDecide: boolean;
  mine: boolean;
}

/**
 * For one who may not promote: ask those who may, with a note, and see what
 * became of the last request.
 */
export function RequestPromotion({
  root,
  tenantId,
  version,
  targetName,
  request,
  onChanged,
}: {
  root: string;
  tenantId: string;
  version: number | undefined;
  targetName: string;
  request: PromotionRequest | null;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await work();
      onChanged();
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };
  const waiting = request?.status === "pending";
  return (
    <section className="flex flex-col gap-2" aria-label="Request promotion">
      <SectionLabel>Promoting to {targetName}</SectionLabel>
      <Panel className="flex flex-col gap-3 p-4">
        <p className="m-0 text-ink-muted">
          You may not promote to {targetName} yourself. Ask, and those who may are shown your
          request on the tenant's overview, with what it would change.
        </p>
        {request ? <RequestState request={request} /> : null}
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {waiting ? (
          <div>
            <Button
              size="small"
              disabled={busy}
              onClick={() =>
                run(() => api.delete(`/tenants/${tenantId}/promotion-requests/${request.id}`))
              }
            >
              Withdraw the request
            </Button>
          </div>
        ) : (
          <>
            <TextAreaField
              name="note"
              label="A note for whoever decides (optional)"
              rows={2}
              value={note}
              onChange={setNote}
            />
            <div>
              <Button
                variant="primary"
                disabled={busy || version === undefined}
                onClick={() =>
                  run(async () => {
                    await api.post(`${root}/promotion-requests`, note.trim() ? { note } : {});
                    setNote("");
                    notify.success(`Asked for version ${version} to be promoted.`);
                  })
                }
              >
                <GitPullRequestArrow aria-hidden="true" size={16} /> Request promotion of v
                {version ?? "…"}
              </Button>
            </div>
          </>
        )}
      </Panel>
    </section>
  );
}

/** Where a request stands, said in a line or two. */
export function RequestState({ request }: { request: PromotionRequest }) {
  const moved =
    request.sourceVersionNow !== null && request.sourceVersionNow > request.version
      ? ` ${request.source.name} has moved on to v${request.sourceVersionNow} since.`
      : "";
  if (request.status === "pending") {
    return (
      <p className="m-0 flex flex-wrap items-center gap-2">
        <StatePill state="waiting">Waiting</StatePill>
        <span className="text-meta text-ink-muted">
          Asked {fromNow(request.createdAt)} by {request.requestedBy.name} for v{request.version}.
          {moved}
        </span>
      </p>
    );
  }
  if (request.status === "promoted") {
    return (
      <p className="m-0 flex flex-wrap items-center gap-2">
        <StatePill state="succeeded">Promoted</StatePill>
        <span className="text-meta text-ink-muted">
          v{request.version}, by {request.decidedBy?.name}{" "}
          {request.decidedAt ? fromNow(request.decidedAt) : ""}.
        </span>
      </p>
    );
  }
  if (request.status === "declined") {
    return (
      <div className="flex flex-col gap-1">
        <p className="m-0 flex flex-wrap items-center gap-2">
          <StatePill state="failed">Declined</StatePill>
          <span className="text-meta text-ink-muted">
            v{request.version}, by {request.decidedBy?.name}{" "}
            {request.decidedAt ? fromNow(request.decidedAt) : ""}.
          </span>
        </p>
        {request.comment ? (
          <blockquote className="m-0 border-line border-l-2 pl-3 text-ink">
            {request.comment}
          </blockquote>
        ) : null}
      </div>
    );
  }
  return null;
}

/**
 * Promotion requests waiting on the one looking, on the tenant's overview:
 * each reviewed and decided in place.
 */
export function PromotionRequests({
  tenantId,
  onDecided,
}: {
  tenantId: string;
  onDecided?: () => void;
}) {
  const list = useLoad<{ items: PromotionRequest[] }>(
    `/tenants/${tenantId}/promotion-requests?status=pending`,
  );
  const [open, setOpen] = useState<PromotionRequest>();
  const waiting = (list.data?.items ?? []).filter((one) => one.mayDecide);
  if (waiting.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Promotion requests">
      <SectionLabel>Promotion requests</SectionLabel>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {waiting.map((request) => (
          <li key={request.id}>
            <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  {request.requestedBy.name} asks to promote <Mono>v{request.version}</Mono> from{" "}
                  {request.source.name} to {request.target.name}
                </span>
                <span className="text-meta text-ink-muted">
                  {fromNow(request.createdAt)}
                  {request.note ? ` · “${request.note}”` : ""}
                  {request.sourceVersionNow !== null && request.sourceVersionNow > request.version
                    ? ` · ${request.source.name} is now at v${request.sourceVersionNow}`
                    : ""}
                </span>
              </div>
              <Button size="small" variant="primary" onClick={() => setOpen(request)}>
                Review
              </Button>
            </Panel>
          </li>
        ))}
      </ul>
      {open ? (
        <ReviewRequest
          tenantId={tenantId}
          request={open}
          onClose={() => setOpen(undefined)}
          onDecided={() => {
            setOpen(undefined);
            list.reload();
            onDecided?.();
          }}
        />
      ) : null}
    </section>
  );
}

/** A request's promotion preview, with Promote and Decline. */
function ReviewRequest({
  tenantId,
  request,
  onClose,
  onDecided,
}: {
  tenantId: string;
  request: PromotionRequest;
  onClose: () => void;
  onDecided: () => void;
}) {
  const at = `/tenants/${tenantId}/promotion-requests/${request.id}`;
  const preview = useLoad<PromotionPreview & { tried?: PromotionPreview["tried"] }>(
    `${at}/preview`,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const link = `/t/${tenantId}/workspaces/${request.source.id}`;
  const decide = async (decision: "promote" | "decline") => {
    let comment: string | null = null;
    if (decision === "decline") {
      comment = await ask.prompt({
        title: "Decline the request?",
        label: "Why? The one who asked reads it.",
        required: true,
        multiline: true,
        action: "Decline",
        danger: true,
      });
      if (comment === null) return;
    } else {
      const sure = await ask.confirm({
        title: `Promote v${request.version} to ${request.target.name}?`,
        text: `${request.target.name} starts running it at once. Runs in progress there finish on the version they started with.`,
        action: "Promote",
        danger: true,
      });
      if (!sure) return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      await api.post(`${at}/decision`, { decision, ...(comment ? { comment } : {}) });
      notify.success(
        decision === "promote"
          ? `${request.target.name} now runs v${request.version}.`
          : "Declined. The one who asked is shown why.",
      );
      onDecided();
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SideSheet
      open
      size="wide"
      onClose={onClose}
      title={`Promote v${request.version} to ${request.target.name}?`}
      description={`Asked by ${request.requestedBy.name} ${fromNow(request.createdAt)}, from ${request.source.name}.`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={busy} onClick={() => decide("decline")}>
            Decline…
          </Button>
          <Button
            variant="promote"
            disabled={busy || !preview.data?.possible}
            onClick={() => decide("promote")}
          >
            Promote
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {request.note ? (
          <blockquote className="m-0 border-line border-l-2 pl-3">{request.note}</blockquote>
        ) : null}
        {request.sourceVersionNow !== null && request.sourceVersionNow > request.version ? (
          <Notice tone="attention">
            {request.source.name} has deployed v{request.sourceVersionNow} since. This promotes v
            {request.version}, what was asked for.
          </Notice>
        ) : null}
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {preview.error ? <Notice tone="danger">{preview.error.message}</Notice> : null}
        {preview.data ? (
          preview.data.tried ? (
            <PreviewPanels data={preview.data} targetName={request.target.name} link={link} />
          ) : (
            <ChangesOnly data={preview.data} />
          )
        ) : (
          <p className="m-0 text-ink-muted">Working out what it would change…</p>
        )}
      </div>
    </SideSheet>
  );
}

/** The changes alone, for a preview that says nothing of runs. */
function ChangesOnly({ data }: { data: PromotionPreview }) {
  if (data.refusal) {
    return (
      <Notice tone="danger">
        <strong>It cannot be promoted.</strong> {data.refusal.detail}
      </Notice>
    );
  }
  const summary = data.summary;
  if (!summary) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-ink-muted">
        Creates {summary.created}, changes {summary.updated} and removes {summary.deleted}.
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {summary.changes.map((one) => (
          <li
            key={`${one.kind}-${one.path}`}
            className="flex flex-wrap items-center gap-2 text-meta"
          >
            <span className="text-ink-subtle">{one.change}</span>
            <Mono>{one.path}</Mono>
            <span className="text-ink-subtle">{one.kind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
