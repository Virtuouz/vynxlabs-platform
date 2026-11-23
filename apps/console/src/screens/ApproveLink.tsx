import { Button, ContainedArea, Notice, ResultView, TextAreaField } from "@volvel/ui";
import { useEffect, useState } from "react";
import { type ApiError, api } from "../api.ts";
import { failureText } from "../ask.tsx";
import { REJECTING } from "../kit/approvals.ts";
import { BrandMark, useBrand } from "../kit/brand.tsx";
import { clock } from "../kit/format.ts";
import { Loading } from "../kit/LoadState.tsx";
import { EnvTag, Mono } from "../kit/status.tsx";

interface Asked {
  title: string;
  detail: unknown;
  flow: string;
  flowRunId: string;
  workspace: { id: string; name: string; type: "dev" | "production" };
  tenant: { id: string; name: string };
  approver: { name: string };
  waitingSince: string;
  expiresAt: string;
  test: boolean;
}

interface Decided {
  decision: "approve" | "reject";
  approver: { name: string };
  flowRunId: string;
  tenantId: string;
  workspaceId: string;
}

/**
 * Where an approval mail's link leads: what is asked, and a choice. No sign-in:
 * the link is the approver's own. Opening it decides nothing.
 */
export function ApproveLink({ token }: { token: string }) {
  const brand = useBrand();
  const [asked, setAsked] = useState<Asked>();
  const [gone, setGone] = useState<string>();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [decided, setDecided] = useState<Decided>();

  useEffect(() => {
    api
      .get<Asked>(`/approval-links/${encodeURIComponent(token)}`)
      .then(setAsked)
      .catch((error: ApiError) =>
        setGone(
          error.status === 410 || error.status === 400
            ? "This link has been used, the approval was decided, or it ran out."
            : failureText(error),
        ),
      );
  }, [token]);

  const decide = async (decision: "approve" | "reject") => {
    if (decision === "reject" && !comment.trim()) {
      setProblem("Say why it is rejected: whoever asked reads it.");
      return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      setDecided(
        await api.post<Decided>(`/approval-links/${encodeURIComponent(token)}`, {
          decision,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      );
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-structure px-4 py-10">
      <div className="flex w-full max-w-[34rem] flex-col gap-6">
        <div className="flex items-center gap-2">
          <BrandMark size={30} decorative />
          <span className="text-title font-semibold">{brand.productName}</span>
          <span className="text-ink-subtle">Approval</span>
        </div>
        <div className="flex min-w-0 flex-col gap-4 rounded-panel border border-line bg-canvas p-6 sm:p-8">
          <ContainedArea>
            {gone ? (
              <>
                <h1 className="m-0 text-title">Nothing to decide here</h1>
                <p className="m-0 text-ink-muted">{gone}</p>
                <p className="m-0">
                  <a href="/" className="text-action">
                    See the approvals waiting in the console
                  </a>
                </p>
              </>
            ) : decided ? (
              <>
                <h1 className="m-0 text-title">
                  {decided.decision === "approve" ? "Approved" : "Rejected"}. Thank you,{" "}
                  {decided.approver.name}.
                </h1>
                <p className="m-0 text-ink-muted">
                  {decided.decision === "approve" ? "The flow carries on." : REJECTING} Your
                  decision and your comment are recorded under your name.
                </p>
                <p className="m-0">
                  <a
                    href={`/t/${decided.tenantId}/workspaces/${decided.workspaceId}/runs/${decided.flowRunId}`}
                    className="text-action"
                  >
                    Open the run
                  </a>
                </p>
              </>
            ) : !asked ? (
              <Loading />
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-meta text-ink-muted">
                    {asked.tenant.name} · {asked.workspace.name}{" "}
                    <EnvTag type={asked.workspace.type} />
                    {asked.test ? <span className="text-attention">· a test run</span> : null}
                  </span>
                  <h1 className="m-0 text-title break-words">{asked.title}</h1>
                  <span className="text-meta text-ink-muted">
                    The flow <Mono>{asked.flow}</Mono> waits for a decision, since{" "}
                    {clock(asked.waitingSince)}.
                  </span>
                </div>
                {asked.detail !== null && asked.detail !== undefined ? (
                  <div className="min-w-0">
                    <ResultView label="What it is about" value={asked.detail} />
                  </div>
                ) : null}
                <TextAreaField
                  name="comment"
                  label="Comment (needed to reject)"
                  rows={3}
                  value={comment}
                  onChange={setComment}
                />
                {problem ? <Notice tone="danger">{problem}</Notice> : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" loading={busy} onClick={() => decide("approve")}>
                    Approve
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => decide("reject")}>
                    Reject
                  </Button>
                </div>
                <p className="m-0 text-meta text-ink-subtle">
                  Asked of {asked.approver.name}. This link is yours and works once, until{" "}
                  {clock(asked.expiresAt)}, or until someone decides.
                </p>
              </>
            )}
          </ContainedArea>
        </div>
      </div>
    </main>
  );
}
