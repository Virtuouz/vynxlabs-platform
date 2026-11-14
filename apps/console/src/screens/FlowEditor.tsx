import {
  Badge,
  type BadgeTone,
  Button,
  CheckboxField,
  ComboboxField,
  MultiSelectField,
  Notice,
  NumberField,
  type Option,
  SelectField,
  TextAreaField,
  TextField,
} from "@vynxlabs/ui";
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Plus, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { autoLayout, describe, type GraphEdge, type GraphNode } from "../FlowGraph.tsx";
import { Tag } from "../kit/status.tsx";
import { Link, navigate } from "../router.tsx";
import {
  FormDesigner,
  missingInputs,
  NodeInputs,
  newForm,
  type PickableNode,
  type Picked,
  RespondSettings,
  WebhookSettings,
} from "./FlowSteps.tsx";

/** A node as the flow's manifest holds it. */
type FlowNode = GraphNode & Record<string, unknown>;
interface FlowBody {
  description?: string;
  nodes: Record<string, FlowNode>;
  edges: GraphEdge[];
  layout?: Record<string, { x: number; y: number }>;
}
type CanvasNode = Node<{ id: string; node: FlowNode }>;

const OTHERWISE = "otherwise";
const NODE_ID = /^[a-z][a-z0-9_]*$/;
const PATH = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/** What can be put on the canvas, in the order the palette shows it. */
const PALETTE: {
  group: string;
  label: string;
  hint: string;
  base: string;
  make: () => FlowNode;
}[] = [
  {
    group: "Starts",
    label: "By hand",
    hint: "Someone starts it, or another flow does.",
    base: "start",
    make: () => ({ type: "trigger", trigger: { type: "manual" } }),
  },
  {
    group: "Starts",
    label: "On a schedule",
    hint: "At times given as a cron line.",
    base: "schedule",
    make: () => ({ type: "trigger", trigger: { type: "schedule", cron: "0 8 * * *" } }),
  },
  {
    group: "Starts",
    label: "On an event",
    hint: "When an event is published.",
    base: "on_event",
    make: () => ({ type: "trigger", trigger: { type: "event", event: "" } }),
  },
  {
    group: "Starts",
    label: "On a webhook",
    hint: "When its address is called.",
    base: "webhook",
    make: () => ({ type: "trigger", trigger: { type: "webhook" } }),
  },
  {
    group: "Starts",
    label: "On a form",
    hint: "When someone fills in a page the platform serves.",
    base: "form",
    make: () => ({ type: "trigger", trigger: newForm() }),
  },
  {
    group: "Steps",
    label: "Run a script",
    hint: "Runs on a worker.",
    base: "run",
    make: () => ({ type: "script", script: "" }),
  },
  {
    group: "Steps",
    label: "Run a flow",
    hint: "Waits for another flow.",
    base: "subflow",
    make: () => ({ type: "subflow", flow: "" }),
  },
  {
    group: "Steps",
    label: "Set values",
    hint: "Works values out and names them.",
    base: "set",
    make: () => ({ type: "set", values: { value: "trigger" } }),
  },
  {
    group: "Steps",
    label: "Answer the request",
    hint: "Answers the webhook that started the flow.",
    base: "answer",
    make: () => ({ type: "respond", body: "{'ok': true}" }),
  },
  {
    group: "Logic",
    label: "Branch",
    hint: "Goes one way or another.",
    base: "branch",
    make: () => ({ type: "branch", cases: [{ name: "yes", when: "true" }] }),
  },
  {
    group: "Logic",
    label: "For each",
    hint: "Runs a script or flow per item.",
    base: "each",
    make: () => ({ type: "foreach", items: "trigger.items", script: "" }),
  },
  {
    group: "Logic",
    label: "Join",
    hint: "Waits for every path into it.",
    base: "join",
    make: () => ({ type: "join" }),
  },
  {
    group: "Logic",
    label: "Wait",
    hint: "Pauses for a time.",
    base: "wait",
    make: () => ({ type: "delay", seconds: 60 }),
  },
  {
    group: "Logic",
    label: "Approval",
    hint: "Pauses until a person decides.",
    base: "approve",
    make: () => ({ type: "approval", title: "Approve" }),
  },
  {
    group: "Logic",
    label: "Fail",
    hint: "Ends the flow as failed.",
    base: "fail",
    make: () => ({ type: "fail", message: "'Stopped'" }),
  },
];

const TYPE_TONE: Record<string, BadgeTone> = {
  trigger: "success",
  script: "action",
  subflow: "action",
  respond: "action",
  branch: "attention",
  foreach: "attention",
  approval: "attention",
  fail: "danger",
};

/** The handles a node offers for edges leaving it: one per case of a branch, and the error path. */
function outputs(node: FlowNode): { id: string; label: string }[] {
  if (node.type === "branch") {
    const cases = (node.cases as { name: string }[] | undefined) ?? [];
    return [
      ...cases.map((one) => ({ id: `case:${one.name}`, label: one.name })),
      { id: `case:${OTHERWISE}`, label: OTHERWISE },
    ];
  }
  if (node.type === "fail") return [];
  if (
    node.type === "trigger" ||
    node.type === "join" ||
    node.type === "set" ||
    node.type === "delay"
  ) {
    return [{ id: "next", label: "" }];
  }
  return [
    { id: "next", label: "" },
    { id: "error", label: "on error" },
  ];
}

