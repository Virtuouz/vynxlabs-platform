import { createHash } from "node:crypto";
import { newId, sql, type TenantResource } from "@volvel/db";
import { checkTenantResources, tenantName, tenantOrder } from "@volvel/manifest";
import { keepingAnAdmin } from "../administer.js";
import type { Audit, Db, Principal, Trx } from "../audit.js";
import { badRequest, conflict, forbiddenBecause, HttpError, notFound } from "../errors.js";

/**
 * A tenant's access, released: its groups, service accounts, roles and what
 * they are given, changed as one reviewed set.
 *
 * The tables the rest of the platform reads stay the truth. A release is a
 * change to them, worked out by setting what is asked for against what is
 * there, and it keeps what it asked for and what the set was once it applied.
 * So the console and a repository change the same things, and either can be
 * read back as the other writes it.
 */

/**
 * Releases that applied in a transaction that may not have committed yet, to be
 * committed to the tenant's branch once it has. Kept by release, so that one
 * request never takes another's before it is there to see. One that was taken
 * back, such as a plan, is forgotten after a minute.
 */
const applied = new Map<
  string,
  { tenantId: string; number: number; message: string | null; at: number }
>();

/** The releases that have committed since they applied, each handed out once. */
export async function takeReleased(db: Db) {
  const ready: { tenantId: string; number: number; message: string | null }[] = [];
  for (const [id, release] of applied) {
    if (Date.now() - release.at > 60_000) {
      applied.delete(id);
      continue;
    }
    const there = await db
      .selectFrom("tenant_release")
      .select("id")
      .where("id", "=", id)
      .where("status", "=", "applied")
      .executeTakeFirst();
    if (!there) continue;
    applied.delete(id);
    ready.push(release);
  }
  return ready;
}

/** A role a tenant can never bind: it runs the instance. */
const INSTANCE_ONLY_ROLE = "operator_admin";

type PrincipalKind = "group" | "service_account" | "end_user_group";
const TABLE = {
  group: "principal_group",
  end_user_group: "end_user_group",
  service_account: "service_account",
} as const;

export interface AccessChange {
  change: "created" | "updated" | "deleted";
  kind: string;
  key: string;
  /** What people read: the title, or for a binding, what it gives to whom. */
  label: string;
}

export interface AccessSummary {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  changes: AccessChange[];
  /** What the release went ahead with and whoever released should know. */
  warnings: string[];
}

/** One thing asked for: a resource as it should be, or one that should go. */
export type AccessAsk =
  | { op: "put"; resource: TenantResource }
  | { op: "delete"; kind: string; key: string }
  /** The resource, named by what it is, should not be there. For a binding, which is its content. */
  | { op: "put-absent"; resource: TenantResource };

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, field]) => field !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, field]) => [key, sorted(field)]),
    );
  }
  return value;
}

/** The whole of a tenant's access in one short text: the same set gives the same text. */
const fingerprint = (resources: readonly TenantResource[]): string =>
  createHash("sha256")
    .update(JSON.stringify(sorted(resources)))
    .digest("hex");

/** What a plan comes to: each thing to make or change, and each to remove. */
type Step = Exclude<AccessAsk, { op: "put-absent" }>;

/** A binding is what it gives to whom, and where. Its key in a file is only a name for that. */
const bindingIdentity = (body: Record<string, unknown>): string => {
  const principal = body.principal as { type: string; key: string };
  return `${body.role}\n${principal.type}\n${principal.key}\n${body.workspace ?? ""}`;
};
const bindingBase = (body: Record<string, unknown>): string => {
  const principal = body.principal as { type: string; key: string };
  return [principal.key, body.role as string, ...(body.workspace ? [body.workspace as string] : [])]
    .join("-")
    .replaceAll("_", "-");
};

/**
 * Gives each binding a key nobody else has. A key is only a name for a file, and is read from
 * what the binding gives to whom: where two would be the same name, or the name was cut short,
 * a short hash of that content is added, so that the same binding has the same key every time.
 */
export function withUniqueBindingKeys(resources: readonly TenantResource[]): TenantResource[] {
  const taken = new Map<string, number>();
  for (const one of resources) {
    if (one.kind !== "tenant_binding") continue;
    const base = bindingBase(one.body).slice(0, 63);
    taken.set(base, (taken.get(base) ?? 0) + 1);
  }
  return resources.map((one) => {
    if (one.kind !== "tenant_binding") return one;
    const full = bindingBase(one.body);
    const base = full.slice(0, 63);
    if (full.length <= 63 && taken.get(base) === 1) return { ...one, key: base };
    const short = createHash("sha256").update(bindingIdentity(one.body)).digest("hex").slice(0, 8);
    return { ...one, key: `${full.slice(0, 54)}-${short}` };
  });
}
const identity = (resource: TenantResource): string =>
  resource.kind === "tenant_binding"
    ? `tenant_binding ${bindingIdentity(resource.body)}`
    : `${resource.kind} ${resource.key}`;
const labelOf = (resource: TenantResource): string => {
  if (resource.kind === "tenant_binding") {
    const principal = resource.body.principal as { type: string; key: string };
    return `${resource.body.role} to ${principal.type.replaceAll("_", " ")} ${principal.key}${resource.body.workspace ? ` in ${resource.body.workspace}` : ""}`;
  }
  return (resource.body.title as string | undefined) ?? resource.key;
};

