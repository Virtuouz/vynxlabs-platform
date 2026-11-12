import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { Type } from "typebox";
import { badRequest, conflict, notFound } from "../kernel/errors.js";
import { access, findWorkspace } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { runClone } from "../kernel/tenancy/clone.js";
import { deleteTenant, deleteWorkspace, removeStored } from "../kernel/tenancy/remove.js";
import {
  AnyObject,
  Id,
  iso,
  isoOrNull,
  Name,
  NoContent,
  NullableString,
  NullableTime,
  Slug,
  TenantParams,
  Time,
  WorkspaceParams,
} from "./shared.js";

const Clone = Type.Object({
  id: Id,
  sourceWorkspaceId: Id,
  workspaceId: Id,
  status: Type.Union([Type.Literal("running"), Type.Literal("succeeded"), Type.Literal("failed")]),
  withData: Type.Boolean(),
  safe: Type.Boolean(),
  report: AnyObject,
  error: NullableString,
  createdAt: Time,
  finishedAt: NullableTime,
});
interface CloneRow {
  id: string;
  source_workspace_id: string;
  workspace_id: string;
  status: "running" | "succeeded" | "failed";
  with_data: boolean;
  safe: boolean;
  report: Record<string, unknown>;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
}
const toClone = (row: CloneRow) => ({
  id: row.id,
  sourceWorkspaceId: row.source_workspace_id,
  workspaceId: row.workspace_id,
  status: row.status,
  withData: row.with_data,
  safe: row.safe,
  report: row.report,
  error: row.error,
  createdAt: iso(row.created_at),
  finishedAt: isoOrNull(row.finished_at),
});

