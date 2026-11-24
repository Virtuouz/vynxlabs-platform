import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { type Static, Type } from "typebox";
import { conflict, notFound } from "../kernel/errors.js";
import { access, findWorkspace } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { refuseWidgetInUse, widgetUsesIn } from "../kernel/widgets.js";
import { Id, iso, NoContent, Time, WorkspaceParams } from "./shared.js";

const Version = Type.Object({
  version: Type.String(),
  current: Type.Boolean({
    description:
      'Whether this is the version the repository defines now: the one "Add to page" places.',
  }),
  deployedAt: Time,
  files: Type.Integer(),
  bytes: Type.Integer(),
  placements: Type.Integer({ description: "How many widgets on pages place this version." }),
  definition: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: true,
    description: "The widget's definition as that version had it.",
  }),
});
const Widget = Type.Object({
  type: Type.String({ description: "`x/<name>`." }),
  current: Type.Union([Type.String(), Type.Null()], {
    description: "The version the repository defines now, or empty once the widget is removed.",
  }),
  versions: Type.Array(Version, { description: "Oldest first." }),
});

/** The versions of a developer's widgets that a workspace has deployed. */
export function widgetRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  const { db } = kernel;
  const base = "/tenants/:t/workspaces/:w/widgets";
  return async (app) => {
    app.get(
      base,
      {
        config: {
          access: access.custom(
            "Needs `resource:read` in the workspace, or `interface:read` or `dashboard:read`, which a page's editor holds.",
          ),
        },
        schema: {
          summary: "The widgets of your own that a workspace has deployed, with their versions",
          description:
            'Each widget by type, with every version deployed (a page keeps the version it was placed with), which one is current, and how many widgets on pages place each. The inspector offers "Update to" a newer version from this.',
          tags: ["apps"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(Widget) }) },
        },
      },
      async ({ ctx, params }) => {
        const workspace = await findWorkspace(kernel, params.t, params.w);
        ctx.workspace = workspace;
        const at = { tenantId: workspace.tenantId, workspaceId: workspace.id };
        let read = false;
        for (const permission of ["resource:read", "interface:read", "dashboard:read"]) {
          if (await ctx.allowed(permission, at)) read = true;
        }
        if (!read) await ctx.authorize("resource:read", at);
        const rows = await db
          .selectFrom("widget_version")
          .select(["type", "version", "definition", "files", "created_at"])
          .where("workspace_id", "=", workspace.id)
          .orderBy("type")
          .orderBy("created_at")
          .execute();
        const current = new Map(
          (
            await db
              .selectFrom("resource")
              .select(["path", "body"])
              .where("workspace_id", "=", workspace.id)
              .where("kind", "=", "widget")
              .execute()
          ).map((row) => [row.path, (row.body as { version: string }).version]),
        );
        const uses = await widgetUsesIn(db, workspace.id);
        const items = new Map<string, Static<typeof Widget>>();
        for (const row of rows) {
          const widget = items.get(row.type) ?? {
            type: row.type,
            current: current.get(row.type) ?? null,
            versions: [],
          };
          widget.versions.push({
            version: row.version,
            current: current.get(row.type) === row.version,
            deployedAt: iso(row.created_at),
            files: row.files.length,
            bytes: row.files.reduce((sum, file) => sum + file.size, 0),
            placements: uses.filter((use) => use.widget === row.type && use.version === row.version)
              .length,
            definition: row.definition,
          });
          items.set(row.type, widget);
        }
        return { items: [...items.values()] };
      },
    );

    app.delete(
      `${base}/:name/versions/:version`,
      {
        config: { access: access.workspace("deployment:write") },
        schema: {
          summary: "Remove one deployed version of a widget",
          description:
            "Refused while a page places that version, naming each page, and refused for the version the repository defines now: deploy a newer one first. Its files are swept once nothing names them. Audited.",
          tags: ["apps"],
          params: Type.Object({
            t: Id,
            w: Id,
            name: Type.String({ pattern: "^[a-z][a-z0-9-]*$", maxLength: 41 }),
            version: Type.String({ pattern: "^\\d+\\.\\d+\\.\\d+$" }),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const type = `x/${params.name}`;
        await ctx.mutate(async (trx, audit) => {
          const row = await trx
            .selectFrom("widget_version")
            .select("version")
            .where("workspace_id", "=", params.w)
            .where("type", "=", type)
            .where("version", "=", params.version)
            .forUpdate()
            .executeTakeFirst();
          if (!row) throw notFound(`${type} ${params.version}`);
          const defined = await trx
            .selectFrom("resource")
            .select("body")
            .where("workspace_id", "=", params.w)
            .where("kind", "=", "widget")
            .where("path", "=", type)
            .executeTakeFirst();
          if ((defined?.body as { version?: string } | undefined)?.version === params.version) {
            throw conflict(
              `${params.version} is the version of ${type} that the repository defines now. Deploy a newer version first.`,
            );
          }
          await refuseWidgetInUse(trx, params.w, [{ type, version: params.version }]);
          await trx
            .deleteFrom("widget_version")
            .where("workspace_id", "=", params.w)
            .where("type", "=", type)
            .where("version", "=", params.version)
            .execute();
          await audit({
            action: "widget.version_removed",
            targetType: "widget",
            targetId: `${type}@${params.version}`,
            tenantId: params.t,
            workspaceId: params.w,
            details: { type, version: params.version },
          });
        });
        return reply.code(204).send(null);
      },
    );
  };
}