/**
 * The tenant's access as it is now, as resources: what a release would be set
 * against, and what `volvel tenant pull` writes. Groups an identity provider
 * made are left out: they are the provider's to make and remove.
 */
export async function currentAccess(db: Db | Trx, tenantId: string): Promise<TenantResource[]> {
  const resources: TenantResource[] = [];
  const roles = await db
    .selectFrom("role")
    .select(["name", "description", "permissions"])
    .where("tenant_id", "=", tenantId)
    .where("workspace_id", "is", null)
    .where("source_resource_id", "is", null)
    .execute();
  for (const role of roles) {
    resources.push({
      kind: "tenant_role",
      key: role.name,
      body: {
        ...(role.description ? { description: role.description } : {}),
        permissions: role.permissions,
      },
    });
  }
  for (const kind of ["group", "end_user_group"] as const) {
    const rows = await db
      .selectFrom(TABLE[kind])
      .select(["id", "key", "name", "description", "sso_values"])
      .where("tenant_id", "=", tenantId)
      .where("managed_by", "=", "release")
      .execute();
    for (const row of rows) {
      const values = [...row.sso_values].sort();
      resources.push({
        kind,
        key: row.key,
        body: {
          title: row.name,
          ...(row.description ? { description: row.description } : {}),
          ...(values.length > 0 ? { membership: { sso: { values } } } : {}),
        },
      });
    }
  }
  const accounts = await db
    .selectFrom("service_account")
    .select(["key", "name", "description"])
    .where("tenant_id", "=", tenantId)
    .where("managed_by", "=", "release")
    .execute();
  for (const account of accounts) {
    resources.push({
      kind: "service_account",
      key: account.key,
      body: {
        title: account.name,
        ...(account.description ? { description: account.description } : {}),
      },
    });
  }
  // What a group or a service account is given, by hand or by a release. What a workspace's
  // bundle gives is that bundle's, and what a person is given stays state.
  const bindings = await sql<{
    role: string;
    type: PrincipalKind;
    key: string;
    workspace: string | null;
  }>`
    select r.name as role, b.principal_type as type,
      coalesce(g.key, s.key, e.key) as key, w.slug as workspace
    from binding b
    join role r on r.id = b.role_id and r.workspace_id is null
    left join principal_group g on b.principal_type = 'group' and g.id = b.principal_id
    left join service_account s on b.principal_type = 'service_account' and s.id = b.principal_id
    left join end_user_group e on b.principal_type = 'end_user_group' and e.id = b.principal_id
    left join workspace w on w.id = b.workspace_id
    where b.tenant_id = ${tenantId}
      and b.principal_type in ('group', 'service_account', 'end_user_group')
      and b.resource_id is null and b.source_resource_id is null
  `.execute(db);
  for (const row of bindings.rows) {
    const body = {
      role: row.role,
      principal: { type: row.type, key: row.key },
      ...(row.workspace ? { workspace: row.workspace } : {}),
    };
    resources.push({ kind: "tenant_binding", key: "", body });
  }
  return withUniqueBindingKeys(resources).sort(tenantOrder);
}

/** What has to change for the tenant's access to be what is asked for. */
function plan(
  current: readonly TenantResource[],
  asks: readonly AccessAsk[],
  full: boolean,
  madeByProvider: readonly TenantResource[] = [],
): { steps: Step[]; unchanged: number } {
  // What an identity provider made is compared with, so that a repository that keeps it as it is
  // changes nothing, and is never removed.
  const there = new Map(
    [...madeByProvider, ...current].map((resource) => [identity(resource), resource]),
  );
  const steps: Step[] = [];
  let unchanged = 0;
  const wanted = new Set<string>();
  for (const ask of asks) {
    if (ask.op === "put-absent") {
      const found = there.get(identity(ask.resource));
      if (found) steps.push({ op: "delete", kind: found.kind, key: found.key });
      continue;
    }
    if (ask.op === "delete") {
      const found = current.find((one) => one.kind === ask.kind && one.key === ask.key);
      if (found) steps.push(ask);
      continue;
    }
    wanted.add(identity(ask.resource));
    const before = there.get(identity(ask.resource));
    // A binding is its content: one that is there is the same one.
    if (
      before &&
      (ask.resource.kind === "tenant_binding" || same(before.body, ask.resource.body))
    ) {
      unchanged += 1;
    } else {
      steps.push(ask);
    }
  }
  if (full) {
    for (const resource of current) {
      if (!wanted.has(identity(resource))) {
        steps.push({ op: "delete", kind: resource.kind, key: resource.key });
      }
    }
  }
  // What others refer to is made first and removed last.
  const put = steps
    .filter((step): step is Extract<Step, { op: "put" }> => step.op === "put")
    .sort((a, b) => tenantOrder(a.resource, b.resource));
  const gone = steps
    .filter((step): step is Extract<Step, { op: "delete" }> => step.op === "delete")
    .sort((a, b) => tenantOrder({ ...b, body: {} }, { ...a, body: {} }));
  return {
    steps: [
      ...gone.filter((step) => step.kind === "tenant_binding"),
      ...put,
      ...gone.filter((step) => step.kind !== "tenant_binding"),
    ],
    unchanged,
  };
}

