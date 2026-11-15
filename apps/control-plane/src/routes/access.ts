import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { PERMISSION_KINDS } from "@vynxlabs/manifest";
import { Type } from "typebox";
import type { Principal } from "../kernel/audit.js";
import { explainAccess, grants } from "../kernel/authorize.js";
import { notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id, NullableString, Time } from "./shared.js";

const Scope = Type.Union([
  Type.Object({ type: Type.Literal("tenant") }),
  Type.Object({ type: Type.Literal("workspace"), workspaceId: Id, workspaceName: Type.String() }),
  Type.Object({
    type: Type.Literal("resource"),
    resourceId: Id,
    workspaceId: Type.String(),
    workspaceName: Type.String(),
    kind: Type.String(),
    path: Type.String(),
  }),
]);

/**
 * Why someone can do what they can: every permission a member or service
 * account holds in the tenant, where, and the binding or access grant that
 * gives it.
 */
export function accessRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    app.get(
      "/tenants/:t/access/:principalType/:id",
      {
        config: { access: access.custom },
        schema: {
          summary: "Every permission a member or service account holds, and what gives it",
          description:
            "Read with `binding:read` in the tenant, or by the member about themselves. The " +
            "sources are what the permission check itself reads: bindings to them, to their " +
            "groups and to anyone, at the tenant, a workspace or one resource, and an operator's " +
            "active access grant. A suspended member's bindings are shown and do not count.",
          tags: ["access"],
          params: Type.Object({
            t: Id,
            principalType: Type.Union([Type.Literal("member"), Type.Literal("service_account")]),
            id: Id,
          }),
          response: {
            200: Type.Object({
              principal: Type.Object({
                type: Type.String(),
                id: Id,
                name: Type.String(),
                email: NullableString,
                suspended: Type.Boolean(),
                groups: Type.Array(Type.Object({ id: Id, name: Type.String() })),
              }),
              sources: Type.Array(
                Type.Object({
                  source: Type.Union([Type.Literal("binding"), Type.Literal("access_grant")]),
                  id: Id,
                  role: Type.Object({
                    id: Id,
                    name: Type.String(),
                    permissions: Type.Array(Type.String()),
                  }),
                  scope: Scope,
                  through: Type.Union([
                    Type.Object({ type: Type.Literal("direct") }),
                    Type.Object({ type: Type.Literal("group"), id: Id, name: Type.String() }),
                    Type.Object({ type: Type.Literal("anyone") }),
                  ]),
                  expiresAt: Type.Union([Time, Type.Null()]),
                  counts: Type.Boolean(),
                }),
              ),
              permissions: Type.Array(
                Type.Object({
                  permission: Type.String(),
                  kind: Type.String(),
                  verb: Type.String(),
                  label: Type.String(),
                  meaning: Type.String(),
                  group: Type.String(),
                  sources: Type.Array(Id, { description: "The sources that give it." }),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const self =
          params.principalType === "member" &&
          ctx.principal.type === "member" &&
          ctx.principal.id === params.id;
        if (!self) await ctx.authorize("binding:read", { tenantId: params.t });
        let principal: Principal;
        let name: string;
        let email: string | null = null;
        let suspended = false;
        let groups: { id: string; name: string }[] = [];
        if (params.principalType === "member") {
          // A member of the tenant, or someone given something in it: an operator with an
          // access grant is no member, and is still someone who can act here.
          const member = await db
            .selectFrom("member")
            .leftJoin("tenant_member", (join) =>
              join
                .onRef("tenant_member.member_id", "=", "member.id")
                .on("tenant_member.tenant_id", "=", params.t),
            )
            .select([
              "member.id",
              "member.name",
              "member.email",
              "tenant_member.suspended_at",
              "tenant_member.member_id as membership",
            ])
            .where("member.id", "=", params.id)
            .executeTakeFirst();
          const standing =
            member &&
            (member.membership !== null ||
              (await db
                .selectFrom("access_grant")
                .select("id")
                .where("tenant_id", "=", params.t)
                .where("member_id", "=", params.id)
                .executeTakeFirst()) !== undefined ||
              (await db
                .selectFrom("binding")
                .select("id")
                .where("tenant_id", "=", params.t)
                .where("principal_type", "=", "member")
                .where("principal_id", "=", params.id)
                .executeTakeFirst()) !== undefined);
          if (!member || !standing) throw notFound("The member");
          principal = { type: "member", id: member.id };
          name = member.name || member.email;
          email = member.email;
          suspended = member.suspended_at !== null && member.suspended_at !== undefined;
          groups = await db
            .selectFrom("group_member")
            .innerJoin("principal_group", "principal_group.id", "group_member.group_id")
            .select(["principal_group.id", "principal_group.name"])
            .where("group_member.member_id", "=", member.id)
            .where("principal_group.tenant_id", "=", params.t)
            .orderBy("principal_group.name")
            .execute();
        } else {
          const account = await db
            .selectFrom("service_account")
            .select(["id", "name"])
            .where("tenant_id", "=", params.t)
            .where("id", "=", params.id)
            .executeTakeFirst();
          if (!account) throw notFound("The service account");
          principal = { type: "service_account", id: account.id, tenantId: params.t };
          name = account.name;
        }
        const sources = await explainAccess(db, principal, params.t);
        const permissions = [];
        for (const kind of PERMISSION_KINDS) {
          if (kind.scope === "instance") continue;
          for (const [verb, meaning] of Object.entries(kind.verbs)) {
            const permission = `${kind.kind}:${verb}`;
            const giving = sources.filter((source) => grants(source.role.permissions, permission));
            if (giving.length === 0) continue;
            permissions.push({
              permission,
              kind: kind.kind,
              verb,
              label: kind.label,
              meaning: meaning as string,
              group: kind.group,
              sources: giving.map((source) => source.id),
            });
          }
        }
        return {
          principal: {
            type: params.principalType,
            id: params.id,
            name,
            email,
            suspended,
            groups,
          },
          sources: sources.map((source) => ({
            ...source,
            expiresAt: source.expiresAt ? source.expiresAt.toISOString() : null,
          })),
          permissions,
        };
      },
    );
  };
}
