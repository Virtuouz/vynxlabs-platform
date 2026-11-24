import { newId } from "@volvel/db";
import {
  checkTable,
  type KindRegistry,
  type QueryBody,
  registerPlatformKinds,
  type TableBody,
  TENANT_FOLDER,
  TENANT_KINDS,
} from "@volvel/manifest";
import type { Trx } from "./audit.js";
import { applyTable, retireTable } from "./data/apply.js";
import { checkQuery, QueryRefused } from "./data/query/parse.js";
import type { DataStores } from "./data/stores.js";
import { badRequest } from "./errors.js";
import { resolveResource } from "./resolve.js";

export interface AppliedResource {
  id: string;
  tenantId: string;
  workspaceId: string;
  path: string;
  body: Record<string, unknown>;
  /** Where the resource is managed, when the caller knows (a removal does). */
  ownership?: string;
}

/**
 * Runs in the same transaction as a resource write, so a stored manifest takes
 * effect atomically. Removal needs no hook: projections reference the resource
 * and are deleted with it.
 */
export interface KindHook {
  apply(trx: Trx, resource: AppliedResource): Promise<void>;
  /** Runs before the resource is deleted, for what a foreign key cannot clean up. */
  remove?(trx: Trx, resource: AppliedResource): Promise<void>;
}

export const INSTANCE_ONLY_ROLE = "operator_admin";

const roleHook: KindHook = {
  async apply(trx, resource) {
    const body = resource.body as { name: string; description?: string; permissions: string[] };
    const values = {
      name: body.name,
      description: body.description ?? "",
      permissions: body.permissions,
    };
    const existing = await trx
      .selectFrom("role")
      .select("id")
      .where("source_resource_id", "=", resource.id)
      .executeTakeFirst();
    if (existing) {
      await trx.updateTable("role").set(values).where("id", "=", existing.id).execute();
    } else {
      await trx
        .insertInto("role")
        .values({
          id: newId(),
          tenant_id: resource.tenantId,
          workspace_id: resource.workspaceId,
          source_resource_id: resource.id,
          ...values,
        })
        .execute();
    }
  },
};

type PrincipalRef =
  | { type: "member"; email: string }
  | { type: "end_user"; email: string }
  | { type: "group" | "service_account" | "end_user_group"; key?: string; name?: string }
  | { type: "anonymous" }
  | { type: "end_users" };

const folderOf = (kind: string) => TENANT_KINDS.find((one) => one.kind === kind)?.folder ?? kind;

const bindingHook: KindHook = {
  async apply(trx, resource) {
    const body = resource.body as { role: string; principal: PrincipalRef; resource?: string };
    const fail = (path: string, message: string) =>
      badRequest("The binding refers to something that does not exist.", [{ path, message }]);

    // The most specific role with that name wins: workspace, then tenant, then built-in.
    const role = await trx
      .selectFrom("role")
      .select(["id", "workspace_id", "tenant_id"])
      .where("name", "=", body.role)
      .where((eb) =>
        eb.or([
          eb("workspace_id", "=", resource.workspaceId),
          eb.and([eb("tenant_id", "=", resource.tenantId), eb("workspace_id", "is", null)]),
          eb("tenant_id", "is", null),
        ]),
      )
      .orderBy("workspace_id", (ob) => ob.asc().nullsLast())
      .orderBy("tenant_id", (ob) => ob.asc().nullsLast())
      .executeTakeFirst();
    if (!role || body.role === INSTANCE_ONLY_ROLE) {
      throw fail("/body/role", `no role named "${body.role}" can be bound in this workspace`);
    }

    let principalId: string | null = null;
    const principal = body.principal;
    if (principal.type === "member") {
      const member = await trx
        .selectFrom("member")
        .innerJoin("tenant_member", "tenant_member.member_id", "member.id")
        .select("member.id")
        .where("member.email", "=", principal.email.toLowerCase())
        .where("tenant_member.tenant_id", "=", resource.tenantId)
        .executeTakeFirst();
      if (!member) throw fail("/body/principal/email", "no member of this tenant has that email");
      principalId = member.id;
    } else if (principal.type === "end_user") {
      const user = await trx
        .selectFrom("end_user")
        .select("id")
        .where("tenant_id", "=", resource.tenantId)
        .where("email", "=", principal.email.toLowerCase())
        .executeTakeFirst();
      if (!user) throw fail("/body/principal/email", "no end user of this tenant has that email");
      principalId = user.id;
    } else if (principal.type !== "anonymous" && principal.type !== "end_users") {
      const table =
        principal.type === "group"
          ? "principal_group"
          : principal.type === "end_user_group"
            ? "end_user_group"
            : "service_account";
      const what = principal.type.replaceAll("_", " ");
      // By its key, which never changes; or by its title, as bindings named it before keys.
      const found = await trx
        .selectFrom(table)
        .select("id")
        .where("tenant_id", "=", resource.tenantId)
        .$if(principal.key !== undefined, (query) =>
          query.where("key", "=", principal.key as string),
        )
        .$if(principal.key === undefined, (query) =>
          query.where("name", "=", principal.name as string),
        )
        .executeTakeFirst();
      if (!found) {
        throw principal.key !== undefined
          ? fail(
              "/body/principal/key",
              `no ${what} has the key "${principal.key}" in this tenant. Add ${TENANT_FOLDER}/${folderOf(principal.type)}/${principal.key}.${principal.type}.yaml to the repository and run \`volvel tenant release\`, or make it in the console`,
            )
          : fail("/body/principal/name", `no ${what} has that name`);
      }
      principalId = found.id;
    }

    let resourceId: string | null = null;
    if (body.resource !== undefined) {
      // By its path, or by one it had before it was renamed: the binding is to the resource.
      const target = (await resolveResource(trx, resource.workspaceId, body.resource))?.resource;
      if (!target) throw fail("/body/resource", "no resource has that path in this workspace");
      resourceId = target.id;
    }

    await trx.deleteFrom("binding").where("source_resource_id", "=", resource.id).execute();
    await trx
      .insertInto("binding")
      .values({
        id: newId(),
        scope_type: resourceId ? "resource" : "workspace",
        tenant_id: resource.tenantId,
        workspace_id: resource.workspaceId,
        resource_id: resourceId,
        principal_type: principal.type,
        principal_id: principalId,
        role_id: role.id,
        source_resource_id: resource.id,
      })
      .execute();
  },
};