/** Where the bundles of the tenant's workspaces still give something to a principal. */
async function usesOf(trx: Trx, type: PrincipalKind, id: string): Promise<string[]> {
  const rows = await trx
    .selectFrom("binding")
    .innerJoin("resource", "resource.id", "binding.source_resource_id")
    .innerJoin("workspace", "workspace.id", "resource.workspace_id")
    .select(["workspace.slug", "resource.path"])
    .where("binding.principal_type", "=", type)
    .where("binding.principal_id", "=", id)
    .execute();
  return rows.map((row) => `the binding ${row.path} in ${row.slug}`);
}

async function applyStep(
  trx: Trx,
  audit: Audit,
  tenantId: string,
  step: Step,
  current: readonly TenantResource[],
  summary: AccessSummary,
): Promise<void> {
  const note = (change: AccessChange["change"], resource: TenantResource) => {
    summary[change] += 1;
    summary.changes.push({
      change,
      kind: resource.kind,
      key: resource.key,
      label: labelOf(resource),
    });
  };
  const before =
    step.op === "put"
      ? current.find((one) => identity(one) === identity(step.resource))
      : current.find((one) => one.kind === step.kind && one.key === step.key);
  const kind = step.op === "put" ? step.resource.kind : step.kind;
  const key = step.op === "put" ? step.resource.key : step.key;

  if (kind === "tenant_role") {
    const existing = await trx
      .selectFrom("role")
      .select(["id", "source_resource_id"])
      .where("tenant_id", "=", tenantId)
      .where("workspace_id", "is", null)
      .where("name", "=", key)
      .executeTakeFirst();
    if (existing?.source_resource_id) {
      throw conflict(`The role ${key} is defined by a workspace's bundle. Change it there.`);
    }
    if (step.op === "delete") {
      if (!existing || !before) return;
      const bound = await trx
        .selectFrom("binding")
        .select("id")
        .where("role_id", "=", existing.id)
        .limit(1)
        .executeTakeFirst();
      if (bound) {
        throw new HttpError(
          409,
          "principal_in_use",
          `The role ${key} is still given to someone. Take it away from them first.`,
        );
      }
      await trx.deleteFrom("role").where("id", "=", existing.id).execute();
      await audit({
        action: "role.deleted",
        targetType: "role",
        targetId: existing.id,
        tenantId,
        details: { name: key },
      });
      note("deleted", before);
      return;
    }
    const body = step.resource.body as { description?: string; permissions: string[] };
    const id = existing?.id ?? newId();
    if (existing) {
      await trx
        .updateTable("role")
        .set({ description: body.description ?? "", permissions: body.permissions })
        .where("id", "=", id)
        .execute();
    } else {
      const builtin = await trx
        .selectFrom("role")
        .select("id")
        .where("builtin", "=", true)
        .where("name", "=", key)
        .executeTakeFirst();
      if (builtin)
        throw badRequest(`"${key}" is the name of a role every tenant has. Choose another.`);
      await trx
        .insertInto("role")
        .values({
          id,
          tenant_id: tenantId,
          workspace_id: null,
          name: key,
          description: body.description ?? "",
          permissions: body.permissions,
          source_resource_id: null,
        })
        .execute();
    }
    await audit({
      action: existing ? "role.updated" : "role.created",
      targetType: "role",
      targetId: id,
      tenantId,
      details: { name: key, permissions: body.permissions },
    });
    note(existing ? "updated" : "created", step.resource);
    return;
  }

  if (kind === "group" || kind === "end_user_group" || kind === "service_account") {
    const table = TABLE[kind];
    const what = kind.replaceAll("_", " ");
    const existing = await trx
      .selectFrom(table)
      .select(["id", "name", "managed_by"])
      .where("tenant_id", "=", tenantId)
      .where("key", "=", key)
      .executeTakeFirst();
    if (step.op === "delete") {
      if (!existing) return;
      if (existing.managed_by === "provider") {
        throw conflict(`The ${what} ${key} is made by the identity provider. Remove it there.`);
      }
      const uses = await usesOf(trx, kind, existing.id);
      if (uses.length > 0) {
        throw new HttpError(
          409,
          "principal_in_use",
          `The ${what} ${key} is still given access by ${uses.slice(0, 5).join(", ")}${uses.length > 5 ? ` and ${uses.length - 5} more` : ""}. Remove it from the workspace's code and deploy, then release again.`,
        );
      }
      if (kind === "group") {
        const waiting = await sql<{ flow: string; slug: string }>`
          select f.flow_path as flow, w.slug from step_run s
          join flow_run f on f.id = s.flow_run_id
          join workspace w on w.id = f.workspace_id
          where f.tenant_id = ${tenantId} and s.status = 'waiting'
            and s.detail -> 'approverIds' -> 'groups' ? ${existing.id}
          limit 5
        `.execute(trx);
        if (waiting.rows.length > 0) {
          throw new HttpError(
            409,
            "principal_in_use",
            `The group ${key} is who decides an approval that is waiting now: ${waiting.rows.map((row) => `${row.flow} in ${row.slug}`).join(", ")}. Decide or cancel it first, or nobody could.`,
          );
        }
      }
      // What it was given by hand or by a release goes with it.
      await trx
        .deleteFrom("binding")
        .where("tenant_id", "=", tenantId)
        .where("principal_type", "=", kind)
        .where("principal_id", "=", existing.id)
        .execute();
      if (kind === "service_account") {
        await trx
          .deleteFrom("api_key")
          .where("owner_type", "=", "service_account")
          .where("owner_id", "=", existing.id)
          .execute();
      }
      await trx.deleteFrom(table).where("id", "=", existing.id).execute();
      await audit({
        action: `${kind}.deleted`,
        targetType: kind,
        targetId: existing.id,
        tenantId,
        details: { key, name: existing.name },
      });
      note("deleted", before ?? { kind, key, body: { title: existing.name } });
      return;
    }
    const body = step.resource.body as {
      title: string;
      description?: string;
      membership?: { sso?: { values: string[] } };
    };
    const clash = await trx
      .selectFrom(table)
      .select("key")
      .where("tenant_id", "=", tenantId)
      .where("name", "=", body.title)
      .where("key", "<>", key)
      .executeTakeFirst();
    // A table's rows can be a group's by holding its key, or what it is called. A group called
    // by another's key would be given that one's rows.
    const shadows = await trx
      .selectFrom(table)
      .select("key")
      .where("tenant_id", "=", tenantId)
      .where("key", "=", body.title)
      .where("key", "<>", key)
      .executeTakeFirst();
    if (shadows) {
      throw conflict(
        `"${body.title}" is the key of another ${what}. A ${what} called by another's key would be given the rows that hold that key.`,
      );
    }
    if (clash) {
      throw conflict(
        `"${body.title}" is the title of the ${what} ${clash.key}. Two with one title cannot be told apart by people, or by code that still names one by its title.`,
      );
    }
    const id = existing?.id ?? newId();
    if (existing) {
      await trx
        .updateTable(table)
        .set({ name: body.title, description: body.description ?? "" })
        .where("id", "=", id)
        .execute();
    } else {
      await trx
        .insertInto(table)
        .values({
          id,
          tenant_id: tenantId,
          key,
          name: body.title,
          description: body.description ?? "",
        })
        .execute();
    }
    if (kind !== "service_account") {
      await setMembership(trx, tenantId, kind, id, body.membership?.sso?.values ?? []);
    }
    await audit({
      action: existing ? `${kind}.updated` : `${kind}.created`,
      targetType: kind,
      targetId: id,
      tenantId,
      details: {
        key,
        name: body.title,
        ...(existing && existing.name !== body.title ? { renamedFrom: existing.name } : {}),
      },
    });
    note(existing ? "updated" : "created", step.resource);
    return;
  }

  // A binding: a role, given to a group or a service account, in the tenant or in one workspace.
  const body = (step.op === "put" ? step.resource.body : before?.body) as
    | { role: string; principal: { type: PrincipalKind; key: string }; workspace?: string }
    | undefined;
  if (!body) return;
  const role = await trx
    .selectFrom("role")
    .select(["id", "name"])
    .where("name", "=", body.role)
    .where("workspace_id", "is", null)
    .where((eb) => eb.or([eb("tenant_id", "=", tenantId), eb("tenant_id", "is", null)]))
    .orderBy("tenant_id", sql`desc nulls last`)
    .executeTakeFirst();
  if (!role || role.name === INSTANCE_ONLY_ROLE) {
    throw badRequest(`There is no role "${body.role}" that this tenant can give.`);
  }
  const principal = await trx
    .selectFrom(TABLE[body.principal.type])
    .select("id")
    .where("tenant_id", "=", tenantId)
    .where("key", "=", body.principal.key)
    .executeTakeFirst();
  if (!principal) {
    throw badRequest(
      `There is no ${body.principal.type.replaceAll("_", " ")} with the key "${body.principal.key}" in this tenant.`,
    );
  }
  let workspaceId: string | null = null;
  if (body.workspace) {
    const workspace = await trx
      .selectFrom("workspace")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("slug", "=", body.workspace)
      .executeTakeFirst();
    if (!workspace) throw badRequest(`There is no workspace "${body.workspace}" in this tenant.`);
    workspaceId = workspace.id;
  }
  const scoped = trx
    .selectFrom("binding")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .where("principal_type", "=", body.principal.type)
    .where("principal_id", "=", principal.id)
    .where("role_id", "=", role.id)
    .where("resource_id", "is", null)
    .where("source_resource_id", "is", null)
    .$if(workspaceId === null, (query) => query.where("workspace_id", "is", null))
    .$if(workspaceId !== null, (query) => query.where("workspace_id", "=", workspaceId));
  const existing = await scoped.executeTakeFirst();
  const resource: TenantResource = { kind: "tenant_binding", key, body };
  if (step.op === "delete") {
    if (!existing) return;
    await trx.deleteFrom("binding").where("id", "=", existing.id).execute();
    await audit({
      action: "binding.deleted",
      targetType: "binding",
      targetId: existing.id,
      tenantId,
      ...(workspaceId ? { workspaceId } : {}),
      details: { role: role.name, principalType: body.principal.type, principalId: principal.id },
    });
    note("deleted", resource);
    return;
  }
  if (existing) return;
  const id = newId();
  await trx
    .insertInto("binding")
    .values({
      id,
      scope_type: workspaceId ? "workspace" : "tenant",
      tenant_id: tenantId,
      workspace_id: workspaceId,
      resource_id: null,
      principal_type: body.principal.type,
      principal_id: principal.id,
      role_id: role.id,
      source_resource_id: null,
    })
    .execute();
  await audit({
    action: "binding.created",
    targetType: "binding",
    targetId: id,
    tenantId,
    ...(workspaceId ? { workspaceId } : {}),
    details: { role: role.name, principalType: body.principal.type, principalId: principal.id },
  });
  note("created", resource);
}

