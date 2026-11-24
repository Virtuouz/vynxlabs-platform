import { createRequire } from "node:module";
import type { Given, Scene } from "./scene.ts";
import { appointmentsWorkspace } from "./widgets.ts";

// The `pg` of the control plane: the scene makes a database for the data source to read, which
// no call of the API can do.
// biome-ignore lint/suspicious/noExplicitAny: a client used for four statements
const pg: any = createRequire(
  new URL("../../apps/control-plane/package.json", import.meta.url).pathname,
)("pg");

/** The scenes of the area "queries"'s pictures (packages/docs/shots/queries.mjs), by the name a shot's `setup` gives. */

/**
 * A Postgres database the instance can reach, with the table "loans" (three rows, a primary key), made
 * beside the instance's own database: the one the data source of a picture points at.
 */
async function libraryDatabase() {
  const url = new URL(
    process.env.DATABASE_URL ?? "postgres://platform:platform@localhost:5432/postgres",
  );
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  const name = "library_pictures";
  const have = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (have.rowCount === 0) await admin.query(`create database ${name}`);
  await admin.end();
  url.pathname = `/${name}`;
  const library = new pg.Client({ connectionString: url.toString() });
  await library.connect();
  await library.query("drop table if exists loans");
  await library.query(
    "create table loans (id integer primary key, book text not null, borrower text not null, due date not null)",
  );
  await library.query(
    "insert into loans values (1, 'The Dispossessed', 'Ada Okafor', '2026-03-09'), (2, 'Piranesi', 'Ben Ito', '2026-03-12'), (3, 'Kindred', 'Cleo Marsh', '2026-03-16')",
  );
  await library.end();
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: name,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/** The data source "library-loans", declared and deployed in the workspace. */
async function declareSource(given: Given, W: string) {
  const { call } = given;
  await call("PUT", `${W}/drafts/library-loans`, {
    kind: "data_source",
    schemaVersion: 1,
    create: true,
    body: { connector: "postgres", description: "The library's loans, read in place." },
  });
  await call("POST", `${W}/changes/deploy`, {});
}

/** A workspace named Sandbox with the data source "library-loans" declared and deployed. */
async function sourceWorkspace(given: Given, slug: string) {
  const { call, tenant } = given;
  const workspace = await call("POST", `/tenants/${tenant.id}/workspaces`, {
    slug,
    name: "Sandbox",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${workspace.id}`;
  await declareSource(given, W);
  return { workspace, W };
}

const place = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** A dashboard body: a Stat counting appointments and a Table of them. */
const board = (refresh: number | "off") => ({
  title: "Clinic visits",
  refresh,
  widgets: [
    {
      id: "visits",
      type: "core/stat",
      title: "Visits",
      at: place(0, 0, 3, 3),
      data: {
        value: {
          source: { visual: { table: "appointments", measures: [{ fn: "count", as: "visits" }] } },
        },
      },
    },
    {
      id: "booked",
      type: "core/table",
      title: "Appointments",
      at: place(3, 0, 9, 7),
      data: {
        rows: {
          source: {
            visual: {
              table: "appointments",
              columns: ["number", "pet_name", "clinic", "status"],
              sort: [{ by: "number" }],
            },
          },
        },
      },
    },
  ],
});

export const scenes: Record<string, Scene> = {
  "queries-source-connect": async (given) => {
    const { workspace } = await sourceWorkspace(given, "queries-connect");
    return { at: `/t/${given.tenant.id}/workspaces/${workspace.id}` };
  },
  "queries-source-rows": async (given) => {
    const { workspace, W } = await sourceWorkspace(given, "queries-rows");
    const { password, ...config } = await libraryDatabase();
    await given.call("PUT", `${W}/data-source-bindings/library-loans`, { config, password });
    await given.call("GET", `${W}/data-source-tables/library-loans`);
    // The page says what it is for once, then folds it behind the ⓘ. Folded from the start, so
    // that both looks and every run show the same: the first look would otherwise differ.
    await given.call("PUT", "/me/preferences/seen%3Asource", { value: true });
    return { at: `/t/${given.tenant.id}/workspaces/${workspace.id}` };
  },
  "queries-saved": async (given) => {
    const { workspace, W } = await appointmentsWorkspace(given, "queries-saved");
    await given.call("PUT", `${W}/drafts/reports/visits-by-clinic`, {
      kind: "query",
      schemaVersion: 1,
      create: true,
      body: {
        sql: "select clinic, count(*) as visits\nfrom appointments\nwhere starts_at::date >= $1::date\ngroup by clinic\norder by visits desc",
        parameters: [{ name: "since", type: "date", label: "From", default: "2026-03-01" }],
      },
    });
    await given.call("POST", `${W}/changes/deploy`, {});
    return { at: `/t/${given.tenant.id}/workspaces/${workspace.id}` };
  },
  "queries-dashboard": async (given) => {
    const { workspace, W } = await appointmentsWorkspace(given, "queries-board");
    // What the list "Where it reads from" offers besides the tables: a data source's table and a saved query.
    const { password, ...config } = await libraryDatabase();
    await declareSource(given, W);
    await given.call("PUT", `${W}/data-source-bindings/library-loans`, { config, password });
    await given.call("GET", `${W}/data-source-tables/library-loans`);
    await given.call("PUT", `${W}/drafts/reports/visits-by-clinic`, {
      kind: "query",
      schemaVersion: 1,
      create: true,
      body: {
        sql: "select clinic, count(*) as visits from appointments group by clinic",
        description: "Visits of each clinic.",
      },
    });
    await given.call("POST", `${W}/changes/deploy`, {});
    const made = await given.call("POST", `${W}/dashboards`, { title: "Clinic visits" });
    await given.call("PUT", `${W}/dashboards/${made.id}`, {
      revision: made.revision,
      body: board(5),
    });
    return {
      at: `/t/${given.tenant.id}/workspaces/${workspace.id}/dashboards/${made.id}?edit=1&shot=`,
    };
  },
  "queries-kept-dashboard": async (given) => {
    const { workspace, W } = await appointmentsWorkspace(given, "queries-kept");
    await given.call("PUT", `${W}/drafts/boards/clinic-visits`, {
      kind: "dashboard",
      schemaVersion: 3,
      create: true,
      body: board(5),
    });
    await given.call("POST", `${W}/changes/deploy`, {});
    await given.call("PUT", `${W}/drafts/boards/clinic-visits`, {
      kind: "dashboard",
      schemaVersion: 3,
      body: board(15),
    });
    return { at: `/t/${given.tenant.id}/workspaces/${workspace.id}` };
  },
  /** The list of data sources: one connected and tested once. */
  "queries-source-listed": async (given) => {
    const { workspace, W } = await sourceWorkspace(given, "queries-listed");
    const { password, ...config } = await libraryDatabase();
    await given.call("PUT", `${W}/data-source-bindings/library-loans`, { config, password });
    return { at: `/t/${given.tenant.id}/workspaces/${workspace.id}` };
  },
  /** The dashboards: one the workspace keeps and one of the administrator's own. */
  "queries-dashboards": async (given) => {
    const { workspace, W } = await appointmentsWorkspace(given, "queries-boards");
    await given.call("PUT", `${W}/drafts/boards/clinic-visits`, {
      kind: "dashboard",
      schemaVersion: 3,
      create: true,
      body: board(5),
    });
    await given.call("POST", `${W}/changes/deploy`, {});
    const made = await given.call("POST", `${W}/dashboards`, { title: "My week" });
    await given.call("PUT", `${W}/dashboards/${made.id}`, {
      revision: made.revision,
      body: { ...board(15), title: "My week" },
    });
    return { at: `/t/${given.tenant.id}/workspaces/${workspace.id}` };
  },
};
