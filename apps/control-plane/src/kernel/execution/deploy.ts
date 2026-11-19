import { newId, type ResourceMeta, sql } from "@volvel/db";
import {
  type BundleManifest,
  bundleCompatibility,
  type FlowBody,
  flowGrants,
  keyOf,
  platformKinds,
  renderResourceFiles,
  toolNameOf,
} from "@volvel/manifest";
import type { Audit, Principal, Trx } from "../audit.js";
import { loadCatalog, reconcileReferences, workspaceSchema } from "../data/apply.js";
import { describeChanges } from "../data/plan.js";
import { HttpError, notFound } from "../errors.js";
import type { WorkspaceRef } from "../http.js";
import type { Kernel } from "../kernel.js";
import { renamePathState, swapPath } from "../rename.js";
import { deleteResource, putResource } from "../resources.js";
import { loadBundle } from "./bundles.js";
import { unfitBindings } from "./connectors.js";

interface ScriptBody {
  uses: { connections: string[]; secrets: string[]; variables: string[]; sources?: string[] };
  onFailure?: { notify?: string };
}

/** Everything a bundle's scripts need that this workspace has not bound yet. */
async function missingBindings(trx: Trx, workspace: WorkspaceRef, manifests: BundleManifest[]) {
  const scripts = manifests.filter((manifest) => manifest.kind === "script");
  const need = {
    connections: new Set<string>(),
    secrets: new Set<string>(),
    variables: new Set<string>(),
    sources: new Set<string>(),
  };
  for (const script of scripts) {
    const body = script.body as unknown as ScriptBody;
    for (const path of body.uses.connections) need.connections.add(path);
    for (const name of body.uses.secrets) need.secrets.add(name);
    for (const path of body.uses.variables) need.variables.add(path);
    for (const path of body.uses.sources ?? []) need.sources.add(path);
    if (body.onFailure?.notify) need.connections.add(body.onFailure.notify);
  }
  // A webhook that checks signatures needs the secret it checks them against.
  for (const manifest of manifests) {
    if (manifest.kind === "trigger") {
      const verify = (manifest.body as { verify?: { secret?: string } }).verify;
      if (verify?.secret) need.secrets.add(verify.secret);
    }
    if (manifest.kind === "flow") {
      const nodes = (
        manifest.body as { nodes?: Record<string, { trigger?: { verify?: { secret?: string } } }> }
      ).nodes;
      for (const node of Object.values(nodes ?? {})) {
        if (node.trigger?.verify?.secret) need.secrets.add(node.trigger.verify.secret);
      }
      // A connection a step hands its script is needed like one a script names.
      for (const grant of flowGrants(manifest.body as unknown as FlowBody)) {
        if (grant.kind === "connection") need.connections.add(grant.target);
      }
    }
  }
  const names = async (
    table: "connection_binding" | "variable_value" | "secret",
    column: "path" | "name",
  ) =>
    new Set(
      (
        await trx
          .selectFrom(table)
          .select(column as never)
          .where("workspace_id", "=", workspace.id)
          .execute()
      ).map((row) => (row as Record<string, string>)[column]),
    );
  const [connections, variables, secrets] = [
    await names("connection_binding", "path"),
    await names("variable_value", "path"),
    await names("secret", "name"),
  ];
  const sources = new Set(
    (
      await trx
        .selectFrom("data_source_binding")
        .select("path")
        .where("workspace_id", "=", workspace.id)
        .execute()
    ).map((row) => row.path),
  );
  const withDefault = new Set(
    manifests
      .filter(
        (manifest) => manifest.kind === "variable" && typeof manifest.body.default === "string",
      )
      .map((manifest) => manifest.path),
  );
  return [
    ...[...need.connections]
      .sort()
      .filter((path) => !connections.has(path))
      .map((path) => ({
        path: `/connections/${path}`,
        message: `the connection "${path}" is not bound in this workspace`,
      })),
    ...[...need.secrets]
      .sort()
      .filter((name) => !secrets.has(name))
      .map((name) => ({
        path: `/secrets/${name}`,
        message: `the secret "${name}" is not set in this workspace`,
      })),
    ...[...need.variables]
      .sort()
      .filter((path) => !variables.has(path) && !withDefault.has(path))
      .map((path) => ({
        path: `/variables/${path}`,
        message: `the variable "${path}" has no value in this workspace and no default`,
      })),
    ...[...need.sources]
      .sort()
      .filter((path) => !sources.has(path))
      .map((path) => ({
        path: `/sources/${path}`,
        message: `the data source "${path}" is not bound in this workspace`,
      })),
  ];
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as object)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, field]) => [key, sortKeys(field)]),
    );
  }
  return value;
}