/**
 * Says which values of the groups claim put someone in a group, on every
 * provider of the tenant that signs that kind of person in. What somebody
 * mapped by hand is theirs and is left.
 */
export async function setMembership(
  trx: Trx,
  tenantId: string,
  kind: "group" | "end_user_group",
  groupId: string,
  values: readonly string[],
): Promise<void> {
  const column = kind === "group" ? "member_group_id" : "end_user_group_id";
  await trx
    .updateTable(TABLE[kind])
    .set({ sso_values: [...values] })
    .where("id", "=", groupId)
    .execute();
  await trx
    .deleteFrom("identity_group_map")
    .where("tenant_id", "=", tenantId)
    .where(column, "=", groupId)
    .where("managed_by", "=", "release")
    .execute();
  if (values.length === 0) return;
  const providers = await trx
    .selectFrom("identity_provider")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .where("audience", "=", kind === "group" ? "members" : "end_users")
    .execute();
  for (const provider of providers) {
    for (const value of values) {
      const byHand = await trx
        .selectFrom("identity_group_map")
        .select("id")
        .where("provider_id", "=", provider.id)
        .where("claim_value", "=", value)
        .where(column, "=", groupId)
        .executeTakeFirst();
      if (byHand) continue;
      await trx
        .insertInto("identity_group_map")
        .values({
          id: newId(),
          provider_id: provider.id,
          tenant_id: tenantId,
          claim_value: value,
          member_group_id: kind === "group" ? groupId : null,
          end_user_group_id: kind === "end_user_group" ? groupId : null,
          managed_by: "release",
        })
        .execute();
    }
  }
}

