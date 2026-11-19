import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { newId } from "@volvel/db";
import { Type } from "typebox";
import { badRequest, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import {
  defaultIcon,
  ICON_SIZES,
  type IconSize,
  isIconSize,
  MAX_ICON_BYTES,
  pngSize,
} from "../kernel/icons.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id, NoContent } from "./shared.js";

type Icons = Partial<Record<string, string>>;

/** The stored icon of a size for the instance, or nothing when none was sent. */
export async function instanceIcon(kernel: Kernel, size: IconSize): Promise<Buffer | undefined> {
  const row = await kernel.db.selectFrom("instance_branding").select("icons").executeTakeFirst();
  const key = (row?.icons as Icons | undefined)?.[String(size)];
  return key ? kernel.storage.get(key) : undefined;
}

/**
 * The icons made from a logo, for the instance's console and for each
 * tenant's portal and apps. Each size is sent as a PNG by whoever set the
 * logo, from the browser that drew it; the server checks it is a PNG of that
 * size and keeps it. Asked for, an instance with none answers with the
 * platform's default, and a tenant with none answers with nothing.
 */
export const iconRoutes =
  (kernel: Kernel): FastifyPluginAsyncTypebox =>
  async (app) => {
    const { db } = kernel;
    const SizeParam = Type.Integer({ description: `One of ${ICON_SIZES.join(", ")}.` });
    const sized = (size: number): IconSize => {
      if (!isIconSize(size)) throw notFound("An icon of that size");
      return size;
    };
    /** What arrived, as an icon of the size it was sent for. */
    const checked = (body: unknown, type: string | undefined, size: IconSize): Buffer => {
      const content = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
      const found = pngSize(content);
      if ((type ?? "").split(";")[0]?.trim() !== "image/png" || !found) {
        throw badRequest("Send a PNG image as the request body.");
      }
      if (found.width !== size || found.height !== size) {
        throw badRequest(
          `The icon is ${found.width} by ${found.height} pixels, and this address takes ${size} by ${size}.`,
        );
      }
      return content;
    };
    const png = (
      reply: { header(name: string, value: string): unknown; send(body: Buffer): unknown },
      bytes: Buffer,
    ) => {
      reply.header("content-type", "image/png");
      reply.header("x-content-type-options", "nosniff");
      reply.header("cache-control", "public, max-age=300");
      return reply.send(bytes);
    };

    app.get(
      "/instance/branding/icons/:size",
      {
        config: { access: access.public },
        schema: {
          summary: "The console's icon at one size",
          description:
            "Made from the instance's logo. An instance with no logo answers with the platform's own icon.",
          tags: ["instance"],
          params: Type.Object({ size: SizeParam }),
          produces: ["image/png"],
          response: { 200: Type.Unknown({ description: "The image." }) },
        },
      },
      async ({ params }, reply) => {
        const size = sized(params.size);
        return png(reply, (await instanceIcon(kernel, size)) ?? defaultIcon(size));
      },
    );

    app.delete(
      "/instance/branding/icons",
      {
        config: { access: access.instance("instance:write") },
        schema: {
          summary: "Remove the console's icons",
          description: "The console goes back to the platform's own icon.",
          tags: ["instance"],
          response: { 204: NoContent },
        },
      },
      async ({ ctx }, reply) => {
        const previous = await ctx.mutate(async (trx, audit) => {
          const before = await trx
            .selectFrom("instance_branding")
            .select("icons")
            .forUpdate()
            .executeTakeFirst();
          await trx
            .updateTable("instance_branding")
            .set({ icons: JSON.stringify({}), updated_at: new Date() })
            .execute();
          await audit({ action: "instance.icons_removed", targetType: "instance", targetId: null });
          return Object.values((before?.icons as Icons | undefined) ?? {});
        });
        for (const key of previous) if (key) await kernel.storage.remove(key).catch(() => {});
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/tenants/:t/portal/icons/:size",
      {
        config: { access: access.public },
        schema: {
          summary: "A tenant's icon at one size",
          description: "Made from the tenant's logo, for its sign-in pages and its apps.",
          tags: ["branding"],
          params: Type.Object({ t: Id, size: SizeParam }),
          produces: ["image/png"],
          response: { 200: Type.Unknown({ description: "The image." }) },
        },
      },
      async ({ params }, reply) => {
        const size = sized(params.size);
        const row = await db
          .selectFrom("tenant_portal")
          .select("icons")
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        const key = (row?.icons as Icons | undefined)?.[String(size)];
        if (!key) throw notFound("The icon");
        return png(reply, await kernel.storage.get(key));
      },
    );

    app.delete(
      "/tenants/:t/portal/icons",
      {
        config: { access: access.tenant("portal:write") },
        schema: {
          summary: "Remove a tenant's icons",
          tags: ["branding"],
          params: Type.Object({ t: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const previous = await ctx.mutate(async (trx, audit) => {
          const before = await trx
            .selectFrom("tenant_portal")
            .select("icons")
            .where("tenant_id", "=", params.t)
            .forUpdate()
            .executeTakeFirst();
          await trx
            .updateTable("tenant_portal")
            .set({ icons: JSON.stringify({}), updated_at: new Date() })
            .where("tenant_id", "=", params.t)
            .execute();
          await audit({
            action: "portal.icons_removed",
            targetType: "tenant",
            targetId: params.t,
            tenantId: params.t,
          });
          return Object.values((before?.icons as Icons | undefined) ?? {});
        });
        for (const key of previous) if (key) await kernel.storage.remove(key).catch(() => {});
        return reply.code(204).send(null);
      },
    );

    await app.register(async (upload) => {
      upload.removeAllContentTypeParsers();
      upload.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) =>
        done(null, body),
      );
      const typed = upload.withTypeProvider<TypeBoxTypeProvider>();

      typed.put(
        "/instance/branding/icons/:size",
        {
          bodyLimit: MAX_ICON_BYTES,
          config: { access: access.instance("instance:write") },
          schema: {
            summary: "Set the console's icon at one size",
            description:
              "The request body is a PNG of exactly that many pixels each way. The console " +
              "sends each size when a logo is set, drawn from the logo by the browser.",
            tags: ["instance"],
            params: Type.Object({ size: SizeParam }),
            response: { 204: NoContent },
          },
        },
        async ({ ctx, params, body, headers }, reply) => {
          const size = sized(params.size);
          const content = checked(body, headers["content-type"], size);
          const key = `branding/instance/icon-${size}-${newId()}`;
          await kernel.storage.put(key, content, "image/png");
          const previous = await ctx.mutate(async (trx, audit) => {
            const before = await trx
              .selectFrom("instance_branding")
              .select("icons")
              .forUpdate()
              .executeTakeFirst();
            const icons = { ...((before?.icons as Icons | undefined) ?? {}), [String(size)]: key };
            await trx
              .insertInto("instance_branding")
              .values({ id: true, icons: JSON.stringify(icons) })
              .onConflict((c) =>
                c
                  .column("id")
                  .doUpdateSet({ icons: JSON.stringify(icons), updated_at: new Date() }),
              )
              .execute();
            await audit({
              action: "instance.icon_set",
              targetType: "instance",
              targetId: null,
              details: { size, bytes: content.length },
            });
            return (before?.icons as Icons | undefined)?.[String(size)] ?? null;
          });
          if (previous) await kernel.storage.remove(previous).catch(() => {});
          return reply.code(204).send(null);
        },
      );

      typed.put(
        "/tenants/:t/portal/icons/:size",
        {
          bodyLimit: MAX_ICON_BYTES,
          config: { access: access.tenant("portal:write") },
          schema: {
            summary: "Set a tenant's icon at one size",
            description: "The request body is a PNG of exactly that many pixels each way.",
            tags: ["branding"],
            params: Type.Object({ t: Id, size: SizeParam }),
            response: { 204: NoContent },
          },
        },
        async ({ ctx, params, body, headers }, reply) => {
          const size = sized(params.size);
          const content = checked(body, headers["content-type"], size);
          const key = `branding/${params.t}/icon-${size}-${newId()}`;
          await kernel.storage.put(key, content, "image/png");
          const previous = await ctx.mutate(async (trx, audit) => {
            const before = await trx
              .selectFrom("tenant_portal")
              .select("icons")
              .where("tenant_id", "=", params.t)
              .forUpdate()
              .executeTakeFirst();
            const icons = { ...((before?.icons as Icons | undefined) ?? {}), [String(size)]: key };
            await trx
              .insertInto("tenant_portal")
              .values({ tenant_id: params.t, icons: JSON.stringify(icons) })
              .onConflict((c) =>
                c
                  .column("tenant_id")
                  .doUpdateSet({ icons: JSON.stringify(icons), updated_at: new Date() }),
              )
              .execute();
            await audit({
              action: "portal.icon_set",
              targetType: "tenant",
              targetId: params.t,
              tenantId: params.t,
              details: { size, bytes: content.length },
            });
            return (before?.icons as Icons | undefined)?.[String(size)] ?? null;
          });
          if (previous) await kernel.storage.remove(previous).catch(() => {});
          return reply.code(204).send(null);
        },
      );
    });
  };
