import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  type FlowBody,
  type InterfaceBody,
  PATH_PATTERN,
  platformKinds,
  renderResourceFiles,
} from "@vynxlabs/manifest";
import { Type } from "typebox";
import { mutate } from "../kernel/audit.js";
import {
  activeConsoleManaged,
  composeDrafts,
  deployDrafts,
  deriveSchemas,
  discardDraft,
  isCodeKind,
  saveDraft,
} from "../kernel/authoring.js";
import { describeChange } from "../kernel/describe.js";
import { badRequest, forbidden, HttpError, notFound } from "../kernel/errors.js";
import { bundleManifest, storeBundle } from "../kernel/execution/bundles.js";
import { readPayload, startRun } from "../kernel/execution/runs.js";
import { downstreamOf, keptNodes, kickFlow, startFlowRun } from "../kernel/flows/engine.js";
import { draftFiles, markAhead } from "../kernel/git.js";
import { access, findWorkspace, type RequestContext, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { interfaceProblems } from "./interfaces.js";
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
  about: Type.Optional(
    Type.Array(Type.String(), {
      description: "What deploying it changes, in a few plain sentences.",
    }),
  ),
});
const Draft = Type.Object({
  ...DraftSummary.properties,
  body: AnyObject,
  schemaTaskId: Type.Optional(
    Type.String({
      description:
        "For a script: the task in which a worker reads the `input` and `output` its code " +
        "exports. When it ends, the draft has them. Absent when the code does not build.",
    }),
  ),
  problems: Type.Optional(
    Type.Array(Type.Object({ path: Type.String(), message: Type.String() }), {
      description:
        "For an interface: what is wrong with it as the workspace stands, such as a column " +
        "its table does not have. A draft with problems is saved all the same.",
    }),
  ),
});
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
  warnings: Type.Optional(Type.Array(Type.Object({ path: Type.String(), message: Type.String() }))),
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
        const deployed = new Map(
          rows.length === 0
            ? []
            : (
                await db
                  .selectFrom("resource")
                  .select(["path", "body"])
                  .where("workspace_id", "=", workspace.id)
                  .where(
                    "path",
                    "in",
                    rows.map((row) => row.path),
                  )
                  .execute()
              ).map((row) => [row.path, row.body as Record<string, unknown>]),
        );
        return {
          items: rows.map((row) => ({
            ...summarize(row, owned.get(row.path)),
            about: describeChange(
              row.kind,
              deployed.get(row.path),
              row.deleted ? undefined : (row.body as Record<string, unknown>),
            ),
          })),
        };
      },
    );

    app.get(
      `${base}/resource-files`,
      {
        config: { access: access.custom },
        schema: {
          summary: "The workspace's console resources as repository files",
          description:
            "Every resource made in the console, with the drafts laid over what is deployed, " +
            "as the files `platform/` holds in a repository: what `platform pull` writes, and " +
            "what Git sync commits. The whole set: a bundle with a `platform/` folder replaces " +
            "the workspace's console resources with it. With `drafts=false`, what is deployed only.",
          tags: ["authoring"],
          params: WorkspaceParams,
          querystring: Type.Object({ drafts: Type.Optional(Type.Boolean({ default: true })) }),
          response: {
            200: Type.Object({
              files: Type.Array(Type.Object({ path: Type.String(), content: Type.String() })),
              bundleVersion: Type.Union([Type.Integer(), Type.Null()]),
              drafts: Type.Array(
                Type.Object({
                  path: Type.String(),
                  revision: Type.Integer(),
                  deleted: Type.Boolean(),
                }),
                {
                  description:
                    "The drafts laid over it. A deploy that carries them can say so, to have " +
                    "them removed: `settleDrafts` on a deployment.",
                },
              ),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        const { workspace, full } = await enter(ctx, params, "resource:read");
        // Part of the set would be read as all of it, and a deploy would remove the rest.
        if (!full) throw forbidden("resource:read");
        const withDrafts = query.drafts !== false;
        const files = withDrafts
          ? await draftFiles(kernel, db, workspace)
          : renderResourceFiles(
              await activeConsoleManaged(kernel, db, workspace.id),
              platformKinds,
            );
        const drafts = withDrafts
          ? await db
              .selectFrom("resource_draft")
              .select(["path", "revision", "deleted"])
              .where("workspace_id", "=", workspace.id)
              .orderBy("path")
              .execute()
          : [];
        const active = await db
          .selectFrom("workspace")
          .leftJoin("bundle", "bundle.id", "workspace.active_bundle_id")
          .select("bundle.version")
          .where("workspace.id", "=", workspace.id)
          .executeTakeFirst();
        return {
          files: files.map((file) => ({ path: file.path, content: file.content })),
          bundleVersion: active?.version ?? null,
          drafts,
        };
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
        const schemaTaskId =
          body.kind === "script" && !body.deleted
            ? await deriveSchemas(kernel, workspace, ctx.principal, saved.draft)
            : undefined;
        return {
          ...summarize(saved.draft, owned.get(path)),
          body: saved.draft.body,
          ...(schemaTaskId ? { schemaTaskId } : {}),
          ...(body.kind === "interface" && !body.deleted
            ? {
                problems: await interfaceProblems(
                  kernel,
                  workspace,
                  saved.draft.body as unknown as InterfaceBody,
                ),
              }
            : {}),
        };
      },
    );

    app.get(
      `${base}/draft-history/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Earlier versions of a draft, newest first",
          description:
            "What each save replaced, and each draft that was set aside. The newest thirty " +
            "are kept. Needs what reading the draft needs.",
          tags: ["authoring"],
          params: PathParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  id: Id,
                  kind: Type.String(),
                  revision: Type.Integer(),
                  deleted: Type.Boolean(),
                  reason: Type.String({ description: "`replaced` or `set_aside`." }),
                  savedById: NullableId,
                  savedAt: Time,
                  keptAt: Time,
                  body: AnyObject,
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const { workspace, full } = await enter(ctx, params, "resource:read");
        const path = pathOf(params);
        if (!full && !(await screenAt(workspace, path))) throw forbidden("resource:read");
        const rows = await db
          .selectFrom("resource_draft_history")
          .selectAll()
          .where("workspace_id", "=", workspace.id)
          .where("path", "=", path)
          .orderBy("kept_at", "desc")
          .execute();
        return {
          items: rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            revision: row.revision,
            deleted: row.deleted,
            reason: row.reason,
            savedById: row.saved_by_id,
            savedAt: iso(row.saved_at),
            keptAt: iso(row.kept_at),
            body: row.body as Record<string, unknown>,
          })),
        };
      },
    );

    app.post(
      `${base}/draft-history/:id/restore`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Make an earlier version the draft again",
          description:
            "Saves it as the draft, as any save does: what the draft held before is kept in the " +
            "history in turn. Needs what saving the draft needs.",
          tags: ["authoring"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: { 200: DraftSummary },
        },
      },
      async ({ ctx, params }) => {
        const kept = await db
          .selectFrom("resource_draft_history")
          .selectAll()
          .where("id", "=", params.id)
          .where("workspace_id", "=", params.w)
          .executeTakeFirst();
        if (!kept) throw notFound("That earlier version");
        const { workspace, full } = await enter(ctx, params, "resource:write");
        if (!full && !(await screenAt(workspace, kept.path))) throw forbidden("resource:write");
        if (isCodeKind(kept.kind)) await mayWriteCode(ctx, workspace);
        const saved = await ctx.mutate((trx, audit) =>
          saveDraft(kernel, trx, audit, workspace, ctx.principal, {
            path: kept.path,
            kind: kept.kind,
            schemaVersion: kept.schema_version,
            body: kept.body as Record<string, unknown>,
            deleted: kept.deleted,
          }),
        );
        const owned = await ownership(workspace.id, [kept.path]);
        return summarize(saved.draft, owned.get(kept.path));
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

    /**
     * What testing a flow from one of its steps keeps from an earlier run: the
     * trigger and input, and the steps before that one. Refused when one of them is
     * drawn differently in what will run.
     */
    const testFromPlan = async (
      workspaceId: string,
      flowPath: string,
      testFrom: { flowRunId: string; node: string },
      composed: {
        manifests: { kind: string; path: string; body: Record<string, unknown> }[];
      } | null,
      bundleId: string | undefined,
    ) => {
      const earlier = await db
        .selectFrom("flow_run")
        .innerJoin("bundle", "bundle.id", "flow_run.bundle_id")
        .select([
          "flow_run.id",
          "flow_run.flow_path",
          "flow_run.trigger_node",
          "flow_run.input",
          "flow_run.input_ref",
          "bundle.id as bundle_id",
          "bundle.storage_key",
        ])
        .where("flow_run.id", "=", testFrom.flowRunId)
        .where("flow_run.workspace_id", "=", workspaceId)
        .executeTakeFirst();
      if (!earlier || earlier.flow_path !== flowPath) throw notFound("The flow run to test from");
      const ranOn = (
        await bundleManifest(
          kernel,
          { id: earlier.bundle_id, storage_key: earlier.storage_key },
          "flow",
          flowPath,
        )
      )?.body as unknown as FlowBody | undefined;
      const now = composed
        ? (composed.manifests.find((one) => one.kind === "flow" && one.path === flowPath)
            ?.body as unknown as FlowBody | undefined)
        : bundleId
          ? await (async () => {
              const row = await db
                .selectFrom("bundle")
                .select(["id", "storage_key"])
                .where("id", "=", bundleId)
                .executeTakeFirst();
              return row
                ? ((await bundleManifest(kernel, row, "flow", flowPath))?.body as unknown as
                    | FlowBody
                    | undefined)
                : undefined;
            })()
          : undefined;
      if (!ranOn || !now) throw notFound(`The flow ${flowPath}`);
      if (!now.nodes[testFrom.node]) throw badRequest(`The flow has no step ${testFrom.node}.`);
      const steps = await db
        .selectFrom("step_run")
        .select(["node_id", "item_key", "status", "handled"])
        .where("flow_run_id", "=", earlier.id)
        .execute();
      const kept = keptNodes(ranOn, steps, earlier.trigger_node);
      for (const node of downstreamOf(now, testFrom.node)) kept.delete(node);
      const same = (one: unknown, other: unknown) =>
        JSON.stringify(sorted(one)) === JSON.stringify(sorted(other));
      const changed = [...kept].filter(
        (node) =>
          !same(ranOn.nodes[node], now.nodes[node]) ||
          !same(
            ranOn.edges.filter((edge) => edge.to === node),
            now.edges.filter((edge) => edge.to === node),
          ),
      );
      if (changed.length > 0) {
        throw new HttpError(
          409,
          "conflict",
          `Steps before ${testFrom.node} changed since that run (${changed.join(", ")}). Test the whole flow.`,
        );
      }
      return {
        flowRunId: earlier.id,
        triggerNode: earlier.trigger_node,
        input: await readPayload(kernel, earlier.input, earlier.input_ref),
      };
    };

    app.post(
      `${base}/test-runs`,
      {
        config: { access: access.workspace("run:write") },
        schema: {
          summary: "Run a script or a flow as its draft has it",
          description:
            "Builds a bundle with the workspace's drafts in it, deploys nothing, and starts one " +
            "run of the script, or of the flow from its manual trigger, from that bundle. Read " +
            "the run as any other. A script needs `code:write`; a flow needs `flow_run:write`, " +
            "and `code:write` too while code is among the drafts, since the flow may run it.",
          tags: ["authoring"],
          params: WorkspaceParams,
          body: Type.Object({
            script: Type.Optional(Type.String({ pattern: PATH_PATTERN, maxLength: 255 })),
            flow: Type.Optional(Type.String({ pattern: PATH_PATTERN, maxLength: 255 })),
            input: Type.Optional(Type.Unknown()),
            bundleId: Type.Optional(
              Type.String({
                format: "uuid",
                description:
                  "A bundle uploaded to this workspace with `preview`, such as a local build " +
                  "(`platform run --remote`): run from it as it is, in a dev workspace only.",
              }),
            ),
            triggerNode: Type.Optional(
              Type.String({
                maxLength: 100,
                description:
                  "For a flow: the trigger to start it from, of any kind, with `input` as what " +
                  "that trigger would receive. Default: its manual trigger.",
              }),
            ),
            testFrom: Type.Optional(
              Type.Object(
                { flowRunId: Id, node: Type.String({ maxLength: 100 }) },
                {
                  description:
                    "For a flow: start at this node, keeping what the earlier flow run did " +
                    "before it, with that run's input. Refused when a step it keeps is different " +
                    "in the draft.",
                },
              ),
            ),
          }),
          response: {
            201: Type.Object({
              runId: Id,
              bundleId: Id,
              kind: Type.Union([Type.Literal("script"), Type.Literal("flow")]),
            }),
          },
        },
      },
      async ({ ctx, body }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        if ((body.script === undefined) === (body.flow === undefined)) {
          throw badRequest("Give either a script or a flow to run.");
        }
        const kind = body.flow !== undefined ? ("flow" as const) : ("script" as const);
        const path = (body.flow ?? body.script) as string;
        if (body.bundleId !== undefined) {
          // Code from a developer's machine, not yet reviewed: tried in a dev workspace only.
          const row = await db
            .selectFrom("workspace")
            .select("type")
            .where("id", "=", workspace.id)
            .executeTakeFirstOrThrow();
          if (row.type !== "dev") {
            throw new HttpError(
              409,
              "production_workspace",
              "A local build is tried in a dev workspace. Production runs what was promoted to it.",
            );
          }
          const uploaded = await db
            .selectFrom("bundle")
            .select("id")
            .where("id", "=", body.bundleId)
            .where("workspace_id", "=", workspace.id)
            .executeTakeFirst();
          if (!uploaded) throw notFound("The bundle");
          await mayWriteCode(ctx, workspace);
        }
        if (kind === "flow") {
          await ctx.authorize("flow_run:write", {
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
          });
          if (body.bundleId === undefined) {
            const code = await db
              .selectFrom("resource_draft")
              .select("path")
              .where("workspace_id", "=", workspace.id)
              .where("kind", "in", ["script", "connector", "trigger_source"])
              .where("deleted", "=", false)
              .executeTakeFirst();
            if (code) await mayWriteCode(ctx, workspace);
          }
        } else if (body.bundleId === undefined) {
          await mayWriteCode(ctx, workspace);
        }
        // The drafts, made into a bundle; or the bundle given, as it is. With no drafts at all,
        // what is deployed is what runs.
        let composed: Awaited<ReturnType<typeof composeDrafts>>["bundle"] | null = null;
        let activeId: string | undefined;
        if (body.bundleId === undefined) {
          try {
            composed = (await composeDrafts(kernel, db, workspace)).bundle;
          } catch (error) {
            if (!(error instanceof HttpError) || error.problemCode !== "nothing_to_deploy")
              throw error;
            activeId =
              (
                await db
                  .selectFrom("workspace")
                  .select("active_bundle_id")
                  .where("id", "=", workspace.id)
                  .executeTakeFirst()
              )?.active_bundle_id ?? undefined;
            if (!activeId) throw error;
          }
        }
        // Testing from a step: what came before it is kept from an earlier run, so it must
        // be the same in what runs now.
        const from =
          kind === "flow" && body.testFrom
            ? await testFromPlan(
                workspace.id,
                path,
                body.testFrom,
                composed,
                body.bundleId ?? activeId,
              )
            : undefined;
        const result = await ctx.mutate(async (trx, audit) => {
          const bundleId = composed
            ? (await storeBundle(kernel, trx, audit, workspace, ctx.principal, composed, "preview"))
                .bundle.id
            : ((body.bundleId ?? activeId) as string);
          const detail = { draft: true, ...(composed ? {} : { local: true }) };
          const startedBy = { type: ctx.principal.type, id: ctx.principal.id };
          if (kind === "flow") {
            const started = await startFlowRun(kernel, trx, {
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
              flow: path,
              triggerNode: from?.triggerNode ?? body.triggerNode,
              input: from ? from.input : (body.input ?? {}),
              trigger: {
                type: "manual",
                detail: from ? { ...detail, testFrom: body.testFrom } : detail,
              },
              startedBy,
              bundleId,
              ...(from
                ? { retryOf: from.flowRunId, seed: true, rerunFrom: body.testFrom?.node }
                : {}),
            });
            await audit({
              action: "flow_run.started",
              targetType: "flow_run",
              targetId: started.flowRun.id,
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
              details: { flow: path, ...detail, bundleId },
            });
            return { runId: started.flowRun.id, bundleId, kind };
          }
          const started = await startRun(kernel, trx, {
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            script: path,
            input: body.input ?? {},
            trigger: { type: "manual", detail },
            startedBy,
            bundleId,
          });
          await audit({
            action: "run.started",
            targetType: "run",
            targetId: started.run.id,
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            details: { script: path, ...detail, bundleId },
          });
          return { runId: started.run.id, bundleId, kind };
        });
        if (result.kind === "flow") kickFlow(kernel, result.runId);
        return reply.code(201).send(result);
      },
    );
  };
}

/** A value with object keys in order, so two equal values compare equal as text. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, sorted(inner)]),
    );
  }
  return value;
}