/**
 * Gives a provider made after a release the group memberships that release
 * asked for: a repository says them once, whenever the provider arrives.
 */
export async function membershipForProvider(trx: Trx, tenantId: string): Promise<void> {
  for (const kind of ["group", "end_user_group"] as const) {
    const rows = await trx
      .selectFrom(TABLE[kind])
      .select(["id", "sso_values"])
      .where("tenant_id", "=", tenantId)
      .execute();
    for (const row of rows) {
      if (row.sso_values.length > 0)
        await setMembership(trx, tenantId, kind, row.id, row.sso_values);
    }
  }
}

export interface ReleaseRequest {
  /** `full`: the whole set, as a repository has it. `partial`: one change, as the console makes. */
  scope: "full" | "partial";
  asks: AccessAsk[];
  message?: string | undefined;
  origin: "cli" | "console" | "api" | "rollback";
  /** Kinds and keys a full release may remove, said one by one: `group/tech-desk`. */
  allowDelete?: readonly string[] | undefined;
  /** Set when a second person approved it, or when it is only being tried. */
  approved?: boolean;
  /** What the person who asked is told, as the release's warnings: what was left out and why. */
  notes?: readonly string[];
}

/** When the change is asked with a service account's key: the member who made that key. */
async function keyMaker(trx: Trx, principal: Principal): Promise<string | null> {
  if (principal.type !== "service_account" || !principal.apiKeyId) return null;
  const key = await trx
    .selectFrom("api_key")
    .select("created_by")
    .where("id", "=", principal.apiKeyId)
    .executeTakeFirst();
  return key?.created_by ?? null;
}

/**
 * Releases a change to the tenant's access. When the tenant asks for a second
 * person, the release waits and nothing changes. Otherwise it applies at once,
 * in the caller's transaction.
 */
