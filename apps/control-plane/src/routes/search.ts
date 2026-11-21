import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import { Type } from "typebox";
import { TAG_PATTERN } from "../kernel/execution/runs.js";
import type { RequestContext } from "../kernel/http.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id, NoContent, NullableString } from "./shared.js";

/** What each kind of resource is read with: the permission its own list asks for. */
const READ: Record<string, string> = {
  script: "script:read",
  flow: "flow:read",
  app: "app:read",
  interface: "interface:read",
  table: "table:read",
  trigger: "trigger:read",
  schedule: "trigger:read",
  connection: "connection:read",
  event: "event:read",
  doc: "doc:read",
};
const KINDS = Object.keys(READ);
const RUN_KINDS = ["run", "flow_run"];

const Result = Type.Object({
  kind: Type.String({
    description: "A resource's kind, `run`, `flow_run`, `member` or `end_user`.",
  }),
  id: Type.String(),
  ref: Type.String({ description: "A resource's path, or a run's or a person's ID." }),
  workspaceId: Type.Union([Id, Type.Null()]),
  workspaceSlug: NullableString,
  title: Type.String(),
  hint: NullableString,
});

/** `%`, `_` and `\` mean something to LIKE: matched as themselves. */
const literal = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/** The lowest and highest UUIDs that start with these hex digits, for a range on the key. */
function idRange(prefix: string): [string, string] | undefined {
  const hex = prefix.toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{8,32}$/.test(hex)) return undefined;
  const form = (digits: string) =>
    `${digits.slice(0, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}-${digits.slice(16, 20)}-${digits.slice(20, 32)}`;
  return [form(hex.padEnd(32, "0")), form(hex.padEnd(32, "f"))];
}

/** Whether a member may read a kind in a workspace: once per workspace and kind, not per row. */
function allowance(ctx: RequestContext, tenantId: string) {
  const known = new Map<string, Promise<boolean>>();
  return (permission: string, workspaceId: string, resourceId?: string) => {
    const key = `${permission}:${workspaceId}:${resourceId ?? ""}`;
    let answer = known.get(key);
    if (!answer) {
      answer = ctx.allowed(permission, {
        tenantId,
        workspaceId,
        ...(resourceId ? { resourceId } : {}),
      });
      known.set(key, answer);
    }
    return answer;
  };
}

