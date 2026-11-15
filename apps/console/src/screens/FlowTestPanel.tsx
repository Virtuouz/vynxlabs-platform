import { Button, Facts, Notice, ResultView } from "@vynxlabs/ui";
import { X } from "lucide-react";
import { InputForm } from "../InputDialog.tsx";
import { StatePill } from "../kit/status.tsx";
import { Link } from "../router.tsx";
import type { FlowRunDetail, StepRow } from "./Flows.tsx";

/** How long a step took, said briefly. */
export function took(step: { startedAt: string; finishedAt: string | null }): string | undefined {
  if (!step.finishedAt) return undefined;
  const ms = Date.parse(step.finishedAt) - Date.parse(step.startedAt);
  if (ms < 1000) return `${Math.max(0, ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

/** The steps of a run as the editor's graph shows them: one per node, the trigger first. */
export function stepsOf(run: FlowRunDetail): StepRow[] {
  return run.steps
    .filter((step) => step.item === "")
    .sort((a, b) => Number(b.node === run.triggerNode) - Number(a.node === run.triggerNode));
}

/**
 * Tries the draft from its editor: input for its manual trigger, then the run's
 * steps as they go. What each step produced is shown when its node is chosen.
 */
export function FlowTestPanel({
  link,
  path,
  schema,
  blocked,
  run,
  error,
  changed,
  onRun,
  onChoose,
  onClose,
}: {
  link: string;
  path: string;
  /** The manual trigger's input. */
  schema: Record<string, unknown> | undefined;
  /** Why a test cannot be run now. */
  blocked: string | undefined;
  run: FlowRunDetail | undefined;
  error: string | undefined;
  /** The graph was changed after this run started. */
  changed: boolean;
  onRun: (input: unknown) => Promise<void>;
  onChoose: (node: string) => void;
  onClose: () => void;
}) {
  const steps = run ? stepsOf(run) : [];
  return (
    <section
      aria-label="The test run"
      className="flex max-h-[45vh] shrink-0 flex-col gap-3 overflow-y-auto border-line border-t bg-surface px-4 py-3 md:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-title">Test the draft</h2>
        <Button size="small" variant="quiet" aria-label="Close the test panel" onClick={onClose}>
          <X aria-hidden="true" size={14} />
        </Button>
      </div>
      <p className="m-0 text-meta text-ink-muted">
        Runs {path} as it is saved now, as a test run in this workspace. Nothing is deployed.
      </p>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          {blocked ? (
            <Notice tone="plain">{blocked}</Notice>
          ) : (
            <InputForm schema={schema} action={run ? "Run again" : "Run a test"} onSubmit={onRun} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {run ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatePill state={run.state} />
                <Link to={`${link}/runs/${run.id}`} className="text-meta text-action">
                  Open the run
                </Link>
                {changed ? (
                  <span className="text-meta text-attention">
                    The flow changed since this test.
                  </span>
                ) : null}
              </div>
              {run.error ? <p className="m-0 text-danger">{run.error.message}</p> : null}
              <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Steps of the test">
                {steps.map((step) => (
                  <li key={step.node}>
                    <button
                      type="button"
                      className="flex w-full min-w-0 flex-wrap items-center gap-x-2 rounded-control px-1.5 py-1 text-left hover:bg-selected"
                      onClick={() => onChoose(step.node)}
                    >
                      <span className="font-mono text-[13px]">{step.node}</span>
                      <StatePill state={step.state} detail={took(step)} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-meta text-ink-subtle">
                Choose a step on the graph or here to see what it produced.
              </p>
            </>
          ) : (
            <p className="m-0 text-meta text-ink-subtle">
              Each step's state shows on the graph as it runs.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** What a step did in the last test: shown beside its settings. */
export function LastTest({ run, node }: { run: FlowRunDetail; node: string }) {
  const step = run.steps.find((one) => one.node === node && one.item === "");
  if (!step) {
    return <p className="m-0 text-meta text-ink-subtle">The last test did not reach this step.</p>;
  }
  const items = run.steps.filter((one) => one.node === node && one.item !== "");
  const failedItems = items.filter((one) => one.status === "failed");
  return (
    <section aria-label="Last test" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-[13px] font-semibold">Last test</h3>
        <StatePill state={step.state} />
      </div>
      <Facts
        columns={2}
        facts={[
          { label: "Started", value: new Date(step.startedAt).toLocaleTimeString() },
          { label: "Took", value: took(step) ?? "In progress" },
        ]}
      />
      {step.error ? (
        <p className="m-0 text-danger">
          {step.error.message}
          {step.handled ? (
            <span className="text-ink-muted"> The flow carried on down its error path.</span>
          ) : null}
        </p>
      ) : null}
      {items.length > 0 ? (
        <p className="m-0 text-meta text-ink-muted">
          {items.filter((one) => one.status === "succeeded").length} of {items.length} items done
          {failedItems.length > 0
            ? `. Failed: ${failedItems
                .slice(0, 3)
                .map((one) => one.error?.message ?? one.item)
                .join("; ")}`
            : ""}
          .
        </p>
      ) : null}
      {step.status === "succeeded" ? (
        <ResultView label={`Output of ${node}`} value={step.output} />
      ) : null}
    </section>
  );
}
