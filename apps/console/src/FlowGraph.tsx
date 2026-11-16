import dagre from "@dagrejs/dagre";
import { useMemo, useRef, useState } from "react";
import { type RunState, STATE_STROKE, stateLabel } from "./kit/status.tsx";

export interface GraphNode {
  type: string;
  [field: string]: unknown;
}
export interface GraphEdge {
  from: string;
  to: string;
  output?: string;
  error?: boolean;
}
export type Positions = Record<string, { x: number; y: number }>;

const WIDTH = 176;
const HEIGHT = 54;

/** What each kind of node is called on the canvas. */
const KIND: Record<string, string> = {
  trigger: "Trigger",
  script: "Script",
  set: "Set values",
  branch: "Branch",
  foreach: "For each",
  join: "Join",
  delay: "Delay",
  approval: "Approval",
  subflow: "Sub-flow",
  respond: "Answer",
  fail: "Fail",
};

export function describe(node: GraphNode): string {
  if (node.type === "trigger") {
    const trigger = node.trigger as { type: string; cron?: string; event?: string; title?: string };
    if (trigger.type === "form") return `Form: ${trigger.title ?? ""}`;
    return (
      trigger.cron ?? trigger.event ?? `${trigger.type[0]?.toUpperCase()}${trigger.type.slice(1)}`
    );
  }
  if (typeof node.script === "string") return node.script;
  if (typeof node.flow === "string") return node.flow;
  if (Array.isArray(node.allow)) return `One of ${node.allow.length}, chosen by the data`;
  if (node.type === "delay") return `${node.seconds} s`;
  if (node.type === "approval") return String(node.title);
  if (node.type === "respond") return `Answers ${node.status ?? 200}`;
  return "";
}

/** A status changes a node's outline, never its fill, so the label stays readable. */
/** Lays the graph out left to right. Used for every node that has no saved position. */
export function autoLayout(nodes: Record<string, GraphNode>, edges: GraphEdge[]): Positions {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 64, marginx: 16, marginy: 16 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of Object.keys(nodes).sort()) graph.setNode(id, { width: WIDTH, height: HEIGHT });
  for (const edge of edges) {
    if (nodes[edge.from] && nodes[edge.to]) graph.setEdge(edge.from, edge.to);
  }
  dagre.layout(graph);
  return Object.fromEntries(
    Object.keys(nodes).map((id) => {
      const placed = graph.node(id);
      return [id, { x: Math.round(placed.x - WIDTH / 2), y: Math.round(placed.y - HEIGHT / 2) }];
    }),
  );
}

export interface FlowGraphProps {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  /** Saved positions. Nodes without one are laid out automatically. */
  layout: Positions;
  /** A state per node, when showing a run. */
  statuses?: Record<string, RunState>;
  selected?: string | undefined;
  onSelect?: (node: string) => void;
  /** Called with every node's position after one is dragged. Omit to make the graph fixed. */
  onMove?: (positions: Positions) => void;
}

