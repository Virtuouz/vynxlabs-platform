import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { Type } from "typebox";
import { badRequest, conflict, notFound } from "../kernel/errors.js";
import { previewPromotion, promote, promotionOf } from "../kernel/execution/promote.js";
import { publishPlatformEvent } from "../kernel/flows/events.js";
import { pushRelease } from "../kernel/git.js";
import { access, findWorkspace, type RequestContext, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { AnyObject, Id, iso, isoOrNull, NullableString, Time, WorkspaceParams } from "./shared.js";

type Status = "pending" | "promoted" | "declined" | "withdrawn" | "superseded";
/** A request's row as it is read. */
interface Row {
  id: string;
  tenant_id: string;
  source_workspace_id: string;
  target_workspace_id: string;
  bundle_id: string;
  digest: string;
  version: number;
  note: string | null;
  requested_by_type: string;
  requested_by_id: string | null;
  status: Status;
  decided_by_type: string | null;
  decided_by_id: string | null;
  decided_at: Date | null;
  comment: string | null;
  deployment_id: string | null;
  created_at: Date;
}

const Who = Type.Object({
  type: Type.String(),
  id: Type.Union([Id, Type.Null()]),
  name: Type.String(),
});
const Place = Type.Object({ id: Id, slug: Type.String(), name: Type.String() });
export const PromotionRequest = Type.Object({
  id: Id,
  source: Place,
  target: Place,
  version: Type.Integer({ description: "The source's bundle version asked for." }),
  digest: Type.String(),
  note: NullableString,
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("promoted"),
    Type.Literal("declined"),
    Type.Literal("withdrawn"),
    Type.Literal("superseded"),
  ]),
  requestedBy: Who,
  createdAt: Time,
  decidedBy: Type.Union([Who, Type.Null()]),
  decidedAt: Type.Union([Time, Type.Null()]),
  comment: NullableString,
  sourceVersionNow: Type.Union([Type.Integer(), Type.Null()], {
    description: "What the source runs now: newer than `version` when it has moved on since.",
  }),
  mayDecide: Type.Boolean(),
  mine: Type.Boolean(),
});

/** Requests as the API shows them, with names for the people and places. */
export async function describeRequests(kernel: Kernel, ctx: RequestContext, rows: Row[]) {
  const { db } = kernel;
  if (rows.length === 0) return [];
  const places = new Set(rows.flatMap((row) => [row.source_workspace_id, row.target_workspace_id]));
  const workspaces = await db
    .selectFrom("workspace")
    .leftJoin("bundle", "bundle.id", "workspace.active_bundle_id")
    .select(["workspace.id", "workspace.slug", "workspace.name", "bundle.version"])
    .where("workspace.id", "in", [...places])
    .execute();
  const place = new Map(workspaces.map((one) => [one.id, one]));
  const people = rows.flatMap((row) => [
    [row.requested_by_type, row.requested_by_id],
    [row.decided_by_type, row.decided_by_id],
  ]);
  const ids = (type: string) => [
    ...new Set(people.filter(([t, id]) => t === type && id).map(([, id]) => id as string)),
  ];
  const members = ids("member").length
    ? await db
        .selectFrom("member")
        .select(["id", "name", "email"])
        .where("id", "in", ids("member"))
        .execute()
    : [];
  const accounts = ids("service_account").length
    ? await db
        .selectFrom("service_account")
        .select(["id", "name"])
        .where("id", "in", ids("service_account"))
        .execute()
    : [];
  const nameOf = (type: string | null, id: string | null) =>
    type === "member"
      ? (members.find((one) => one.id === id)?.name ??
        members.find((one) => one.id === id)?.email ??
        "A member")
      : type === "service_account"
        ? (accounts.find((one) => one.id === id)?.name ?? "A service account")
        : "The platform";
  const decides = new Map<string, boolean>();
  for (const target of new Set(rows.map((row) => row.target_workspace_id))) {
    decides.set(
      target,
      await ctx.allowed("promotion:write", {
        tenantId: rows[0]?.tenant_id as string,
        workspaceId: target,
      }),
    );
  }
  const at = (id: string) => {
    const one = place.get(id);
    return { id, slug: one?.slug ?? "", name: one?.name ?? "A workspace that is gone" };
  };
  return rows.map((row) => ({
    id: row.id,
    source: at(row.source_workspace_id),
    target: at(row.target_workspace_id),
    version: row.version,
    digest: row.digest,
    note: row.note,
    status: row.status,
    requestedBy: {
      type: row.requested_by_type,
      id: row.requested_by_id,
      name: nameOf(row.requested_by_type, row.requested_by_id),
    },
    createdAt: iso(row.created_at),
    decidedBy: row.decided_by_type
      ? {
          type: row.decided_by_type,
          id: row.decided_by_id,
          name: nameOf(row.decided_by_type, row.decided_by_id),
        }
      : null,
    decidedAt: isoOrNull(row.decided_at),
    comment: row.comment,
    sourceVersionNow: place.get(row.source_workspace_id)?.version ?? null,
    mayDecide: row.status === "pending" && (decides.get(row.target_workspace_id) ?? false),
    mine: row.requested_by_type === ctx.principal.type && row.requested_by_id === ctx.principal.id,
  }));
}

