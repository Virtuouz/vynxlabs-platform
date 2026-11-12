import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { badRequest, HttpError, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { exportTenant } from "../kernel/tenancy/export.js";
import { importTenant } from "../kernel/tenancy/import.js";
import { Id, NullableString, Slug, TenantParams } from "./shared.js";

/** Long enough that guessing it is not a way in to a file that holds every secret a tenant has. */
const MIN_PASSPHRASE = 12;
/** The largest export this instance takes in. It is written to disk before it is read. */
const MAX_IMPORT_BYTES = 50 * 1024 ** 3;

const Passphrase = Type.String({ minLength: MIN_PASSPHRASE, maxLength: 500 });

/** Taking a tenant out of an instance, and bringing one in. */
export function portabilityRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.post(
      "/tenants/:t/exports",
      {
        config: { access: access.tenant("tenant:export") },
        schema: {
          summary: "Export a tenant as one file",
          description:
            "The answer is a tar archive: every resource, binding, secret, member, audit entry, " +
            "custom table and file the tenant has, as JSON Lines and plain files, with a list " +
            "of contents and checksums. Secrets stay encrypted under the tenant's own key, " +
            "and the key travels wrapped with the passphrase, which is not stored anywhere: " +
            "without it the secrets in the export cannot be read. Run, flow and event history " +
            "is included when `history` is true. API keys and worker credentials are never " +
            "included. The format is described in docs/contracts/tenant-export.md.",
          tags: ["portability"],
          params: TenantParams,
          body: Type.Object({
            passphrase: Passphrase,
            history: Type.Optional(Type.Boolean({ default: false })),
          }),
          produces: ["application/x-tar"],
          response: { 200: Type.Unknown({ description: "The archive." }) },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const tenant = await db
          .selectFrom("tenant")
          .select("slug")
          .where("id", "=", params.t)
          .executeTakeFirst();
        if (!tenant) throw notFound("The tenant");
        const history = body.history ?? false;
        await ctx.mutate((_trx, audit) =>
          audit({
            action: "tenant.exported",
            targetType: "tenant",
            targetId: params.t,
            tenantId: params.t,
            details: { history },
          }),
        );
        const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "");
        return reply
          .header("content-type", "application/x-tar")
          .header("content-disposition", `attachment; filename="${tenant.slug}-${stamp}.tar"`)
          .send(
            Readable.from(exportTenant(kernel, params.t, { passphrase: body.passphrase, history })),
          );
      },
    );

    // An import is the archive itself as the request body, however large.
    await app.register(async (upload) => {
      upload.removeAllContentTypeParsers();
      upload.addContentTypeParser("*", (_request, payload, done) => done(null, payload));
      upload.withTypeProvider<TypeBoxTypeProvider>().post(
        "/instance/tenant-imports",
        {
          config: { access: access.instance("tenant:write") },
          schema: {
            summary: "Import an exported tenant as a new tenant on this instance",
            description:
              "For operators. The request body is the export file. Send its passphrase in the " +
              "`x-export-passphrase` header. The whole file is checked against its own list of " +
              "contents before anything is written, and the tenant arrives entirely or not at " +
              "all. IDs are kept. Members are matched by email: someone who already has an " +
              "account here keeps it, with their own password. Every workspace arrives with " +
              "its triggers paused. The export must come from an instance at the same " +
              "database level as this one.",
            tags: ["portability"],
            consumes: ["application/x-tar"],
            querystring: Type.Object({
              slug: Type.Optional(Slug),
              dataLocation: Type.Optional(
                Type.String({
                  description:
                    "A registered dedicated database for the tenant's custom tables. Without it they go in the platform database.",
                }),
              ),
            }),
            headers: Type.Object({ "x-export-passphrase": Type.String({ minLength: 1 }) }),
            response: {
              201: Type.Object({
                tenant: Type.Object({
                  id: Id,
                  slug: Type.String(),
                  name: Type.String(),
                  dataLocation: NullableString,
                }),
                counts: Type.Record(Type.String(), Type.Integer()),
                members: Type.Object({ created: Type.Integer(), linked: Type.Integer() }),
                objects: Type.Integer(),
                cancelled: Type.Object({ runs: Type.Integer(), flowRuns: Type.Integer() }),
                pausedWorkspaces: Type.Integer(),
                notCarried: Type.Array(Type.String()),
              }),
            },
          },
        },
        async ({ ctx, query, headers, body }, reply) => {
          if (!(body instanceof Readable))
            throw badRequest("Send the export file as the request body.");
          const dir = await mkdtemp(join(tmpdir(), "tenant-import-"));
          const path = join(dir, "export.tar");
          try {
            let received = 0;
            const limit = new Transform({
              transform(chunk: Buffer, _encoding, done) {
                received += chunk.length;
                done(
                  received > MAX_IMPORT_BYTES
                    ? new HttpError(
                        413,
                        "payload_too_large",
                        "The export is larger than this instance accepts.",
                      )
                    : null,
                  chunk,
                );
              },
            });
            await pipeline(body, limit, createWriteStream(path));
            ctx.mutated = true;
            const report = await importTenant(kernel, ctx.actor, path, {
              passphrase: headers["x-export-passphrase"],
              slug: query.slug,
              dataLocation: query.dataLocation,
            });
            return reply.code(201).send(report);
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        },
      );
    });
  };
}
