import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CirclePause,
  CircleX,
  Clock,
  Hourglass,
  Info,
  Lock,
  type LucideIcon,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * What a run, a flow run or a step is doing, as the server says it (`state`):
 * one vocabulary for every screen.
 */
export type RunState =
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_time"
  | "succeeded"
  | "failed"
  | "canceled"
  | "skipped";

export type State =
  | RunState
  | "waiting"
  | "paused"
  | "cancelled"
  | "retired"
  | "warning"
  | "info"
  | "locked"
  | "ok";

const STATES: Record<State, [label: string, icon: LucideIcon, tone: string]> = {
  // A run's states: the one map every screen uses.
  queued: ["Queued", Clock, "text-ink-muted"],
  running: ["Running", CircleDot, "text-action"],
  waiting_approval: ["Waiting for approval", UserRoundCheck, "text-attention"],
  waiting_time: ["Waiting", Hourglass, "text-attention"],
  succeeded: ["Succeeded", CircleCheck, "text-success"],
  failed: ["Failed", CircleX, "text-danger"],
  canceled: ["Canceled", CircleDashed, "text-ink-subtle"],
  skipped: ["Skipped", CircleDashed, "text-ink-subtle"],
  // Other things' states.
  ok: ["OK", CircleCheck, "text-success"],
  waiting: ["Waiting", CirclePause, "text-attention"],
  paused: ["Paused", CirclePause, "text-attention"],
  cancelled: ["Canceled", CircleDashed, "text-ink-subtle"],
  retired: ["Retired", CircleDashed, "text-ink-subtle"],
  warning: ["Needs attention", TriangleAlert, "text-attention"],
  info: ["Note", Info, "text-action"],
  locked: ["Read-only", Lock, "text-ink-muted"],
};

/**
 * A state as an icon and a word in its color, never a filled chip, so color is
 * never the only sign. `children` replaces the word; `detail` follows it, muted.
 */
export function StatePill({
  state,
  children,
  detail,
}: {
  state: State;
  children?: ReactNode;
  detail?: ReactNode;
}) {
  const [label, Icon, tone] = STATES[state];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon aria-hidden="true" size={14} strokeWidth={1.75} className={`shrink-0 ${tone}`} />
      <span className={`truncate ${tone}`}>{children ?? label}</span>
      {detail ? <span className="truncate text-meta text-ink-subtle">{detail}</span> : null}
    </span>
  );
}

export const stateOf = (status: string): State => (status in STATES ? status : "info") as State;

/** A run state's word, for places that show no icon, such as a node's accessible name. */
export const stateLabel = (state: State) => STATES[state][0];

/** The color of a run state, as a token, for drawings such as a flow's graph. */
export const STATE_STROKE: Record<RunState, string> = {
  queued: "var(--vx-ink-muted)",
  running: "var(--vx-action)",
  waiting_approval: "var(--vx-attention)",
  waiting_time: "var(--vx-attention)",
  succeeded: "var(--vx-success)",
  failed: "var(--vx-danger)",
  canceled: "var(--vx-ink-muted)",
  skipped: "var(--vx-line)",
};

export type TagTone = "dev" | "production" | "draft" | "repository" | "live" | "neutral" | "danger";

const TAGS: Record<TagTone, string> = {
  dev: "border-action/45 text-action",
  production: "border-attention/45 text-attention",
  draft: "border-action/60 border-dashed text-action",
  repository: "border-line-strong text-ink-muted",
  live: "border-success/45 text-success",
  neutral: "border-line-strong text-ink-muted",
  danger: "border-danger/45 text-danger",
};

/** An outlined tag in capitals: an environment, where something comes from, or a lifecycle. */
export function Tag({ tone = "neutral", children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[4px] border px-1.5 py-1 font-mono text-tag uppercase ${TAGS[tone]}`}
    >
      {children}
    </span>
  );
}

/** The environment of a workspace, the same everywhere: production is always amber. */
export function EnvTag({ type }: { type: "production" | "dev" }) {
  return (
    <Tag tone={type === "production" ? "production" : "dev"}>
      {type === "production" ? "Production" : "Dev"}
    </Tag>
  );
}

/** Counts, durations, identifiers and versions are set in the code face, so columns line up. */
export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-telemetry ${className}`}>{children}</span>;
}
