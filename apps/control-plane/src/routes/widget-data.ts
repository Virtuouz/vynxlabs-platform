import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { resolveFilters } from "../kernel/data/query/filters.js";
import { readWidget } from "../kernel/data/query/inputs.js";
import { runQuery } from "../kernel/data/query/run.js";
import { workspaceCatalog, writeVisual } from "../kernel/data/query/widget.js";
import { scopeFor } from "../kernel/data/rows.js";
import { badRequest, forbidden, notFound } from "../kernel/errors.js";
import { access, guestLimit, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { locatePage, UUID } from "../kernel/pages/locate.js";
import { AnyObject, Id } from "./shared.js";

/** The most values a choice filter offers. */
const MAX_OPTIONS = 200;

/**
 * What one widget of a page shows (S9, Reading data). The browser names the widget and sets
 * the page's filters; the server reads the page as it is stored, compiles each data input of
 * the widget, and runs it for whoever is looking, under each table's row policy.
 */
export function widgetDataRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const locate = (
      ctx: RequestContext,
      params: { t: string; w: string },
      query: {
        of: "interface" | "dashboard";
        path: string;
        page?: string | undefined;
        draft?: string | undefined;
      },
    ) => locatePage(kernel, ctx, params, query);

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
            size: Type.Optional(
              Type.Integer({
                minimum: 1,
                maximum: 1000,
                description: "With `input`: how many rows to read, in place of the widget's own page size.",
              }),
            ),
            sort: Type.Optional(
              Type.String({
                minLength: 1,
                maxLength: 80,
                description: "A rows input of a table in the order of this column (`-name` for descending), over all its rows.",
              }),
            ),
            cursor: Type.Optional(
              Type.String({
                maxLength: 200,
                description: "A rows input's `next`, for the page after.",
              }),
            ),
            record: Type.Optional(
              Type.String({
                maxLength: 80,
                description:
                  'The record the page is open on, by its ID: it feeds a `{ record: "this" }` source and the `{ record: column }` values of a query\'s conditions. It is read as the caller reads the table.',
              }),
            ),
            behind: Type.Optional(
              Type.String({
                maxLength: 2000,
                description:
                  'With `input`: for a summary of a table, the rows behind one group, as JSON by the group\'s name, e.g. {"team":"finance"}. The rows are read with the same filters and the page\'s filters, and answered as a `rows` input.',
              }),
            ),
            chosen: Type.Optional(
              Type.String({
                maxLength: 4000,
                description:
                  'The rows chosen in the page\'s tables and lists, as JSON by widget ID: {"list":"<record id>"}. It feeds a `{ selected: "<widget id>" }` source, read as the caller reads that table; with none chosen the input is empty and says "Choose a row in <Table>".',
              }),
            ),
            draft: Type.Optional(Type.String({ maxLength: 5 })),
          }),
          response: {
            200: Type.Object({ inputs: Type.Record(Type.String(), AnyObject) }),
          },
        },
      },
      async (request) => {
        const { ctx, params, query } = request;
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
        let behind: Record<string, unknown> | undefined;
        if (query.behind !== undefined) {
          if (query.input === undefined) {
            throw badRequest(
              "The rows behind a group are of one data input: say which with `input`.",
            );
          }
          try {
            const parsed: unknown = JSON.parse(query.behind);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw 0;
            behind = parsed as Record<string, unknown>;
          } catch {
            throw badRequest("`behind` must be a JSON object, by the groups' names.");
          }
        }
        if (query.record !== undefined && !UUID.test(query.record)) throw notFound("The record");
        let chosen: Record<string, string> | undefined;
        if (query.chosen !== undefined) {
          try {
            const parsed: unknown = JSON.parse(query.chosen);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw 0;
            chosen = Object.fromEntries(
              Object.entries(parsed).filter(
                (pair): pair is [string, string] => typeof pair[1] === "string",
              ),
            );
          } catch {
            throw badRequest("`chosen` must be a JSON object, by the widgets' IDs.");
          }
        }
        const { at, surface, filters, widgets, follow, recordTable } = await locate(
          ctx,
          params,
          query,
        );

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
          ...(recordTable !== undefined ? { recordTable } : {}),
          ...(query.record !== undefined ? { record: query.record } : {}),
          ...(behind ? { behind } : {}),
          ...(chosen ? { chosen } : {}),
          ...(query.sort !== undefined ? { sort: query.sort } : {}),
          ...(query.size !== undefined && query.input !== undefined ? { size: query.size } : {}),
          ...(kernel.hosts.runsCodeApps(await kernel.hosts.place(request))
            ? { elsewhere: true }
            : {}),
          ...(query.draft === "1" || query.draft === "true" ? { draft: true } : {}),
          widgets,
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
