import { Button, Dialog, SegmentedControl, SideSheet, TextAreaField } from "@volvel/ui";
import { ChevronLeft, ChevronRight, CircleCheck, ExternalLink } from "@volvel/ui/icons";
import type { ApprovalItem, ApprovalsData, WidgetViewProps } from "@volvel/widgets";
import { formatNumber } from "@volvel/widgets";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { DotBadge } from "./cells.tsx";

/** What the Approvals widget's configuration holds (its definition has the words for each). */
interface ApprovalsConfig {
  look?: "rows" | "cards" | "queue";
  opens?: "sheet" | "modal" | "nothing";
  decided?: boolean;
  empty?: string;
  approveLabel?: string;
  rejectLabel?: string;
  askWhy?: "never" | "rejecting" | "always";
  confirm?: boolean;
  advance?: boolean;
}

/** What the widget says when nothing waits, and why a button is greyed. */
export const NOTHING_WAITS = "Nothing waits for you.";
const PENDING_MS = 220;

// ---------------------------------------------------------------------------
// Words: when, how much, who

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 hours ago", "in 2 days": the nearest of days, hours and minutes. */
export function relativeTime(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const size = Math.abs(seconds);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, length] of units) {
    if (size >= length) return RELATIVE.format(Math.round(seconds / length), unit);
  }
  return seconds < 0 ? "just now" : "in a moment";
}

/** When something that has happened happened: a clock a little ahead of the server's still says "just now". */
export function pastTime(iso: string, now: number): string {
  const ahead = new Date(iso).getTime() - now;
  return ahead > 0 && ahead < 60_000 ? "just now" : relativeTime(iso, now);
}

/** The meta line's parts: "Reorder", "asked 2 hours ago", "due in 2 days" (overdue says so, in danger). */
export function metaOf(
  item: ApprovalItem,
  now: number,
): { text: string; overdue: boolean; parts: { text: string; danger?: boolean }[] } {
  const overdue = item.timesOutAt !== null && new Date(item.timesOutAt).getTime() < now;
  const parts: { text: string; danger?: boolean }[] = [
    { text: item.flow.title },
    { text: `asked ${relativeTime(item.waitingSince, now)}` },
  ];
  if (item.timesOutAt)
    parts.push({
      text: `due ${relativeTime(item.timesOutAt, now)}`,
      ...(overdue ? { danger: true } : {}),
    });
  return { text: parts.map((one) => one.text).join(" · "), overdue, parts };
}

const MONEY = /(^|[_\s-])(total|amount|price|cost|fee|balance|spend|value|budget)$/i;
const DAY = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

/** One value of a step's details as a person reads it: money, dates and numbers by the one formatter. */
export function valueWords(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    return formatNumber(value, MONEY.test(name) ? { style: "currency" } : undefined);
  }
  if (typeof value === "string") {
    if (DAY.test(value)) {
      const at = new Date(value.length === 10 ? `${value}T00:00:00` : value);
      if (!Number.isNaN(at.getTime())) {
        return at.toLocaleDateString(undefined, { dateStyle: "medium" });
      }
    }
    return value;
  }
  return JSON.stringify(value);
}

/** Why the buttons are greyed, in the reader's words, or nothing when they may decide. */
export function whyNot(item: ApprovalItem, may: { building: boolean; can: boolean }): string {
  if (may.building) return "Buttons don't run while you're building.";
  if (!may.can) return "Deciding isn't available here.";
  if (item.mayDecide) return "";
  return item.approvers
    ? `Only ${item.approvers} can decide this.`
    : "You don't have permission to decide requests here.";
}

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The time, kept as the minute turns, so "asked 2 hours ago" stays true on a page left open. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);
  return now;
}

// ---------------------------------------------------------------------------
// One request, in full

