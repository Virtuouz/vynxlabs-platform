import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { validateJson } from "@vynxlabs/manifest";
import { Type } from "typebox";
import { MAX_FILE_BYTES, readFile, storeFile, toStoredFile } from "../kernel/data/files.js";
import {
  deleteRow,
  findRows,
  getRow,
  insertRows,
  translate,
  updateRow,
} from "../kernel/data/rows.js";
import {
  bindSource,
  checkSourceConfig,
  closeSource,
  openSource,
  type SourceConfig,
  sourceConfigSchema,
  sourceFailure,
  sourceTable,
  sourceTables,
} from "../kernel/data/sources.js";
import { badRequest, notFound } from "../kernel/errors.js";
import { access, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { parseRowsQuery, RowsPage, RowsQuery, toRowsPage, WildParams, wildPath } from "./data.js";
import {
  AnyObject,
  Id,
  isoOrNull,
  NoContent,
  NullableTime,
  Time,
  WorkspaceParams,
} from "./shared.js";

const TableName = Type.String({ pattern: "^[A-Za-z_][A-Za-z0-9_]*$", maxLength: 63 });
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

export function sourceRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    /** Runs something against a bound source, turning its refusals into answers the caller can act on. */
    async function onSource<T>(
      params: { t: string; w: string },
      path: string,
      run: (source: Awaited<ReturnType<typeof openSource>>) => Promise<T>,
    ) {
      try {
        return await run(await openSource(kernel, db, params.t, params.w, path));
      } catch (error) {
        throw sourceFailure(path, translate(error));
      }
    }

    // ----- Bindings -----

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
                  bound: Type.Boolean(),
                  config: Type.Union([AnyObject, Type.Null()]),
                  hasPassword: Type.Boolean(),
                  updatedAt: NullableTime,
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
        const paths = [...new Set([...definitions, ...bindings].map((row) => row.path))].sort();
        return {
          items: paths.map((path) => {
            const definition = definitions.find((row) => row.path === path)?.body as
              | { description?: string }
              | undefined;
            const binding = bindings.find((row) => row.path === path);
            return {
              path,
              description: definition?.description ?? "",
              defined: definition !== undefined,
              bound: binding !== undefined,
              config: binding?.config ?? null,
              hasPassword: Boolean(binding?.credential),
              updatedAt: isoOrNull(binding?.updated_at ?? null),
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
          description: "Leave `password` out to keep the stored one. Send null to remove it.",
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
          const { created } = await bindSource(
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
              passwordChanged: body.password !== undefined,
            },
          });
          const row = await trx
            .selectFrom("data_source_binding")
            .select("id")
            .where("workspace_id", "=", params.w)
            .where("path", "=", path)
            .executeTakeFirstOrThrow();
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
          tags: ["data sources"],
          params: SourceRowParams,
          body: AnyObject,
          response: { 200: AnyObject },
        },
      },
      async ({ ctx, params, body }) => {
        const path = wildPath(params);
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
          tags: ["files"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(StoredFile) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("file")
          .selectAll()
          .where("workspace_id", "=", params.w)
          .orderBy("id", "desc")
          .limit(200)
          .execute();
        return { items: rows.map(toStoredFile) };
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

    app.get(
      `${base}/files/:id`,
      {
        config: { access: access.workspace("file:read") },
        schema: {
          summary: "A file's details",
          tags: ["files"],
          params: FileParams,
          response: { 200: StoredFile },
        },
      },
      async ({ params }) => (await readFile(kernel, db, params.w, params.id)).file,
    );

    app.get(
      `${base}/files/:id/content`,
      {
        config: { access: access.workspace("file:read") },
        schema: {
          summary: "Download a file",
          tags: ["files"],
          params: FileParams,
          response: { 200: Type.Unsafe<Buffer>({ type: "string", format: "binary" }) },
        },
      },
      async ({ params }, reply) => {
        const { file, content } = await readFile(kernel, db, params.w, params.id);
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
          tags: ["files"],
          params: FileParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
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
