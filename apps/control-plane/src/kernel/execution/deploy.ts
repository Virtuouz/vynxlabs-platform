import { newId } from "@vynxlabs/db";
import { type BundleManifest, bundleCompatibility } from "@vynxlabs/manifest";
import type { Audit, Principal, Trx } from "../audit.js";
import { loadCatalog, reconcileReferences } from "../data/apply.js";
import { describeChanges } from "../data/plan.js";
import { HttpError, notFound } from "../errors.js";
import type { WorkspaceRef } from "../http.js";
import type { Kernel } from "../kernel.js";
import { deleteResource, putResource } from "../resources.js";
import { loadBundle } from "./bundles.js";

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

/** One resource a deploy created, changed or removed. */
export interface ResourceChange {
  change: "created" | "updated" | "deleted";
  kind: string;
  path: string;
}
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
  } = {},
) {
  const current = await trx
    .selectFrom("workspace")
    .select(["active_bundle_id"])
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
  const missing = options.allowMissingBindings
    ? []
    : await missingBindings(trx, workspace, content.manifests);
  if (missing.length > 0) {
    throw new HttpError(
      409,
      "bindings_missing",
      "The workspace is missing something this bundle needs. Bind each one, then deploy again.",
      missing,
    );
  }

  const existing = await trx
    .selectFrom("resource")
    .select(["id", "path", "kind", "schema_version", "body", "ownership"])
    .where("workspace_id", "=", workspace.id)
    .execute();
  const byPath = new Map(existing.map((row) => [row.path, row]));
  const summary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    data: [] as string[],
    changes: [] as ResourceChange[],
  };
  const note = (change: ResourceChange["change"], kind: string, path: string) => {
    if (summary.changes.length < MAX_LISTED_CHANGES) summary.changes.push({ change, kind, path });
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
      for (const manifest of (await loadBundle(kernel, before)).manifests) {
        if (manifest.ownership === "ui") carried.add(manifest.path);
      }
    }
  }
  // Resources the bundle no longer has go first, so a path can be reused by another kind.
  const wanted = new Set(content.manifests.map((manifest) => manifest.path));
  const removed = existing
    .filter((row) => (row.ownership === "code" || carried.has(row.path)) && !wanted.has(row.path))
    // Bindings and triggers before the roles and scripts they refer to.
    .sort((a, b) => order(b.kind) - order(a.kind));
  for (const row of removed) {
    await deleteResource(trx, audit, workspace, row.path, kernel.hooks);
    summary.deleted += 1;
    note("deleted", row.kind, row.path);
  }

  for (const manifest of content.manifests) {
    const stored = byPath.get(manifest.path);
    if (
      stored &&
      stored.kind === manifest.kind &&
      stored.schema_version === manifest.schemaVersion &&
      stored.ownership === manifest.ownership &&
      same(stored.body, manifest.body)
    ) {
      summary.unchanged += 1;
      continue;
    }
    const result = await putResource(kernel, trx, audit, workspace, {
      path: manifest.path,
      kind: manifest.kind,
      schemaVersion: manifest.schemaVersion,
      ownership: manifest.ownership,
      body: manifest.body,
      // A resource taken over in the console, or handed back to the repository.
      switchOwnership: true,
    });
    if (result.created) summary.created += 1;
    else summary.updated += 1;
    note(result.created ? "created" : "updated", manifest.kind, manifest.path);
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
    },
  });
  return { deployment, bundle, summary };
}

const KIND_ORDER = [
  "role",
  "connection",
  "variable",
  "table",
  "data_source",
  "event",
  "script",
  "schedule",
  "trigger",
  "flow",
  "theme",
  "app",
  "binding",
];
/** Where a kind comes when resources are applied: what others refer to goes first. */
export const order = (kind: string) => KIND_ORDER.indexOf(kind);
