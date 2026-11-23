import { Button, Notice, TextField } from "@volvel/ui";
import { ArrowDownToLine, ArrowUpFromLine, GitBranch, GitCommitHorizontal } from "lucide-react";
import { useState } from "react";
import { api, type Loaded, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { ago } from "../kit/format.ts";
import { ErrorState } from "../kit/LoadState.tsx";
import { EmptyCanvas, KeyValues, PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { Junction, Wire } from "../kit/motifs.tsx";
import { Mono, Tag } from "../kit/status.tsx";
import { Link } from "../router.tsx";
import { GitPanel } from "./Git.tsx";
import { askToDelete } from "./PromotionConfirm.tsx";

interface Compare {
  branch: string;
  exists: boolean;
  head: { commit: string; message: string; author: string; at: string } | null;
  syncedCommit: string | null;
  ahead: number;
  behind: number;
  conflicts: number;
  files: {
    path: string;
    /** The resource the file belongs to, as a pull names it. */
    resource: string;
    here: boolean;
    branch: boolean;
    conflict: boolean;
    /** Older instances do not say. */
    change?: "new_here" | "removed_here" | "new_there" | "removed_there" | "changed";
    mine?: string | null;
    theirs?: string | null;
  }[];
}

interface Status {
  repository: { url: string; paused?: boolean; releaseBranch?: string | null } | null;
  branch: string | null;
  state: string | null;
  updatedAt: string | null;
}

/** What a file's difference is, in the two or three words a list has room for. */
export function differenceLabel(file: { here: boolean; change?: string }): string {
  switch (file.change) {
    case "new_here":
      return "New here";
    case "removed_here":
      return "Removed here";
    case "new_there":
      return "New there";
    case "removed_there":
      return "Removed there";
    default:
      return file.here ? "Changed here" : "Changed there";
  }
}

const DEFAULT_MESSAGE = "Deploy from the console";

/**
 * The workspace beside its branch: what each side changed since they last
 * agreed, and every file changed on both, set side by side to choose from.
 * Nothing is overwritten without a choice. Push and pull are here and only here.
 */
export function GitSync({
  root,
  link,
  production,
}: {
  root: string;
  link: string;
  /** Given for a production workspace, which follows no branch: it commits to a release branch after a promotion. */
  production?: { slug: string } | undefined;
}) {
  const status = useLoad<Status>(`${root}/git`);
  const following = Boolean(status.data?.repository && status.data.branch);
  const compare = useLoad<Compare>(following ? `${root}/git/compare` : null);
  const [choices, setChoices] = useState<Record<string, "mine" | "theirs">>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [said, setSaid] = useState<{ tone: "success" | "danger" | "attention"; text: string }>();
  // Paths a pull stopped at because it took their deletion for a rename.
  const [suspected, setSuspected] = useState<string[]>([]);
  const tenantLink = link.split("/workspaces/")[0] as string;

  if (production) {
    return (
      <ReleaseBranch root={root} slug={production.slug} tenantLink={tenantLink} status={status} />
    );
  }

  const act = async (
    work: () => Promise<{ status: string; problem?: string; suspected?: string[] }>,
    done: string,
  ) => {
    setBusy(true);
    setSaid(undefined);
    setSuspected([]);
    try {
      const result = await work();
      setSuspected(result.suspected ?? []);
      setSaid(
        result.status === "failed" || result.status === "refused"
          ? {
              tone: "attention",
              text: result.problem ?? "Nothing was written: the branch changed. Pull first.",
            }
          : {
              tone: "success",
              text: result.status === "nothing" ? "Already the same: nothing to write." : done,
            },
      );
      setChoices({});
      compare.reload();
      status.reload();
    } catch (caught) {
      setSaid({ tone: "danger", text: failureText(caught) });
    } finally {
      setBusy(false);
    }
  };

  // A resource is its files together: its YAML, its source, and the old one of a rename.
  const conflicts = (compare.data?.files ?? []).filter((file) => file.conflict);
  const stems = [...new Set(conflicts.map((file) => file.resource))];
  const allChosen = stems.every((stem) => choices[stem]);
  const paused = Boolean(status.data?.repository?.paused);
  const commitMessage = message.trim() || DEFAULT_MESSAGE;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operate"
        title="Git sync"
        description="This workspace beside the branch it follows. A push commits what is deployed here; a pull deploys what developers changed there."
      />
      {status.error ? <ErrorState error={status.error} onRetry={status.reload} /> : null}
      {status.data?.branch ? (
        <FollowedBranch
          root={root}
          branch={status.data.branch}
          reload={() => {
            status.reload();
            compare.reload();
          }}
        />
      ) : null}
      {status.data && !following ? (
        <EmptyCanvas
          title={
            status.data.repository
              ? "This workspace follows no branch yet"
              : "No repository is connected"
          }
          text={
            status.data.repository
              ? "Choose a branch below for this workspace to follow."
              : "Connect the tenant's repository below, then choose a branch for this workspace."
          }
        />
      ) : null}
      {compare.error ? <ErrorState error={compare.error} onRetry={compare.reload} /> : null}
      {compare.data ? (
        <>
          <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
            <Panel className="flex flex-col gap-2 p-4">
              <span className="flex items-center gap-2 text-label text-ink-subtle uppercase">
                <Junction kind="here" /> This workspace
              </span>
              <span className="text-title">
                <Mono className="text-title">{compare.data.ahead}</Mono> changed here
              </span>
              <span className="text-meta text-ink-muted">
                Last agreed {status.data?.updatedAt ? ago(status.data.updatedAt) : "never"}
                {compare.data.syncedCommit ? (
                  <>
                    {" "}
                    at <Mono>{compare.data.syncedCommit.slice(0, 7)}</Mono>
                  </>
                ) : null}
              </span>
            </Panel>
            <span aria-hidden="true" className="hidden items-center md:flex">
              <Wire width={20} />
              <Junction kind={compare.data.conflicts > 0 ? "danger" : "plain"} />
              <Wire width={20} />
            </span>
            <Panel className="flex flex-col gap-2 p-4">
              <span className="flex items-center gap-2 text-label text-ink-subtle uppercase">
                <GitBranch aria-hidden="true" size={14} /> {compare.data.branch}
              </span>
              <span className="text-title">
                <Mono className="text-title">{compare.data.behind}</Mono> changed there
              </span>
              {compare.data.head ? (
                <span className="flex items-center gap-1.5 text-meta text-ink-muted">
                  <GitCommitHorizontal aria-hidden="true" size={14} />
                  <Mono>{compare.data.head.commit.slice(0, 7)}</Mono> {compare.data.head.message} ·{" "}
                  {compare.data.head.author}, {ago(compare.data.head.at)}
                </span>
              ) : (
                <span className="text-meta text-ink-muted">
                  The branch does not exist yet: the first push makes it.
                </span>
              )}
            </Panel>
          </div>

          {paused ? (
            <Notice tone="attention">
              Sync is paused for this tenant. Save its repository settings to turn it on.
            </Notice>
          ) : null}
          <div className="max-w-md">
            <TextField
              name="message"
              label="Commit message"
              hint="Used by Push and Push with drafts."
              value={message}
              onChange={setMessage}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              loading={busy}
              disabled={paused || compare.data.ahead === 0 || compare.data.conflicts > 0}
              onClick={() =>
                act(
                  () => api.post(`${root}/git/push`, { message: commitMessage }),
                  "Committed what is deployed here to the branch.",
                )
              }
            >
              <ArrowUpFromLine aria-hidden="true" size={14} /> Push {compare.data.ahead} change
              {compare.data.ahead === 1 ? "" : "s"}
            </Button>
            <Button
              disabled={
                busy ||
                paused ||
                compare.data.behind === 0 ||
                (compare.data.conflicts > 0 && !allChosen)
              }
              onClick={() =>
                act(
                  () =>
                    api.post(
                      `${root}/git/pull`,
                      Object.keys(choices).length > 0 ? { resolutions: choices } : {},
                    ),
                  "Deployed what changed on the branch.",
                )
              }
            >
              <ArrowDownToLine aria-hidden="true" size={14} /> Pull {compare.data.behind} change
              {compare.data.behind === 1 ? "" : "s"}
            </Button>
            <Button
              variant="quiet"
              disabled={busy || paused || compare.data.conflicts > 0}
              onClick={() =>
                act(
                  () =>
                    api.post(`${root}/git/push`, {
                      drafts: true,
                      message:
                        commitMessage === DEFAULT_MESSAGE
                          ? "Drafts from the console"
                          : commitMessage,
                    }),
                  "Committed what is deployed and what is drafted, for a developer to pick up. A plain push leaves these files on the branch while their drafts are saved.",
                )
              }
            >
              Push with drafts
            </Button>
          </div>
          {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
          {suspected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  if (!(await askToDelete(suspected, "this workspace"))) return;
                  await act(
                    () =>
                      api.post(`${root}/git/pull`, {
                        ...(Object.keys(choices).length > 0 ? { resolutions: choices } : {}),
                        allowDelete: suspected,
                      }),
                    "Deployed what changed on the branch.",
                  );
                }}
              >
                Delete them anyway
              </Button>
            </div>
          ) : null}

          {stems.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionLabel>Changed on both sides: choose for each</SectionLabel>
              {stems.map((stem) => (
                <Panel key={stem} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Mono>{stem}</Mono>
                    <span className="flex gap-2">
                      {(["mine", "theirs"] as const).map((side) => (
                        <Button
                          key={side}
                          size="small"
                          variant={choices[stem] === side ? "primary" : "secondary"}
                          aria-pressed={choices[stem] === side}
                          onClick={() => setChoices((now) => ({ ...now, [stem]: side }))}
                        >
                          {side === "mine" ? "Keep workspace" : "Take branch"}
                        </Button>
                      ))}
                      {choices[stem] ? (
                        <Button
                          size="small"
                          variant="quiet"
                          onClick={() =>
                            setChoices((now) => {
                              const { [stem]: _undo, ...rest } = now;
                              return rest;
                            })
                          }
                        >
                          Undo
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  {conflicts
                    .filter((file) => file.resource === stem)
                    .map((file) => (
                      <div key={file.path} className="grid gap-2 md:grid-cols-2">
                        {(["mine", "theirs"] as const).map((side) => (
                          <div key={side} className="flex min-w-0 flex-col gap-1">
                            <span className="flex items-center gap-2 text-meta text-ink-subtle">
                              {side === "mine" ? "In this workspace" : "On the branch"}
                              {choices[stem] === side ? <Tag tone="live">Kept</Tag> : null}
                            </span>
                            <pre
                              className={`m-0 max-h-72 overflow-auto rounded-control border bg-code-bg p-3 font-mono text-code ${
                                choices[stem] === side ? "border-action" : "border-transparent"
                              }`}
                            >
                              {(side === "mine" ? file.mine : file.theirs) ?? "(removed)"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ))}
                </Panel>
              ))}
            </section>
          ) : null}

          {compare.data.files.length > 0 && stems.length === 0 ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>Files that differ</SectionLabel>
              <Panel as="div" className="divide-y divide-line">
                {compare.data.files.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between gap-2 px-4 py-2"
                  >
                    <Mono className="truncate">{file.path}</Mono>
                    <Tag tone={file.here ? "dev" : "neutral"}>{differenceLabel(file)}</Tag>
                  </div>
                ))}
              </Panel>
              {compare.data.files.some((file) => file.change === "new_here") ? (
                <p className="m-0 text-meta text-ink-muted">
                  New here: a resource made in the console since the last sync, or one the
                  repository's code defined that a draft took over. Code is not synced, so until
                  then it had no file. A push adds the file to the branch; remove its definition
                  from the code there, or a deploy from the repository takes it back.
                </p>
              ) : null}
            </section>
          ) : null}
          <KeyValues
            rows={[{ label: "Repository", value: status.data?.repository?.url ?? "—", mono: true }]}
          />
        </>
      ) : null}
      {following ? null : (
        <GitPanel root={root} tenantLink={tenantLink} onFollowed={status.reload} />
      )}
    </div>
  );
}

/** The branch this workspace follows, and the two things to do about it: follow another, or follow none. */
function FollowedBranch({
  root,
  branch,
  reload,
}: {
  root: string;
  branch: string;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const change = async () => {
    const next = await ask.prompt({
      title: "Follow another branch?",
      text: `This workspace follows ${branch}. It will compare against the branch you name instead, as if it had never synced: files that differ show as changes on one side or both. Nothing on either branch is changed.`,
      label: "Branch",
      action: "Follow it",
      placeholder: branch,
    });
    const named = next?.trim();
    if (!named || named === branch) return;
    setBusy(true);
    await api.put(`${root}/git`, { branch: named }).then(() => {
      notify.success(`This workspace now syncs with ${named}.`);
      reload();
    }, notify.error);
    setBusy(false);
  };
  const stop = async () => {
    const sure = await ask.confirm({
      title: "Stop following this branch?",
      text: `This workspace stops syncing with ${branch}. The branch and what is on it stay as they are, and the workspace can follow it again.`,
      action: "Stop following",
      danger: true,
    });
    if (!sure) return;
    setBusy(true);
    await api.delete(`${root}/git`).then(() => {
      notify.success("This workspace follows no branch now.");
      reload();
    }, notify.error);
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-2 text-meta text-ink-muted">
        <GitBranch aria-hidden="true" size={14} /> Follows <Mono>{branch}</Mono>
      </span>
      <Button size="small" variant="secondary" disabled={busy} onClick={change}>
        Change branch
      </Button>
      <Button size="small" variant="quiet" disabled={busy} onClick={stop}>
        Stop following
      </Button>
    </div>
  );
}

interface Operation {
  id: string;
  kind: string;
  status: string;
  commit: string | null;
  message: string | null;
  detail: { release?: string };
  createdAt: string;
}

/**
 * What a production workspace does in place of following a branch: after each promotion it commits
 * what it now runs to its release branch. Its last result is here, with a way to try again.
 */
function ReleaseBranch({
  root,
  slug,
  tenantLink,
  status,
}: {
  root: string;
  slug: string;
  tenantLink: string;
  status: Loaded<Status>;
}) {
  const operations = useLoad<{ items: Operation[] }>(
    status.data?.repository?.releaseBranch ? `${root}/git/operations` : null,
  );
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: "success" | "danger" | "attention"; text: string }>();
  const repository = status.data?.repository;
  const branch = repository?.releaseBranch;
  const last = operations.data?.items.find((one) => one.detail?.release);

  const again = async () => {
    setBusy(true);
    setSaid(undefined);
    try {
      const result = await api.post<{ status: string; branch: string | null; problem?: string }>(
        `${root}/git/release`,
        {},
      );
      setSaid(
        result.status === "failed"
          ? {
              tone: "attention",
              text: `It did not reach ${result.branch ?? "the release branch"}: ${result.problem ?? "no reason was given"}`,
            }
          : result.status === "off"
            ? {
                tone: "attention",
                text: "Sync is paused, or the repository has no release branch, so nothing was written.",
              }
            : {
                tone: "success",
                text:
                  result.status === "nothing"
                    ? `${result.branch} already has what runs here: nothing to write.`
                    : `Committed what runs here to ${result.branch}.`,
              },
      );
      operations.reload();
    } catch (caught) {
      setSaid({ tone: "danger", text: failureText(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operate"
        title="Git sync"
        description="A production workspace changes by promotion, so it follows no branch. After each promotion, what it runs is committed to its release branch."
      />
      {status.error ? <ErrorState error={status.error} onRetry={status.reload} /> : null}
      {status.data && !repository ? (
        <EmptyCanvas
          title="No repository is connected"
          text="Connect the tenant's repository to commit what runs here after each promotion."
          action={<Link to={`${tenantLink}/repository`}>Connect the tenant's repository</Link>}
        />
      ) : null}
      {repository && !branch ? (
        <EmptyCanvas
          title="The repository has no release branch"
          text="Without one, nothing is committed after a promotion. A release branch is set on the tenant's repository."
        />
      ) : null}
      {repository && branch ? (
        <Panel className="flex flex-col gap-3 p-4">
          <span className="flex items-center gap-2 text-label text-ink-subtle uppercase">
            <GitBranch aria-hidden="true" size={14} /> Release branch
          </span>
          <span className="text-title">
            <Mono className="text-title">{`${branch}/${slug}`}</Mono>
          </span>
          {last ? (
            <span className="text-meta text-ink-muted">
              Last commit to it:{" "}
              {last.status === "failed"
                ? `failed ${ago(last.createdAt)}${last.message ? `: ${last.message}` : ""}`
                : last.status === "nothing"
                  ? `nothing to write, ${ago(last.createdAt)}`
                  : `done ${ago(last.createdAt)}${last.commit ? ` at ${last.commit.slice(0, 7)}` : ""}`}
            </span>
          ) : (
            <span className="text-meta text-ink-muted">Nothing has been committed to it yet.</span>
          )}
          {repository.paused ? (
            <Notice tone="attention">
              Sync is paused for this tenant. Save its repository settings to turn it on.
            </Notice>
          ) : null}
          {last?.status === "failed" ? (
            <Notice tone="attention">
              The last promotion is live, but its commit did not reach the release branch. Commit it
              again below.
            </Notice>
          ) : null}
          <div>
            <Button variant="primary" loading={busy} disabled={repository.paused} onClick={again}>
              <ArrowUpFromLine aria-hidden="true" size={14} /> Commit to the release branch again
            </Button>
          </div>
          {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
        </Panel>
      ) : null}
    </div>
  );
}
