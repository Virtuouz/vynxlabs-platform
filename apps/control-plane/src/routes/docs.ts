import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  appOf,
  buildApp,
  buildSearchIndex,
  type DocsApp,
  docsApps,
  loadSearchIndex,
  type ResourceLike,
  readPage,
  urlOf,
} from "@volvel/docs-engine";
import { walk } from "@volvel/markup";
import { type Static, Type } from "typebox";
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
  order: Type.Union([Type.Number(), Type.Null()]),
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
  terms: Type.Array(
    Type.Object({
      id: Type.String(),
      term: Type.String(),
      aliases: Type.Array(Type.String()),
      short: Type.String(),
    }),
  ),
});

const App = Type.Object({
  path: Type.String(),
  title: Type.String(),
  docs: Type.String({ description: "The folder of pages it serves." }),
  deployed: Type.Boolean({ description: "False for an app that is only a draft." }),
});

/** A workspace's pages and docs apps, as its writers see them: drafts laid over what is deployed. */
interface Working {
  resources: (ResourceLike & {
    state: Static<typeof PageSummary>["state"];
    file: string | null;
    revision: number | null;
    /** What is deployed under a draft, for whoever wants the two side by side. */
    deployed?: Record<string, unknown>;
  })[];
  apps: (DocsApp & { deployed: boolean })[];
}

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

    async function working(workspaceId: string): Promise<Working> {
      const [live, drafts] = await Promise.all([
        db
          .selectFrom("resource")
          .select(["key", "kind", "path", "title", "body", "meta"])
          .where("workspace_id", "=", workspaceId)
          .where("kind", "in", ["doc", "app"])
          .execute(),
        db
          .selectFrom("resource_draft")
          .select(["key", "kind", "path", "title", "body", "deleted", "revision"])
          .where("workspace_id", "=", workspaceId)
          .where("kind", "in", ["doc", "app"])
          .execute(),
      ]);
      const drafted = new Map(drafts.map((draft) => [draft.key, draft]));
      const resources: Working["resources"] = [];
      const deployedApps = new Set<string>();
      for (const one of live) {
        const draft = drafted.get(one.key);
        drafted.delete(one.key);
        if (one.kind === "app") deployedApps.add(one.path);
        resources.push({
          kind: one.kind,
          path: draft && !draft.deleted ? draft.path : one.path,
          title: (draft && !draft.deleted ? draft.title : one.title) ?? undefined,
          body: draft && !draft.deleted ? draft.body : one.body,
          state: draft ? (draft.deleted ? "removed" : "changed") : "deployed",
          file: one.meta.source && !one.meta.source.generated ? one.meta.source.file : null,
          revision: draft?.revision ?? null,
          ...(draft ? { deployed: one.body } : {}),
        });
      }
      for (const draft of drafted.values()) {
        if (draft.deleted) continue;
        resources.push({
          kind: draft.kind,
          path: draft.path,
          title: draft.title ?? undefined,
          body: draft.body,
          state: "new",
          file: null,
          revision: draft.revision,
        });
      }
      // What a draft removes is still listed, as removed, and is no part of what is built.
      const kept = resources.filter((one) => one.state !== "removed");
      return {
        resources,
        apps: docsApps(kept).map((one) => ({ ...one, deployed: deployedApps.has(one.path) })),
      };
    }

    function summary(
      one: Working["resources"][number],
      apps: readonly DocsApp[],
    ): Static<typeof PageSummary> {
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
        order: entry.frontmatter.order ?? null,
        topic: entry.frontmatter.topic ?? null,
        app: home?.path ?? null,
        url: home ? urlOf(inApp) : null,
        state: one.state,
        file: one.file,
        headings,
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
        config: { access: access.custom },
        schema: {
          summary: "The pages of documentation of a workspace, and the apps that serve them",
          description:
            "As whoever writes them sees them: a draft is laid over the page it changes, and a " +
            "page that is only a draft is listed with the rest. For whoever may read the " +
            "workspace's resources, or its documentation alone.",
          tags: ["docs"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({ apps: Type.Array(App), pages: Type.Array(PageSummary) }),
          },
        },
      },
      async ({ ctx, params }) => {
        const workspace = await enter(ctx, params);
        const { resources, apps } = await working(workspace.id);
        return {
          apps,
          pages: resources
            .filter((one) => one.kind === "doc")
            .map((one) => summary(one, apps))
            .sort((a, b) => a.path.localeCompare(b.path)),
        };
      },
    );

    app.get(
      `${base}/docs/page/*`,
      {
        config: { access: access.custom },
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
        config: { access: access.custom },
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
          const { set } = buildApp(one, kept);
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
