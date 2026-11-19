import { type Kysely, type PlatformSchema, sql } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { workspaceSchema } from "./kernel/data/apply.js";
import { querySchema } from "./kernel/data/query/views.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * Read-only SQL over a workspace's tables (Decision 0003). Each guard is tried
 * here against a real database: what a query may read, as whom, and what it
 * may not do. Run with the tenant's tables in the platform database, and in a
 * database of their own (queries-dedicated.test.ts).
 */

const PASSWORD = "a-good-long-password";
const DEDICATED = process.env.VX_DATA_MODE === "dedicated";

let t: TestApp;
let data: Kysely<PlatformSchema>;
let dedicatedDb: TestDatabase | undefined;
let tenant: string;
let dev: string;
let alice: Client; // tenant admin: every row
let carol: { id: string; client: Client }; // rows and SQL, held to row policy
let dave: { id: string; client: Client }; // the same
let erin: { id: string; client: Client }; // SQL, and rows of one table only
let frank: { id: string; client: Client }; // rows, and no SQL
let viewer: Client;
let roles: Record<string, string>;

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
type Any = any;

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;
const run = (client: Client, text: string, params?: unknown[], limit?: number) =>
  client.post(`${ws()}/queries/run`, {
    sql: text,
    ...(params ? { params } : {}),
    ...(limit ? { limit } : {}),
  });
/** A result as objects, by column name. */
const rowsOf = (body: Any): Any[] =>
  body.rows.map((row: unknown[]) =>
    Object.fromEntries(
      body.columns.map((column: { name: string }, at: number) => [column.name, row[at]]),
    ),
  );
const refusedFor = async (client: Client, text: string) => {
  const answer = await run(client, text);
  expect(answer.status, `${text}\n${JSON.stringify(answer.body)}`).toBe(400);
  return `${answer.body.detail} ${JSON.stringify(answer.body.errors ?? [])}`;
};
const put = (name: string, columns: Record<string, object>, extra: object = {}) =>
  alice.put(`${ws()}/resources/${name}`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body: { columns, ...extra },
  });

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  if (DEDICATED) {
    dedicatedDb = await createTestDatabase();
    const registered = await t.admin.put("/instance/database-locations/acme-db", {
      connectionString: dedicatedDb.connectionString,
      description: "Acme's own database",
    });
    expect(registered.status, JSON.stringify(registered.body)).toBe(204);
  }
  const created = await t.admin.post("/tenants", {
    slug: "acme",
    name: "acme",
    ...(DEDICATED ? { dataLocation: "acme-db" } : {}),
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  tenant = created.body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const admin = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: admin.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;

  const role = async (name: string, permissions: string[]) =>
    (await alice.post(`/tenants/${tenant}/roles`, { name, permissions })).body.id as string;
  const analyst = await role("analyst", ["data:read", "data:write", "sql:read"]);
  const sqlOnly = await role("sql_only", ["sql:read"]);
  const rowsOnly = await role("rows_only", ["data:read", "data:write"]);
  roles.rows_at_one = await role("rows_at_one", ["data:read"]);
  const member = async (name: string, roleId: string | null) => {
    const made = await alice.post(`/tenants/${tenant}/members`, {
      email: `${name}@acme.example`,
      name,
      password: PASSWORD,
    });
    if (roleId) {
      await alice.post(`/tenants/${tenant}/bindings`, {
        principalType: "member",
        principalId: made.body.id,
        roleId,
      });
    }
    return {
      id: made.body.id as string,
      client: await t.signIn(`${name}@acme.example`, PASSWORD),
    };
  };
  carol = await member("carol", analyst);
  dave = await member("dave", analyst);
  erin = await member("erin", sqlOnly);
  frank = await member("frank", rowsOnly);
  viewer = (await member("vera", roles.viewer as string)).client;

  expect(
    (
      await put(
        "devices",
        { name: { type: "text", required: true }, kind: { type: "text" } },
        { display: "name" },
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await put(
        "lending/loans",
        {
          device: { type: "reference", references: "devices" },
          status: { type: "enum", values: ["out", "back", "late"], default: "out" },
          fee: { type: "integer" },
          due: { type: "date" },
          note: { type: "text" },
          owner_id: { type: "uuid" },
        },
        { policy: { type: "owner", column: "owner_id" } },
      )
    ).status,
  ).toBe(201);
  // Erin may read rows of the devices, and of nothing else.
  const devices = (await alice.get(`${ws()}/resources/devices`)).body;
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: dev,
    resourceId: devices.id,
    principalType: "member",
    principalId: erin.id,
    roleId: roles.rows_at_one,
  });

  const device = async (name: string, kind: string) =>
    (await alice.post(`${ws()}/rows/devices`, { name, kind })).body.items[0].id as string;
  const laptop = await device("Laptop", "computer");
  const tablet = await device("Tablet", "computer");
  const camera = await device("Camera", "av");
  const loan = (client: Client, row: object) => client.post(`${ws()}/rows/lending/loans`, row);
  // A row written by a person with no owner given becomes theirs.
  await loan(carol.client, { device: laptop, status: "out", fee: 10, due: "2026-12-01" });
  await loan(carol.client, { device: camera, status: "late", fee: 30, due: "2026-11-01" });
  await loan(dave.client, { device: tablet, status: "back", fee: 5, due: "2026-11-10" });
  await loan(dave.client, {
    device: laptop,
    status: "late",
    fee: 40,
    due: "2026-10-20",
    note: "dave's secret",
  });
  data = (await t.kernel.data.forTenant(tenant)).owner;
}, 90_000);

