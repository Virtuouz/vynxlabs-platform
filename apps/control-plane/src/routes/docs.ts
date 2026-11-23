import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  appOf,
  buildSearchIndex,
  type DocsApp,
  FEEDBACK_TABLE,
  loadSearchIndex,
  readPage,
  urlOf,
} from "@volvel/docs-engine";
import { walk } from "@volvel/markup";
import { type Static, Type } from "typebox";
import { appUrl } from "../kernel/apps/address.js";
import { buildDocs, PRODUCT_CLASHES } from "../kernel/docs/product.js";
import { type WorkingResource, workingDocs } from "../kernel/docs/working.js";
import { notFound } from "../kernel/errors.js";
import type { RequestContext } from "../kernel/http.js";
import { access, findWorkspace } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { WildParams, wildPath } from "./data.js";
import { NullableString, WorkspaceParams } from "./shared.js";

const PageSummary = Type.Object({
  path: Type.String(),
  title: Type.String(),
  description: NullableString,
  pages: Type.Union([Type.Array(Type.String()), Type.Null()], {
    description: "For a folder's own page: the order of what is in the folder, by name.",
  }),
  topic: NullableString,
  app: Type.Union([Type.String(), Type.Null()], {
    description: "The docs app that serves it, by the app's path. Null for a page no app serves.",
  }),
  url: Type.Union([Type.String(), Type.Null()], {
    description: "Its address under its app's: its path there, without a last `index`.",
  }),
  state: Type.Union(
    [
      Type.Literal("deployed"),
      Type.Literal("changed"),
      Type.Literal("new"),
      Type.Literal("removed"),
    ],
    {
      description:
        "`changed` has a draft over what is deployed, `new` is only a draft, `removed` is a draft that removes it.",
    },
  ),
  file: Type.Union([Type.String(), Type.Null()], {
    description:
      "For a page kept in a folder of the repository's own: its file. It is the repository's to change.",
  }),
  headings: Type.Array(Type.String(), {
    description: "What its headings are addressed by, for a link to one of them.",
  }),
  source: Type.String({
    description:
      "The page's whole file, as it is being written: what a change to the tree of pages rewrites.",
  }),
  revision: Type.Union([Type.Integer(), Type.Null()], {
    description: "The draft's revision, to send back with a save. Null while there is no draft.",
  }),
  terms: Type.Array(
    Type.Object({
      id: Type.String(),
      term: Type.String(),
      aliases: Type.Array(Type.String()),
      short: Type.String(),
    }),
  ),
});

const Table = Type.Object({
  path: Type.String(),
  state: Type.Union(
    [
      Type.Literal("deployed"),
      Type.Literal("changed"),
      Type.Literal("new"),
      Type.Literal("removed"),
    ],
    { description: "As a page's: whether a draft makes it, changes it or removes it." },
  ),
});

const App = Type.Object({
  path: Type.String(),
  key: Type.String({
    description:
      "The app's key, which a rename keeps: what its readers' answers are filed under, as `site_key`.",
  }),
  title: Type.String(),
  docs: Type.String({ description: "The folder of pages it serves." }),
  feedback: Type.Union([Type.String(), Type.Null()], {
    description:
      "The table its readers' answers to whether a page helped are kept in. Null when it does not ask.",
  }),
  published: Type.Boolean({
    description: "False when the site is switched off: it is not served, and its pages are kept.",
  }),
  body: Type.Record(Type.String(), Type.Unknown(), {
    description:
      "The app's whole body, to change one setting of it and send the rest back as it is.",
  }),
  deployed: Type.Boolean({ description: "False for an app that is only a draft." }),
  drafted: Type.Boolean({
    description: "True while a draft changes the app, or makes it: it goes with the next deploy.",
  }),
  url: Type.String({ description: "Where the app is served, once it is deployed." }),
  preview: Type.String({
    description:
      "Where the app is shown with the workspace's drafts laid over it, to members who may read its documentation and to nobody else.",
  }),
});

