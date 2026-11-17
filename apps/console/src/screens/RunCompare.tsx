import { Button, Panel } from "@vynxlabs/ui";
import { GitCompareArrows } from "lucide-react";
import { useState } from "react";
import { useLoad } from "../api.ts";
import { DiffView } from "../kit/DiffView.tsx";
import { ago, duration } from "../kit/format.ts";
import { ErrorState, Pending } from "../kit/LoadState.tsx";
import { KeyValues } from "../kit/layout.tsx";
import { PageHeader } from "../kit/PageHeader.tsx";
import { Mono } from "../kit/status.tsx";
import { Link } from "../router.tsx";

/**
 * What changed since it last worked (phase 15, P3-7). A run that fails is most
 * often failing because something changed: what it was given first, then its
 * version, then how long it took. Shown on a failed or canceled run's page.
 */

export interface PreviousSuccess {
  run: {
    id: string;
    bundleVersion: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
  } | null;
  bundleVersion: number | null;
  versionChanged: boolean;
  inputChanged: boolean | null;
}

const took = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? "–" : duration(ms);

export function RunCompare({
  root,
  link,
  kind,
  id,
  input,
  durationMs,
}: {
  root: string;
  link: string;
  kind: "run" | "flow_run";
  id: string;
  /** This run's input, to set beside the last success's. */
  input: unknown;
  durationMs?: number | null | undefined;
}) {
  const collection = kind === "run" ? "runs" : "flow-runs";
  const previous = useLoad<PreviousSuccess>(`${root}/${collection}/${id}/previous-success`);
  const [showInput, setShowInput] = useState(false);
  const last = previous.data?.run;
  const before = useLoad<{ input: unknown }>(
    showInput && last ? `${root}/${collection}/${last.id}` : null,
  );
  if (previous.error) return <ErrorState error={previous.error} onRetry={previous.reload} />;
  if (!previous.data) return null;
  if (!last) {
    return (
      <p className="m-0 text-meta text-ink-muted">
        It has not succeeded before here, so there is no earlier run to compare it with.
      </p>
    );
  }
  const { versionChanged, inputChanged, bundleVersion } = previous.data;
  return (
    <Panel aria-labelledby="since-it-worked" className="flex flex-col gap-3  p-4">
      <h2 id="since-it-worked" className="m-0 flex items-center gap-2 text-title">
        <GitCompareArrows aria-hidden="true" size={16} className="text-ink-muted" />
        Since it last worked
      </h2>
      <p className="m-0">
        It last succeeded{" "}
        <Link to={`${link}/runs/${last.id}`}>
          {last.finishedAt ? ago(last.finishedAt) : "before"}
        </Link>
        {last.bundleVersion !== null ? ` on v${last.bundleVersion}` : ""}.
      </p>
      <KeyValues
        rows={[
          {
            label: "Input",
            value:
              inputChanged === null
                ? "Too large to compare here"
                : inputChanged
                  ? "Different from the last success"
                  : "The same as the last success",
          },
          {
            label: "Version",
            value: versionChanged
              ? `v${last.bundleVersion ?? "?"} then, v${bundleVersion ?? "?"} now`
              : `The same, v${bundleVersion ?? "?"}`,
          },
          {
            label: "Took",
            value: `${took(durationMs)} now, ${took(last.durationMs)} then`,
            mono: true,
          },
        ]}
      />
      <span className="flex flex-wrap gap-2">
        {inputChanged ? (
          <Button size="small" aria-expanded={showInput} onClick={() => setShowInput((on) => !on)}>
            {showInput ? "Hide the input's difference" : "Show the input's difference"}
          </Button>
        ) : null}
        {versionChanged ? (
          <Button size="small" href={`${link}/runs/${id}/compare/${last.id}`}>
            <GitCompareArrows aria-hidden="true" size={14} /> Compare the{" "}
            {kind === "run" ? "source" : "flow"}
          </Button>
        ) : null}
      </span>
      {showInput ? (
        before.data ? (
          <DiffView
            before={before.data.input}
            after={input}
            beforeLabel="The last success's input"
            afterLabel="This run's input"
            testId="input-diff"
            maxHeight="24rem"
          />
        ) : before.error ? (
          <ErrorState error={before.error} onRetry={before.reload} />
        ) : (
          <Pending of={before} />
        )
      ) : null}
    </Panel>
  );
}

