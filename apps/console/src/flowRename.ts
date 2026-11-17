import { parse } from "@marcbachmann/cel-js";

/**
 * Renaming a step rewrites every expression that reads it: `steps.<old>` and
 * `steps['<old>']`, found by parsing each expression, never by matching text, so
 * a string that happens to say `steps.<old>` is left as it is.
 */

interface Node {
  op: string;
  args: unknown;
  range: { start: number; end: number };
}
const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && "op" in value && "range" in value;

/** Where `steps.<from>` and `steps['<from>']` name the step in one expression. */
function places(
  expression: string,
  from: string,
): { start: number; end: number; quoted: boolean }[] {
  let ast: unknown;
  try {
    ast = parse(expression).ast;
  } catch {
    // An expression that does not parse is left for its own problem to report.
    return [];
  }
  const found: { start: number; end: number; quoted: boolean }[] = [];
  const isSteps = (node: unknown) => isNode(node) && node.op === "id" && node.args === "steps";
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const one of value) walk(one);
      return;
    }
    if (!isNode(value)) return;
    const args = value.args as unknown[];
    if (value.op === "." || value.op === ".?") {
      const [target, field] = args as [unknown, string];
      if (isSteps(target) && field === from) {
        found.push({ start: value.range.end - from.length, end: value.range.end, quoted: false });
      }
    } else if (value.op === "[]" || value.op === "[?]") {
      const [target, key] = args as [unknown, unknown];
      if (isSteps(target) && isNode(key) && key.op === "value" && key.args === from) {
        found.push({ start: key.range.start + 1, end: key.range.end - 1, quoted: true });
      }
    }
    walk(value.args);
  };
  walk(ast);
  return found;
}

/** The expression with every reference to step `from` naming `to` instead, and how many there were. */
export function renameInExpression(
  expression: string,
  from: string,
  to: string,
): { expression: string; count: number } {
  const found = places(expression, from).sort((a, b) => b.start - a.start);
  let out = expression;
  for (const place of found) out = out.slice(0, place.start) + to + out.slice(place.end);
  return { expression: out, count: found.length };
}

type Expressions = Record<string, unknown>;

/**
 * A node's expressions renamed: every field the flow's language reads as an
 * expression, as `flowExpressions` lists them.
 */
export function renameInNode<T extends Expressions>(
  node: T,
  from: string,
  to: string,
): { node: T; count: number } {
  let count = 0;
  const one = (value: unknown) => {
    if (typeof value !== "string") return value;
    const renamed = renameInExpression(value, from, to);
    count += renamed.count;
    return renamed.expression;
  };
  const record = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, one(inner)]))
      : value;
  const next: Expressions = { ...node };
  switch (node.type) {
    case "trigger": {
      const trigger = node.trigger as { type?: string; filter?: string } | undefined;
      if (trigger?.type === "event" && trigger.filter !== undefined) {
        next.trigger = { ...trigger, filter: one(trigger.filter) };
      }
      break;
    }
    case "script":
      if ("input" in node) next.input = one(node.input);
      if ("inputs" in node) next.inputs = record(node.inputs);
      break;
    case "subflow":
    case "foreach":
      for (const field of ["flowFrom", "input", "items"])
        if (field in node) next[field] = one(node[field]);
      break;
    case "set":
      next.values = record(node.values);
      break;
    case "branch":
      next.cases = (node.cases as { name: string; when: string }[]).map((item) => ({
        ...item,
        when: one(item.when) as string,
      }));
      break;
    case "approval":
      if ("detail" in node) next.detail = one(node.detail);
      break;
    case "respond":
      if ("body" in node) next.body = one(node.body);
      if ("headers" in node) next.headers = record(node.headers);
      break;
    case "fail":
      next.message = one(node.message);
      break;
  }
  return { node: next as T, count };
}
