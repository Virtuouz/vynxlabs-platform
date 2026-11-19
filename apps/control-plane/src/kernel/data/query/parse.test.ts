import { describe, expect, test } from "vitest";
import { checkQuery, QueryRefused } from "./parse.js";

const scope = { schema: "q_w1", tables: new Set(["loans", "devices", "lending/requests"]) };
const check = (sql: string) => checkQuery(sql, scope);
const refused = async (sql: string): Promise<QueryRefused> => {
  try {
    await check(sql);
  } catch (error) {
    if (error instanceof QueryRefused) return error;
    throw error;
  }
  throw new Error(`was allowed: ${sql}`);
};
const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("what a query may be", () => {
  test("a join, a WITH, a filter, a window and a union are read through the workspace's views", async () => {
    const checked = await check(`
      with late as (
        select l.id, d.name, l.status
        from loans l join devices d on d.id = l.device
        where l.due < now() and l.status = any($1)
      )
      select name, count(*) filter (where status = 'overdue') as n,
        rank() over (partition by name order by count(*) desc)
      from late group by name having count(*) > $2
      union all select null, 0, 0 order by 2 desc limit 10`);
    expect(checked.tables).toEqual(["devices", "loans"]);
    expect(checked.parameters).toBe(2);
    const sql = flat(checked.sql);
    expect(sql).toContain("FROM q_w1.loans AS l JOIN q_w1.devices AS d");
    // The name the query defined is its own, and is left alone.
    expect(sql).toContain("FROM late");
    expect(sql).not.toContain("q_w1.late");
  });

  test("a table whose path has a slash is named in quotes, and keeps its name in the query", async () => {
    const checked = await check(
      `select "lending/requests".id from "lending/requests" where "lending/requests".open`,
    );
    expect(checked.tables).toEqual(["lending/requests"]);
    expect(flat(checked.sql)).toBe(
      `SELECT "lending/requests".id FROM q_w1."lending/requests" WHERE "lending/requests".open`,
    );
  });

  test("casts, CASE, EXTRACT, AT TIME ZONE, subqueries and arrays are allowed", async () => {
    await check(`
      select id::text, cast(fee as numeric(10,2)), extract(year from due),
        due at time zone 'UTC', case when fee > 0 then 'paid' else 'free' end,
        coalesce(note, ''), (select max(fee) from loans), array[1,2,3],
        current_date, substring(note from 1 for 3), trim(both ' ' from note),
        date_trunc('month', due), jsonb_build_object('a', fee) ->> 'a'
      from loans where id in (select id from loans) and exists (select 1 from devices)
        and note ilike '%x%' and fee between 1 and 2 and due is not null`);
  });

  test("a function that gives rows can be read from, when it is one of the allowed", async () => {
    const checked = await check(
      "select n, u from generate_series(1, 3) as n, unnest(array['a', 'b']) as u",
    );
    expect(flat(checked.sql)).toContain("generate_series(1, 3)");
    expect((await refused("select * from pg_ls_dir('.') as f")).message).toMatch(/not one a query/);
  });

  test("what the text says is not what runs: it is written again from what was read", async () => {
    const checked = await check("select /* set_config('app.principal','x',true) */ 1 -- drop");
    expect(flat(checked.sql)).toBe("SELECT 1");
  });
});

