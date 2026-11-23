import type { Db, Trx } from "../audit.js";
import { payloadSchemas } from "../execution/bundles.js";
import { type Known, maskFor, secretStrings } from "../execution/redact.js";
import { servedValues } from "../execution/served.js";
import type { Kernel } from "../kernel.js";
import { eventSchema } from "./events.js";

/**
 * What a flow run was given, to mask by value in any text it shows: what each script step was
 * served (secrets, credentials), and the secret fields of the trigger's input and of the steps'
 * outputs. One piece for the flow run page, the editor's preview and an approval's detail, which
 * can all hold a text built from one of these. Looking one up never stops the reader.
 */
export async function flowKnown(
  kernel: Kernel,
  db: Db | Trx,
  flowRunId: string,
  cache?: Map<string, Promise<Known>>,
): Promise<Known> {
  const held = cache?.get(flowRunId);
  if (held) return held;
  const made = (async (): Promise<Known> => {
    const values: string[] = [];
    const served: string[] = [];
    try {
      const flowRun = await db
        .selectFrom("flow_run")
        .select(["tenant_id", "workspace_id", "bundle_id", "trigger_node", "trigger_detail"])
        .select(["input", "output"])
        .where("id", "=", flowRunId)
        .executeTakeFirst();
      if (!flowRun) return [];
      const steps = await db
        .selectFrom("step_run")
        .leftJoin("run", "run.id", "step_run.run_id")
        .select([
          "step_run.node_id",
          "step_run.output as step_output",
          "run.script_path",
          "run.input as run_input",
          "run.output as run_output",
          "run.trigger_type",
          "run.trigger_detail as run_trigger_detail",
        ])
        .where("step_run.flow_run_id", "=", flowRunId)
        .execute();
      const event = (flowRun.trigger_detail as { event?: unknown } | null)?.event;
      const triggerSchema =
        typeof event === "string" ? await eventSchema(db, flowRun.workspace_id, event) : undefined;
      values.push(...secretStrings(flowRun.input, triggerSchema));
      const seen = new Set<string>();
      for (const step of steps) {
        if (step.script_path) {
          const schemas = await payloadSchemas(kernel, flowRun.bundle_id, step.script_path);
          values.push(
            ...secretStrings(step.run_input, schemas.input),
            ...secretStrings(step.run_output, schemas.output),
          );
          if (!seen.has(step.script_path)) {
            seen.add(step.script_path);
            served.push(
              ...(await servedValues(kernel, db, {
                tenant_id: flowRun.tenant_id,
                workspace_id: flowRun.workspace_id,
                bundle_id: flowRun.bundle_id,
                script_path: step.script_path,
                trigger_type: step.trigger_type ?? "flow",
                trigger_detail: (step.run_trigger_detail ?? {}) as Record<string, unknown>,
              })),
            );
          }
        } else {
          values.push(
            ...secretStrings(
              step.step_output,
              step.node_id === flowRun.trigger_node ? triggerSchema : undefined,
            ),
          );
        }
      }
    } catch (error) {
      kernel.log.warn({ err: error }, "a flow run's served values could not all be looked up");
    }
    return [...new Set([...maskFor(values), ...served])].sort((a, b) => b.length - a.length);
  })();
  cache?.set(flowRunId, made);
  return made;
}