export async function releaseAccess(
  trx: Trx,
  audit: Audit,
  tenantId: string,
  principal: Principal,
  request: ReleaseRequest,
) {
  const tenant = await trx
    .selectFrom("tenant")
    .select(["id", "access_approval"])
    .where("id", "=", tenantId)
    .forUpdate()
    .executeTakeFirst();
  if (!tenant) throw notFound("The tenant");
  const askedThrough = await keyMaker(trx, principal);
  const current = await currentAccess(trx, tenantId);
  const puts = request.asks.flatMap((ask) => (ask.op === "put" ? [ask.resource] : []));
  const known = [...current, ...(await providerManaged(trx, tenantId))].filter(
    (one) => one.kind !== "tenant_binding",
  );
  const problems = checkTenantResources(
    puts,
    request.scope === "full" ? await providerManaged(trx, tenantId) : known,
  );
  if (problems.length > 0) {
    throw badRequest(
      "The tenant's access is not valid.",
      problems.map((problem) => {
        const [where, ...rest] = problem.split(": ");
        return { path: where ?? "", message: rest.join(": ") };
      }),
    );
  }
  const byProvider = await providerManaged(trx, tenantId);
  for (const ask of request.asks) {
    const [kind, key] =
      ask.op === "delete" ? [ask.kind, ask.key] : [ask.resource.kind, ask.resource.key];
    if (ask.op === "put" || !byProvider.some((one) => one.kind === kind && one.key === key)) {
      continue;
    }
    throw conflict(
      `The ${kind.replaceAll("_", " ")} ${key} is made by the identity provider. Remove it there.`,
    );
  }
  const { steps, unchanged } = plan(current, request.asks, request.scope === "full", byProvider);
  if (request.scope === "full") {
    const unsaid = steps
      .filter((step): step is Extract<Step, { op: "delete" }> => step.op === "delete")
      .filter((step) => step.kind !== "tenant_binding")
      .filter((step) => !request.allowDelete?.includes(`${step.kind}/${step.key}`));
    if (unsaid.length > 0) {
      throw new HttpError(
        409,
        "delete_not_allowed",
        "This release would remove what the tenant has and the repository does not. If it was made in the console, pull it into the repository first. To remove it, release again allowing each by name.",
        unsaid.map((step) => ({
          path: `${step.kind}/${step.key}`,
          message: `the ${tenantName(step)} is not in what is being released (--allow-delete ${step.kind}/${step.key})`,
        })),
      );
    }
  }
  const undone =
    request.scope === "full" && request.origin !== "rollback"
      ? await editsUndone(trx, tenantId, steps)
      : [];
  const number =
    ((
      await trx
        .selectFrom("tenant_release")
        .select((eb) => eb.fn.max("number").as("last"))
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst()
    )?.last ?? 0) + 1;
  const id = newId();
  const waits = tenant.access_approval && !request.approved && steps.length > 0;
  const content = {
    scope: request.scope,
    asks: request.asks,
    allowDelete: request.allowDelete ?? [],
    // What the access was when this was asked. Approval is of a change to exactly that.
    base: fingerprint(current),
  };

  if (waits) {
    // What it would do is worked out now, for whoever is asked, and again when they answer.
    const summary = previewSteps([...byProvider, ...current], steps, unchanged);
    summary.warnings.push(...(request.notes ?? []), ...undone);
    await trx
      .insertInto("tenant_release")
      .values({
        id,
        tenant_id: tenantId,
        number,
        scope: request.scope,
        content: JSON.stringify(content),
        snapshot: null,
        summary: JSON.stringify(summary),
        message: request.message ?? null,
        status: "awaiting_approval",
        origin: request.origin,
        created_by_type: principal.type,
        created_by_id: principal.id,
        asked_through: askedThrough,
      })
      .execute();
    await audit({
      action: "access.release_requested",
      targetType: "tenant_release",
      targetId: id,
      tenantId,
      details: { number, changes: summary.changes.length },
    });
    return { id, number, status: "awaiting_approval" as const, summary };
  }

  const summary: AccessSummary = {
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged,
    changes: [],
    warnings: [...(request.notes ?? []), ...undone],
  };
  await keepingAnAdmin(trx, tenantId, async () => {
    for (const step of steps) await applyStep(trx, audit, tenantId, step, current, summary);
  });
  if (steps.length > 0) await supersede(trx, audit, tenantId, id, number);
  await trx
    .insertInto("tenant_release")
    .values({
      id,
      tenant_id: tenantId,
      number,
      scope: request.scope,
      content: JSON.stringify(content),
      snapshot: JSON.stringify(await currentAccess(trx, tenantId)),
      summary: JSON.stringify(summary),
      message: request.message ?? null,
      status: "applied",
      origin: request.origin,
      created_by_type: principal.type,
      created_by_id: principal.id,
      asked_through: askedThrough,
      applied_at: new Date(),
    })
    .execute();
  await audit({
    action: "access.released",
    targetType: "tenant_release",
    targetId: id,
    tenantId,
    details: {
      number,
      scope: request.scope,
      origin: request.origin,
      created: summary.created,
      updated: summary.updated,
      deleted: summary.deleted,
    },
  });
  if (steps.length > 0) {
    applied.set(id, { tenantId, number, message: request.message ?? null, at: Date.now() });
  }
  return { id, number, status: "applied" as const, summary };
}

/**
 * What a release of the whole set would put back that was changed one at a time since
 * the last such release: in the console or through the API, where the repository has not
 * heard of it. The release goes ahead. Whoever reads its plan is told which change it undoes.
 */
async function editsUndone(trx: Trx, tenantId: string, steps: readonly Step[]): Promise<string[]> {
  const releases = await trx
    .selectFrom("tenant_release")
    .select(["number", "scope", "origin", "summary"])
    .where("tenant_id", "=", tenantId)
    .where("status", "=", "applied")
    .orderBy("number", "desc")
    .limit(200)
    .execute();
  const edited = new Map<string, number>();
  for (const release of releases) {
    if (release.scope === "full" && release.origin !== "rollback") break;
    if (release.scope !== "partial") continue;
    for (const change of (release.summary as Partial<AccessSummary>).changes ?? []) {
      const name = `${change.kind}/${change.key}`;
      if (!edited.has(name)) edited.set(name, release.number);
    }
  }
  const warnings: string[] = [];
  for (const step of steps) {
    const one = step.op === "put" ? step.resource : step;
    if (one.kind === "tenant_binding") continue;
    const number = edited.get(`${one.kind}/${one.key}`);
    if (number === undefined) continue;
    warnings.push(
      `the ${tenantName(one)} was last changed in release ${number}, outside the repository. This ${
        step.op === "delete" ? "removes it" : "puts it back as the repository has it"
      }. To keep that change, pull the tenant's access into the repository first (volvel tenant pull).`,
    );
  }
  return warnings;
}

/** Groups and service accounts an identity provider made: a binding may name them. */
async function providerManaged(trx: Db | Trx, tenantId: string): Promise<TenantResource[]> {
  const found: TenantResource[] = [];
  for (const kind of ["group", "end_user_group", "service_account"] as const) {
    const rows = await trx
      .selectFrom(TABLE[kind])
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("managed_by", "=", "provider")
      .execute();
    for (const row of rows) {
      const values = "sso_values" in row ? [...(row.sso_values as string[])].sort() : [];
      found.push({
        kind,
        key: row.key,
        body: {
          title: row.name,
          ...(row.description ? { description: row.description } : {}),
          ...(values.length > 0 ? { membership: { sso: { values } } } : {}),
        },
      });
    }
  }
  return found;
}