/** Copying and removing workspaces, and removing a tenant. */
export function environmentRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.post(
      "/tenants/:t/workspaces/:w/clones",
      {
        config: { access: access.custom },
        schema: {
          summary: "Copy a workspace into a new dev workspace",
          description:
            "The copy is a dev workspace linked to the one it came from, and its triggers start " +
            "paused. With `safe` (the default) it gets no connection, no data source and no " +
            "secret value, so it cannot reach a real system until someone binds it. Needs " +
            "`workspace:write` in the tenant. Copying data also needs `data_all:read` and " +
            "`file:read` in the source, and turning safety off also needs `secret:write` and " +
            "`connection:write` there. The copying runs after this answers: read the clone to see how it went.",
          tags: ["tenancy"],
          params: WorkspaceParams,
          body: Type.Object({
            slug: Slug,
            name: Name,
            withData: Type.Optional(Type.Boolean({ default: false })),
            safe: Type.Optional(Type.Boolean({ default: true })),
          }),
          response: { 202: Clone },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const withData = body.withData ?? false;
        const safe = body.safe ?? true;
        await ctx.authorize("workspace:write", { tenantId: params.t });
        const source = await findWorkspace(kernel, params.t, params.w);
        const at = { tenantId: params.t, workspaceId: params.w };
        await ctx.authorize("workspace:read", at);
        if (withData) {
          await ctx.authorize("data_all:read", at);
          await ctx.authorize("file:read", at);
        }
        if (!safe) {
          await ctx.authorize("secret:write", at);
          await ctx.authorize("connection:write", at);
        }
        const original = await db
          .selectFrom("workspace")
          .select(["concurrency_limit"])
          .where("id", "=", source.id)
          .executeTakeFirstOrThrow();

        const clone = await ctx.mutate(async (trx, audit) => {
          const taken = await trx
            .selectFrom("workspace")
            .select("id")
            .where("tenant_id", "=", params.t)
            .where("slug", "=", body.slug)
            .executeTakeFirst();
          if (taken) {
            throw badRequest("The workspace cannot be created.", [
              { path: "/body/slug", message: "another workspace in this tenant has this slug" },
            ]);
          }
          const workspaceId = newId();
          await trx
            .insertInto("workspace")
            .values({
              id: workspaceId,
              tenant_id: params.t,
              slug: body.slug,
              name: body.name,
              type: "dev",
              linked_workspace_id: source.id,
              active_bundle_id: null,
              // A copy never starts anything by itself until someone says so.
              triggers_paused: true,
              concurrency_limit: original.concurrency_limit,
            })
            .execute();
          const row = await trx
            .insertInto("workspace_clone")
            .values({
              id: newId(),
              tenant_id: params.t,
              source_workspace_id: source.id,
              workspace_id: workspaceId,
              status: "running",
              with_data: withData,
              safe,
              report: "{}",
              error: null,
              created_by_type: ctx.principal.type,
              created_by_id: ctx.principal.id,
              finished_at: null,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "workspace.cloned",
            targetType: "workspace",
            targetId: workspaceId,
            tenantId: params.t,
            workspaceId,
            details: {
              sourceWorkspaceId: source.id,
              slug: body.slug,
              withData,
              // Recorded plainly, because with safety off the copy can act on real systems.
              safety: safe ? "on" : "off",
            },
          });
          return row;
        });
        void runClone(kernel, ctx.actor, clone.id);
        return reply.code(202).send(toClone(clone));
      },
    );

    app.get(
      "/tenants/:t/workspace-clones",
      {
        config: { access: access.tenant("workspace:read") },
        schema: {
          summary: "Recent clones in a tenant, newest first",
          tags: ["tenancy"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(Clone) }) },
        },
      },
      async ({ params }) => ({
        items: (
          await db
            .selectFrom("workspace_clone")
            .selectAll()
            .where("tenant_id", "=", params.t)
            .orderBy("id", "desc")
            .limit(50)
            .execute()
        ).map(toClone),
      }),
    );

    app.get(
      "/tenants/:t/workspace-clones/:id",
      {
        config: { access: access.tenant("workspace:read") },
        schema: {
          summary: "One clone: whether it finished, and what it copied",
          tags: ["tenancy"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 200: Clone },
        },
      },
      async ({ params }) => {
        const row = await db
          .selectFrom("workspace_clone")
          .selectAll()
          .where("tenant_id", "=", params.t)
          .where("id", "=", params.id)
          .executeTakeFirst();
        if (!row) throw notFound("The clone");
        return toClone(row);
      },
    );

    app.delete(
      "/tenants/:t/workspaces/:w",
      {
        config: { access: access.tenant("workspace:write") },
        schema: {
          summary: "Delete a dev workspace and everything in it",
          description:
            "Its resources, bindings, secrets, run history, custom tables and files are removed " +
            "for good. Send the workspace's slug as `confirm`. Refused for a production " +
            "workspace, and while runs are in progress.",
          tags: ["tenancy"],
          params: WorkspaceParams,
          querystring: Type.Object({ confirm: Type.String() }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, query }, reply) => {
        const workspace = await findWorkspace(kernel, params.t, params.w);
        if (query.confirm !== workspace.slug) {
          throw badRequest("To delete this workspace, send its slug as confirm.");
        }
        const cloning = await db
          .selectFrom("workspace_clone")
          .select("id")
          .where("status", "=", "running")
          .where((eb) =>
            eb.or([eb("workspace_id", "=", params.w), eb("source_workspace_id", "=", params.w)]),
          )
          .executeTakeFirst();
        if (cloning)
          throw conflict(
            "A clone of this workspace is still being made. Try again when it has finished.",
          );
        const keys = await ctx.mutate((trx, audit) =>
          deleteWorkspace(kernel, trx, audit, workspace),
        );
        await removeStored(kernel, keys);
        return reply.code(204).send(null);
      },
    );

    app.post(
      "/tenants/:t/deletion",
      {
        config: { access: access.instance("tenant:write") },
        schema: {
          summary: "Delete a tenant and everything it owns on this instance",
          description:
            "For operators. Every workspace, resource, secret, custom table and file of the " +
            "tenant is removed for good. Export the tenant first if anything should be kept. " +
            "Its audit entries stay, and so do its members' accounts. Send the tenant's slug " +
            "as `confirm`. Refused while runs are in progress.",
          tags: ["tenancy"],
          params: TenantParams,
          body: Type.Object({ confirm: Type.String() }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const tenant = await db
          .selectFrom("tenant")
          .select("slug")
          .where("id", "=", params.t)
          .executeTakeFirst();
        if (!tenant) throw notFound("The tenant");
        if (body.confirm !== tenant.slug) {
          throw badRequest("To delete this tenant, send its slug as confirm.");
        }
        const keys = await ctx.mutate((trx, audit) => deleteTenant(kernel, trx, audit, params.t));
        kernel.data.forgetTenant(params.t);
        await removeStored(kernel, keys);
        return reply.code(204).send(null);
      },
    );
  };
}
