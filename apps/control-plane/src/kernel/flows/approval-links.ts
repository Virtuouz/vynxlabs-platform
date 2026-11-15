/**
 * Approval by mail. When a flow waits for an approval, each member who may
 * decide it is sent a link of their own: opening it shows what is asked, and a
 * button decides it as that member. A link works once, and only until it runs
 * out or the step is decided by anyone. Who may decide is checked again when it
 * is used. Only a hash of each token is kept.
 */
import { createHash, randomBytes } from "node:crypto";
import { newId } from "@vynxlabs/db";
import type { Actor, Db, Trx } from "../audit.js";
import { mutate } from "../audit.js";
import { check } from "../authorize.js";
import { forbidden, HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { approverMembers, approversOf, isApprover } from "./approvers.js";

/** How long a link works, unless the approval times out sooner. */
export const LINK_HOURS = 48;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export const linkGone = () =>
  new HttpError(
    410,
    "link_expired",
    "This link has been used, or the approval was decided, or it ran out. Open the Approvals page in the console to see where it stands.",
  );

/** What a waiting approval step is, with its flow run and workspace. */
async function waitingStep(db: Db | Trx, flowRunId: string, node: string) {
  return db
    .selectFrom("step_run")
    .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
    .innerJoin("workspace", "workspace.id", "flow_run.workspace_id")
    .innerJoin("tenant", "tenant.id", "flow_run.tenant_id")
    .select([
      "step_run.detail",
      "step_run.status",
      "step_run.wake_at",
      "step_run.started_at",
      "flow_run.id as flow_run_id",
      "flow_run.status as flow_status",
      "flow_run.flow_path",
      "flow_run.tenant_id",
      "flow_run.workspace_id",
      "flow_run.trigger_type",
      "flow_run.trigger_detail",
      "workspace.name as workspace_name",
      "workspace.type as workspace_type",
      "tenant.name as tenant_name",
    ])
    .where("step_run.flow_run_id", "=", flowRunId)
    .where("step_run.node_id", "=", node)
    .where("step_run.item_key", "=", "")
    .executeTakeFirst();
}

/** A value shown in a mail, as text: short enough to read. */
function shown(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 1500 ? `${text.slice(0, 1499)}…` : text;
}

/**
 * Sends each member who may decide a waiting approval a link of their own.
 * Nothing is made when the instance cannot send mail. Never throws for a
 * message that could not be sent: the Approvals page is always there.
 */
export async function mailApprovers(
  kernel: Kernel,
  flowRunId: string,
  node: string,
): Promise<number> {
  if (!kernel.mail.configured) return 0;
  const step = await waitingStep(kernel.db, flowRunId, node);
  if (step?.status !== "waiting" || step.flow_status !== "running") return 0;
  const detail = (step.detail ?? {}) as Record<string, unknown>;
  if (typeof detail.title !== "string") return 0;
  const at = { tenantId: step.tenant_id, workspaceId: step.workspace_id };
  const named = approversOf(detail);
  const { members, more } = await approverMembers(kernel.db, at, named);
  if (more) {
    kernel.log.warn(
      { flowRunId, node, mailed: members.length },
      "more members may decide this approval than are mailed; the rest see it in the console",
    );
  }
  if (members.length === 0) return 0;
  const ends = new Date(
    Math.min(
      Date.now() + LINK_HOURS * 3_600_000,
      step.wake_at ? new Date(step.wake_at).getTime() : Number.POSITIVE_INFINITY,
    ),
  );
  const test = (step.trigger_detail as { draft?: boolean } | null)?.draft === true;
  const links: { member: (typeof members)[number]; token: string }[] = [];
  await mutate(kernel.db, { principal: { type: "system", id: null } }, async (trx, audit) => {
    for (const member of members) {
      const token = randomBytes(32).toString("base64url");
      await trx
        .insertInto("approval_link")
        .values({
          id: newId(),
          tenant_id: at.tenantId,
          workspace_id: at.workspaceId,
          flow_run_id: flowRunId,
          node_id: node,
          member_id: member.id,
          token_hash: hash(token),
          expires_at: ends,
        })
        .execute();
      links.push({ member, token });
    }
    await audit({
      action: "approval.links_sent",
      targetType: "flow_run",
      targetId: flowRunId,
      tenantId: at.tenantId,
      workspaceId: at.workspaceId,
      details: { node, members: members.map((member) => member.id), endsAt: ends.toISOString() },
    });
  });
  const said = shown(detail.detail);
  for (const { member, token } of links) {
    const url = new URL(`/approve/${token}`, kernel.hosts.mainOrigin).toString();
    await kernel.mail.send({
      to: member.email,
      subject: `${test ? "[Test] " : ""}Approval needed: ${detail.title}`,
      text: [
        `Hello ${member.name},`,
        "",
        `${test ? "A test run of the flow" : "The flow"} ${step.flow_path} in ${step.workspace_name} (${step.tenant_name}) waits for a decision:`,
        "",
        `  ${detail.title}`,
        ...(said ? ["", said] : []),
        "",
        `Approve or reject it here: ${url}`,
        "",
        `The link is yours. It works once, until ${ends.toUTCString()}, or until someone decides. Opening it decides nothing: you choose on the page.`,
      ].join("\n"),
    });
  }
  return links.length;
}

/** Ends every link to a step that is no longer waiting: the rest of its mail goes stale. */
export async function expireLinks(trx: Db | Trx, flowRunId: string, node: string): Promise<void> {
  await trx
    .updateTable("approval_link")
    .set({ used_at: new Date() })
    .where("flow_run_id", "=", flowRunId)
    .where("node_id", "=", node)
    .where("used_at", "is", null)
    .execute();
}

/** A link that still works, with what it asks. Undefined when it does not. */
export async function readLink(db: Db | Trx, token: string) {
  const link = await db
    .selectFrom("approval_link")
    .innerJoin("member", "member.id", "approval_link.member_id")
    .select([
      "approval_link.id",
      "approval_link.flow_run_id",
      "approval_link.node_id",
      "approval_link.member_id",
      "approval_link.expires_at",
      "member.name as member_name",
      "member.email as member_email",
    ])
    .where("approval_link.token_hash", "=", hash(token))
    .where("approval_link.used_at", "is", null)
    .where("approval_link.expires_at", ">", new Date())
    .executeTakeFirst();
  if (!link) return undefined;
  const step = await waitingStep(db, link.flow_run_id, link.node_id);
  if (step?.status !== "waiting" || step.flow_status !== "running") return undefined;
  return { link, step };
}

/**
 * Uses a link: takes it, checks the member may still decide, and leaves the
 * caller to decide in the same transaction. Throws 410 for a link that does
 * not work, and 403 for a member who may no longer decide.
 */
export async function takeLink(trx: Trx, token: string) {
  const taken = await trx
    .updateTable("approval_link")
    .set({ used_at: new Date(), decided_at: new Date() })
    .where("token_hash", "=", hash(token))
    .where("used_at", "is", null)
    .where("expires_at", ">", new Date())
    .returning(["id", "flow_run_id", "node_id", "member_id", "tenant_id", "workspace_id"])
    .executeTakeFirst();
  if (!taken) throw linkGone();
  const step = await waitingStep(trx, taken.flow_run_id, taken.node_id);
  if (step?.status !== "waiting" || step.flow_status !== "running") throw linkGone();
  const at = { tenantId: taken.tenant_id, workspaceId: taken.workspace_id };
  const member = await trx
    .selectFrom("member")
    .leftJoin("tenant_member", (join) =>
      join
        .onRef("tenant_member.member_id", "=", "member.id")
        .on("tenant_member.tenant_id", "=", at.tenantId),
    )
    .select([
      "member.id",
      "member.name",
      "member.email",
      "member.disabled_at",
      "tenant_member.member_id as membership",
      "tenant_member.suspended_at",
    ])
    .where("member.id", "=", taken.member_id)
    .executeTakeFirst();
  const refused = forbidden("approval:write");
  refused.message =
    "You may no longer decide this approval. Ask someone who may, or open the console.";
  if (!member || member.disabled_at || !member.membership || member.suspended_at) throw refused;
  const may = await check(trx, { type: "member", id: member.id }, "approval:write", at);
  if (!may.allowed || may.accessGrantId) throw refused;
  const named = approversOf((step.detail ?? {}) as Record<string, unknown>);
  if (!(await isApprover(trx, at, member.id, named))) throw refused;
  return { taken, step, member };
}

/** The actor a link decides as: the member it was sent to, from where the request came. */
export function linkActor(
  member: { id: string; name: string; email: string },
  request: { ip: string; headers: Record<string, unknown>; id: string },
): Actor {
  return {
    principal: { type: "member", id: member.id, name: member.name, email: member.email },
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"] as string | undefined,
    requestId: request.id,
  };
}

/** Forgets links that ran out a while ago. */
export async function removeOldLinks(db: Db): Promise<void> {
  await db
    .deleteFrom("approval_link")
    .where("expires_at", "<=", new Date(Date.now() - 7 * 86_400_000))
    .execute();
}
