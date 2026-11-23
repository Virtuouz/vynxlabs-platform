import { sql } from "@volvel/db";
import type { PageWidget } from "@volvel/manifest";
import { DEFAULT_PRODUCT_NAME } from "../../routes/branding.js";
import type { Db, Principal } from "../audit.js";
import { check } from "../authorize.js";
import { badRequest, conflict, forbiddenBecause, HttpError, notFound } from "../errors.js";
import { approvalDetail } from "../flows/approval-detail.js";
import { approversOf, approverTitles, describeApprovers, isApprover } from "../flows/approvers.js";
import { decideApproval, kickFlow } from "../flows/engine.js";
import type { RequestContext } from "../http.js";
import type { Kernel } from "../kernel.js";
import { type LocatedPage, locatePage, type PageRequest } from "./locate.js";
import { inGroups } from "./who.js";

/**
 * Approvals from an app (decision 0007). A widget of the page names the flows whose waiting
 * approval steps it shows; the browser asks to read them and to decide one, by the widget, and
 * the server does the rest. Nothing here is reached by anyone but a member acting as themselves:
 * an end user, a guest and a service account read nothing and decide nothing, and a member's
 * standing is their own (`approval:read`, `approval:write`, and the step's named approvers), not
 * what an app's sign-in may reach and not an operator's access grant. `approval` is not an
 * app-facing permission, and this does not make it one.
 */

/** The source of a widget's approvals input, as the page stores it. */
interface Source {
  flows?: string[];
  whose?: "mine" | "all";
}

/** The most steps waiting that are sent, and the most decided ones. */
export const WAITING_LIMIT = 50;
export const DECIDED_LIMIT = 30;
/** The most characters of one value of a step's detail that leave the server. */
const VALUE_LIMIT = 1000;
/** The most characters of a comment. */
export const COMMENT_LIMIT = 2000;

export interface ApprovalItem {
  id: string;
  title: string;
  flow: { path: string; title: string };
  fields: { name: string; label: string; value: unknown }[];
  waitingSince: string;
  timesOutAt: string | null;
  mayDecide: boolean;
  approvers: string | null;
  decision?: {
    approved: boolean;
    by: string;
    at: string | null;
    comment: string | null;
    via: "app" | "console" | "email";
  };
}

export interface ApprovalsWire {
  shape: "approvals";
  /**
   * Set when this address cannot take a decision (an app written as code can run here): the
   * requests are shown, and are decided in the console, at `console`, which `name` calls itself.
   */
  decideIn?: { console: string; name: string };
  waiting: ApprovalItem[];
  decided: ApprovalItem[];
  more: boolean;
}

const EMPTY: ApprovalsWire = { shape: "approvals", waiting: [], decided: [], more: false };

const humanize = (name: string) => {
  const text = name
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? name : (text[0] as string).toUpperCase() + text.slice(1);
};

/** The source of the widget's approvals input, when it has one. */
export function approvalsSourceOf(widget: PageWidget): Source | undefined {
  for (const input of Object.values(widget.data ?? {})) {
    if ("approvals" in input.source) return input.source.approvals;
  }
  return undefined;
}

/** The fields a widget names, in order: those not hidden. `undefined` when it names none. */
function namedFields(widget: PageWidget): { name: string; label?: string }[] | undefined {
  const listed = widget.config?.fields;
  if (!Array.isArray(listed) || listed.length === 0) return undefined;
  const out: { name: string; label?: string }[] = [];
  for (const one of listed as unknown[]) {
    if (typeof one === "string") out.push({ name: one });
    else if (one && typeof one === "object") {
      const field = one as { name?: unknown; label?: unknown; hidden?: unknown };
      if (typeof field.name !== "string" || field.hidden === true) continue;
      out.push({
        name: field.name,
        ...(typeof field.label === "string" && field.label !== "" ? { label: field.label } : {}),
      });
    }
  }
  return out;
}