export function docRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    /** Whoever may read the workspace's resources, or its documentation alone. */
    async function enter(ctx: RequestContext, params: { t: string; w: string }) {
      const workspace = await findWorkspace(kernel, params.t, params.w);
      ctx.workspace = workspace;
      const at = { tenantId: workspace.tenantId, workspaceId: workspace.id };
      if (!(await ctx.allowed("resource:read", at))) await ctx.authorize("doc:read", at);
      return workspace;
    }

    const working = (workspaceId: string) => workingDocs(db, workspaceId);

    function summary(one: WorkingResource, apps: readonly DocsApp[]): Static<typeof PageSummary> {
      const source = String((one.body as { source?: unknown }).source ?? "");
      const home = appOf(apps, one.path);
      const inApp = home ? one.path.slice(home.docs.length + 1) : one.path;
      const { entry } = readPage(inApp, source);
      const headings: string[] = [];
      for (const { node } of walk(entry.tree)) if (node.type === "heading") headings.push(node.id);
      return {
        path: one.path,
        title: entry.frontmatter.title,
        description: entry.frontmatter.description ?? null,
        pages: entry.frontmatter.pages ?? null,
        topic: entry.frontmatter.topic ?? null,
        app: home?.path ?? null,
        url: home ? urlOf(inApp) : null,
        state: one.state,
        file: one.file,
        headings,
        source,
        revision: one.revision,
        terms: (entry.frontmatter.terms ?? []).map((term) => ({
          id: term.id,
          term: term.term,
          aliases: term.aliases ?? [],
          short: term.short,
        })),
      };
    }

    app.get(
      `${base}/docs`,
      {
        config: {
          access: access.custom("Needs `resource:read` in the workspace, or `doc:read` alone."),
        },
        schema: {
          summary: "The pages of documentation of a workspace, and the apps that serve them",
          description:
            "As whoever writes them sees them: a draft is laid over the page it changes, and a " +
            "page that is only a draft is listed with the rest. For whoever may read the " +
            "workspace's resources, or its documentation alone.",
          tags: ["docs"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              apps: Type.Array(App),
              pages: Type.Array(PageSummary),
              issues: Type.Array(
                Type.Object({
                  app: Type.String(),
                  path: Type.String(),
                  code: Type.String(),
                  message: Type.String(),
                }),
                {
                  description:
                    "Pages that take a term or a topic the product's own help has. A deploy refuses " +
                    "them, and one that was deployed before the product had the name loses it " +
                    "silently, so they are said here.",
                },
              ),
              tables: Type.Array(Table, {
                description:
                  "The workspace's tables, as its writers see them: a deploy of the documentation " +
                  "carries a draft table an app keeps its readers' answers in, and a new one is " +
                  "not made at a path a table has. To whoever may read only the documentation, " +
                  "just the tables its apps name.",
              }),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const workspace = await enter(ctx, params);
        const { resources, apps } = await working(workspace.id);
        const [liveTables, draftTables] = await Promise.all([
          db
            .selectFrom("resource")
            .select(["key", "path"])
            .where("workspace_id", "=", workspace.id)
            .where("kind", "=", "table")
            .execute(),
          db
            .selectFrom("resource_draft")
            .select(["key", "path", "deleted"])
            .where("workspace_id", "=", workspace.id)
            .where("kind", "=", "table")
            .execute(),
        ]);
        const tableDrafts = new Map(draftTables.map((draft) => [draft.key, draft]));
        const tables: Static<typeof Table>[] = liveTables.map((one) => {
          const draft = tableDrafts.get(one.key);
          tableDrafts.delete(one.key);
          if (!draft) return { path: one.path, state: "deployed" };
          return draft.deleted
            ? { path: one.path, state: "removed" }
            : { path: draft.path, state: "changed" };
        });
        for (const draft of tableDrafts.values()) {
          if (!draft.deleted) tables.push({ path: draft.path, state: "new" });
        }
        const named = new Set(apps.map((one) => one.feedback).filter(Boolean));
        const seen = (await ctx.allowed("resource:read", {
          tenantId: workspace.tenantId,
          workspaceId: workspace.id,
        }))
          ? tables
          : // The workspace's table of answers is always shown to them: it is made by whichever site
            // asks first, and the next site's writer is told it is there.
            tables.filter((one) => named.has(one.path) || one.path === FEEDBACK_TABLE);
        const tenant = await db
          .selectFrom("tenant")
          .select("slug")
          .where("id", "=", workspace.tenantId)
          .executeTakeFirstOrThrow();
        const bodies = new Map(
          resources
            .filter((one) => one.kind === "app" && one.state !== "removed")
            .map((one) => [one.path, one.body as Record<string, unknown>]),
        );
        const live = resources.filter((one) => one.state !== "removed");
        const issues = apps.flatMap((one) =>
          buildDocs(kernel.config, one, live)
            .issues.filter((issue) => PRODUCT_CLASHES.includes(issue.code))
            .map((issue) => ({
              app: one.path,
              path: issue.path,
              code: issue.code,
              message: issue.message,
            })),
        );
        return {
          issues,
          apps: apps.map((one) => {
            const url = appUrl(kernel, {
              tenantSlug: tenant.slug,
              workspaceSlug: workspace.slug,
              path: one.path,
            });
            return {
              ...one,
              key: one.key ?? one.path,
              feedback: one.feedback ?? null,
              published: one.published !== false,
              body: bodies.get(one.path) ?? {},
              url,
              preview: `${url}_draft/`,
            };
          }),
          pages: resources
            .filter((one) => one.kind === "doc")
            .map((one) => summary(one, apps))
            .sort((a, b) => a.path.localeCompare(b.path)),
          tables: seen.sort((a, b) => a.path.localeCompare(b.path)),
        };
      },
    );

    app.get(
      `${base}/docs/page/*`,
      {
        config: {
          access: access.custom("Needs `resource:read` in the workspace, or `doc:read` alone."),
        },
        schema: {
          summary: "One page of documentation, as it is being written",
          description:
            "The page's source: its draft when it has one, and what is deployed otherwise. " +
            "`revision` is the draft's, to send back with a save so that a save over someone " +
            "else's is refused. It is null while there is no draft.",
          tags: ["docs"],
          params: WildParams,
          response: {
            200: Type.Object({
              page: PageSummary,
              source: Type.String(),
              revision: Type.Union([Type.Integer(), Type.Null()]),
              deployedSource: Type.Union([Type.String(), Type.Null()], {
                description: "What is deployed, when the page has a draft over it.",
              }),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const workspace = await enter(ctx, params);
        const path = wildPath(params);
        const { resources, apps } = await working(workspace.id);
        const found = resources.find((one) => one.kind === "doc" && one.path === path);
        if (!found) throw notFound(`The page at ${path}`);
        return {
          page: summary(found, apps),
          source: String((found.body as { source?: unknown }).source ?? ""),
          revision: found.revision,
          deployedSource: found.deployed
            ? String((found.deployed as { source?: unknown }).source ?? "")
            : null,
        };
      },
    );

    app.get(
      `${base}/docs/search`,
      {
        config: {
          access: access.custom("Needs `resource:read` in the workspace, or `doc:read` alone."),
        },
        schema: {
          summary: "Search the workspace's documentation",
          description:
            "Searched here, over the pages the caller may read, so that no index of pages is " +
            "ever handed to a browser. For the console's own search.",
          tags: ["docs"],
          params: WorkspaceParams,
          querystring: Type.Object({ q: Type.String({ maxLength: 200 }) }),
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  app: Type.String(),
                  title: Type.String(),
                  description: Type.String(),
                  excerpt: Type.String(),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        const workspace = await enter(ctx, params);
        const { resources, apps } = await working(workspace.id);
        const kept = resources.filter((one) => one.state !== "removed");
        const items = [];
        for (const one of apps) {
          const { set } = buildDocs(kernel.config, one, kept);
          for (const hit of loadSearchIndex(buildSearchIndex(set)).search(query.q, 10)) {
            items.push({
              path: `${one.docs}/${hit.path}`,
              app: one.path,
              title: hit.title,
              description: hit.description,
              excerpt: hit.excerpt,
            });
          }
        }
        return { items: items.slice(0, 20) };
      },
    );
  };
}