/**
 * A change that waited was asked of the access as it was then. When another change applies and
 * the access is no longer that, the first can never be approved: it is marked so, with the
 * release that made it so, rather than left to say "waits" for ever.
 */
async function supersede(
  trx: Trx,
  audit: Audit,
  tenantId: string,
  appliedId: string,
  number: number,
): Promise<void> {
  const waiting = await trx
    .selectFrom("tenant_release")
    .select(["id", "number", "content"])
    .where("tenant_id", "=", tenantId)
    .where("status", "=", "awaiting_approval")
    .where("id", "<>", appliedId)
    .execute();
  if (waiting.length === 0) return;
  const now = fingerprint(await currentAccess(trx, tenantId));
  for (const one of waiting) {
    if ((one.content as { base: string }).base === now) continue;
    await trx
      .updateTable("tenant_release")
      .set({
        status: "superseded",
        decided_at: new Date(),
        comment: `Release ${number} changed the tenant's access after this was asked for. Ask for it again.`,
      })
      .where("id", "=", one.id)
      .execute();
    await audit({
      action: "access.release_superseded",
      targetType: "tenant_release",
      targetId: one.id,
      tenantId,
      details: { number: one.number, by: number },
    });
  }
}

function previewSteps(
  current: readonly TenantResource[],
  steps: readonly Step[],
  unchanged: number,
): AccessSummary {
  const summary: AccessSummary = {
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged,
    changes: [],
    warnings: [],
  };
  for (const step of steps) {
    const before =
      step.op === "put"
        ? current.find((one) => identity(one) === identity(step.resource))
        : current.find((one) => one.kind === step.kind && one.key === step.key);
    const change = step.op === "delete" ? "deleted" : before ? "updated" : "created";
    const resource = step.op === "put" ? step.resource : before;
    if (!resource) continue;
    summary[change] += 1;
    summary.changes.push({
      change,
      kind: resource.kind,
      key: resource.key,
      label: labelOf(resource),
    });
  }
  return summary;
}

/** A second person answers a release that waits. Approving applies it as the tenant is now. */
export async function decideRelease(
  trx: Trx,
  audit: Audit,
  tenantId: string,
  principal: Principal,
  releaseId: string,
  decision: "approve" | "decline" | "withdraw",
  comment?: string,
) {
  const release = await trx
    .selectFrom("tenant_release")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("id", "=", releaseId)
    .forUpdate()
    .executeTakeFirst();
  if (!release) throw notFound("The release");
  if (release.status !== "awaiting_approval") {
    throw conflict(`This release was ${release.status.replaceAll("_", " ")} already.`);
  }
  // Asked by this person, or with a key of a service account that this person made.
  const own =
    (release.created_by_type === principal.type && release.created_by_id === principal.id) ||
    (principal.type === "member" && release.asked_through === principal.id);
  // A second person is a person: a key of a service account does not answer for one.
  if (decision !== "withdraw" && principal.type !== "member") {
    throw forbiddenBecause(
      "Only a member signed in as themselves approves or declines a change to access. A service account's key cannot.",
    );
  }
  if (decision === "withdraw" && !own)
    throw conflict("Only whoever asked for a release can withdraw it.");
  if (decision === "approve" && own) {
    throw new HttpError(
      409,
      "own_release",
      "A change to access is approved by someone other than whoever made it.",
    );
  }
  const decided = {
    decided_by_type: principal.type,
    decided_by_id: principal.id,
    decided_at: new Date(),
    comment: comment ?? null,
  };
  if (decision !== "approve") {
    await trx
      .updateTable("tenant_release")
      .set({ ...decided, status: decision === "decline" ? "declined" : "withdrawn" })
      .where("id", "=", release.id)
      .execute();
    await audit({
      action: decision === "decline" ? "access.release_declined" : "access.release_withdrawn",
      targetType: "tenant_release",
      targetId: release.id,
      tenantId,
      details: { number: release.number, ...(comment ? { comment } : {}) },
    });
    return {
      id: release.id,
      number: release.number,
      status: decision === "decline" ? "declined" : "withdrawn",
    };
  }
  const content = release.content as {
    scope: "full" | "partial";
    asks: AccessAsk[];
    allowDelete: string[];
    base: string;
  };
  const current = await currentAccess(trx, tenantId);
  const { steps, unchanged } = plan(
    current,
    content.asks,
    content.scope === "full",
    await providerManaged(trx, tenantId),
  );
  // What was asked to be approved was a change to the access as it then was. If anything
  // moved since, whoever approves would be approving something they were not shown.
  if (content.base !== fingerprint(current)) {
    throw new HttpError(
      409,
      "release_stale",
      "The tenant's access changed after this release was asked for, so it is no longer the change that was shown. Withdraw it and release again.",
    );
  }
  const summary: AccessSummary = {
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged,
    changes: [],
    warnings: [],
  };
  await keepingAnAdmin(trx, tenantId, async () => {
    for (const step of steps) await applyStep(trx, audit, tenantId, step, current, summary);
  });
  await trx
    .updateTable("tenant_release")
    .set({
      ...decided,
      status: "applied",
      applied_at: new Date(),
      summary: JSON.stringify(summary),
      snapshot: JSON.stringify(await currentAccess(trx, tenantId)),
    })
    .where("id", "=", release.id)
    .execute();
  if (steps.length > 0) await supersede(trx, audit, tenantId, release.id, release.number);
  await audit({
    action: "access.released",
    targetType: "tenant_release",
    targetId: release.id,
    tenantId,
    details: {
      number: release.number,
      scope: release.scope,
      origin: release.origin,
      approved: true,
      created: summary.created,
      updated: summary.updated,
      deleted: summary.deleted,
    },
  });
  applied.set(release.id, {
    tenantId,
    number: release.number,
    message: release.message,
    at: Date.now(),
  });
  return { id: release.id, number: release.number, status: "applied", summary };
}