interface Source {
  available: boolean;
  files: { path: string; content: string }[];
  bundleVersion: number | null;
}

/**
 * Two runs' code, or flow, set side by side as one diff: the run that failed
 * against the last one that succeeded. Reached from "Compare the source".
 */
export function RunComparePage({
  root,
  link,
  id,
  other,
}: {
  root: string;
  link: string;
  id: string;
  other: string;
}) {
  const script = useLoad<{ script: string }>(`${root}/runs/${id}`);
  const flowRun = useLoad<{ flow: string }>(script.error ? `${root}/flow-runs/${id}` : null);
  const path = script.data?.script ?? flowRun.data?.flow;
  const isFlow = !script.data && Boolean(flowRun.data);
  const now = useLoad<Source>(
    script.data
      ? `${root}/script-source/${script.data.script}?run=${encodeURIComponent(id)}`
      : null,
  );
  const then = useLoad<Source>(
    script.data
      ? `${root}/script-source/${script.data.script}?run=${encodeURIComponent(other)}`
      : null,
  );
  const flowNow = useLoad<{ nodes: unknown; edges: unknown; bundleVersion: number | null }>(
    isFlow ? `${root}/flow-runs/${id}/definition` : null,
  );
  const flowThen = useLoad<{ nodes: unknown; edges: unknown; bundleVersion: number | null }>(
    isFlow ? `${root}/flow-runs/${other}/definition` : null,
  );
  const failed = script.error && flowRun.error ? flowRun.error : (now.error ?? then.error);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Compare runs"
        title={path ? `${path}` : "Comparing runs"}
        description="The run that failed, against the last run that succeeded before it."
      />
      <p className="m-0 flex flex-wrap gap-4 text-meta">
        <Link to={`${link}/runs/${id}`}>
          The run that failed <Mono>{id.slice(-8)}</Mono>
        </Link>
        <Link to={`${link}/runs/${other}`}>
          The last success <Mono>{other.slice(-8)}</Mono>
        </Link>
      </p>
      {failed ? <ErrorState error={failed} /> : null}
      {isFlow ? (
        flowNow.data && flowThen.data ? (
          <DiffView
            before={{ nodes: flowThen.data.nodes, edges: flowThen.data.edges }}
            after={{ nodes: flowNow.data.nodes, edges: flowNow.data.edges }}
            beforeLabel={`v${flowThen.data.bundleVersion ?? "?"}, the last success`}
            afterLabel={`v${flowNow.data.bundleVersion ?? "?"}, the run that failed`}
            testId="source-diff"
            maxHeight="70vh"
          />
        ) : (
          <Pending of={flowNow.data ? flowThen : flowNow} />
        )
      ) : now.data && then.data ? (
        now.data.available && then.data.available ? (
          (() => {
            const paths = [
              ...new Set([...then.data.files, ...now.data.files].map((file) => file.path)),
            ].sort();
            return paths.map((file) => {
              const before = then.data?.files.find((one) => one.path === file)?.content ?? "";
              const after = now.data?.files.find((one) => one.path === file)?.content ?? "";
              if (before === after) return null;
              return (
                <section key={file} aria-label={file} className="flex flex-col gap-2">
                  <h2 className="m-0 font-mono text-code">{file}</h2>
                  <DiffView
                    before={before}
                    after={after}
                    beforeLabel={`v${then.data?.bundleVersion ?? "?"}, the last success`}
                    afterLabel={`v${now.data?.bundleVersion ?? "?"}, the run that failed`}
                    testId="source-diff"
                    maxHeight="70vh"
                  />
                </section>
              );
            });
          })()
        ) : (
          <p className="m-0 text-ink-muted">
            One of these versions does not carry its source, so the two cannot be set side by side
            here. A repository build that includes it shows it.
          </p>
        )
      ) : (
        <Pending of={now.data ? then : now} />
      )}
    </div>
  );
}