/** The names of the scripts that are nodes, by path, for the cards on the canvas. */
const NodeNames = createContext<ReadonlyMap<string, string>>(new Map());

function FlowNodeCard({ data, selected }: NodeProps<CanvasNode>) {
  const { id, node } = data;
  const out = outputs(node);
  const named = useContext(NodeNames).get(String(node.script ?? ""));
  return (
    <div
      className={`w-52 rounded-control border bg-surface px-3 py-2 shadow-sm ${
        selected ? "border-action ring-2 ring-action/30" : "border-line"
      } ${node.type === "trigger" ? "rounded-full px-5" : ""}`}
    >
      {node.type === "trigger" ? null : <Handle type="target" position={Position.Left} />}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[13px] font-semibold">{id}</span>
        <Badge tone={TYPE_TONE[node.type] ?? "neutral"}>{node.type}</Badge>
      </div>
      <div className="truncate text-[12px] text-ink-muted">{named ?? describe(node)}</div>
      {out.map((handle, index) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.id === "error" ? Position.Bottom : Position.Right}
          style={
            handle.id === "error"
              ? { background: "var(--vx-danger)" }
              : out.filter((one) => one.id !== "error").length > 1
                ? { top: `${((index + 1) / (out.length + 1)) * 100}%` }
                : {}
          }
          title={handle.label || "next"}
        />
      ))}
    </div>
  );
}
const nodeTypes = { flow: FlowNodeCard };
const FIT = { maxZoom: 1, padding: 0.25 };
const CANVAS_COLORS = {
  "--xy-background-color": "var(--vx-sunken)",
  "--xy-background-pattern-color": "var(--vx-line)",
  "--xy-edge-stroke": "var(--vx-ink-muted)",
  "--xy-edge-stroke-selected": "var(--vx-action)",
  "--xy-edge-label-color": "var(--vx-ink)",
  "--xy-edge-label-background-color": "var(--vx-surface)",
  "--xy-handle-background-color": "var(--vx-ink-muted)",
  "--xy-handle-border-color": "var(--vx-surface)",
  "--xy-minimap-background-color": "var(--vx-surface)",
  "--xy-minimap-mask-background-color": "color-mix(in srgb, var(--vx-canvas) 70%, transparent)",
  "--xy-minimap-node-background-color": "var(--vx-line)",
  "--xy-controls-button-background-color": "var(--vx-surface)",
  "--xy-controls-button-background-color-hover": "var(--vx-sunken)",
  "--xy-controls-button-color": "var(--vx-ink)",
  "--xy-controls-button-border-color": "var(--vx-line)",
  "--xy-attribution-background-color": "transparent",
} as React.CSSProperties;

/** An edge of the manifest as the canvas draws it, and back. */
const toCanvasEdge = (edge: GraphEdge, index: number): Edge => ({
  id: `e${index}-${edge.from}-${edge.to}-${edge.output ?? ""}-${edge.error ? "error" : ""}`,
  source: edge.from,
  target: edge.to,
  sourceHandle: edge.error ? "error" : edge.output ? `case:${edge.output}` : "next",
  ...(edge.error
    ? { label: "on error", style: { strokeDasharray: "4 3" } }
    : edge.output
      ? { label: edge.output }
      : {}),
});
const toFlowEdge = (edge: Edge): GraphEdge => ({
  from: edge.source,
  to: edge.target,
  ...(edge.sourceHandle === "error" ? { error: true } : {}),
  ...(edge.sourceHandle?.startsWith("case:") ? { output: edge.sourceHandle.slice(5) } : {}),
});