afterAll(async () => {
  await t.stop();
  await dedicatedDb?.drop();
});

describe("asking a question across tables", () => {
  test("a join, a total and a filter with parameters, read by the tables' own names", async () => {
    const answer = await run(
      alice,
      `select d.name, count(*) as loans, sum(l.fee) as fees
       from "lending/loans" l join devices d on d.id = l.device
       where l.fee >= $1 group by d.name order by fees desc`,
      [10],
    );
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.columns.map((column: Any) => column.name)).toEqual([
      "name",
      "loans",
      "fees",
    ]);
    expect(rowsOf(answer.body)).toEqual([
      { name: "Laptop", loans: 2, fees: 50 },
      { name: "Camera", loans: 1, fees: 30 },
    ]);
    expect(answer.body.tables).toEqual(["devices", "lending/loans"]);
    expect(answer.body.truncated).toBe(false);
    // What ran is what was read of the text, over the workspace's views.
    expect(answer.body.sql).toContain(`${querySchema(dev)}."lending/loans"`);
  });

  test("dates, enums and what a table shows for a row come through as they are", async () => {
    const answer = await run(
      alice,
      `select status, due, due < date '2026-11-05' as early, created_at
       from "lending/loans" order by due limit 1`,
    );
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    const [row] = rowsOf(answer.body);
    expect(row).toMatchObject({ status: "late", early: true });
    expect(String(row.created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("a result is cut at the limit and says so, and the wrong number of parameters is refused", async () => {
    const cut = await run(alice, `select generate_series(1, 50) as n`, undefined, 20);
    expect(cut.body.rows).toHaveLength(20);
    expect(cut.body.truncated).toBe(true);
    const whole = await run(alice, `select generate_series(1, 20) as n`, undefined, 20);
    expect(whole.body.truncated).toBe(false);
    expect((await run(alice, "select $1::int + $2::int as n", [1])).status).toBe(400);
    expect((await run(alice, "select 1 as n", [1])).status).toBe(400);
    expect(rowsOf((await run(alice, "select $1::int + $2::int as n", [1, 2])).body)).toEqual([
      { n: 3 },
    ]);
  });

  test("a mistake Postgres finds is answered as the author's, in its own words", async () => {
    const column = await run(alice, `select nope from devices`);
    expect(column.status).toBe(400);
    expect(JSON.stringify(column.body)).toContain("nope");
    expect((await run(alice, `select 1 / (fee - fee) from "lending/loans"`)).status).toBe(400);
    expect((await run(alice, `select 'x'::int`)).status).toBe(400);
  });

  test("the editor is told the tables a person may read, their columns, and the functions allowed", async () => {
    const all = (await alice.get(`${ws()}/queries/schema`)).body;
    expect(all.tables.map((table: Any) => table.name)).toEqual(["devices", "lending/loans"]);
    const loans = all.tables.find((table: Any) => table.name === "lending/loans");
    expect(loans.columns.find((column: Any) => column.name === "status")).toMatchObject({
      type: "enum",
      values: [{ value: "out" }, { value: "back" }, { value: "late" }],
    });
    expect(loans.columns.find((column: Any) => column.name === "device").references).toBe(
      "devices",
    );
    expect(all.tables[0].display).toBe("name");
    expect(all.functions).toContain("date_trunc");
    expect(all.functions).not.toContain("set_config");
    // And whether they may write SQL of their own, so a screen need not offer what would be refused.
    expect(all.maySql).toBe(true);
    expect((await run(alice, "select 1")).status).toBe(200);
    // Erin reads one table, and is told of one.
    const hers = (await erin.client.get(`${ws()}/queries/schema`)).body;
    expect(hers.tables.map((table: Any) => table.name)).toEqual(["devices"]);
    expect(hers.maySql).toBe(true);
    // Frank reads rows and holds no `sql:read`.
    expect((await frank.client.get(`${ws()}/queries/schema`)).body.maySql).toBe(false);
    expect((await run(frank.client, "select 1")).status).toBe(403);
  });
});

describe("who may ask, and of which tables", () => {
  test("it is a permission of its own, which a wildcard does not give", async () => {
    // Frank reads rows, and may not write SQL.
    expect((await run(frank.client, "select 1")).status).toBe(403);
    // A viewer holds *:read, which is every read but this one.
    expect((await run(viewer, "select 1")).status).toBe(403);
    expect((await viewer.get(`${ws()}/rows/devices`)).status).toBe(200);
    // The roles that build a workspace were given it by name.
    for (const name of ["tenant_admin", "workspace_admin", "developer"]) {
      const role = await t.db
        .selectFrom("role")
        .select("permissions")
        .where("id", "=", roles[name] as string)
        .executeTakeFirstOrThrow();
      expect(role.permissions, name).toContain("sql:read");
    }
    const others = await t.db
      .selectFrom("role")
      .select("name")
      .where("builtin", "=", true)
      .where(sql<boolean>`'sql:read' = any(permissions)`)
      .execute();
    expect(others.map((role) => role.name).sort()).toEqual([
      "developer",
      "tenant_admin",
      "workspace_admin",
    ]);
  });

  test("every table a query names needs its own permission to read rows", async () => {
    const hers = await run(erin.client, "select name from devices order by name");
    expect(hers.status, JSON.stringify(hers.body)).toBe(200);
    expect(hers.body.rows).toHaveLength(3);
    for (const text of [
      `select * from "lending/loans"`,
      `select d.name from devices d join "lending/loans" l on l.device = d.id`,
      `select name from devices where id in (select device from "lending/loans")`,
      `with l as (select * from "lending/loans") select count(*) from l`,
      `select (select count(*) from "lending/loans") from devices`,
    ]) {
      const answer = await run(erin.client, text);
      expect(answer.status, text).toBe(403);
      expect(answer.body.detail, text).toContain('"lending/loans"');
    }
  });

  test("each table's row policy applies to whoever asks, in a join and in a total as in a read", async () => {
    const all = rowsOf(
      (await run(alice, `select count(*) as n, sum(fee) as fees from "lending/loans"`)).body,
    );
    expect(all).toEqual([{ n: 4, fees: 85 }]);
    const carols = rowsOf(
      (await run(carol.client, `select count(*) as n, sum(fee) as fees from "lending/loans"`)).body,
    );
    expect(carols).toEqual([{ n: 2, fees: 40 }]);
    const daves = rowsOf(
      (
        await run(
          dave.client,
          `select d.name, l.note from "lending/loans" l join devices d on d.id = l.device order by d.name`,
        )
      ).body,
    );
    expect(daves.map((row) => row.name)).toEqual(["Laptop", "Tablet"]);
    // Carol cannot reach Dave's row by any road a query has.
    for (const text of [
      `select note from "lending/loans" where note is not null`,
      `select note from "lending/loans" where owner_id = '${dave.id}'`,
      `select max(note) as note from "lending/loans"`,
      `select string_agg(note, ',') as note from "lending/loans"`,
      `select l.note from devices d left join "lending/loans" l on l.device = d.id where l.note is not null`,
      `select note from (select * from "lending/loans" offset 0) s where note like 'dave%'`,
      `with recursive r as (select note from "lending/loans") select note from r where note is not null`,
      `select note from "lending/loans" where exists (select 1 from "lending/loans" o where o.note is not null) and note is not null`,
    ]) {
      const answer = await run(carol.client, text);
      expect(answer.status, `${text}\n${JSON.stringify(answer.body)}`).toBe(200);
      expect(JSON.stringify(answer.body.rows), text).not.toContain("dave's secret");
    }
  });
});

describe("what a query cannot do, tried against the database", () => {
  test("it cannot say it is someone else", async () => {
    for (const text of [
      `select set_config('app.claim', '{"principal":"${dave.id}","all":true}', true)`,
      `select set_config('app.principal', '${dave.id}', true), note from "lending/loans"`,
      `select set_config('app.data_all', 'on', true)`,
      `select current_setting('app.claim')`,
      `select vx.claim()`,
      `select * from vx.claim_key`,
      `set app.claim = ''`,
      `reset all`,
      `set role postgres`,
      `set session authorization default`,
    ]) {
      const why = await refusedFor(carol.client, text);
      expect(why, text).toMatch(/not one a query may call|Only SELECT|schema/);
    }
  });

  test("it cannot change anything", async () => {
    const before = await sql<{ n: string }>`
      select count(*) as n from ${sql.id(workspaceSchema(dev), "t_lending__loans")}
    `.execute(data);
    for (const text of [
      `delete from "lending/loans"`,
      `update "lending/loans" set fee = 0`,
      `insert into devices (id, name) values (gen_random_uuid(), 'x')`,
      `with gone as (delete from "lending/loans" returning *) select * from gone`,
      `select * into stolen from devices`,
      `create table x as select * from devices`,
      `truncate devices`,
      `drop table devices`,
      `select * from devices for update`,
      `alter table devices add column x int`,
      `grant all on devices to public`,
      `copy devices to stdout`,
      `select nextval('some_seq')`,
      `select lo_create(0)`,
    ]) {
      await refusedFor(alice, text);
    }
    const after = await sql<{ n: string }>`
      select count(*) as n from ${sql.id(workspaceSchema(dev), "t_lending__loans")}
    `.execute(data);
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });

  test("it cannot read anything but the workspace's tables", async () => {
    for (const text of [
      `select * from pg_catalog.pg_class`,
      `select * from pg_class`,
      `select * from pg_roles`,
      `select * from pg_stat_activity`,
      `select * from pg_settings`,
      `select * from information_schema.tables`,
      `select * from ${workspaceSchema(dev)}.t_devices`,
      `select * from ${querySchema(dev)}.devices`,
      `select * from public.tenant`,
      `select * from tenant`,
      `select * from secret`,
      `select * from member`,
      `select * from data_table`,
      `select * from audit_entry`,
      `with pg_class as (select * from pg_class) select * from pg_class`,
      `select pg_read_file('/etc/passwd')`,
      `select pg_ls_dir('.')`,
      `select query_to_xml('select * from secret', true, true, '')`,
      `select 'secret'::regclass`,
      `select current_user`,
      `select version()`,
      `select current_database()`,
    ]) {
      await refusedFor(alice, text);
    }
  });

  test("it cannot be made to wait, and is stopped when it runs too long", async () => {
    await refusedFor(alice, `select pg_sleep(5)`);
    await refusedFor(alice, `select pg_advisory_lock(1)`);
    // Work that is allowed and never ends is stopped at the time limit.
    const slow = await run(
      alice,
      `select count(*) from generate_series(1, 100000000) a, generate_series(1, 100000000) b`,
    );
    expect(slow.status, JSON.stringify(slow.body)).toBe(422);
    expect(slow.body.code).toBe("too_slow");
  }, 60_000);

  test("were a query to get past the reading of it, the database still holds", async () => {
    // What the route would never send, sent straight to the database as the role queries run as.
    const store = await t.kernel.data.forTenant(tenant);
    const asRole = <T>(work: (trx: Any) => Promise<T>) => store.rows.transaction().execute(work);
    const loans = sql.id(workspaceSchema(dev), "t_lending__loans");
    const view = sql.id(querySchema(dev), "lending/loans");

    // No claim: nobody. An owner policy gives nobody nothing.
    expect(
      (await asRole((trx) => sql<{ n: string }>`select count(*) as n from ${loans}`.execute(trx)))
        .rows[0]?.n,
    ).toBe("0");
    // A claim made up without the key is refused outright, through the table and through the view.
    const forged = `${JSON.stringify({ principal: dave.id, all: true, exp: 9999999999 })}.${"0".repeat(64)}`;
    for (const target of [loans, view]) {
      await expect(
        asRole(async (trx) => {
          await sql`select set_config('app.claim', ${forged}, true)`.execute(trx);
          return sql`select * from ${target}`.execute(trx);
        }),
      ).rejects.toThrow(/not signed/);
    }
    // The settings an earlier version trusted mean nothing now.
    expect(
      (
        await asRole(async (trx) => {
          await sql`select set_config('app.principal', ${dave.id}, true), set_config('app.data_all', 'on', true)`.execute(
            trx,
          );
          return sql<{ n: string }>`select count(*) as n from ${view}`.execute(trx);
        })
      ).rows[0]?.n,
    ).toBe("0");
    // A signed claim is Dave, and gives Dave's rows.
    const signed = store.sign(
      JSON.stringify({
        principal: dave.id,
        all: false,
        groups: [],
        attrs: {},
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    );
    expect(
      (
        await asRole(async (trx) => {
          await sql`select set_config('app.claim', ${signed}, true)`.execute(trx);
          return sql<{ n: string }>`select count(*) as n from ${view}`.execute(trx);
        })
      ).rows[0]?.n,
    ).toBe("2");
    // Changed after signing, or out of date, it is refused.
    const widened = signed.replace('"all":false', '"all":true');
    const old = store.sign(JSON.stringify({ principal: dave.id, all: true, exp: 1 }));
    for (const claim of [widened, old]) {
      await expect(
        asRole(async (trx) => {
          await sql`select set_config('app.claim', ${claim}, true)`.execute(trx);
          return sql`select * from ${view}`.execute(trx);
        }),
      ).rejects.toThrow(/not signed|out of date/);
    }
    // The key is where the role cannot go, and the views cannot be written through by it in a read-only run.
    await expect(asRole((trx) => sql`select * from vx.claim_key`.execute(trx))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asRole(async (trx) => {
        await sql`set transaction read only`.execute(trx);
        await sql`select set_config('app.claim', ${signed}, true)`.execute(trx);
        return sql`delete from ${loans}`.execute(trx);
      }),
    ).rejects.toThrow(/read-only transaction/);
  });
});

describe("the views a query reads", () => {
  test("follow the tables: a new column is there, a retired one is gone, a renamed one has its new name", async () => {
    expect(
      (
        await put("devices", {
          title: { type: "text", required: true, renamedFrom: "name" },
          room: { type: "text" },
        })
      ).status,
    ).toBe(200);
    const now = await run(alice, `select title, room from devices order by title`);
    expect(now.status, JSON.stringify(now.body)).toBe(200);
    expect(rowsOf(now.body).map((row) => row.title)).toEqual(["Camera", "Laptop", "Tablet"]);
    // `kind` left the definition: retired, kept in the table, and not there to be read.
    expect((await run(alice, `select kind from devices`)).status).toBe(400);
    expect((await run(alice, `select name from devices`)).status).toBe(400);
    const star = await run(alice, `select * from devices limit 1`);
    expect(star.body.columns.map((column: Any) => column.name).sort()).toEqual([
      "created_at",
      "id",
      "room",
      "title",
      "updated_at",
    ]);
  });

  test("a table that is retired cannot be queried, and a run is in the audit log with its text and not its result", async () => {
    expect((await put("scratch", { n: { type: "integer" } })).status).toBe(201);
    expect((await run(alice, `select count(*) from scratch`)).status).toBe(200);
    expect((await alice.delete(`${ws()}/resources/scratch`)).status).toBe(204);
    expect(await refusedFor(alice, `select count(*) from scratch`)).toContain("There is no table");

    await run(carol.client, `select note from "lending/loans" where fee > 25`);
    const entry = await t.db
      .selectFrom("audit_entry")
      .select(["actor_id", "details"])
      .where("action", "=", "sql.run")
      .where("actor_id", "=", carol.id)
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(entry.details).toMatchObject({ tables: ["lending/loans"], rows: 1, truncated: false });
    expect(String((entry.details as Any).sql)).toContain("fee > 25");
    expect(JSON.stringify(entry.details)).not.toContain("dave's secret");
    // A query that was refused ran nothing, and is not recorded as run.
    const before = await t.db
      .selectFrom("audit_entry")
      .select(sql<string>`count(*)`.as("n"))
      .where("action", "=", "sql.run")
      .executeTakeFirstOrThrow();
    await run(carol.client, `select pg_sleep(1)`);
    const after = await t.db
      .selectFrom("audit_entry")
      .select(sql<string>`count(*)`.as("n"))
      .where("action", "=", "sql.run")
      .executeTakeFirstOrThrow();
    expect(after.n).toBe(before.n);
  });
});

describe("queries kept by name", () => {
  const save = (path: string, body: object, client = alice) =>
    client.put(`${ws()}/drafts/${path}`, { kind: "query", schemaVersion: 1, body });
  const saved = (client: Client, path: string, params?: object, limit?: number) => {
    const asked = new URLSearchParams();
    if (params) asked.set("params", JSON.stringify(params));
    if (limit) asked.set("limit", String(limit));
    return client.get(`${ws()}/queries/saved/${path}?${asked}`);
  };
  const fees = {
    description: "What each device has earned",
    sql: `select d.title, sum(l.fee) as fees from "lending/loans" l join devices d on d.id = l.device
          where l.fee >= $1 and l.status = any(string_to_array($2, ','))
          group by d.title order by fees desc`,
    parameters: [
      { name: "least", type: "integer", default: 0, label: "Least fee" },
      { name: "statuses", type: "text", default: "out,back,late" },
    ],
  };

  test("a query is saved as a draft, is listed, and is refused when it would not be allowed to run", async () => {
    const made = await save("reports/fees", fees);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    let listed = (await alice.get(`${ws()}/queries`)).body.items;
    expect(listed).toEqual([
      expect.objectContaining({ path: "reports/fees", draft: "new", ownership: "ui" }),
    ]);
    // Not deployed yet, it is not there to be run.
    expect((await saved(alice, "reports/fees")).status).toBe(404);

    const deployed = await alice.post(`${ws()}/changes/deploy`, {});
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    listed = (await alice.get(`${ws()}/queries`)).body.items;
    expect(listed[0]).toMatchObject({
      path: "reports/fees",
      draft: null,
      parameters: fees.parameters,
    });

    // What a deploy stores is read as it will be when it runs.
    const wrong = async (body: object) => {
      await save("reports/wrong", body);
      const answer = await alice.post(`${ws()}/changes/deploy`, { paths: ["reports/wrong"] });
      await alice.delete(`${ws()}/drafts/reports/wrong`);
      return JSON.stringify(answer.body);
    };
    expect(await wrong({ sql: "delete from devices" })).toContain("Only SELECT");
    expect(await wrong({ sql: "select set_config('a', 'b', true)" })).toContain("set_config()");
    expect(await wrong({ sql: "select $1::int" })).toContain("uses $1");
    expect(
      await wrong({ sql: "select 1", parameters: [{ name: "n", type: "integer" }] }),
    ).toContain("parameter is listed");
    expect((await alice.get(`${ws()}/queries`)).body.items).toHaveLength(1);
  });

  test("it is run with its parameters by name, their defaults, and a refusal for one that does not fit", async () => {
    const all = await saved(alice, "reports/fees");
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(rowsOf(all.body)).toEqual([
      { title: "Laptop", fees: 50 },
      { title: "Camera", fees: 30 },
      { title: "Tablet", fees: 5 },
    ]);
    expect(
      rowsOf((await saved(alice, "reports/fees", { least: 20, statuses: "late" })).body),
    ).toEqual([
      { title: "Laptop", fees: 40 },
      { title: "Camera", fees: 30 },
    ]);
    expect((await saved(alice, "reports/fees", { least: "many" })).status).toBe(400);
    expect((await saved(alice, "reports/fees", { nope: 1 })).status).toBe(400);
    expect((await saved(alice, "reports/fees", undefined, 1)).body).toMatchObject({
      truncated: true,
    });
    // A value given as a parameter is a value and never text of the query.
    const injected = await saved(alice, "reports/fees", { statuses: "late') or true --" });
    expect(injected.status).toBe(200);
    expect(injected.body.rows).toEqual([]);
  });

  test("whoever may read its tables runs it as themselves, without the permission to write SQL", async () => {
    // Frank reads rows and may not write SQL. The query's text is the workspace's, not his.
    expect((await run(frank.client, "select 1")).status).toBe(403);
    const franks = await saved(frank.client, "reports/fees");
    expect(franks.status, JSON.stringify(franks.body)).toBe(200);
    // He owns no loan, so the row policy leaves him none.
    expect(franks.body.rows).toEqual([]);
    // Carol and Dave each get the total of their own.
    expect(rowsOf((await saved(carol.client, "reports/fees")).body)).toEqual([
      { title: "Camera", fees: 30 },
      { title: "Laptop", fees: 10 },
    ]);
    expect(rowsOf((await saved(dave.client, "reports/fees")).body)).toEqual([
      { title: "Laptop", fees: 40 },
      { title: "Tablet", fees: 5 },
    ]);
    // Erin may read devices and not loans, so she is refused, naming the table.
    const erins = await saved(erin.client, "reports/fees");
    expect(erins.status).toBe(403);
    expect(erins.body.detail).toContain('"lending/loans"');
    // Running a saved query is a read like a row read: it is not in the audit log.
    const audited = await t.db
      .selectFrom("audit_entry")
      .select("id")
      .where("action", "=", "sql.run")
      .where("actor_id", "=", frank.id)
      .execute();
    expect(audited).toEqual([]);
  });

  test("a query that reads no table still needs standing in the workspace", async () => {
    await save("reports/one", { sql: "select 1 as n" });
    await alice.post(`${ws()}/changes/deploy`, {});
    expect((await saved(frank.client, "reports/one")).status).toBe(200);
    // Erin reads one table only, which is not the workspace.
    expect((await saved(erin.client, "reports/one")).status).toBe(403);
  });
});

describe("queries built from menus", () => {
  const visual = (client: Client, query: object, limit?: number) =>
    client.get(
      `${ws()}/queries/visual?query=${encodeURIComponent(JSON.stringify(query))}${limit ? `&limit=${limit}` : ""}`,
    );
  const feesByDevice = {
    table: "lending/loans",
    joins: ["device"],
    groupBy: [{ column: "device.title" }],
    measures: [
      { fn: "sum", column: "fee", as: "fees" },
      { fn: "count", as: "loans" },
    ],
    sort: [{ by: "fees", descending: true }],
  };

  test("a table, the table its reference points to, groups, measures and a sort, with no SQL written", async () => {
    const all = await visual(alice, feesByDevice);
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(rowsOf(all.body)).toEqual([
      { device_title: "Laptop", fees: 50, loans: 2 },
      { device_title: "Camera", fees: 30, loans: 1 },
      { device_title: "Tablet", fees: 5, loans: 1 },
    ]);
    expect(all.body.tables).toEqual(["devices", "lending/loans"]);
    // Rows as they are, with a column of the table pointed to beside the table's own.
    const plain = await visual(alice, {
      table: "lending/loans",
      joins: ["device"],
      columns: ["device.title", "status", "fee"],
      filters: [
        { column: "status", op: "in", value: ["late", "back"] },
        { column: "fee", op: "gte", value: 30 },
        { column: "note", op: "is_null" },
      ],
      sort: [{ by: "fee" }],
    });
    expect(rowsOf(plain.body)).toEqual([{ device_title: "Camera", status: "late", fee: 30 }]);
    // By period, and by a distinct count.
    const monthly = await visual(alice, {
      table: "lending/loans",
      groupBy: [{ column: "due", bucket: "quarter" }],
      measures: [{ fn: "count_distinct", column: "device", as: "devices" }],
    });
    expect(rowsOf(monthly.body)).toEqual([{ due_quarter: "2026-10-01", devices: 3 }]);
  });

  test("it needs no permission to write SQL, and is held to each table and each table's rows like any query", async () => {
    // Frank reads rows and may not write SQL: he owns no loan, so he is given none.
    const franks = await visual(frank.client, feesByDevice);
    expect(franks.status, JSON.stringify(franks.body)).toBe(200);
    expect(franks.body.rows).toEqual([]);
    expect(rowsOf((await visual(carol.client, feesByDevice)).body)).toEqual([
      { device_title: "Camera", fees: 30, loans: 1 },
      { device_title: "Laptop", fees: 10, loans: 1 },
    ]);
    // Erin may read devices and not loans.
    const erins = await visual(erin.client, feesByDevice);
    expect(erins.status).toBe(403);
    expect(erins.body.detail).toContain('"lending/loans"');
    expect((await visual(erin.client, { table: "devices", columns: ["title"] })).status).toBe(200);
  });

  test("what it names must be there, and a value is never part of the query", async () => {
    const wrong = async (query: object) => {
      const answer = await visual(alice, query);
      expect(answer.status, JSON.stringify(query)).toBe(400);
      return JSON.stringify(answer.body);
    };
    expect(await wrong({ table: "nothing" })).toContain("there is no table");
    expect(await wrong({ table: "devices", columns: ["nope"] })).toContain("has no column");
    expect(await wrong({ table: "devices", joins: ["title"] })).toContain(
      "not a column of devices that points to another table",
    );
    expect(await wrong({ table: "lending/loans", columns: ["device.title"] })).toContain(
      "not among its joins",
    );
    expect(
      await wrong({ table: "devices", measures: [{ fn: "sum", column: "title", as: "x" }] }),
    ).toContain("sum is of a number");
    expect(
      await wrong({ table: "devices", groupBy: [{ column: "title", bucket: "month" }] }),
    ).toContain("only a date or a time");
    // A name that is not a name does not get as far as being written.
    expect(await wrong({ table: "devices", columns: ['title" from secret --'] })).toContain(
      "/query/columns/0",
    );
    expect(await wrong({ table: 'devices"; drop table x; --' })).toContain("/query/table");
    // A value with SQL in it is a value, and matches nothing.
    const injected = await visual(alice, {
      table: "devices",
      columns: ["title"],
      filters: [{ column: "title", op: "eq", value: "x' or '1'='1" }],
    });
    expect(injected.status).toBe(200);
    expect(injected.body.rows).toEqual([]);
  });
});

describe("a dashboard the workspace keeps", () => {
  const boards = () => `${ws()}/dashboards`;

  test("is a resource: drafted, deployed, listed for whoever may see dashboards, and asked like any other", async () => {
    const saved = await alice.put(`${ws()}/drafts/boards/lending`, {
      kind: "dashboard",
      schemaVersion: 1,
      body: {
        version: 2,
        title: "Lending",
        filters: [{ name: "due", type: "date_range" }],
        widgets: [
          {
            id: "fees",
            type: "figure",
            source: {
              visual: {
                table: "lending/loans",
                measures: [{ fn: "sum", column: "fee", as: "fees" }],
              },
            },
            filters: [{ filter: "due", column: "due" }],
            options: { value: "fees", compareTo: "due" },
          },
          {
            id: "by-name",
            type: "table",
            source: { query: "reports/fees", values: { statuses: "late" } },
            filters: [],
          },
          {
            id: "since",
            type: "table",
            source: {
              sql: `select status, count(*) as n from "lending/loans" where ($1::date is null or due >= $1::date) group by status order by status`,
            },
            filters: [{ filter: "due", parameter: "$1", part: "from" }],
          },
        ],
      },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const deployed = await alice.post(`${ws()}/changes/deploy`, { paths: ["boards/lending"] });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);

    // Carol holds no dashboard permission yet; given it, she sees the workspace's dashboard.
    expect((await carol.client.get(boards())).status).toBe(403);
    await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: dev,
      principalType: "member",
      principalId: carol.id,
      roleId: (
        await alice.post(`/tenants/${tenant}/roles`, {
          name: "board_reader",
          permissions: ["dashboard:read"],
        })
      ).body.id,
    });
    const listed = (await carol.client.get(boards())).body.items;
    expect(listed).toEqual([
      expect.objectContaining({
        kind: "resource",
        path: "boards/lending",
        title: "Lending",
        mine: false,
      }),
    ]);
    const id = listed[0].id as string;
    const whole = (await carol.client.get(`${boards()}/${id}`)).body;
    expect(whole.body.widgets).toHaveLength(3);
    // It is changed where resources are, not here.
    expect(
      (await carol.client.put(`${boards()}/${id}`, { title: "Mine" })).status,
    ).toBeGreaterThanOrEqual(403);

    const shown = (client: Client, widget: string, filters?: object) =>
      client.get(
        `${boards()}/${id}/widgets/${widget}/data${filters ? `?filters=${encodeURIComponent(JSON.stringify(filters))}` : ""}`,
      );
    // Each of the three kinds of source, each as whoever looks.
    expect((await shown(alice, "fees")).body.rows).toEqual([[85]]);
    expect((await shown(carol.client, "fees")).body.rows).toEqual([[40]]);
    expect(
      (await shown(carol.client, "fees", { due: { from: "2026-11-15", to: "2026-12-31" } })).body
        .rows,
    ).toEqual([[10]]);
    // A saved query, with a value the widget fixes.
    expect(rowsOf((await shown(carol.client, "by-name")).body)).toEqual([
      { title: "Camera", fees: 30 },
    ]);
    // SQL written in the widget, by someone who could; read by someone who cannot write it.
    expect(rowsOf((await shown(carol.client, "since")).body)).toEqual([
      { status: "late", n: 1 },
      { status: "out", n: 1 },
    ]);
    expect(
      rowsOf((await shown(carol.client, "since", { due: { from: "2026-11-15" } })).body),
    ).toEqual([{ status: "out", n: 1 }]);
  });
});