/**
 * Asking for a promotion one may not make, and deciding it. The bundle the
 * source runs when asked is pinned: deciding promotes that one.
 */
export function promotionRequestRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";
    const RequestParams = Type.Object({ t: Id, id: Id });

    const load = async (tenantId: string, id: string) => {
      const row = await db
        .selectFrom("promotion_request")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("id", "=", id)
        .executeTakeFirst();
      if (!row) throw notFound("The promotion request");
      return row;
    };
    /** What the source is, as a workspace the kernel acts in. */
    const sourceOf = async (row: Row): Promise<WorkspaceRef> => {
      const found = await db
        .selectFrom("workspace")
        .select(["id", "tenant_id", "slug"])
        .where("id", "=", row.source_workspace_id)
        .executeTakeFirstOrThrow();
      return { id: found.id, tenantId: found.tenant_id, slug: found.slug };
    };

    app.post(
      `${base}/promotion-requests`,
      {
        config: { access: access.workspace("deployment:read") },
        schema: {
          summary: "Ask for this workspace's bundle to be promoted",
          description:
            "For one who may not promote it: those who may are asked, on the tenant's overview. " +
            "The bundle this workspace runs now is what is asked for, whatever is deployed " +
            "after. Asking again replaces a request that is still waiting.",
          tags: ["deploys"],
          params: WorkspaceParams,
          body: Type.Object({ note: Type.Optional(Type.String({ maxLength: 1000 })) }),
          response: { 201: PromotionRequest },
        },
      },
      async ({ ctx, body }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const promotion = await promotionOf(db, workspace);
        await ctx.authorize("deployment:read", {
          tenantId: promotion.target.tenantId,
          workspaceId: promotion.target.id,
        });
        if (
          await ctx.allowed("promotion:write", {
            tenantId: promotion.target.tenantId,
            workspaceId: promotion.target.id,
          })
        ) {
          throw conflict("You may promote this yourself: there is no one to ask.");
        }
        const row = await ctx.mutate(async (trx, audit) => {
          const replaced = await trx
            .updateTable("promotion_request")
            .set({ status: "superseded", decided_at: new Date() })
            .where("source_workspace_id", "=", workspace.id)
            .where("target_workspace_id", "=", promotion.target.id)
            .where("status", "=", "pending")
            .returning("id")
            .execute();
          const created = await trx
            .insertInto("promotion_request")
            .values({
              id: newId(),
              tenant_id: workspace.tenantId,
              source_workspace_id: workspace.id,
              target_workspace_id: promotion.target.id,
              bundle_id: promotion.bundleId,
              digest: promotion.digest,
              version: promotion.version,
              note: body.note?.trim() || null,
              requested_by_type: ctx.principal.type,
              requested_by_id: ctx.principal.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "promotion.requested",
            targetType: "promotion_request",
            targetId: created.id,
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            details: {
              targetWorkspaceId: promotion.target.id,
              version: promotion.version,
              digest: promotion.digest,
              ...(replaced.length > 0 ? { replaces: replaced.map((one) => one.id) } : {}),
            },
          });
          return created;
        });
        const [shown] = await describeRequests(kernel, ctx, [row]);
        return reply.code(201).send(shown as NonNullable<typeof shown>);
      },
    );

    app.get(
      "/tenants/:t/promotion-requests",
      {
        config: { access: access.custom },
        schema: {
          summary: "Promotion requests one may decide, and one's own",
          description:
            "Those waiting on one who may promote to their workspace, and those one asked for. " +
            "Newest first.",
          tags: ["deploys"],
          params: Type.Object({ t: Id }),
          querystring: Type.Object({
            status: Type.Optional(
              Type.Union([
                Type.Literal("pending"),
                Type.Literal("promoted"),
                Type.Literal("declined"),
                Type.Literal("withdrawn"),
                Type.Literal("superseded"),
              ]),
            ),
            workspaceId: Type.Optional(Id),
          }),
          response: { 200: Type.Object({ items: Type.Array(PromotionRequest) }) },
        },
      },
      async ({ ctx, params, query }) => {
        let rows = db.selectFrom("promotion_request").selectAll().where("tenant_id", "=", params.t);
        if (query.status) rows = rows.where("status", "=", query.status);
        if (query.workspaceId) rows = rows.where("source_workspace_id", "=", query.workspaceId);
        const all = await rows.orderBy("created_at", "desc").limit(200).execute();
        const visible: Row[] = [];
        const decides = new Map<string, boolean>();
        for (const row of all) {
          const mine =
            row.requested_by_type === ctx.principal.type &&
            row.requested_by_id === ctx.principal.id;
          if (!decides.has(row.target_workspace_id)) {
            decides.set(
              row.target_workspace_id,
              await ctx.allowed("promotion:write", {
                tenantId: params.t,
                workspaceId: row.target_workspace_id,
              }),
            );
          }
          if (mine || decides.get(row.target_workspace_id)) visible.push(row);
        }
        // Someone with no standing in the tenant is told it is not there.
        if (visible.length === 0) await ctx.authorize("deployment:read", { tenantId: params.t });
        return { items: await describeRequests(kernel, ctx, visible) };
      },
    );

    app.get(
      "/tenants/:t/promotion-requests/:id/preview",
      {
        config: { access: access.custom },
        schema: {
          summary: "What deciding a promotion request would do",
          description: "The promotion preview of the bundle the request pinned.",
          tags: ["deploys"],
          params: RequestParams,
          response: { 200: AnyObject },
        },
      },
      async ({ ctx, params }) => {
        const row = await load(params.t, params.id);
        await ctx.authorize("deployment:read", {
          tenantId: params.t,
          workspaceId: row.target_workspace_id,
        });
        const source = await sourceOf(row);
        return previewPromotion(kernel, ctx.actor, source, row.bundle_id);
      },
    );

    app.post(
      "/tenants/:t/promotion-requests/:id/decision",
      {
        config: { access: access.custom },
        schema: {
          summary: "Promote what was asked for, or decline it",
          description:
            "Needs `promotion:write` in the workspace promoted to. Promoting deploys the bundle " +
            "the request pinned. Declining says why.",
          tags: ["deploys"],
          params: RequestParams,
          body: Type.Object({
            decision: Type.Union([Type.Literal("promote"), Type.Literal("decline")]),
            comment: Type.Optional(Type.String({ maxLength: 1000 })),
          }),
          response: { 200: PromotionRequest },
        },
      },
      async ({ ctx, params, body }) => {
        const row = await load(params.t, params.id);
        await ctx.authorize("promotion:write", {
          tenantId: params.t,
          workspaceId: row.target_workspace_id,
        });
        if (row.status !== "pending") throw conflict(`This request was ${row.status} already.`);
        const comment = body.comment?.trim() || null;
        if (body.decision === "decline" && !comment) {
          throw badRequest("Say why it is declined: the one who asked reads it.");
        }
        const source = await sourceOf(row);
        const decided = await ctx.mutate(async (trx, audit) => {
          const claimed = await trx
            .updateTable("promotion_request")
            .set({
              status: body.decision === "promote" ? "promoted" : "declined",
              decided_by_type: ctx.principal.type,
              decided_by_id: ctx.principal.id,
              decided_at: new Date(),
              comment,
            })
            .where("id", "=", row.id)
            .where("status", "=", "pending")
            .returningAll()
            .executeTakeFirst();
          if (!claimed) throw conflict("This request was decided already.");
          if (body.decision === "decline") {
            await audit({
              action: "promotion.request_declined",
              targetType: "promotion_request",
              targetId: row.id,
              tenantId: params.t,
              workspaceId: row.source_workspace_id,
              details: { comment },
            });
            return { row: claimed, promoted: null };
          }
          const promoted = await promote(kernel, trx, audit, source, ctx.principal, {
            bundleId: row.bundle_id,
          });
          const done = await trx
            .updateTable("promotion_request")
            .set({ deployment_id: promoted.deployment.id })
            .where("id", "=", row.id)
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "promotion.request_promoted",
            targetType: "promotion_request",
            targetId: row.id,
            tenantId: params.t,
            workspaceId: row.target_workspace_id,
            details: {
              version: row.version,
              digest: row.digest,
              deploymentId: promoted.deployment.id,
              ...(comment ? { comment } : {}),
            },
          });
          return { row: done, promoted };
        });
        if (decided.promoted) {
          const { promoted } = decided;
          await publishPlatformEvent(kernel, {
            tenantId: params.t,
            workspaceId: promoted.target.id,
            name: "platform/deployment-created",
            payload: {
              deploymentId: promoted.deployment.id,
              bundleVersion: promoted.bundle.version,
            },
            sourceId: promoted.deployment.id,
            depth: 0,
          }).catch((error) =>
            kernel.log.error({ err: error }, "a platform event could not be published"),
          );
          await pushRelease(kernel, ctx.actor, promoted.target, {
            version: promoted.bundle.version,
          }).catch((error: Error) =>
            kernel.log.warn({ err: error }, "the release branch could not be pushed"),
          );
        }
        const [shown] = await describeRequests(kernel, ctx, [decided.row]);
        return shown as NonNullable<typeof shown>;
      },
    );

    app.delete(
      "/tenants/:t/promotion-requests/:id",
      {
        config: { access: access.custom },
        schema: {
          summary: "Withdraw a promotion request one made",
          tags: ["deploys"],
          params: RequestParams,
          response: { 204: Type.Null() },
        },
      },
      async ({ ctx, params }, reply) => {
        const row = await load(params.t, params.id);
        if (
          row.requested_by_type !== ctx.principal.type ||
          row.requested_by_id !== ctx.principal.id
        ) {
          await findWorkspace(kernel, params.t, row.source_workspace_id);
          throw notFound("The promotion request");
        }
        if (row.status !== "pending") throw conflict(`This request was ${row.status} already.`);
        await ctx.mutate(async (trx, audit) => {
          await trx
            .updateTable("promotion_request")
            .set({ status: "withdrawn", decided_at: new Date() })
            .where("id", "=", row.id)
            .execute();
          await audit({
            action: "promotion.request_withdrawn",
            targetType: "promotion_request",
            targetId: row.id,
            tenantId: params.t,
            workspaceId: row.source_workspace_id,
          });
        });
        return reply.code(204).send(null);
      },
    );
  };
}
