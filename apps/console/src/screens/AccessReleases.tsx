import { Button, Notice } from "@volvel/ui";
import { useEffect, useRef, useState } from "react";
import { ApiError, api, type Me, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
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
  summary: {
    created: number;
    updated: number;
    deleted: number;
    changes: Change[];
    /** What the release did not do, or does that its asker should have read before approving. */
    warnings?: string[];
  };
  createdBy: string | null;
  createdByType?: string;
  createdById?: string | null;
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
/** Every change a release made or would make, one to a line. */
function Changes({ release, intro }: { release: AccessRelease; intro: string }) {
  const changes = release.summary.changes;
  const warnings = release.summary.warnings ?? [];
  return (
    <span className="flex flex-col gap-2">
      <span>{intro}</span>
      {changes.length === 0 ? (
        <span>It changes nothing.</span>
      ) : (
        <ul className="m-0 max-h-64 overflow-auto pl-5 text-left">
          {changes.map((one) => (
            <li key={`${one.kind}/${one.key}/${one.change}`}>
              {VERB[one.change] ?? one.change} the {KIND[one.kind] ?? one.kind} {one.label}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 ? (
        <span className="flex flex-col gap-1">
          <span className="font-medium">Read before you answer:</span>
          <ul className="m-0 max-h-40 overflow-auto pl-5 text-left">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </span>
      ) : null}
    </span>
  );
}
// The cause is in the refusal's own fields, so it is worded as everywhere else in the console.
const failed = (error: unknown) => failureText(error);

/**
 * Every change to the tenant's access, as it was released: who asked, who
 * approved, and what it did. One that waits is answered here, and an earlier
 * one can be gone back to.
 */
export function AccessReleases({ base, framed }: { base: string; framed?: Framed }) {
  const releases = useLoad<{ items: AccessRelease[] }>(`${base}/access/releases`);
  const access = useLoad<{ approval: boolean; mayChange?: boolean }>(`${base}/access`);
  const [problem, setProblem] = useState<string>();
  const me = useLoad<Me>("/me");
  const approval = access.data?.approval ?? false;
  // The button that was pressed leaves the list once it is answered: focus goes to what is left of
  // the list, not to the page body.
  const holder = useRef<HTMLDivElement>(null);
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus || releases.data === undefined) return;
    const table = holder.current?.querySelector<HTMLElement>("table");
    const target =
      table?.querySelector<HTMLElement>("tbody button, tbody a") ??
      holder.current?.querySelector<HTMLElement>("h1, h2");
    if (target) {
      if (!target.matches("button, a")) target.tabIndex = -1;
      target.focus();
    }
    setRefocus(false);
  }, [refocus, releases.data]);
  // An older server does not say, and then the server's own refusal answers.
  const mayChange = access.data?.mayChange ?? true;
  const askedByMe = (release: AccessRelease) =>
    me.data?.principal !== undefined &&
    release.createdByType === me.data.principal.type &&
    release.createdById === me.data.principal.id;

  const decide = async (release: AccessRelease, decision: "approve" | "decline" | "withdraw") => {
    setProblem(undefined);
    let comment: string | undefined;
    if (decision === "decline") {
      const why = await ask.prompt({
        title: `Decline release ${release.number}?`,
        text: <Changes release={release} intro="Nothing of it is applied. It would have:" />,
        label: "Why (kept with the release, shown to whoever asked)",
        action: "Decline",
        danger: true,
        required: false,
        multiline: true,
      });
      if (why === null) return;
      if (why) comment = why;
    } else {
      const sure = await ask.confirm({
        title:
          decision === "approve"
            ? `Approve release ${release.number}?`
            : `Withdraw release ${release.number}?`,
        text: (
          <Changes
            release={release}
            intro={
              decision === "approve"
                ? "It applies at once, and does all of this:"
                : "Nothing of it is applied. It would have:"
            }
          />
        ),
        action: decision === "approve" ? "Approve" : "Withdraw",
        danger: decision !== "approve",
      });
      if (!sure) return;
    }
    try {
      await api.post(`${base}/access/releases/${release.id}/decision`, {
        decision,
        ...(comment ? { comment } : {}),
      });
      notify.success(
        decision === "approve"
          ? `Release ${release.number} is applied.`
          : `Release ${release.number} is ${decision === "decline" ? "declined" : "withdrawn"}.`,
      );
      releases.reload();
      setRefocus(true);
    } catch (error) {
      setProblem(failed(error));
    }
  };
  /** Every change of a release, whatever its status: the list shows three. */
  const showAll = (release: AccessRelease) =>
    ask.confirm({
      title: `Release ${release.number}`,
      text: <Changes release={release} intro="It changed:" />,
      action: "Close",
      cancel: "Back",
    });
  const back = async (release: AccessRelease) => {
    setProblem(undefined);
    // What going back removes, asked of the server before anyone is asked to agree.
    let removes: { kind: string; key: string; label: string }[];
    let left: string[] = [];
    try {
      const looked = await api.get<{
        removes: { kind: string; key: string; label: string }[];
        warnings?: string[];
      }>(`${base}/access/releases/${release.id}/rollback`);
      removes = looked.removes;
      left = looked.warnings ?? [];
    } catch (error) {
      setProblem(failed(error));
      return;
    }
    const removing = removes.length > 0;
    const sure = await ask.confirm({
      title: `Go back to release ${release.number}?`,
      text: (
        <span className="flex flex-col gap-2">
          <Changes
            release={release}
            intro={`The tenant's groups, service accounts, roles and what they are given become what they were after release ${release.number}. Who is in each group is not changed, and groups an identity provider made are left alone.${approval ? " It waits for a second person." : ""} Release ${release.number} itself did:`}
          />
          {removing ? (
            <span>
              These are removed:
              <ul className="m-0 mt-1 max-h-48 overflow-auto pl-5 text-left">
                {removes.map((one) => (
                  <li key={`${one.kind}/${one.key}`}>
                    the {KIND[one.kind] ?? one.kind} {one.label}
                  </li>
                ))}
              </ul>
            </span>
          ) : (
            <span>Nothing is removed.</span>
          )}
          {left.length > 0 ? (
            <span>
              Left out, because it no longer exists:
              <ul className="m-0 mt-1 max-h-32 overflow-auto pl-5 text-left">
                {left.map((one) => (
                  <li key={one}>{one}</li>
                ))}
              </ul>
            </span>
          ) : null}
        </span>
      ),
      action: "Go back",
      danger: removing,
    });
    if (!sure) return;
    try {
      await api.post(`${base}/access/releases/${release.id}/rollback`, {});
      notify.success(`The tenant's access is what release ${release.number} left.`);
      releases.reload();
    } catch (error) {
      // A change that waits has not happened: it is said to wait, not to be done, and not as a failure.
      if (error instanceof ApiError && error.code === "awaiting_approval") {
        notify.info(error.message);
        releases.reload();
        return;
      }
      setProblem(failed(error));
    }
  };

  return (
    <div ref={holder} className="contents">
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
                {row.comment ? (
                  <span className="text-meta text-ink-muted">“{row.comment}”</span>
                ) : null}
                {(row.summary.warnings ?? []).map((warning) => (
                  <span key={warning} className="text-meta text-ink-muted">
                    {warning}
                  </span>
                ))}
                {row.summary.changes.length > 3 ? (
                  <span>
                    <Button size="small" onClick={() => showAll(row)}>
                      All {row.summary.changes.length} changes
                    </Button>
                  </span>
                ) : null}
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
            cell: (row) => {
              if (row.status === "awaiting_approval") {
                if (!mayChange && !askedByMe(row))
                  return (
                    <span className="text-meta text-ink-muted">
                      You may read this, not answer it.
                    </span>
                  );
                if (askedByMe(row))
                  return (
                    <span className="inline-flex flex-col items-end gap-1">
                      <span className="text-meta text-ink-muted">
                        You asked for this. Someone else approves it.
                      </span>
                      <Button size="small" onClick={() => decide(row, "withdraw")}>
                        Withdraw
                      </Button>
                    </span>
                  );
                return (
                  <span className="inline-flex flex-wrap justify-end gap-1">
                    <Button size="small" variant="primary" onClick={() => decide(row, "approve")}>
                      Approve
                    </Button>
                    <Button size="small" onClick={() => decide(row, "decline")}>
                      Decline
                    </Button>
                  </span>
                );
              }
              return row.status === "applied" && mayChange ? (
                <Button size="small" onClick={() => back(row)}>
                  Go back to this
                </Button>
              ) : null;
            },
          },
        ]}
        empty={{
          title: "No releases yet",
          text: "A release is recorded when a group, a service account, a role or what one is given changes.",
        }}
      />
    </div>
  );
}
