import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Database, type Kysely, type PlatformSchema, sql } from "@vynxlabs/db";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { workspaceSchema } from "./kernel/data/apply.js";
import { revealSecret } from "./kernel/secrets.js";
import { OWNED_TABLES } from "./kernel/tenancy/tables.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * Upgrades that skip versions. An instance may be upgraded from any earlier
 * release straight to the newest, so every migration must work on a database
 * that holds real data and has not seen the application code in between.
 *
 * One instance at the newest version is filled the ordinary way. For each
 * earlier database level, a fresh database is migrated only that far and
 * given the same data, cut down to the tables and columns that existed then.
 * The application is then started on it, which migrates the rest of the way,
 * and is asked for the data back.
 */
const PASSWORD = "a-good-long-password";
const NEWEST = readdirSync(
  fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url)),
).filter((name) => /^\d{4}_.*\.sql$/.test(name)).length;

let source: TestApp;
let tenant: string;
let main: string;
let alice: Client;
let hookPath: string;
let runCount: number;

// biome-ignore lint/suspicious/noExplicitAny: rows are copied whatever their shape
type Any = any;
const m = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
function bundle(): Bundle {
  const object = { type: "object" };
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      m("connection", "api", { connector: "http" }),
      m("variable", "batch", { default: "10" }),
      m("event", "ping", { payload: object }),
      m("script", "job", {
        entry: "job",
        input: object,
        output: object,
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: ["api"], secrets: ["TOKEN"], variables: ["batch"] },
      }),
      m("schedule", "nightly", { script: "job", cron: "0 3 * * *" }),
      m("trigger", "hook", { type: "webhook", script: "job" }),
      m("trigger", "on-ping", { type: "event", script: "job", event: "ping" }),
    ],
    code: "export const job = { execute: async () => ({}) };",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
const ws = () => `/tenants/${tenant}/workspaces/${main}`;

beforeAll(async () => {
  source = await startTestApp();
  const roles = Object.fromEntries(
    (
      await source.db
        .selectFrom("role")
        .select(["id", "name"])
        .where("builtin", "=", true)
        .execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await source.admin.post("/tenants", { slug: "acme", name: "Acme Corp" })).body.id;
  const grant = await source.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await source.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "Alice",
    password: PASSWORD,
  });
  await source.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await source.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await source.signIn("alice@acme.example", PASSWORD);
  main = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  await alice.put(`${ws()}/connection-bindings/api`, {
    config: { baseUrl: "http://api.example", auth: { type: "bearer" } },
    credential: "the-api-key",
  });
  await alice.put(`${ws()}/secrets/TOKEN`, { value: "the-secret-value" });
  await alice.put(`${ws()}/variable-values/batch`, { value: "25" });
  const uploaded = await alice.post(`${ws()}/bundles`, bundle());
  const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  await alice.post(`${ws()}/events`, { name: "ping", payload: { n: 1 } });
  await alice.post(`${ws()}/runs`, { script: "job", input: { by: "hand" } });
  // No queue comes along with the data, so nothing may be left waiting in it.
  for (const run of (await alice.get(`${ws()}/runs`)).body.items) {
    await alice.post(`${ws()}/runs/${run.id}/cancel`);
  }
  runCount = (await alice.get(`${ws()}/runs`)).body.items.length;
  hookPath = new URL(
    (await alice.get(`${ws()}/triggers`)).body.items.find((item: Any) => item.path === "hook").url,
  ).pathname;
  const made = await alice.put(`${ws()}/resources/legacy`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body: {
      columns: { name: { type: "text", required: true }, owner_id: { type: "uuid" } },
      policy: { type: "owner", column: "owner_id" },
    },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  await alice.post(`${ws()}/rows/legacy`, { rows: [{ name: "kept one" }, { name: "kept two" }] });
}, 60_000);

afterAll(async () => {
  await source.stop();
});

/** Rows of one table, as JSON the database can turn back into rows. */
async function rowsOf(db: Kysely<PlatformSchema>, query: ReturnType<typeof sql>): Promise<Any[]> {
  return (
    await sql<{ row: Any }>`select to_jsonb(t) as row from (${query}) as t`.execute(db)
  ).rows.map((found) => found.row);
}

