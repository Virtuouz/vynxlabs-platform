import { type FastifyPluginAsyncTypebox, Type } from "@fastify/type-provider-typebox";
import type { TenantResource } from "@volvel/db";
import { renderTenantFiles, TENANT_FOLDER } from "@volvel/manifest";
import { mutate } from "../kernel/audit.js";
import { HttpError } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import {
  type AccessAsk,
  type AccessSummary,
  currentAccess,
  decideRelease,
  releaseAccess,
  rollbackAsks,
} from "../kernel/tenant/releases.js";
import { Id, NullableId, NullableString, Time } from "./shared.js";

const Resource = Type.Object({
  kind: Type.String(),
  key: Type.String({ maxLength: 63 }),
  body: Type.Record(Type.String(), Type.Unknown()),
});
const Summary = Type.Object({
  created: Type.Integer(),
  updated: Type.Integer(),
  deleted: Type.Integer(),
  unchanged: Type.Integer(),
  changes: Type.Array(
    Type.Object({
      change: Type.String(),
      kind: Type.String(),
      key: Type.String(),
      label: Type.String({ description: "The title, or for a binding what it gives to whom." }),
    }),
  ),
  warnings: Type.Array(Type.String()),
});
const Release = Type.Object({
  id: Id,
  number: Type.Integer(),
  scope: Type.String({ description: "full: a whole set, from a repository. partial: one change." }),
  status: Type.String({
    description: "applied, awaiting_approval, declined, withdrawn or superseded.",
  }),
  origin: Type.String(),
  message: NullableString,
  summary: Summary,
  createdByType: Type.String(),
  createdById: NullableId,
  createdBy: NullableString,
  createdAt: Time,
  decidedBy: NullableString,
  decidedAt: Type.Union([Time, Type.Null()]),
  comment: NullableString,
  appliedAt: Type.Union([Time, Type.Null()]),
});
const AllowDelete = Type.Optional(
  Type.Array(Type.String({ maxLength: 200 }), {
    maxItems: 500,
    description:
      "What a full release may remove, each as `<kind>/<key>`. Without it, removing what the " +
      "tenant has and the release does not is refused with `delete_not_allowed`.",
  }),
);

class DryRun extends Error {}

const EMPTY: AccessSummary = {
  created: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  changes: [],
  warnings: [],
};

