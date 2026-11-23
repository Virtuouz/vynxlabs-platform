/**
 * What a flow's expressions read: the trigger's output, each finished step's
 * output or error, and the time. The engine builds it as a run goes; the
 * editor's preview builds it again from a run that has happened. One function
 * for both, so a preview never says something the run would not.
 */
import type { StepStatus } from "@volvel/db";
import type { Db, Trx } from "../audit.js";

/** The part of a step's row an expression's context is made from. */
export interface ContextStep {
  node_id: string;
  item_key: string;
  status: StepStatus;
  output: unknown;
  output_ref: string | null;
  error: { message: string } | null;
  run_id: string | null;
  child_flow_run_id: string | null;
}

const isTooLarge = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { stored?: unknown }).stored === "string" &&
  typeof (value as { note?: unknown }).note === "string";

/**
 * What an expression could not read because it was too large to be loaded: the flow's input, or
 * a step's output. A missing key beside one of these is the large value's, not a typing mistake.
 */
export function tooLargeIn(context: Record<string, unknown>): string[] {
  const found: string[] = [];
  if (isTooLarge(context.trigger)) found.push("The input the flow was started with");
  const steps = (context.steps ?? {}) as Record<string, { output?: unknown }>;
  const own = (context.trigger as { stored?: string } | undefined)?.stored;
  for (const [id, one] of Object.entries(steps)) {
    // The trigger's own step holds the same input again.
    if (isTooLarge(one?.output) && (one.output as { stored: string }).stored !== own)
      found.push(`The output of ${id}`);
  }
  return found;
}

/** What a finished step produced. Something too large to hold in a row is not loaded. */
export async function readOutput(db: Db | Trx, step: ContextStep): Promise<unknown> {
  const tooLarge = (ref: string) => ({
    stored: ref,
    note: "This output is too large to use in an expression. Read it in a script.",
  });
  if (step.run_id) {
    const run = await db
      .selectFrom("run")
      .select(["output", "output_ref"])
      .where("id", "=", step.run_id)
      .executeTakeFirst();
    return run?.output_ref ? tooLarge(run.output_ref) : (run?.output ?? null);
  }
  if (step.child_flow_run_id) {
    const child = await db
      .selectFrom("flow_run")
      .select(["output", "output_ref"])
      .where("id", "=", step.child_flow_run_id)
      .executeTakeFirst();
    return child?.output_ref ? tooLarge(child.output_ref) : (child?.output ?? null);
  }
  return step.output_ref ? tooLarge(step.output_ref) : (step.output ?? null);
}

/**
 * The context from a run's steps. `outputOf` reads a step's output, which the
 * engine keeps once read.
 */
export async function buildContext(
  steps: Iterable<ContextStep>,
  triggerNode: string,
  outputOf: (step: ContextStep) => Promise<unknown>,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const all = [...steps];
  const context: Record<string, unknown> = {};
  for (const step of all) {
    if (step.item_key !== "") continue;
    if (step.status === "succeeded") context[step.node_id] = { output: await outputOf(step) };
    else if (step.status === "failed")
      context[step.node_id] = { error: step.error ?? { message: "" } };
  }
  const trigger = all.find((step) => step.node_id === triggerNode && step.item_key === "");
  return {
    trigger: trigger ? await outputOf(trigger) : {},
    steps: context,
    // The time the expression is worked out, as a CEL timestamp.
    now: new Date(),
    ...extra,
  };
}

/** The context a flow run's expressions see now, read from what it has done so far. */
export async function expressionContext(
  db: Db | Trx,
  flowRun: { id: string; trigger_node: string },
  extra: Record<string, unknown> = {},
  /** Masks an output before an expression sees it, for a reader who may not see secrets. */
  shield?: (step: ContextStep, output: unknown) => Promise<unknown>,
): Promise<Record<string, unknown>> {
  const steps = (await db
    .selectFrom("step_run")
    .select([
      "node_id",
      "item_key",
      "status",
      "output",
      "output_ref",
      "error",
      "run_id",
      "child_flow_run_id",
    ])
    .where("flow_run_id", "=", flowRun.id)
    .execute()) as ContextStep[];
  return buildContext(
    steps,
    flowRun.trigger_node,
    async (step) => {
      const output = await readOutput(db, step);
      return shield ? shield(step, output) : output;
    },
    extra,
  );
}
