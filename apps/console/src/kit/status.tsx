import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CirclePause,
  CircleX,
  Clock,
  Info,
  Lock,
  type LucideIcon,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

export type State =
  | "succeeded"
  | "failed"
  | "running"
  | "queued"
  | "waiting"
  | "paused"
  | "cancelled"
  | "retired"
  | "warning"
  | "info"
  | "locked"
  | "ok";

const STATES: Record<State, [label: string, icon: LucideIcon, tone: string]> = {
  succeeded: ["Succeeded", CircleCheck, "text-success"],
  ok: ["OK", CircleCheck, "text-success"],
  failed: ["Failed", CircleX, "text-danger"],
  running: ["Running", CircleDot, "text-action"],
  queued: ["Queued", Clock, "text-ink-muted"],
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