/** What leaves the server of a value: no secret (redacted already), and not without end. */
function limited(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > VALUE_LIMIT ? `${value.slice(0, VALUE_LIMIT)}…` : value;
  }
  if (value !== null && typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT)}…` : value;
  }
  return value;
}

/**
 * The detail a step kept, as the widget shows it: redacted as the approvals list redacts it,
 * and when the widget names fields, only those; left to say nothing, the first four.
 */
export function fieldsOf(
  detail: unknown,
  widget: PageWidget,
): { name: string; label: string; value: unknown }[] {
  const safe = approvalDetail(detail);
  if (safe === null || safe === undefined) return [];
  const named = namedFields(widget);
  if (safe === null || typeof safe !== "object" || Array.isArray(safe)) {
    return [{ name: "detail", label: "Details", value: limited(safe) }];
  }
  const record = safe as Record<string, unknown>;
  if (named) {
    return named
      .filter((one) => one.name in record)
      .map((one) => ({
        name: one.name,
        label: one.label ?? humanize(one.name),
        value: limited(record[one.name]),
      }));
  }
  return Object.entries(record)
    .slice(0, 4)
    .map(([name, value]) => ({ name, label: humanize(name), value: limited(value) }));
}

/**
 * A member's own standing for approvals in a workspace, or nothing: not a member (an end
 * user, a guest, a service account), a member of the tenant who is suspended or disabled, or
 * one whose access comes from an operator's grant. It is the member's own: what the tenant's
 * roles give them, without the limit an app sign-in puts on what the request may reach, as the
 * approval mail asks (`approverMembers`).
 */
export async function approvalStanding(
  db: Db,
  principal: Principal,
  at: { tenantId: string; workspaceId: string },
): Promise<{ memberId: string; read: boolean; write: boolean } | undefined> {
  if (principal.type !== "member" || !principal.id) return undefined;
  const memberId = principal.id;
  const row = await db
    .selectFrom("tenant_member")
    .innerJoin("member", "member.id", "tenant_member.member_id")
    .select("member.id")
    .where("tenant_member.tenant_id", "=", at.tenantId)
    .where("tenant_member.member_id", "=", memberId)
    .where("tenant_member.suspended_at", "is", null)
    .where("member.disabled_at", "is", null)
    .executeTakeFirst();
  if (!row) return undefined;
  const own: Principal = { type: "member", id: memberId };
  const may = async (permission: string) => {
    const decision = await check(db, own, permission, at);
    return decision.allowed && !decision.accessGrantId;
  };
  const read = await may("approval:read");
  const write = await may("approval:write");
  if (!read && !write) return undefined;
  return { memberId, read, write };
}

/** The widget's `seenBy` groups, held to on the server too: someone outside them is shown nothing. */
async function seenBy(
  kernel: Kernel,
  widget: PageWidget,
  tenantId: string,
  memberId: string,
  draft: boolean,
): Promise<boolean> {
  const groups = widget.rules?.seenBy?.groups;
  // Someone building the page sees the widget whoever it is for.
  if (draft || !groups || groups.length === 0) return true;
  return inGroups(kernel, tenantId, { type: "member", id: memberId }, groups);
}

const flowTitles = async (
  db: Db,
  workspaceId: string,
  paths: readonly string[],
): Promise<Map<string, string>> => {
  const titles = new Map<string, string>();
  if (paths.length === 0) return titles;
  const rows = await db
    .selectFrom("resource")
    .select(["path", "title"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "=", "flow")
    .where("path", "in", [...paths])
    .execute();
  for (const row of rows) if (row.title) titles.set(row.path, row.title);
  return titles;
};

const titleOfFlow = (titles: Map<string, string>, path: string) =>
  titles.get(path) ?? humanize(path.split("/").at(-1) ?? path);

/** The id a step goes by in a widget: its flow run and its step. */
export const itemId = (flowRunId: string, node: string) => `${flowRunId}/${node}`;

/** Splits an id made by `itemId`. A run's ID has no slash, so the first one divides them. */
export function splitItemId(id: string): { flowRunId: string; node: string } | undefined {
  const at = id.indexOf("/");
  if (at <= 0 || at === id.length - 1) return undefined;
  return { flowRunId: id.slice(0, at), node: id.slice(at + 1) };
}

/** How many steps are looked at in one batch, and the most batches one read looks through. */
export const limits = { batch: 200, batches: 10 };

/** A place in the order the waiting steps are read in: the time as the database keeps it, to the microsecond. */
interface Place {
  at: string;
  run: string;
  node: string;
}

/** One batch of waiting steps of the workspace, oldest first, after a place in that order. */
function waitingBatch(
  db: Db,
  at: { tenantId: string; workspaceId: string },
  flows: string[] | undefined,
  after: Place | undefined,
) {
  return db
    .selectFrom("step_run")
    .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
    .select([
      "step_run.flow_run_id",
      "step_run.node_id",
      "step_run.detail",
      "step_run.started_at",
      "step_run.wake_at",
      "flow_run.flow_path",
      sql<string>`step_run.started_at::text`.as("started"),
    ])
    .where("flow_run.tenant_id", "=", at.tenantId)
    .where("flow_run.workspace_id", "=", at.workspaceId)
    .where("flow_run.status", "=", "running")
    .where("step_run.status", "=", "waiting")
    .where("step_run.item_key", "=", "")
    .where(sql<boolean>`step_run.detail ? 'title'`)
    .$if(flows !== undefined, (query) => query.where("flow_run.flow_path", "in", flows as string[]))
    .$if(after !== undefined, (query) =>
      query.where(
        sql<boolean>`(step_run.started_at, step_run.flow_run_id, step_run.node_id)
          > (${after?.at}::timestamptz, ${after?.run}::uuid, ${after?.node})`,
      ),
    )
    .orderBy("step_run.started_at")
    .orderBy("step_run.flow_run_id")
    .orderBy("step_run.node_id")
    .limit(limits.batch)
    .execute();
}

/** Where a decision was made, from what the step and its mailed links say. */
type Via = "app" | "console" | "email";

/**
 * What an approvals widget shows to whoever is looking: the steps of its flows that wait, those
 * of them that the viewer may decide when `whose` is `mine`, and, when the widget shows them, the
 * last ones decided. A viewer who is not a member, or has no `approval:read` of their own here,
 * is given nothing: no titles and no counts.
 */
export async function readApprovals(
  kernel: Kernel,
  ctx: RequestContext,
  request: {
    at: { tenantId: string; workspaceId: string };
    widget: PageWidget;
    draft: boolean;
    /** The request arrived at an address where decisions are not taken (`Hosts.runsCodeApps`). */
    elsewhere?: boolean;
  },
): Promise<ApprovalsWire> {
  const { db } = kernel;
  const { at, widget } = request;
  const source = approvalsSourceOf(widget);
  if (!source) return EMPTY;
  const standing = await approvalStanding(db, ctx.principal, at);
  if (!standing?.read) return EMPTY;
  if (!(await seenBy(kernel, widget, at.tenantId, standing.memberId, request.draft))) return EMPTY;

  const flows = source.flows && source.flows.length > 0 ? source.flows : undefined;
  // The steps that wait, oldest first, a batch at a time: what is theirs to decide may be far
  // down the list. Looked at until the viewer has all they are shown, or the bound is reached.
  const mine = source.whose !== "all";
  type Waiting = Awaited<ReturnType<typeof waitingBatch>>[number];
  const mayList: { row: Waiting; named: ReturnType<typeof approversOf>; may: boolean }[] = [];
  let more = false;
  let after: Place | undefined;
  for (let batch = 0; batch < limits.batches; batch += 1) {
    const rows = await waitingBatch(db, at, flows, after);
    for (const row of rows) {
      const named = approversOf(row.detail);
      const may = standing.write && (await isApprover(db, at, standing.memberId, named));
      if (mine && !may) continue;
      if (mayList.length >= WAITING_LIMIT) {
        more = true;
        break;
      }
      mayList.push({ row, named, may });
    }
    const last = rows.at(-1);
    if (more || rows.length < limits.batch || !last) break;
    after = { at: last.started, run: last.flow_run_id, node: last.node_id };
    // Out of batches with rows not looked at: there may be more.
    if (batch === limits.batches - 1) more = true;
  }
  const waiting: ApprovalItem[] = [];
  const decidedRows = widget.config?.decided === true ? await decidedSteps(db, at, flows) : [];
  const titles = await flowTitles(db, at.workspaceId, [
    ...new Set([
      ...mayList.map((one) => one.row.flow_path),
      ...decidedRows.map((row) => row.flow_path),
    ]),
  ]);
  for (const { row, named, may } of mayList) {
    waiting.push({
      id: itemId(row.flow_run_id, row.node_id),
      title: String(row.detail.title),
      flow: { path: row.flow_path, title: titleOfFlow(titles, row.flow_path) },
      fields: fieldsOf(row.detail.detail, widget),
      waitingSince: row.started_at.toISOString(),
      timesOutAt: row.wake_at ? row.wake_at.toISOString() : null,
      mayDecide: may,
      approvers: describeApprovers(named, await approverTitles(db, named)),
    });
  }

  const decided: ApprovalItem[] = decidedRows.map((row) => ({
    id: itemId(row.flow_run_id, row.node_id),
    title: String(row.detail.title),
    flow: { path: row.flow_path, title: titleOfFlow(titles, row.flow_path) },
    fields: fieldsOf(row.detail.detail, widget),
    waitingSince: row.started_at.toISOString(),
    timesOutAt: null,
    mayDecide: false,
    approvers: null,
    decision: {
      approved: row.status === "succeeded",
      by: row.name || row.email || row.service_name || "A member",
      at: row.finished_at ? row.finished_at.toISOString() : null,
      comment: row.decision_comment,
      via: row.via,
    },
  }));
  return {
    shape: "approvals",
    ...(request.elsewhere ? { decideIn: await consoleOf(kernel, at) } : {}),
    waiting,
    decided,
    more,
  };
}

/** The console's page of this workspace's approvals, and what the instance calls itself. */
async function consoleOf(
  kernel: Kernel,
  at: { tenantId: string; workspaceId: string },
): Promise<{ console: string; name: string }> {
  const branding = await kernel.db
    .selectFrom("instance_branding")
    .select("product_name")
    .executeTakeFirst();
  return {
    console: `${kernel.hosts.mainOrigin}/t/${at.tenantId}/workspaces/${at.workspaceId}/approvals`,
    name: branding?.product_name || DEFAULT_PRODUCT_NAME,
  };
}

/** The last steps decided in the workspace, for the widget that shows them. */
async function decidedSteps(
  db: Db,
  at: { tenantId: string; workspaceId: string },
  flows: string[] | undefined,
) {
  const rows = await db
    .selectFrom("step_run")
    .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
    .leftJoin("member", (join) =>
      join
        .onRef("member.id", "=", "step_run.decided_by")
        .on("step_run.decided_by_type", "=", "member"),
    )
    .leftJoin("service_account", (join) =>
      join
        .onRef("service_account.id", "=", "step_run.decided_by")
        .on("step_run.decided_by_type", "=", "service_account"),
    )
    .select([
      "service_account.name as service_name",
      "step_run.flow_run_id",
      "step_run.node_id",
      "step_run.detail",
      "step_run.status",
      "step_run.decision_comment",
      "step_run.started_at",
      "step_run.finished_at",
      "flow_run.flow_path",
      "member.email",
      "member.name",
      sql<boolean>`exists (
        select 1 from approval_link l
        where l.flow_run_id = step_run.flow_run_id and l.node_id = step_run.node_id
          and l.decided_at is not null
      )`.as("by_link"),
      sql<boolean>`step_run.output ->> 'via' = 'app'`.as("by_app"),
    ])
    .where("flow_run.tenant_id", "=", at.tenantId)
    .where("flow_run.workspace_id", "=", at.workspaceId)
    .where("step_run.decided_by", "is not", null)
    .where(sql<boolean>`step_run.detail ? 'title'`)
    .$if(flows !== undefined, (query) => query.where("flow_run.flow_path", "in", flows as string[]))
    .orderBy("step_run.finished_at", "desc")
    .limit(DECIDED_LIMIT)
    .execute();
  return rows.map((row) => ({
    ...row,
    via: (row.by_link ? "email" : row.by_app ? "app" : "console") as Via,
  }));
}

/** A time as a person says it who is told what happened: "a moment ago", "12 minutes ago". */
export function agoWords(then: Date | null, now = new Date()): string {
  if (!then) return "just before you";
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return "a moment ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export interface DecideRequest extends PageRequest {
  /** The request arrived at an address where decisions are not taken (`Hosts.runsCodeApps`). */
  elsewhere?: boolean;
  widget: string;
  /** The step, as the widget's data named it. */
  id: string;
  decision: "approve" | "reject";
  comment?: string | undefined;
}

export interface DecideResult {
  decision: "approve" | "reject";
  title: string;
  flow: { path: string; title: string };
  /** Who decided: the member's own name, as the audit records them. */
  by: string;
}

/**
 * Decides a step an approvals widget shows. The widget is found in the page as the caller may
 * read it (the deployed one; the draft for someone who may edit it in a dev workspace), and the
 * step must be one of its flows' waiting steps in this workspace. The member decides as
 * themselves, and the audit, not the browser, records who. Someone having decided it first is a
 * 409 that says who and what.
 */
export async function decideFromPage(
  kernel: Kernel,
  ctx: RequestContext,
  params: { t: string; w: string },
  request: DecideRequest,
): Promise<DecideResult> {
  const { db } = kernel;
  const located: LocatedPage = await locatePage(kernel, ctx, params, {
    of: "interface",
    path: request.path,
    page: request.page,
    draft: request.draft,
  });
  const at = located.at;
  const widget = located.widgets.find((one) => one.id === request.widget);
  const source = widget ? approvalsSourceOf(widget) : undefined;
  if (!widget || !source) throw notFound("The widget");
  const draft = request.draft === true || request.draft === "1" || request.draft === "true";

  const standing = await approvalStanding(db, ctx.principal, at);
  if (!standing?.write || !standing.read) {
    throw forbiddenBecause(
      "This needs the approval:read and approval:write permissions, as a member of this workspace.",
    );
  }
  if (!(await seenBy(kernel, widget, at.tenantId, standing.memberId, draft))) {
    throw notFound("The widget");
  }

  // An app written as code runs its own script here, with the member's sign-in: it could press
  // the button for them. Nothing in the request can tell that apart (decision 0007, rule 8).
  if (request.elsewhere) {
    const where = await consoleOf(kernel, at);
    throw new HttpError(
      403,
      "decide_in_console",
      `Decide this in ${where.name}, not in an app: open it at ${where.console}.`,
    );
  }

  const wanted = splitItemId(request.id);
  if (!wanted) throw notFound("The approval");

  // The comment: trimmed, bounded, and asked for as the widget says, here as well as there.
  const comment = request.comment?.trim() || undefined;
  if (comment && comment.length > COMMENT_LIMIT) {
    throw badRequest(`A comment is at most ${COMMENT_LIMIT} characters.`, [
      { path: "/comment", message: `at most ${COMMENT_LIMIT} characters` },
    ]);
  }
  const askWhy = widget.config?.askWhy;
  const needsWhy = askWhy === "always" || (askWhy !== "never" && request.decision === "reject");
  if (needsWhy && !comment) {
    throw badRequest(
      request.decision === "reject"
        ? "Say why it is rejected: the flow and its people read it."
        : "Say why: the flow and its people read it.",
      [{ path: "/comment", message: "is needed" }],
    );
  }

  const flows = source.flows && source.flows.length > 0 ? source.flows : undefined;
  const origin = {
    via: "app" as const,
    app: located.app,
    page: located.page?.id ?? null,
    widget: widget.id,
  };
  const result = await ctx.mutate(async (trx, audit) => {
    // The same lock the engine takes to decide, so two deciders at once are told apart.
    await sql`select pg_advisory_xact_lock(hashtextextended(${wanted.flowRunId}, 1))`.execute(trx);
    const step = await trx
      .selectFrom("step_run")
      .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
      .leftJoin("member", (join) =>
        join
          .onRef("member.id", "=", "step_run.decided_by")
          .on("step_run.decided_by_type", "=", "member"),
      )
      .leftJoin("service_account", (join) =>
        join
          .onRef("service_account.id", "=", "step_run.decided_by")
          .on("step_run.decided_by_type", "=", "service_account"),
      )
      .select([
        "service_account.name as decider_service",
        "step_run.status",
        "step_run.detail",
        "step_run.decided_by",
        "step_run.decision_comment",
        "step_run.output",
        "step_run.finished_at",
        "flow_run.flow_path",
        "flow_run.status as flow_status",
        "flow_run.workspace_id",
        "flow_run.tenant_id",
        "member.name as decider_name",
        "member.email as decider_email",
      ])
      .where("step_run.flow_run_id", "=", wanted.flowRunId)
      .where("step_run.node_id", "=", wanted.node)
      .where("step_run.item_key", "=", "")
      .executeTakeFirst();
    // A step of another workspace, or of a flow the widget does not list, is not found: the
    // widget cannot be used to reach what it does not show.
    if (
      !step ||
      step.workspace_id !== at.workspaceId ||
      step.tenant_id !== at.tenantId ||
      typeof step.detail.title !== "string" ||
      (flows && !flows.includes(step.flow_path))
    ) {
      throw notFound("The approval");
    }
    if (step.status !== "waiting" || step.flow_status !== "running") {
      throw conflict(await whoDecided(step, request.decision));
    }
    // Among the step's named approvers, as the approve route holds them to.
    const named = approversOf(step.detail);
    if (!(await isApprover(trx, at, standing.memberId, named))) {
      throw new HttpError(
        403,
        "not_an_approver",
        `Only ${describeApprovers(named, await approverTitles(trx, named))} can decide this.`,
      );
    }
    const decided = await decideApproval(trx, {
      workspaceId: at.workspaceId,
      flowRunId: wanted.flowRunId,
      node: wanted.node,
      approve: request.decision === "approve",
      comment,
      decidedBy: { type: "member", id: standing.memberId },
      via: "app",
    });
    await audit({
      action: request.decision === "approve" ? "approval.approved" : "approval.rejected",
      targetType: "flow_run",
      targetId: wanted.flowRunId,
      tenantId: at.tenantId,
      workspaceId: at.workspaceId,
      details: {
        flow: decided.flow,
        node: wanted.node,
        title: decided.title,
        comment: comment ?? null,
        ...origin,
      },
    });
    return decided;
  });
  kickFlow(kernel, wanted.flowRunId);

  const titles = await flowTitles(db, at.workspaceId, [result.flow]);
  const who = await db
    .selectFrom("member")
    .select(["name", "email"])
    .where("id", "=", standing.memberId)
    .executeTakeFirst();
  return {
    decision: request.decision,
    title: result.title,
    flow: { path: result.flow, title: titleOfFlow(titles, result.flow) },
    by: who?.name || who?.email || "You",
  };
}

/** Who decided a step that is no longer waiting, and what, in words. */
async function whoDecided(
  step: {
    status: string;
    decided_by: string | null;
    decider_name: string | null;
    decider_email: string | null;
    decider_service?: string | null;
    decision_comment: string | null;
    finished_at: Date | null;
    flow_status: string;
  },
  wanted: "approve" | "reject",
): Promise<string> {
  if (step.decided_by) {
    const who = step.decider_name || step.decider_email || step.decider_service || "Someone";
    const what = step.status === "succeeded" ? "approved" : "rejected";
    const same = (wanted === "approve") === (step.status === "succeeded");
    return `${who} ${what} this ${agoWords(step.finished_at)}${same ? ", as you meant to" : ""}.`;
  }
  if (step.flow_status !== "running") {
    return `This request is no longer waiting: its run ${step.flow_status === "cancelled" ? "was cancelled" : "has ended"}.`;
  }
  return "This request timed out before anyone decided it.";
}
