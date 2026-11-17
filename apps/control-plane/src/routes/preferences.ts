import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { Type } from "typebox";
import { badRequest, conflict, forbidden, notFound } from "../kernel/errors.js";
import { access, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { AnyObject, Id, iso, NoContent, Time } from "./shared.js";

/**
 * A member's own settings and saved views (phase 15, P3-1, P3-4, P3-5). Each
 * changes nothing anyone else can see or do, so none is audited: they are
 * preference routes, listed in `PREFERENCE_ROUTES`.
 */

/** The settings a member may keep, by the shape of their key. Anything else is refused. */
export const PREFERENCE_KEY =
  /^(theme|panel|shortcuts\.single-key|editor\.[a-z][a-z-]{0,30}|density:[a-z][a-z0-9-]{0,39}|split:[a-z][a-z0-9-]{0,39}|palette\.pins:[0-9a-f-]{36}|seen:[a-z][a-z0-9-]{0,39}|operator\.strip)$/;
/** The largest one value may be, written out. */
export const MAX_PREFERENCE_BYTES = 4096;
/** The most settings one member keeps, and the most views of one list. */
export const MAX_PREFERENCES = 200;
export const MAX_VIEWS_PER_LIST = 50;
/** The largest a view's state may be, written out. */
export const MAX_VIEW_BYTES = 16_384;

const Preference = Type.Object({ key: Type.String(), value: Type.Unknown(), updatedAt: Time });
const View = Type.Object({
  id: Id,
  tenantId: Id,
  workspaceId: Type.Union([Id, Type.Null()]),
  list: Type.String(),
  name: Type.String(),
  state: AnyObject,
  updatedAt: Time,
});
const ListName = Type.String({ pattern: "^[a-z][a-z0-9-]{0,39}$" });
const ViewName = Type.String({ minLength: 1, maxLength: 80 });

/** Only a member keeps preferences: an API key or a service account has none. */
function memberOf(ctx: RequestContext): string {
  if (ctx.principal.type !== "member" || !ctx.principal.id) {
    throw forbidden("a member's own sign-in");
  }
  return ctx.principal.id;
}

const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");

export function preferenceRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  const { db } = kernel;
  return async (app) => {
    app.get(
      "/me/preferences",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "The caller's own settings",
          description:
            "What the console keeps for a member between browsers: density, panes and the like.",
          tags: ["identity"],
          response: { 200: Type.Object({ items: Type.Array(Preference) }) },
        },
      },
      async ({ ctx }) => {
        if (ctx.principal.type !== "member" || !ctx.principal.id) return { items: [] };
        const rows = await db
          .selectFrom("member_preference")
          .select(["key", "value", "updated_at"])
          .where("member_id", "=", ctx.principal.id)
          .orderBy("key")
          .execute();
        return {
          items: rows.map((row) => ({
            key: row.key,
            value: row.value,
            updatedAt: iso(row.updated_at),
          })),
        };
      },
    );

    app.put(
      "/me/preferences/:key",
      {
        config: { access: access.signedIn, preference: true },
        schema: {
          summary: "Keep one of the caller's own settings",
          description:
            "A preference of the caller's own: no audit entry. Only known keys are kept.",
          tags: ["identity"],
          params: Type.Object({ key: Type.String({ maxLength: 120 }) }),
          body: Type.Object({ value: Type.Unknown() }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const member = memberOf(ctx);
        if (!PREFERENCE_KEY.test(params.key))
          throw badRequest(`"${params.key}" is not a setting the console keeps.`);
        if (body.value === undefined) throw badRequest("A setting needs a value.");
        if (size(body.value) > MAX_PREFERENCE_BYTES) {
          throw badRequest(`A setting may be at most ${MAX_PREFERENCE_BYTES} bytes.`);
        }
        await ctx.keepPreference(async (keep) => {
          const kept = await keep
            .selectFrom("member_preference")
            .select((eb) => eb.fn.countAll<string>().as("count"))
            .where("member_id", "=", member)
            .where("key", "!=", params.key)
            .executeTakeFirstOrThrow();
          if (Number(kept.count) >= MAX_PREFERENCES) {
            throw conflict(`A member keeps at most ${MAX_PREFERENCES} settings.`);
          }
          await keep
            .insertInto("member_preference")
            .values({ member_id: member, key: params.key, value: JSON.stringify(body.value) })
            .onConflict((oc) =>
              oc.columns(["member_id", "key"]).doUpdateSet({
                value: JSON.stringify(body.value),
                updated_at: new Date(),
              }),
            )
            .execute();
        });
        return reply.code(204).send(null);
      },
    );

    app.delete(
      "/me/preferences/:key",
      {
        config: { access: access.signedIn, preference: true },
        schema: {
          summary: "Forget one of the caller's own settings",
          description: "The console's default applies again. No audit entry.",
          tags: ["identity"],
          params: Type.Object({ key: Type.String({ maxLength: 120 }) }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const member = memberOf(ctx);
        await ctx.keepPreference((keep) =>
          keep
            .deleteFrom("member_preference")
            .where("member_id", "=", member)
            .where("key", "=", params.key)
            .execute(),
        );
        return reply.code(204).send(null);
      },
    );

    /** The caller is a member of the tenant, and the workspace, if any, is the tenant's. */
    async function mayKeep(member: string, tenantId: string, workspaceId: string | null) {
      const belongs = await db
        .selectFrom("tenant_member")
        .select("member_id")
        .where("tenant_id", "=", tenantId)
        .where("member_id", "=", member)
        .executeTakeFirst();
      if (!belongs) throw notFound("The tenant");
      if (workspaceId) {
        const workspace = await db
          .selectFrom("workspace")
          .select("id")
          .where("id", "=", workspaceId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();
        if (!workspace) throw notFound("The workspace");
      }
    }

    const viewOf = (row: {
      id: string;
      tenant_id: string;
      workspace_id: string | null;
      list: string;
      name: string;
      state: unknown;
      updated_at: Date;
    }) => ({
      id: row.id,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      list: row.list,
      name: row.name,
      state: row.state as Record<string, unknown>,
      updatedAt: iso(row.updated_at),
    });

    const named = (error: unknown, name: string) => {
      if ((error as { code?: string }).code === "23505") {
        return conflict(`You already have a view named "${name}" of this list.`);
      }
      return error;
    };

    app.get(
      "/me/views",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "The caller's saved views of a list",
          description: "Private to the member who saved them. Newest first.",
          tags: ["identity"],
          querystring: Type.Object({
            tenant: Id,
            workspace: Type.Optional(Id),
            list: ListName,
          }),
          response: { 200: Type.Object({ items: Type.Array(View) }) },
        },
      },
      async ({ ctx, query }) => {
        if (ctx.principal.type !== "member" || !ctx.principal.id) return { items: [] };
        let rows = db
          .selectFrom("member_saved_view")
          .selectAll()
          .where("member_id", "=", ctx.principal.id)
          .where("tenant_id", "=", query.tenant)
          .where("list", "=", query.list);
        rows = query.workspace
          ? rows.where("workspace_id", "=", query.workspace)
          : rows.where("workspace_id", "is", null);
        const found = await rows.orderBy("updated_at", "desc").limit(MAX_VIEWS_PER_LIST).execute();
        return { items: found.map(viewOf) };
      },
    );

    app.post(
      "/me/views",
      {
        config: { access: access.signedIn, preference: true },
        schema: {
          summary: "Save a view of a list",
          description: "Its filters, sort, columns and density, by name. No audit entry.",
          tags: ["identity"],
          body: Type.Object({
            tenantId: Id,
            workspaceId: Type.Optional(Type.Union([Id, Type.Null()])),
            list: ListName,
            name: ViewName,
            state: AnyObject,
          }),
          response: { 201: View },
        },
      },
      async ({ ctx, body }, reply) => {
        const member = memberOf(ctx);
        const workspaceId = body.workspaceId ?? null;
        await mayKeep(member, body.tenantId, workspaceId);
        if (size(body.state) > MAX_VIEW_BYTES)
          throw badRequest(`A view may be at most ${MAX_VIEW_BYTES} bytes.`);
        const row = await ctx.keepPreference(async (keep) => {
          let counted = keep
            .selectFrom("member_saved_view")
            .select((eb) => eb.fn.countAll<string>().as("count"))
            .where("member_id", "=", member)
            .where("tenant_id", "=", body.tenantId)
            .where("list", "=", body.list);
          counted = workspaceId
            ? counted.where("workspace_id", "=", workspaceId)
            : counted.where("workspace_id", "is", null);
          if (Number((await counted.executeTakeFirstOrThrow()).count) >= MAX_VIEWS_PER_LIST) {
            throw conflict(`A member keeps at most ${MAX_VIEWS_PER_LIST} views of one list.`);
          }
          try {
            return await keep
              .insertInto("member_saved_view")
              .values({
                id: newId(),
                member_id: member,
                tenant_id: body.tenantId,
                workspace_id: workspaceId,
                list: body.list,
                name: body.name.trim(),
                state: JSON.stringify(body.state),
              })
              .returningAll()
              .executeTakeFirstOrThrow();
          } catch (error) {
            throw named(error, body.name);
          }
        });
        return reply.code(201).send(viewOf(row));
      },
    );

    app.patch(
      "/me/views/:id",
      {
        config: { access: access.signedIn, preference: true },
        schema: {
          summary: "Rename a saved view, or save the list's state over it",
          description: "No audit entry.",
          tags: ["identity"],
          params: Type.Object({ id: Id }),
          body: Type.Object({ name: Type.Optional(ViewName), state: Type.Optional(AnyObject) }),
          response: { 200: View },
        },
      },
      async ({ ctx, params, body }) => {
        const member = memberOf(ctx);
        if (body.state !== undefined && size(body.state) > MAX_VIEW_BYTES) {
          throw badRequest(`A view may be at most ${MAX_VIEW_BYTES} bytes.`);
        }
        const row = await ctx.keepPreference(async (keep) => {
          try {
            return await keep
              .updateTable("member_saved_view")
              .set({
                ...(body.name !== undefined ? { name: body.name.trim() } : {}),
                ...(body.state !== undefined ? { state: JSON.stringify(body.state) } : {}),
                updated_at: new Date(),
              })
              .where("id", "=", params.id)
              .where("member_id", "=", member)
              .returningAll()
              .executeTakeFirst();
          } catch (error) {
            throw named(error, body.name ?? "");
          }
        });
        if (!row) throw notFound("The view");
        return viewOf(row);
      },
    );

    app.delete(
      "/me/views/:id",
      {
        config: { access: access.signedIn, preference: true },
        schema: {
          summary: "Delete a saved view",
          description: "No audit entry.",
          tags: ["identity"],
          params: Type.Object({ id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const member = memberOf(ctx);
        const gone = await ctx.keepPreference((keep) =>
          keep
            .deleteFrom("member_saved_view")
            .where("id", "=", params.id)
            .where("member_id", "=", member)
            .executeTakeFirst(),
        );
        if (Number(gone.numDeletedRows) === 0) throw notFound("The view");
        return reply.code(204).send(null);
      },
    );
  };
}
