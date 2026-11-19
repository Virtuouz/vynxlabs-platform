import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { type Static, Type } from "typebox";
import type { RequestContext } from "../kernel/http.js";
import { access, findWorkspace, guestLimit } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id, NullableString } from "./shared.js";

/**
 * What lets someone learn what a resource is for. Any one of a kind's
 * permissions is enough, held at the workspace or at the resource itself.
 *
 * The first of each is how a member reads the kind. The second is how an end
 * user comes to it through an app: rows they may read, a script or a flow they
 * may start. An end user holds only permissions apps use, so `table:read` and
 * `script:read` never answer for one, whatever they are bound to.
 */
export const DESCRIBED: Record<string, readonly string[]> = {
  table: ["table:read", "data:read"],
  script: ["script:read", "run:write"],
  flow: ["flow:read", "flow_run:write"],
  app: ["app:read"],
  connection: ["connection:read"],
  query: ["data:read"],
};

const Described = Type.Object({
  kind: Type.String(),
  path: Type.String(),
  title: NullableString,
  description: NullableString,
  columns: Type.Optional(
    Type.Array(Type.Object({ name: Type.String(), description: Type.String() }), {
      description: "For a table: its columns that say what they hold.",
    }),
  ),
});

const Term = Type.Object({
  id: Type.String(),
  term: Type.String(),
  aliases: Type.Array(Type.String()),
  short: Type.String(),
  page: Type.Union(
    [
      Type.Object({
        app: Type.String({ description: "The docs app the term's page is in, by its path." }),
        path: Type.String({ description: "The page, by its path inside the app." }),
      }),
      Type.Null(),
    ],
    { description: "Where to read more." },
  ),
});

/** Whether the caller holds one of a kind's permissions, at the workspace or at one resource. */
function reader(ctx: RequestContext, at: { tenantId: string; workspaceId: string }) {
  const everywhere = new Map<string, Promise<boolean>>();
  const all = ctx.allowed("resource:read", at);
  return async (kind: string, resourceId: string): Promise<boolean> => {
    const permissions = DESCRIBED[kind];
    if (!permissions) return false;
    if (await all) return true;
    for (const permission of permissions) {
      let whole = everywhere.get(permission);
      if (!whole) {
        whole = ctx.allowed(permission, at);
        everywhere.set(permission, whole);
      }
      if (await whole) return true;
    }
    for (const permission of permissions) {
      if (await ctx.allowed(permission, { ...at, resourceId })) return true;
    }
    return false;
  };
}

export function termRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.get(
      "/tenants/:t/workspaces/:w/terms",
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "What the workspace's words mean, to this caller",
          description:
            "The glossary terms the workspace's documentation defines, and the descriptions of " +
            "its tables, columns, scripts, flows, apps, connections and queries. Each is given " +
            "only to a caller who may already use the thing it describes: a table's and its " +
            "columns' to whoever may read the table or its rows, a script's or a flow's to " +
            "whoever may read it or start it. A caller who may not is told nothing of it, as " +
            "if it were not there. Someone who may see none of it is given two empty lists.",
          tags: ["docs"],
          params: Type.Object({ t: Id, w: Id }),
          response: {
            200: Type.Object({ terms: Type.Array(Term), resources: Type.Array(Described) }),
          },
        },
      },
      async ({ ctx, params }) => {
        await findWorkspace(kernel, params.t, params.w);
        const at = { tenantId: params.t, workspaceId: params.w };
        const mayRead = reader(ctx, at);
        const found = await db
          .selectFrom("resource")
          .select(["id", "kind", "path", "title", "body"])
          .where("tenant_id", "=", params.t)
          .where("workspace_id", "=", params.w)
          .where("kind", "in", Object.keys(DESCRIBED))
          .orderBy("kind")
          .orderBy("path")
          .execute();
        const resources: Static<typeof Described>[] = [];
        for (const resource of found) {
          const body = resource.body as {
            description?: unknown;
            columns?: Record<string, { description?: unknown }>;
          };
          const description = typeof body.description === "string" ? body.description : null;
          const columns =
            resource.kind === "table"
              ? Object.entries(body.columns ?? {})
                  .flatMap(([name, column]) =>
                    typeof column.description === "string" && column.description !== ""
                      ? [{ name, description: column.description }]
                      : [],
                  )
                  // The database keeps a table's columns in no order of the author's.
                  .sort((a, b) => a.name.localeCompare(b.name))
              : [];
          // Nothing to say about it: not asked about, so a workspace of many
          // undescribed resources costs no checks.
          if (description === null && columns.length === 0) continue;
          if (!(await mayRead(resource.kind, resource.id))) continue;
          resources.push({
            kind: resource.kind,
            path: resource.path,
            title: resource.title,
            description,
            ...(resource.kind === "table" ? { columns } : {}),
          });
        }
        return { terms: [], resources };
      },
    );
  };
}
