import { dataRoleName, openExternalPostgres, sql } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { workspaceSchema } from "./kernel/data/apply.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * HOST-01, HOST-02: what a restore of `pg_dump` onto another server leaves, made here
 * without `pg_dump`. A tenant's tables are in a database of their own, with an open, an
 * owner and a rules table and a row each. Then the database is made as a restore leaves it,
 * the instance opens it again, and a caller reads and writes.
 */
const PASSWORD = "a-good-long-password";
let t: TestApp;
let alice: Client;
let tenant: string;
let workspace: string;
let database: TestDatabase;
const toDrop: string[] = [];

const table = (path: string, body: Record<string, unknown>): BundleManifest => ({
  kind: "table",
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const rows = (name: string) => `/tenants/${tenant}/workspaces/${workspace}/rows/${name}`;
const count = async (name: string) =>
  ((await alice.get(rows(name))).body.items as unknown[]).length;
const nameOf = (connectionString: string) => new URL(connectionString).pathname.slice(1);
const as = (name: string) => {
  const url = new URL(database.connectionString);
  url.pathname = `/${name}`;
  return url.toString();
};

/** A connection to the database as the platform's own user, which owns what is in it. */
function ownerOf(name: string) {
  const url = new URL(as(name));
  return openExternalPostgres({
    host: url.hostname,
    port: Number(url.port),
    database: name,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  });
}

/** Points the tenant's location at the database under `name`, as a restored one is. */
async function reopenAt(name: string) {
  await t.kernel.data.forget("restored");
  await sql`update database_location set connection_encrypted = ${t.kernel.data.seal("restored", as(name))} where name = 'restored'`.execute(
    t.db,
  );
  t.kernel.data.forgetTenant(tenant);
}
async function closeConnectionsTo(name: string) {
  await sql`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${name} and pid <> pg_backend_pid()`.execute(
    t.db,
  );
}

beforeAll(async () => {
  t = await startTestApp();
  database = await createTestDatabase();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const put = await t.admin.put("/instance/database-locations/restored", {
    connectionString: database.connectionString,
    description: "restore",
  });
  expect(put.status).toBe(204);
  const created = await t.admin.post("/tenants", {
    slug: "restore",
    name: "restore",
    dataLocation: "restored",
  });
  tenant = created.body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "a@restore.example",
    name: "a",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("a@restore.example", PASSWORD);
  workspace = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      table("open", { columns: { label: { type: "text" } } }),
      table("owner", {
        columns: { label: { type: "text" }, owner_id: { type: "uuid" } },
        policy: { type: "owner", column: "owner_id" },
      }),
      table("rules", {
        columns: { label: { type: "text" } },
        policy: { type: "rules", rules: [{ allow: "write", when: { everyone: true } }] },
      }),
    ],
    code: "export const marker = '';",
  };
  const uploaded = await alice.post(`/tenants/${tenant}/workspaces/${workspace}/bundles`, {
    ...unsigned,
    digest: bundleDigest(unsigned),
  });
  const deployed = await alice.post(`/tenants/${tenant}/workspaces/${workspace}/deployments`, {
    bundleId: uploaded.body.id,
  });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  for (const name of ["open", "owner", "rules"]) {
    expect((await alice.post(rows(name), { label: "kept" })).status).toBe(201);
  }
}, 90_000);

afterAll(async () => {
  await t.stop();
  for (const name of toDrop) {
    await sql
      .raw(`drop database if exists "${name}" with (force)`)
      .execute(t.db)
      .catch(() => {});
    await sql
      .raw(`drop role if exists "${dataRoleName(name)}"`)
      .execute(t.db)
      .catch(() => {});
  }
  await database.drop();
}, 30_000);

describe("a database restored onto another server", () => {
  test("whose policies and role are missing is read and written again once opened", async () => {
    const name = nameOf(database.connectionString);
    await t.kernel.data.forget("restored");
    await closeConnectionsTo(name);
    // The dump has the tables, rows and row security, and no policy: each names a role that was not there.
    const schema = workspaceSchema(workspace);
    const owner = ownerOf(name);
    for (const physical of ["t_open", "t_owner", "t_rules"]) {
      for (const policy of ["rows", "rows_read", "rows_insert", "rows_update", "rows_delete"]) {
        await sql
          .raw(`drop policy if exists ${policy} on "${schema}"."${physical}"`)
          .execute(owner);
      }
    }
    const role = dataRoleName(name);
    await sql.raw(`drop owned by "${role}"`).execute(owner);
    await owner.destroy();
    await sql.raw(`drop role "${role}"`).execute(t.db);
    await reopenAt(name);
    expect([await count("open"), await count("owner"), await count("rules")]).toEqual([1, 1, 1]);
    expect((await alice.post(rows("rules"), { label: "again" })).status).toBe(201);
    expect((await alice.post(rows("open"), { label: "again" })).status).toBe(201);
  });

  test("under another database name is read and written again once opened", async () => {
    const before = nameOf(database.connectionString);
    const after = `${before}_renamed`;
    toDrop.push(after);
    await t.kernel.data.forget("restored");
    await closeConnectionsTo(before);
    await sql.raw(`alter database "${before}" rename to "${after}"`).execute(t.db);
    // Policies are still handed to the old name's role, which exists on this server.
    await reopenAt(after);
    expect(await count("open")).toBeGreaterThanOrEqual(1);
    expect(await count("owner")).toBeGreaterThanOrEqual(1);
    expect(await count("rules")).toBeGreaterThanOrEqual(1);
    expect((await alice.post(rows("rules"), { label: "renamed" })).status).toBe(201);
    // Left as it was for the drop.
    await t.kernel.data.forget("restored");
    await closeConnectionsTo(after);
    await sql.raw(`alter database "${after}" rename to "${before}"`).execute(t.db);
  });
});