/**
 * The oldest core whose bundles this version still runs. An instance can be
 * upgraded and keep running, redeploying, promoting and rolling back to every
 * bundle built for this version or later. Raising this number breaks tenants'
 * deployed code, so it needs a deprecation period and an owner's decision.
 */
export const OLDEST_SUPPORTED_BUNDLE_CORE = "0.2.0";

/** One resource a deploy created, changed, renamed or removed. */
export interface ResourceChange {
  change: "created" | "updated" | "renamed" | "deleted";
  kind: string;
  path: string;
  /** The path it had, for one that was renamed. */
  from?: string;
}

type Stored = {
  id: string;
  key: string;
  path: string;
  kind: string;
};

/**
 * Which resource each manifest is. By key: the key a manifest gives, or its
 * path. A manifest that gives no key, and whose path-as-key is nobody's, is
 * the resource of its kind at that path if no other manifest claims that one:
 * so a bundle from before keys, and a resource whose key is not its path
 * because it was renamed by hand, are still matched. One that gives no key and
 * meets a resource of another kind is a new resource in its place, as it
 * always was.
 */
export function matchByKey<M extends BundleManifest, R extends Stored>(
  manifests: readonly M[],
  existing: readonly R[],
): Map<M, R> {
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const byPath = new Map(existing.map((row) => [row.path, row]));
  const matched = new Map<M, R>();
  const claimed = new Set<string>();
  for (const manifest of manifests) {
    const row = byKey.get(keyOf(manifest));
    if (!row || (manifest.key === undefined && row.kind !== manifest.kind)) continue;
    matched.set(manifest, row);
    claimed.add(row.id);
  }
  for (const manifest of manifests) {
    if (matched.has(manifest) || manifest.key !== undefined) continue;
    const row = byPath.get(manifest.path);
    if (!row || row.kind !== manifest.kind || claimed.has(row.id)) continue;
    matched.set(manifest, row);
    claimed.add(row.id);
  }
  return matched;
}

/** What a manifest says about its resource beside its body, as the registry keeps it. */
const metaOf = (manifest: BundleManifest): ResourceMeta => ({
  ...(manifest.mcp ? { mcp: manifest.mcp } : {}),
  ...(manifest.source ? { source: manifest.source } : {}),
});
/** A deploy lists the resources it changed, up to this many. The counts are always complete. */
const MAX_LISTED_CHANGES = 500;

/**
 * Activates a bundle in a workspace. Runs inside one transaction: either the
 * workspace is entirely on the new bundle, or nothing changed.
 */