/** Gives a database at an earlier level the source's data, as far as that level can hold it. */
async function fill(database: Database, level: number) {
  const target = database.router.platform();
  const there = new Set(
    (
      await sql<{ name: string }>`
        select table_name as name from information_schema.tables where table_schema = 'public'
      `.execute(target)
    ).rows.map((row) => row.name),
  );
  const put = async (table: string, rows: Any[]) => {
    if (!there.has(table) || rows.length === 0) return;
    await sql`
      insert into ${sql.table(table)} overriding system value
      select (jsonb_populate_record(null::${sql.table(table)}, e)).*
      from jsonb_array_elements(${JSON.stringify(rows)}::jsonb) as e
    `.execute(target);
  };
  const all = (table: string) => rowsOf(source.db, sql`select * from ${sql.table(table)}`);

  await put("tenant", await all("tenant"));
  await put("member", await all("member"));
  await put("member_account", await all("member_account"));
  // Built-in roles come from the migrations themselves.
  await put(
    "role",
    await rowsOf(source.db, sql`select * from role where not builtin and tenant_id is null`),
  );
  for (const entry of OWNED_TABLES) {
    let rows = await rowsOf(
      source.db,
      sql`select t.* from ${sql.table(entry.table)} as t where ${entry.ofTenant(tenant)}`,
    );
    if (entry.table === "workspace") {
      // Its bundle is not there yet.
      rows = rows.map((row) => ({ ...row, active_bundle_id: null }));
    }
    if (entry.table === "trigger_state" && level < 10) {
      // Before flows, a trigger belonged to one script and listened for no events.
      rows = rows
        .filter((row) => row.type !== "event")
        .map((row) => ({ ...row, script_path: row.target_path }));
    }
    await put(entry.table, rows);
  }
  // The operator's own binding is at the instance, not in the tenant.
  await put("binding", await rowsOf(source.db, sql`select * from binding where tenant_id is null`));
  if (there.has("bundle")) {
    for (const workspace of await all("workspace")) {
      await sql`update workspace set active_bundle_id = ${workspace.active_bundle_id} where id = ${workspace.id}`.execute(
        target,
      );
    }
  }

  // Custom tables, as phase 4 left them: catalog rows tied to the platform's
  // tables, and one server-wide role named in every grant and policy.
  if (there.has("data_table")) {
    await put("data_table", await all("data_table"));
    await put("data_column", await all("data_column"));
    const schema = workspaceSchema(main);
    const allowed = `current_setting('app.data_all', true) = 'on' or owner_id::text = current_setting('app.principal', true)`;
    await sql
      .raw(`
        create schema ${schema};
        grant usage on schema ${schema} to platform_data;
        create table ${schema}.t_legacy (
          id uuid primary key,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          name text not null,
          owner_id uuid
        );
        alter table ${schema}.t_legacy enable row level security;
        grant select, insert, update, delete on ${schema}.t_legacy to platform_data;
        create policy rows on ${schema}.t_legacy for all to platform_data using (${allowed}) with check (${allowed});
      `)
      .execute(target);
    const kept = await rowsOf(source.db, sql`select * from ${sql.id(schema, "t_legacy")}`);
    await sql`
      insert into ${sql.id(schema, "t_legacy")}
      select (jsonb_populate_record(null::${sql.id(schema, "t_legacy")}, e)).*
      from jsonb_array_elements(${JSON.stringify(kept)}::jsonb) as e
    `.execute(target);
  }
}

