import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { PATH_PATTERN } from "@vynxlabs/manifest";
import { Type } from "typebox";
import { check } from "../kernel/authorize.js";
import { badRequest, notFound } from "../kernel/errors.js";
import { access, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { deleteResource, findResource, putResource } from "../kernel/resources.js";
import { setSecret } from "../kernel/secrets.js";
import {
  AnyObject,
  Id,
  iso,
  Name,
  NoContent,
  NullableId,
  Slug,
  TenantParams,
  Time,
  WorkspaceParams,
} from "./shared.js";

const WorkspaceType = Type.Union([Type.Literal("production"), Type.Literal("dev")]);
const Workspace = Type.Object({
  id: Id,
  tenantId: Id,
  slug: Type.String(),
  name: Type.String(),
  type: WorkspaceType,
  linkedWorkspaceId: NullableId,
  concurrencyLimit: Type.Integer({ description: "How many runs may be in progress at once." }),
  failureAlert: Type.Object({
    script: Type.Optional(Type.String()),
    notify: Type.Optional(Type.String()),
  }),
  createdAt: Time,
});
interface WorkspaceRow {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  type: "production" | "dev";
  linked_workspace_id: string | null;
  concurrency_limit: number;
  failure_alert: { script?: string; notify?: string };
  created_at: Date;
}
const toWorkspace = (row: WorkspaceRow) => ({
  id: row.id,
  tenantId: row.tenant_id,
  slug: row.slug,
  name: row.name,
  type: row.type,
  linkedWorkspaceId: row.linked_workspace_id,
  concurrencyLimit: row.concurrency_limit,
  failureAlert: row.failure_alert,
  createdAt: iso(row.created_at),
});

const SecretName = Type.String({ pattern: "^[A-Za-z_][A-Za-z0-9_]*$", maxLength: 127 });
const Secret = Type.Object({ name: Type.String(), createdAt: Time, updatedAt: Time });

const Resource = Type.Object({
  id: Id,
  kind: Type.String(),
  schemaVersion: Type.Integer(),
  path: Type.String(),
  workspace: Type.String({ description: "The workspace's slug." }),
  ownership: Type.Union([Type.Literal("code"), Type.Literal("ui")]),
  version: Type.Integer(),
  body: AnyObject,
  updatedAt: Time,
});
interface ResourceRow {
  id: string;
  kind: string;
  schema_version: number;
  path: string;
  ownership: "code" | "ui";
  version: number;
  body: Record<string, unknown>;
  updated_at: Date;
}
const toResource = (row: ResourceRow, workspace: WorkspaceRef) => ({
  id: row.id,
  kind: row.kind,
  schemaVersion: row.schema_version,
  path: row.path,
  workspace: workspace.slug,
  ownership: row.ownership,
  version: row.version,
  body: row.body,
  updatedAt: iso(row.updated_at),
});

const ResourceParams = Type.Object({ t: Id, w: Id, "*": Type.String() });
const pathPattern = new RegExp(PATH_PATTERN);

function resourcePath(params: { "*": string }): string {
  const path = params["*"];
  if (!pathPattern.test(path) || path.length > 255) {
    throw badRequest("The resource path is not valid.");
  }
  return path;
}

export function workspaceRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    /** A production workspace of the same tenant that a dev workspace may link to. */
    async function checkLink(tenantId: string, type: string, linkedWorkspaceId: string | null) {
      if (linkedWorkspaceId === null) return;
      if (type !== "dev") throw badRequest("Only a dev workspace can link to another workspace.");
      const target = await db
        .selectFrom("workspace")
        .select("type")
        .where("id", "=", linkedWorkspaceId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!target) throw badRequest("The linked workspace is not in this tenant.");
    }

    app.get(
      "/tenants/:t/workspaces",
      {
        config: { access: access.custom },
        schema: {
          summary: "Workspaces the caller can read in a tenant",
          tags: ["tenancy"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(Workspace) }) },
        },
      },
      async ({ ctx, params }) => {
        const rows = await db
          .selectFrom("workspace")
          .selectAll()
          .where("tenant_id", "=", params.t)
          .orderBy("slug")
          .execute();
        const whole = await check(db, ctx.principal, "workspace:read", { tenantId: params.t });
        if (whole.allowed) {
          // Goes through authorize so that operator access is recorded.
          await ctx.authorize("workspace:read", { tenantId: params.t });
          return { items: rows.map(toWorkspace) };
        }
        const readable = [];
        for (const row of rows) {
          if (await ctx.allowed("workspace:read", { tenantId: params.t, workspaceId: row.id })) {
            readable.push(row);
          }
        }
        // Nothing readable here: answer exactly as the tenant-level check would.
        if (readable.length === 0) await ctx.authorize("workspace:read", { tenantId: params.t });
        return { items: readable.map(toWorkspace) };
      },
    );

    app.post(
      "/tenants/:t/workspaces",
      {
        config: { access: access.tenant("workspace:write") },
        schema: {
          summary: "Create a workspace",
          description: "The type is fixed at creation and can never be changed.",
          tags: ["tenancy"],
          params: TenantParams,
          body: Type.Object({
            slug: Slug,
            name: Name,
            type: WorkspaceType,
            linkedWorkspaceId: Type.Optional(Id),
          }),
          response: { 201: Workspace },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const linked = body.linkedWorkspaceId ?? null;
        await checkLink(params.t, body.type, linked);
        const workspace = await ctx.mutate(async (trx, audit) => {
          const row = await trx
            .insertInto("workspace")
            .values({
              id: newId(),
              tenant_id: params.t,
              slug: body.slug,
              name: body.name,
              type: body.type,
              linked_workspace_id: linked,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "workspace.created",
            targetType: "workspace",
            targetId: row.id,
            tenantId: params.t,
            workspaceId: row.id,
            details: { slug: row.slug, type: row.type, linkedWorkspaceId: linked },
          });
          return row;
        });
        return reply.code(201).send(toWorkspace(workspace));
      },
    );

    app.get(
      "/tenants/:t/workspaces/:w",
      {
        config: { access: access.workspace("workspace:read") },
        schema: {
          summary: "One workspace",
          tags: ["tenancy"],
          params: WorkspaceParams,
          response: { 200: Workspace },
        },
      },
      async ({ params }) => {
        const row = await db
          .selectFrom("workspace")
          .selectAll()
          .where("id", "=", params.w)
          .executeTakeFirstOrThrow();
        return toWorkspace(row);
      },
    );

    app.patch(
      "/tenants/:t/workspaces/:w",
      {
        config: { access: access.workspace("workspace:write") },
        schema: {
          summary: "Change a workspace's name, link, run limit or failure alert",
          description:
            "The type cannot be changed. `failureAlert` names a script to start and an HTTP " +
            "connection to notify when a run fails for the last time.",
          tags: ["tenancy"],
          params: WorkspaceParams,
          body: Type.Object({
            name: Type.Optional(Name),
            linkedWorkspaceId: Type.Optional(NullableId),
            concurrencyLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
            failureAlert: Type.Optional(
              Type.Object(
                {
                  script: Type.Optional(Type.String({ pattern: PATH_PATTERN })),
                  notify: Type.Optional(Type.String({ pattern: PATH_PATTERN })),
                },
                { additionalProperties: false },
              ),
            ),
          }),
          response: { 200: Workspace },
        },
      },
      async ({ ctx, params, body }) => {
        const current = await db
          .selectFrom("workspace")
          .selectAll()
          .where("id", "=", params.w)
          .executeTakeFirstOrThrow();
        const linked =
          body.linkedWorkspaceId === undefined
            ? current.linked_workspace_id
            : body.linkedWorkspaceId;
        if (linked === params.w) throw badRequest("A workspace cannot link to itself.");
        await checkLink(params.t, current.type, linked);
        const row = await ctx.mutate(async (trx, audit) => {
          const updated = await trx
            .updateTable("workspace")
            .set({
              name: body.name ?? current.name,
              linked_workspace_id: linked,
              concurrency_limit: body.concurrencyLimit ?? current.concurrency_limit,
              ...(body.failureAlert ? { failure_alert: JSON.stringify(body.failureAlert) } : {}),
            })
            .where("id", "=", params.w)
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "workspace.updated",
            targetType: "workspace",
            targetId: params.w,
            tenantId: params.t,
            workspaceId: params.w,
            details: {
              name: updated.name,
              linkedWorkspaceId: linked,
              concurrencyLimit: updated.concurrency_limit,
              failureAlert: updated.failure_alert,
            },
          });
          return updated;
        });
        return toWorkspace(row);
      },
    );

    // ----- Secrets -----

    app.get(
      "/tenants/:t/workspaces/:w/secrets",
      {
        config: { access: access.workspace("secret:read") },
        schema: {
          summary: "Names of a workspace's secrets",
          description: "Values are never returned by any route.",
          tags: ["secrets"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(Secret) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("secret")
          .select(["name", "created_at", "updated_at"])
          .where("workspace_id", "=", params.w)
          .orderBy("name")
          .execute();
        return {
          items: rows.map((row) => ({
            name: row.name,
            createdAt: iso(row.created_at),
            updatedAt: iso(row.updated_at),
          })),
        };
      },
    );

    app.put(
      "/tenants/:t/workspaces/:w/secrets/:name",
      {
        config: { access: access.workspace("secret:write") },
        schema: {
          summary: "Set a secret",
          tags: ["secrets"],
          params: Type.Object({ t: Id, w: Id, name: SecretName }),
          body: Type.Object({ value: Type.String({ minLength: 1, maxLength: 65536 }) }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const { created } = await setSecret(
            trx,
            kernel.vault,
            { tenantId: params.t, workspaceId: params.w, name: params.name },
            body.value,
          );
          await audit({
            action: created ? "secret.created" : "secret.updated",
            targetType: "secret",
            targetId: params.name,
            tenantId: params.t,
            workspaceId: params.w,
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.delete(
      "/tenants/:t/workspaces/:w/secrets/:name",
      {
        config: { access: access.workspace("secret:write") },
        schema: {
          summary: "Delete a secret",
          tags: ["secrets"],
          params: Type.Object({ t: Id, w: Id, name: SecretName }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("secret")
            .where("workspace_id", "=", params.w)
            .where("name", "=", params.name)
            .returning("id")
            .executeTakeFirst();
          if (!removed) throw notFound("The secret");
          await audit({
            action: "secret.deleted",
            targetType: "secret",
            targetId: params.name,
            tenantId: params.t,
            workspaceId: params.w,
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Resources -----

    app.get(
      "/tenants/:t/workspaces/:w/resources",
      {
        config: { access: access.workspace("resource:read") },
        schema: {
          summary: "Resources in a workspace",
          tags: ["resources"],
          params: WorkspaceParams,
          querystring: Type.Object({ kind: Type.Optional(Type.String()) }),
          response: { 200: Type.Object({ items: Type.Array(Resource) }) },
        },
      },
      async ({ ctx, params, query }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        let select = db.selectFrom("resource").selectAll().where("workspace_id", "=", params.w);
        if (query.kind) select = select.where("kind", "=", query.kind);
        const rows = await select.orderBy("path").execute();
        return { items: rows.map((row) => toResource(row, workspace)) };
      },
    );

    app.get(
      "/tenants/:t/workspaces/:w/resources/*",
      {
        config: { access: access.workspace("resource:read") },
        schema: {
          summary: "One resource, by path",
          tags: ["resources"],
          params: ResourceParams,
          response: { 200: Resource },
        },
      },
      async ({ ctx, params }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const row = await findResource(db, workspace.id, resourcePath(params));
        if (!row) throw notFound("The resource");
        return toResource(row, workspace);
      },
    );

    app.put(
      "/tenants/:t/workspaces/:w/resources/*",
      {
        config: { access: access.workspace("resource:write") },
        schema: {
          summary: "Create or update the resource at a path",
          description:
            "The body is validated against the kind's schema. `renameFrom` moves an existing " +
            "resource to this path and keeps its ID.",
          tags: ["resources"],
          params: ResourceParams,
          body: Type.Object({
            kind: Type.String(),
            schemaVersion: Type.Integer({ minimum: 1 }),
            ownership: Type.Union([Type.Literal("code"), Type.Literal("ui")]),
            body: AnyObject,
            renameFrom: Type.Optional(Type.String()),
          }),
          response: { 200: Resource, 201: Resource },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const path = resourcePath(params);
        const result = await ctx.mutate((trx, audit) =>
          putResource(kernel, trx, audit, workspace, { ...body, path }),
        );
        return reply
          .code(result.created ? 201 : 200)
          .send(toResource(result.resource as ResourceRow, workspace));
      },
    );

    app.delete(
      "/tenants/:t/workspaces/:w/resources/*",
      {
        config: { access: access.workspace("resource:write") },
        schema: {
          summary: "Delete the resource at a path",
          tags: ["resources"],
          params: ResourceParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const path = resourcePath(params);
        await ctx.mutate((trx, audit) => deleteResource(trx, audit, workspace, path));
        return reply.code(204).send(null);
      },
    );
  };
}
