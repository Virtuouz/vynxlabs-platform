import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleMinus,
  CircleOff,
  CirclePause,
  CircleSlash,
  CircleX,
  Clock,
  GitBranch,
  Hourglass,
  Info,
  LoaderCircle,
  Lock,
  type LucideIcon,
  Mail,
  PencilLine,
  ShieldAlert,
  ShieldCheck,
  ToggleRight,
  TriangleAlert,
  Unlink,
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

type Tone = "neutral" | "subtle" | "action" | "attention" | "success" | "danger";
const TONE: Record<Tone, string> = {
  neutral: "text-ink-muted",
  subtle: "text-ink-subtle",
  action: "text-action",
  attention: "text-attention",
  success: "text-success",
  danger: "text-danger",
};

/**
 * Every state the console shows, in one map: a word, an icon and a tone. If a
 * value changes over an object's life it is a state, shown with `StatePill`.
 * If it is fixed when the object is made (its kind, where it comes from) it is
 * a `Tag`; if it is a number, a `Badge`.
 */
const STATES = {
  // A run's states, and a step's.
  queued: ["Queued", Clock, "neutral"],
  running: ["Running", LoaderCircle, "action"],
  waiting_approval: ["Waiting for approval", UserRoundCheck, "attention"],
  waiting_time: ["Waiting", Hourglass, "attention"],
  succeeded: ["Succeeded", CircleCheck, "success"],
  failed: ["Failed", CircleX, "danger"],
  canceled: ["Canceled", CircleSlash, "neutral"],
  skipped: ["Skipped", CircleDashed, "subtle"],
  // Something waiting on someone, or on a time.
  waiting: ["Waiting", CirclePause, "attention"],
  approved: ["Approved", CircleCheck, "success"],
  declined: ["Declined", CircleX, "danger"],
  // Lifecycle: what was written, and what runs.
  new: ["Not saved", CircleDashed, "subtle"],
  draft: ["Draft", PencilLine, "action"],
  unsaved: ["Unsaved changes", PencilLine, "attention"],
  deployed: ["Deployed", CircleCheck, "success"],
  repository: ["From the repository", GitBranch, "neutral"],
  retired: ["Retired", CircleMinus, "subtle"],
  outdated: ["Older version", TriangleAlert, "attention"],
  // A branch against what the workspace runs.
  never_pushed: ["Not pushed yet", CircleDashed, "subtle"],
  synced: ["In sync", CircleCheck, "success"],
  ahead: ["Ahead of the branch", CircleAlert, "attention"],
  behind: ["Behind the branch", CircleAlert, "attention"],
  conflict: ["Conflict", TriangleAlert, "danger"],
  sync_failed: ["Last sync failed", CircleX, "danger"],
  // Availability: of a person, a key or a grant.
  active: ["Active", CircleCheck, "success"],
  invited: ["Invited", Mail, "attention"],
  suspended: ["Suspended", CirclePause, "attention"],
  disabled: ["Disabled", Ban, "subtle"],
  revoked: ["Revoked", Ban, "danger"],
  expired: ["Expired", Clock, "subtle"],
  ended: ["Ended", CircleMinus, "subtle"],
  // A switch.
  on: ["On", ToggleRight, "success"],
  off: ["Off", CircleOff, "subtle"],
  paused: ["Paused", CirclePause, "attention"],
  // Health: whether something answers, or was proved.
  ok: ["OK", CircleCheck, "success"],
  reachable: ["Reachable", CircleCheck, "success"],
  unreachable: ["Not reachable", CircleX, "danger"],
  unchecked: ["Not checked", CircleDashed, "subtle"],
  verified: ["Verified", ShieldCheck, "success"],
  unverified: ["Not verified", ShieldAlert, "attention"],
  bound: ["Bound", CircleCheck, "success"],
  unbound: ["Not bound", Unlink, "attention"],
  disconnected: ["Not connected", Unlink, "attention"],
  posted: ["Posted", CircleCheck, "success"],
  not_posted: ["Not posted", CircleX, "danger"],
  allowed: ["Allowed", CircleCheck, "success"],
  denied: ["Denied", Ban, "danger"],
  // Notes.
  warning: ["Needs attention", TriangleAlert, "attention"],
  info: ["Note", Info, "action"],
  locked: ["Read-only", Lock, "neutral"],
  unknown: ["Unknown", CircleHelp, "neutral"],
} satisfies Record<string, [label: string, icon: LucideIcon, tone: Tone]>;

export type State = keyof typeof STATES;
export const STATE_NAMES = Object.keys(STATES) as State[];

/** A state's word, icon and tone. A value this console does not know is shown as it is. */
export const lookUp = (state: string): [string, LucideIcon, string] => {
  const known = Object.hasOwn(STATES, state) ? STATES[state as State] : undefined;
  if (!known) return [state || "Unknown", CircleHelp, TONE.neutral];
  return [known[0], known[1], TONE[known[2] as Tone]];
};

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * A state as an icon and a word in its color, never a filled chip, so color is
 * never the only sign. `children` says the same state in more words; `detail`
 * follows it, muted. A run waiting for a time says until when, given `until`.
 * Running is the one thing that moves, and not under reduced motion.
 */
export function StatePill({
  state,
  children,
  detail,
  until,
}: {
  state: State | (string & {});
  children?: ReactNode;
  detail?: ReactNode;
  until?: string | null | undefined;
}) {
  const [label, Icon, tone] = lookUp(state);
  const word = state === "waiting_time" && until ? `Waiting until ${time(until)}` : label;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon
        aria-hidden="true"
        size={14}
        className={`shrink-0 ${tone} ${state === "running" ? "animate-spin-slow" : ""}`}
      />
      <span className={`truncate ${tone}`}>{children ?? word}</span>
      {detail ? <span className="truncate text-meta text-ink-subtle">{detail}</span> : null}
    </span>
  );
}

export const stateOf = (status: string): State =>
  (Object.hasOwn(STATES, status) ? status : "unknown") as State;

/** A run state's word, for places that show no icon, such as a node's accessible name. */
export const stateLabel = (state: State) => lookUp(state)[0];

/** The color of a run state, as a token, for drawings such as a flow's graph. */
export const STATE_STROKE: Record<RunState, string> = {
  queued: "var(--vx-ink-muted)",
  running: "var(--vx-action)",
  waiting_approval: "var(--vx-attention)",
  waiting_time: "var(--vx-attention)",
  succeeded: "var(--vx-success)",
  failed: "var(--vx-danger)",
  canceled: "var(--vx-ink-muted)",
  skipped: "var(--vx-ink-subtle)",
};

export type TagTone =
  | "dev"
  | "production"
  | "draft"
  | "repository"
  | "live"
  | "neutral"
  | "attention"
  | "danger";

const TAGS: Record<TagTone, string> = {
  dev: "border-action/45 text-action",
  production: "border-attention/45 text-attention",
  draft: "border-action/60 border-dashed text-action",
  repository: "border-line-strong text-ink-muted",
  live: "border-success/45 text-success",
  neutral: "border-line-strong text-ink-muted",
  /** Something to notice that is not production, such as an operator's action. */
  attention: "border-attention/45 text-attention",
  danger: "border-danger/45 text-danger",
};

/** An outlined tag in capitals: an environment, where something comes from, or a lifecycle. */
export function Tag({ tone = "neutral", children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-inner border px-1.5 py-1 font-mono text-tag uppercase ${TAGS[tone]}`}
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
  return <span className={`font-mono text-code ${className}`}>{children}</span>;
}