describe("upgrading from every earlier database level", () => {
  const levels = Array.from({ length: NEWEST - 1 }, (_, index) => index + 1);

  test("there are earlier levels to upgrade from", () => {
    expect(NEWEST).toBeGreaterThanOrEqual(17);
  });

  test.each(levels)("from level %i straight to the newest, with data", async (level) => {
    const upgraded = await startTestApp({
      storage: source.kernel.storage,
      // The same instance, a later version: its keys are the ones it always had.
      config: { masterKey: source.kernel.config.masterKey },
      prepare: async (database) => {
        const reached = await database.migrate(level);
        expect(reached.level).toBe(level);
        await fill(database, level);
      },
    });
    try {
      expect(await upgraded.kernel.migrationLevel()).toBe(NEWEST);
      const { db } = upgraded;
      const acme = await db
        .selectFrom("tenant")
        .selectAll()
        .where("id", "=", tenant)
        .executeTakeFirstOrThrow();
      // What later versions added is filled in for a tenant that predates it.
      expect(acme).toMatchObject({
        slug: "acme",
        data_location: { kind: "shared" },
        managed_workers: true,
      });
      // Tenancy arrived at level 3, permissions at 5: before that there was nobody to ask as.
      if (level < 5) return;

      const operator = upgraded.admin;
      expect(
        (await operator.get("/tenants?limit=200")).body.items.map((item: Any) => item.slug),
      ).toEqual(["acme"]);
      // A member signs in with the password they had before the upgrade.
      const member = await upgraded.signIn("alice@acme.example", PASSWORD);
      const workspace = (await member.get(ws())).body;
      expect(workspace).toMatchObject({
        slug: "main",
        type: "production",
        triggersPaused: false,
        linkedWorkspaceId: null,
      });

      if (level >= 6) {
        expect(
          await revealSecret(db, upgraded.kernel.vault, {
            tenantId: tenant,
            workspaceId: main,
            name: "TOKEN",
          }),
        ).toBe("the-secret-value");
      }
      if (level >= 7) {
        const actions = (await member.get(`/tenants/${tenant}/audit?limit=200`)).body.items.map(
          (entry: Any) => entry.action,
        );
        expect(actions).toEqual(expect.arrayContaining(["tenant.created", "workspace.created"]));
      }
      if (level >= 8) {
        expect((await member.get(`${ws()}/bundles`)).body.items).toEqual([
          expect.objectContaining({ active: true, digest: bundle().digest }),
        ]);
        const runs = (await member.get(`${ws()}/runs`)).body.items;
        expect(runs).toHaveLength(runCount);
        const run = (await member.get(`${ws()}/runs/${runs[0].id}`)).body;
        expect(run).toMatchObject({ status: "cancelled", pool: null, waitingFor: null });
        expect((await member.get(`${ws()}/deployments`)).body.items[0]).toMatchObject({
          promotedFromWorkspaceId: null,
        });
        expect((await member.get(`${ws()}/connection-bindings`)).body.items[0]).toMatchObject({
          path: "api",
          bound: true,
          hasCredential: true,
        });
        // The webhook keeps its address, and the queue works: a call starts a run.
        const hook = (await member.get(`${ws()}/triggers`)).body.items.find(
          (item: Any) => item.path === "hook",
        );
        expect(new URL(hook.url).pathname).toBe(hookPath);
        const called = await upgraded.app.inject({ method: "POST", url: hookPath, payload: {} });
        expect(called.statusCode).toBe(202);
        // A deploy of the same bundle finds everything in place.
        const again = await member.post(`${ws()}/deployments`, {
          bundleId: (await member.get(`${ws()}/bundles`)).body.items[0].id,
        });
        expect(again.status, JSON.stringify(again.body)).toBe(201);
        expect(again.body.summary).toMatchObject({ created: 0, deleted: 0 });
      }
      if (level >= 10) {
        expect((await member.get(`${ws()}/events?name=ping`)).body.items).toHaveLength(1);
        expect(
          (await member.post(`${ws()}/events`, { name: "ping", payload: {} })).body.started,
        ).toBe(1);
      }
      if (level >= 12) {
        // Tables made under the earlier role are read and written through the new sign-in.
        const rows = (await member.get(`${ws()}/rows/legacy?sort=name`)).body;
        expect(
          rows.items?.map((row: Any) => row.name),
          JSON.stringify(rows),
        ).toEqual(["kept one", "kept two"]);
        const added = await member.post(`${ws()}/rows/legacy`, {
          name: "written after the upgrade",
        });
        expect(added.status, JSON.stringify(added.body)).toBe(201);
        expect((await member.get(`${ws()}/tables`)).body.items).toEqual([
          expect.objectContaining({ name: "legacy", managedIn: "ui", rowCount: 3 }),
        ]);
        // And a change to the table still goes through.
        const changed = await member.put(`${ws()}/resources/legacy`, {
          kind: "table",
          schemaVersion: 1,
          ownership: "ui",
          body: {
            columns: {
              name: { type: "text", required: true },
              owner_id: { type: "uuid" },
              done: { type: "boolean", default: false },
            },
            policy: { type: "owner", column: "owner_id" },
          },
        });
        expect(changed.status, JSON.stringify(changed.body)).toBe(200);
        expect((await member.get(`${ws()}/rows/legacy?sort=name`)).body.items[0]).toMatchObject({
          name: "kept one",
          done: false,
        });
      }
      // Whatever it came from, the tenant can now be taken out whole.
      const exported = await member.post(`/tenants/${tenant}/exports`, {
        passphrase: "a long enough passphrase",
      });
      expect(exported.status).toBe(200);
      expect(exported.bytes.toString("latin1")).toContain('"format": "vynxlabs-tenant-export"');
    } finally {
      await upgraded.stop();
    }
  });
});