describe("what a query may not be", () => {
  test("anything but one SELECT", async () => {
    expect((await refused("select 1; select 2")).message).toMatch(/One query at a time/);
    expect((await refused("")).message).toMatch(/no query/);
    for (const sql of [
      "delete from loans",
      "update loans set fee = 0",
      "insert into loans (id) values (1)",
      "drop table loans",
      "truncate loans",
      "set role postgres",
      "copy loans to stdout",
      "create table x as select 1",
      "do $$ begin end $$",
      "call something()",
      "explain select 1",
      "show server_version",
      "listen x",
      "vacuum",
    ]) {
      expect((await refused(sql)).message, sql).toMatch(/Only SELECT/);
    }
  });

  test("a change hidden inside a SELECT", async () => {
    expect(
      (await refused("with x as (delete from loans returning *) select * from x")).message,
    ).toMatch(/Only SELECT/);
    expect(
      (await refused("with x as (update loans set fee = 0 returning *) select * from x")).message,
    ).toMatch(/Only SELECT/);
    expect((await refused("select * into copy from loans")).message).toMatch(/INTO/);
    expect((await refused("select * from loans for update")).message).toMatch(/lock/);
    expect((await refused("select * from loans for share skip locked")).message).toMatch(/lock/);
  });

  test("saying who is asking, or reading it", async () => {
    for (const sql of [
      "select set_config('app.principal', 'someone-else', true)",
      "select set_config('app.claim', '{}', true) from loans",
      "select current_setting('app.claim')",
      "select pg_catalog.set_config('app.data_all', 'on', true)",
      "select * from loans where id = (select set_config('app.data_all','on',true))::int",
      "select count(*) filter (where set_config('a','b',true) is not null) from loans",
      "select 1 order by set_config('a','b',true)",
      "select * from loans l join devices d on set_config('a','b',true) = d.name",
      "select rank() over (order by set_config('a','b',true))",
    ]) {
      expect((await refused(sql)).message, sql).toMatch(/set_config\(\)|current_setting\(\)/);
    }
    for (const sql of [
      "select current_user",
      "select session_user",
      "select current_role",
      "select current_schema",
      "select current_catalog",
      "select user",
    ]) {
      expect((await refused(sql)).message, sql).toMatch(/date and time keywords|not one a query/);
    }
  });

  test("a function that waits, reads the server, or runs SQL of its own", async () => {
    for (const name of [
      "pg_sleep(10)",
      "pg_read_file('/etc/passwd')",
      "pg_ls_dir('.')",
      "query_to_xml('select 1', true, true, '')",
      "dblink('x', 'select 1')",
      "lo_import('/etc/passwd')",
      "pg_terminate_backend(1)",
      "pg_advisory_lock(1)",
      "nextval('s')",
      "txid_current()",
      "version()",
      "pg_backend_pid()",
      "inet_server_addr()",
      "has_table_privilege('loans', 'select')",
      "pg_get_viewdef('loans')",
      "obj_description(1)",
      "current_database()",
    ]) {
      expect((await refused(`select ${name}`)).message, name).toMatch(/not one a query may call/);
    }
    expect((await refused("select public.count(1)")).message).toMatch(/schema/);
    expect((await refused("select * from pg_sleep(1)")).message).toMatch(/not one a query/);
  });

  test("a table that is not this workspace's, however it is named", async () => {
    for (const sql of [
      "select * from pg_class",
      "select * from pg_catalog.pg_class",
      "select * from information_schema.tables",
      "select * from pg_roles",
      "select * from public.loans",
      "select * from ws_w1.t_loans",
      "select * from q_w2.loans",
      "select * from db.q_w1.loans",
      "select * from loans, pg_stat_activity",
      "select * from loans where id in (select oid from pg_class)",
      "select (select count(*) from pg_settings) from loans",
      "select * from nothing",
    ]) {
      const error = await refused(sql);
      expect(error.message, sql).toMatch(/no table|schema may not be named/);
    }
  });

  test("a name a WITH defines is the query's own only where SQL says it is", async () => {
    // Inside itself a WITH query's name is the table of that name, unless the WITH is RECURSIVE.
    expect(
      (await refused("with pg_class as (select * from pg_class) select * from pg_class")).message,
    ).toMatch(/no table "pg_class"/);
    // One defined in a subquery is not defined beside it.
    expect(
      (
        await refused(
          "select * from pg_roles, (with pg_roles as (select 1 as x) select * from pg_roles) s",
        )
      ).message,
    ).toMatch(/no table "pg_roles"/);
    // A later one is not seen by an earlier one.
    expect(
      (await refused("with a as (select * from b), b as (select 1) select * from a")).message,
    ).toMatch(/no table "b"/);
    // And where it is seen, it is the query's, though a table has the same name.
    const shadow = await check("with loans as (select 1 as id) select * from loans");
    expect(shadow.tables).toEqual([]);
    const recursive = await check(
      "with recursive n as (select 1 as i union all select i + 1 from n where i < 5) select * from n",
    );
    expect(recursive.tables).toEqual([]);
    // Each branch of a union and each subquery is read with the same care.
    expect((await refused("select 1 union select count(*) from pg_class")).message).toMatch(
      /no table/,
    );
  });

  test("a cast that reads the catalog, a system column, sampling, and XML", async () => {
    expect((await refused("select 'pg_authid'::regclass")).message).toMatch(/cast to regclass/);
    expect((await refused("select 'now'::regproc")).message).toMatch(/cast to regproc/);
    expect((await refused("select cast(1 as oid)")).message).toMatch(/cast to oid/);
    expect((await refused("select 1::public.text")).message).toMatch(/schema/);
    expect((await refused("select ctid from loans")).message).toMatch(/system column/);
    expect((await refused("select l.xmin from loans l")).message).toMatch(/system column/);
    expect((await refused("select tableoid::regclass from loans")).message).toMatch(
      /system column|regclass/,
    );
    expect((await refused("select * from loans tablesample system (10)")).message).toMatch(
      /TABLESAMPLE/,
    );
    expect((await refused("select xmlelement(name a, 'b')")).message).toMatch(/not supported/);
    expect((await refused("select 1 operator(public.+) 2")).message).toMatch(/operator/);
  });

  test("a refusal says where", async () => {
    const error = await refused("select id\nfrom loans\nwhere pg_sleep(1) is null");
    expect(error).toMatchObject({ line: 3, column: 7 });
    const syntax = await refused("select from where");
    expect(syntax.message).toMatch(/syntax error/);
    expect(syntax.line).toBe(1);
    const table = await refused("select *\n  from pg_class");
    expect(table).toMatchObject({ line: 2, column: 8 });
  });
});
