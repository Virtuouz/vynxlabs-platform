import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import {
  type DashboardBody,
  type InterfaceBody,
  PATH_PATTERN,
  type PageFilter,
  type PageWidget,
} from "@volvel/manifest";
import { Type } from "typebox";
import { resolveFilters } from "../kernel/data/query/filters.js";
import { readWidget } from "../kernel/data/query/inputs.js";
import { runQuery } from "../kernel/data/query/run.js";
import { workspaceCatalog, writeVisual } from "../kernel/data/query/widget.js";
import { scopeFor } from "../kernel/data/rows.js";
import { badRequest, forbidden, notFound } from "../kernel/errors.js";
import { access, findWorkspace, guestLimit, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { AnyObject, Id } from "./shared.js";

/** The most values a choice filter offers. */
const MAX_OPTIONS = 200;
const pathPattern = new RegExp(PATH_PATTERN);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What one widget of a page shows (S9, Reading data). The browser names the widget and sets
 * the page's filters; the server reads the page as it is stored, compiles each data input of
 * the widget, and runs it for whoever is looking, under each table's row policy.
 */
export function widgetDataRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    /** Finds the page a request names, as the caller may read it: its widgets, filters and where it was deployed. */
    const locate = async (
      ctx: RequestContext,
      params: { t: string; w: string },
      query: { of: "interface" | "dashboard"; path: string; page?: string | undefined; draft?: string | undefined },
    ) => {
      const workspace = await findWorkspace(kernel, params.t, params.w);
      const at = { tenantId: params.t, workspaceId: params.w };
      const wantsDraft = query.draft === "1" || query.draft === "true";
        /** The page as it is stored: the draft, for someone who may edit it, else what is deployed. */
        const stored = async (
          kind: "interface" | "dashboard",
          path: string,
          mayEdit: () => Promise<boolean>,
        ) => {
          const live = await db
            .selectFrom("resource")
            .select(["id", "key", "body"])
            .where("workspace_id", "=", workspace.id)
            .where("kind", "=", kind)
            .where((eb) => (UUID.test(path) ? eb("id", "=", path) : eb("path", "=", path)))
            .executeTakeFirst();
          if (!wantsDraft)
            return live ? { id: live.id, body: live.body, deployed: true } : undefined;
          const where = await db
            .selectFrom("workspace")
            .select("type")
            .where("id", "=", workspace.id)
            .executeTakeFirstOrThrow();
          if (where.type !== "dev" || !(await mayEdit())) {
            throw forbidden("to edit this page, in a dev workspace, which a draft is read by");
          }
          const draft = await db
            .selectFrom("resource_draft")
            .select(["body", "deleted"])
            .where("workspace_id", "=", workspace.id)
            .where("kind", "=", kind)
            .where((eb) => (live ? eb("key", "=", live.key) : eb("path", "=", path)))
            .executeTakeFirst();
          if (draft?.deleted) return undefined;
          if (draft) return { id: live?.id, body: draft.body, deployed: false };
          return live ? { id: live.id, body: live.body, deployed: true } : undefined;
        };

        let widgets: readonly PageWidget[];
        let filters: readonly PageFilter[];
        let surface: "app" | "dashboard";
        let follow: { pageId: string; page?: string } | undefined;

        if (query.of === "interface") {
          if (!pathPattern.test(query.path)) throw badRequest("The path is not valid.");
          if (query.page === undefined)
            throw badRequest("An interface's widget is on a page: say which with `page`.");
          const found = await stored("interface", query.path, async () => {
            return (
              (await ctx.allowed("resource:write", at)) ||
              (await ctx.allowed("interface:write", at))
            );
          });
          // Someone who may open none of the apps that show it is told the same as when it is not there.
          let allowed =
            (await ctx.allowed("resource:read", at)) || (await ctx.allowed("interface:read", at));
          if (!allowed && found) {
            const apps = await db
              .selectFrom("resource")
              .select(["id", "body"])
              .where("workspace_id", "=", workspace.id)
              .where("kind", "=", "app")
              .execute();
            for (const candidate of apps) {
              if ((candidate.body as { interface?: string }).interface !== query.path) continue;
              if (await ctx.allowed("app:read", { ...at, resourceId: candidate.id })) {
                allowed = true;
                break;
              }
            }
          }
          if (!found || !allowed) throw notFound("The interface");
          const body = found.body as unknown as InterfaceBody;
          const page = body.pages.find((one) => one.id === query.page);
          if (!page) throw notFound("The page");
          widgets = page.widgets;
          filters = page.filters ?? [];
          surface = "app";
          if (found.deployed && found.id) follow = { pageId: found.id, page: page.id };
        } else {
          await ctx.authorize("dashboard:read", at);
          const me = ctx.principal.type === "member" ? ctx.principal.id : null;
          let body: DashboardBody | undefined;
          let kept: { id: string; deployed: boolean } | undefined;
          if (UUID.test(query.path) && me) {
            // A member's own dashboard: theirs, shared with everyone, or with a group of theirs.
            const mine = await db
              .selectFrom("member_dashboard")
              .select(["id", "member_id", "body"])
              .where("workspace_id", "=", workspace.id)
              .where("id", "=", query.path)
              .where(
                sql<boolean>`(
                  member_id = ${me}
                  or shared
                  or exists (
                    select 1 from dashboard_share s
                    join group_member g on g.group_id = s.group_id
                    where s.dashboard_id = member_dashboard.id and g.member_id = ${me}
                  )
                )`,
              )
              .executeTakeFirst();
            if (mine) {
              if (wantsDraft && mine.member_id !== me) {
                throw forbidden("to be the member whose dashboard this is");
              }
              body = mine.body as unknown as DashboardBody;
            }
          }
          if (!body) {
            const found = await stored("dashboard", query.path, () =>
              ctx.allowed("resource:write", at),
            );
            if (found) {
              body = found.body as unknown as DashboardBody;
              if (found.deployed && found.id) kept = { id: found.id, deployed: true };
            }
          }
          if (!body) throw notFound("The dashboard");
          widgets = body.widgets;
          filters = body.filters ?? [];
          surface = "dashboard";
          if (kept) follow = { pageId: kept.id };
        }
      return { at, surface, filters, widgets, follow };
    };

    app.get(
      "/tenants/:t/workspaces/:w/widget-data",
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "What one widget of an interface or a dashboard shows",
          description:
            "Reads the widget's data inputs from the page as it is stored, with the page's " +
            "filters as `filters` sets them, and answers each input as rows, a summary (breakdowns " +
            "and values) or a record. Whoever asks needs `data:read` on each table, and is given " +
            "the rows each table's policy gives them: two people looking at one page may see " +
            "different rows. For an interface: `app:read` on an app that serves it, or " +
            "`interface:read`. For a dashboard: `dashboard:read`, and for a member's own, that " +
            "it is theirs or shared with them. `draft=1` reads the draft of a resource, for " +
            "someone who may edit it, in a dev workspace.",
          tags: ["apps", "dashboards"],
          params: Type.Object({ t: Id, w: Id }),
          querystring: Type.Object({
            of: Type.Union([Type.Literal("interface"), Type.Literal("dashboard")]),
            path: Type.String({
              minLength: 1,
              maxLength: 255,
              description: "An interface's path, or a dashboard's ID or path.",
            }),
            page: Type.Optional(
              Type.String({ maxLength: 40, description: "An interface's page, by its ID." }),
            ),
            widget: Type.String({ minLength: 1, maxLength: 40 }),
            filters: Type.Optional(
              Type.String({
                maxLength: 4000,
                description:
                  'The page\'s filters by name, as JSON. A date range is a name (`"last_30_days"`) or {"from":"2026-01-01","to":"2026-01-31"}, with both days included. `null` narrows nothing; a filter left out takes its default.',
              }),
            ),
            input: Type.Optional(
              Type.String({ maxLength: 41, description: "Read only this data input, to page it." }),
            ),
            cursor: Type.Optional(
              Type.String({
                maxLength: 200,
                description: "A rows input's `next`, for the page after.",
              }),
            ),
            draft: Type.Optional(Type.String({ maxLength: 5 })),
          }),
          response: {
            200: Type.Object({ inputs: Type.Record(Type.String(), AnyObject) }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        if (query.cursor !== undefined && query.input === undefined) {
          throw badRequest("A cursor pages one data input: say which with `input`.");
        }
        let given: unknown;
        if (query.filters !== undefined) {
          try {
            given = JSON.parse(query.filters);
          } catch {
            throw badRequest("The filters must be JSON.");
          }
        }
        const { at, surface, filters, widgets, follow } = await locate(ctx, params, query);

        const widget = widgets.find((one) => one.id === query.widget);
        if (!widget) throw notFound("The widget");
        const values = resolveFilters(filters, given);
        const inputs = await readWidget(kernel, {
          ...at,
          ctx: ctx as RequestContext,
          surface,
          widget,
          filters,
          values,
          ...(query.input !== undefined
            ? { only: { input: query.input, cursor: query.cursor } }
            : {}),
          ...(follow ? { follow } : {}),
        });
        return { inputs: inputs as unknown as Record<string, Record<string, unknown>> };
      },
    );

    app.get(
      "/tenants/:t/workspaces/:w/filter-options",
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "The values a choice filter of a page offers",
          description:
            "For a filter of type `choice` that names a table's column with `from` and lists " +
            "no `choices`: the column's distinct values, sorted, at most 200, read as the " +
            "caller reads the table (its row policy applies). An enum column gives its own " +
            "values. Authorized as the widget data of the page is.",
          tags: ["apps", "dashboards"],
          params: Type.Object({ t: Id, w: Id }),
          querystring: Type.Object({
            of: Type.Union([Type.Literal("interface"), Type.Literal("dashboard")]),
            path: Type.String({ minLength: 1, maxLength: 255 }),
            page: Type.Optional(Type.String({ maxLength: 40 })),
            filter: Type.String({ minLength: 1, maxLength: 60 }),
            draft: Type.Optional(Type.String({ maxLength: 5 })),
          }),
          response: { 200: Type.Object({ values: Type.Array(Type.String()) }) },
        },
      },
      async ({ ctx, params, query }) => {
        if (query.of === "interface" && query.page === undefined) {
          throw badRequest("An interface's filter is on a page: say which with `page`.");
        }
        const { at, filters } = await locate(ctx, params, query);
        const filter = filters.find((one) => one.name === query.filter);
        if (!filter) throw notFound("The filter");
        if (filter.type !== "choice" || !filter.from) {
          throw badRequest("This filter does not offer the values of a column.");
        }
        const catalog = await workspaceCatalog(kernel, at.tenantId, at.workspaceId);
        const table = catalog.tables.get(filter.from.table);
        const column = table?.columns.find(
          (one) => one.name === filter.from?.column && one.status === "active",
        );
        if (!table || !column) throw notFound("The column the filter offers");
        const allowed = await ctx.allowed("data:read", {
          ...at,
          resourceId: table.resourceId ?? undefined,
        });
        if (!allowed) {
          throw forbidden(`the data:read permission on the table "${table.name}"`);
        }
        const enumValues = column.options?.values;
        if (enumValues && enumValues.length > 0) {
          return { values: enumValues.map((one) => one.value).slice(0, MAX_OPTIONS) };
        }
        const written = writeVisual(
          {
            table: table.name,
            groupBy: [{ column: column.name }],
            sort: [{ by: column.name }],
            limit: MAX_OPTIONS,
          },
          catalog.visual,
          [{ column: column.name, op: "not_null" }],
          "/filter",
        );
        const scope = await scopeFor(
          kernel,
          at.tenantId,
          ctx.principal,
          await ctx.allowed("data_all:read", {
            ...at,
            resourceId: table.resourceId ?? undefined,
          }),
        );
        const result = await runQuery(kernel, {
          ...at,
          scope,
          text: written.sql,
          parameters: written.parameters,
          limit: MAX_OPTIONS,
          mayRead: async () => {},
        });
        const values = result.rows
          .map((row) => row[0])
          .filter((value) => value !== null && value !== undefined && value !== "")
          .map(String);
        return { values: [...new Set(values)].sort().slice(0, MAX_OPTIONS) };
      },
    );
  };
}