/** What is wrong with a flow that can be seen without asking the server. */
export function problemsOf(
  nodes: Record<string, FlowNode>,
  edges: GraphEdge[],
  /** The scripts that are nodes with a form of their own, by path. */
  specs: ReadonlyMap<string, PickableNode> = new Map(),
): string[] {
  const problems: string[] = [];
  const ids = Object.keys(nodes);
  const answers = ids.some((id) => nodes[id]?.type === "respond");
  if (!ids.some((id) => nodes[id]?.type === "trigger"))
    problems.push("Add a way for the flow to start.");
  const reached = new Set(edges.map((edge) => edge.to));
  for (const id of ids) {
    const node = nodes[id] as FlowNode;
    if (node.type !== "trigger" && !reached.has(id)) problems.push(`Nothing leads to ${id}.`);
    if (node.type === "script" && !node.script) problems.push(`${id} has no script chosen.`);
    const spec = node.type === "script" ? specs.get(String(node.script)) : undefined;
    for (const missing of spec ? missingInputs(spec, node) : []) {
      problems.push(`${id} needs: ${missing}.`);
    }
    if (node.type === "trigger") {
      const trigger = node.trigger as {
        type: string;
        respond?: string;
        title?: string;
        verify?: { header?: string; secret?: string };
        fields?: { name: string; label: string; type: string; options?: string[] }[];
      };
      if (trigger.type === "webhook" && trigger.respond === "flow" && !answers) {
        problems.push(`${id} waits for the flow to answer. Add an Answer step.`);
      }
      if (trigger.type === "webhook" && trigger.verify && !trigger.verify.secret) {
        problems.push(`${id} checks a signature and has no secret chosen.`);
      }
      if (trigger.type === "form") {
        if (!trigger.title) problems.push(`${id} needs a title for its form.`);
        const names = (trigger.fields ?? []).map((field) => field.name);
        if (new Set(names).size !== names.length || names.some((name) => !NODE_ID.test(name))) {
          problems.push(`${id} needs a different name for each question, in lowercase letters.`);
        }
        for (const field of trigger.fields ?? []) {
          if (!field.label) problems.push(`${id} has a question with no text.`);
          if (field.type === "select" && (field.options ?? []).length === 0) {
            problems.push(`${id} has a list with nothing in it: ${field.label}.`);
          }
        }
      }
    }
    if (node.type === "subflow" && node.flowFrom === undefined && !node.flow) {
      problems.push(`${id} has no flow chosen.`);
    }
    if (node.type === "subflow" && node.flowFrom !== undefined) {
      if (!node.flowFrom) problems.push(`${id} needs an expression that gives the flow to start.`);
      if (((node.allow as string[] | undefined) ?? []).length === 0) {
        problems.push(`${id} needs at least one flow it may start.`);
      }
    }
    if (node.type === "foreach" && !node.script && !node.flow)
      problems.push(`${id} needs a script or a flow to run for each item.`);
    if (
      node.type === "trigger" &&
      (node.trigger as { type: string; event?: string }).type === "event" &&
      !(node.trigger as { event?: string }).event
    ) {
      problems.push(`${id} has no event chosen.`);
    }
  }
  return problems;
}

