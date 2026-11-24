import { tenantDefinitionProblems, type WidgetDefinition } from "@volvel/widgets";
import { jsonSchemaProblem } from "./registry.js";

/** The body of a `widget` resource, once its shape is known to be right. */
export type WidgetBody = WidgetDefinition & { entry: string };

/**
 * What is wrong with a developer's widget that its schema cannot say: the contract's own
 * check of a definition (`definitionProblems`: hints, controls, sizes), a type outside the
 * tenant's namespace, a path that is not the type, and a config or an event payload that is
 * not a JSON Schema. Said as sentences, each naming the widget.
 */
export function checkWidget(path: string, body: WidgetBody): string[] {
  const problems = tenantDefinitionProblems(body);
  if (path !== body.type) {
    problems.push(
      `the path is the widget's type: it is "${body.type}", so its path is ${body.type}.`,
    );
  }
  const config = jsonSchemaProblem(body.config);
  if (config !== undefined) problems.push(`config is not a JSON Schema: ${config}`);
  for (const [name, event] of Object.entries(body.events)) {
    const payload = event.payload === undefined ? undefined : jsonSchemaProblem(event.payload);
    if (payload !== undefined) {
      problems.push(`event "${name}": its payload is not a JSON Schema: ${payload}`);
    }
  }
  return problems;
}