/** The whole set an earlier release left, asked for again: going back to it. */
export async function rollbackAsks(db: Db | Trx, tenantId: string, releaseId: string) {
  const release = await db
    .selectFrom("tenant_release")
    .select(["number", "snapshot", "status"])
    .where("tenant_id", "=", tenantId)
    .where("id", "=", releaseId)
    .executeTakeFirst();
  if (!release) throw notFound("The release");
  if (release.status !== "applied" || !release.snapshot) {
    throw conflict("Only a release that applied can be gone back to.");
  }
  const current = await currentAccess(db, tenantId);
  // A snapshot made before bindings had keys of their own may hold two under one name: it is read
  // by what each binding gives, and given keys of today.
  const all = withUniqueBindingKeys(release.snapshot);
  // What a release named may be gone since: a workspace, a role, a group an identity provider made.
  // That is left out, and said, rather than making every release before it a way nobody can go.
  const workspaces = new Set(
    (
      await db.selectFrom("workspace").select("slug").where("tenant_id", "=", tenantId).execute()
    ).map((row) => row.slug),
  );
  const roleNames = new Set(
    (
      await db
        .selectFrom("role")
        .select("name")
        .where("workspace_id", "is", null)
        .where((eb) => eb.or([eb("tenant_id", "=", tenantId), eb("tenant_id", "is", null)]))
        .execute()
    ).map((row) => row.name),
  );
  for (const one of all) if (one.kind === "tenant_role") roleNames.add(one.key);
  const principals = new Set(
    [...all, ...(await providerManaged(db, tenantId))].map((one) => `${one.kind} ${one.key}`),
  );
  const warnings: string[] = [];
  const snapshot = all.filter((one) => {
    if (one.kind !== "tenant_binding") return true;
    const body = one.body as {
      role: string;
      principal: { type: string; key: string };
      workspace?: string;
    };
    const gone = [
      ...(body.workspace && !workspaces.has(body.workspace)
        ? [`the workspace ${body.workspace} is gone`]
        : []),
      ...(roleNames.has(body.role) ? [] : [`the role ${body.role} is gone`]),
      ...(principals.has(`${body.principal.type} ${body.principal.key}`)
        ? []
        : [`the ${body.principal.type.replaceAll("_", " ")} ${body.principal.key} is gone`]),
    ];
    if (gone.length === 0) return true;
    warnings.push(`Not given again: ${labelOf(one)}, because ${gone.join(" and ")}.`);
    return false;
  });
  const kept = new Set(snapshot.map(identity));
  const removed = current.filter((one) => !kept.has(identity(one)));
  return {
    /** What going back removes, each as a name a person reads. */
    removes: removed.map((one) => ({ kind: one.kind, key: one.key, label: labelOf(one) })),
    /** What it leaves out because it no longer exists. */
    warnings,
    number: release.number,
    asks: snapshot.map((resource): AccessAsk => ({ op: "put", resource })),
    // Going back removes what was made since. That is what going back means, so each is allowed.
    allowDelete: removed.map((one) => `${one.kind}/${one.key}`),
  };
}

/** A key nobody has yet, made from a name, for something made in the console. */
export async function freeKey(
  trx: Trx,
  tenantId: string,
  kind: PrincipalKind,
  name: string,
): Promise<string> {
  const row = await sql<{ key: string }>`select access_key(${name}) as key`.execute(trx);
  const base = row.rows[0]?.key ?? "unnamed";
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await trx
      .selectFrom(TABLE[kind])
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("key", "=", candidate)
      .executeTakeFirst();
    if (!taken) return candidate;
  }
}

/**
 * One change to the tenant's access, made in the console or through the API: a
 * release of that change alone, with the same history, and the same wait when
 * the tenant asks for a second person.
 */
export function releaseOne(
  trx: Trx,
  audit: Audit,
  tenantId: string,
  principal: Principal,
  ask: AccessAsk,
  message: string,
) {
  return releaseAccess(trx, audit, tenantId, principal, {
    scope: "partial",
    asks: [ask],
    origin: principal.type === "member" ? "console" : "api",
    message,
  });
}

/** The resource a group or a service account is now, to change one thing about it. */
export async function accessResource(
  db: Db | Trx,
  tenantId: string,
  kind: PrincipalKind,
  id: string,
): Promise<{ resource: TenantResource; managedBy: "release" | "provider" } | undefined> {
  const row = await db
    .selectFrom(TABLE[kind])
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return undefined;
  const values = "sso_values" in row ? [...(row.sso_values as string[])].sort() : [];
  return {
    managedBy: row.managed_by,
    resource: {
      kind,
      key: row.key,
      body: {
        title: row.name,
        ...(row.description ? { description: row.description } : {}),
        ...(values.length > 0 ? { membership: { sso: { values } } } : {}),
      },
    },
  };
}
