import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { PATH_PATTERN } from "@vynxlabs/manifest";
import { Type } from "typebox";
import { mutate } from "../kernel/audit.js";
import {
  composeDrafts,
  deployDrafts,
  discardDraft,
  isCodeKind,
  saveDraft,
} from "../kernel/authoring.js";
import { badRequest, forbidden, HttpError, notFound } from "../kernel/errors.js";
import { storeBundle } from "../kernel/execution/bundles.js";
import { startRun } from "../kernel/execution/runs.js";
import { markAhead } from "../kernel/git.js";
import { access, findWorkspace, type RequestContext, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { AnyObject, Id, iso, NullableId, Time, WorkspaceParams } from "./shared.js";

const PathParams = Type.Object({ t: Id, w: Id, "*": Type.String() });
const pathPattern = new RegExp(PATH_PATTERN);
function pathOf(params: { "*": string }): string {
  const path = params["*"];
  if (!pathPattern.test(path) || path.length > 255) {
    throw badRequest("The resource path is not valid.");
  }
  return path;
}

const DraftSummary = Type.Object({
  path: Type.String(),
  kind: Type.String(),
  schemaVersion: Type.Integer(),
  deleted: Type.Boolean({ description: "True for a draft that removes the resource." }),
  revision: Type.Integer({
    description: "Goes up with each save. Send it back to be told if someone saved in between.",
  }),
  change: Type.Union(
    [
      Type.Literal("create"),
      Type.Literal("update"),
      Type.Literal("delete"),
      Type.Literal("take_over"),
    ],
    {
      description:
        "What deploying the draft does. `take_over` moves a resource from the repository to the console.",
    },
  ),
  updatedByType: Type.String(),
  updatedById: NullableId,
  updatedAt: Time,
});
const Draft = Type.Object({ ...DraftSummary.properties, body: AnyObject });
const Paths = Type.Optional(
  Type.Array(Type.String({ pattern: PATH_PATTERN, maxLength: 255 }), {
    minItems: 1,
    maxItems: 500,
    uniqueItems: true,
    description: "Only these drafts. Without it, every draft of the workspace.",
  }),
);
const Summary = Type.Object({
  created: Type.Integer(),
  updated: Type.Integer(),
  unchanged: Type.Integer(),
  deleted: Type.Integer(),
  data: Type.Array(Type.String()),
  changes: Type.Array(
    Type.Object({ change: Type.String(), kind: Type.String(), path: Type.String() }),
  ),
});

class DryRun extends Error {}

/** Writing resources in the console: drafts, and deploying them. */
export function authoringRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    const ownership = async (workspaceId: string, paths: string[]) =>
      new Map(
        paths.length === 0
          ? []
          : (
              await db
                .selectFrom("resource")
                .select(["path", "ownership"])
                .where("workspace_id", "=", workspaceId)
                .where("path", "in", paths)
                .execute()
            ).map((row) => [row.path, row.ownership]),
      );
    const summarize = (
      row: {
        path: string;
        kind: string;
        schema_version: number;
        deleted: boolean;
        revision: number;
        updated_by_type: string;
        updated_by_id: string | null;
        updated_at: Date;
      },
      owned: string | undefined,
    ) => ({
      path: row.path,
      kind: row.kind,
      schemaVersion: row.schema_version,
      deleted: row.deleted,
      revision: row.revision,
      change: row.deleted
        ? ("delete" as const)
        : owned === "code"
          ? ("take_over" as const)
          : owned
            ? ("update" as const)
            : ("create" as const),
      updatedByType: row.updated_by_type,
      updatedById: row.updated_by_id,
      updatedAt: iso(row.updated_at),
    });

    /** Writing code needs its own permission, and the tenant's switch to be on. */
    const mayWriteCode = async (ctx: RequestContext, workspace: WorkspaceRef) => {
      await ctx.authorize("code:write", {
        tenantId: workspace.tenantId,
        workspaceId: workspace.id,
      });
      const tenant = await db
        .selectFrom("tenant")
        .select("console_code")
        .where("id", "=", workspace.tenantId)
        .executeTakeFirstOrThrow();
      if (!tenant.console_code) {
        throw new HttpError(
          403,
          "console_code_off",
          "Writing code in the console is turned off for this tenant. Code is deployed from its repository.",
        );
      }
    };

    /**
     * What someone who maintains interfaces, and holds nothing wider, may write
     * and deploy: an interface, and an app that serves one. Never code.
     */
    const isScreen = (kind: string, body: unknown) =>
      kind === "interface" ||
      (kind === "app" && typeof (body as { interface?: unknown } | null)?.interface === "string");

    /**
     * Enters a workspace for someone who holds `needs`, or who only maintains
     * interfaces. `full` says which: without it the caller is held to interfaces.
     */
    async function enter(
      ctx: RequestContext,
      params: { t: string; w: string },
      needs: "resource:read" | "resource:write" | "deployment:write",
    ): Promise<{ workspace: WorkspaceRef; full: boolean }> {
      const workspace = await findWorkspace(kernel, params.t, params.w);
      ctx.workspace = workspace;
      const at = { tenantId: workspace.tenantId, workspaceId: workspace.id };
      if (await ctx.allowed(needs, at)) return { workspace, full: true };
      const verb = needs.endsWith(":read") ? "read" : "write";
      if (await ctx.allowed(`interface:${verb}`, at)) return { workspace, full: false };
      // Refuses, in the words every other route uses.
      await ctx.authorize(needs, at);
      return { workspace, full: true };
    }

    /** Whether what is at a path now, deployed or drafted, is an interface or an app that serves one. */
    async function screenAt(workspace: WorkspaceRef, path: string): Promise<boolean | null> {
      const [live, draft] = await Promise.all([
        db
          .selectFrom("resource")
          .select(["kind", "body"])
          .where("workspace_id", "=", workspace.id)
          .where("path", "=", path)
          .executeTakeFirst(),
        db
          .selectFrom("resource_draft")
          .select(["kind", "body", "deleted"])
          .where("workspace_id", "=", workspace.id)
          .where("path", "=", path)
          .executeTakeFirst(),
      ]);
      if (!live && !draft) return null;
      const liveOk = !live || isScreen(live.kind, live.body);
      // A draft that removes something says nothing of what it is. What it removes does.
      const draftOk = !draft || (draft.deleted ? liveOk : isScreen(draft.kind, draft.body));
      return liveOk && draftOk;
    }

    app.get(
      `${base}/drafts`,
      {
        config: { access: access.custom },
        schema: {
          summary: "The drafts of a workspace",
          description:
            "A draft is a resource as it was last saved in the console. It changes nothing " +
            "that runs until it is deployed.",
          tags: ["authoring"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(DraftSummary) }) },
        },
      },
      async ({ ctx, params }) => {
        const { workspace, full } = await enter(ctx, params, "resource:read");
        const all = await db
          .selectFrom("resource_draft")
          .selectAll()
          .where("workspace_id", "=", workspace.id)
          .orderBy("path")
          .execute();
        const rows = [];
        for (const row of all) {
          if (full || (await screenAt(workspace, row.path))) rows.push(row);
        }
        const owned = await ownership(
          workspace.id,
          rows.map((row) => row.path),
        );
        return { items: rows.map((row) => summarize(row, owned.get(row.path))) };
      },
    );

    app.get(
      `${base}/drafts/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "One draft, with its body",
          tags: ["authoring"],
          params: PathParams,
          response: { 200: Draft },
        },
      },
      async ({ ctx, params }) => {
        const { workspace, full } = await enter(ctx, params, "resource:read");
        const path = pathOf(params);
        const row = await db
          .selectFrom("resource_draft")
          .selectAll()
          .where("workspace_id", "=", workspace.id)
          .where("path", "=", path)
          .executeTakeFirst();
        if (!row || (!full && !(await screenAt(workspace, path)))) {
          throw notFound(`A draft at ${path}`);
        }
        const owned = await ownership(workspace.id, [path]);
        return { ...summarize(row, owned.get(path)), body: row.body };
      },
    );

    app.put(
      `${base}/drafts/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Save a draft of the resource at a path",
          description:
            "Only in a dev workspace. The body is checked against the kind's schema. A script, " +
            "connector or trigger source carries its TypeScript in `body.source`, and saving one " +
            "also needs `code:write`. A draft at the path of a resource from the repository " +
            "takes it over when deployed. `deleted` makes a draft that removes the resource. " +
            "Needs `resource:write`. `interface:write` is enough for an interface, and for an " +
            "app that serves one, at a path that holds nothing else.",
          tags: ["authoring"],
          params: PathParams,
          body: Type.Object({
            kind: Type.String(),
            schemaVersion: Type.Integer({ minimum: 1 }),
            body: AnyObject,
            deleted: Type.Optional(Type.Boolean()),
            revision: Type.Optional(Type.Integer({ minimum: 1 })),
          }),
          response: { 200: Draft },
        },
      },
      async ({ ctx, params, body }) => {
        const { workspace, full } = await enter(ctx, params, "resource:write");
        const path = pathOf(params);
        if (!full) {
          const there = await screenAt(workspace, path);
          const fits = body.deleted ? there === true : isScreen(body.kind, body.body);
          if (!fits || there === false) throw forbidden("resource:write");
        }
        if (isCodeKind(body.kind)) await mayWriteCode(ctx, workspace);
        const saved = await ctx.mutate((trx, audit) =>
          saveDraft(kernel, trx, audit, workspace, ctx.principal, { ...body, path }),
        );
        const owned = await ownership(workspace.id, [path]);
        return { ...summarize(saved.draft, owned.get(path)), body: saved.draft.body };
      },
    );

    app.delete(
      `${base}/drafts/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Discard a draft",
          description: "The resource stays as it was last deployed.",
          tags: ["authoring"],
          params: PathParams,
          response: { 204: Type.Null() },
        },
      },
      async ({ ctx, params }, reply) => {
        const { workspace, full } = await enter(ctx, params, "resource:write");
        if (!full && (await screenAt(workspace, pathOf(params))) === false) {
          throw forbidden("resource:write");
        }
        await ctx.mutate((trx, audit) => discardDraft(trx, audit, workspace, pathOf(params)));
        return reply.code(204).send(null);
      },
    );

    app.get(
      `${base}/changes/preview`,
      {
        config: { access: access.workspace("deployment:read") },
        schema: {
          summary: "What deploying the drafts would do",
          description:
            "Found by deploying them and taking it all back, so the answer is exactly what a " +
            "deploy would then do, including every refusal: code that does not build, a " +
            "manifest that is not valid, a connection that is not bound.",
          tags: ["authoring"],
          params: WorkspaceParams,
          querystring: Type.Object({
            paths: Type.Optional(
              Type.String({
                maxLength: 20_000,
                description: "Only these drafts, separated by commas. Without it, every draft.",
              }),
            ),
          }),
          response: {
            200: Type.Object({
              possible: Type.Boolean(),
              refusal: Type.Union([
                Type.Object({
                  code: Type.String(),
                  detail: Type.String(),
                  errors: Type.Array(Type.Object({ path: Type.String(), message: Type.String() })),
                }),
                Type.Null(),
              ]),
              summary: Type.Union([Summary, Type.Null()]),
            }),
          },
        },
      },
      async ({ ctx, query }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const paths = query.paths?.split(",").filter(Boolean);
        let summary: Awaited<ReturnType<typeof deployDrafts>>["summary"] | undefined;
        try {
          await mutate(db, ctx.actor, async (trx, audit) => {
            summary = (await deployDrafts(kernel, trx, audit, workspace, ctx.principal, { paths }))
              .summary;
            throw new DryRun();
          });
        } catch (error) {
          if (error instanceof HttpError && error.statusCode < 500) {
            return {
              possible: false,
              refusal: {
                code: error.problemCode,
                detail: error.message,
                errors: error.issues ?? [],
              },
              summary: null,
            };
          }
          if (!(error instanceof DryRun)) throw error;
        }
        return { possible: true, refusal: null, summary: summary ?? null };
      },
    );

    app.post(
      `${base}/changes/deploy`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Deploy the drafts",
          description:
            "Composes the drafts with the workspace's bundle into a new bundle and activates " +
            "it, atomically. The drafts it carried are cleared. Deploying a draft with code in " +
            "it also needs `code:write`. Needs `deployment:write`. `interface:write` is enough " +
            "to deploy interfaces and the apps that serve them, named in `paths`: with it alone " +
            "nothing else is deployed, and a deploy of everything is refused.",
          tags: ["authoring"],
          params: WorkspaceParams,
          body: Type.Object({
            paths: Paths,
            message: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
          }),
          response: {
            201: Type.Object({
              id: Id,
              bundleId: Id,
              bundleVersion: Type.Integer(),
              applied: Type.Array(Type.String()),
              summary: Summary,
            }),
          },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const { workspace, full } = await enter(ctx, params, "deployment:write");
        if (!full) {
          // Without paths a deploy carries every draft, and so other people's code.
          if (!body.paths?.length) {
            throw new HttpError(
              403,
              "forbidden",
              "Say which interfaces to deploy. Deploying every draft needs the deployment:write permission.",
            );
          }
          for (const path of body.paths) {
            if ((await screenAt(workspace, path)) !== true) throw forbidden("deployment:write");
          }
        }
        let pending = db
          .selectFrom("resource_draft")
          .select("kind")
          .where("workspace_id", "=", workspace.id);
        if (body.paths) pending = pending.where("path", "in", body.paths);
        if ((await pending.execute()).some((draft) => isCodeKind(draft.kind))) {
          await mayWriteCode(ctx, workspace);
        }
        const result = await ctx.mutate((trx, audit) =>
          deployDrafts(kernel, trx, audit, workspace, ctx.principal, {
            paths: body.paths,
            message: body.message,
          }),
        );
        // The branch the workspace follows, if any, no longer has what the workspace runs.
        await markAhead(db, workspace.id);
        return reply.code(201).send({
          id: result.deployment.id,
          bundleId: result.bundle.id,
          bundleVersion: result.bundle.version,
          applied: result.applied,
          summary: result.summary,
        });
      },
    );

    app.post(
      `${base}/test-runs`,
      {
        config: { access: access.workspace("run:write") },
        schema: {
          summary: "Run a script as its draft has it",
          description:
            "Builds a bundle with the workspace's drafts in it, deploys nothing, and starts one " +
            "run of the script from that bundle. Read the run as any other. Needs `code:write`.",
          tags: ["authoring"],
          params: WorkspaceParams,
          body: Type.Object({
            script: Type.String({ pattern: PATH_PATTERN, maxLength: 255 }),
            input: Type.Optional(Type.Unknown()),
          }),
          response: { 201: Type.Object({ runId: Id, bundleId: Id }) },
        },
      },
      async ({ ctx, body }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        await mayWriteCode(ctx, workspace);
        const { bundle } = await composeDrafts(kernel, db, workspace);
        const result = await ctx.mutate(async (trx, audit) => {
          const stored = await storeBundle(
            kernel,
            trx,
            audit,
            workspace,
            ctx.principal,
            bundle,
            "preview",
          );
          const started = await startRun(kernel, trx, {
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            script: body.script,
            input: body.input ?? {},
            trigger: { type: "manual", detail: { draft: true } },
            startedBy: { type: ctx.principal.type, id: ctx.principal.id },
            bundleId: stored.bundle.id,
          });
          await audit({
            action: "run.started",
            targetType: "run",
            targetId: started.run.id,
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            details: { script: body.script, draft: true, bundleId: stored.bundle.id },
          });
          return { runId: started.run.id, bundleId: stored.bundle.id };
        });
        return reply.code(201).send(result);
      },
    );
  };
}
