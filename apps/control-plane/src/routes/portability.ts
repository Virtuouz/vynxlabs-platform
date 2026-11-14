import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { Type } from "typebox";
import { badRequest, HttpError, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { exportTenant } from "../kernel/tenancy/export.js";
import { importTenant, inspectImport } from "../kernel/tenancy/import.js";
import { STAGE_DIR } from "../kernel/tenancy/staging.js";
import { Id, NoContent, NullableString, Slug, TenantParams } from "./shared.js";

/** Long enough that guessing it is not a way in to a file that holds every secret a tenant has. */
const MIN_PASSPHRASE = 12;
/** The largest export this instance takes in. It is written to disk before it is read. */
const MAX_IMPORT_BYTES = 50 * 1024 ** 3;
/** How long an uploaded export waits. */
const STAGE_HOURS = 1;

const Passphrase = Type.String({ minLength: MIN_PASSPHRASE, maxLength: 500 });

/** Taking a tenant out of an instance, and bringing one in. */
export function portabilityRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.post(
      "/tenants/:t/exports",
      {
        config: { access: access.tenant("export:write") },
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

    /** Writes an uploaded archive to `path`, refusing one larger than an instance takes. */
    const receive = async (body: unknown, path: string) => {
      if (!(body instanceof Readable))
        throw badRequest("Send the export file as the request body.");
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
      return received;
    };
    const stagedPath = (id: string) => join(STAGE_DIR, `${id}.tar`);
    const Inspection = Type.Object(
      {
        problem: NullableString,
        tenant: Type.Union([
          Type.Object({ id: Id, slug: Type.String(), name: Type.String() }),
          Type.Null(),
        ]),
        exportedAt: NullableString,
        coreVersion: NullableString,
        migrationLevel: Type.Union([Type.Integer(), Type.Null()]),
        levelMatches: Type.Boolean(),
        history: Type.Boolean(),
        workspaces: Type.Array(Type.Object({ name: Type.String(), type: Type.String() })),
        rows: Type.Integer(),
        members: Type.Integer(),
        pendingRuns: Type.Integer(),
        notCarried: Type.Array(Type.String()),
        passphraseOk: Type.Union([Type.Boolean(), Type.Null()]),
        tenantPresent: Type.Boolean(),
        slugTaken: Type.Boolean(),
      },
      { description: "What the export holds and whether it can come in here." },
    );
    const Staged = Type.Object({
      id: Id,
      fileName: Type.String(),
      sizeBytes: Type.Integer(),
      expiresAt: Type.String({ format: "date-time" }),
      inspection: Inspection,
    });
    const StagedParams = Type.Object({ id: Id });
    const OptionalPassphrase = Type.Object({ "x-export-passphrase": Type.Optional(Type.String()) });
    const findStaged = async (id: string) => {
      const row = await db
        .selectFrom("import_staging")
        .selectAll()
        .where("id", "=", id)
        .where("expires_at", ">", new Date())
        .executeTakeFirst();
      if (!row) throw notFound("That upload");
      const there = await stat(stagedPath(id)).catch(() => undefined);
      if (!there)
        throw new HttpError(
          409,
          "staged_elsewhere",
          "That upload is kept by another replica of the control plane, or was removed. Upload it again.",
        );
      return row;
    };

    app.get(
      "/instance/tenant-imports/staged/:id",
      {
        config: { access: access.instance("tenant:write") },
        schema: {
          summary: "Look at an uploaded export again, with a passphrase or a slug to try",
          tags: ["portability"],
          params: StagedParams,
          querystring: Type.Object({ slug: Type.Optional(Slug) }),
          headers: OptionalPassphrase,
          response: { 200: Staged },
        },
      },
      async ({ params, query, headers }) => {
        const row = await findStaged(params.id);
        const inspection = await inspectImport(kernel, stagedPath(row.id), {
          passphrase: headers["x-export-passphrase"],
          slug: query.slug,
        });
        return {
          id: row.id,
          fileName: row.file_name,
          sizeBytes: Number(row.size_bytes),
          expiresAt: row.expires_at.toISOString(),
          inspection,
        };
      },
    );

    app.post(
      "/instance/tenant-imports/staged/:id/import",
      {
        config: { access: access.instance("tenant:write") },
        schema: {
          summary: "Import an uploaded export",
          description:
            "As importing directly does, from the file uploaded before. The upload is removed " +
            "once it is imported.",
          tags: ["portability"],
          params: StagedParams,
          querystring: Type.Object({
            slug: Type.Optional(Slug),
            dataLocation: Type.Optional(Type.String()),
          }),
          headers: Type.Object({ "x-export-passphrase": Type.String({ minLength: 1 }) }),
          response: { 201: Type.Object({}, { additionalProperties: true }) },
        },
      },
      async ({ ctx, params, query, headers }, reply) => {
        const row = await findStaged(params.id);
        ctx.mutated = true;
        const report = await importTenant(kernel, ctx.actor, stagedPath(row.id), {
          passphrase: headers["x-export-passphrase"],
          slug: query.slug,
          dataLocation: query.dataLocation,
        });
        await db.deleteFrom("import_staging").where("id", "=", row.id).execute();
        await rm(stagedPath(row.id), { force: true });
        return reply.code(201).send(report);
      },
    );

    app.delete(
      "/instance/tenant-imports/staged/:id",
      {
        config: { access: access.instance("tenant:write") },
        schema: {
          summary: "Throw away an uploaded export",
          tags: ["portability"],
          params: StagedParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("import_staging")
            .where("id", "=", params.id)
            .executeTakeFirst();
          if (Number(removed.numDeletedRows) === 0) throw notFound("That upload");
          await audit({
            action: "tenant_import.discarded",
            targetType: "import",
            targetId: params.id,
          });
        });
        await rm(stagedPath(params.id), { force: true });
        return reply.code(204).send(null);
      },
    );

    // An import is the archive itself as the request body, however large.
    await app.register(async (upload) => {
      upload.removeAllContentTypeParsers();
      upload.addContentTypeParser("*", (_request, payload, done) => done(null, payload));
      upload.withTypeProvider<TypeBoxTypeProvider>().post(
        "/instance/tenant-imports/staged",
        {
          config: { access: access.instance("tenant:write") },
          schema: {
            summary: "Upload an export to look at before importing it",
            description:
              "The file is checked from end to end and kept for an hour. The answer says what it " +
              "holds and whether it can come in: its version, whether the passphrase (if sent) " +
              "opens it, and whether its tenant or slug is taken here. Nothing else is written.",
            tags: ["portability"],
            consumes: ["application/x-tar"],
            querystring: Type.Object({ name: Type.Optional(Type.String({ maxLength: 200 })) }),
            headers: OptionalPassphrase,
            response: { 201: Staged },
          },
        },
        async ({ ctx, body, query, headers }, reply) => {
          await mkdir(STAGE_DIR, { recursive: true });
          const id = newId();
          const path = stagedPath(id);
          let size: number;
          try {
            size = await receive(body, path);
          } catch (error) {
            await rm(path, { force: true });
            throw error;
          }
          const inspection = await inspectImport(kernel, path, {
            passphrase: headers["x-export-passphrase"],
          });
          const expiresAt = new Date(Date.now() + STAGE_HOURS * 3_600_000);
          await ctx.mutate(async (trx, audit) => {
            await trx
              .insertInto("import_staging")
              .values({
                id,
                created_by: ctx.principal.type === "member" ? ctx.principal.id : null,
                file_name: query.name ?? "export.tar",
                size_bytes: size,
                inspection: JSON.stringify(inspection),
                expires_at: expiresAt,
              })
              .execute();
            await audit({
              action: "tenant_import.staged",
              targetType: "import",
              targetId: id,
              details: { bytes: size, tenant: inspection.tenant?.slug ?? null },
            });
          });
          return reply.code(201).send({
            id,
            fileName: query.name ?? "export.tar",
            sizeBytes: size,
            expiresAt: expiresAt.toISOString(),
            inspection,
          });
        },
      );
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
