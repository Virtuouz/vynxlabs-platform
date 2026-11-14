import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { Type } from "typebox";
import { cleanTheme, themeCss } from "../kernel/apps/theme.js";
import { badRequest, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { NoContent } from "./shared.js";

/** What the console calls itself when the operator has not named it. */
export const DEFAULT_PRODUCT_NAME = "Vynxlabs";

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_LOGO_BYTES = 512 * 1024;

const ThemeTokens = Type.Record(Type.String(), Type.String({ maxLength: 200 }));
const Branding = Type.Object({
  productName: Type.String({ description: "The name the console shows for itself." }),
  named: Type.Boolean({ description: "Whether the operator set the name, or it is the default." }),
  logo: Type.Boolean({ description: "Whether a logo is set." }),
  theme: Type.Object({
    tokens: ThemeTokens,
    dark: ThemeTokens,
  }),
});

/**
 * The console's own branding, one set for the whole instance. A tenant's
 * branding is for its apps and portal and never reaches the console.
 */
export function brandingRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    const row = () => db.selectFrom("instance_branding").selectAll().executeTakeFirst();
    const read = async () => {
      const found = await row();
      return {
        productName: found?.product_name ?? DEFAULT_PRODUCT_NAME,
        named: Boolean(found?.product_name),
        logo: Boolean(found?.logo_key),
        theme: { tokens: found?.theme.tokens ?? {}, dark: found?.theme.dark ?? {} },
      };
    };

    app.get(
      "/instance/branding",
      {
        config: { access: access.public },
        schema: {
          summary: "How the console looks on this instance",
          description: "Public: the sign-in screen needs it before anyone has signed in.",
          tags: ["instance"],
          response: { 200: Branding },
        },
      },
      async () => read(),
    );

    app.put(
      "/instance/branding",
      {
        config: { access: access.instance("instance:write") },
        schema: {
          summary: "Brand the console",
          description:
            "`productName` replaces the console's name; null goes back to the default. " +
            "`theme` replaces the instance's token values: `tokens` for light, `dark` for dark. " +
            "A token left out keeps the console's own value. Each value must be a plain colour, " +
            "length or font list.",
          tags: ["instance"],
          body: Type.Object({
            productName: Type.Optional(
              Type.Union([Type.String({ minLength: 1, maxLength: 60 }), Type.Null()]),
            ),
            theme: Type.Optional(
              Type.Object({ tokens: Type.Optional(ThemeTokens), dark: Type.Optional(ThemeTokens) }),
            ),
          }),
          response: { 200: Branding },
        },
      },
      async ({ ctx, body }) => {
        const theme = body.theme ? cleanTheme(body.theme) : undefined;
        const name = body.productName === undefined ? undefined : body.productName?.trim() || null;
        await ctx.mutate(async (trx, audit) => {
          const values = {
            ...(name !== undefined ? { product_name: name } : {}),
            ...(theme ? { theme: JSON.stringify(theme) } : {}),
          };
          await trx
            .insertInto("instance_branding")
            .values({ id: true, ...values })
            .onConflict((c) => c.column("id").doUpdateSet({ ...values, updated_at: new Date() }))
            .execute();
          await audit({
            action: "instance.branding_updated",
            targetType: "instance",
            targetId: null,
            details: {
              ...(name !== undefined ? { productName: name } : {}),
              ...(theme ? { theme: Object.keys({ ...theme.tokens, ...theme.dark }) } : {}),
            },
          });
        });
        return read();
      },
    );

    app.get(
      "/instance/theme.css",
      {
        config: { access: access.public },
        schema: {
          summary: "The console's theme tokens, as a stylesheet",
          description:
            "Only the values the operator set. Loaded after the console's own stylesheet, so " +
            "they replace its values and leave the rest.",
          tags: ["instance"],
          produces: ["text/css"],
          response: { 200: Type.String() },
        },
      },
      async (_request, reply) => {
        const found = await row();
        reply.header("content-type", "text/css; charset=utf-8");
        reply.header("x-content-type-options", "nosniff");
        reply.header("cache-control", "public, max-age=60");
        return themeCss({ tokens: found?.theme.tokens ?? {}, dark: found?.theme.dark ?? {} });
      },
    );

    app.get(
      "/instance/branding/logo",
      {
        config: { access: access.public },
        schema: {
          summary: "The console's logo",
          tags: ["instance"],
          produces: [...LOGO_TYPES],
          response: { 200: Type.Unknown({ description: "The image." }) },
        },
      },
      async (_request, reply) => {
        const found = await row();
        if (!found?.logo_key || !LOGO_TYPES.has(found.logo_content_type ?? ""))
          throw notFound("The logo");
        return (
          reply
            .header("content-type", found.logo_content_type as string)
            .header("x-content-type-options", "nosniff")
            // An SVG opened on its own must not run anything.
            .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'")
            .header("cache-control", "public, max-age=300")
            .send(await kernel.storage.get(found.logo_key))
        );
      },
    );

    app.delete(
      "/instance/branding/logo",
      {
        config: { access: access.instance("instance:write") },
        schema: {
          summary: "Remove the console's logo",
          tags: ["instance"],
          response: { 204: NoContent },
        },
      },
      async ({ ctx }, reply) => {
        const previous = await ctx.mutate(async (trx, audit) => {
          const before = await trx
            .selectFrom("instance_branding")
            .select("logo_key")
            .forUpdate()
            .executeTakeFirst();
          await trx
            .updateTable("instance_branding")
            .set({ logo_key: null, logo_content_type: null, updated_at: new Date() })
            .execute();
          await audit({
            action: "instance.logo_removed",
            targetType: "instance",
            targetId: null,
          });
          return before?.logo_key ?? null;
        });
        if (previous) await kernel.storage.remove(previous).catch(() => {});
        return reply.code(204).send(null);
      },
    );

    await app.register(async (upload) => {
      upload.removeAllContentTypeParsers();
      upload.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) =>
        done(null, body),
      );
      upload.withTypeProvider<TypeBoxTypeProvider>().put(
        "/instance/branding/logo",
        {
          bodyLimit: MAX_LOGO_BYTES,
          config: { access: access.instance("instance:write") },
          schema: {
            summary: "Set the console's logo",
            description:
              "The request body is the image: PNG, JPEG, WebP or SVG, up to 512 KB. It is shown " +
              "in the console's rail and on its sign-in screen.",
            tags: ["instance"],
            response: { 204: NoContent },
          },
        },
        async ({ ctx, body, headers }, reply) => {
          const content = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
          const type = (headers["content-type"] ?? "").split(";")[0]?.trim() ?? "";
          if (content.length === 0 || !LOGO_TYPES.has(type)) {
            throw badRequest("Send a PNG, JPEG, WebP or SVG image as the request body.");
          }
          const key = `branding/instance/logo-${newId()}`;
          await kernel.storage.put(key, content, type);
          const previous = await ctx.mutate(async (trx, audit) => {
            const before = await trx
              .selectFrom("instance_branding")
              .select("logo_key")
              .executeTakeFirst();
            await trx
              .insertInto("instance_branding")
              .values({ id: true, logo_key: key, logo_content_type: type })
              .onConflict((c) =>
                c.column("id").doUpdateSet({
                  logo_key: key,
                  logo_content_type: type,
                  updated_at: new Date(),
                }),
              )
              .execute();
            await audit({
              action: "instance.logo_set",
              targetType: "instance",
              targetId: null,
              details: { bytes: content.length, contentType: type },
            });
            return before?.logo_key ?? null;
          });
          if (previous) await kernel.storage.remove(previous).catch(() => {});
          return reply.code(204).send(null);
        },
      );
    });
  };
}
