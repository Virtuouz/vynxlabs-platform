import { FORM_RESERVED_NAMES, RESPONSE_HEADERS_REFUSED } from "@volvel/manifest";
import {
  Appear,
  Button,
  CheckboxField,
  ComboboxField,
  ContextMenu,
  type MenuItem,
  MoveButtons,
  MultiSelectField,
  Notice,
  NumberField,
  type Option,
  SelectField,
  TextField,
  useFlip,
  useKeys,
} from "@volvel/ui";
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
  type Viewport,
} from "@xyflow/react";
import { ago } from "../kit/format.ts";
import { glide } from "../kit/motion.ts";
import "@xyflow/react/dist/style.css";
import { Play, Plus, Redo2, TriangleAlert, Undo2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify, takenText } from "../ask.tsx";
import { autoLayout, describe, type GraphEdge, type GraphNode } from "../FlowGraph.tsx";
import { type Clip, type ClipStep, copySteps, pasteSteps, readClip } from "../flowClipboard.ts";
import { renameInNode } from "../flowRename.ts";
import { DeployMenu } from "../kit/DeployMenu.tsx";
import { DraftClash } from "../kit/DraftClash.tsx";
import { putDraft } from "../kit/draftApi.ts";
import { useDraftSave } from "../kit/draftSave.ts";
import { useHistory } from "../kit/history.ts";
import { formatCombo, isTyping, keysOf, useShortcut } from "../kit/keys.ts";
import { Loading } from "../kit/LoadState.tsx";
import { PageHeader } from "../kit/PageHeader.tsx";
import { RemoveDraftButton } from "../kit/RemoveDraftButton.tsx";
import { retryAfter } from "../kit/retry.ts";
import { SplitPane } from "../kit/SplitPane.tsx";
import { type RunState, STATE_STROKE, StatePill, stateLabel, Tag } from "../kit/status.tsx";
import { navigate, useNavigationGuard, useUrlParam } from "../router.tsx";
import { outlineIcon } from "./builder/widgetIcons.ts";
import { ExpressionField, ExpressionPreview } from "./ExpressionField.tsx";
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
import { useFlowRunLive } from "./Flows.tsx";
import { FlowTestPanel, LastTest, stepsOf, took } from "./FlowTestPanel.tsx";
import { ResourceIdentity } from "./ResourceIdentity.tsx";
import { WhenFields } from "./ScheduleForm.tsx";
import { FLOW_STARTERS } from "./starters.ts";

/** A node as the flow's manifest holds it. */
type FlowNode = GraphNode & Record<string, unknown>;
interface FlowBody {
  description?: string;
  nodes: Record<string, FlowNode>;
  edges: GraphEdge[];
  layout?: Record<string, { x: number; y: number }>;
}
type CanvasNode = Node<{ id: string; node: FlowNode }>;

/** A step's icon in the palette, from the kit's set; a name the set lacks is a puzzle piece. */
function PaletteIcon({ name }: { name: string }) {
  const Icon = outlineIcon(name);
  return <Icon size={14} aria-hidden className="shrink-0 text-ink-muted" />;
}

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
    make: () => ({ type: "foreach", items: "trigger.items" }),
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
/** What each node did in the test being shown, by node. */
export const NodeRuns = createContext<ReadonlyMap<string, { state: RunState; took?: string }>>(
  new Map(),
);

