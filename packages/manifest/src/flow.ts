import type { ManifestIssue } from "./registry.js";

/** The body of a `flow` manifest, version 1. */
export interface FlowBody {
  description?: string;
  nodes: Record<string, FlowNode>;
  edges: FlowEdge[];
}

export interface FlowEdge {
  from: string;
  to: string;
  /** Leaves a branch by this case, or by "otherwise". */
  output?: string;
  /** The error path of `from`: taken when that step fails. */
  error?: boolean;
}

export type FlowTrigger =
  | { type: "manual" }
  | { type: "schedule"; cron: string; timezone?: string }
  | { type: "webhook" }
  | { type: "event"; event: string; filter?: string };

export type FlowNode =
  | { type: "trigger"; trigger: FlowTrigger }
  | { type: "script"; script: string; input?: string }
  | { type: "set"; values: Record<string, string> }
  | { type: "branch"; cases: { name: string; when: string }[] }
  | {
      type: "foreach";
      items: string;
      script?: string;
      flow?: string;
      input?: string;
      concurrency?: number;
    }
  | { type: "join" }
  | { type: "delay"; seconds: number }
  | { type: "approval"; title: string; detail?: string; timeoutSeconds?: number }
  | { type: "subflow"; flow: string; input?: string }
  | { type: "fail"; message: string };

export const OTHERWISE = "otherwise";

/** Every expression in a flow, with the place it was written. */
export function flowExpressions(body: FlowBody): { path: string; expression: string }[] {
  const found: { path: string; expression: string }[] = [];
  for (const [id, node] of Object.entries(body.nodes)) {
    const at = (field: string, expression: string | undefined) => {
      if (expression !== undefined) found.push({ path: `/body/nodes/${id}/${field}`, expression });
    };
    switch (node.type) {
      case "trigger":
        if (node.trigger.type === "event") at("trigger/filter", node.trigger.filter);
        break;
      case "script":
      case "subflow":
        at("input", node.input);
        break;
      case "set":
        for (const [name, expression] of Object.entries(node.values))
          at(`values/${name}`, expression);
        break;
      case "branch":
        for (const [index, item] of node.cases.entries()) at(`cases/${index}/when`, item.when);
        break;
      case "foreach":
        at("items", node.items);
        at("input", node.input);
        break;
      case "approval":
        at("detail", node.detail);
        break;
      case "fail":
        at("message", node.message);
        break;
    }
  }
  return found;
}

/** The scripts, flows and events a flow refers to, with the place each is named. */
export function flowReferences(
  body: FlowBody,
): { path: string; kind: "script" | "flow" | "event"; target: string }[] {
  const found: { path: string; kind: "script" | "flow" | "event"; target: string }[] = [];
  for (const [id, node] of Object.entries(body.nodes)) {
    const at = (field: string, kind: "script" | "flow" | "event", target: string | undefined) => {
      if (target !== undefined) found.push({ path: `/body/nodes/${id}/${field}`, kind, target });
    };
    if (node.type === "script") at("script", "script", node.script);
    if (node.type === "subflow") at("flow", "flow", node.flow);
    if (node.type === "foreach") {
      at("script", "script", node.script);
      at("flow", "flow", node.flow);
    }
    if (node.type === "trigger" && node.trigger.type === "event")
      at("trigger/event", "event", node.trigger.event);
  }
  return found;
}

/** The nodes that can be reached from one node by following edges. Includes the node itself. */
export function reachableFrom(body: FlowBody, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
    for (const edge of body.edges) {
      if (edge.from === node && !seen.has(edge.to)) {
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return seen;
}

/**
 * Checks the shape of a flow's graph, beyond what its JSON Schema can say.
 * The build and the control plane both run this.
 */
export function checkFlow(body: FlowBody): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const ids = Object.keys(body.nodes);
  const triggers = ids.filter((id) => body.nodes[id]?.type === "trigger");
  if (triggers.length === 0) {
    issues.push({ path: "/body/nodes", message: "a flow needs at least one trigger node" });
  }

  body.edges.forEach((edge, index) => {
    const at = `/body/edges/${index}`;
    const from = body.nodes[edge.from];
    const to = body.nodes[edge.to];
    if (!from) issues.push({ path: `${at}/from`, message: `there is no node "${edge.from}"` });
    if (!to) issues.push({ path: `${at}/to`, message: `there is no node "${edge.to}"` });
    if (to?.type === "trigger") {
      issues.push({
        path: `${at}/to`,
        message: `"${edge.to}" is a trigger, so nothing can lead into it`,
      });
    }
    if (edge.output !== undefined) {
      if (from && from.type !== "branch") {
        issues.push({
          path: `${at}/output`,
          message: `only a branch has named outputs, and "${edge.from}" is a ${from.type}`,
        });
      } else if (
        from?.type === "branch" &&
        edge.output !== OTHERWISE &&
        !from.cases.some((item) => item.name === edge.output)
      ) {
        issues.push({
          path: `${at}/output`,
          message: `the branch "${edge.from}" has no case "${edge.output}"`,
        });
      }
    }
    if (from?.type === "branch" && edge.output === undefined && !edge.error) {
      issues.push({
        path: `${at}/output`,
        message: `an edge leaving the branch "${edge.from}" must say which case it follows`,
      });
    }
    if (edge.error && from?.type === "trigger") {
      issues.push({
        path: `${at}/error`,
        message: "a trigger cannot fail, so it has no error path",
      });
    }
  });

  for (const [id, node] of Object.entries(body.nodes)) {
    const at = `/body/nodes/${id}`;
    const incoming = body.edges.filter((edge) => edge.to === id);
    if (node.type === "join" && incoming.length < 2) {
      issues.push({
        path: at,
        message: "a join waits for several paths, so it needs at least two incoming edges",
      });
    }
    if (node.type === "foreach" && (node.script === undefined) === (node.flow === undefined)) {
      issues.push({
        path: at,
        message: "a foreach runs either a script or a flow: give exactly one",
      });
    }
    if (node.type === "branch") {
      const names = node.cases.map((item) => item.name);
      if (new Set(names).size !== names.length || names.includes(OTHERWISE)) {
        issues.push({
          path: `${at}/cases`,
          message: `case names must be unique, and "${OTHERWISE}" is reserved`,
        });
      }
    }
  }

  const reachable = new Set(triggers.flatMap((trigger) => [...reachableFrom(body, trigger)]));
  for (const id of ids) {
    if (!reachable.has(id)) {
      issues.push({ path: `/body/nodes/${id}`, message: "no trigger leads to this node" });
    }
  }

  // Repetition is a foreach. A cycle in the graph would never settle.
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, trail: string[]): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      const loop = [...trail.slice(trail.indexOf(id)), id].join(" -> ");
      issues.push({
        path: `/body/nodes/${id}`,
        message: `the flow loops back on itself: ${loop}. Use a foreach to repeat`,
      });
      return;
    }
    state.set(id, "visiting");
    for (const edge of body.edges) {
      if (edge.from === id && body.nodes[edge.to]) visit(edge.to, [...trail, id]);
    }
    state.set(id, "done");
  };
  for (const id of ids) visit(id, []);

  return issues;
}
