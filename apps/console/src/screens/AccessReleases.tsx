import { Button, Notice } from "@volvel/ui";
import { useState } from "react";
import { ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { count } from "../kit/format.ts";
import { StatePill } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { type Framed, toolbarOf } from "./Members.tsx";

interface Change {
  change: string;
  kind: string;
  key: string;
  label: string;
}
interface AccessRelease {
  id: string;
  number: number;
  scope: string;
  status: string;
  origin: string;
  message: string | null;
  summary: { created: number; updated: number; deleted: number; changes: Change[] };
  createdBy: string | null;
  createdAt: string;
  decidedBy: string | null;
  comment: string | null;
}

/** Each status as a state the console already has a mark for, with the words for it here. */
const STATUS: Record<string, [string, string]> = {
  applied: ["Applied", "succeeded"],
  awaiting_approval: ["Waits for approval", "waiting_approval"],
  declined: ["Declined", "declined"],
  withdrawn: ["Withdrawn", "canceled"],
  superseded: ["Superseded", "skipped"],
};
const ORIGIN: Record<string, string> = {
  cli: "From the repository",
  api: "Through the API",
  console: "In the console",
  rollback: "Going back",
};
const KIND: Record<string, string> = {
  group: "group",
  end_user_group: "group of end users",
  service_account: "service account",
  tenant_role: "role",
  tenant_binding: "access",
};
const VERB: Record<string, string> = { created: "Makes", updated: "Changes", deleted: "Removes" };

/** What a release did, or would do, in words: at most three, then how many more. */
function what(release: AccessRelease): string {
  const changes = release.summary.changes;
  if (changes.length === 0) return "Changed nothing";
  const said = changes
    .slice(0, 3)
    .map(
      (one) => `${VERB[one.change] ?? one.change} the ${KIND[one.kind] ?? one.kind} ${one.label}`,
    );
  return `${said.join(". ")}${changes.length > 3 ? `, and ${changes.length - 3} more` : ""}.`;
}
const failed = (error: unknown) =>
  error instanceof ApiError ? error.message : "It could not be done. Try again.";

/**
 * Every change to the tenant's access, as it was released: who asked, who
 * approved, and what it did. One that waits is answered here, and an earlier
 * one can be gone back to.
 */
export function AccessReleases({ base, framed }: { base: string; framed?: Framed }) {
  const releases = useLoad<{ items: AccessRelease[] }>(`${base}/access/releases`);
  const access = useLoad<{ approval: boolean }>(`${base}/access`);
  const [problem, setProblem] = useState<string>();
  const approval = access.data?.approval ?? false;

  const decide = async (release: AccessRelease, decision: "approve" | "decline" | "withdraw") => {
    setProblem(undefined);
    const sure = await ask.confirm({
      title:
        decision === "approve"
          ? `Approve release ${release.number}?`
          : decision === "decline"
            ? `Decline release ${release.number}?`
            : `Withdraw release ${release.number}?`,
      text:
        decision === "approve"
          ? `${what(release)} It applies at once.`
          : `${what(release)} Nothing of it is applied.`,
      action: decision === "approve" ? "Approve" : decision === "decline" ? "Decline" : "Withdraw",
      danger: decision !== "approve",
    });
    if (!sure) return;
    try {
      await api.post(`${base}/access/releases/${release.id}/decision`, { decision });
      notify.success(
        decision === "approve"
          ? `Release ${release.number} is applied.`
          : `Release ${release.number} is ${decision === "decline" ? "declined" : "withdrawn"}.`,
      );
      releases.reload();
    } catch (error) {
      setProblem(failed(error));
    }
  };
  const back = async (release: AccessRelease) => {
    setProblem(undefined);
    const sure = await ask.confirm({
      title: `Go back to release ${release.number}?`,
      text: `The tenant's groups, service accounts, roles and what they are given become what they were after release ${release.number}. What was made since is removed. Who is in each group is not changed.${approval ? " It waits for a second person." : ""}`,
      action: "Go back",
      danger: true,
    });
    if (!sure) return;
    try {
      await api.post(`${base}/access/releases/${release.id}/rollback`, {});
      notify.success(`The tenant's access is what release ${release.number} left.`);
      releases.reload();
    } catch (error) {
      setProblem(failed(error));
    }
  };

  return (
    <CollectionView<AccessRelease>
      title={framed?.title ?? "Releases"}
      description="Every change to the tenant's groups, service accounts, roles and what they are given, from the console or from the repository, with who made it and who approved it."
      actions={
        <Button
          onClick={async () => {
            setProblem(undefined);
            if (approval) {
              const waiting = releases.data?.items.filter(
                (one) => one.status === "awaiting_approval",
              ).length;
              const sure = await ask.confirm({
                title: "Stop asking for a second person?",
                text: `From now on, a change to the tenant's groups, service accounts and roles, and to what they are given, applies as soon as it is made, with nobody else approving it. ${
                  waiting === undefined || waiting === 0
                    ? "Releases that wait now stay waiting"
                    : waiting === 1
                      ? "The 1 release that waits now stays waiting"
                      : `The ${count(waiting)} releases that wait now stay waiting`
                } until someone answers them. Asking again needs two people who may release access.`,
                action: "Stop asking",
                danger: true,
              });
              if (!sure) return;
            }
            try {
              await api.put(`${base}/access/approval`, { required: !approval });
              notify.success(
                approval
                  ? "Changes to access apply at once."
                  : "Changes to access now wait for a second person.",
              );
              access.reload();
            } catch (error) {
              setProblem(failed(error));
            }
          }}
        >
          {approval ? "Stop asking for a second person" : "Ask for a second person"}
        </Button>
      }
      toolbar={toolbarOf(
        framed,
        <>
          {approval ? (
            <Notice tone="attention" bare>
              A change to access waits until someone other than whoever made it approves it.
            </Notice>
          ) : null}
          {problem ? <Notice tone="danger">{problem}</Notice> : null}
        </>,
      )}
      label="Releases"
      rows={releases.data?.items}
      error={releases.error}
      onRetry={releases.reload}
      rowKey={(row) => row.id}
      columns={[
        { header: "#", cell: (row) => row.number },
        {
          header: "What",
          cell: (row) => (
            <span className="flex flex-col">
              <span className="font-medium">{row.message ?? what(row)}</span>
              {row.message ? <span className="text-meta text-ink-muted">{what(row)}</span> : null}
            </span>
          ),
        },
        {
          header: "Status",
          cell: (row) => {
            const [label, state] = STATUS[row.status] ?? [row.status, "skipped"];
            return <StatePill state={state}>{label}</StatePill>;
          },
        },
        {
          header: "By",
          priority: 2,
          cell: (row) => (
            <span className="flex flex-col">
              <span>{row.createdBy ?? ORIGIN[row.origin] ?? row.origin}</span>
              <span className="text-meta text-ink-muted">
                {ORIGIN[row.origin] ?? row.origin}
                {row.decidedBy ? `, answered by ${row.decidedBy}` : ""}
              </span>
            </span>
          ),
        },
        { header: "When", priority: 2, cell: (row) => <Time value={row.createdAt} mode="ago" /> },
        {
          header: "",
          align: "end",
          cell: (row) =>
            row.status === "awaiting_approval" ? (
              <span className="inline-flex flex-wrap justify-end gap-1">
                <Button size="small" variant="primary" onClick={() => decide(row, "approve")}>
                  Approve
                </Button>
                <Button size="small" onClick={() => decide(row, "decline")}>
                  Decline
                </Button>
                <Button size="small" onClick={() => decide(row, "withdraw")}>
                  Withdraw
                </Button>
              </span>
            ) : row.status === "applied" ? (
              <Button size="small" onClick={() => back(row)}>
                Go back to this
              </Button>
            ) : null,
        },
      ]}
      empty={{
        title: "No releases yet",
        text: "A release is recorded when a group, a service account, a role or what one is given changes.",
      }}
    />
  );
}