function FlowNodeCard({ data, selected }: NodeProps<CanvasNode>) {
  const { id, node } = data;
  const out = outputs(node);
  const named = useContext(NodeNames).get(String(node.script ?? ""));
  const ran = useContext(NodeRuns).get(id);
  return (
    <div
      className={`w-52 rounded-control border bg-surface px-3 py-2 [.dragging_&]:shadow-drag ${
        selected ? "border-action ring-2 ring-action/30" : "border-line"
      } ${ran ? "border-2" : ""} ${node.type === "trigger" ? "rounded-full px-5" : ""}`}
      style={ran && !selected ? { borderColor: STATE_STROKE[ran.state] } : undefined}
    >
      {node.type === "trigger" ? null : <Handle type="target" position={Position.Left} />}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-code font-semibold">{id}</span>
        <Tag>{node.type}</Tag>
      </div>
      <div className="truncate text-meta text-ink-muted">{named ?? describe(node)}</div>
      {ran ? (
        <div className="mt-1 text-meta">
          <StatePill state={ran.state} detail={ran.took} />
        </div>
      ) : null}
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
/** "1 step", "3 steps". */
const plural = (count: number) => `${count} step${count === 1 ? "" : "s"}`;

/** Where a flow's canvas was left, for this browser tab's session. */
function viewportOf(path: string | undefined): Viewport | undefined {
  if (!path) return undefined;
  try {
    const kept = JSON.parse(sessionStorage.getItem(`vx-viewport:${path}`) ?? "null");
    return kept && Number.isFinite(kept.x) && Number.isFinite(kept.y) && Number.isFinite(kept.zoom)
      ? kept
      : undefined;
  } catch {
    return undefined;
  }
}
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

/**
 * Where a new step goes, and the edges once it is in: after the step `after`,
 * to its right and clear of any other, joined to it and taking over where it
 * went next. With nothing to follow, to the right of everything, unjoined.
 */
export function insertAfter(
  nodes: { id: string; position: { x: number; y: number } }[],
  edges: Edge[],
  after: string | undefined,
  id: string,
  /** The new step, which says where a connection onward leaves it. */
  made?: FlowNode,
): { position: { x: number; y: number }; edges: Edge[] } {
  const from = nodes.find((node) => node.id === after);
  const last = nodes.reduce<(typeof nodes)[number] | undefined>(
    (furthest, node) => (!furthest || node.position.x > furthest.position.x ? node : furthest),
    undefined,
  );
  const position = from
    ? { x: from.position.x + 280, y: from.position.y }
    : { x: (last?.position.x ?? -280) + 280, y: last?.position.y ?? 0 };
  while (
    nodes.some(
      (node) =>
        Math.abs(node.position.x - position.x) < 200 && Math.abs(node.position.y - position.y) < 90,
    )
  ) {
    position.y += 120;
  }
  if (!from) return { position, edges };
  const onward = (edge: Edge) =>
    edge.source === from.id && (edge.sourceHandle ?? "next") === "next";
  // Where the new step goes on: its "next", the first case of a branch, or nowhere (a fail step).
  const leaves = made ? outputs(made).find((output) => output.id !== "error")?.id : "next";
  const handed = (edge: Edge): Edge[] => {
    if (!onward(edge)) return [edge];
    if (!leaves) return [];
    const label = leaves.startsWith("case:") ? { label: leaves.slice(5) } : {};
    return [{ ...edge, id: `${id}->${edge.target}`, source: id, sourceHandle: leaves, ...label }];
  };
  return {
    position,
    edges: [
      ...edges.flatMap(handed),
      { id: `${from.id}->${id}`, source: from.id, target: id, sourceHandle: "next" },
    ],
  };
}

/**
 * The edges that still lead somewhere after a branch's cases changed: a case that
 * was renamed keeps its connection under the new name, and a case that is gone
 * takes its connection with it.
 */
export function followCases(
  edges: Edge[],
  branch: string,
  cases: { name: string }[],
  renamed?: { from: string; to: string },
): Edge[] {
  const named = new Set([...cases.map((one) => one.name), OTHERWISE]);
  return edges.flatMap((edge) => {
    if (edge.source !== branch || !edge.sourceHandle?.startsWith("case:")) return [edge];
    const was = edge.sourceHandle.slice(5);
    const now = renamed && was === renamed.from ? renamed.to : was;
    if (!named.has(now)) return [];
    return now === was ? [edge] : [{ ...edge, sourceHandle: `case:${now}`, label: now }];
  });
}

/** Whether a step is a start with an address of its own, and no key to keep it by yet. */
export const keepsAddress = (node: FlowNode): boolean => {
  if (node.type !== "trigger" || node.key) return false;
  const type = (node.trigger as { type?: string } | undefined)?.type;
  return type === "webhook" || type === "form";
};

/** The ids that were added from the palette, with a step's new name added when it is renamed. */
export const carryName = (ids: ReadonlySet<string>, from: string, to: string): Set<string> =>
  new Set(ids.has(from) ? [...ids, to] : ids);

/** One thing wrong with a flow: what, and which step and field it is in, to go to it. */
export interface Problem {
  message: string;
  node?: string;
  /** The inspector field it is about: `script`, `title`, `inputs/<name>`… */
  field?: string;
}

/** What is wrong with a flow that can be seen without asking the server, as words. */
export const problemsOf = (...args: Parameters<typeof problemsAt>): string[] =>
  problemsAt(...args).map((one) => one.message);

/** What is wrong with a flow that can be seen without asking the server, each with its place. */
export function problemsAt(
  nodes: Record<string, FlowNode>,
  edges: GraphEdge[],
  /** The scripts that are nodes with a form of their own, by path. */
  specs: ReadonlyMap<string, PickableNode> = new Map(),
): Problem[] {
  const problems: Problem[] = [];
  const ids = Object.keys(nodes);
  const answers = ids.some((id) => nodes[id]?.type === "respond");
  if (!ids.some((id) => nodes[id]?.type === "trigger"))
    problems.push({ message: "Add a way for the flow to start." });
  const reached = new Set(edges.map((edge) => edge.to));
  for (const edge of edges) {
    const from = nodes[edge.from];
    if (!from) continue;
    if (from.type === "fail") {
      problems.push({
        message: `${edge.from} ends the flow, so nothing can follow it.`,
        node: edge.from,
      });
    } else if (from.type === "branch") {
      const cases = ((from.cases as { name: string }[] | undefined) ?? []).map((one) => one.name);
      if (edge.output === undefined && !edge.error) {
        problems.push({
          message: `A connection leaves ${edge.from} to ${edge.to} without saying which case it follows.`,
          node: edge.from,
        });
      } else if (
        edge.output !== undefined &&
        edge.output !== OTHERWISE &&
        !cases.includes(edge.output)
      ) {
        problems.push({
          message: `${edge.from} has no case "${edge.output}", and a connection leaves by it to ${edge.to}.`,
          node: edge.from,
        });
      }
    }
  }
  for (const id of ids) {
    const node = nodes[id] as FlowNode;
    if (node.type === "branch") {
      const names = ((node.cases as { name: string }[] | undefined) ?? []).map((one) => one.name);
      if (new Set(names).size !== names.length || names.includes(OTHERWISE)) {
        problems.push({
          message: `${id} needs a different name for each case, and "${OTHERWISE}" is taken.`,
          node: id,
          field: "cases",
        });
      }
    }
    if (node.type !== "trigger" && !reached.has(id))
      problems.push({ message: `Nothing leads to ${id}.`, node: id });
    if (node.type === "script" && !node.script)
      problems.push({ message: `${id} has no script chosen.`, node: id, field: "script" });
    const spec = node.type === "script" ? specs.get(String(node.script)) : undefined;
    for (const missing of spec ? missingInputs(spec, node) : []) {
      problems.push({ message: `${id} needs: ${missing}.`, node: id, field: "inputs" });
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
        problems.push({
          message: `${id} waits for the flow to answer. Add an Answer step.`,
          node: id,
        });
      }
      if (trigger.type === "webhook" && trigger.verify && !trigger.verify.secret) {
        problems.push({
          message: `${id} checks a signature and has no secret chosen.`,
          node: id,
          field: "secret",
        });
      }
      if (trigger.type === "form") {
        if (!trigger.title)
          problems.push({ message: `${id} needs a title for its form.`, node: id, field: "title" });
        const names = (trigger.fields ?? []).map((field) => field.name);
        if (new Set(names).size !== names.length || names.some((name) => !NODE_ID.test(name))) {
          problems.push({
            message: `${id} needs a different name for each question, in lowercase letters.`,
            node: id,
            field: "fields",
          });
        }
        for (const field of trigger.fields ?? []) {
          if (FORM_RESERVED_NAMES.includes(field.name))
            problems.push({
              message: `${id} has a question called "${field.name}", which is kept for the form itself. Choose another name.`,
              node: id,
              field: "fields",
            });
          if (!field.label)
            problems.push({
              message: `${id} has a question with no text.`,
              node: id,
              field: "fields",
            });
          if (field.type === "select" && (field.options ?? []).length === 0) {
            problems.push({
              message: `${id} has a list with nothing in it: ${field.label}.`,
              node: id,
              field: "fields",
            });
          }
        }
      }
    }
    if (node.type === "subflow" && node.flowFrom === undefined && !node.flow) {
      problems.push({ message: `${id} has no flow chosen.`, node: id, field: "flow" });
    }
    if ((node.type === "subflow" || node.type === "foreach") && node.flowFrom !== undefined) {
      if (!node.flowFrom)
        problems.push({
          message: `${id} needs an expression that gives the flow to start.`,
          node: id,
          field: "flowFrom",
        });
      if (((node.allow as string[] | undefined) ?? []).length === 0) {
        problems.push({
          message: `${id} needs at least one flow it may start.`,
          node: id,
          field: "allow",
        });
      }
    }
    // A field a step needs, left empty: the draft keeps it, and it is said here, and at deploy.
    const empty = (value: unknown) => typeof value !== "string" || value.trim() === "";
    if (node.type === "approval" && empty(node.title))
      problems.push({ message: `${id} needs a title for the approval.`, node: id, field: "title" });
    if (node.type === "fail" && empty(node.message))
      problems.push({ message: `${id} needs a message to fail with.`, node: id, field: "message" });
    if (
      node.type === "branch" &&
      ((node.cases as { when?: unknown }[] | undefined) ?? []).some((one) => empty(one.when))
    )
      problems.push({
        message: `${id} has a case with no condition.`,
        node: id,
        field: "cases",
      });
    if (
      node.type === "set" &&
      Object.values((node.values as Record<string, unknown> | undefined) ?? {}).some(empty)
    )
      problems.push({
        message: `${id} has a value with no expression.`,
        node: id,
        field: "values",
      });
    if (node.type === "foreach" && empty(node.items))
      problems.push({
        message: `${id} needs an expression that gives the items to go through.`,
        node: id,
        field: "items",
      });
    if (node.type === "foreach" && !node.script && !node.flow && node.flowFrom === undefined)
      problems.push({
        message: `${id} needs a script or a flow to run for each item.`,
        node: id,
        field: "script",
      });
    if (
      node.type === "trigger" &&
      (node.trigger as { type: string; event?: string }).type === "event" &&
      !(node.trigger as { event?: string }).event
    ) {
      problems.push({ message: `${id} has no event chosen.`, node: id, field: "event" });
    }
  }
  return problems;
}

/** A flow drawn on a canvas. Saving makes a draft, deployed from the Releases screen. */
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
  // The chosen step is in the address: a reload, or a link, opens the flow on it.
  const [selected, setSelected] = useUrlParam("step");
  // Until the flow is drawn with that step chosen, the canvas's own "nothing chosen" is not news.
  const restoring = useRef(true);
  // Where the canvas was left this session, read once per flow.
  const kept = useMemo(() => viewportOf(path), [path]);
  const [canvas, setCanvas] = useState<ReactFlowInstance<CanvasNode, Edge>>();
  const [state, setState] = useState<"new" | "draft" | "deployed" | "repository" | "removed">(
    "new",
  );
  const [loaded, setLoaded] = useState(false);
  const [starterId, setStarterId] = useState("blank");
  const [testing, setTesting] = useState(false);
  const [testRunId, setTestRunId] = useState<string>();
  /** The steps added here from the palette: a schedule among them takes the workspace's zone. */
  const addedIds = useRef(new Set<string>());
  const [testTrigger, setTestTrigger] = useState<string>();
  const [testAll, setTestAll] = useState(false);
  const [editedSinceTest, setEditedSinceTest] = useState(false);
  const live = useFlowRunLive(root, testRunId);
  const [problem, setProblem] = useState<string>();
  const [pathTaken, setPathTaken] = useState<string>();
  // The path this editor saved a new flow as. Opening it again would reload what is on screen.
  const savedAs = useRef<string>(undefined);
  // Autosaves that failed in a row, and whether they have been given up until asked again.
  const failures = useRef(0);
  const [gaveUp, setGaveUp] = useState(false);
  // Counted up to read the flow again, as when someone else's version is loaded.
  const [again, setAgain] = useState(0);
  const [savedAt, setSavedAt] = useState<number>();
  // What a save sends is read from the newest render when it goes out, so that a change made
  // while one is in flight is in the next. The hook counts the changes and sends again.
  const toSend = useRef<() => FlowBody>(() => ({ nodes: {}, edges: [] }));
  const draft = useDraftSave<null, { revision: number }>({
    send: (_snapshot, at) =>
      putDraft<{ revision: number }>(
        root,
        pathNow.current,
        {
          kind: "flow",
          schemaVersion: 1,
          body: toSend.current() as unknown as Record<string, unknown>,
        },
        // A new flow is a create: a path that is taken is refused, never overwritten.
        at ? { revision: at } : opened ? { first: true } : { create: true },
      ),
    applied: (_saved, _sent, _current) => {
      setState("draft");
      setSavedAt(Date.now());
      drafts.reload();
      if (!opened && savedAs.current !== pathNow.current) {
        savedAs.current = pathNow.current;
        navigate(`${link}/flows/edit/${pathNow.current}`, { replace: true });
      }
    },
    failed: (error) => {
      const refused = takenText(error);
      if (refused) setPathTaken(refused);
      else setProblem(failureText(error));
    },
  });
  const { dirty } = draft;
  const busy = draft.saving;
  const pathNow = useRef(path);
  pathNow.current = path;
  const [adding, setAdding] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [, setTick] = useState(0);
  const scripts = useLoad<{
    items: {
      path: string;
      description: string;
      inputSchema: PickableNode["input"];
      node: { label: string; icon?: string; category?: string; takes?: string[] } | null;
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
  /**
   * Every script a step can run, each with a form for its input: the platform's,
   * the workspace's labelled ones, then the rest by their path. A plain script's
   * form is drawn from its input schema.
   */
  const pickable = useMemo<PickableNode[]>(
    () => [
      ...(core.data?.items ?? []),
      ...(scripts.data?.items ?? [])
        .filter((one) => !one.path.startsWith("core/"))
        .map((one) => ({
          path: one.path,
          label: one.node?.label ?? one.path,
          ...(one.node?.icon ? { icon: one.node.icon } : {}),
          category: one.node?.category ?? (one.node ? "This workspace's" : "Scripts"),
          description: one.description,
          takes: one.node?.takes ?? [],
          input: one.inputSchema,
        })),
    ],
    [core.data, scripts.data],
  );
  const specs = useMemo(() => new Map(pickable.map((one) => [one.path, one])), [pickable]);
  const names = useMemo(() => new Map(pickable.map((one) => [one.path, one.label])), [pickable]);

  /** A change to the graph: saved a moment later, and no longer what the last test ran. */
  const touch = () => {
    draft.edit(null);
    setEditedSinceTest(true);
  };
  // What is undone is the graph and the description: never what is selected.
  const history = useHistory(
    () => ({
      nodes: nodes.map(({ selected: _s, dragging: _d, measured: _m, ...rest }) => rest),
      edges: edges.map(({ selected: _s, ...rest }) => rest),
      description,
    }),
    (back) => {
      // The chosen step stays chosen, when it is still there.
      const kept = back.nodes.some((one) => one.id === selected) ? selected : undefined;
      setNodes(back.nodes.map((one) => ({ ...one, selected: one.id === kept })) as CanvasNode[]);
      setEdges(back.edges);
      setDescription(back.description);
      setSelected(kept);
      touch();
    },
  );
  const { clear: clearHistory, undo, redo } = history;
  // The toast outlives the render that made it: Undo reaches the one that is current.
  const undoRef = useRef(undo);
  undoRef.current = undo;

  const open = useCallback(
    (body: FlowBody) => {
      clearHistory();
      const positions = { ...autoLayout(body.nodes, body.edges), ...(body.layout ?? {}) };
      addedIds.current = new Set();
      setDescription(body.description ?? "");
      const chosenInAddress = new URLSearchParams(location.search).get("step");
      setNodes(
        Object.entries(body.nodes).map(([id, node]) => ({
          id,
          type: "flow",
          position: positions[id] ?? { x: 0, y: 0 },
          data: { id, node },
          ...(id === chosenInAddress ? { selected: true } : {}),
        })),
      );
      setTimeout(() => {
        restoring.current = false;
      });
      setEdges(body.edges.map(toCanvasEdge));
      setLoaded(true);
    },
    [setNodes, setEdges, clearHistory],
  );

  useEffect(() => {
    let current = true;
    if (!opened) {
      open({ nodes: { start: { type: "trigger", trigger: { type: "manual" } } }, edges: [] });
      return;
    }
    if (opened === savedAs.current && again === 0) return;
    (async () => {
      try {
        const found = await api.get<{ body: FlowBody; revision: number; deleted?: boolean }>(
          `${root}/drafts/${opened}`,
        );
        if (!current) return;
        if (found.deleted) {
          // A draft that removes it holds no steps: what is shown is what is deployed, and
          // nothing is saved from here, so the removal is never undone by an autosave.
          const resource = await api.get<{ body: FlowBody }>(`${root}/resources/${opened}`);
          if (!current) return;
          open(resource.body);
          draft.reset(null, found.revision);
          setState("removed");
          return;
        }
        open(found.body);
        draft.reset(null, found.revision);
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
  }, [root, opened, open, draft.reset, again]);

  const flowNodes = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node.data.node])),
    [nodes],
  );
  const flowEdges = useMemo(() => edges.map(toFlowEdge), [edges]);
  const found = useMemo(
    () => problemsAt(flowNodes, flowEdges, specs),
    [flowNodes, flowEdges, specs],
  );
  const chosen = nodes.find((node) => node.id === selected);

  const add = (entry: { base: string; make: () => FlowNode }) => {
    let id = entry.base;
    for (let n = 2; nodes.some((node) => node.id === id); n++) id = `${entry.base}_${n}`;
    history.record(`Add ${id}`);
    const made = entry.make();
    addedIds.current = new Set([...addedIds.current, id]);
    // After the chosen step, joined to it, taking over where it went next. A trigger,
    // or a step added with nothing chosen, goes to the right of everything.
    // Joined only after a step that goes on to one next step: a branch goes on by its
    // cases, and a fail step goes nowhere, so a step added after them stands apart.
    const before = nodes.find((node) => node.id === selected)?.data.node;
    const joinable =
      made.type !== "trigger" &&
      before !== undefined &&
      outputs(before).some((output) => output.id === "next");
    const placed = insertAfter(nodes, edges, joinable ? selected : undefined, id, made);
    const at = placed.position;
    setNodes((before) => [
      // The new step is the chosen one, on the canvas as in the panel beside it.
      ...before.map((node) => ({ ...node, selected: false })),
      { id, type: "flow", selected: true, position: at, data: { id, node: made } },
    ]);
    setEdges(placed.edges);
    setSelected(id);
    touch();
    // Brought into view where it is, at the same zoom: the rest of the graph stays put.
    setTimeout(() => {
      if (!canvas) return;
      canvas.setCenter(at.x + 90, at.y + 30, { zoom: canvas.getZoom(), duration: glide(200) });
    }, 50);
  };
  const update = (id: string, change: Partial<FlowNode>) => {
    history.record(`Change ${id}`, `${id}:${Object.keys(change).sort().join(",")}`);
    setNodes((before) =>
      before.map((node) =>
        node.id === id
          ? { ...node, data: { id, node: { ...node.data.node, ...change } as FlowNode } }
          : node,
      ),
    );
    touch();
  };
  const rename = (from: string, to: string) => {
    if (!NODE_ID.test(to) || nodes.some((node) => node.id === to)) return false;
    history.record(`Rename ${from}`);
    // Every expression that reads the step reads it by its new name.
    let updated = 0;
    let addressKept = false;
    const renamed = nodes.map((node) => {
      const { node: changed, count } = renameInNode(
        node.data.node as unknown as Record<string, unknown>,
        from,
        to,
      );
      updated += count;
      const id = node.id === from ? to : node.id;
      const start = node.data.node;
      // A start with an address keeps it through the rename: the old name becomes its key.
      const keeps = node.id === from && keepsAddress(start) && state !== "new";
      if (keeps) addressKept = true;
      return {
        ...node,
        id,
        data: {
          id,
          node: (keeps ? { ...changed, key: from } : changed) as unknown as FlowNode,
        },
      };
    });
    setNodes(renamed);
    addedIds.current = carryName(addedIds.current, from, to);
    if (updated > 0) {
      notify.success(
        `Renamed ${from} to ${to}, and updated ${updated} reference${updated === 1 ? "" : "s"} to it.${
          addressKept ? ` Its address stays: the step keeps the key ${from}.` : ""
        }`,
      );
    } else if (addressKept) {
      notify.success(
        `Renamed ${from} to ${to}. Its address stays: the step keeps the key ${from}.`,
      );
    }
    setEdges((before) =>
      before.map((edge) => ({
        ...edge,
        source: edge.source === from ? to : edge.source,
        target: edge.target === from ? to : edge.target,
      })),
    );
    setSelected(to);
    touch();
    return true;
  };
  /** Removing a step never asks: the message says what went, and offers Undo (D34). */
  const saidRemoved = (what: string) =>
    notify.info(`Removed ${what}. Its connections went with it.`, {
      action: { label: "Undo", onClick: () => undoRef.current() },
    });
  const remove = (id: string) => {
    history.record(`Remove ${id}`);
    setNodes((before) => before.filter((node) => node.id !== id));
    setEdges((before) => before.filter((edge) => edge.source !== id && edge.target !== id));
    setSelected(undefined);
    touch();
    saidRemoved(id);
  };
  /** The steps chosen on the canvas: several with ⌘-click or a box, or the one chosen. */
  const chosenIds = (): string[] => {
    const picked = nodes.filter((node) => node.selected).map((node) => node.id);
    return picked.length > 0 ? picked : selected ? [selected] : [];
  };
  const clipOf = (ids: string[]) =>
    copySteps(
      nodes.map((node) => ({
        id: node.id,
        position: node.position,
        node: node.data.node as unknown as ClipStep["node"],
      })),
      edges.map(toFlowEdge),
      new Set(ids),
    );
  /** Adds steps from a clip, renamed where their names are taken, chosen, one step to undo. */
  const pasteClip = (clip: Clip, offset = { x: 40, y: 40 }) => {
    history.record(`Paste ${plural(clip.steps.length)}`);
    const pasted = pasteSteps(
      clip,
      nodes.map((node) => node.id),
      offset,
    );
    setNodes((before) => [
      ...before.map((node) => ({ ...node, selected: false })),
      ...pasted.steps.map((step) => ({
        id: step.id,
        type: "flow" as const,
        selected: true,
        position: step.position,
        data: { id: step.id, node: step.node as unknown as FlowNode },
      })),
    ]);
    setEdges((before) => [
      ...before,
      ...pasted.edges.map((edge, index) => toCanvasEdge(edge, before.length + index)),
    ]);
    setSelected(pasted.steps[0]?.id);
    touch();
    const changed = Object.entries(pasted.renamed).filter(([from, to]) => from !== to);
    notify.success(
      changed.length > 0
        ? `${plural(pasted.steps.length)} added. Named ${changed.map(([, to]) => to).join(", ")}, as the names were taken.`
        : `${plural(pasted.steps.length)} added.`,
    );
  };
  const duplicate = (ids: string[]) => {
    if (ids.length === 0) return false;
    pasteClip(clipOf(ids));
  };
  const removeMany = (ids: string[], say = true) => {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    history.record(`Remove ${plural(ids.length)}`);
    setNodes((before) => before.filter((node) => !gone.has(node.id)));
    setEdges((before) => before.filter((edge) => !gone.has(edge.source) && !gone.has(edge.target)));
    setSelected(undefined);
    touch();
    if (say) saidRemoved(ids.length === 1 ? (ids[0] as string) : plural(ids.length));
  };
  // ⌘C, ⌘X and ⌘V copy, cut and paste steps, within a flow or between flows. They are the
  // browser's own copy and paste, so a field being typed in, or text chosen on the page,
  // keeps them; only chosen steps on the canvas are copied as steps.
  const clipboard = useRef({ chosenIds, clipOf, pasteClip, removeMany });
  clipboard.current = { chosenIds, clipOf, pasteClip, removeMany };
  useEffect(() => {
    const forSteps = () =>
      !isTyping(document.activeElement) &&
      !document.querySelector('[role="dialog"], [role="menu"]') &&
      !(window.getSelection()?.toString() ?? "");
    const copy = (event: ClipboardEvent, cut: boolean) => {
      if (!forSteps()) return;
      const ids = clipboard.current.chosenIds();
      if (ids.length === 0 || !event.clipboardData) return;
      event.clipboardData.setData("text/plain", JSON.stringify(clipboard.current.clipOf(ids)));
      event.preventDefault();
      if (cut) clipboard.current.removeMany(ids, false);
      notify.success(
        `${plural(ids.length)} ${cut ? "cut" : "copied"}. Paste them here or in another flow.`,
      );
    };
    const onCopy = (event: ClipboardEvent) => copy(event, false);
    const onCut = (event: ClipboardEvent) => copy(event, true);
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(document.activeElement) || document.querySelector('[role="dialog"]')) return;
      const clip = readClip(event.clipboardData?.getData("text/plain") ?? "");
      if (!clip) return;
      event.preventDefault();
      clipboard.current.pasteClip(clip);
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, []);
  useShortcut("flow.duplicate", () => duplicate(chosenIds()));
  /** What a right-click on the canvas was on: a step, or the canvas itself. */
  const [menuOn, setMenuOn] = useState<string>();
  const menuItems = (): MenuItem[] => {
    const step = menuOn;
    if (step) {
      const ids = chosenIds().includes(step) ? chosenIds() : [step];
      const many = ids.length > 1;
      return [
        {
          label: many ? `Duplicate ${plural(ids.length)}` : "Duplicate",
          keys: keysOf("flow.duplicate"),
          onSelect: () => duplicate(ids),
        },
        {
          label: many ? `Copy ${plural(ids.length)}` : "Copy",
          keys: formatCombo("Mod+C"),
          onSelect: () => {
            void navigator.clipboard
              ?.writeText(JSON.stringify(clipOf(ids)))
              .then(() => notify.success(`${plural(ids.length)} copied.`), notify.error);
          },
        },
        ...(many
          ? []
          : [
              {
                label: "Rename…",
                onSelect: async () => {
                  const to = await ask.prompt({
                    title: `Rename ${step}`,
                    label: "Name",
                    hint: "Lowercase letters, digits and _, starting with a letter. References to it follow.",
                    initial: step,
                    action: "Rename",
                  });
                  if (to && to !== step && !rename(step, to)) {
                    notify.error(
                      new Error(`${to} is not a name a step can have here, or it is taken.`),
                    );
                  }
                },
              },
            ]),
        {
          label: many ? `Remove ${plural(ids.length)}` : "Remove",
          danger: true,
          separated: true,
          keys: "⌫",
          onSelect: () => removeMany(ids),
        },
      ];
    }
    return [
      {
        label: "Paste",
        keys: formatCombo("Mod+V"),
        onSelect: () => {
          void navigator.clipboard?.readText().then((text) => {
            const clip = readClip(text);
            if (clip) pasteClip(clip);
            else notify.info("The clipboard holds no steps. Copy steps from a flow first.");
          }, notify.error);
        },
      },
      {
        label: "Select every step",
        onSelect: () => setNodes((before) => before.map((node) => ({ ...node, selected: true }))),
      },
      { label: "Fit the flow in view", onSelect: () => canvas?.fitView(FIT) },
    ];
  };
  const connect = (connection: Connection) => {
    if (connection.source === connection.target) return;
    history.record("Connect steps");
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
    touch();
  };

  /** Takes away what leaves `source` by `handle`: to `target`, or to anything. */
  const disconnect = (source: string, handle: string, target?: string) => {
    history.record("Remove a connection");
    setEdges((before) =>
      before.filter(
        (edge) =>
          !(
            edge.source === source &&
            (edge.sourceHandle ?? "next") === handle &&
            (target === undefined || edge.target === target)
          ),
      ),
    );
    touch();
  };
  const inspector = useRef<HTMLElement>(null);
  /** Chooses the step a problem is in and puts the cursor in the field it is about. */
  const goToProblem = (problem: Problem) => {
    if (!problem.node) return;
    choose(problem.node);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const panel = inspector.current;
        if (!panel) return;
        const field =
          (problem.field &&
            panel.querySelector<HTMLElement>(
              `[name="${problem.field}"], [name^="${problem.field}"], [data-field="${problem.field}"] input, [data-field="${problem.field}"] button`,
            )) ||
          panel.querySelector<HTMLElement>(
            "input:not([type=hidden]), select, textarea, button[role=combobox]",
          );
        field?.focus();
      }),
    );
  };
  /** Chooses a step from outside the canvas, and brings it into view. */
  const choose = (id: string) => {
    setSelected(id);
    setNodes((before) =>
      before.map((node) =>
        Boolean(node.selected) === (node.id === id) ? node : { ...node, selected: node.id === id },
      ),
    );
    canvas?.fitView({ nodes: [{ id }], maxZoom: 1, padding: 0.6, duration: glide(200) });
  };

  toSend.current = () => ({
    ...(description ? { description } : {}),
    nodes: flowNodes,
    edges: flowEdges,
    layout: Object.fromEntries(
      nodes.map((node) => [
        node.id,
        { x: Math.round(node.position.x), y: Math.round(node.position.y) },
      ]),
    ),
  });
  const save = async (): Promise<boolean> => {
    if (state === "removed") return false;
    setProblem(undefined);
    setPathTaken(undefined);
    if (!PATH.test(path)) {
      setProblem(
        "Give the flow a path: lowercase letters, digits, hyphens and underscores, in folders. For example orders/handle.",
      );
      return false;
    }
    return draft.save(state === "new");
  };

  // A flow already saved once is saved again a moment after each change, as the app builder
  // does. One that fails is tried again, waiting longer each time, and given up after five
  // tries until the next change or Retry, so that a lost connection is said, not hidden.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `save` reads the latest state when it runs
  useEffect(() => {
    if (
      !dirty ||
      busy ||
      gaveUp ||
      state === "new" ||
      state === "repository" ||
      state === "removed"
    )
      return;
    const wait = failures.current === 0 ? 1500 : retryAfter(failures.current);
    const timer = setTimeout(async () => {
      if (await save()) {
        failures.current = 0;
        return;
      }
      failures.current += 1;
      if (failures.current >= 5) setGaveUp(true);
    }, wait);
    return () => clearTimeout(timer);
  }, [dirty, busy, gaveUp, state, nodes, edges, description]);
  // A change after giving up is worth trying again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change is the reason to try again
  useEffect(() => {
    setGaveUp(false);
  }, [nodes, edges, description]);
  useNavigationGuard(
    dirty,
    `Your changes to ${path || "this new flow"} are not saved. Leave anyway?`,
  );
  // "Saved 12s ago" moves on by itself.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(timer);
  }, []);
  // A test starts at any of the flow's triggers: the manual one when there is one.
  const triggerNodes = nodes.filter((one) => one.data.node.type === "trigger");
  const triggerOf = (id: string | undefined) =>
    triggerNodes.find((one) => one.id === id)?.data.node as
      | { type: string; trigger?: { type?: string; input?: Record<string, unknown> } }
      | undefined;
  const manualId = triggerNodes.find(
    (one) => (one.data.node as { trigger?: { type?: string } }).trigger?.type === "manual",
  )?.id;
  const testFromTrigger =
    testTrigger && triggerNodes.some((one) => one.id === testTrigger)
      ? testTrigger
      : (manualId ?? triggerNodes[0]?.id);
  const chosenTrigger = triggerOf(testFromTrigger);
  // Errors are the form's to show, by field. The test runs what is saved, so a change is saved first.
  const runTest = async (input: unknown) => {
    if (dirty && !(await save())) throw new Error("The draft could not be saved. See above.");
    const started = await api.post<{ runId: string }>(`${root}/test-runs`, {
      flow: path,
      input,
      ...(testFromTrigger && testFromTrigger !== manualId ? { triggerNode: testFromTrigger } : {}),
      ...(testAll ? { withAllDrafts: true } : {}),
    });
    setTestRunId(started.runId);
    setEditedSinceTest(false);
  };
  /** Tests again from one step, keeping what came before it in the last test. */
  const testFrom = async (node: string) => {
    if (!live.run) return;
    if (dirty && !(await save())) return;
    try {
      const started = await api.post<{ runId: string }>(`${root}/test-runs`, {
        flow: path,
        testFrom: { flowRunId: live.run.id, node },
        ...(testAll ? { withAllDrafts: true } : {}),
      });
      setTestRunId(started.runId);
      setEditedSinceTest(false);
      setTesting(true);
    } catch (error) {
      notify.error(error);
    }
  };
  const testBlocked =
    triggerNodes.length === 0
      ? "Add a trigger: a test starts where the flow would."
      : state === "new"
        ? "Save the flow first."
        : undefined;
  // ⌘Z undoes, ⇧⌘Z and Ctrl+Y redo, except while typing in a field, which keeps its own.
  useShortcut("undo", undo);
  useShortcut("redo", redo);
  // ⌘S saves now, rather than a moment after the last change.
  useShortcut("save", () => {
    if (state !== "repository") void save();
  });
  const shown = testing ? live.run : undefined;
  const nodeRuns = useMemo(
    () =>
      new Map(
        (shown ? stepsOf(shown) : []).map((step) => [
          step.node,
          { state: step.state, ...(took(step) ? { took: took(step) as string } : {}) },
        ]),
      ),
    [shown],
  );
  // The edges the test went down are drawn strong. Only how they are drawn: never saved.
  const drawnEdges = useMemo(
    () =>
      (shown
        ? edges.map((edge) => {
            const from = nodeRuns.get(edge.source);
            const to = nodeRuns.get(edge.target);
            const taken =
              from &&
              to &&
              to.state !== "skipped" &&
              (edge.sourceHandle === "error" ? from.state === "failed" : from.state !== "failed");
            return taken
              ? { ...edge, style: { ...edge.style, stroke: "var(--vx-action)", strokeWidth: 2.5 } }
              : edge;
          })
        : edges
      ).map((edge) => ({
        ...edge,
        // A connection is named for screen readers by where it goes, and why.
        ariaLabel: `${edge.source} to ${edge.target}${edge.label ? `, ${String(edge.label)}` : ""}`,
      })),
    [edges, shown, nodeRuns],
  );
  const previewSource = useMemo(
    () => ({
      root,
      flowRun: testRunId,
      flow: state === "new" ? undefined : path,
      version: live.run ? `${live.run.id}:${live.run.status}:${live.run.steps.length}` : "",
    }),
    [root, testRunId, state, path, live.run],
  );

  if (!loaded) return problem ? <Notice tone="danger">{problem}</Notice> : <Loading />;

  const node = chosen?.data.node;
  const expression = (
    label: string,
    key: string,
    hint?: string,
    // `keepEmpty`: an emptied field stays in its mode, and is said to be unfinished.
    { keepEmpty = false, required = false }: { keepEmpty?: boolean; required?: boolean } = {},
  ) =>
    chosen && node ? (
      <ExpressionField
        name={key}
        label={label}
        rows={2}
        required={required}
        value={(node[key] as string | undefined) ?? ""}
        hint={hint}
        // A foreach's input and flow are worked out for each item: the preview takes the first.
        items={
          node.type === "foreach" && key !== "items"
            ? ((node.items as string | undefined) ?? undefined)
            : undefined
        }
        onChange={(value) =>
          update(chosen.id, { [key]: value === "" && !keepEmpty ? undefined : value })
        }
      />
    ) : null;

  const wanted = addSearch.trim().toLowerCase();
  const matches = (label: string, hint?: string) =>
    !wanted || label.toLowerCase().includes(wanted) || (hint ?? "").toLowerCase().includes(wanted);
  const saveState = dirty
    ? state === "new" || state === "repository"
      ? "Not saved"
      : gaveUp
        ? "Could not save."
        : failures.current > 0
          ? "Could not save. Trying again…"
          : "Saving…"
    : savedAt
      ? `Draft saved ${ago(savedAt)}`
      : stateLabel(state === "removed" ? "draft" : state);

  const keepViewport = (viewport: Viewport) => {
    if (!path) return;
    try {
      sessionStorage.setItem(`vx-viewport:${path}`, JSON.stringify(viewport));
    } catch {
      // Without storage the canvas fits the flow next time.
    }
  };
  // The canvas beside the chosen step's settings; the test run, when open, below both.
  const editor = (
    <SplitPane
      id="flow-editor"
      label="Resize the canvas and the step's settings"
      className="min-h-0 flex-1"
      initial={70}
      collapsible="second"
      minFirst={320}
      minSecond={280}
      paneLabels={{ first: "the canvas", second: "the step's settings" }}
      first={
        <div className="relative flex min-h-[28rem] flex-1 flex-col lg:min-h-[16rem]">
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            <Button
              variant="primary"
              size="small"
              aria-expanded={adding}
              disabled={state === "removed"}
              onClick={() => setAdding((open) => !open)}
            >
              <Plus aria-hidden="true" size={14} /> Add step
            </Button>
            <Appear
              open={adding}
              className="transition-[opacity,translate] motion-base data-[ending-style]:-translate-y-1 data-[starting-style]:-translate-y-1 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
            >
              <aside
                aria-label="Steps to add"
                className="flex max-h-[60vh] w-64 flex-col gap-3 overflow-y-auto rounded-panel border border-line bg-raised p-3 shadow-modal"
              >
                <input
                  aria-label="Find a step"
                  placeholder="Find a step"
                  value={addSearch}
                  onChange={(event) => setAddSearch(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter takes the first match, as a search that lists does everywhere else.
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    event.currentTarget.parentElement?.querySelector("button")?.click();
                  }}
                  className="h-8 rounded-control border border-line bg-structure px-3 text-ink outline-none placeholder:text-ink-subtle"
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
                          <span className="flex items-center gap-1.5">
                            {one.icon ? <PaletteIcon name={one.icon} /> : null}
                            {one.label}
                          </span>
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
            </Appear>
          </div>
          <ContextMenu
            className="flex min-h-0 flex-1 flex-col"
            items={menuItems()}
            onOpen={(target) =>
              setMenuOn(target?.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? undefined)
            }
          >
            <div className="min-h-0 flex-1 bg-sunken" data-testid="flow-canvas">
              <NodeNames.Provider value={names}>
                <NodeRuns.Provider value={nodeRuns}>
                  <ReactFlow
                    nodes={nodes}
                    edges={drawnEdges}
                    nodeTypes={nodeTypes}
                    onNodesChange={(changes) => {
                      const gone = changes.filter((change) => change.type === "remove");
                      if (gone.length > 0) history.record("Remove a step");
                      onNodesChange(changes);
                      if (gone.length > 0)
                        saidRemoved(
                          gone.length === 1 ? (gone[0] as { id: string }).id : plural(gone.length),
                        );
                      if (
                        changes.some(
                          (change) => change.type === "position" || change.type === "remove",
                        )
                      )
                        touch();
                    }}
                    onEdgesChange={(changes) => {
                      if (changes.some((change) => change.type === "remove"))
                        history.record("Remove a connection");
                      onEdgesChange(changes);
                      if (changes.some((change) => change.type === "remove")) touch();
                    }}
                    onConnect={connect}
                    // A flow drafted for removal is read, not changed.
                    nodesDraggable={state !== "removed"}
                    nodesConnectable={state !== "removed"}
                    edgesReconnectable={state !== "removed"}
                    deleteKeyCode={state === "removed" ? null : "Backspace"}
                    // A drag is one step to undo, however far it went.
                    onNodeDragStart={() => history.record("Move a step")}
                    onSelectionDragStart={() => history.record("Move steps")}
                    onSelectionChange={({ nodes: picked }) => {
                      if (restoring.current && picked.length === 0) return;
                      setSelected(picked[0]?.id);
                    }}
                    onInit={setCanvas}
                    // Where the canvas was left, this session, or the whole flow in view.
                    {...(kept ? { defaultViewport: kept } : { fitView: true, fitViewOptions: FIT })}
                    onMoveEnd={(_, viewport) => keepViewport(viewport)}
                    maxZoom={1.5}
                    minZoom={0.2}
                    proOptions={{ hideAttribution: false }}
                    // The canvas takes its colors from the kit's tokens, so it follows the theme.
                    style={CANVAS_COLORS}
                  >
                    <Background />
                    <Controls />
                    {/* With the test panel open the canvas is short, and the map would cover the graph. */}
                    {testing ? null : <MiniMap pannable zoomable />}
                  </ReactFlow>
                </NodeRuns.Provider>
              </NodeNames.Provider>
            </div>
          </ContextMenu>
        </div>
      }
      second={
        <aside
          ref={inspector}
          aria-label="The chosen step"
          className="flex max-h-[60vh] min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-line border-t bg-surface p-4 lg:max-h-none lg:border-t-0 lg:border-l"
        >
          <ExpressionPreview.Provider value={previewSource}>
            <fieldset
              disabled={state === "removed"}
              className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
            >
              <StepOutline nodes={nodes} edges={edges} chosen={chosen?.id} onChoose={choose} />
              {chosenIds().length > 1 ? (
                <section aria-label="The chosen steps" className="flex flex-col gap-3">
                  <h2 className="m-0 text-title">{plural(chosenIds().length)} chosen</h2>
                  <p className="m-0 font-mono text-code text-ink-muted">{chosenIds().join(", ")}</p>
                  <p className="m-0 text-meta text-ink-muted">
                    Drag one to move them all. Copy them with {formatCombo("Mod+C")} to paste here
                    or in another flow; references between them follow their new names.
                  </p>
                  <span className="flex flex-wrap gap-2">
                    <Button
                      size="small"
                      onClick={() => duplicate(chosenIds())}
                      keys={keysOf("flow.duplicate")}
                      tooltip="Duplicate"
                    >
                      Duplicate
                    </Button>
                    <Button size="small" variant="danger" onClick={() => removeMany(chosenIds())}>
                      Remove {plural(chosenIds().length)}
                    </Button>
                  </span>
                </section>
              ) : chosen && node ? (
                <>
                  <NameField key={chosen.id} id={chosen.id} rename={rename} />
                  {shown ? (
                    <LastTest run={shown} node={chosen.id} root={root} onTestFrom={testFrom} />
                  ) : null}
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
                        <WhenFields
                          root={root}
                          value={
                            node.trigger as {
                              cron?: string;
                              timezone?: string;
                              overlap?: "allow" | "skip";
                            }
                          }
                          readOnly={false}
                          // One added from the palette is new; one that came with the flow, or was pasted, keeps its zone.
                          fresh={addedIds.current.has(chosen.id)}
                          overlapDefault="skip"
                          change={(next) => {
                            const merged: Record<string, unknown> = {
                              ...(node.trigger as object),
                              ...next,
                            };
                            for (const key of Object.keys(merged)) {
                              if (merged[key] === undefined) delete merged[key];
                            }
                            update(chosen.id, { trigger: merged as FlowNode["trigger"] });
                          }}
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
                  {node.type === "script" &&
                  specs.has(String(node.script)) &&
                  node.input === undefined ? (
                    <p className="m-0 text-body-sm">
                      <span className="font-semibold">{specs.get(String(node.script))?.label}</span>{" "}
                      <code className="font-mono text-code-sm text-ink-muted">
                        {String(node.script)}
                      </code>
                    </p>
                  ) : node.type === "script" || node.type === "foreach" ? (
                    <ComboboxField
                      label="Script"
                      options={scriptOptions}
                      value={(node.script as string | undefined) || undefined}
                      onChange={(script) =>
                        // A For each runs a script or a flow: choosing one clears the other.
                        update(chosen.id, {
                          script: script ?? (node.type === "foreach" ? undefined : ""),
                          ...(node.type === "foreach" && script
                            ? { flow: undefined, flowFrom: undefined, allow: undefined }
                            : {}),
                        })
                      }
                    />
                  ) : null}
                  {node.type === "subflow" || node.type === "foreach" ? (
                    <>
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
                                  ...(node.type === "foreach" ? { script: undefined } : {}),
                                }
                              : {
                                  flow:
                                    (node.allow as string[] | undefined)?.[0] ??
                                    (node.type === "foreach" ? undefined : ""),
                                  flowFrom: undefined,
                                  allow: undefined,
                                },
                          )
                        }
                      />
                      {node.flowFrom !== undefined ? (
                        <>
                          {expression(
                            "Expression that gives the flow's path",
                            "flowFrom",
                            "It must give one of the flows below, or the step fails.",
                            { keepEmpty: true, required: true },
                          )}
                          <MultiSelectField
                            label="Flows it may start"
                            options={flowOptions}
                            value={(node.allow as string[] | undefined) ?? []}
                            hint="Nothing outside this list is ever started, whatever the data says."
                            onChange={(allow) => update(chosen.id, { allow })}
                          />
                        </>
                      ) : (
                        <ComboboxField
                          label={node.type === "foreach" ? "Or a flow" : "Flow"}
                          options={flowOptions}
                          value={(node.flow as string | undefined) || undefined}
                          onChange={(flow) =>
                            update(chosen.id, {
                              flow: flow ?? (node.type === "foreach" ? undefined : ""),
                              ...(node.type === "foreach" && flow ? { script: undefined } : {}),
                            })
                          }
                        />
                      )}
                    </>
                  ) : null}
                  {node.type === "foreach"
                    ? expression("Items", "items", "An expression that gives a list.", {
                        required: true,
                      })
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
                  ) : node.type === "script" ||
                    node.type === "subflow" ||
                    node.type === "foreach" ? (
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
                      <SelectField
                        name="surface"
                        label="Where it waits"
                        hint="An approval is always listed in this workspace. One that matters beyond it can be listed for the whole tenant too."
                        value={(node.surface as string) ?? "workspace"}
                        options={[
                          { value: "workspace", label: "This workspace" },
                          { value: "tenant", label: "This workspace and the tenant" },
                        ]}
                        onChange={(surface) =>
                          update(chosen.id, {
                            surface: surface === "tenant" ? "tenant" : undefined,
                          })
                        }
                      />
                    </>
                  ) : null}
                  {node.type === "fail"
                    ? expression("Message", "message", "An expression that gives text.", {
                        required: true,
                      })
                    : null}
                  {node.type === "respond" ? (
                    <RespondSettings
                      node={node}
                      onChange={(change) => update(chosen.id, change)}
                      headers={(values, onChange) => (
                        <ValuesEditor
                          legend="Headers"
                          add="Add a header"
                          headers
                          values={values}
                          onChange={onChange}
                        />
                      )}
                    />
                  ) : null}
                  {node.type === "branch" ? (
                    <CasesEditor
                      cases={(node.cases as { name: string; when: string }[]) ?? []}
                      onChange={(cases, renamed) => {
                        update(chosen.id, { cases });
                        // A renamed case's connection leaves it under its new name, and a
                        // removed case takes its connection with it, in the same step to undo.
                        setEdges((before) => followCases(before, chosen.id, cases, renamed));
                      }}
                    />
                  ) : null}
                  {node.type === "set" ? (
                    <ValuesEditor
                      values={(node.values as Record<string, string>) ?? {}}
                      onChange={(values) => update(chosen.id, { values })}
                    />
                  ) : null}
                  <ConnectionsEditor
                    id={chosen.id}
                    node={node}
                    nodes={nodes}
                    edges={edges}
                    onConnect={(handle, target) =>
                      connect({
                        source: chosen.id,
                        sourceHandle: handle,
                        target,
                        targetHandle: null,
                      })
                    }
                    onDisconnect={(handle, target) => disconnect(chosen.id, handle, target)}
                  />
                  <div className="mt-auto">
                    <Button variant="danger" onClick={() => remove(chosen.id)}>
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
                      history.record("Change the description", "description");
                      setDescription(value);
                      touch();
                    }}
                  />
                  <p className="m-0 text-meta text-ink-muted">
                    Choose a step to change it, on the canvas or from the steps above. Add steps
                    with Add step. Say where each one goes next under the step's settings, or drag
                    from the dot on its right edge to the next step. The red dot underneath is where
                    it goes when it fails.
                  </p>
                </div>
              )}
            </fieldset>
          </ExpressionPreview.Provider>
        </aside>
      }
    />
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-line border-b px-4 py-2 md:px-5">
        <PageHeader
          compact
          mono={Boolean(opened)}
          title={opened ? path : "New flow"}
          state={
            <>
              {state === "removed" ? (
                <StatePill state="draft">Removing</StatePill>
              ) : (
                <StatePill
                  state={
                    state === "repository" || (state === "deployed" && !dirty) ? state : "draft"
                  }
                />
              )}
              {found.length > 0 ? (
                <span className="flex items-center gap-1 text-meta text-attention">
                  <TriangleAlert aria-hidden="true" size={14} /> {found.length} to fix
                </span>
              ) : null}
              <span
                role="status"
                className={`text-meta ${gaveUp || failures.current > 0 ? "text-danger" : "text-ink-subtle"}`}
              >
                {saveState}
              </span>
              {gaveUp ? (
                <Button
                  size="small"
                  variant="quiet"
                  onClick={() => {
                    failures.current = 0;
                    setGaveUp(false);
                  }}
                >
                  Retry
                </Button>
              ) : null}
            </>
          }
          actions={
            <>
              <Button
                size="small"
                disabled={state === "removed"}
                onClick={() => {
                  history.record("Tidy up");
                  const positions = autoLayout(flowNodes, flowEdges);
                  setNodes((before) =>
                    before.map((one) => ({ ...one, position: positions[one.id] ?? one.position })),
                  );
                  touch();
                }}
              >
                Tidy up
              </Button>
              <Button
                size="small"
                variant="quiet"
                aria-label="Undo"
                tooltip={history.undoLabel ? `Undo: ${history.undoLabel}` : "Nothing to undo"}
                keys={keysOf("undo")}
                disabled={!history.undoLabel}
                onClick={undo}
              >
                <Undo2 aria-hidden="true" size={14} />
              </Button>
              <Button
                size="small"
                variant="quiet"
                aria-label="Redo"
                tooltip={history.redoLabel ? `Redo: ${history.redoLabel}` : "Nothing to redo"}
                keys={keysOf("redo")}
                disabled={!history.redoLabel}
                onClick={redo}
              >
                <Redo2 aria-hidden="true" size={14} />
              </Button>
              <Button size="small" aria-pressed={testing} onClick={() => setTesting((on) => !on)}>
                <Play aria-hidden="true" size={14} /> Test
              </Button>
              {opened && state === "removed" ? (
                <RemoveDraftButton
                  root={root}
                  kind="flow"
                  path={opened}
                  noun="flow"
                  state="removed"
                  size="small"
                  onDone={() => setAgain((n) => n + 1)}
                />
              ) : null}
              {opened && state !== "new" && state !== "removed" ? (
                <ResourceIdentity
                  root={root}
                  link={link}
                  label="Name and path"
                  row={{
                    path: opened,
                    kind: "flow",
                    ownership: state === "repository" ? "code" : "ui",
                  }}
                  unsaved={dirty}
                  onDone={(next) => {
                    if (next !== opened) navigate(`${link}/flows/edit/${next}`);
                    else setState("draft");
                  }}
                />
              ) : null}
              {opened && state !== "new" && state !== "removed" ? (
                <RemoveDraftButton
                  root={root}
                  kind="flow"
                  path={opened}
                  noun="flow"
                  state={state}
                  size="small"
                  disabled={busy}
                  onDone={(did) => navigate(`${link}/${did === "discarded" ? "flows" : "changes"}`)}
                />
              ) : null}
              <Button
                size="small"
                variant={state === "draft" && !dirty ? "secondary" : "primary"}
                disabled={busy || state === "removed" || (!dirty && state !== "new")}
                onClick={() => void save()}
              >
                Save draft
              </Button>
              {state === "draft" && !dirty && path ? (
                <DeployMenu
                  root={root}
                  link={link}
                  path={path}
                  disabled={busy}
                  onDeployed={() => setState("deployed")}
                />
              ) : null}
            </>
          }
          after={
            opened ? undefined : (
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-56">
                  <TextField
                    name="path"
                    label="Path"
                    value={path}
                    placeholder="orders/handle"
                    {...(pathTaken ? { error: pathTaken } : {})}
                    onChange={(value) => {
                      setPathTaken(undefined);
                      setPath(value);
                    }}
                  />
                </div>
                <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                  <legend className="mb-1 text-body-sm font-medium">Start from</legend>
                  <div className="flex flex-wrap gap-2">
                    {FLOW_STARTERS.map((starter) => (
                      <Button
                        key={starter.id}
                        size="small"
                        tooltip={starter.about}
                        aria-pressed={starterId === starter.id}
                        // Once the flow is changed, starting again would lose the change.
                        disabled={dirty && starterId !== starter.id}
                        onClick={() => {
                          setStarterId(starter.id);
                          open(starter.body as unknown as FlowBody);
                        }}
                      >
                        {starter.label}
                      </Button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )
          }
        />
      </div>
      {state === "repository" ||
      state === "removed" ||
      draft.clashed ||
      problem ||
      found.length > 0 ? (
        <div className="flex flex-col gap-2 px-4 pt-3 md:px-5">
          {state === "removed" ? (
            <Notice tone="attention">
              This flow is removed in your drafts. Nothing changes until that draft is deployed. The
              steps shown are what is deployed now. Keep this flow to take the removal back.
            </Notice>
          ) : null}
          {draft.clashed ? <DraftClash what="flow" onTake={() => setAgain((n) => n + 1)} /> : null}
          {state === "repository" ? (
            <Notice tone="attention">
              This flow is managed in the tenant's repository. Saving a draft of it takes it over.
            </Notice>
          ) : null}
          {problem ? <Notice tone="danger">{problem}</Notice> : null}
          {found.length > 0 ? (
            <Notice tone="attention">
              <ul aria-label="To fix" className="m-0 flex list-none flex-col gap-0.5 p-0">
                {found.map((one) => (
                  <li key={one.message}>
                    {one.node ? (
                      <button
                        type="button"
                        onClick={() => goToProblem(one)}
                        className="text-left underline-offset-2 hover:underline"
                      >
                        {one.message}
                      </button>
                    ) : (
                      one.message
                    )}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ) : null}
      {testing ? (
        <SplitPane
          id="flow-test"
          orientation="vertical"
          label="Resize the canvas and the test run"
          className="min-h-0 flex-1"
          initial={62}
          minFirst={240}
          minSecond={140}
          paneLabels={{ first: "the canvas", second: "the test run" }}
          first={editor}
          second={
            <FlowTestPanel
              link={link}
              path={path}
              schema={
                chosenTrigger?.trigger?.type === "manual" ? chosenTrigger.trigger.input : undefined
              }
              triggers={triggerNodes.map((one) => ({
                node: one.id,
                label: `${one.id} (${(one.data.node as { trigger?: { type?: string } }).trigger?.type ?? "trigger"})`,
              }))}
              trigger={testFromTrigger}
              onTrigger={setTestTrigger}
              blocked={testBlocked}
              run={live.run}
              error={live.error}
              changed={editedSinceTest && live.run !== undefined}
              onRun={runTest}
              withAll={testAll}
              onWithAll={setTestAll}
              onChoose={(id) => {
                setSelected(id);
                setNodes((before) => before.map((one) => ({ ...one, selected: one.id === id })));
              }}
              onClose={() => setTesting(false)}
            />
          }
        />
      ) : (
        editor
      )}
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
        hint="Press Enter to rename. Expressions that read this step are changed to the new name."
        onChange={setText}
      />
    </form>
  );
}

/** A list with one item moved from one place to another. */
const moved = <T,>(items: T[], from: number, to: number): T[] => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
};

/** The steps in the order a run reaches them: from the start, along each connection, then the rest. */
export function stepOrder(
  ids: string[],
  edges: { source: string; target: string }[],
  starts: string[],
) {
  const order: string[] = [];
  const queue = [...starts];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (order.includes(id) || !ids.includes(id)) continue;
    order.push(id);
    for (const edge of edges) if (edge.source === id) queue.push(edge.target);
  }
  return [...order, ...ids.filter((id) => !order.includes(id))];
}

/**
 * Every step as a list, in the order a run reaches them: a way to find and
 * choose a step without the canvas, by keyboard or with a screen reader.
 */
function StepOutline({
  nodes,
  edges,
  chosen,
  onChoose,
}: {
  nodes: CanvasNode[];
  edges: Edge[];
  chosen: string | undefined;
  onChoose: (id: string) => void;
}) {
  const ids = nodes.map((node) => node.id);
  const starts = nodes.filter((node) => node.data.node.type === "trigger").map((node) => node.id);
  const order = stepOrder(ids, edges, starts);
  const byId = new Map(nodes.map((node) => [node.id, node.data.node]));
  return (
    <details open className="rounded-control border border-line">
      <summary className="cursor-pointer px-3 py-2 text-body-sm font-medium">
        Steps ({order.length})
      </summary>
      <nav aria-label="Steps in order" className="max-h-48 overflow-y-auto px-1 pb-1">
        <ol className="m-0 list-none p-0">
          {order.map((id) => (
            <li key={id}>
              <button
                type="button"
                aria-current={id === chosen ? "true" : undefined}
                onClick={() => onChoose(id)}
                className={`flex w-full items-center justify-between gap-2 rounded-inner px-2 py-1 text-left ${
                  id === chosen
                    ? "bg-selected text-ink"
                    : "text-ink-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <span className="truncate font-mono text-code">{id}</span>
                <span className="text-meta">{byId.get(id)?.type}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}

/**
 * Where a step goes next, chosen from lists instead of by dragging between
 * dots: the steps it goes on to, where it goes when it fails, and where each of
 * a branch's cases leads. Each choice is a connection on the canvas, undone as one.
 */
function ConnectionsEditor({
  id,
  node,
  nodes,
  edges,
  onConnect,
  onDisconnect,
}: {
  id: string;
  node: FlowNode;
  nodes: CanvasNode[];
  edges: Edge[];
  onConnect: (handle: string, target: string) => void;
  onDisconnect: (handle: string, target?: string) => void;
}) {
  const outs = outputs(node);
  if (outs.length === 0) return null;
  // A step can go to any other step but a start.
  const targets = nodes
    .filter((one) => one.id !== id && one.data.node.type !== "trigger")
    .map((one) => one.id);
  const leaving = (handle: string) =>
    edges
      .filter((edge) => edge.source === id && (edge.sourceHandle ?? "next") === handle)
      .map((edge) => edge.target);
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 border-line border-t p-0 pt-3">
      <legend className="float-left mb-1 p-0 text-body-sm font-medium">Where it goes next</legend>
      {outs.map((out) => {
        if (out.id === "next") {
          const now = leaving("next");
          const more = targets.filter((target) => !now.includes(target));
          return (
            <div key="next" className="clear-left flex flex-col gap-1.5">
              {now.length > 0 ? (
                <ul aria-label="Goes on to" className="m-0 flex list-none flex-col gap-1 p-0">
                  {now.map((target) => (
                    <li key={target} className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-code">→ {target}</span>
                      <Button
                        size="small"
                        variant="quiet"
                        aria-label={`Stop going to ${target}`}
                        onClick={() => onDisconnect("next", target)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {more.length > 0 ? (
                <SelectField
                  name={`next-of-${id}`}
                  label={now.length > 0 ? "Also go to" : "Then go to"}
                  value=""
                  options={[
                    { value: "", label: "Choose a step…" },
                    ...more.map((target) => ({ value: target, label: target })),
                  ]}
                  onChange={(target) => {
                    if (target) onConnect("next", target);
                  }}
                />
              ) : null}
            </div>
          );
        }
        const label =
          out.id === "error"
            ? "On failure, go to"
            : out.label === OTHERWISE
              ? "Otherwise, go to"
              : `When ${out.label}, go to`;
        return (
          <SelectField
            key={out.id}
            name={`${out.id}-of-${id}`}
            label={label}
            value={leaving(out.id)[0] ?? ""}
            options={[
              { value: "", label: "Nothing" },
              ...targets.map((target) => ({ value: target, label: target })),
            ]}
            onChange={(target) => (target ? onConnect(out.id, target) : onDisconnect(out.id))}
          />
        );
      })}
    </fieldset>
  );
}

/** A case's name, changed when Enter is pressed or the field is left, not while it is typed. */
function CaseName({
  index,
  name,
  taken,
  onRename,
}: {
  index: number;
  name: string;
  /** The names the other cases have. */
  taken: string[];
  onRename: (name: string) => void;
}) {
  const [text, setText] = useState(name);
  const [error, setError] = useState<string>();
  // A name changed from outside, by undo, is the one shown.
  useEffect(() => {
    setText(name);
    setError(undefined);
  }, [name]);
  const commit = () => {
    if (text === name) return setError(undefined);
    if (!text.trim()) return setError("A case needs a name.");
    if (text === OTHERWISE)
      return setError(
        `"${OTHERWISE}" is the way out when no case holds, so a case cannot be called that. Choose another name.`,
      );
    if (taken.includes(text))
      return setError(`The name "${text}" is already used. Each case needs its own.`);
    setError(undefined);
    onRename(text);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
      onBlur={commit}
    >
      <TextField
        name={`case-${index}`}
        label="Name"
        value={text}
        error={error}
        hint="Press Enter to change it. The connection from this case follows."
        onChange={setText}
      />
    </form>
  );
}

export function CasesEditor({
  cases,
  onChange,
}: {
  cases: { name: string; when: string }[];
  /** With `renamed` when a case's name changed, so its connection follows it. */
  onChange: (
    cases: { name: string; when: string }[],
    renamed?: { from: string; to: string },
  ) => void;
}) {
  // A case has no identity but its place while its name is typed: this stays with it as it moves.
  const names = useKeys(cases.length);
  const tried = useFlip<HTMLFieldSetElement>(names.keys.join(" "));
  return (
    <fieldset ref={tried} className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium">Cases, tried in order</legend>
      {cases.map((one, index) => (
        <div
          key={names.keys[index]}
          data-flip-key={names.keys[index]}
          className="flex flex-col gap-1 rounded-control border border-line p-2"
        >
          <CaseName
            index={index}
            name={one.name}
            taken={cases.filter((_, at) => at !== index).map((each) => each.name)}
            onRename={(name) =>
              onChange(
                cases.map((each, at) => (at === index ? { ...each, name } : each)),
                { from: one.name, to: name },
              )
            }
          />
          <ExpressionField
            name={`when-${index}`}
            label="When"
            condition
            value={one.when}
            onChange={(when) =>
              onChange(cases.map((each, at) => (at === index ? { ...each, when } : each)))
            }
          />
          <div className="flex flex-wrap gap-1">
            <MoveButtons
              label={one.name || "this case"}
              at={index}
              count={cases.length}
              onMove={(by) => {
                names.move(index, index + by);
                onChange(moved(cases, index, index + by));
              }}
            />
            {cases.length > 1 ? (
              <Button
                size="small"
                variant="danger"
                onClick={() => {
                  names.remove(index);
                  onChange(cases.filter((_, at) => at !== index));
                }}
              >
                Remove case
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      <div>
        <Button
          size="small"
          onClick={() => onChange([...cases, { name: freeName("case", cases), when: "true" }])}
        >
          Add a case
        </Button>
      </div>
      <p className="m-0 text-meta text-ink-muted">
        When no case holds, the flow leaves by “otherwise”. Removing a case removes its connection.
      </p>
    </fieldset>
  );
}

/** `base_1`, `base_2`… the first not already a name in `items`. */
export function freeName(base: string, items: { name: string }[]): string {
  let n = items.length + 1;
  while (items.some((one) => one.name === `${base}_${n}`)) n++;
  return `${base}_${n}`;
}

interface ValueRow {
  name: string;
  value: string;
}

/** Why a row's name cannot be used, or nothing when it can. */
export function valueRowProblem(
  rows: ValueRow[],
  at: number,
  headers: boolean,
): string | undefined {
  const name = rows[at]?.name ?? "";
  if (!name.trim()) return "A name is needed.";
  // Header names are the same name whatever their case.
  const same = (a: string) => (headers ? a.toLowerCase() : a);
  if (rows.some((row, other) => other < at && same(row.name) === same(name)))
    return `The name "${name}" is used twice. Each needs its own.`;
  if (headers) {
    if (!/^[A-Za-z0-9-]+$/.test(name)) return "Letters, digits and hyphens only.";
    if (RESPONSE_HEADERS_REFUSED.includes(name.toLowerCase()))
      return `A flow may not set the header "${name}".`;
  }
  return undefined;
}

/** What is saved of the rows: those whose name can be used, the first of a name winning. */
export function rowsToValues(rows: ValueRow[], headers: boolean): Record<string, string> {
  return Object.fromEntries(
    rows.filter((_, at) => !valueRowProblem(rows, at, headers)).map((row) => [row.name, row.value]),
  );
}

const sameValues = (a: Record<string, string>, b: Record<string, string>) =>
  JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));

export function ValuesEditor({
  values,
  onChange,
  legend = "Values",
  add = "Add a value",
  headers = false,
}: {
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  legend?: string;
  add?: string;
  /** Rows are response headers: their names are checked as header names, up to 20. */
  headers?: boolean;
}) {
  const most = headers ? 20 : 50;
  const fewest = headers ? 0 : 1;
  // Held as a list while edited, so that a name typed on the way to another is not a value lost.
  const [rows, setRows] = useState<ValueRow[]>(() =>
    Object.entries(values).map(([name, value]) => ({ name, value })),
  );
  const keys = useKeys(rows.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of the values is news
  useEffect(() => {
    // Values changed from outside, by undo, are the rows shown.
    if (!sameValues(values, rowsToValues(rows, headers)))
      setRows(Object.entries(values).map(([name, value]) => ({ name, value })));
  }, [values]);
  const edit = (next: ValueRow[]) => {
    setRows(next);
    onChange(rowsToValues(next, headers));
  };
  const seed = headers ? "x-header" : "value";
  const taken = (name: string) => rows.some((row) => row.name === name);
  let fresh = headers ? seed : `${seed}_${rows.length + 1}`;
  for (let n = 2; taken(fresh); n++)
    fresh = headers ? `${seed}-${n}` : `${seed}_${rows.length + n}`;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium">{legend}</legend>
      {rows.map((row, index) => (
        <div key={keys.keys[index]} className="flex flex-col gap-1">
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <TextField
              name={`name-${index}`}
              label="Name"
              value={row.name}
              error={valueRowProblem(rows, index, headers)}
              onChange={(name) =>
                edit(rows.map((one, at) => (at === index ? { ...one, name } : one)))
              }
            />
            <ExpressionField
              name={`value-${index}`}
              label="Expression"
              value={row.value}
              onChange={(value) =>
                edit(rows.map((one, at) => (at === index ? { ...one, value } : one)))
              }
            />
          </div>
          {rows.length > fewest ? (
            <div>
              <Button
                size="small"
                variant="danger"
                onClick={() => {
                  keys.remove(index);
                  edit(rows.filter((_, at) => at !== index));
                }}
              >
                {headers ? "Remove header" : "Remove value"}
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      <div>
        <Button
          size="small"
          disabled={rows.length >= most}
          onClick={() => edit([...rows, { name: fresh, value: headers ? "''" : "trigger" }])}
        >
          {add}
        </Button>
        {rows.length >= most ? (
          <p className="m-0 mt-1 text-meta text-ink-muted">A step takes {most} at most.</p>
        ) : null}
      </div>
    </fieldset>
  );
}