function Fields({ item, compact }: { item: ApprovalItem; compact?: boolean }) {
  if (item.fields.length === 0) return null;
  return (
    <dl
      className={`m-0 grid gap-2 ${
        compact ? "grid-cols-2" : "grid-cols-1 @[28rem]/cell:grid-cols-2 @[48rem]/cell:grid-cols-3"
      }`}
    >
      {item.fields.map((field) => (
        <div
          key={field.name}
          data-field={field.name}
          className="flex min-w-0 flex-col gap-0.5 rounded-control border border-line bg-surface p-3"
        >
          <dt className="text-meta text-ink-muted">{field.label}</dt>
          <dd
            className={`m-0 min-w-0 break-words ${
              typeof field.value === "number" ? "tabular-nums" : ""
            } ${field.value === null || field.value === "" ? "text-ink-muted" : ""}`}
          >
            {valueWords(field.name, field.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The status chip of a request: waiting, overdue, or how it was decided. */
function Status({ item, overdue }: { item: ApprovalItem; overdue: boolean }) {
  if (item.decision) {
    return (
      <DotBadge tone={item.decision.approved ? "success" : "danger"}>
        {item.decision.approved ? "Approved" : "Rejected"}
      </DotBadge>
    );
  }
  return overdue ? (
    <DotBadge tone="danger">Overdue</DotBadge>
  ) : (
    <DotBadge tone="attention">Waiting</DotBadge>
  );
}

function Meta({ item, now }: { item: ApprovalItem; now: number }) {
  const meta = metaOf(item, now);
  return (
    <p className="m-0 text-body-sm text-ink-muted">
      {meta.parts.map((part, at) => (
        <span key={part.text}>
          {at > 0 ? " · " : ""}
          <span className={part.danger ? "text-danger" : undefined}>{part.text}</span>
        </span>
      ))}
    </p>
  );
}

/** What a decided request says: who, when, why. */
function Decision({ item, now }: { item: ApprovalItem; now: number }) {
  const decision = item.decision;
  if (!decision) return null;
  const where =
    decision.via === "app"
      ? "from an app"
      : decision.via === "email"
        ? "from the mail"
        : "in the console";
  return (
    <p className="m-0 text-body-sm text-ink-muted">
      <span className="text-ink">
        {decision.approved ? "Approved" : "Rejected"} by {decision.by}
      </span>
      {decision.at ? ` · ${pastTime(decision.at, now)}` : ""} · {where}
      {decision.comment ? <span className="block text-ink">“{decision.comment}”</span> : null}
    </p>
  );
}

interface DeciderProps {
  item: ApprovalItem;
  config: ApprovalsConfig;
  disabledReason: string;
  pending: boolean;
  /** Set when decisions are not taken here: the console's address, and what it is called. */
  decideIn?: { console: string; name: string } | undefined;
  /** Reads the requests again, when the person is back from deciding in the console. */
  refresh?: (() => void) | undefined;
  /** Decides, and says how it went: an error is drawn under the buttons. */
  onDecide: (
    item: ApprovalItem,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<string | undefined>;
}

/** Approve and Reject, and what each asks first. Keyed by the request, so it starts afresh for each. */
function Decider({
  item,
  config,
  disabledReason,
  pending,
  onDecide,
  decideIn,
  refresh,
}: DeciderProps) {
  const approve = config.approveLabel || "Approve";
  const reject = config.rejectLabel || "Reject";
  const askWhy = config.askWhy ?? "rejecting";
  const [asking, setAsking] = useState<"approve" | "reject" | "confirm" | undefined>();
  const [comment, setComment] = useState("");
  const [problem, setProblem] = useState<string>();
  const box = useRef<HTMLDivElement>(null);
  const reasonId = useId();
  const blocked = disabledReason !== "";
  const needs = (which: "approve" | "reject") =>
    askWhy === "always" || (askWhy !== "never" && which === "reject");

  // Opening the box puts the cursor in it: the reason is what comes next.
  useEffect(() => {
    if (asking === "approve" || asking === "reject")
      box.current?.querySelector("textarea")?.focus();
    if (asking === "confirm") box.current?.querySelector("button")?.focus();
  }, [asking]);

  const run = async (decision: "approve" | "reject") => {
    const text = comment.trim();
    if (needs(decision) && text === "") {
      setProblem(decision === "reject" ? "Say why it is rejected." : "Say why.");
      return;
    }
    setProblem(undefined);
    const failed = await onDecide(item, decision, text === "" ? undefined : text);
    if (failed) setProblem(failed);
  };
  const choose = (which: "approve" | "reject") => {
    setProblem(undefined);
    if (which === "reject" || needs("approve")) setAsking(which);
    else if (config.confirm) setAsking("confirm");
    else void run("approve");
  };
  const cancel = () => {
    setAsking(undefined);
    setComment("");
    setProblem(undefined);
  };
  // Decisions are made in the console here: one button opens the request there, and the list
  // reads again when the person comes back to this window.
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!away) return;
    const back = () => {
      setAway(false);
      refresh?.();
    };
    window.addEventListener("focus", back);
    return () => window.removeEventListener("focus", back);
  }, [away, refresh]);
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape" && asking) {
      event.stopPropagation();
      cancel();
    }
  };

  if (decideIn && !blocked) {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <Button
            variant="primary"
            href={decideIn.console}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full @[28rem]/cell:w-auto"
            onClick={() => setAway(true)}
          >
            Decide in {decideIn.name}
            <ExternalLink aria-hidden="true" size={14} />
          </Button>
        </div>
        <p className="m-0 text-body-sm text-ink-muted">
          Approvals are decided in {decideIn.name}, which opens in a new tab. This list reads again
          when you come back.
        </p>
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape leaves the box that opened under it
    <div ref={box} className="flex flex-col gap-3" onKeyDown={keys}>
      <div className="flex flex-col gap-2 @[28rem]/cell:flex-row">
        <Button
          variant="primary"
          disabled={blocked || pending}
          loading={pending && asking !== "reject"}
          aria-describedby={blocked ? reasonId : undefined}
          tooltip={blocked ? disabledReason : undefined}
          className="w-full @[28rem]/cell:w-auto"
          onClick={() => choose("approve")}
        >
          {approve}
        </Button>
        <Button
          variant="danger"
          disabled={blocked || pending}
          aria-describedby={blocked ? reasonId : undefined}
          tooltip={blocked ? disabledReason : undefined}
          className="w-full @[28rem]/cell:w-auto"
          onClick={() => choose("reject")}
        >
          {reject}
        </Button>
      </div>
      {blocked ? (
        <p id={reasonId} className="m-0 text-body-sm text-ink-muted">
          {disabledReason}
        </p>
      ) : null}
      {asking === "confirm" ? (
        <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken p-3">
          <p className="m-0 text-body-sm">
            {approve} “{item.title}”?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={pending} onClick={() => void run("approve")}>
              {approve}
            </Button>
            <Button variant="quiet" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {asking === "approve" || asking === "reject" ? (
        <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken p-3">
          <TextAreaField
            label={
              asking === "reject"
                ? needs("reject")
                  ? "Why are you rejecting this?"
                  : "Why are you rejecting this? (optional)"
                : "Why are you approving this?"
            }
            name="reason"
            rows={2}
            value={comment}
            maxLength={2000}
            error={problem}
            onChange={(next: string) => {
              setComment(next);
              if (problem) setProblem(undefined);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant={asking === "reject" ? "danger" : "primary"}
              loading={pending}
              onClick={() => void run(asking)}
            >
              {asking === "reject" ? reject : approve}
            </Button>
            <Button variant="quiet" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {problem && asking === undefined ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

interface DetailProps extends Omit<DeciderProps, "disabledReason"> {
  now: number;
  disabledReason: string;
  /** What someone else's decision said, when it was found out after this one was shown. */
  settled?: string | undefined;
  onDismiss?: (() => void) | undefined;
  heading?: "h3" | "h4";
  /** The title is written by what holds the detail (a sheet's header), so it is not written twice. */
  untitled?: boolean;
  sample?: boolean;
}

/** One request in full, as Record detail draws a record: title and status, the meta line, the fields, the buttons. */
function Detail(props: DetailProps) {
  const { item, now, settled, onDismiss, config, pending, onDecide, disabledReason, sample } =
    props;
  const Heading = props.heading ?? "h3";
  const meta = metaOf(item, now);
  return (
    <article
      data-approval-detail={item.id}
      className="flex min-w-0 flex-col gap-4"
      aria-label={item.title}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {props.untitled ? null : (
          <Heading className="m-0 min-w-0 break-words text-display font-semibold">
            {item.title}
          </Heading>
        )}
        {settled ? (
          <DotBadge tone="neutral">Decided</DotBadge>
        ) : (
          <Status item={item} overdue={meta.overdue} />
        )}
        {sample ? (
          <span className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-meta text-ink-muted">
            Sample
          </span>
        ) : null}
      </div>
      <Meta item={item} now={now} />
      <Fields item={item} />
      {item.decision ? (
        <Decision item={item} now={now} />
      ) : settled ? (
        <div role="status" className="flex flex-col gap-2 rounded-control bg-attention-soft p-3">
          <p className="m-0 text-body-sm text-ink">{settled}</p>
          {onDismiss ? (
            <div>
              <Button size="small" variant="secondary" onClick={onDismiss}>
                Done
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Decider
          key={item.id}
          item={item}
          config={config}
          disabledReason={disabledReason}
          pending={pending}
          onDecide={onDecide}
          decideIn={props.decideIn}
          refresh={props.refresh}
        />
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// The list

/** A request as a row to choose: title, a line under it, and its status. */
function Row({
  item,
  now,
  selected,
  leaving,
  open,
  onOpen,
  onFocus,
  card,
  chevron = true,
  settled,
}: {
  item: ApprovalItem;
  now: number;
  selected: boolean;
  leaving: boolean;
  open: boolean;
  onOpen?: (() => void) | undefined;
  onFocus?: (() => void) | undefined;
  card?: boolean;
  /** A row that opens something says so with a chevron; one that is only chosen does not. */
  chevron?: boolean;
  settled?: boolean;
}) {
  const meta = metaOf(item, now);
  const lead = item.fields.slice(0, 2).map((field) => valueWords(field.name, field.value));
  return (
    <li
      data-leaving={leaving ? "" : undefined}
      className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity] motion-base data-[leaving]:grid-rows-[0fr] data-[leaving]:opacity-0 motion-reduce:transition-none"
    >
      <div className="min-h-0 overflow-hidden">
        <div
          data-approval-row={item.id}
          data-selected={selected ? "" : undefined}
          aria-current={selected ? "true" : undefined}
          // Only a row that opens something is pressed, and that one takes Enter and Space.
          {...(open
            ? {
                role: "button",
                tabIndex: leaving ? undefined : 0,
                "aria-label": `${item.title}, ${meta.text}`,
                onClick: onOpen,
                onFocus,
                onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen?.();
                  }
                },
              }
            : {})}
          className={`flex min-w-0 items-center gap-3 outline-none ${
            card
              ? "rounded-control border border-line bg-surface p-3 data-[selected]:border-action"
              : "border-b border-l-2 border-line border-l-transparent px-2 py-3 data-[selected]:border-l-action"
          } ${
            open
              ? "cursor-pointer hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action data-[selected]:bg-sunken"
              : ""
          }`}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <strong className="block truncate font-medium">{item.title}</strong>
            {lead.length > 0 ? (
              <span className="truncate text-body-sm text-ink-muted">{lead.join(" · ")}</span>
            ) : null}
            <span
              className={`truncate text-meta ${meta.overdue ? "text-danger" : "text-ink-muted"}`}
            >
              {meta.text}
            </span>
          </span>
          {settled ? (
            <DotBadge tone="neutral">Decided</DotBadge>
          ) : meta.overdue ? (
            <DotBadge tone="danger">Overdue</DotBadge>
          ) : null}
          {open && chevron ? (
            <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-ink-muted" />
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** A request that was decided: who, what, when, and why, with the details it was asked on. */
function DecidedRow({ item, now }: { item: ApprovalItem; now: number }) {
  const lead = item.fields.slice(0, 3).map((field) => valueWords(field.name, field.value));
  return (
    <li className="flex min-w-0 flex-col gap-1 border-b border-line px-2 py-3 last:border-b-0">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <strong className="min-w-0 truncate font-medium">{item.title}</strong>
        <Status item={item} overdue={false} />
      </span>
      {lead.length > 0 ? (
        <span className="truncate text-body-sm text-ink-muted">
          {item.flow.title} · {lead.join(" · ")}
        </span>
      ) : null}
      <Decision item={item} now={now} />
    </li>
  );
}

/** Moves the focus along a list of rows with the arrows, Home and End. */
function arrows(event: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const rows = [
    ...event.currentTarget.querySelectorAll<HTMLElement>("[data-approval-row][tabindex]"),
  ];
  if (rows.length === 0) return;
  const at = rows.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)));
  event.preventDefault();
  rows[next]?.focus();
}

// ---------------------------------------------------------------------------
// What the widget shows when nothing is on the page to decide

const sampleOf = (now: number): ApprovalItem => ({
  id: "sample/ask",
  title: "Approve a stock order",
  flow: { path: "orders/reorder", title: "Reorder" },
  fields: [
    { name: "clinic", label: "Clinic", value: "northside" },
    { name: "item", label: "Item", value: "Gauze, 10 cm" },
    { name: "total", label: "Total", value: 184 },
  ],
  waitingSince: new Date(now - 2 * 3_600_000).toISOString(),
  timesOutAt: new Date(now + 2 * 86_400_000).toISOString(),
  mayDecide: true,
  approvers: null,
});

// ---------------------------------------------------------------------------
// The widget

/**
 * Requests waiting for a decision. A list of what waits, rows, cards or a queue (the list at
 * the left with the chosen one's detail beside it, or under it when the widget is narrow), and
 * for each: its details as Record detail draws a record, and Approve and Reject. The browser
 * never asks the API: it is given `decide`, and the server checks who may.
 */
export function ApprovalsView(props: WidgetViewProps<ApprovalsConfig>) {
  const { config, data, building, decide, size } = props;
  const input = data.requests;
  const now = useNow();
  const look = config.look ?? "rows";
  const opens = config.opens ?? "sheet";
  const advance = config.advance !== false;
  const region = useRef<HTMLDivElement>(null);
  const lastSheet = useRef<string>(undefined);

  const [view, setView] = useState<"waiting" | "decided">("waiting");
  const [selected, setSelected] = useState<string>();
  const [sheet, setSheet] = useState<string>();
  const [pending, setPending] = useState<Set<string>>(new Set());
  // A request someone else decided first stays, saying who and what, until it is put away.
  const [settled, setSettled] = useState<
    Map<string, { message: string; item: ApprovalItem; at: number }>
  >(new Map());
  // What has just been decided, until it has left. With reduced motion it is not drawn at all.
  const [leaving, setLeaving] = useState<
    Map<string, { item: ApprovalItem; at: number; still: boolean }>
  >(new Map());
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string }>();
  const [focus, setFocus] = useState<string | null>();

  const real = input?.shape === "approvals" ? (input as ApprovalsData) : undefined;
  const waiting = real?.waiting ?? [];
  const decidedOnes = real?.decided ?? [];
  // A page being built with nothing waiting shows what a request looks like, said to be a sample.
  const sample = building && waiting.length === 0 && leaving.size === 0;
  const base = useMemo(() => (sample ? [sampleOf(now)] : waiting), [sample, now, waiting]);

  // What is drawn: what waits, with what has just been decided kept in its place until it has left.
  const list = useMemo(() => {
    const shown = base
      .filter((item) => leaving.get(item.id)?.still !== true)
      .map((item) => ({ item, leaving: leaving.has(item.id) }));
    for (const [id, ghost] of leaving) {
      if (!ghost.still && !base.some((item) => item.id === id)) {
        shown.splice(Math.min(ghost.at, shown.length), 0, { item: ghost.item, leaving: true });
      }
    }
    for (const [id, held] of settled) {
      if (!base.some((item) => item.id === id) && !leaving.has(id)) {
        shown.splice(Math.min(held.at, shown.length), 0, { item: held.item, leaving: false });
      }
    }
    return shown;
  }, [base, leaving, settled]);
  const live = list.filter((one) => !one.leaving).map((one) => one.item);
  const current =
    look === "queue" ? (live.find((item) => item.id === selected) ?? live[0]) : undefined;
  const inSheet = sheet ? live.find((item) => item.id === sheet) : undefined;
  if (sheet) lastSheet.current = sheet;

  const reasonFor = (item: ApprovalItem) =>
    whyNot(item, { building: building === true, can: decide !== undefined });

  // The focus goes to the next request, or to the widget when none is left: not the top of the page.
  useEffect(() => {
    if (focus === undefined) return;
    const target =
      focus === null
        ? null
        : (region.current?.querySelector<HTMLElement>(
            `[data-approval-row="${CSS.escape(focus)}"]`,
          ) ??
          region.current?.querySelector<HTMLElement>(
            `[data-approval-detail="${CSS.escape(focus)}"]`,
          ));
    (target ?? region.current)?.focus({ preventScroll: true });
    setFocus(undefined);
  }, [focus]);

  const leave = useCallback((item: ApprovalItem, at: number) => {
    setLeaving((now) => new Map(now).set(item.id, { item, at, still: reducedMotion() }));
    setTimeout(
      () =>
        setLeaving((now) => {
          const next = new Map(now);
          next.delete(item.id);
          return next;
        }),
      PENDING_MS,
    );
  }, []);

  const onDecide = async (
    item: ApprovalItem,
    decision: "approve" | "reject",
    comment?: string,
  ): Promise<string | undefined> => {
    if (!decide || building) return "Deciding isn't available here.";
    setPending((now) => new Set(now).add(item.id));
    let outcome: Awaited<ReturnType<typeof decide>>;
    try {
      outcome = await decide(item.id, decision, comment);
    } catch (error) {
      outcome = {
        ok: false,
        message: error instanceof Error ? error.message : "It could not be decided.",
      };
    }
    setPending((now) => {
      const next = new Set(now);
      next.delete(item.id);
      return next;
    });
    if (!outcome.ok) {
      if (outcome.conflict) {
        // Someone else got there first: the request says who and what, and stays to be read.
        const at = Math.max(
          0,
          live.findIndex((one) => one.id === item.id),
        );
        setSettled((now) => new Map(now).set(item.id, { message: outcome.message, item, at }));
        return undefined;
      }
      return outcome.message;
    }
    // Decided: the notice says who and what, the request leaves, and the focus goes to the next.
    const at = live.findIndex((one) => one.id === item.id);
    const next = live[at + 1] ?? live[at - 1];
    setNotice({ tone: "success", text: outcome.message });
    leave(item, Math.max(0, at));
    if (advance && next) {
      setSelected(next.id);
      if (sheet) setSheet(next.id);
      setFocus(next.id);
    } else {
      setSelected(undefined);
      setSheet(undefined);
      setFocus(null);
    }
    return undefined;
  };

  const detail = (item: ApprovalItem, heading?: "h3" | "h4", untitled = false) => (
    <Detail
      item={item}
      now={now}
      config={config}
      disabledReason={reasonFor(item)}
      pending={pending.has(item.id)}
      decideIn={real?.decideIn}
      refresh={props.refresh}
      settled={settled.get(item.id)?.message}
      onDismiss={() => {
        setSettled((now) => {
          const next = new Map(now);
          next.delete(item.id);
          return next;
        });
        leave(
          item,
          Math.max(
            0,
            live.findIndex((one) => one.id === item.id),
          ),
        );
        setSheet(undefined);
      }}
      onDecide={onDecide}
      {...(heading ? { heading } : {})}
      {...(untitled ? { untitled: true } : {})}
      {...(sample ? { sample: true } : {})}
    />
  );

  const showDecided = config.decided === true && !sample;
  const tabs = showDecided ? (
    <div className="self-start">
      <SegmentedControl
        label="Show"
        size="small"
        value={view}
        onChange={setView}
        options={[
          { value: "waiting", label: "Waiting", count: waiting.length },
          { value: "decided", label: "Decided", count: decidedOnes.length },
        ]}
      />
    </div>
  ) : null;

  const noticeBar = notice ? (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start justify-between gap-2 rounded-control px-3 py-2 text-body-sm ${
        notice.tone === "success" ? "bg-success-soft text-ink" : "bg-attention-soft text-ink"
      }`}
    >
      <span>{notice.text}</span>
      <button
        type="button"
        onClick={() => setNotice(undefined)}
        className="shrink-0 cursor-pointer rounded-inner px-1 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        Dismiss
      </button>
    </div>
  ) : null;

  const empty = (
    <div
      data-approvals-empty=""
      className="flex flex-col items-center gap-2 rounded-panel border border-dashed border-line px-5 py-8 text-center"
    >
      <CircleCheck aria-hidden="true" size={20} className="text-ink-muted" />
      <p className="m-0 text-ink-muted">{config.empty || NOTHING_WAITS}</p>
    </div>
  );

  const rowOf = (entry: { item: ApprovalItem; leaving: boolean }, card = false) => {
    const { item } = entry;
    const open = look === "queue" || opens !== "nothing";
    return (
      <Row
        key={item.id}
        item={item}
        now={now}
        card={card}
        chevron={look !== "queue"}
        leaving={entry.leaving}
        open={open}
        selected={look === "queue" ? current?.id === item.id : sheet === item.id}
        settled={settled.has(item.id)}
        onFocus={look === "queue" && !entry.leaving ? () => setSelected(item.id) : undefined}
        onOpen={() => {
          if (look === "queue") {
            setSelected(item.id);
            region.current
              ?.querySelector<HTMLElement>(`[data-approval-detail="${CSS.escape(item.id)}"] button`)
              ?.focus();
          } else setSheet(item.id);
        }}
      />
    );
  };

  const waitingBody = (() => {
    if (list.length === 0) return empty;
    if (look === "queue") {
      return (
        <div className="grid items-start gap-4 @[40rem]/cell:grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)]">
          <ul
            aria-label="Requests waiting"
            onKeyDown={arrows}
            className="m-0 flex list-none flex-col p-0 @[40rem]/cell:max-h-[32rem] @[40rem]/cell:overflow-y-auto"
          >
            {list.map((entry) => rowOf(entry))}
          </ul>
          <div className="min-w-0 rounded-panel border border-line p-4">
            {current ? (
              detail(current)
            ) : (
              <p className="m-0 text-ink-muted">Choose one to read it.</p>
            )}
          </div>
        </div>
      );
    }
    if (opens === "nothing") {
      return (
        <ul
          aria-label="Requests waiting"
          className={`m-0 list-none gap-3 p-0 ${
            look === "cards"
              ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]"
              : "flex flex-col"
          }`}
        >
          {list.map(({ item, leaving: going }) => (
            <li
              key={item.id}
              data-leaving={going ? "" : undefined}
              className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity] motion-base data-[leaving]:grid-rows-[0fr] data-[leaving]:opacity-0 motion-reduce:transition-none"
            >
              <div className="min-h-0 overflow-hidden">
                <div className="rounded-panel border border-line p-4">{detail(item, "h3")}</div>
              </div>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul
        aria-label="Requests waiting"
        onKeyDown={arrows}
        className={`m-0 list-none p-0 ${
          look === "cards"
            ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3"
            : "flex flex-col"
        }`}
      >
        {list.map((entry) => rowOf(entry, look === "cards"))}
      </ul>
    );
  })();

  // The side sheet (or modal) the rows and cards open, stepping through the requests as board 3 does.
  const at = inSheet ? live.findIndex((one) => one.id === inSheet.id) : -1;
  const stepper = inSheet ? (
    <div className="flex w-full items-center justify-between gap-2">
      <Button
        variant="quiet"
        size="small"
        disabled={at <= 0}
        onClick={() => {
          const before = live[at - 1];
          if (before) setSheet(before.id);
        }}
      >
        <ChevronLeft aria-hidden="true" size={14} />
        Previous
      </Button>
      <span className="text-body-sm text-ink-muted tabular-nums">
        {at + 1} of {live.length}
      </span>
      <Button
        variant="quiet"
        size="small"
        disabled={at >= live.length - 1}
        onClick={() => {
          const after = live[at + 1];
          if (after) setSheet(after.id);
        }}
      >
        Next
        <ChevronRight aria-hidden="true" size={14} />
      </Button>
    </div>
  ) : null;
  // Closing a sheet gives the focus back to the row it was last on, which is no longer `sheet` by then.
  const returnTo = () =>
    region.current?.querySelector<HTMLElement>(
      `[data-approval-row="${CSS.escape(lastSheet.current ?? "")}"]`,
    ) ?? region.current;
  const overlay =
    !building && look !== "queue" && opens !== "nothing" ? (
      opens === "modal" ? (
        <Dialog
          open={inSheet !== undefined}
          onClose={() => setSheet(undefined)}
          title={inSheet?.title ?? "Request"}
          description={inSheet?.flow.title}
          footer={stepper}
          size="wide"
        >
          {inSheet ? detail(inSheet, "h4", true) : null}
        </Dialog>
      ) : (
        <SideSheet
          open={inSheet !== undefined}
          onClose={() => setSheet(undefined)}
          title={inSheet?.title ?? "Request"}
          description={inSheet?.flow.title}
          footer={stepper}
          returnFocus={returnTo}
        >
          {inSheet ? detail(inSheet, "h4", true) : null}
        </SideSheet>
      )
    ) : null;

  const decidedBody =
    decidedOnes.length === 0 ? (
      <p className="m-0 text-ink-muted">Nothing has been decided yet.</p>
    ) : (
      <ul aria-label="Decided requests" className="m-0 flex list-none flex-col p-0">
        {decidedOnes.map((item) => (
          <DecidedRow key={item.id} item={item} now={now} />
        ))}
      </ul>
    );

  return (
    <div
      ref={region}
      tabIndex={-1}
      data-approvals=""
      data-narrow={size.narrow ? "" : undefined}
      className="flex min-w-0 flex-col gap-3 outline-none"
    >
      {sample ? (
        <p className="m-0 text-body-sm text-ink-muted">
          Nothing waits right now. This is a sample of what each request will look like.
        </p>
      ) : null}
      {tabs}
      {noticeBar}
      {view === "decided" && showDecided ? decidedBody : waitingBody}
      {real?.more && view === "waiting" ? (
        <p className="m-0 text-body-sm text-ink-muted">
          More are waiting than are shown. Decide these first and the rest follow.
        </p>
      ) : null}
      {overlay}
    </div>
  );
}