export async function deployBundle(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  principal: Principal,
  bundleId: string,
  options: {
    promotedFrom?: string;
    /** For a clone made with safety on, which is left unbound on purpose. */
    allowMissingBindings?: boolean;
    /** What whoever deployed said about it. */
    message?: string;
    /**
     * Drafts the deployed bundle carries, as a pull from the console took them:
     * each is removed if it is still at the revision taken. One changed in the
     * console since is kept.
     */
    settle?: { path: string; revision: number }[];
    /**
     * Paths this deploy may delete although it looks like a rename done wrong: said by
     * whoever deploys, one path at a time. `all` is for a deploy whose removals were each
     * asked for by name already, as deleting a resource in the console is.
     */
    allowDelete?: readonly string[] | "all";
    /**
     * Said by whoever promotes to production, having seen them: this deploy may change or
     * remove the name of a tool an agent calls.
     */
    confirmBreaking?: boolean;
  } = {},
) {
  const current = await trx
    .selectFrom("workspace")
    .select(["active_bundle_id", "type"])
    .where("id", "=", workspace.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const bundle = await trx
    .selectFrom("bundle")
    .selectAll()
    .where("id", "=", bundleId)
    .where("workspace_id", "=", workspace.id)
    .executeTakeFirst();
  if (!bundle) throw notFound("The bundle");

  const compatible = bundleCompatibility(
    kernel.version,
    { min: bundle.core_min, below: bundle.core_below },
    OLDEST_SUPPORTED_BUNDLE_CORE,
  );
  if (compatible === "core_too_old") {
    throw new HttpError(
      409,
      "incompatible_bundle",
      `This bundle needs a core from ${bundle.core_min} up to, not including, ${bundle.core_below}. This instance runs ${kernel.version}. Upgrade the instance, or rebuild the bundle with the SDK that matches it.`,
    );
  }
  if (compatible === "bundle_too_old") {
    throw new HttpError(
      409,
      "incompatible_bundle",
      `This bundle was built for a core from ${bundle.core_min}, which this instance no longer runs: it runs ${kernel.version} and supports bundles built for ${OLDEST_SUPPORTED_BUNDLE_CORE} or later. Rebuild the bundle with a current SDK.`,
    );
  }
  const content = await loadBundle(kernel, bundle);
  const existing = await trx
    .selectFrom("resource")
    .select(["id", "key", "path", "title", "meta", "kind", "schema_version", "body", "ownership"])
    .where("workspace_id", "=", workspace.id)
    .execute();
  const byPath = new Map(existing.map((row) => [row.path, row]));
  const summary = {
    created: 0,
    updated: 0,
    renamed: 0,
    unchanged: 0,
    deleted: 0,
    data: [] as string[],
    changes: [] as ResourceChange[],
    warnings: [] as { path: string; message: string }[],
    /** Paths that answered for a renamed resource and now are a resource's own again. */
    aliasesRemoved: [] as string[],
    /** Changes to a name something outside calls: an agent's tool. */
    breaking: [] as { path: string; message: string }[],
  };
  const note = (change: ResourceChange["change"], kind: string, path: string, from?: string) => {
    if (summary.changes.length < MAX_LISTED_CHANGES) {
      summary.changes.push({ change, kind, path, ...(from !== undefined ? { from } : {}) });
    }
  };
  // The tenant's tables and their catalog may be in a database of their own.
  const data = (await kernel.data.within(trx, workspace.tenantId)).db;
  const dataBefore = await loadCatalog(data, workspace.id);

  // A bundle speaks for the code-managed resources, and for the console-managed ones
  // the bundle before it carried. A console-managed resource that no bundle carried,
  // such as a table made in the console, is left alone by every deploy.
  const carried = new Set<string>();
  if (current.active_bundle_id) {
    const before = await trx
      .selectFrom("bundle")
      .select(["id", "storage_key"])
      .where("id", "=", current.active_bundle_id)
      .executeTakeFirst();
    if (before) {
      const was = (await loadBundle(kernel, before)).manifests;
      for (const [manifest, row] of matchByKey(was, existing)) {
        if (manifest.ownership === "ui") carried.add(row.id);
      }
    }
  }
  // Each manifest is matched to the resource it is, by key. One at another path is a rename.
  const matched = matchByKey(content.manifests, existing);
  const kept = new Set([...matched.values()].map((row) => row.id));
  for (const [manifest, row] of matched) {
    if (row.kind !== manifest.kind) {
      throw new HttpError(
        409,
        "kind_changed",
        `${manifest.path} has the key "${row.key}", which is the key of the ${row.kind.replaceAll("_", " ")} at ${row.path}. A resource cannot change kind: give this one a key of its own.`,
      );
    }
  }
  // Resources the bundle no longer has go first, so a path can be reused by another.
  const removed = existing
    .filter((row) => (row.ownership === "code" || carried.has(row.id)) && !kept.has(row.id))
    // Bindings and triggers before the roles and scripts they refer to.
    .sort((a, b) => order(b.kind) - order(a.kind));
  const leaving = new Set(removed.map((row) => row.id));
  if (options.allowDelete !== "all") {
    const suspected = await suspectedRenames(
      trx,
      data,
      workspace,
      removed.filter((row) => !options.allowDelete?.includes(row.path)),
      content.manifests.filter((manifest) => !matched.has(manifest)),
      dataBefore,
    );
    if (suspected.length > 0) {
      throw new HttpError(
        409,
        "rename_suspected",
        "This deploy would delete something that holds history or data, and create something of the same kind. " +
          "If it was renamed, deploying this cuts the new one off from what the old one holds: give the new one the old one's key. " +
          "To delete it anyway, deploy again allowing each path by name.",
        suspected,
      );
    }
  }
  // A path is one resource's. What a manifest wants must be free, or be freed by this deploy.
  const moving = new Map<string, { id: string; key: string; kind: string; path: string }>();
  for (const manifest of content.manifests) {
    const row = matched.get(manifest);
    const occupant = byPath.get(manifest.path);
    if (!occupant || occupant.id === row?.id || leaving.has(occupant.id)) continue;
    const successor = [...matched].find(([, other]) => other.id === occupant.id)?.[0];
    if (!successor || successor.path === occupant.path) {
      throw new HttpError(
        409,
        "path_taken",
        `${manifest.path} (${manifest.kind}) cannot be deployed: that is the path of the ${occupant.kind.replaceAll("_", " ")} with the key "${occupant.key}", which this deploy does not move or remove. Rename or remove that one, or give this one that key if it is the same resource.`,
      );
    }
    // The one in the way is renamed by this deploy too: it steps aside first, so two can swap.
    moving.set(occupant.id, occupant);
  }

  for (const row of removed) {
    const tool = toolNameOf({ kind: row.kind, path: row.path, mcp: row.meta.mcp });
    if (tool !== undefined) {
      summary.breaking.push({
        path: row.path,
        message: `the tool ${tool} is removed with its ${row.kind}. An agent that calls it will fail.`,
      });
    }
    await deleteResource(trx, audit, workspace, row.path, kernel.hooks);
    summary.deleted += 1;
    note("deleted", row.kind, row.path);
  }
  for (const row of moving.values()) {
    await trx
      .updateTable("resource")
      .set({ path: swapPath(row.id) })
      .where("id", "=", row.id)
      .execute();
    await renamePathState(trx, data, workspace.id, row, row.path, swapPath(row.id));
  }

  for (const manifest of content.manifests) {
    const stored = matched.get(manifest);
    // An app, an interface and a form have a title in their body: that is their title.
    const inBody = (manifest.body as { title?: unknown }).title;
    const title = manifest.title ?? (typeof inBody === "string" && inBody ? inBody : null);
    const meta = metaOf(manifest);
    if (
      stored &&
      stored.path === manifest.path &&
      stored.schema_version === manifest.schemaVersion &&
      stored.ownership === manifest.ownership &&
      stored.title === title &&
      same(stored.meta, meta) &&
      same(stored.body, manifest.body)
    ) {
      summary.unchanged += 1;
      continue;
    }
    // The name of the tool an agent calls is public. A change that leaves the old name
    // answering nothing is said out loud; a rename leaves an alias, and the old name with it.
    const toolBefore = stored
      ? toolNameOf({ kind: stored.kind, path: stored.path, mcp: stored.meta.mcp })
      : undefined;
    const toolAfter = toolNameOf(manifest);
    if (
      stored &&
      toolBefore !== undefined &&
      toolBefore !== toolAfter &&
      (stored.meta.mcp !== undefined || stored.path === manifest.path)
    ) {
      summary.breaking.push({
        path: manifest.path,
        message: `the tool ${toolBefore} is now called ${toolAfter}. An agent that calls it by the old name will fail.`,
      });
    }
    const result = await putResource(kernel, trx, audit, workspace, {
      path: manifest.path,
      kind: manifest.kind,
      schemaVersion: manifest.schemaVersion,
      ownership: manifest.ownership,
      body: manifest.body,
      key: keyOf(manifest),
      title,
      meta,
      ...(stored ? { match: { id: stored.id } } : {}),
      ...(stored && moving.has(stored.id) ? { movedFrom: stored.path } : {}),
      // A resource taken over in the console, or handed back to the repository.
      switchOwnership: true,
    });
    for (const message of result.warnings) {
      summary.warnings.push({ path: manifest.path, message });
    }
    if (result.aliasRemoved) summary.aliasesRemoved.push(manifest.path);
    if (result.aliasRemoved && (manifest.kind === "script" || manifest.kind === "flow")) {
      summary.breaking.push({
        path: manifest.path,
        message: `the path ${manifest.path} is this ${manifest.kind}'s own again, so it and the tool named after it no longer reach the ${manifest.kind} that was renamed away from it.`,
      });
    }
    if (result.created) {
      summary.created += 1;
      note("created", manifest.kind, manifest.path);
    } else if (result.renamedFrom !== undefined) {
      summary.renamed += 1;
      note("renamed", manifest.kind, manifest.path, result.renamedFrom);
    } else {
      summary.updated += 1;
      note("updated", manifest.kind, manifest.path);
    }
  }

  // A binding or a role whose row is gone, though its definition did not change: a group
  // deleted and made again, for one. Its definition is applied again, so the access it gives
  // is what the bundle says. One that changed was applied just now.
  const unprojected = await sql<{
    id: string;
    kind: string;
    path: string;
    body: Record<string, unknown>;
  }>`
    select r.id, r.kind, r.path, r.body from resource r
    where r.workspace_id = ${workspace.id} and (
      (r.kind = 'binding' and not exists (select 1 from binding b where b.source_resource_id = r.id))
      or (r.kind = 'role' and not exists (select 1 from role o where o.source_resource_id = r.id))
    )
    order by r.kind desc, r.path
  `.execute(trx);
  for (const row of unprojected.rows) {
    await kernel.hooks.get(row.kind)?.apply(trx, {
      id: row.id,
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      path: row.path,
      body: row.body,
    });
  }
  // A binding that names a group or a service account by what it is called works until
  // someone changes what it is called. Each is named, with the key to use, on every deploy.
  for (const manifest of content.manifests) {
    if (manifest.kind !== "binding") continue;
    const principal = (manifest.body as { principal?: { type?: string; name?: string } }).principal;
    if (principal?.name === undefined || principal.type === undefined) continue;
    const table =
      principal.type === "group"
        ? "principal_group"
        : principal.type === "end_user_group"
          ? "end_user_group"
          : principal.type === "service_account"
            ? "service_account"
            : undefined;
    if (!table) continue;
    const named = await trx
      .selectFrom(table)
      .select("key")
      .where("tenant_id", "=", workspace.tenantId)
      .where("name", "=", principal.name)
      .executeTakeFirst();
    if (!named) continue;
    summary.warnings.push({
      path: manifest.path,
      message: `the binding ${manifest.path} names the ${principal.type.replaceAll("_", " ")} by its title "${principal.name}", which can change. Name it by key: "${named.key}".`,
    });
  }

  // Who may approve a step is found when the step begins to wait. A group the tenant does not
  // have, or one named by what it is called, is said now, where it can still be put right.
  for (const manifest of content.manifests) {
    if (manifest.kind !== "flow") continue;
    const nodes = (
      manifest.body as { nodes?: Record<string, { approvers?: { groups?: string[] } }> }
    ).nodes;
    for (const [node, body] of Object.entries(nodes ?? {})) {
      for (const named of body.approvers?.groups ?? []) {
        const found = await trx
          .selectFrom("principal_group")
          .select(["key", "name"])
          .where("tenant_id", "=", workspace.tenantId)
          .where((eb) => eb.or([eb("key", "=", named), eb("name", "=", named)]))
          .execute();
        if (found.some((group) => group.key === named)) continue;
        const byName = found[0];
        summary.warnings.push({
          path: manifest.path,
          message: byName
            ? `the step ${node} of ${manifest.path} names its approvers by the group's title "${named}", which can change. Name it by key: "${byName.key}".`
            : `the step ${node} of ${manifest.path} asks the group "${named}" to approve, and this tenant has no such group. Until it has, nobody in it can decide the step.`,
        });
      }
    }
  }

  if (
    summary.breaking.length > 0 &&
    current.type === "production" &&
    options.promotedFrom !== undefined &&
    !options.confirmBreaking
  ) {
    throw new HttpError(
      409,
      "breaking_changes",
      "Promoting this changes a name that something outside calls. Read each one, then promote again confirming them.",
      summary.breaking,
    );
  }

  // Asked once every rename is done: a renamed connection keeps what it was bound to.
  const needed = options.allowMissingBindings
    ? []
    : await missingBindings(trx, workspace, content.manifests);
  // A dev workspace takes a deploy with something unbound, and says so: a run that reaches it
  // fails with the same words. Production, and a promotion, refuse it.
  const warnOnly = current.type === "dev" && options.promotedFrom === undefined;
  summary.warnings.unshift(...(warnOnly ? needed : []));
  const missing = warnOnly ? [] : needed;
  if (missing.length > 0) {
    throw new HttpError(
      409,
      "bindings_missing",
      "The workspace is missing something this bundle needs. Bind each one, then deploy again.",
      missing,
    );
  }

  const unfit = unfitBindings(
    content.manifests,
    await trx
      .selectFrom("connection_binding")
      .select(["path", "config"])
      .where("workspace_id", "=", workspace.id)
      .execute(),
    await trx
      .selectFrom("connection_group_member")
      .select(["group_path as group", "key", "config"])
      .where("workspace_id", "=", workspace.id)
      .execute(),
  );
  if (unfit.length > 0) {
    throw new HttpError(
      409,
      "bindings_invalid",
      "Something bound in this workspace does not fit the connector this bundle gives it. Bind it again, then deploy again.",
      unfit,
    );
  }

  // Every table is in place now, so a reference to a table that is not there is a mistake.
  await reconcileReferences(data, workspace.id, true);
  summary.data = describeChanges(dataBefore, await loadCatalog(data, workspace.id));

  const id = newId();
  await trx
    .updateTable("workspace")
    .set({ active_bundle_id: bundle.id })
    .where("id", "=", workspace.id)
    .execute();
  const deployment = await trx
    .insertInto("deployment")
    .values({
      id,
      tenant_id: workspace.tenantId,
      workspace_id: workspace.id,
      bundle_id: bundle.id,
      previous_bundle_id: current.active_bundle_id,
      promoted_from_workspace_id: options.promotedFrom ?? null,
      summary: JSON.stringify(summary),
      message: options.message ?? null,
      created_by_type: principal.type,
      created_by_id: principal.id,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const draftsSettled = await settleDrafts(trx, workspace.id, content.manifests, options.settle);
  await audit({
    action: "deployment.created",
    targetType: "deployment",
    targetId: id,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    details: {
      bundleId: bundle.id,
      version: bundle.version,
      previousBundleId: current.active_bundle_id,
      promotedFromWorkspaceId: options.promotedFrom ?? null,
      created: summary.created,
      updated: summary.updated,
      unchanged: summary.unchanged,
      deleted: summary.deleted,
      data: summary.data,
      ...(draftsSettled.length > 0 ? { draftsSettled } : {}),
    },
  });
  return { deployment, bundle, summary, draftsSettled };
}

/**
 * The removals that look like a rename done as a delete and a create: the
 * resource holds something a new one would not get, and the same deploy makes
 * another of its kind. A table whose successor names it in `renamedFrom` is a
 * rename said properly, and keeps its rows.
 */
async function suspectedRenames(
  trx: Trx,
  data: Trx,
  workspace: WorkspaceRef,
  removed: { id: string; key: string; path: string; kind: string }[],
  created: BundleManifest[],
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
): Promise<{ path: string; message: string }[]> {
  const suspected: { path: string; message: string }[] = [];
  for (const row of removed) {
    const successors = created.filter((manifest) => manifest.kind === row.kind);
    if (successors.length === 0) continue;
    if (
      row.kind === "table" &&
      successors.some(
        (manifest) => (manifest.body as { renamedFrom?: string }).renamedFrom === row.path,
      )
    ) {
      continue;
    }
    const holds: string[] = [];
    if (row.kind === "script") {
      const run = await trx
        .selectFrom("run")
        .select("id")
        .where("workspace_id", "=", workspace.id)
        .where("resource_id", "=", row.id)
        .limit(1)
        .executeTakeFirst();
      if (run) holds.push("runs");
    }
    if (row.kind === "flow") {
      const run = await trx
        .selectFrom("flow_run")
        .select("id")
        .where("workspace_id", "=", workspace.id)
        .where("resource_id", "=", row.id)
        .limit(1)
        .executeTakeFirst();
      if (run) holds.push("runs");
    }
    // Access given to it by hand. What a bundle gives is given again by the bundle.
    const binding = await trx
      .selectFrom("binding")
      .select("id")
      .where("resource_id", "=", row.id)
      .where("source_resource_id", "is", null)
      .limit(1)
      .executeTakeFirst();
    if (binding) holds.push("access given to it");
    if (row.kind === "table") {
      const table = catalog.find(
        (candidate) => candidate.name === row.path && candidate.status === "active",
      );
      if (table) {
        const any = await sql<{ one: number }>`select 1 as one from ${sql.id(
          workspaceSchema(workspace.id),
          table.physicalName,
        )} limit 1`.execute(data);
        if (any.rows.length > 0) holds.push("rows");
      }
    }
    if (holds.length === 0) continue;
    const others = successors.map((manifest) => manifest.path);
    const named =
      others.length > 3 ? `${others.slice(0, 3).join(", ")} and others` : others.join(", ");
    suspected.push({
      path: row.path,
      message:
        `the ${row.kind.replaceAll("_", " ")} "${row.path}" has ${holds.join(" and ")}, and this deploy creates ${named}. ` +
        (row.kind === "table"
          ? `If one of them is it renamed, give that one key: "${row.key}". `
          : `If one of them is it renamed, give that one key: "${row.key}". `) +
        `To delete it, allow "${row.path}" by name (--allow-delete ${row.path}).`,
    });
  }
  return suspected;
}

/**
 * Removes the workspace's drafts that a deploy made true: one whose files are
 * the files of what is now deployed at its path, and a removal whose path is
 * no longer there. Compared as the files the repository would hold, so how a
 * draft keeps its code does not matter. A deploy from the CLI or from Git of
 * what was pulled from the console leaves nothing behind on the Changes screen.
 */
export async function settleDrafts(
  trx: Trx,
  workspaceId: string,
  manifests: BundleManifest[],
  carried: { path: string; revision: number }[] = [],
): Promise<string[]> {
  const drafts = await trx
    .selectFrom("resource_draft")
    .select(["path", "kind", "schema_version", "body", "deleted", "revision"])
    .where("workspace_id", "=", workspaceId)
    .execute();
  if (drafts.length === 0) return [];
  const deployed = new Map(
    manifests
      .filter((manifest) => manifest.ownership === "ui")
      .map((manifest) => [manifest.path, manifest]),
  );
  const filesOf = (manifest: BundleManifest) =>
    JSON.stringify(renderResourceFiles([manifest], platformKinds));
  const taken = new Map(carried.map((one) => [one.path, one.revision]));
  const settled = drafts
    .filter((draft) => {
      if (taken.get(draft.path) === draft.revision) return true;
      const there = deployed.get(draft.path);
      if (draft.deleted) return !manifests.some((manifest) => manifest.path === draft.path);
      if (!there || there.kind !== draft.kind) return false;
      return (
        filesOf(there) ===
        filesOf({
          kind: draft.kind,
          schemaVersion: draft.schema_version,
          path: draft.path,
          ownership: "ui",
          body: draft.body as Record<string, unknown>,
        })
      );
    })
    .map((draft) => draft.path);
  if (settled.length > 0) {
    await trx
      .deleteFrom("resource_draft")
      .where("workspace_id", "=", workspaceId)
      .where("path", "in", settled)
      .execute();
  }
  return settled;
}

const KIND_ORDER = [
  "role",
  "connector",
  "connection",
  "connection_group",
  "variable",
  "table",
  "data_source",
  "event",
  "script",
  "trigger_source",
  // Before the schedules that start them.
  "flow",
  "schedule",
  "trigger",
  "theme",
  "interface",
  "app",
  "binding",
];
/** Where a kind comes when resources are applied: what others refer to goes first. */
export const order = (kind: string) => KIND_ORDER.indexOf(kind);