/** Finding things by name, from the command palette, and what a member opened last. */
export function searchRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.get(
      "/tenants/:t/search",
      {
        config: { access: access.custom },
        schema: {
          summary: "Find resources, runs and people by name",
          description:
            "Resources by path (`#`), runs and flow runs by ID, an ID's first 8 characters or " +
            "a tag (`>`), and with `people`, members and end users by name or email (`@`). " +
            "Only what the caller may read; the current workspace first.",
          tags: ["identity"],
          params: Type.Object({ t: Id }),
          querystring: Type.Object({
            q: Type.String({ maxLength: 200 }),
            workspace: Type.Optional(Id),
            only: Type.Optional(
              Type.Union([Type.Literal("resources"), Type.Literal("runs"), Type.Literal("people")]),
            ),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
          }),
          response: { 200: Type.Object({ items: Type.Array(Result) }) },
        },
      },
      async ({ ctx, params, query }) => {
        const principal = ctx.principal;
        if (principal.type !== "member" && principal.type !== "service_account") {
          return { items: [] };
        }
        const q = query.q.trim();
        const limit = query.limit ?? 20;
        if (q === "") return { items: [] };
        const may = allowance(ctx, params.t);
        const workspaces = await db
          .selectFrom("workspace")
          .select(["id", "slug"])
          .where("tenant_id", "=", params.t)
          .execute();
        const slugOf = new Map(workspaces.map((one) => [one.id, one.slug]));
        const items: {
          kind: string;
          id: string;
          ref: string;
          workspaceId: string | null;
          workspaceSlug: string | null;
          title: string;
          hint: string | null;
        }[] = [];

        if (query.only === "people") {
          const term = `%${literal(q)}%`;
          if (await ctx.allowed("member:read", { tenantId: params.t })) {
            const members = await db
              .selectFrom("tenant_member")
              .innerJoin("member", "member.id", "tenant_member.member_id")
              .select(["member.id", "member.name", "member.email"])
              .where("tenant_member.tenant_id", "=", params.t)
              .where((eb) =>
                eb.or([eb("member.name", "ilike", term), eb("member.email", "ilike", term)]),
              )
              .orderBy("member.name")
              .limit(limit)
              .execute();
            for (const one of members) {
              items.push({
                kind: "member",
                id: one.id,
                ref: one.id,
                workspaceId: null,
                workspaceSlug: null,
                title: one.name ?? one.email,
                hint: one.email,
              });
            }
          }
          if (await ctx.allowed("end_user:read", { tenantId: params.t })) {
            const people = await db
              .selectFrom("end_user")
              .select(["id", "name", "email"])
              .where("tenant_id", "=", params.t)
              .where((eb) => eb.or([eb("name", "ilike", term), eb("email", "ilike", term)]))
              .orderBy("name")
              .limit(limit)
              .execute();
            for (const one of people) {
              items.push({
                kind: "end_user",
                id: one.id,
                ref: one.id,
                workspaceId: null,
                workspaceSlug: null,
                title: one.name ?? one.email,
                hint: one.email,
              });
            }
          }
          return { items: items.slice(0, limit) };
        }

        if (query.only !== "resources") {
          // A run by its ID, or the first 8 or more characters of it, or by a tag.
          const range = idRange(q);
          const tag = TAG_PATTERN.test(q.replace(/^tag:/, "")) ? q.replace(/^tag:/, "") : undefined;
          if (range || (tag && q.startsWith("tag:"))) {
            const found = await sql<{
              kind: "run" | "flow_run";
              id: string;
              workspace_id: string;
              name: string;
              status: string;
            }>`
              select * from (
                select 'run' as kind, id, workspace_id, script_path as name, status::text as status
                from run where tenant_id = ${params.t}
                  and ${range ? sql`id between ${range[0]}::uuid and ${range[1]}::uuid` : sql`tags @> array[${tag}]::text[]`}
                union all
                select 'flow_run' as kind, id, workspace_id, flow_path as name, status::text as status
                from flow_run where tenant_id = ${params.t}
                  and ${range ? sql`id between ${range[0]}::uuid and ${range[1]}::uuid` : sql`tags @> array[${tag}]::text[]`}
              ) as found order by id desc limit ${limit}
            `.execute(db);
            for (const row of found.rows) {
              const permission = row.kind === "run" ? "run:read" : "flow_run:read";
              if (!(await may(permission, row.workspace_id))) continue;
              items.push({
                kind: row.kind,
                id: row.id,
                ref: row.id,
                workspaceId: row.workspace_id,
                workspaceSlug: slugOf.get(row.workspace_id) ?? null,
                title: row.name,
                hint: `${row.kind === "run" ? "Run" : "Flow run"} · ${row.status}`,
              });
            }
          }
          if (query.only === "runs") return { items: items.slice(0, limit) };
        }

        // Resources by path: exact, then from the start, then anywhere; this workspace first.
        const term = literal(q.toLowerCase());
        const current = query.workspace ?? "00000000-0000-0000-0000-000000000000";
        const rows = await sql<{
          id: string;
          workspace_id: string;
          kind: string;
          path: string;
          description: string | null;
        }>`
          select id, workspace_id, kind, path, body->>'description' as description from resource
          where tenant_id = ${params.t} and kind in (${sql.join(KINDS)})
            and lower(path) like ${`%${term}%`}
          order by (workspace_id = ${current}::uuid) desc, (lower(path) = ${term}) desc,
            (lower(path) like ${`${term}%`}) desc, length(path), path
          limit ${limit * 4}
        `.execute(db);
        for (const row of rows.rows) {
          if (items.length >= limit) break;
          const permission = READ[row.kind] as string;
          const readable =
            (await may(permission, row.workspace_id)) ||
            (row.kind === "interface" && (await may("resource:read", row.workspace_id))) ||
            // Someone bound to the resource alone may still read it.
            (await may(permission, row.workspace_id, row.id));
          if (!readable) continue;
          items.push({
            kind: row.kind,
            id: row.id,
            ref: row.path,
            workspaceId: row.workspace_id,
            workspaceSlug: slugOf.get(row.workspace_id) ?? null,
            title: row.path,
            hint: row.description,
          });
        }
        return { items: items.slice(0, limit) };
      },
    );

    const RecentItem = Type.Object({
      kind: Type.String(),
      ref: Type.String(),
      workspaceId: Id,
      workspaceSlug: Type.String(),
      title: Type.String(),
      visitedAt: Type.String(),
    });

    app.get(
      "/me/recent-items",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "What the caller opened last in a tenant",
          description: "Newest first. What is gone, or no longer readable, is left out.",
          tags: ["identity"],
          querystring: Type.Object({ tenant: Id }),
          response: { 200: Type.Object({ items: Type.Array(RecentItem) }) },
        },
      },
      async ({ ctx, query }) => {
        if (ctx.principal.type !== "member" || !ctx.principal.id) return { items: [] };
        const may = allowance(ctx, query.tenant);
        const rows = await db
          .selectFrom("member_recent_item")
          .innerJoin("workspace", "workspace.id", "member_recent_item.workspace_id")
          .select([
            "member_recent_item.kind",
            "member_recent_item.ref",
            "member_recent_item.workspace_id",
            "member_recent_item.visited_at",
            "workspace.slug",
          ])
          .where("member_recent_item.member_id", "=", ctx.principal.id)
          .where("member_recent_item.tenant_id", "=", query.tenant)
          .orderBy("member_recent_item.visited_at", "desc")
          .limit(20)
          .execute();
        const items = [];
        for (const row of rows) {
          if (RUN_KINDS.includes(row.kind)) {
            const table = row.kind === "run" ? "run" : "flow_run";
            const run = await sql<{ name: string }>`
              select ${sql.raw(table === "run" ? "script_path" : "flow_path")} as name
              from ${sql.table(table)} where id = ${row.ref}::uuid and workspace_id = ${row.workspace_id}
            `.execute(db);
            const name = run.rows[0]?.name;
            if (!name) continue;
            if (!(await may(row.kind === "run" ? "run:read" : "flow_run:read", row.workspace_id)))
              continue;
            items.push({
              kind: row.kind,
              ref: row.ref,
              workspaceId: row.workspace_id,
              workspaceSlug: row.slug,
              title: name,
              visitedAt: row.visited_at.toISOString(),
            });
            continue;
          }
          const resource = await db
            .selectFrom("resource")
            .select("id")
            .where("workspace_id", "=", row.workspace_id)
            .where("kind", "=", row.kind)
            .where("path", "=", row.ref)
            .executeTakeFirst();
          if (!resource) continue;
          const permission = READ[row.kind] as string;
          if (
            !(await may(permission, row.workspace_id)) &&
            !(await may(permission, row.workspace_id, resource.id))
          ) {
            continue;
          }
          items.push({
            kind: row.kind,
            ref: row.ref,
            workspaceId: row.workspace_id,
            workspaceSlug: row.slug,
            title: row.ref,
            visitedAt: row.visited_at.toISOString(),
          });
        }
        return { items };
      },
    );

    app.put(
      "/me/recent-items",
      {
        config: { access: access.signedIn, preference: true },
        schema: {
          summary: "Remember something the caller opened",
          description: "For the command palette. A preference of the caller's own: no audit entry.",
          tags: ["identity"],
          body: Type.Object({
            tenantId: Id,
            workspaceId: Id,
            kind: Type.Union([...KINDS, ...RUN_KINDS].map((kind) => Type.Literal(kind))),
            ref: Type.String({ minLength: 1, maxLength: 255 }),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, body }, reply) => {
        const memberId = ctx.principal.type === "member" ? ctx.principal.id : null;
        const workspace = memberId
          ? await db
              .selectFrom("workspace")
              .innerJoin("tenant_member", "tenant_member.tenant_id", "workspace.tenant_id")
              .select("workspace.id")
              .where("workspace.id", "=", body.workspaceId)
              .where("workspace.tenant_id", "=", body.tenantId)
              .where("tenant_member.member_id", "=", memberId)
              .executeTakeFirst()
          : undefined;
        if (!memberId || !workspace) {
          // Nothing is kept for someone who is not a member there: nothing changed.
          ctx.mutated = true;
          return reply.code(204).send(null);
        }
        await ctx.keepPreference(async (keep) => {
          await keep
            .insertInto("member_recent_item")
            .values({
              member_id: memberId,
              tenant_id: body.tenantId,
              workspace_id: body.workspaceId,
              kind: body.kind,
              ref: body.ref,
            })
            .onConflict((c) =>
              c
                .columns(["member_id", "tenant_id", "workspace_id", "kind", "ref"])
                .doUpdateSet({ visited_at: new Date() }),
            )
            .execute();
          // The newest twenty are kept.
          await sql`
            delete from member_recent_item where (member_id, tenant_id, workspace_id, kind, ref) in (
              select member_id, tenant_id, workspace_id, kind, ref from member_recent_item
              where member_id = ${memberId} and tenant_id = ${body.tenantId}
              order by visited_at desc offset 20
            )
          `.execute(keep);
        });
        return reply.code(204).send(null);
      },
    );
  };
}
