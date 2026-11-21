import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { displayColumn } from "../kernel/data/query/inputs.js";
import { workspaceCatalog } from "../kernel/data/query/widget.js";
import { describeTable, findRows, scopeFor, withData } from "../kernel/data/rows.js";
import { badRequest, forbidden, notFound } from "../kernel/errors.js";
import { access, guestLimit, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { locatePage, UUID } from "../kernel/pages/locate.js";
import { Id } from "./shared.js";

/** The most choices one answer holds. */
const MAX_CHOICES = 50;

/**
 * What a field of a form may be set to (S9, Forms): for a reference column, the rows it may
 * point to, by their display name, as the caller may read that table; for an enum, its values.
 * Authorized as the widget data of the page is.
 */
export function widgetChoicesRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/tenants/:t/workspaces/:w/widget-choices",
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "What a column of a widget's table may be set to",
          description:
            "For a reference column: the rows it may point to, by display name, searched with " +
            "`search`, at most 50, read as the caller reads that table (its row policy applies). " +
            "For an enum column: its values. The table is the one the widget's data input reads, " +
            'or the page\'s record table for a `{ record: "this" }` source. Authorized as the ' +
            "widget data of the page is.",
          tags: ["apps", "dashboards"],
          params: Type.Object({ t: Id, w: Id }),
          querystring: Type.Object({
            of: Type.Union([Type.Literal("interface"), Type.Literal("dashboard")]),
            path: Type.String({ minLength: 1, maxLength: 255 }),
            page: Type.Optional(Type.String({ maxLength: 40 })),
            widget: Type.String({ minLength: 1, maxLength: 40 }),
            input: Type.String({ minLength: 1, maxLength: 40 }),
            column: Type.String({ minLength: 1, maxLength: 100 }),
            search: Type.Optional(Type.String({ maxLength: 200 })),
            record: Type.Optional(Type.String({ maxLength: 80 })),
            draft: Type.Optional(Type.String({ maxLength: 5 })),
          }),
          response: {
            200: Type.Object({
              choices: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        if (query.record !== undefined && !UUID.test(query.record)) throw notFound("The record");
        const { at, widgets, recordTable } = await locatePage(
          kernel,
          ctx as RequestContext,
          params,
          query,
        );
        const widget = widgets.find((one) => one.id === query.widget);
        if (!widget) throw notFound("The widget");
        const input = widget.data?.[query.input];
        if (!input) throw notFound(`The data "${query.input}" of the widget`);
        const tableName =
          "visual" in input.source
            ? input.source.visual.table
            : "record" in input.source
              ? recordTable
              : undefined;
        if (!tableName)
          throw badRequest("This data is not a table's: it has no columns to choose.");

        const catalog = await workspaceCatalog(kernel, at.tenantId, at.workspaceId);
        const table = catalog.tables.get(tableName);
        const column = table?.columns.find(
          (one) => one.name === query.column && one.status === "active",
        );
        if (!table || !column) throw notFound("The column");
        const search = (query.search ?? "").trim();

        if (!column.referenceTable) {
          const values = column.options?.values;
          if (!values || values.length === 0) {
            throw badRequest("This column offers no choices: it is not a reference or an enum.");
          }
          // An enum's values need no more than the right to read its table.
          const allowed = await ctx.allowed("data:read", {
            ...at,
            resourceId: table.resourceId ?? undefined,
          });
          if (!allowed) throw forbidden(`the data:read permission on the table "${table.name}"`);
          const found = values
            .map((one) => ({ value: one.value, label: one.label ?? one.value }))
            .filter(
              (one) =>
                search === "" ||
                one.label.toLowerCase().includes(search.toLowerCase()) ||
                one.value.toLowerCase().includes(search.toLowerCase()),
            );
          return { choices: found.slice(0, MAX_CHOICES) };
        }

        // A reference: the rows of the table it points to, as the caller reads that table.
        const target = catalog.tables.get(column.referenceTable);
        if (!target) throw notFound("The table the column points to");
        const where = { ...at, resourceId: target.resourceId ?? undefined };
        if (!(await ctx.allowed("data:read", where))) {
          throw forbidden(`the data:read permission on the table "${target.name}"`);
        }
        const owner = (await kernel.data.forTenant(at.tenantId)).owner;
        const described = await describeTable(owner, at.workspaceId, target.name);
        const display = displayColumn(described);
        if (!display) {
          throw badRequest(`The table "${target.name}" has no column that names its rows.`);
        }
        const scope = await scopeFor(
          kernel,
          at.tenantId,
          ctx.principal,
          await ctx.allowed("data_all:read", where),
        );
        const read = await withData(kernel, at.tenantId, scope, (data) =>
          findRows(data, described, {
            ...(search !== ""
              ? { filter: { column: display, op: "contains", value: search } }
              : {}),
            sort: [display],
            limit: MAX_CHOICES,
          }),
        );
        return {
          choices: read.items
            .filter((row) => row[display] !== null && row[display] !== undefined)
            .map((row) => ({ value: String(row.id), label: String(row[display]) })),
        };
      },
    );
  };
}