/** A flow drawn as a graph. Reading it needs no mouse: every node is a button. */
export function FlowGraph({
  nodes,
  edges,
  layout,
  statuses,
  selected,
  onSelect,
  onMove,
}: FlowGraphProps) {
  const automatic = useMemo(() => autoLayout(nodes, edges), [nodes, edges]);
  const [moved, setMoved] = useState<Positions>({});
  const positions: Positions = { ...automatic, ...layout, ...moved };
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // A graph that cannot be moved opens fitted to its frame, so a wide flow is seen whole.
  // One that can be moved keeps its true size, so a drag lands where the pointer is.
  const [fitted, setFitted] = useState(!onMove);

  const ids = Object.keys(nodes).filter((id) => positions[id]);
  const width = Math.max(...ids.map((id) => (positions[id]?.x ?? 0) + WIDTH), 320) + 24;
  const height = Math.max(...ids.map((id) => (positions[id]?.y ?? 0) + HEIGHT), 120) + 24;

  const point = (event: { clientX: number; clientY: number }) => {
    const box = svg.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };

  return (
    <div className="relative overflow-auto rounded-panel border border-line bg-surface">
      {onMove ? null : (
        <button
          type="button"
          onClick={() => setFitted((on) => !on)}
          className="absolute top-2 right-2 z-10 rounded-control border border-line bg-raised px-2 py-0.5 text-meta text-ink-muted hover:text-ink"
        >
          {fitted ? "Actual size" : "Fit to view"}
        </button>
      )}
      {/* biome-ignore lint/a11y/useSemanticElements: an SVG is grouped by role, it has no fieldset */}
      <svg
        ref={svg}
        {...(fitted
          ? {
              viewBox: `0 0 ${width} ${height}`,
              width: "100%",
              preserveAspectRatio: "xMidYMin meet",
              style: { maxWidth: width, maxHeight: "70vh", display: "block", margin: "0 auto" },
            }
          : { width, height })}
        role="group"
        aria-label="Flow graph"
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const at = point(event);
          current.moved = true;
          setMoved((existing) => ({
            ...existing,
            [current.id]: {
              x: Math.max(0, Math.round(at.x - current.dx)),
              y: Math.max(0, Math.round(at.y - current.dy)),
            },
          }));
        }}
        onPointerUp={() => {
          const current = drag.current;
          drag.current = null;
          if (current?.moved) onMove?.({ ...automatic, ...layout, ...moved });
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--vx-ink-muted)" />
          </marker>
          <marker
            id="arrow-error"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--vx-danger)" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const from = positions[edge.from];
          const to = positions[edge.to];
          if (!from || !to) return null;
          const [x1, y1, x2, y2] = [from.x + WIDTH, from.y + HEIGHT / 2, to.x, to.y + HEIGHT / 2];
          const bend = Math.max(32, Math.abs(x2 - x1) / 2);
          const label = edge.error ? "on error" : edge.output;
          // In a run, the way it went is drawn strong and the rest recedes.
          const reached = (id: string) => {
            const status = statuses?.[id];
            return status !== undefined && status !== "skipped";
          };
          const taken = statuses ? reached(edge.from) && reached(edge.to) : undefined;
          return (
            <g key={`${edge.from}-${edge.to}-${edge.output ?? ""}-${edge.error ? "e" : ""}`}>
              <path
                d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={
                  edge.error
                    ? "var(--vx-danger)"
                    : taken
                      ? "var(--vx-action)"
                      : "var(--vx-ink-muted)"
                }
                strokeWidth={taken ? 2 : 1.5}
                strokeDasharray={edge.error || taken === false ? "5 4" : undefined}
                opacity={taken === false ? 0.4 : 1}
                markerEnd={edge.error ? "url(#arrow-error)" : "url(#arrow)"}
              >
                <title>
                  {`${edge.from} to ${edge.to}${label ? `, ${label}` : ""}${
                    taken === undefined ? "" : taken ? ", taken in this run" : ", not taken"
                  }`}
                </title>
              </path>
              {label ? (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor="middle"
                  fontSize="12"
                  fill={edge.error ? "var(--vx-danger)" : "var(--vx-ink-muted)"}
                  style={{ paintOrder: "stroke", stroke: "var(--vx-surface)", strokeWidth: 4 }}
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
        {ids.map((id) => {
          const node = nodes[id] as GraphNode;
          const at = positions[id] as { x: number; y: number };
          const state = statuses?.[id];
          const look = state
            ? { stroke: STATE_STROKE[state] ?? "var(--vx-ink-muted)", label: stateLabel(state) }
            : undefined;
          const isSelected = selected === id;
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a button element
            <g
              key={id}
              transform={`translate(${at.x} ${at.y})`}
              role="button"
              tabIndex={0}
              // The ring below shows where keyboard focus is; the browser's own outline does not fit an SVG shape.
              className="group outline-none"
              aria-pressed={isSelected}
              aria-label={`${KIND[node.type] ?? node.type} ${id}${look ? `, ${look.label}` : ""}`}
              style={{ cursor: onMove ? "grab" : onSelect ? "pointer" : "default" }}
              onPointerDown={(event) => {
                if (!onMove) return;
                const start = point(event);
                drag.current = { id, dx: start.x - at.x, dy: start.y - at.y, moved: false };
              }}
              onClick={() => onSelect?.(id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(id);
                }
              }}
            >
              <rect
                className="hidden group-focus-visible:block"
                x={-7}
                y={-7}
                width={WIDTH + 14}
                height={HEIGHT + 14}
                rx={node.type === "trigger" ? (HEIGHT + 14) / 2 : 12}
                fill="none"
                stroke="var(--vx-focus)"
                strokeWidth={2.5}
              />
              {isSelected ? (
                <g stroke="var(--vx-action)" strokeWidth="2" fill="none">
                  <polyline points="-5,5 -5,-5 5,-5" />
                  <polyline
                    points={`${WIDTH + 5},${HEIGHT - 5} ${WIDTH + 5},${HEIGHT + 5} ${WIDTH - 5},${HEIGHT + 5}`}
                  />
                </g>
              ) : null}
              <rect
                opacity={statuses && !state ? 0.5 : 1}
                width={WIDTH}
                height={HEIGHT}
                rx={node.type === "trigger" ? HEIGHT / 2 : 8}
                fill={state === "skipped" ? "var(--vx-canvas)" : "var(--vx-surface)"}
                stroke={isSelected ? "var(--vx-action)" : (look?.stroke ?? "var(--vx-line)")}
                strokeWidth={isSelected ? 3 : look ? 2.5 : 1.5}
                strokeDasharray={state === "skipped" ? "4 3" : undefined}
              />
              <text x={14} y={22} fontSize="13" fontWeight="600" fill="var(--vx-ink)">
                {id.length > 20 ? `${id.slice(0, 19)}…` : id}
              </text>
              <text x={14} y={40} fontSize="12" fill="var(--vx-ink-muted)">
                {(() => {
                  const text = [KIND[node.type] ?? node.type, describe(node)]
                    .filter(Boolean)
                    .join(": ");
                  return text.length > 26 ? `${text.slice(0, 25)}…` : text;
                })()}
              </text>
              {look ? (
                <circle cx={WIDTH - 14} cy={16} r={5} fill={look.stroke}>
                  <title>{look.label}</title>
                </circle>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
