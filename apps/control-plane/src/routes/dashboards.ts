import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId, sql } from "@vynxlabs/db";
import type { InterfaceBody, InterfacePage } from "@vynxlabs/manifest";
import { Type } from "typebox";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../kernel/errors.js";
import { access, type RequestContext, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { interfaceProblems } from "./interfaces.js";
import { AnyObject, Id, iso, NoContent, Time, WorkspaceParams } from "./shared.js";

/** The most dashboards one member may keep in one workspace. */
export const MAX_DASHBOARDS = 20;

const Summary = Type.Object({
  id: Id,
  title: Type.String(),
  mine: Type.Boolean({ description: "False for a dashboard another member shared." }),
  owner: Type.String({ description: "Whose it is: their name, or their email." }),
  shared: Type.Boolean({
    description: "Shown to everyone in the workspace who may see dashboards.",
  }),
  sharedWith: Type.Array(Type.Object({ id: Id, name: Type.String() }), {
    description: "Groups of members it is shown to, when it is not shown to everyone.",
  }),
  revision: Type.Integer(),
  updatedAt: Time,
});
const Dashboard = Type.Object({
  ...Summary.properties,
  page: AnyObject,
  problems: Type.Array(Type.Object({ path: Type.String(), message: Type.String() }), {
    description:
      "What is wrong with the page as the workspace stands, such as a column its table no longer has.",
  }),
});
const Params = Type.Object({ ...WorkspaceParams.properties, d: Id });

/** A member's own dashboards in a workspace. */
export function dashboardRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w/dashboards";

    /** A dashboard is a member's. A key or an end user has none. */
    const member = (ctx: RequestContext): string => {
      if (ctx.principal.type !== "member" || !ctx.principal.id) {
        throw forbidden("a member's sign-in, which dashboards belong to");
      }
      return ctx.principal.id;
    };
    const rows = (workspace: WorkspaceRef) =>
      db
        .selectFrom("member_dashboard")
        .innerJoin("member", "member.id", "member_dashboard.member_id")
        .select([
          "member_dashboard.id",
          "member_dashboard.member_id",
          "member_dashboard.title",
          "member_dashboard.body",
          "member_dashboard.shared",
          "member_dashboard.revision",
          "member_dashboard.updated_at",
          "member.name as owner_name",
          "member.email as owner_email",
        ])
        .where("member_dashboard.workspace_id", "=", workspace.id);
    type Row = Awaited<ReturnType<ReturnType<typeof rows>["execute"]>>[number];
    /** The groups each dashboard is shared with. */
    const sharesOf = async (ids: string[]) => {
      const found =
        ids.length === 0
          ? []
          : await db
              .selectFrom("dashboard_share")
              .innerJoin("principal_group", "principal_group.id", "dashboard_share.group_id")
              .select([
                "dashboard_share.dashboard_id",
                "principal_group.id",
                "principal_group.name",
              ])
              .where("dashboard_share.dashboard_id", "in", ids)
              .orderBy("principal_group.name")
              .execute();
      return (id: string) =>
        found
          .filter((one) => one.dashboard_id === id)
          .map((one) => ({ id: one.id, name: one.name }));
    };
    const summary = (row: Row, me: string, sharedWith: { id: string; name: string }[] = []) => ({
      id: row.id,
      title: row.title,
      mine: row.member_id === me,
      owner: row.owner_name || row.owner_email,
      shared: row.shared,
      sharedWith,
      revision: row.revision,
      updatedAt: iso(row.updated_at),
    });
    /** Whether a dashboard is open to a member: theirs, shared with everyone, or with a group of theirs. */
    const openTo = (me: string) =>
      sql<boolean>`(
        member_dashboard.member_id = ${me}
        or member_dashboard.shared
        or exists (
          select 1 from dashboard_share s
          join group_member g on g.group_id = s.group_id
          where s.dashboard_id = member_dashboard.id and g.member_id = ${me}
        )
      )`;
    const whole = async (workspace: WorkspaceRef, row: Row, me: string) => {
      const page = row.body as unknown as InterfacePage;
      return {
        ...summary(row, me, (await sharesOf([row.id]))(row.id)),
        page: page as unknown as Record<string, unknown>,
        problems: await interfaceProblems(kernel, workspace, { title: row.title, pages: [page] }),
      };
    };
    /** A dashboard the caller may see: their own, or one shared with them. */
    const visible = async (workspace: WorkspaceRef, id: string, me: string) => {
      const row = await rows(workspace)
        .where("member_dashboard.id", "=", id)
        .where(openTo(me))
        .executeTakeFirst();
      if (!row) throw notFound("The dashboard");
      return row;
    };
    /** Checks a page as a page of an interface is checked. */
    const checked = (title: string, page: unknown): InterfacePage => {
      const result = kernel.kinds.validateManifest({
        kind: "interface",
        schemaVersion: 1,
        path: "dashboard",
        ownership: "ui",
        body: { title, pages: [page] } satisfies { title: string; pages: unknown[] },
      });
      if (!result.ok) {
        throw badRequest(
          "The dashboard is not valid.",
          result.issues.map((issue) => ({
            path: issue.path.replace(/^\/body\/pages\/0/, "/page"),
            message: issue.message,
          })),
        );
      }
      return (result.value.body as unknown as InterfaceBody).pages[0] as InterfacePage;
    };

    app.get(
      base,
      {
        config: { access: access.workspace("dashboard:read") },
        schema: {
          summary: "The caller's dashboards in a workspace, and those shared with them",
          tags: ["dashboards"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(Summary) }) },
        },
      },
      async ({ ctx }) => {
        const me = member(ctx);
        const found = await rows(ctx.workspace as WorkspaceRef)
          .where(openTo(me))
          .orderBy("member_dashboard.title")
          .orderBy("member_dashboard.id")
          .execute();
        const shares = await sharesOf(found.map((row) => row.id));
        return { items: found.map((row) => summary(row, me, shares(row.id))) };
      },
    );

    app.post(
      base,
      {
        config: { access: access.workspace("dashboard:write") },
        schema: {
          summary: "Make a dashboard",
          description:
            `It starts empty and belongs to the member who made it. A member may keep ${MAX_DASHBOARDS} ` +
            "in one workspace.",
          tags: ["dashboards"],
          params: WorkspaceParams,
          body: Type.Object({ title: Type.String({ minLength: 1, maxLength: 100 }) }),
          response: { 201: Dashboard },
        },
      },
      async ({ ctx, body }, reply) => {
        const me = member(ctx);
        const workspace = ctx.workspace as WorkspaceRef;
        const id = newId();
        const title = body.title.trim();
        const page = checked(title, { id: "main", title, widgets: [] });
        await ctx.mutate(async (trx, audit) => {
          const held = await trx
            .selectFrom("member_dashboard")
            .select((eb) => eb.fn.countAll<string>().as("n"))
            .where("workspace_id", "=", workspace.id)
            .where("member_id", "=", me)
            .executeTakeFirstOrThrow();
          if (Number(held.n) >= MAX_DASHBOARDS) {
            throw new HttpError(
              409,
              "limit_reached",
              `A member can keep ${MAX_DASHBOARDS} dashboards in a workspace. Delete one first.`,
            );
          }
          await trx
            .insertInto("member_dashboard")
            .values({
              id,
              tenant_id: workspace.tenantId,
              workspace_id: workspace.id,
              member_id: me,
              title,
              body: JSON.stringify(page),
            })
            .execute();
          await audit({
            action: "dashboard.created",
            targetType: "dashboard",
            targetId: id,
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            details: { title },
          });
        });
        return reply.code(201).send(await whole(workspace, await visible(workspace, id, me), me));
      },
    );

    app.get(
      `${base}/:d`,
      {
        config: { access: access.workspace("dashboard:read") },
        schema: {
          summary: "One dashboard, with its page",
          description: "The caller's own, or one another member shared.",
          tags: ["dashboards"],
          params: Params,
          response: { 200: Dashboard },
        },
      },
      async ({ ctx, params }) => {
        const me = member(ctx);
        const workspace = ctx.workspace as WorkspaceRef;
        return whole(workspace, await visible(workspace, params.d, me), me);
      },
    );

    app.put(
      `${base}/:d`,
      {
        config: { access: access.workspace("dashboard:write") },
        schema: {
          summary: "Save a dashboard",
          description:
            "Only the member whose it is. `page` is one page of an interface: see the " +
            "`interface` schema. `shared` shows it, read-only, to everyone in the workspace " +
            "who may see dashboards: each of them is given only the rows they may read. Send " +
            "`revision` back to be told if it was saved elsewhere in between.",
          tags: ["dashboards"],
          params: Params,
          body: Type.Object({
            title: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
            page: Type.Optional(AnyObject),
            shared: Type.Optional(Type.Boolean()),
            sharedWith: Type.Optional(
              Type.Array(Id, {
                maxItems: 50,
                uniqueItems: true,
                description: "Groups of members to show it to. Replaces the groups it had.",
              }),
            ),
            revision: Type.Optional(Type.Integer({ minimum: 1 })),
          }),
          response: { 200: Dashboard },
        },
      },
      async ({ ctx, params, body }) => {
        const me = member(ctx);
        const workspace = ctx.workspace as WorkspaceRef;
        const current = await visible(workspace, params.d, me);
        if (current.member_id !== me) throw forbidden("to be the member whose dashboard this is");
        if (body.revision !== undefined && body.revision !== current.revision) {
          throw conflict(
            "This dashboard was saved somewhere else since you opened it. Open it again.",
          );
        }
        const title = body.title?.trim() ?? current.title;
        const page = body.page === undefined ? undefined : checked(title, body.page);
        await ctx.mutate(async (trx, audit) => {
          await trx
            .updateTable("member_dashboard")
            .set({
              title,
              ...(page ? { body: JSON.stringify(page) } : {}),
              ...(body.shared !== undefined ? { shared: body.shared } : {}),
              revision: current.revision + 1,
              updated_at: new Date(),
            })
            .where("id", "=", current.id)
            .execute();
          if (body.sharedWith !== undefined) {
            const groups =
              body.sharedWith.length === 0
                ? []
                : await trx
                    .selectFrom("principal_group")
                    .select("id")
                    .where("tenant_id", "=", workspace.tenantId)
                    .where("id", "in", body.sharedWith)
                    .execute();
            if (groups.length !== body.sharedWith.length) {
              throw badRequest("Share it with groups of members of this tenant.", [
                { path: "/sharedWith", message: "names a group that is not one of this tenant's" },
              ]);
            }
            await trx
              .deleteFrom("dashboard_share")
              .where("dashboard_id", "=", current.id)
              .execute();
            if (groups.length > 0)
              await trx
                .insertInto("dashboard_share")
                .values(
                  groups.map((group) => ({
                    dashboard_id: current.id,
                    group_id: group.id,
                    tenant_id: workspace.tenantId,
                  })),
                )
                .execute();
          }
          await audit({
            action:
              body.shared !== undefined && body.shared !== current.shared
                ? body.shared
                  ? "dashboard.shared"
                  : "dashboard.unshared"
                : body.sharedWith !== undefined
                  ? "dashboard.shared_with_groups"
                  : "dashboard.saved",
            targetType: "dashboard",
            targetId: current.id,
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            details: {
              title,
              ...(body.sharedWith !== undefined ? { sharedWith: body.sharedWith } : {}),
            },
          });
        });
        return whole(workspace, await visible(workspace, params.d, me), me);
      },
    );

    app.delete(
      `${base}/:d`,
      {
        config: { access: access.workspace("dashboard:write") },
        schema: {
          summary: "Delete a dashboard",
          description: "Only the member whose it is. No table and no row is touched.",
          tags: ["dashboards"],
          params: Params,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const me = member(ctx);
        const workspace = ctx.workspace as WorkspaceRef;
        const current = await visible(workspace, params.d, me);
        if (current.member_id !== me) throw forbidden("to be the member whose dashboard this is");
        await ctx.mutate(async (trx, audit) => {
          await trx.deleteFrom("member_dashboard").where("id", "=", current.id).execute();
          await audit({
            action: "dashboard.deleted",
            targetType: "dashboard",
            targetId: current.id,
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            details: { title: current.title },
          });
        });
        return reply.code(204).send(null);
      },
    );
  };
}