export function registerKernelKinds(kinds: KindRegistry, hooks: Map<string, KindHook>) {
  registerPlatformKinds(kinds);
  hooks.set("role", roleHook);
  hooks.set("binding", bindingHook);
}

/**
 * A saved query is read when it is stored, as it will be read when it is run:
 * one SELECT, calling only what is allowed. Whether the tables it names are
 * there is found when it runs, since a deploy may bring a query and its
 * tables together, in either order.
 */
const queryHook: KindHook = {
  async apply(_trx, resource) {
    const body = resource.body as unknown as QueryBody;
    let checked: Awaited<ReturnType<typeof checkQuery>>;
    try {
      checked = await checkQuery(body.sql, { schema: "q", tables: new Set(), anyTable: true });
    } catch (error) {
      if (!(error instanceof QueryRefused)) throw error;
      throw badRequest("The query cannot be saved.", [
        {
          path: error.line ? `/body/sql/${error.line}:${error.column}` : "/body/sql",
          message: error.message,
        },
      ]);
    }
    const declared = body.parameters?.length ?? 0;
    if (checked.parameters !== declared) {
      throw badRequest("The query cannot be saved.", [
        {
          path: "/body/parameters",
          message:
            checked.parameters > declared
              ? `the query uses $${checked.parameters}, and ${declared === 0 ? "no parameters are" : `only ${declared} ${declared === 1 ? "is" : "are"}`} listed`
              : `${declared} ${declared === 1 ? "parameter is" : "parameters are"} listed, and the query uses ${checked.parameters === 0 ? "none" : `only $1 to $${checked.parameters}`}`,
        },
      ]);
    }
    const names = (body.parameters ?? []).map((one) => one.name);
    if (new Set(names).size !== names.length) {
      throw badRequest("The query cannot be saved.", [
        { path: "/body/parameters", message: "two parameters have the same name" },
      ]);
    }
  },
};

/** The hook that makes a table resource's definition real, wherever the tenant's tables live. */
export function registerDataHooks(hooks: Map<string, KindHook>, data: DataStores) {
  hooks.set("query", queryHook);
  hooks.set("table", {
    async apply(trx, resource) {
      // A bundle's tables were checked when it was built. A table saved in the console was not.
      const issues = checkTable(resource.body as unknown as TableBody);
      if (issues.length > 0) throw badRequest("The table's definition is not valid.", issues);
      const { db, store } = await data.within(trx, resource.tenantId);
      await applyTable(db, store.role, resource);
    },
    // The table's data outlives its definition. It is retired, not dropped.
    async remove(trx, resource) {
      const { db } = await data.within(trx, resource.tenantId);
      await retireTable(db, resource);
    },
  });
}