/** A flow drawn on a canvas. Saving makes a draft, deployed from the Changes screen. */
export function FlowEditor({
  root,
  link,
  path: opened,
}: {
  root: string;
  link: string;
  /** The flow to open, or nothing for a new one. */
  path: string | undefined;
}) {
  const [path, setPath] = useState(opened ?? "");
  const [description, setDescription] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string>();
  const [canvas, setCanvas] = useState<ReactFlowInstance<CanvasNode, Edge>>();
  const [revision, setRevision] = useState<number>();
  const [state, setState] = useState<"new" | "draft" | "deployed" | "repository">("new");
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number>();
  const [adding, setAdding] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [, setTick] = useState(0);
  const scripts = useLoad<{
    items: {
      path: string;
      description: string;
      inputSchema: PickableNode["input"];
      node: { label: string; category?: string; takes?: string[] } | null;
    }[];
  }>(`${root}/scripts`);
  const core = useLoad<{ items: PickableNode[] }>("/core-nodes");
  const secrets = useLoad<{ items: { name: string }[] }>(`${root}/secrets`);
  const flows = useLoad<{ items: { path: string; description: string }[] }>(`${root}/flows`);
  const drafts = useLoad<{ items: { path: string; kind: string; deleted: boolean }[] }>(
    `${root}/drafts`,
  );
  const events = useLoad<{ items: { path: string; kind: string; body?: { mode?: string } }[] }>(
    `${root}/resources?limit=200`,
  );

  const choices = (
    kind: "script" | "flow",
    deployed: { path: string; description: string }[] | undefined,
  ): Option[] => {
    const known = new Map((deployed ?? []).map((one) => [one.path, one.description]));
    for (const draft of drafts.data?.items ?? []) {
      if (draft.kind === kind && !draft.deleted && !known.has(draft.path))
        known.set(draft.path, "A draft, not yet deployed.");
    }
    return [...known]
      .filter(([one]) => kind !== "flow" || one !== path)
      .map(([value, hint]) => ({ value, label: value, ...(hint ? { hint } : {}) }));
  };
  const scriptOptions = choices("script", scripts.data?.items);
  const flowOptions = choices("flow", flows.data?.items);
  /** What the workspace has of a kind, deployed or still a draft. */
  const ofKind = (kind: string, mode?: string): Option[] => {
    const known = new Map<string, string | undefined>();
    for (const one of events.data?.items ?? []) {
      if (one.kind === kind && (!mode || one.body?.mode === mode)) known.set(one.path, undefined);
    }
    for (const draft of drafts.data?.items ?? []) {
      if (draft.kind === kind && !draft.deleted && !known.has(draft.path) && !mode)
        known.set(draft.path, "A draft, not yet deployed.");
    }
    return [...known].map(([value, hint]) => ({ value, label: value, ...(hint ? { hint } : {}) }));
  };
  const eventOptions = ofKind("event");
  const pickChoices: Record<Picked, Option[]> = {
    connection: ofKind("connection"),
    table: ofKind("table"),
    event: eventOptions,
  };
  const secretOptions: Option[] = (secrets.data?.items ?? []).map((one) => ({
    value: one.name,
    label: one.name,
  }));
  /** The scripts that are steps with a form of their own: the platform's, then the workspace's. */
  const pickable = useMemo<PickableNode[]>(
    () => [
      ...(core.data?.items ?? []),
      ...(scripts.data?.items ?? [])
        .filter((one) => one.node && !one.path.startsWith("core/"))
        .map((one) => ({
          path: one.path,
          label: one.node?.label ?? one.path,
          category: one.node?.category ?? "This workspace's",
          description: one.description,
          takes: one.node?.takes ?? [],
          input: one.inputSchema,
        })),
    ],
    [core.data, scripts.data],
  );
  const specs = useMemo(() => new Map(pickable.map((one) => [one.path, one])), [pickable]);
  const names = useMemo(() => new Map(pickable.map((one) => [one.path, one.label])), [pickable]);

  const open = useCallback(
    (body: FlowBody) => {
      const positions = { ...autoLayout(body.nodes, body.edges), ...(body.layout ?? {}) };
      setDescription(body.description ?? "");
      setNodes(
        Object.entries(body.nodes).map(([id, node]) => ({
          id,
          type: "flow",
          position: positions[id] ?? { x: 0, y: 0 },
          data: { id, node },
        })),
      );
      setEdges(body.edges.map(toCanvasEdge));
      setLoaded(true);
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    let current = true;
    if (!opened) {
      open({ nodes: { start: { type: "trigger", trigger: { type: "manual" } } }, edges: [] });
      return;
    }
    (async () => {
      try {
        const draft = await api.get<{ body: FlowBody; revision: number }>(
          `${root}/drafts/${opened}`,
        );
        if (!current) return;
        open(draft.body);
        setRevision(draft.revision);
        setState("draft");
      } catch (error) {
        if ((error as ApiError).status !== 404) throw error;
        const resource = await api.get<{ ownership: string; body: FlowBody }>(
          `${root}/resources/${opened}`,
        );
        if (!current) return;
        open(resource.body);
        setState(resource.ownership === "ui" ? "deployed" : "repository");
      }
    })().catch((error) => current && setProblem(failureText(error)));
    return () => {
      current = false;
    };
  }, [root, opened, open]);

  const flowNodes = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node.data.node])),
    [nodes],
  );
  const flowEdges = useMemo(() => edges.map(toFlowEdge), [edges]);
  const found = useMemo(
    () => problemsOf(flowNodes, flowEdges, specs),
    [flowNodes, flowEdges, specs],
  );
  const chosen = nodes.find((node) => node.id === selected);

  const add = (entry: { base: string; make: () => FlowNode }) => {
    let id = entry.base;
    for (let n = 2; nodes.some((node) => node.id === id); n++) id = `${entry.base}_${n}`;
    // To the right of whatever is furthest right, level with it.
    const last = nodes.reduce<CanvasNode | undefined>(
      (furthest, node) => (!furthest || node.position.x > furthest.position.x ? node : furthest),
      undefined,
    );
    setNodes((before) => [
      // The new step is the chosen one, on the canvas as in the panel beside it.
      ...before.map((node) => ({ ...node, selected: false })),
      {
        id,
        type: "flow",
        selected: true,
        position: { x: (last?.position.x ?? -280) + 280, y: last?.position.y ?? 0 },
        data: { id, node: entry.make() },
      },
    ]);
    setSelected(id);
    setDirty(true);
    // Bring the new step into view once it has been drawn.
    setTimeout(() => canvas?.fitView({ ...FIT, duration: 200 }), 50);
  };
  const update = (id: string, change: Partial<FlowNode>) => {
    setNodes((before) =>
      before.map((node) =>
        node.id === id
          ? { ...node, data: { id, node: { ...node.data.node, ...change } as FlowNode } }
          : node,
      ),
    );
    setDirty(true);
  };
  const rename = (from: string, to: string) => {
    if (!NODE_ID.test(to) || nodes.some((node) => node.id === to)) return false;
    setNodes((before) =>
      before.map((node) =>
        node.id === from ? { ...node, id: to, data: { id: to, node: node.data.node } } : node,
      ),
    );
    setEdges((before) =>
      before.map((edge) => ({
        ...edge,
        source: edge.source === from ? to : edge.source,
        target: edge.target === from ? to : edge.target,
      })),
    );
    setSelected(to);
    setDirty(true);
    return true;
  };
  const remove = (id: string) => {
    setNodes((before) => before.filter((node) => node.id !== id));
    setEdges((before) => before.filter((edge) => edge.source !== id && edge.target !== id));
    setSelected(undefined);
    setDirty(true);
  };
  const connect = (connection: Connection) => {
    if (connection.source === connection.target) return;
    setEdges((before) => {
      // One edge leaves each handle of a branch, and one error path leaves a step.
      const kept = before.filter(
        (edge) =>
          !(
            edge.source === connection.source &&
            edge.sourceHandle === connection.sourceHandle &&
            connection.sourceHandle !== "next"
          ),
      );
      const handle = connection.sourceHandle ?? "next";
      return addEdge(
        {
          ...connection,
          ...(handle === "error"
            ? { label: "on error", style: { strokeDasharray: "4 3" } }
            : handle.startsWith("case:")
              ? { label: handle.slice(5) }
              : {}),
        },
        kept,
      );
    });
    setDirty(true);
  };

  const save = async () => {
    setProblem(undefined);
    if (!PATH.test(path)) {
      setProblem(
        "Give the flow a path: lowercase letters, digits, hyphens and underscores, in folders. For example orders/handle.",
      );
      return;
    }
    setBusy(true);
    try {
      const body: FlowBody = {
        ...(description ? { description } : {}),
        nodes: flowNodes,
        edges: flowEdges,
        layout: Object.fromEntries(
          nodes.map((node) => [
            node.id,
            { x: Math.round(node.position.x), y: Math.round(node.position.y) },
          ]),
        ),
      };
      const saved = await api.put<{ revision: number }>(`${root}/drafts/${path}`, {
        kind: "flow",
        schemaVersion: 1,
        body,
        ...(revision ? { revision } : {}),
      });
      setRevision(saved.revision);
      setState("draft");
      setDirty(false);
      setSavedAt(Date.now());
      drafts.reload();
      if (!opened) navigate(`${link}/flows/edit/${path}`, { replace: true });
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  // A flow already saved once is saved again a moment after each change, as the app builder does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `save` reads the latest state when it runs
  useEffect(() => {
    if (!dirty || busy || state === "new" || state === "repository") return;
    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [dirty, busy, state, nodes, edges, description]);
  // "Saved 12s ago" moves on by itself.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(timer);
  }, []);
  const hasManual = nodes.some((one) => {
    const step = one.data.node as { type: string; trigger?: { type?: string } };
    return step.type === "trigger" && step.trigger?.type === "manual";
  });
  const runDraft = async () => {
    try {
      const started = await api.post<{ runId: string }>(`${root}/test-runs`, {
        flow: path,
        input: {},
      });
      navigate(`${link}/flow-runs/${started.runId}`);
    } catch (error) {
      notify.error(error);
    }
  };

  if (!loaded)
    return problem ? (
      <Notice tone="danger">{problem}</Notice>
    ) : (
      <p className="text-ink-muted">Loading…</p>
    );

  const STATE: Record<typeof state, [BadgeTone, string]> = {
    new: ["neutral", "Not saved"],
    draft: ["attention", "Draft"],
    deployed: ["success", "Deployed"],
    repository: ["action", "From the repository"],
  };
  const node = chosen?.data.node;
  const expression = (label: string, key: string, hint?: string) =>
    chosen && node ? (
      <TextAreaField
        name={key}
        label={label}
        rows={2}
        value={(node[key] as string | undefined) ?? ""}
        required={false}
        {...(hint ? { hint } : {})}
        onChange={(value) => update(chosen.id, { [key]: value === "" ? undefined : value })}
      />
    ) : null;

  const wanted = addSearch.trim().toLowerCase();
  const matches = (label: string, hint?: string) =>
    !wanted || label.toLowerCase().includes(wanted) || (hint ?? "").toLowerCase().includes(wanted);
  const saveState = dirty
    ? state === "new" || state === "repository"
      ? "Not saved"
      : "Saving…"
    : savedAt
      ? `Draft saved ${Math.max(1, Math.round((Date.now() - savedAt) / 1000)) < 60 ? `${Math.max(1, Math.round((Date.now() - savedAt) / 1000))}s` : `${Math.round((Date.now() - savedAt) / 60000)}m`} ago`
      : STATE[state][1];

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-line border-b px-4 py-2.5 md:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Link
            to={`${link}/flows`}
            className="text-meta text-ink-subtle no-underline hover:text-ink"
          >
            Flows
          </Link>
          <span aria-hidden="true" className="text-ink-subtle">
            /
          </span>
          {opened ? (
            <h1 className="m-0 truncate font-mono text-base font-semibold">{path}</h1>
          ) : (
            <div className="w-56">
              <TextField
                name="path"
                label="Path"
                value={path}
                placeholder="orders/handle"
                onChange={setPath}
              />
            </div>
          )}
          {state === "repository" ? (
            <Tag tone="repository">From repository</Tag>
          ) : state === "deployed" && !dirty ? (
            <Tag tone="live">Deployed</Tag>
          ) : (
            <Tag tone="draft">Draft</Tag>
          )}
          {found.length > 0 ? (
            <span className="flex items-center gap-1 text-meta text-attention">
              <TriangleAlert aria-hidden="true" size={13} /> {found.length} to fix
            </span>
          ) : null}
          <span role="status" className="text-meta text-ink-subtle">
            {saveState}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            onClick={() => {
              const positions = autoLayout(flowNodes, flowEdges);
              setNodes((before) =>
                before.map((one) => ({ ...one, position: positions[one.id] ?? one.position })),
              );
              setDirty(true);
            }}
          >
            Tidy up
          </Button>
          {state === "draft" && !dirty && hasManual ? (
            <Button size="small" onClick={runDraft}>
              <Play aria-hidden="true" size={13} /> Run by hand
            </Button>
          ) : null}
          <Button
            size="small"
            variant={state === "draft" && !dirty ? "secondary" : "primary"}
            disabled={busy || (!dirty && state !== "new")}
            onClick={save}
          >
            Save draft
          </Button>
          {state === "draft" && !dirty ? (
            <Button size="small" variant="primary" onClick={() => navigate(`${link}/changes`)}>
              Review and deploy
            </Button>
          ) : null}
        </div>
      </header>
      {state === "repository" || problem || found.length > 0 ? (
        <div className="flex flex-col gap-2 px-4 pt-3 md:px-5">
          {state === "repository" ? (
            <Notice tone="attention">
              This flow is managed in the tenant's repository. Saving a draft of it takes it over.
            </Notice>
          ) : null}
          {problem ? <Notice tone="danger">{problem}</Notice> : null}
          {found.length > 0 ? (
            <Notice tone="attention">
              <ul className="m-0 pl-5">
                {found.map((one) => (
                  <li key={one}>{one}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-[28rem] flex-1 flex-col">
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            <Button
              variant="primary"
              size="small"
              aria-expanded={adding}
              onClick={() => setAdding((open) => !open)}
            >
              <Plus aria-hidden="true" size={14} /> Add step
            </Button>
            {adding ? (
              <aside
                aria-label="Steps to add"
                className="flex max-h-[60vh] w-64 flex-col gap-3 overflow-y-auto rounded-panel border border-line bg-raised p-3 shadow-xl"
              >
                <input
                  aria-label="Find a step"
                  placeholder="Find a step"
                  value={addSearch}
                  onChange={(event) => setAddSearch(event.target.value)}
                  className="h-8 rounded-control border border-line bg-structure px-2.5 text-ink outline-none placeholder:text-ink-subtle"
                />
                {[...new Set(PALETTE.map((entry) => entry.group))].map((group) => {
                  const shown = PALETTE.filter(
                    (entry) => entry.group === group && matches(entry.label, entry.hint),
                  );
                  return shown.length === 0 ? null : (
                    <div key={group} className="flex flex-col gap-0.5">
                      <p className="m-0 text-tag text-ink-subtle uppercase">{group}</p>
                      {shown.map((entry) => (
                        <button
                          key={entry.label}
                          type="button"
                          className="flex flex-col rounded-control px-2 py-1.5 text-left hover:bg-selected"
                          onClick={() => {
                            add(entry);
                            setAdding(false);
                          }}
                        >
                          <span>{entry.label}</span>
                          {entry.hint ? (
                            <span className="text-meta text-ink-subtle">{entry.hint}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  );
                })}
                {[...new Set(pickable.map((one) => one.category))].map((category) => {
                  const shown = pickable.filter(
                    (one) => one.category === category && matches(one.label, one.description),
                  );
                  return shown.length === 0 ? null : (
                    <div key={category} className="flex flex-col gap-0.5">
                      <p className="m-0 text-tag text-ink-subtle uppercase">{category}</p>
                      {shown.map((one) => (
                        <button
                          key={one.path}
                          type="button"
                          className="flex flex-col rounded-control px-2 py-1.5 text-left hover:bg-selected"
                          onClick={() => {
                            add({
                              base: (one.path.split("/").at(-1) ?? "step").replace(
                                /[^a-z0-9_]/g,
                                "_",
                              ),
                              make: () => ({ type: "script", script: one.path, inputs: {} }),
                            });
                            setAdding(false);
                          }}
                        >
                          <span>{one.label}</span>
                          {one.description ? (
                            <span className="truncate text-meta text-ink-subtle">
                              {one.description}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </aside>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 bg-sunken" data-testid="flow-canvas">
            <NodeNames.Provider value={names}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={(changes) => {
                  onNodesChange(changes);
                  if (
                    changes.some((change) => change.type === "position" || change.type === "remove")
                  )
                    setDirty(true);
                }}
                onEdgesChange={(changes) => {
                  onEdgesChange(changes);
                  if (changes.some((change) => change.type === "remove")) setDirty(true);
                }}
                onConnect={connect}
                onSelectionChange={({ nodes: picked }) => setSelected(picked[0]?.id)}
                onInit={setCanvas}
                fitView
                fitViewOptions={FIT}
                maxZoom={1.5}
                minZoom={0.2}
                proOptions={{ hideAttribution: false }}
                // The canvas takes its colors from the kit's tokens, so it follows the theme.
                style={CANVAS_COLORS}
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </NodeNames.Provider>
          </div>
        </div>
        <aside
          aria-label="The chosen step"
          className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-line border-t bg-surface p-4 lg:w-[22rem] lg:border-t-0 lg:border-l"
        >
          {chosen && node ? (
            <>
              <NameField key={chosen.id} id={chosen.id} rename={rename} />
              {node.type === "trigger" ? (
                <>
                  <SelectField
                    name="trigger"
                    label="It starts"
                    value={(node.trigger as { type: string }).type}
                    options={[
                      { value: "manual", label: "By hand, or from another flow" },
                      { value: "schedule", label: "On a schedule" },
                      { value: "event", label: "When an event is published" },
                      { value: "webhook", label: "When its address is called" },
                      { value: "form", label: "When someone fills in its form" },
                    ]}
                    onChange={(type) =>
                      update(chosen.id, {
                        trigger:
                          type === "schedule"
                            ? { type, cron: "0 8 * * *" }
                            : type === "event"
                              ? { type, event: "" }
                              : type === "form"
                                ? newForm()
                                : { type },
                      })
                    }
                  />
                  {(node.trigger as { type: string }).type === "webhook" ? (
                    <WebhookSettings
                      trigger={node.trigger as Parameters<typeof WebhookSettings>[0]["trigger"]}
                      sources={ofKind("trigger_source", "webhook")}
                      secrets={secretOptions}
                      onChange={(trigger) => update(chosen.id, { trigger })}
                    />
                  ) : null}
                  {(node.trigger as { type: string }).type === "form" ? (
                    <FormDesigner
                      trigger={node.trigger as Parameters<typeof FormDesigner>[0]["trigger"]}
                      onChange={(trigger) => update(chosen.id, { trigger })}
                    />
                  ) : null}
                  {(node.trigger as { type: string }).type === "schedule" ? (
                    <TextField
                      name="cron"
                      label="When, as a cron line"
                      value={(node.trigger as { cron?: string }).cron ?? ""}
                      hint="Minute, hour, day of month, month, day of week. 0 8 * * * is every day at 8."
                      onChange={(cron) =>
                        update(chosen.id, { trigger: { ...(node.trigger as object), cron } })
                      }
                    />
                  ) : null}
                  {(node.trigger as { type: string }).type === "schedule" &&
                  (ofKind("trigger_source", "poll").length > 0 ||
                    (node.trigger as { source?: string }).source) ? (
                    <ComboboxField
                      label="Trigger source (optional)"
                      options={ofKind("trigger_source", "poll")}
                      value={(node.trigger as { source?: string }).source || undefined}
                      hint="Each tick runs it, and the flow starts once for each thing it finds."
                      onChange={(source) => {
                        const { source: _was, ...rest } = node.trigger as { source?: string };
                        update(chosen.id, { trigger: source ? { ...rest, source } : rest });
                      }}
                    />
                  ) : null}
                  {(node.trigger as { type: string }).type === "event" ? (
                    <ComboboxField
                      label="Event"
                      options={eventOptions}
                      value={(node.trigger as { event?: string }).event || undefined}
                      onChange={(event) =>
                        update(chosen.id, {
                          trigger: { ...(node.trigger as object), event: event ?? "" },
                        })
                      }
                    />
                  ) : null}
                </>
              ) : null}
              {node.type === "script" && specs.has(String(node.script)) ? (
                <p className="m-0 text-[13px]">
                  <span className="font-semibold">{specs.get(String(node.script))?.label}</span>{" "}
                  <code className="font-mono text-[12px] text-ink-muted">
                    {String(node.script)}
                  </code>
                </p>
              ) : node.type === "script" || node.type === "foreach" ? (
                <ComboboxField
                  label="Script"
                  options={scriptOptions}
                  value={(node.script as string | undefined) || undefined}
                  onChange={(script) =>
                    update(chosen.id, {
                      script: script ?? (node.type === "foreach" ? undefined : ""),
                    })
                  }
                />
              ) : null}
              {node.type === "subflow" ? (
                <SelectField
                  name="which"
                  label="Which flow"
                  value={node.flowFrom === undefined ? "named" : "chosen"}
                  options={[
                    { value: "named", label: "Always the same one" },
                    { value: "chosen", label: "Chosen by the data, from a list" },
                  ]}
                  onChange={(which) =>
                    update(
                      chosen.id,
                      which === "chosen"
                        ? {
                            flow: undefined,
                            flowFrom: "trigger.flow",
                            allow: node.flow ? [node.flow as string] : [],
                          }
                        : {
                            flow: (node.allow as string[] | undefined)?.[0] ?? "",
                            flowFrom: undefined,
                            allow: undefined,
                          },
                    )
                  }
                />
              ) : null}
              {node.type === "subflow" && node.flowFrom !== undefined ? (
                <>
                  {expression(
                    "Expression that gives the flow's path",
                    "flowFrom",
                    "It must give one of the flows below, or the step fails.",
                  )}
                  <MultiSelectField
                    label="Flows it may start"
                    options={flowOptions}
                    value={(node.allow as string[] | undefined) ?? []}
                    hint="Nothing outside this list is ever started, whatever the data says."
                    onChange={(allow) => update(chosen.id, { allow })}
                  />
                </>
              ) : node.type === "subflow" || node.type === "foreach" ? (
                <ComboboxField
                  label={node.type === "foreach" ? "Or a flow" : "Flow"}
                  options={flowOptions}
                  value={(node.flow as string | undefined) || undefined}
                  onChange={(flow) =>
                    update(chosen.id, { flow: flow ?? (node.type === "foreach" ? undefined : "") })
                  }
                />
              ) : null}
              {node.type === "foreach"
                ? expression("Items", "items", "An expression that gives a list.")
                : null}
              {node.type === "foreach" ? (
                <CheckboxField
                  name="continueOnError"
                  label="Keep going when an item fails"
                  hint="A failed item gives { error: { message } } in the list, and the step still succeeds."
                  checked={node.continueOnError === true}
                  onChange={(checked) =>
                    update(chosen.id, { continueOnError: checked ? true : undefined })
                  }
                />
              ) : null}
              {node.type === "script" && specs.has(String(node.script)) ? (
                <NodeInputs
                  node={node}
                  spec={specs.get(String(node.script)) as PickableNode}
                  choices={pickChoices}
                  onChange={(change) => update(chosen.id, change)}
                />
              ) : node.type === "script" || node.type === "subflow" || node.type === "foreach" ? (
                expression(
                  "Input",
                  "input",
                  "An expression. trigger is what started the flow, steps.<name>.output what a step gave.",
                )
              ) : null}
              {node.type === "delay" ? (
                <NumberField
                  name="seconds"
                  label="Seconds to wait"
                  value={node.seconds as number}
                  min={1}
                  onChange={(seconds) => update(chosen.id, { seconds: seconds ?? 1 })}
                />
              ) : null}
              {node.type === "approval" ? (
                <>
                  <TextField
                    name="title"
                    label="What is being approved"
                    value={(node.title as string) ?? ""}
                    onChange={(title) => update(chosen.id, { title })}
                  />
                  {expression("Detail to show", "detail")}
                </>
              ) : null}
              {node.type === "fail"
                ? expression("Message", "message", "An expression that gives text.")
                : null}
              {node.type === "respond" ? (
                <RespondSettings
                  node={node}
                  onChange={(change) => update(chosen.id, change)}
                  headers={(values, onChange) => (
                    <ValuesEditor
                      legend="Headers"
                      add="Add a header"
                      values={values}
                      onChange={onChange}
                    />
                  )}
                />
              ) : null}
              {node.type === "branch" ? (
                <CasesEditor
                  cases={(node.cases as { name: string; when: string }[]) ?? []}
                  onChange={(cases) => update(chosen.id, { cases })}
                />
              ) : null}
              {node.type === "set" ? (
                <ValuesEditor
                  values={(node.values as Record<string, string>) ?? {}}
                  onChange={(values) => update(chosen.id, { values })}
                />
              ) : null}
              <div className="mt-auto">
                <Button
                  variant="danger"
                  onClick={async () => {
                    const sure = await ask.confirm({
                      title: `Remove ${chosen.id}?`,
                      text: "The edges into and out of it go too.",
                      action: "Remove",
                      danger: true,
                    });
                    if (sure) remove(chosen.id);
                  }}
                >
                  Remove this step
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <span aria-hidden="true" className="block h-0.5 w-5 bg-action" />
              <h2 className="m-0 text-title">About this flow</h2>
              <TextField
                name="description"
                label="What it does"
                value={description}
                required={false}
                onChange={(value) => {
                  setDescription(value);
                  setDirty(true);
                }}
              />
              <p className="m-0 text-meta text-ink-muted">
                Choose a step to change it. Add steps with Add step, and drag from the dot on a
                step's right edge to the next step. The red dot underneath is where it goes when it
                fails.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function NameField({ id, rename }: { id: string; rename: (from: string, to: string) => boolean }) {
  const [text, setText] = useState(id);
  const [error, setError] = useState<string>();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (text === id) return;
        if (rename(id, text)) setError(undefined);
        else {
          setError(
            "Lowercase letters, digits and underscores, starting with a letter, and not already used.",
          );
          notify.error(new Error("That name cannot be used."));
        }
      }}
    >
      <TextField
        name="id"
        label="Name"
        value={text}
        error={error}
        hint="Press Enter to rename. Expressions refer to a step by this name."
        onChange={setText}
      />
    </form>
  );
}

function CasesEditor({
  cases,
  onChange,
}: {
  cases: { name: string; when: string }[];
  onChange: (cases: { name: string; when: string }[]) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-[13px] font-medium">Cases, tried in order</legend>
      {cases.map((one, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a case has no identity but its place while its name is being typed
        <div key={index} className="flex flex-col gap-1 rounded-control border border-line p-2">
          <TextField
            name={`case-${index}`}
            label="Name"
            value={one.name}
            onChange={(name) =>
              onChange(cases.map((each, at) => (at === index ? { ...each, name } : each)))
            }
          />
          <TextField
            name={`when-${index}`}
            label="When"
            value={one.when}
            onChange={(when) =>
              onChange(cases.map((each, at) => (at === index ? { ...each, when } : each)))
            }
          />
          {cases.length > 1 ? (
            <div>
              <Button
                size="small"
                variant="danger"
                onClick={() => onChange(cases.filter((_, at) => at !== index))}
              >
                Remove case
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      <div>
        <Button
          size="small"
          onClick={() => onChange([...cases, { name: `case_${cases.length + 1}`, when: "true" }])}
        >
          Add a case
        </Button>
      </div>
      <p className="m-0 text-[12.5px] text-ink-muted">
        When no case holds, the flow leaves by “otherwise”.
      </p>
    </fieldset>
  );
}

function ValuesEditor({
  values,
  onChange,
  legend = "Values",
  add = "Add a value",
}: {
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  legend?: string;
  add?: string;
}) {
  const entries = Object.entries(values);
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-[13px] font-medium">{legend}</legend>
      {entries.map(([name, value], index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a value has no identity but its place while its name is being typed
        <div key={index} className="grid grid-cols-[1fr_1.4fr] gap-2">
          <TextField
            name={`name-${index}`}
            label="Name"
            value={name}
            onChange={(next) =>
              onChange(
                Object.fromEntries(
                  entries.map(([key, each], at) => [at === index ? next : key, each]),
                ),
              )
            }
          />
          <TextField
            name={`value-${index}`}
            label="Expression"
            value={value}
            onChange={(next) => onChange({ ...values, [name]: next })}
          />
        </div>
      ))}
      <div>
        <Button
          size="small"
          onClick={() => onChange({ ...values, [`value_${entries.length + 1}`]: "trigger" })}
        >
          {add}
        </Button>
      </div>
    </fieldset>
  );
}
