import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  buildApp,
  type DocSet,
  type DocsApp,
  docsApps,
  type ResourceLike,
  urlOf,
} from "@volvel/docs-engine";
import { type Static, Type } from "typebox";
import { appUrl } from "../kernel/apps/address.js";
import type { RequestContext, WorkspaceRef } from "../kernel/http.js";
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

/** A page of a docs app the caller may open, and where it is served. */
const PageLink = Type.Object({
  app: Type.String({ description: "The docs app the page is in, by the app's path." }),
  path: Type.String({ description: "The page, by its path in the workspace." }),
  title: Type.String(),
  url: Type.String({ description: "Where the page is served." }),
});

const Term = Type.Object({
  id: Type.String(),
  term: Type.String(),
  aliases: Type.Array(Type.String()),
  short: Type.String(),
  page: Type.Union([PageLink, Type.Null()], { description: "Where to read more." }),
});

const Extension = Type.Object({
  topic: Type.String({ description: "The topic of the product's help the page adds notes to." }),
  page: PageLink,
});

const Attachment = Type.Object({
  kind: Type.String(),
  resource: Type.String({ description: "The resource the page documents, by its path." }),
  page: PageLink,
});

const Topic = Type.Object({
  topic: Type.String({
    description: "A name of the tenant's own for a page, that stays when the page moves.",
  }),
  page: PageLink,
});

/** A docs app with its pages built, and the resource its access is checked at. */
interface Built {
  app: DocsApp;
  id: string;
  set: DocSet;
}

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

    /**
     * A workspace's docs apps, each with its pages read and built. What a
     * workspace has deployed changes only when something is deployed to it, so
     * they are kept for as long as its bundle is the one it runs, and read
     * again after the next deploy. Who may see which is decided on each request.
     */
    const kept = new Map<string, { bundle: string | null; apps: Built[] }>();
    async function builtApps(workspaceId: string, around: readonly ResourceLike[]) {
      const now = await db
        .selectFrom("workspace")
        .select("active_bundle_id")
        .where("id", "=", workspaceId)
        .executeTakeFirst();
      const bundle = now?.active_bundle_id ?? null;
      const had = kept.get(workspaceId);
      if (had && had.bundle === bundle) return had.apps;
      const rows = await db
        .selectFrom("resource")
        .select(["id", "kind", "path", "title", "body"])
        .where("workspace_id", "=", workspaceId)
        .where("kind", "in", ["doc", "app"])
        .execute();
      const apps: Built[] = [];
      for (const app of docsApps(rows)) {
        const row = rows.find((one) => one.kind === "app" && one.path === app.path);
        if (row) apps.push({ app, id: row.id, set: buildApp(app, [...rows, ...around]).set });
      }
      kept.set(workspaceId, { bundle, apps });
      if (kept.size > 200) kept.delete(kept.keys().next().value as string);
      return apps;
    }

    /**
     * What the workspace's documentation gives the help: its terms, its own
     * topics, the pages attached to resources and to the product's topics.
     * Each from a page of a docs app the caller may open, and from no other.
     */
    async function documentation(
      ctx: RequestContext,
      workspace: WorkspaceRef,
      /** The workspace's other resources, which a page may be about. */
      around: readonly ResourceLike[],
    ) {
      const at = { tenantId: workspace.tenantId, workspaceId: workspace.id };
      const out = {
        terms: [] as Static<typeof Term>[],
        extensions: [] as Static<typeof Extension>[],
        attachments: [] as Static<typeof Attachment>[],
        topics: [] as Static<typeof Topic>[],
      };
      const apps = await builtApps(workspace.id, around);
      if (apps.length === 0) return out;
      // Whoever writes or reads the workspace's documentation in the console may read all of it.
      const writer =
        (await ctx.allowed("resource:read", at)) || (await ctx.allowed("doc:read", at));
      const tenant = await db
        .selectFrom("tenant")
        .select("slug")
        .where("id", "=", workspace.tenantId)
        .executeTakeFirstOrThrow();
      for (const { app, id, set } of apps) {
        if (!writer && !(await ctx.allowed("app:read", { ...at, resourceId: id }))) continue;
        const base = appUrl(kernel, {
          tenantSlug: tenant.slug,
          workspaceSlug: workspace.slug,
          path: app.path,
        });
        const link = (path: string) => ({
          app: app.path,
          path: `${app.docs}/${path}`,
          title: set.pages.get(path)?.frontmatter.title ?? path,
          url: `${base}${urlOf(path)}`,
        });
        for (const term of Object.values(set.terms)) {
          out.terms.push({
            id: term.id,
            term: term.term,
            aliases: term.aliases ?? [],
            short: term.short,
            page: link(term.path),
          });
        }
        for (const [topic, path] of Object.entries(set.topics)) {
          out.topics.push({ topic, page: link(path) });
        }
        for (const [topic, paths] of Object.entries(set.extensions)) {
          for (const path of paths) out.extensions.push({ topic, page: link(path) });
        }
        for (const [key, paths] of Object.entries(set.attachments)) {
          const [kind = "", ...rest] = key.split(":");
          for (const path of paths) {
            out.attachments.push({ kind, resource: rest.join(":"), page: link(path) });
          }
        }
      }
      out.terms.sort((a, b) => a.id.localeCompare(b.id));
      return out;
    }

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
            "whoever may read it or start it. A term, and a page attached to a resource or to a " +
            "topic of the product's help, is given to whoever may open the docs app the page is " +
            "in. A caller who may not is told nothing of it, as if it were not there. Someone " +
            "who may see none of it is given empty lists.",
          tags: ["docs"],
          params: Type.Object({ t: Id, w: Id }),
          response: {
            200: Type.Object({
              terms: Type.Array(Term),
              resources: Type.Array(Described),
              extensions: Type.Array(Extension, {
                description: "The tenant's own notes on the product's help, by topic.",
              }),
              attachments: Type.Array(Attachment, {
                description: "The pages that say they document a resource.",
              }),
              topics: Type.Array(Topic),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const workspace = await findWorkspace(kernel, params.t, params.w);
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
        // Asked once for each resource, and only for one there is something to say about.
        const asked = new Map<string, Promise<boolean>>();
        const mayKnow = (resource: { kind: string; id: string; path: string }) => {
          const key = `${resource.kind}:${resource.path}`;
          let answer = asked.get(key);
          if (!answer) {
            answer = mayRead(resource.kind, resource.id);
            asked.set(key, answer);
          }
          return answer;
        };
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
          if (!(await mayKnow(resource))) continue;
          resources.push({
            kind: resource.kind,
            path: resource.path,
            title: resource.title,
            description,
            ...(resource.kind === "table" ? { columns } : {}),
          });
        }

        const docs = await documentation(ctx, workspace, found);
        // A page attached to a resource is listed only for a caller who may know of the resource.
        const attachments: Static<typeof Attachment>[] = [];
        for (const attachment of docs.attachments) {
          const resource = found.find(
            (one) => one.kind === attachment.kind && one.path === attachment.resource,
          );
          if (resource && (await mayKnow(resource))) attachments.push(attachment);
        }
        return {
          terms: docs.terms,
          resources,
          extensions: docs.extensions,
          attachments,
          topics: docs.topics,
        };
      },
    );
  };
}
