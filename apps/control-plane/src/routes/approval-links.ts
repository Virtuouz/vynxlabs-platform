import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { writeAudit } from "../kernel/audit.js";
import { badRequest } from "../kernel/errors.js";
import { approvalDetail, approvalTitle } from "../kernel/flows/approval-detail.js";
import { linkActor, linkGone, readLink, takeLink } from "../kernel/flows/approval-links.js";
import { decideApproval, kickFlow } from "../kernel/flows/engine.js";
import { flowKnown } from "../kernel/flows/known.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Time } from "./shared.js";

/** Counted per address: a token is long enough not to be guessed, and this keeps it so. */
const LINK_LIMIT = { max: 30, timeWindow: "1 minute" };
const Token = Type.Object({ token: Type.String({ minLength: 20, maxLength: 100 }) });

/**
 * The links in approval mail. They need no sign-in: the link is the
 * approver's own. Reading one changes nothing, so a mail scanner that opens
 * it decides nothing; deciding is a POST from the page.
 */
export function approvalLinkRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/approval-links/:token",
      {
        config: {
          access: access.publicWith("Needs the approval link's token, which is in the address."),
          rateLimit: LINK_LIMIT,
        },
        schema: {
          summary: "What an approval link asks",
          description:
            "For the page an approval mail links to. Reading it uses nothing. A link that was " +
            "used, whose approval was decided, or that ran out answers 410.",
          tags: ["flows"],
          params: Token,
          response: {
            200: Type.Object({
              title: Type.String(),
              detail: Type.Unknown(),
              flow: Type.String(),
              flowRunId: Type.String(),
              workspace: Type.Object({
                id: Type.String(),
                name: Type.String(),
                type: Type.String(),
              }),
              tenant: Type.Object({ id: Type.String(), name: Type.String() }),
              approver: Type.Object({ name: Type.String() }),
              waitingSince: Time,
              expiresAt: Time,
              test: Type.Boolean(),
            }),
          },
        },
      },
      async ({ params }) => {
        const found = await readLink(kernel.db, params.token);
        if (!found) throw linkGone();
        const { link, step } = found;
        const detail = (step.detail ?? {}) as { title?: string; detail?: unknown };
        return {
          title: approvalTitle(
            detail.title ?? "",
            await flowKnown(kernel, kernel.db, step.flow_run_id),
          ),
          detail: approvalDetail(
            detail.detail,
            await flowKnown(kernel, kernel.db, step.flow_run_id),
          ),
          flow: step.flow_path,
          flowRunId: step.flow_run_id,
          workspace: {
            id: step.workspace_id,
            name: step.workspace_name,
            type: step.workspace_type,
          },
          tenant: { id: step.tenant_id, name: step.tenant_name },
          approver: { name: link.member_name || link.member_email },
          waitingSince: new Date(step.started_at).toISOString(),
          expiresAt: new Date(link.expires_at).toISOString(),
          test: (step.trigger_detail as { draft?: boolean } | null)?.draft === true,
        };
      },
    );

    app.post(
      "/approval-links/:token",
      {
        config: {
          access: access.publicWith("Needs the approval link's token, which is in the address."),
          rateLimit: LINK_LIMIT,
        },
        schema: {
          summary: "Approve or reject from an approval link",
          description:
            "Decides as the member the link was sent to, once. Whether they may still decide is " +
            "checked again. Rejecting needs a comment. The other links to the same approval stop " +
            "working.",
          tags: ["flows"],
          params: Token,
          body: Type.Object({
            decision: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
            comment: Type.Optional(Type.String({ maxLength: 2000 })),
          }),
          response: {
            200: Type.Object({
              decision: Type.String(),
              title: Type.String(),
              approver: Type.Object({ name: Type.String() }),
              flowRunId: Type.String(),
              tenantId: Type.String(),
              workspaceId: Type.String(),
            }),
          },
        },
      },
      async (request) => {
        const { params, body } = request;
        const comment = body.comment?.trim() || undefined;
        if (body.decision === "reject" && !comment) {
          throw badRequest("Say why it is rejected: the flow and its people read it.");
        }
        // The link is taken, the decision made and recorded, in one transaction: all or none.
        const decided = await kernel.db.transaction().execute(async (trx) => {
          const { taken, member } = await takeLink(trx, params.token);
          const result = await decideApproval(trx, {
            workspaceId: taken.workspace_id,
            flowRunId: taken.flow_run_id,
            node: taken.node_id,
            approve: body.decision === "approve",
            comment,
            decidedBy: { type: "member", id: member.id },
            via: "email",
          });
          await writeAudit(trx, linkActor(member, request), {
            action: body.decision === "approve" ? "approval.approved" : "approval.rejected",
            targetType: "flow_run",
            targetId: taken.flow_run_id,
            tenantId: taken.tenant_id,
            workspaceId: taken.workspace_id,
            details: {
              flow: result.flow,
              node: taken.node_id,
              title: result.title,
              comment: comment ?? null,
              via: "email",
            },
          });
          return { taken, member, result };
        });
        const { taken, member, result } = decided;
        kickFlow(kernel, taken.flow_run_id);
        return {
          decision: body.decision,
          title: result.title,
          approver: { name: member.name || member.email },
          flowRunId: taken.flow_run_id,
          tenantId: taken.tenant_id,
          workspaceId: taken.workspace_id,
        };
      },
    );
  };
}
