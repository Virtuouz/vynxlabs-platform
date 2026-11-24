import { renameInNode } from "./flowRename.ts";

/**
 * Steps copied from a flow, and pasted into the same flow or another (phase
 * 15, P3-6). What is on the clipboard is plain JSON, marked so that only it
 * is taken as steps. Pasted steps whose names are taken get a suffix, as a
 * step added by hand does, and every reference between the pasted steps reads
 * the new names; references to steps outside them are left as they are.
 */

type FlowNode = Record<string, unknown> & { type: string };

export interface ClipStep {
  id: string;
  position: { x: number; y: number };
  node: FlowNode;
}
export interface ClipEdge {
  from: string;
  to: string;
  output?: string;
  error?: boolean;
}
export interface Clip {
  volvelFlowSteps: 1;
  steps: ClipStep[];
  edges: ClipEdge[];
}

/** The chosen steps and the connections between them, ready for the clipboard. */
export function copySteps(steps: ClipStep[], edges: ClipEdge[], chosen: Set<string>): Clip {
  return {
    volvelFlowSteps: 1,
    steps: steps.filter((step) => chosen.has(step.id)),
    // Only connections inside what was copied: one to a step left behind would dangle.
    edges: edges.filter((edge) => chosen.has(edge.from) && chosen.has(edge.to)),
  };
}

/** A step's name, as the flow's schema takes it. */
const STEP_NAME = /^[a-z][a-z0-9_]*$/;
/** The kinds of step a flow has. */
const STEP_TYPES = new Set([
  "trigger",
  "script",
  "subflow",
  "set",
  "respond",
  "branch",
  "foreach",
  "join",
  "delay",
  "approval",
  "fail",
]);

/** What reading the clipboard's text found: steps to paste, and what it could not take. */
export interface ClipReading {
  clip?: Clip;
  /** The steps left out, each with why, in words. */
  skipped: { id: string; why: string }[];
  /** Set when there are no steps to paste at all: why. */
  nothing?: string;
}

const NOT_STEPS = "What is on the clipboard is not steps copied from a flow.";

function whyNot(step: Partial<ClipStep> | undefined): string | undefined {
  if (typeof step?.id !== "string") return "it has no name";
  if (step.id.length > 63 || !STEP_NAME.test(step.id))
    return "its name must start with a lowercase letter and use only lowercase letters, digits and underscores, up to 63";
  if (typeof step.node?.type !== "string" || !STEP_TYPES.has(step.node.type))
    return `${typeof step.node?.type === "string" ? `"${step.node.type}"` : "it"} is not a kind of step`;
  if (!Number.isFinite(step.position?.x) || !Number.isFinite(step.position?.y))
    return "it has no position";
  return undefined;
}

/** Steps from the clipboard's text, with what was left out and why. */
export function readClipReport(text: string): ClipReading {
  let value: Partial<Clip> | undefined;
  try {
    value = JSON.parse(text) as Partial<Clip>;
  } catch {
    return { skipped: [], nothing: NOT_STEPS };
  }
  if (value?.volvelFlowSteps !== 1 || !Array.isArray(value.steps) || !Array.isArray(value.edges))
    return { skipped: [], nothing: NOT_STEPS };
  const steps: ClipStep[] = [];
  const skipped: { id: string; why: string }[] = [];
  for (const step of value.steps) {
    const why = whyNot(step);
    if (why) skipped.push({ id: typeof step?.id === "string" ? step.id : "A step", why });
    else steps.push(step);
  }
  if (steps.length === 0)
    return { skipped, nothing: "Nothing was pasted: no step on the clipboard can be used." };
  return { clip: { volvelFlowSteps: 1, steps, edges: value.edges as ClipEdge[] }, skipped };
}

/** Steps from the clipboard's text, or nothing when the text is something else. */
export function readClip(text: string): Clip | undefined {
  return readClipReport(text).clip;
}

/** A step name not yet taken: the name itself, or with `_2`, `_3` and on. */
function free(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  taken.add(id);
  return id;
}

/**
 * The steps to add when pasting `clip` among `existing` names, moved by
 * `offset`: renamed where taken, with their references and connections
 * following the new names. `renamed` maps each old name to its new one.
 */
export function pasteSteps(
  clip: Clip,
  existing: Iterable<string>,
  offset: { x: number; y: number },
): { steps: ClipStep[]; edges: ClipEdge[]; renamed: Record<string, string> } {
  const taken = new Set(existing);
  const renamed: Record<string, string> = {};
  for (const step of clip.steps) renamed[step.id] = free(step.id, taken);

  // In two passes, through names no step can have, so that renaming a to b and b to c
  // never turns a into c.
  const holding = (index: number) => `__vx_paste_${index}`;
  const order = clip.steps.map((step) => step.id);
  const steps = clip.steps.map((step) => {
    let node = step.node;
    order.forEach((from, index) => {
      if (renamed[from] !== from) node = renameInNode(node, from, holding(index)).node;
    });
    order.forEach((from, index) => {
      if (renamed[from] !== from)
        node = renameInNode(node, holding(index), renamed[from] as string).node;
    });
    return {
      id: renamed[step.id] as string,
      position: { x: step.position.x + offset.x, y: step.position.y + offset.y },
      node,
    };
  });
  const edges = clip.edges
    .filter((edge) => edge.from in renamed && edge.to in renamed)
    .map((edge) => ({
      ...edge,
      from: renamed[edge.from] as string,
      to: renamed[edge.to] as string,
    }));
  return { steps, edges, renamed };
}
