import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import { validateJson } from "@volvel/manifest";
import { Type } from "typebox";
import { CredentialSet, credentialSetters } from "../kernel/credentials.js";
import {
  MAX_FILE_BYTES,
  mayReadFile,
  namedFiles,
  namingOf,
  readFile,
  storeFile,
  toStoredFile,
} from "../kernel/data/files.js";
import { checkSource, forgetHealth } from "../kernel/data/health.js";
import { deleteRow, findRows, getRow, insertRows, updateRow } from "../kernel/data/rows.js";
import {
  bindSource,
  checkSourceConfig,
  closeSource,
  onSource as runOnSource,
  type SourceConfig,
  sourceConfigSchema,
  sourceTable,
  sourceTables,
} from "../kernel/data/sources.js";
import { badRequest, conflict, notFound } from "../kernel/errors.js";
import { arrivingManifests } from "../kernel/execution/arriving.js";
import { access, type RequestContext, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { UUID } from "../kernel/pages/locate.js";
import { likeTerm, listOf, pageOf, SearchPageQuery } from "../pagination.js";
import { parseRowsQuery, RowsPage, RowsQuery, toRowsPage, WildParams, wildPath } from "./data.js";
import {
  AnyObject,
  Id,
  isoOrNull,
  NoContent,
  NullableTime,
  pageArgs,
  Time,
  toPage,
  WorkspaceParams,
} from "./shared.js";

/** A table of the source as the source names it: it is looked up in the source's own list before it is used. */
const TableName = Type.String({ minLength: 1, maxLength: 63 });
const SourceRowsParams = Type.Object({ t: Id, w: Id, table: TableName, "*": Type.String() });
const SourceRowParams = Type.Object({
  t: Id,
  w: Id,
  table: TableName,
  key: Type.String({ maxLength: 200 }),
  "*": Type.String(),
});

const StoredFile = Type.Object({
  id: Id,
  name: Type.String(),
  contentType: Type.String(),
  sizeBytes: Type.Integer(),
  createdAt: Time,
});

/** A file as the list gives it: with the tables whose rows hold it. */
const ListedFile = Type.Object({
  ...StoredFile.properties,
  namedBy: Type.Array(
    Type.Object({
      table: Type.String(),
      column: Type.String(),
      rows: Type.Union([Type.Integer(), Type.Null()], {
        description: "How many rows hold it. Null when the table could not be read just now.",
      }),
    }),
    { description: "The tables whose rows name the file. Empty when no row does." },
  ),
});

export function sourceRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    /** Runs something against a bound source, turning its refusals into answers the caller can act on. */
    const onSource = <T>(
      params: { t: string; w: string },
      path: string,
      run: Parameters<typeof runOnSource<T>>[4],
    ) => runOnSource(kernel, db, { tenantId: params.t, workspaceId: params.w }, path, run);

    // ----- Bindings -----

    app.post(
      `${base}/data-source-checks/*`,
      {
        config: { access: access.workspace("data_source:read") },
        schema: {
          summary: "Reach a bound data source now, and keep how it went",
          description:
            "Asks the source the smallest question there is. An unreachable source is an " +
            "answer with `ok` false, not an error.",
          tags: ["data sources"],
          params: WildParams,
          response: {
            200: Type.Object({
              ok: Type.Boolean(),
              problem: Type.Union([Type.String(), Type.Null()]),
              latencyMs: Type.Union([Type.Integer(), Type.Null()]),
              checkedAt: Time,
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const path = wildPath(params);
        const bound = await db
          .selectFrom("data_source_binding")
          .select("id")
          .where("workspace_id", "=", params.w)
          .where("path", "=", path)
          .executeTakeFirst();
        if (!bound) throw notFound("A binding for the data source");
        const result = await checkSource(kernel, params.t, params.w, path);
        await ctx.mutate(async (_trx, audit) =>
          audit({
            action: "data_source.checked",
            targetType: "data_source",
            targetId: null,
            tenantId: params.t,
            workspaceId: params.w,
            details: { path, ok: result.ok },
          }),
        );
        return result;
      },
    );

    app.get(
      `${base}/data-source-bindings`,
      {
        config: { access: access.workspace("data_source:read") },
        schema: {
          summary: "External data sources in a workspace and where each one points",
          description: "A password is never returned, only whether one is set.",
          tags: ["data sources"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  description: Type.String(),
                  defined: Type.Boolean(),
                  arrives: Type.Boolean({
                    description:
                      "Declared by a workspace linked to this one, and not deployed here yet: it " +
                      "arrives with the next promotion, and can be bound here before.",
                  }),
                  bound: Type.Boolean(),
                  config: Type.Union([AnyObject, Type.Null()]),
                  hasPassword: Type.Boolean(),
                  ...CredentialSet,
                  updatedAt: NullableTime,
                  health: Type.Union([
                    Type.Object(
                      {
                        ok: Type.Boolean(),
                        problem: Type.Union([Type.String(), Type.Null()]),
                        latencyMs: Type.Union([Type.Integer(), Type.Null()]),
                        checkedAt: Time,
                      },
                      { description: "The last time it was reached, on a schedule or on request." },
                    ),
                    Type.Null(),
                  ]),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const definitions = await db
          .selectFrom("resource")
          .select(["path", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "data_source")
          .execute();
        const bindings = await db
          .selectFrom("data_source_binding")
          .selectAll()
          .where("workspace_id", "=", params.w)
          .execute();
        const setBy = await credentialSetters(db, bindings);
        // What the next promotion brings, which production is set up for before it arrives.
        const arrives = (await arrivingManifests(kernel, db, params.w)).filter(
          (one) => one.kind === "data_source" && !definitions.some((row) => row.path === one.path),
        );
        const paths = [
          ...new Set([...definitions, ...bindings, ...arrives].map((row) => row.path)),
        ].sort();
        const checks = await db
          .selectFrom("health_check")
          .selectAll()
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "data_source")
          .execute();
        return {
          items: paths.map((path) => {
            const coming = arrives.find((row) => row.path === path);
            const definition = (definitions.find((row) => row.path === path)?.body ??
              coming?.body) as { description?: string } | undefined;
            const binding = bindings.find((row) => row.path === path);
            const check = binding ? checks.find((row) => row.path === path) : undefined;
            return {
              path,
              description: definition?.description ?? "",
              defined: definitions.some((row) => row.path === path),
              arrives: coming !== undefined,
              bound: binding !== undefined,
              config: binding?.config ?? null,
              hasPassword: Boolean(binding?.credential),
              ...setBy(binding),
              updatedAt: isoOrNull(binding?.updated_at ?? null),
              health: check
                ? {
                    ok: check.ok,
                    problem: check.problem,
                    latencyMs: check.latency_ms,
                    checkedAt: check.checked_at.toISOString(),
                  }
                : null,
            };
          }),
        };
      },
    );

    app.put(
      `${base}/data-source-bindings/*`,
      {
        config: { access: access.workspace("data_source:write") },
        schema: {
          summary: "Bind an external Postgres database in this workspace",
          description:
            "Leave `password` out to keep the stored one, when the host, port and user are the same and encryption is not turned off; otherwise the stored one is dropped, and `hasPassword` is then false. Send null to remove it.",
          tags: ["data sources"],
          params: WildParams,
          body: Type.Object({
            config: AnyObject,
            password: Type.Optional(
              Type.Union([Type.String({ minLength: 1, maxLength: 1000 }), Type.Null()]),
            ),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const path = wildPath(params);
        checkSourceConfig(validateJson(sourceConfigSchema, body.config, "/body/config"));
        const config = body.config as unknown as SourceConfig;
        const bindingId = await ctx.mutate(async (trx, audit) => {
          const { created, credentialDropped } = await bindSource(
            kernel,
            trx,
            { tenantId: params.t, workspaceId: params.w, path },
            config,
            body.password,
          );
          await audit({
            action: created ? "data_source.bound" : "data_source.rebound",
            targetType: "data_source",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
            // Where it points is recorded. The password never is.
            details: {
              host: config.host,
              database: config.database,
              user: config.user,
              passwordChanged: body.password !== undefined || credentialDropped,
            },
          });
          const row = await trx
            .selectFrom("data_source_binding")
            .select("id")
            .where("workspace_id", "=", params.w)
            .where("path", "=", path)
            .executeTakeFirstOrThrow();
          // What a check found says nothing about the address or password it did not try.
          await forgetHealth(trx, params.w, path, "data_source");
          return row.id;
        });
        await closeSource(bindingId);
        return reply.code(204).send(null);
      },
    );

    app.delete(
      `${base}/data-source-bindings/*`,
      {
        config: { access: access.workspace("data_source:write") },
        schema: {
          summary: "Remove a data source's binding",
          description: "The data source is no longer bound in this workspace. Audited.",
          tags: ["data sources"],
          params: WildParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const path = wildPath(params);
        const removed = await ctx.mutate(async (trx, audit) => {
          const row = await trx
            .deleteFrom("data_source_binding")
            .where("workspace_id", "=", params.w)
            .where("path", "=", path)
            .returning("id")
            .executeTakeFirst();
          if (!row) throw notFound("The data source binding");
          await forgetHealth(trx, params.w, path, "data_source");
          await audit({
            action: "data_source.unbound",
            targetType: "data_source",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
          });
          return row.id;
        });
        await closeSource(removed);
        return reply.code(204).send(null);
      },
    );

    // ----- A source's tables and rows -----

    app.get(
      `${base}/data-source-tables/*`,
      {
        config: { access: access.workspace("data_source:read") },
        schema: {
          summary: "The tables of a bound data source",
          description: "The tables the data source lists, read from the source itself.",
          tags: ["data sources"],
          params: WildParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  name: Type.String(),
                  key: Type.Union([Type.String(), Type.Null()], {
                    description:
                      "The column that identifies a row. Without one, rows cannot be changed.",
                  }),
                  columns: Type.Array(
                    Type.Object({
                      name: Type.String(),
                      type: Type.String(),
                      required: Type.Boolean(),
                      writable: Type.Boolean(),
                    }),
                  ),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const path = wildPath(params);
        const tables = await onSource(params, path, (source) =>
          sourceTables(source.db, source.schema),
        );
        return {
          items: tables.map((table) => ({
            name: table.name,
            key: table.key,
            columns: table.columns.map(({ name, type, required, writable }) => ({
              name,
              type,
              required,
              writable,
            })),
          })),
        };
      },
    );

    app.get(
      `${base}/source-rows/:table/*`,
      {
        config: { access: access.workspace("data_source:read") },
        schema: {
          summary: "Rows of a table in a data source",
          description: "Rows read from the source system, a page at a time.",
          tags: ["data sources"],
          params: SourceRowsParams,
          querystring: RowsQuery,
          response: { 200: RowsPage },
        },
      },
      async ({ params, query }) => {
        const path = wildPath(params);
        const asked = parseRowsQuery(query);
        return toRowsPage(
          await onSource(params, path, async (source) =>
            findRows(
              source.db,
              await sourceTable(source.db, source.schema, path, params.table),
              asked,
            ),
          ),
        );
      },
    );

    app.post(
      `${base}/source-rows/:table/*`,
      {
        config: { access: access.workspace("data_source:write") },
        schema: {
          summary: "Insert rows into a table in a data source",
          description: "Writes to the source system, if the binding lets it. Not written to the audit log: the rows are the source system's, not the platform's.",
          tags: ["data sources"],
          params: SourceRowsParams,
          body: AnyObject,
          response: { 201: Type.Object({ items: Type.Array(AnyObject) }) },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const path = wildPath(params);
        const rows =
          Array.isArray(body.rows) && Object.keys(body).length === 1
            ? (body.rows as unknown[])
            : [body];
        if (rows.length === 0 || rows.length > 1000)
          throw badRequest("Send between 1 and 1,000 rows.");
        const items = await onSource(params, path, async (source) =>
          insertRows(
            source.db,
            await sourceTable(source.db, source.schema, path, params.table),
            rows,
            { principalId: null, all: true },
          ),
        );
        ctx.mutated = true;
        return reply.code(201).send({ items });
      },
    );

    app.get(
      `${base}/source-row/:table/:key/*`,
      {
        config: { access: access.workspace("data_source:read") },
        schema: {
          summary: "One row of a table in a data source",
          description: "The row with the given key, read from the source system.",
          tags: ["data sources"],
          params: SourceRowParams,
          response: { 200: AnyObject },
        },
      },
      async ({ params }) => {
        const path = wildPath(params);
        return onSource(params, path, async (source) =>
          getRow(
            source.db,
            await sourceTable(source.db, source.schema, path, params.table),
            params.key,
          ),
        );
      },
    );

    app.patch(
      `${base}/source-row/:table/:key/*`,
      {
        config: { access: access.workspace("data_source:write") },
        schema: {
          summary: "Change a row in a data source",
          description: "Writes to the source system, if the binding lets it. Not written to the audit log: the rows are the source system's, not the platform's.",
          tags: ["data sources"],
          params: SourceRowParams,
          body: AnyObject,
          response: { 200: AnyObject },
        },
      },
      async ({ ctx, params, body }) => {
        const path = wildPath(params);
        // Not updateRowKeepingFiles: a source table has no file column. `platformType`
        // (kernel/data/sources.ts) maps a source's column types to text, number, json and the
        // like, never "file", and the files Volvel stores are named only by a workspace table's
        // file column. A source's own file reference is plain text to Volvel, not a file it keeps.
        const row = await onSource(params, path, async (source) =>
          updateRow(
            source.db,
            await sourceTable(source.db, source.schema, path, params.table),
            params.key,
            body,
          ),
        );
        ctx.mutated = true;
        return row;
      },
    );

    app.delete(
      `${base}/source-row/:table/:key/*`,
      {
        config: { access: access.workspace("data_source:write") },
        schema: {
          summary: "Delete a row in a data source",
          description: "Deletes in the source system, if the binding lets it. Not written to the audit log: the rows are the source system's, not the platform's.",
          tags: ["data sources"],
          params: SourceRowParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const path = wildPath(params);
        await onSource(params, path, async (source) =>
          deleteRow(
            source.db,
            await sourceTable(source.db, source.schema, path, params.table),
            params.key,
          ),
        );
        ctx.mutated = true;
        return reply.code(204).send(null);
      },
    );

    // ----- Files -----

    app.get(
      `${base}/files`,
      {
        config: { access: access.workspace("file:read") },
        schema: {
          summary: "Files stored in a workspace, newest first",
          description:
            "Every file of the workspace, so it also needs `data_all:read`. A person who only has `file:read` gets a file by its ID, through a row they may read or because they uploaded it. " +
            "Each file says which tables name it (`namedBy`): a file that a row names cannot be deleted. " +
            "`nextCursor` is given while there are more: send it back as `cursor`. `search` matches anywhere in the name.",
          tags: ["files"],
          params: WorkspaceParams,
          querystring: SearchPageQuery,
          response: { 200: pageOf(ListedFile) },
        },
      },
      async ({ ctx, params, query }) => {
        await ctx.authorize("data_all:read", { tenantId: params.t, workspaceId: params.w });
        const args = pageArgs(query);
        if (args.after !== undefined && !UUID.test(args.after)) {
          throw badRequest("The cursor is not valid.");
        }
        let found = db.selectFrom("file").selectAll().where("workspace_id", "=", params.w);
        if (args.after) found = found.where("id", "<", args.after);
        if (query.search) found = found.where(sql`lower(name)`, "like", likeTerm(query.search));
        const rows = await found
          .orderBy("id", "desc")
          .limit(args.limit + 1)
          .execute();
        const naming = await namingOf(
          kernel,
          params.t,
          rows.slice(0, args.limit).map((row) => row.id),
          params.w,
        );
        return toPage(
          rows,
          args,
          (row) => row.id,
          (row) => ({ ...toStoredFile(row), namedBy: naming.get(row.id) ?? [] }),
        );
      },
    );

    // Uploads are the file's bytes as they are, whatever their type.
    await app.register(async (upload) => {
      upload.removeAllContentTypeParsers();
      upload.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) =>
        done(null, body),
      );
      upload.withTypeProvider<TypeBoxTypeProvider>().post(
        `${base}/files`,
        {
          bodyLimit: MAX_FILE_BYTES,
          config: { access: access.workspace("file:write") },
          schema: {
            summary: "Upload a file",
            description:
              "The request body is the file. Its type comes from the Content-Type header, its name from `name`.",
            tags: ["files"],
            consumes: ["application/octet-stream"],
            // Read as bytes, as sent: the schema says only that a body is taken.
            body: Type.Unknown(),
            params: WorkspaceParams,
            querystring: Type.Object({ name: Type.String({ minLength: 1, maxLength: 255 }) }),
            response: { 201: StoredFile },
          },
        },
        async ({ ctx, params, query, body, headers }, reply) => {
          const content = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
          if (content.length === 0)
            throw badRequest("The request has no body. Send the file's bytes.");
          const workspace = ctx.workspace as WorkspaceRef;
          const file = await ctx.mutate(async (trx, audit) => {
            const stored = await storeFile(kernel, trx, workspace, ctx.principal, {
              name: query.name,
              contentType: headers["content-type"] ?? "application/octet-stream",
              content,
            });
            await audit({
              action: "file.uploaded",
              targetType: "file",
              targetId: stored.id,
              tenantId: params.t,
              workspaceId: params.w,
              details: { name: stored.name, sizeBytes: stored.sizeBytes },
            });
            return stored;
          });
          return reply.code(201).send(file);
        },
      );
    });

    const FileParams = Type.Object({ t: Id, w: Id, id: Id });

    async function mayReadOrNotFound(
      ctx: RequestContext,
      params: { t: string; w: string },
      found: Awaited<ReturnType<typeof readFile>>,
    ) {
      const allowed = await mayReadFile(
        kernel,
        ctx,
        { tenantId: params.t, id: params.w },
        { id: found.file.id, createdBy: found.createdBy },
      );
      if (!allowed) throw notFound("The file");
    }

    app.get(
      `${base}/files/:id`,
      {
        config: { access: access.workspace("file:read") },
        schema: {
          summary: "A file's details",
          description:
            "A file the caller uploaded, or one that a row they may read names. Any other file is answered as not found. `data_all:read` gives every file.",
          tags: ["files"],
          params: FileParams,
          response: { 200: StoredFile },
        },
      },
      async ({ ctx, params }) => {
        const found = await readFile(kernel, db, params.w, params.id);
        await mayReadOrNotFound(ctx, params, found);
        return found.file;
      },
    );

    app.get(
      `${base}/files/:id/content`,
      {
        config: { access: access.workspace("file:read") },
        schema: {
          summary: "Download a file",
          description:
            "A file the caller uploaded, or one that a row they may read names. Any other file is answered as not found. `data_all:read` gives every file.",
          tags: ["files"],
          params: FileParams,
          response: { 200: Type.Unsafe<Buffer>({ type: "string", format: "binary" }) },
        },
      },
      async ({ ctx, params }, reply) => {
        const found = await readFile(kernel, db, params.w, params.id);
        await mayReadOrNotFound(ctx, params, found);
        const { file, content } = found;
        return (
          reply
            .header("content-type", file.contentType)
            // Never let a stored file be rendered as a page from the platform's own address.
            .header(
              "content-disposition",
              `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            )
            .header("x-content-type-options", "nosniff")
            .send(content)
        );
      },
    );

    app.delete(
      `${base}/files/:id`,
      {
        config: { access: access.workspace("file:write") },
        schema: {
          summary: "Delete a file",
          description:
            "Needs `file:write` and `data_all:write`. Refused while a row names the file: change or delete the row first. A file that rows named before is kept for the audit log's period and goes with its history.",
          tags: ["files"],
          params: FileParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.authorize("data_all:write", { tenantId: params.t, workspaceId: params.w });
        const naming = await namedFiles(kernel, params.t, [params.id], params.w);
        if (naming.has(params.id)) {
          throw conflict(
            "A row still names this file. Change the row to another file or none, or delete the row, and then delete the file.",
          );
        }
        const key = await ctx.mutate(async (trx, audit) => {
          const row = await trx
            .deleteFrom("file")
            .where("id", "=", params.id)
            .where("workspace_id", "=", params.w)
            .returning(["storage_key", "name"])
            .executeTakeFirst();
          if (!row) throw notFound("The file");
          await audit({
            action: "file.deleted",
            targetType: "file",
            targetId: params.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: { name: row.name },
          });
          return row.storage_key;
        });
        await kernel.storage
          .remove(key)
          .catch((error) =>
            kernel.log.warn({ err: error, key }, "a deleted file's bytes could not be removed"),
          );
        return reply.code(204).send(null);
      },
    );
  };
}
