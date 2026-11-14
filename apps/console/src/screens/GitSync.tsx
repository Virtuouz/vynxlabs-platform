import { Button, Notice } from "@vynxlabs/ui";
import { ArrowDownToLine, ArrowUpFromLine, GitBranch, GitCommitHorizontal } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText } from "../ask.tsx";
import { EmptyCanvas, KeyValues, PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { Junction, Wire } from "../kit/motifs.tsx";
import { Mono, Tag } from "../kit/status.tsx";
import { GitPanel } from "./Git.tsx";
import { fromNow } from "./Overview.tsx";

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
    here: boolean;
    branch: boolean;
    conflict: boolean;
    mine?: string | null;
    theirs?: string | null;
  }[];
}

interface Status {
  repository: { url: string } | null;
  branch: string | null;
  state: string | null;
  updatedAt: string | null;
}

/**
 * The workspace beside its branch: what each side changed since they last
 * agreed, and every file changed on both, set side by side to choose from.
 * Nothing is overwritten without a choice.
 */
export function GitSync({ root, link }: { root: string; link: string }) {
  const status = useLoad<Status>(`${root}/git`);
  const following = Boolean(status.data?.repository && status.data.branch);
  const compare = useLoad<Compare>(following ? `${root}/git/compare` : null);
  const [choices, setChoices] = useState<Record<string, "mine" | "theirs">>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: "success" | "danger" | "attention"; text: string }>();
  const tenantLink = link.split("/workspaces/")[0] as string;

  const act = async (work: () => Promise<{ status: string; problem?: string }>, done: string) => {
    setBusy(true);
    setSaid(undefined);
    try {
      const result = await work();
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

  const stemOf = (path: string) => path.replace(/\.(yaml|ts)$/, "");
  const conflicts = (compare.data?.files ?? []).filter((file) => file.conflict);
  const stems = [...new Set(conflicts.map((file) => stemOf(file.path)))];
  const allChosen = stems.every((stem) => choices[stem]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operate"
        title="Git sync"
        description="This workspace beside the branch it follows. A push commits what is deployed here; a pull deploys what developers changed there."
      />
      {status.error ? <Notice tone="danger">{status.error.message}</Notice> : null}
      {status.data && !following ? (
        <EmptyCanvas
          title={
            status.data.repository
              ? "This workspace follows no branch yet"
              : "No repository is connected"
          }
          text="Connect the tenant's repository, then choose a branch below for this dev workspace."
        />
      ) : null}
      {compare.error ? <Notice tone="danger">{compare.error.message}</Notice> : null}
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
                Last agreed {status.data?.updatedAt ? fromNow(status.data.updatedAt) : "never"}
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
                <GitBranch aria-hidden="true" size={13} /> {compare.data.branch}
              </span>
              <span className="text-title">
                <Mono className="text-title">{compare.data.behind}</Mono> changed there
              </span>
              {compare.data.head ? (
                <span className="flex items-center gap-1.5 text-meta text-ink-muted">
                  <GitCommitHorizontal aria-hidden="true" size={13} />
                  <Mono>{compare.data.head.commit.slice(0, 7)}</Mono> {compare.data.head.message} ·{" "}
                  {compare.data.head.author}, {fromNow(compare.data.head.at)}
                </span>
              ) : (
                <span className="text-meta text-ink-muted">
                  The branch does not exist yet: the first push makes it.
                </span>
              )}
            </Panel>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={busy || compare.data.ahead === 0 || compare.data.conflicts > 0}
              onClick={() =>
                act(
                  () => api.post(`${root}/git/push`, {}),
                  "Committed what is deployed here to the branch.",
                )
              }
            >
              <ArrowUpFromLine aria-hidden="true" size={14} /> Push {compare.data.ahead} change
              {compare.data.ahead === 1 ? "" : "s"}
            </Button>
            <Button
              disabled={
                busy || compare.data.behind === 0 || (compare.data.conflicts > 0 && !allChosen)
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
              disabled={busy || compare.data.conflicts > 0}
              onClick={() =>
                act(
                  () =>
                    api.post(`${root}/git/push`, {
                      drafts: true,
                      message: "Drafts from the console",
                    }),
                  "Committed what is deployed and what is drafted, for a developer to pick up.",
                )
              }
            >
              Push with drafts
            </Button>
          </div>
          {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}

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
                    .filter((file) => stemOf(file.path) === stem)
                    .map((file) => (
                      <div key={file.path} className="grid gap-2 md:grid-cols-2">
                        {(["mine", "theirs"] as const).map((side) => (
                          <div key={side} className="flex min-w-0 flex-col gap-1">
                            <span className="flex items-center gap-2 text-meta text-ink-subtle">
                              {side === "mine" ? "In this workspace" : "On the branch"}
                              {choices[stem] === side ? <Tag tone="live">Kept</Tag> : null}
                            </span>
                            <pre
                              className={`m-0 max-h-72 overflow-auto rounded-control border bg-code-bg p-3 font-mono text-telemetry ${
                                choices[stem] === side ? "border-action" : "border-line"
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
                    <Tag tone={file.here ? "dev" : "neutral"}>
                      {file.here ? "Changed here" : "Changed there"}
                    </Tag>
                  </div>
                ))}
              </Panel>
            </section>
          ) : null}
          <KeyValues
            rows={[{ label: "Repository", value: status.data?.repository?.url ?? "—", mono: true }]}
          />
        </>
      ) : null}
      <section className="flex flex-col gap-2">
        <SectionLabel>Branch and history</SectionLabel>
        <GitPanel root={root} tenantLink={tenantLink} onPulled={compare.reload} />
      </section>
    </div>
  );
}