/** A tenant's access as resources: reading it, releasing it, and the releases there were. */
export function accessReleaseRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const names = async (ids: (string | null)[]) => {
      const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
      if (wanted.length === 0) return new Map<string, string>();
      const rows = await db
        .selectFrom("member")
        .select(["id", "name"])
        .where("id", "in", wanted)
        .execute();
      const accounts = await db
        .selectFrom("service_account")
        .select(["id", "name"])
        .where("id", "in", wanted)
        .execute();
      return new Map([...rows, ...accounts].map((row) => [row.id, row.name]));
    };
    type Row = Awaited<ReturnType<typeof load>>[number];
    const load = (tenantId: string) =>
      db
        .selectFrom("tenant_release")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .orderBy("number", "desc")
        .limit(200)
        .execute();
    const show = (row: Row, who: Map<string, string>) => ({
      id: row.id,
      number: row.number,
      scope: row.scope,
      status: row.status,
      origin: row.origin,
      message: row.message,
      summary: { ...EMPTY, ...(row.summary as Partial<AccessSummary>) },
      createdByType: row.created_by_type,
      createdById: row.created_by_id,
      createdBy: row.created_by_id ? (who.get(row.created_by_id) ?? null) : null,
      createdAt: row.created_at.toISOString(),
      decidedBy: row.decided_by_id ? (who.get(row.decided_by_id) ?? null) : null,
      decidedAt: row.decided_at?.toISOString() ?? null,
      comment: row.comment,
      appliedAt: row.applied_at?.toISOString() ?? null,
    });

    app.get(
      "/tenants/:t/access",
      {
        config: { access: access.tenant("access:read") },
        schema: {
          summary: "The tenant's access as resources, and as the files a repository keeps",
          description:
            "Member groups, groups of end users, service accounts, the tenant's own roles, and " +
            "what each group or service account is given. Who is in a group is not here: people " +
            "stay state. Groups an identity provider made are left out. `files` are relative to " +
            "the repository's tenant folder.",
          tags: ["access"],
          params: Type.Object({ t: Id }),
          response: {
            200: Type.Object({
              folder: Type.String(),
              approval: Type.Boolean({
                description: "Whether a change waits for a second person.",
              }),
              resources: Type.Array(Resource),
              files: Type.Array(Type.Object({ path: Type.String(), content: Type.String() })),
            }),
          },
        },
      },
      async ({ params }) => {
        const resources = await currentAccess(db, params.t);
        const tenant = await db
          .selectFrom("tenant")
          .select("access_approval")
          .where("id", "=", params.t)
          .executeTakeFirstOrThrow();
        return {
          folder: TENANT_FOLDER,
          approval: tenant.access_approval,
          resources,
          files: renderTenantFiles(resources),
        };
      },
    );

    app.put(
      "/tenants/:t/access/approval",
      {
        config: { access: access.tenant("access:write") },
        schema: {
          summary: "Say whether a change to access waits for a second person",
          description:
            "With it on, a release and every change to a group, a service account or a role made " +
            "in the console waits until someone else who may release approves it. Turning it on " +
            "needs two who may.",
          tags: ["access"],
          params: Type.Object({ t: Id }),
          body: Type.Object({ required: Type.Boolean() }),
          response: { 200: Type.Object({ required: Type.Boolean() }) },
        },
      },
      async ({ ctx, params, body }) => {
        if (body.required) {
          const holders = await kernel.db
            .selectFrom("binding")
            .innerJoin("role", "role.id", "binding.role_id")
            .select(["binding.principal_type", "binding.principal_id", "role.permissions"])
            .where("binding.tenant_id", "=", params.t)
            .where("binding.scope_type", "=", "tenant")
            .where("binding.principal_type", "=", "member")
            .execute();
          const may = new Set(
            holders
              .filter((row) =>
                row.permissions.some((one) => ["*:*", "access:*", "access:write"].includes(one)),
              )
              .map((row) => row.principal_id),
          );
          if (may.size < 2) {
            throw new HttpError(
              409,
              "approval_needs_two",
              "Approval needs two people who may release the tenant's access, so that one can answer the other. Give a second member a role with access:write first.",
            );
          }
        }
        await ctx.mutate(async (trx, audit) => {
          await trx
            .updateTable("tenant")
            .set({ access_approval: body.required })
            .where("id", "=", params.t)
            .execute();
          await audit({
            action: "access.approval_changed",
            targetType: "tenant",
            targetId: params.t,
            tenantId: params.t,
            details: { required: body.required },
          });
        });
        return { required: body.required };
      },
    );

    const ReleaseBody = Type.Object({
      resources: Type.Array(Resource, {
        maxItems: 5000,
        description: "The whole set, as the repository has it.",
      }),
      message: Type.Optional(Type.String({ maxLength: 500 })),
      allowDelete: AllowDelete,
    });
    const asksOf = (resources: TenantResource[]): AccessAsk[] =>
      resources.map((resource) => ({ op: "put", resource }));

    app.post(
      "/tenants/:t/access/plan",
      {
        config: { access: access.tenant("access:read") },
        schema: {
          summary: "What releasing a set would change",
          description:
            "Found by carrying the release out and taking it all back, so it is exactly what the " +
            "release would then do, including why it would be refused.",
          tags: ["access"],
          params: Type.Object({ t: Id }),
          body: ReleaseBody,
          response: {
            200: Type.Object({
              possible: Type.Boolean(),
              refusal: Type.Union([
                Type.Object({
                  code: Type.String(),
                  detail: Type.String(),
                  errors: Type.Array(Type.Object({ path: Type.String(), message: Type.String() })),
                }),
                Type.Null(),
              ]),
              summary: Type.Union([Summary, Type.Null()]),
              waits: Type.Boolean({
                description: "Whether the release would wait for a second person.",
              }),
            }),
          },
        },
      },
      async ({ ctx, params, body }) => {
        const tenant = await db
          .selectFrom("tenant")
          .select("access_approval")
          .where("id", "=", params.t)
          .executeTakeFirstOrThrow();
        // A plan is asked with a body, so it is a POST, and it leaves nothing behind.
        ctx.mutated = true;
        let summary: AccessSummary | undefined;
        try {
          await mutate(db, ctx.actor, async (trx, audit) => {
            summary = (
              await releaseAccess(trx, audit, params.t, ctx.principal, {
                scope: "full",
                asks: asksOf(body.resources),
                origin: "cli",
                allowDelete: body.allowDelete,
                approved: true,
              })
            ).summary;
            throw new DryRun();
          });
        } catch (error) {
          if (error instanceof HttpError && error.statusCode < 500) {
            return {
              possible: false,
              refusal: {
                code: error.problemCode,
                detail: error.message,
                errors: error.issues ?? [],
              },
              summary: null,
              waits: tenant.access_approval,
            };
          }
          if (!(error instanceof DryRun)) throw error;
        }
        return {
          possible: true,
          refusal: null,
          summary: summary ?? null,
          waits: tenant.access_approval && (summary?.changes.length ?? 0) > 0,
        };
      },
    );

    app.post(
      "/tenants/:t/access/releases",
      {
        config: { access: access.tenant("access:write") },
        schema: {
          summary: "Release the tenant's access",
          description:
            "Changes the tenant's groups, service accounts, roles and what they are given to " +
            "match the set, in one transaction. What the set does not have is removed only when " +
            "allowed by name. When the tenant asks for a second person, the release waits (202) " +
            "and nothing changes until it is approved.",
          tags: ["access"],
          params: Type.Object({ t: Id }),
          body: ReleaseBody,
          response: {
            201: Type.Object({
              id: Id,
              number: Type.Integer(),
              status: Type.String(),
              summary: Summary,
            }),
            202: Type.Object({
              id: Id,
              number: Type.Integer(),
              status: Type.String(),
              summary: Summary,
            }),
          },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const released = await ctx.mutate((trx, audit) =>
          releaseAccess(trx, audit, params.t, ctx.principal, {
            scope: "full",
            asks: asksOf(body.resources),
            message: body.message,
            origin: ctx.principal.type === "member" ? "cli" : "api",
            allowDelete: body.allowDelete,
          }),
        );
        return reply.code(released.status === "applied" ? 201 : 202).send(released);
      },
    );

    app.get(
      "/tenants/:t/access/releases",
      {
        config: { access: access.tenant("access:read") },
        schema: {
          summary: "The releases of the tenant's access, newest first",
          tags: ["access"],
          params: Type.Object({ t: Id }),
          response: { 200: Type.Object({ items: Type.Array(Release) }) },
        },
      },
      async ({ params }) => {
        const rows = await load(params.t);
        const who = await names(rows.flatMap((row) => [row.created_by_id, row.decided_by_id]));
        return { items: rows.map((row) => show(row, who)) };
      },
    );

    app.post(
      "/tenants/:t/access/releases/:id/decision",
      {
        config: { access: access.tenant("access:write") },
        schema: {
          summary: "Approve, decline or withdraw a release that waits",
          description:
            "Approving applies it, and is done by someone other than whoever asked. If the " +
            "tenant's access changed since it was asked for, so that it would do something else, " +
            "it is refused with `release_stale`. Whoever asked can withdraw it.",
          tags: ["access"],
          params: Type.Object({ t: Id, id: Id }),
          body: Type.Object({
            decision: Type.Union([
              Type.Literal("approve"),
              Type.Literal("decline"),
              Type.Literal("withdraw"),
            ]),
            comment: Type.Optional(Type.String({ maxLength: 1000 })),
          }),
          response: {
            200: Type.Object({ id: Id, number: Type.Integer(), status: Type.String() }),
          },
        },
      },
      async ({ ctx, params, body }) =>
        ctx.mutate((trx, audit) =>
          decideRelease(
            trx,
            audit,
            params.t,
            ctx.principal,
            params.id,
            body.decision,
            body.comment,
          ),
        ),
    );

    app.post(
      "/tenants/:t/access/releases/:id/rollback",
      {
        config: { access: access.tenant("access:write") },
        schema: {
          summary: "Go back to the access an earlier release left",
          description:
            "A new release of that release's whole set. What was made since is removed, and it " +
            "waits for approval like any other. Groups an identity provider made are untouched.",
          tags: ["access"],
          params: Type.Object({ t: Id, id: Id }),
          response: {
            201: Type.Object({
              id: Id,
              number: Type.Integer(),
              status: Type.String(),
              summary: Summary,
            }),
            202: Type.Object({
              id: Id,
              number: Type.Integer(),
              status: Type.String(),
              summary: Summary,
            }),
          },
        },
      },
      async ({ ctx, params }, reply) => {
        const released = await ctx.mutate(async (trx, audit) => {
          const back = await rollbackAsks(trx, params.t, params.id);
          return releaseAccess(trx, audit, params.t, ctx.principal, {
            scope: "full",
            asks: back.asks,
            allowDelete: back.allowDelete,
            message: `Back to release ${back.number}`,
            origin: "rollback",
          });
        });
        return reply.code(released.status === "applied" ? 201 : 202).send(released);
      },
    );
  };
}
