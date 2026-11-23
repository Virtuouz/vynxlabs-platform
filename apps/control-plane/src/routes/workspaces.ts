import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId, sql } from "@volvel/db";
import { PATH_PATTERN } from "@volvel/manifest";
import { Type } from "typebox";
import { refuseDirectProductionWrite } from "../kernel/authoring.js";
import { check } from "../kernel/authorize.js";
import { badRequest, conflict, HttpError, notFound } from "../kernel/errors.js";
import { instanceTriggersPaused } from "../kernel/execution/control.js";
import { access, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { requireStanding } from "../kernel/pages/standing.js";
import { resolveResource } from "../kernel/resolve.js";
import { deleteResource, putResource } from "../kernel/resources.js";
import { setSecret } from "../kernel/secrets.js";
import { isTimeZone } from "../kernel/zones.js";
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

/** Whether the runtime knows a zone by this name. */
const WorkspaceType = Type.Union([Type.Literal("production"), Type.Literal("dev")]);
const Workspace = Type.Object({
  id: Id,
  tenantId: Id,
  slug: Type.String(),
  name: Type.String(),
  type: WorkspaceType,
  linkedWorkspaceId: NullableId,
  triggersPaused: Type.Boolean({
    description:
      "While true, no schedule, webhook or event starts anything here. Runs started by hand still work.",
  }),
  pausedByInstance: Type.Boolean({
    description:
      "True while an operator has paused every trigger in the instance, whatever `triggersPaused` says. The operator's reason is not given here.",
  }),
  concurrencyLimit: Type.Integer({ description: "How many runs may be in progress at once." }),
  timeZone: Type.String({
    description:
      "The IANA zone schedules here are written in unless they say otherwise, such as Europe/Berlin.",
  }),
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
  triggers_paused: boolean;
  concurrency_limit: number;
  time_zone?: string;
  failure_alert: { script?: string; notify?: string };
  created_at: Date;
}
const toWorkspace = (row: WorkspaceRow, pausedByInstance: boolean) => ({
  id: row.id,
  tenantId: row.tenant_id,
  slug: row.slug,
  name: row.name,
  type: row.type,
  linkedWorkspaceId: row.linked_workspace_id,
  triggersPaused: row.triggers_paused,
  pausedByInstance,
  concurrencyLimit: row.concurrency_limit,
  timeZone: row.time_zone ?? "UTC",
  failureAlert: row.failure_alert,
  createdAt: iso(row.created_at),
});

const SecretName = Type.String({ pattern: "^[A-Za-z_][A-Za-z0-9_]*$", maxLength: 127 });
const Secret = Type.Object({
  name: Type.String(),
  createdAt: Time,
  updatedAt: Time,
  updatedBy: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: "Who set it last, from the audit log: an email, an account's name, or null.",
    }),
  ),
});

