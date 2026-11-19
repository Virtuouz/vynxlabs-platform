import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId, sql } from "@volvel/db";
import {
  checkDashboard,
  DASHBOARD_VERSION,
  type DashboardBody,
  isOldDashboard,
  upgradeDashboard,
} from "@volvel/manifest";
import { Type } from "typebox";
import { checkQuery, QueryRefused } from "../kernel/data/query/parse.js";
import { checkFor, QUERY_ROWS, refusal, runQuery } from "../kernel/data/query/run.js";
import { type FilterValues, widgetQuery } from "../kernel/data/query/widget.js";
import { scopeFor } from "../kernel/data/rows.js";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../kernel/errors.js";
import { access, type RequestContext, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { QueryResultSchema } from "./queries.js";
import { AnyObject, Id, iso, NoContent, NullableString, Time, WorkspaceParams } from "./shared.js";

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
  kind: Type.Union([Type.Literal("member"), Type.Literal("resource")], {
    description:
      "`member` for a dashboard a member keeps. `resource` for one the workspace keeps as a " +
      "resource: deployed, promoted, and changed where resources are.",
  }),
  path: Type.Union([NullableString], { description: "For a resource: its path." }),
});
const Dashboard = Type.Object({
  ...Summary.properties,
  body: Type.Unsafe<Record<string, unknown>>({
    ...AnyObject,
    description:
      "The dashboard: its filters and its widgets. See the `dashboard` schema. One made " +
      "before phase 18 is given as it reads now.",
  }),
  upgraded: Type.Boolean({
    description:
      "It was made before phase 18 and is shown converted. Saving it keeps the conversion.",
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
      kind: "member" as const,
      path: null,
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
    /** What a member's dashboard holds, as a dashboard of now. */
    const bodyOf = (row: { body: unknown; title: string }): DashboardBody =>
      isOldDashboard(row.body)
        ? upgradeDashboard(row.body, row.title)
        : (row.body as unknown as DashboardBody);
    const whole = async (_workspace: WorkspaceRef, row: Row, me: string) => ({
      ...summary(row, me, (await sharesOf([row.id]))(row.id)),
      body: bodyOf(row) as unknown as Record<string, unknown>,
      upgraded: isOldDashboard(row.body),
    });
    /** The dashboards the workspace keeps as resources. Whoever may see dashboards sees them. */
    const kept = (workspace: WorkspaceRef) =>
      db
        .selectFrom("resource")
        .select(["id", "path", "title", "body", "updated_at"])
        .where("workspace_id", "=", workspace.id)
        .where("kind", "=", "dashboard");
    type Kept = Awaited<ReturnType<ReturnType<typeof kept>["execute"]>>[number];
    const keptSummary = (row: Kept) => ({
      kind: "resource" as const,
      path: row.path,
      id: row.id,
      title: row.title || (row.body as { title?: string }).title || row.path,
      mine: false,
      owner: "The workspace",
      shared: true,
      sharedWith: [],
      revision: 1,
      updatedAt: iso(row.updated_at),
    });
    /** A dashboard by its ID, whoever keeps it, as far as the caller may see it. */
    const open = async (workspace: WorkspaceRef, id: string, me: string) => {
      const mine = await rows(workspace)
        .where("member_dashboard.id", "=", id)
        .where(openTo(me))
        .executeTakeFirst();
      if (mine) return { member: mine, body: bodyOf(mine) };
      const resource = await kept(workspace).where("id", "=", id).executeTakeFirst();
      if (resource) return { resource, body: resource.body as unknown as DashboardBody };
      throw notFound("The dashboard");
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
    /** Checks what a dashboard is to hold, and gives it back as it will be kept. */
    const checked = async (ctx: RequestContext, title: string, given: unknown) => {
      const result = kernel.kinds.validateManifest({
        kind: "dashboard",
        schemaVersion: 1,
        path: "dashboard",
        ownership: "ui",
        body: given,
      });
      const issues = result.ok
        ? checkDashboard(result.value.body as unknown as DashboardBody).map((issue) => ({
            path: `/body${issue.path}`,
            message: issue.message,
          }))
        : result.issues;
      if (issues.length > 0) throw badRequest("The dashboard is not valid.", issues);
      const body = given as DashboardBody;
      const written = body.widgets.flatMap((widget, index) =>
        widget.source && "sql" in widget.source ? [{ sql: widget.source.sql, index }] : [],
      );
      // SQL typed into a widget is SQL typed: whoever saves it must be allowed to write it.
      if (written.length > 0) {
        await ctx.authorize("sql:read", {
          tenantId: (ctx.workspace as WorkspaceRef).tenantId,
          workspaceId: (ctx.workspace as WorkspaceRef).id,
        });
      }
      for (const one of written) {
        try {
          await checkQuery(one.sql, { schema: "q", tables: new Set(), anyTable: true });
        } catch (error) {
          if (!(error instanceof QueryRefused)) throw error;
          throw badRequest("The dashboard is not valid.", [
            { path: `/body/widgets/${one.index}/source/sql`, message: error.message },
          ]);
        }
      }
      return { ...body, title };
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
        const resources = await kept(ctx.workspace as WorkspaceRef)
          .orderBy("path")
          .execute();
        return {
          items: [
            ...resources.map(keptSummary),
            ...found.map((row) => summary(row, me, shares(row.id))),
          ],
        };
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
        const page = await checked(ctx, title, { version: DASHBOARD_VERSION, widgets: [] });
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
          summary: "One dashboard, with its filters and widgets",
          description:
            "The caller's own, one another member shared, or one the workspace keeps as a resource.",
          tags: ["dashboards"],
          params: Params,
          response: { 200: Dashboard },
        },
      },
      async ({ ctx, params }) => {
        const me = member(ctx);
        const workspace = ctx.workspace as WorkspaceRef;
        const found = await open(workspace, params.d, me);
        if (found.member) return whole(workspace, found.member, me);
        return {
          ...keptSummary(found.resource),
          body: found.body as unknown as Record<string, unknown>,
          upgraded: false,
        };
      },
    );

    app.get(
      `${base}/:d/widgets/:widget/data`,
      {
        config: { access: access.workspace("dashboard:read") },
        schema: {
          summary: "What one widget of a dashboard shows",
          description:
            "Runs the widget's query with the dashboard's filters as `filters` sets them, and " +
            "answers as a query does. Whoever asks needs `data:read` on each table the query " +
            "reads, and is given the rows each table's policy gives them: two people looking " +
            "at one dashboard may see different numbers. It asks for no `sql:read`: the " +
            "query is the dashboard's.",
          tags: ["dashboards"],
          params: Type.Object({
            ...Params.properties,
            widget: Type.String({ maxLength: 40 }),
          }),
          querystring: Type.Object({
            filters: Type.Optional(
              Type.String({
                maxLength: 4000,
                description:
                  'The filters by name, as JSON. A range of dates is {"from":"2026-01-01","to":"2026-01-31"}. A filter left out narrows nothing.',
              }),
            ),
            limit: Type.Optional(
              Type.Integer({ minimum: 1, maximum: QUERY_ROWS.most, default: QUERY_ROWS.default }),
            ),
            part: Type.Optional(
              Type.Literal("trend", {
                description:
                  "For a figure with a `trend`, built from menus: its number over the time it covers, one row to a day, a week or a month, oldest first.",
              }),
            ),
          }),
          response: { 200: QueryResultSchema },
        },
      },
      async ({ ctx, params, query }) => {
        const me = member(ctx);
        const workspace = ctx.workspace as WorkspaceRef;
        const found = await open(workspace, params.d, me);
        const widget = found.body.widgets.find((one) => one.id === params.widget);
        if (!widget) throw notFound("The widget");
        let values: FilterValues = {};
        if (query.filters !== undefined) {
          try {
            values = JSON.parse(query.filters) as FilterValues;
          } catch {
            throw badRequest("The filters must be JSON.");
          }
          if (typeof values !== "object" || values === null || Array.isArray(values)) {
            throw badRequest("The filters must be an object, by name.");
          }
        }
        const at = { tenantId: workspace.tenantId, workspaceId: workspace.id };
        const asked = await widgetQuery(kernel, at, found.body, widget, values, query.part);
        // A parameter nothing fills is empty, so that the query can say what an empty one means.
        const needs = await checkFor(kernel, at.tenantId, at.workspaceId, asked.text).catch(
          (error) => {
            throw error instanceof QueryRefused ? refusal(error) : error;
          },
        );
        const parameters = Array.from(
          { length: needs.parameters },
          (_, index) => asked.parameters[index] ?? null,
        );
        const scope = await scopeFor(
          kernel,
          at.tenantId,
          ctx.principal,
          await ctx.allowed("data_all:read", at),
        );
        return runQuery(kernel, {
          ...at,
          scope,
          text: asked.text,
          parameters,
          ...(query.limit ? { limit: query.limit } : {}),
          mayRead: async (table) => {
            const allowed = await ctx.allowed("data:read", {
              ...at,
              resourceId: table.resourceId ?? undefined,
            });
            if (!allowed) {
              throw new HttpError(
                403,
                "forbidden",
                `This reads the table "${table.name}", which needs the data:read permission there.`,
              );
            }
          },
        });
      },
    );

    app.put(
      `${base}/:d`,
      {
        config: { access: access.workspace("dashboard:write") },
        schema: {
          summary: "Save a dashboard",
          description:
            "Only the member whose it is. `body` is the dashboard: see the `dashboard` " +
            "schema. A widget whose query is SQL written in it needs `sql:read` of whoever " +
            "saves. `shared` shows it, read-only, to everyone in the workspace " +
            "who may see dashboards: each of them is given only the rows they may read. Send " +
            "`revision` back to be told if it was saved elsewhere in between.",
          tags: ["dashboards"],
          params: Params,
          body: Type.Object({
            title: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
            body: Type.Optional(AnyObject),
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
        const page = body.body === undefined ? undefined : await checked(ctx, title, body.body);
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
