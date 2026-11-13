import type { ManifestIssue } from "./registry.js";

/** The body of a `flow` manifest, version 1. */
export interface FlowBody {
  description?: string;
  nodes: Record<string, FlowNode>;
  edges: FlowEdge[];
  /** Where each node sits in the editor. Nothing about how the flow runs. */
  layout?: Record<string, { x: number; y: number }>;
}

export interface FlowEdge {
  from: string;
  to: string;
  /** Leaves a branch by this case, or by "otherwise". */
  output?: string;
  /** The error path of `from`: taken when that step fails. */
  error?: boolean;
}

/** How a webhook checks that a request was signed with a shared secret. */
export interface WebhookVerify {
  scheme: "hmac-sha256" | "hmac-sha1";
  header: string;
  /** The name of the workspace secret that holds the shared secret. */
  secret: string;
  encoding?: "hex" | "base64";
  prefix?: string;
  /** What was signed: `{body}` and `{timestamp}` stand for the raw body and the timestamp header. */
  signed?: string;
  timestampHeader?: string;
  toleranceSeconds?: number;
}

export type FlowTrigger =
  | { type: "manual" }
  | { type: "schedule"; cron: string; timezone?: string; source?: string }
  | { type: "webhook"; input?: "body" | "request"; verify?: WebhookVerify; source?: string }
  | { type: "event"; event: string; filter?: string };

/**
 * What a step hands the script it runs, beyond what the script declares for
 * itself. A generic step such as "send email" declares nothing: the flow says
 * which connection it sends through, and the run may reach that one.
 */
export interface FlowGrants {
  connections?: string[];
  tables?: string[];
  events?: string[];
}

/** The kinds of thing a step can hand a script, as a script's `node.takes` names them. */
export const GRANT_KINDS = { connections: "connection", tables: "table", events: "event" } as const;

export type FlowNode =
  | { type: "trigger"; trigger: FlowTrigger }
  | {
      type: "script";
      script: string;
      /** One expression for the whole input. */
      input?: string;
      /** An expression per field of the input. Use this or `input`. */
      inputs?: Record<string, string>;
      with?: FlowGrants;
    }
  | { type: "set"; values: Record<string, string> }
  | { type: "branch"; cases: { name: string; when: string }[] }
  | {
      type: "foreach";
      items: string;
      script?: string;
      flow?: string;
      flowFrom?: string;
      allow?: string[];
      input?: string;
      concurrency?: number;
      /** For a foreach that runs a script. */
      with?: FlowGrants;
    }
  | { type: "join" }
  | { type: "delay"; seconds: number }
  | { type: "approval"; title: string; detail?: string; timeoutSeconds?: number }
  | { type: "subflow"; flow?: string; flowFrom?: string; allow?: string[]; input?: string }
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
        at("input", node.input);
        for (const [name, expression] of Object.entries(node.inputs ?? {}))
          at(`inputs/${name}`, expression);
        break;
      case "subflow":
        at("flowFrom", node.flowFrom);
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
        at("flowFrom", node.flowFrom);
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
    // A flow chosen when the step runs can be any of these, so each is a reference like one named outright.
    if (node.type === "subflow" || node.type === "foreach") {
      for (const [index, allowed] of (node.allow ?? []).entries()) {
        at(`allow/${index}`, "flow", allowed);
      }
    }
    if (node.type === "trigger" && node.trigger.type === "event")
      at("trigger/event", "event", node.trigger.event);
  }
  return found;
}

/** What the steps of a flow hand their scripts, with the place each is written and the script it goes to. */
export function flowGrants(
  body: FlowBody,
): { path: string; kind: "connection" | "table" | "event"; target: string; script: string }[] {
  const found: ReturnType<typeof flowGrants> = [];
  for (const [id, node] of Object.entries(body.nodes)) {
    if ((node.type !== "script" && node.type !== "foreach") || !node.with || !node.script) continue;
    for (const [field, kind] of Object.entries(GRANT_KINDS)) {
      for (const [index, target] of (node.with[field as keyof FlowGrants] ?? []).entries()) {
        found.push({
          path: `/body/nodes/${id}/with/${field}/${index}`,
          kind,
          target,
          script: node.script,
        });
      }
    }
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
    if (node.type === "subflow" || node.type === "foreach") {
      if (node.flow !== undefined && node.flowFrom !== undefined) {
        issues.push({
          path: `${at}/flowFrom`,
          message: "name the flow with `flow`, or choose it with `flowFrom`: not both",
        });
      }
      if ((node.flowFrom === undefined) !== (node.allow === undefined)) {
        issues.push({
          path: `${at}/allow`,
          message:
            "`flowFrom` and `allow` go together: the expression chooses, and the list says what it may choose",
        });
      }
    }
    if (node.type === "subflow" && node.flow === undefined && node.flowFrom === undefined) {
      issues.push({
        path: `${at}/flow`,
        message: "a subflow names a flow, or chooses one with `flowFrom`",
      });
    }
    if (
      node.type === "foreach" &&
      (node.script === undefined) === (node.flow === undefined && node.flowFrom === undefined)
    ) {
      issues.push({
        path: at,
        message: "a foreach runs either a script or a flow: give exactly one",
      });
    }
    if (node.type === "script" && node.input !== undefined && node.inputs !== undefined) {
      issues.push({
        path: `${at}/inputs`,
        message:
          "give the input as one expression with `input`, or field by field with `inputs`: not both",
      });
    }
    if (node.type === "foreach" && node.with !== undefined && node.script === undefined) {
      issues.push({
        path: `${at}/with`,
        message: "`with` hands something to a script, and this foreach runs a flow",
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