const Resource = Type.Object({
  id: Id,
  kind: Type.String(),
  schemaVersion: Type.Integer(),
  key: Type.String({
    description: "Its identity, which a rename does not change. The path it was made at.",
  }),
  path: Type.String(),
  title: Type.Union([Type.String(), Type.Null()]),
  definedIn: Type.Union([Type.String(), Type.Null()], {
    description:
      "The file in the tenant's repository that defines it, when the bundle said: for a file kept outside the console's folder, and for code built with an SDK that says where each definition is. Null otherwise.",
  }),
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
  key: string;
  path: string;
  title: string | null;
  meta: { source?: { file: string } };
  ownership: "code" | "ui";
  version: number;
  body: Record<string, unknown>;
  updated_at: Date;
}
const toResource = (row: ResourceRow, workspace: WorkspaceRef) => ({
  id: row.id,
  kind: row.kind,
  schemaVersion: row.schema_version,
  key: row.key,
  path: row.path,
  title: row.title,
  definedIn: row.meta.source?.file ?? null,
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

    /**
     * A dev workspace links to the workspace it promotes to: production, or
     * another dev workspace such as QA. Links must lead somewhere and end.
     */
    async function checkLink(
      tenantId: string,
      type: string,
      linkedWorkspaceId: string | null,
      self?: string,
    ) {
      if (linkedWorkspaceId === null) return;
      if (type !== "dev") throw badRequest("Only a dev workspace can link to another workspace.");
      let next: string | null = linkedWorkspaceId;
      for (let hops = 0; next !== null; hops++) {
        if (next === self || hops > 50) {
          throw badRequest("That link would lead back to this workspace.");
        }
        const target: { linked_workspace_id: string | null } | undefined = await db
          .selectFrom("workspace")
          .select("linked_workspace_id")
          .where("id", "=", next)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();
        if (!target) throw badRequest("The linked workspace is not in this tenant.");
        next = target.linked_workspace_id;
      }
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
        const byInstance = await instanceTriggersPaused(kernel);
        const whole = await check(db, ctx.principal, "workspace:read", { tenantId: params.t });
        if (whole.allowed) {
          // Goes through authorize so that operator access is recorded.
          await ctx.authorize("workspace:read", { tenantId: params.t });
          return { items: rows.map((row) => toWorkspace(row, byInstance)) };
        }
        const readable = [];
        for (const row of rows) {
          if (await ctx.allowed("workspace:read", { tenantId: params.t, workspaceId: row.id })) {
            readable.push(row);
          }
        }
        // Nothing readable here: answer exactly as the tenant-level check would.
        if (readable.length === 0) await ctx.authorize("workspace:read", { tenantId: params.t });
        return { items: readable.map((row) => toWorkspace(row, byInstance)) };
      },
    );

    app.post(
      "/tenants/:t/workspaces",
      {
        config: { access: access.tenant("workspace:write") },
        schema: {
          summary: "Create a workspace",
          description:
            "The type is fixed at creation and can never be changed. A dev workspace starts " +
            "with its triggers paused, so that schedules tried in it do not run beside " +
            "production's; `triggersPaused: false` starts it running.",
          tags: ["tenancy"],
          params: TenantParams,
          body: Type.Object({
            slug: Slug,
            name: Name,
            type: WorkspaceType,
            linkedWorkspaceId: Type.Optional(Id),
            triggersPaused: Type.Optional(
              Type.Boolean({ description: "Default: true for a dev workspace, false otherwise." }),
            ),
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
              triggers_paused: body.triggersPaused ?? body.type === "dev",
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "workspace.created",
            targetType: "workspace",
            targetId: row.id,
            tenantId: params.t,
            workspaceId: row.id,
            details: {
              slug: row.slug,
              type: row.type,
              linkedWorkspaceId: linked,
              triggersPaused: row.triggers_paused,
            },
          });
          return row;
        });
        return reply.code(201).send(toWorkspace(workspace, await instanceTriggersPaused(kernel)));
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
        return toWorkspace(row, await instanceTriggersPaused(kernel));
      },
    );

    app.patch(
      "/tenants/:t/workspaces/:w",
      {
        config: { access: access.workspace("workspace:write") },
        schema: {
          summary:
            "Change a workspace's name, link, run limit or failure alert, or pause its triggers",
          description:
            "The type cannot be changed. While `triggersPaused` is true, nothing in the " +
            "workspace starts by itself: schedules do not fire, webhooks answer 503 and " +
            "events start no subscriber. A schedule that came due while paused fires once on resuming. `failureAlert` names a script to start and an HTTP " +
            "connection to notify when a run fails for the last time.",
          tags: ["tenancy"],
          params: WorkspaceParams,
          body: Type.Object({
            name: Type.Optional(Name),
            linkedWorkspaceId: Type.Optional(NullableId),
            triggersPaused: Type.Optional(Type.Boolean()),
            concurrencyLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
            timeZone: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
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
        if (body.timeZone !== undefined && !isTimeZone(body.timeZone)) {
          throw badRequest(
            `${body.timeZone} is not a time zone. Use a name such as Europe/Berlin or UTC.`,
            [{ path: "/timeZone", message: "Not a time zone." }],
          );
        }
        await checkLink(params.t, current.type, linked, params.w);
        const row = await ctx.mutate(async (trx, audit) => {
          const updated = await trx
            .updateTable("workspace")
            .set({
              name: body.name ?? current.name,
              linked_workspace_id: linked,
              triggers_paused: body.triggersPaused ?? current.triggers_paused,
              concurrency_limit: body.concurrencyLimit ?? current.concurrency_limit,
              time_zone: body.timeZone ?? current.time_zone,
              ...(body.failureAlert ? { failure_alert: JSON.stringify(body.failureAlert) } : {}),
            })
            .where("id", "=", params.w)
            .returningAll()
            .executeTakeFirstOrThrow();
          if (updated.triggers_paused !== current.triggers_paused) {
            await audit({
              action: updated.triggers_paused
                ? "workspace.triggers_paused"
                : "workspace.triggers_resumed",
              targetType: "workspace",
              targetId: params.w,
              tenantId: params.t,
              workspaceId: params.w,
            });
          }
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
              timeZone: updated.time_zone,
              failureAlert: updated.failure_alert,
            },
          });
          return updated;
        });
        return toWorkspace(row, await instanceTriggersPaused(kernel));
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
        // Who set each last is in the audit log, which every change goes through.
        const setters = await sql<{ name: string; who: string | null }>`
          select distinct on (a.target_id) a.target_id as name,
            coalesce(m.email, m.name, s.name) as who
          from audit_entry a
          left join member m on a.actor_type = 'member' and m.id = a.actor_id
          left join service_account s on a.actor_type = 'service_account' and s.id = a.actor_id
          where a.workspace_id = ${params.w} and a.target_type = 'secret'
            and a.action in ('secret.created', 'secret.updated')
          order by a.target_id, a.occurred_at desc
        `.execute(db);
        const setBy = new Map(setters.rows.map((row) => [row.name, row.who]));
        return {
          items: rows.map((row) => ({
            name: row.name,
            createdAt: iso(row.created_at),
            updatedAt: iso(row.updated_at),
            updatedBy: setBy.get(row.name) ?? null,
          })),
        };
      },
    );

    app.post(
      "/tenants/:t/workspaces/:w/secrets",
      {
        config: { access: access.workspace("secret:write") },
        schema: {
          summary: "Make a new secret",
          description:
            "Refuses a name that is already in use, so a mistyped name is never a second " +
            "secret and an existing one is never replaced by accident. Replace a value with PUT.",
          tags: ["secrets"],
          params: WorkspaceParams,
          body: Type.Object({
            name: SecretName,
            value: Type.String({ minLength: 1, maxLength: 65536 }),
          }),
          response: { 201: Type.Object({ name: Type.String() }) },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const taken = await db
          .selectFrom("secret")
          .select("id")
          .where("workspace_id", "=", params.w)
          .where("name", "=", body.name)
          .executeTakeFirst();
        if (taken) {
          throw conflict(
            `A secret named ${body.name} is already here. Replace its value from its page.`,
          );
        }
        await ctx.mutate(async (trx, audit) => {
          await setSecret(
            trx,
            kernel.vault,
            { tenantId: params.t, workspaceId: params.w, name: body.name },
            body.value,
          );
          await audit({
            action: "secret.created",
            targetType: "secret",
            targetId: body.name,
            tenantId: params.t,
            workspaceId: params.w,
          });
        });
        return reply.code(201).send({ name: body.name });
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
        // By its path, or by one it had before it was renamed: then the answer says so.
        const found = await resolveResource(db, workspace.id, resourcePath(params));
        if (!found) throw notFound("The resource");
        ctx.moved = found.alias;
        return toResource(found.resource, workspace);
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
            "resource to this path and keeps its ID. `create` says this is a new resource: " +
            "a path that already has one is refused with `path_taken`, and nothing is replaced.",
          tags: ["resources"],
          params: ResourceParams,
          body: Type.Object({
            kind: Type.String(),
            schemaVersion: Type.Integer({ minimum: 1 }),
            ownership: Type.Union([Type.Literal("code"), Type.Literal("ui")]),
            body: AnyObject,
            renameFrom: Type.Optional(Type.String()),
            version: Type.Optional(
              Type.Integer({
                minimum: 1,
                description:
                  "The version read. When someone has saved since, the save is refused with `draft_changed`.",
              }),
            ),
            create: Type.Optional(
              Type.Boolean({
                description: "Refuse, with `path_taken`, to replace a resource that is there.",
              }),
            ),
          }),
          response: { 200: Resource, 201: Resource },
        },
      },
      async ({ ctx, params, body: { create, version, ...body } }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const path = resourcePath(params);
        await refuseDirectProductionWrite(db, workspace, {
          mayDeploy: () =>
            ctx.allowed("promotion:write", {
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
            }),
          paths: [path, ...(body.renameFrom ? [body.renameFrom] : [])],
          ownership: body.ownership,
        });
        await requireStanding(kernel, ctx, workspace, [{ kind: body.kind, path, body: body.body }]);
        const result = await ctx.mutate(async (trx, audit) => {
          if (create) {
            const taken = await trx
              .selectFrom("resource")
              .select("id")
              .where("workspace_id", "=", workspace.id)
              .where("path", "=", path)
              .executeTakeFirst();
            if (taken)
              throw new HttpError(
                409,
                "path_taken",
                `Something is already at "${path}". Choose another name, or change what is there.`,
              );
          }
          return putResource(kernel, trx, audit, workspace, {
            ...body,
            path,
            ...(version !== undefined ? { expectedVersion: version } : {}),
          });
        });
        return reply
          .code(result.created ? 201 : 200)
          .send(toResource(result.resource as ResourceRow, workspace));
      },
    );

    app.get(
      "/tenants/:t/workspaces/:w/aliases",
      {
        config: { access: access.workspace("resource:read") },
        schema: {
          summary: "The paths that renamed resources had and that still answer",
          description:
            "A rename leaves the old path answering for the resource for 90 days. An answer " +
            "reached through one carries `Deprecation`, `Sunset` and `Volvel-Resource-Moved`.",
          tags: ["resources"],
          params: Type.Object({ t: Id, w: Id }),
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String({ description: "The path it had." }),
                  kind: Type.String(),
                  resourceId: Id,
                  now: Type.String({ description: "The path the resource has now." }),
                  createdAt: Time,
                  expiresAt: Time,
                  lastUsedAt: Type.Union([Time, Type.Null()], {
                    description:
                      "When the old path was last asked for, to the hour. Null if it never was.",
                  }),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const rows = await db
          .selectFrom("resource_alias")
          .innerJoin("resource", "resource.id", "resource_alias.resource_id")
          .select([
            "resource_alias.path",
            "resource_alias.kind",
            "resource_alias.resource_id",
            "resource.path as now",
            "resource_alias.created_at",
            "resource_alias.expires_at",
            "resource_alias.last_used_at",
          ])
          .where("resource_alias.workspace_id", "=", workspace.id)
          .where("resource_alias.expires_at", ">", new Date())
          .orderBy("resource_alias.path")
          .execute();
        return {
          items: rows.map((row) => ({
            path: row.path,
            kind: row.kind,
            resourceId: row.resource_id,
            now: row.now,
            createdAt: iso(row.created_at),
            expiresAt: iso(row.expires_at),
            lastUsedAt: row.last_used_at ? iso(row.last_used_at) : null,
          })),
        };
      },
    );

    app.delete(
      "/tenants/:t/workspaces/:w/aliases/*",
      {
        config: { access: access.workspace("resource:write") },
        schema: {
          summary: "Stop an old path answering now",
          description: "The resource is untouched. Whoever still calls the old path gets 404.",
          tags: ["resources"],
          params: ResourceParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const path = resourcePath(params);
        await ctx.mutate(async (trx, audit) => {
          const alias = await trx
            .deleteFrom("resource_alias")
            .where("workspace_id", "=", workspace.id)
            .where("path", "=", path)
            .returningAll()
            .executeTakeFirst();
          if (!alias) throw notFound(`An alias at ${path}`);
          await audit({
            action: "resource.alias_removed",
            targetType: "resource",
            targetId: alias.resource_id,
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            details: { path, kind: alias.kind },
          });
        });
        return reply.code(204).send(null);
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
        await refuseDirectProductionWrite(db, workspace, {
          mayDeploy: () =>
            ctx.allowed("promotion:write", {
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
            }),
          paths: [path],
        });
        await ctx.mutate((trx, audit) => deleteResource(trx, audit, workspace, path, kernel.hooks));
        return reply.code(204).send(null);
      },
    );
  };
}
