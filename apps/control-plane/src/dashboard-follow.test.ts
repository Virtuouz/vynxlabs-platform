import { type Bundle, type BundleManifest, bundleDigest, formatFor } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * A dashboard's widget names a saved query by path. It keeps running when the query is
 * renamed: through the path's alias for 90 days, and by the query's key after that.
 */

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let alice: Client;
let dev: string;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;
const dashboard = (title: string, query: string) => ({
  title,
  widgets: [
    {
      id: "n",
      type: "core/table",
      at: { x: 0, y: 0, w: 12, h: 6 },
      data: { rows: { source: { query } } },
    },
    {
      id: "plain",
      type: "core/table",
      at: { x: 0, y: 6, w: 12, h: 6 },
      data: { rows: { source: { sql: "select 2 as n" } } },
    },
  ],
});
/** The repository's part: a query and a dashboard that asks it, both code-managed. */
function repository(): Bundle {
  const manifests: BundleManifest[] = [
    {
      kind: "query",
      schemaVersion: 1,
      path: "reports/n",
      ownership: "code",
      body: { sql: "select 1 as n" },
    },
    {
      kind: "dashboard",
      schemaVersion: 3,
      path: "boards/theirs",
      ownership: "code",
      body: dashboard("Theirs", "reports/n"),
    },
  ];
  const unsigned = {
    formatVersion: formatFor(1, manifests),
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export {};",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
const draft = (path: string, kind: string, body: object, extra: object = {}) =>
  alice.put(`${ws()}/drafts/${path}`, {
    kind,
    schemaVersion: kind === "dashboard" ? 3 : 1,
    body,
    ...extra,
  });
const deployAll = async () => {
  const answer = await alice.post(`${ws()}/changes/deploy`, {});
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
};
const idOf = async (path: string) =>
  (
    await t.db
      .selectFrom("resource")
      .select("id")
      .where("workspace_id", "=", dev)
      .where("path", "=", path)
      .executeTakeFirstOrThrow()
  ).id;
const shown = (dashboardId: string, widget = "n") =>
  alice.get(`${ws()}/widget-data?of=dashboard&path=${dashboardId}&widget=${widget}`);
const records = (path: string) =>
  t.db
    .selectFrom("dashboard_widget_query")
    .selectAll()
    .where("dashboard_id", "=", path)
    .orderBy("widget_id")
    .execute();
const draftsOf = async () =>
  ((await alice.get(`${ws()}/drafts`)).body.items as Any[]).map((one) => one.path).sort();

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("a widget follows its query", () => {
  let consoleBoard: string;
  let repoBoard: string;

  test("a deploy records the key of the query each widget names, and a delete removes the record", async () => {
    const uploaded = await alice.post(`${ws()}/bundles`, repository());
    const pushed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(pushed.status, JSON.stringify(pushed.body)).toBeLessThan(300);
    expect((await draft("boards/mine", "dashboard", dashboard("Mine", "reports/n"))).status).toBe(
      200,
    );
    await deployAll();
    consoleBoard = await idOf("boards/mine");
    repoBoard = await idOf("boards/theirs");
    const key = (await alice.get(`${ws()}/resources/reports/n`)).body.key;
    expect(await records(consoleBoard)).toEqual([
      expect.objectContaining({
        widget_id: "n/rows",
        path: "reports/n",
        query_key: key,
        dashboard_key: "boards/mine",
      }),
    ]);
    expect((await shown(consoleBoard)).status).toBe(200);

    // A dashboard taken out of the workspace takes its record with it.
    expect((await draft("boards/gone", "dashboard", dashboard("Gone", "reports/n"))).status).toBe(
      200,
    );
    await deployAll();
    const gone = await idOf("boards/gone");
    expect(await records(gone)).toHaveLength(1);
    expect(
      (
        await alice.put(`${ws()}/drafts/boards/gone`, {
          kind: "dashboard",
          schemaVersion: 3,
          body: {},
          deleted: true,
        })
      ).status,
    ).toBe(200);
    await deployAll();
    expect(await records(gone)).toEqual([]);
  });

  test("renaming a query drafts the console's dashboards, and not the repository's", async () => {
    const effects = await alice.get(`${ws()}/rename-effects/reports/n`);
    expect(effects.body.dashboards).toEqual([
      { kind: "dashboard", path: "boards/mine", title: "Mine", ownership: "ui", widgets: 1 },
      { kind: "dashboard", path: "boards/theirs", title: "Theirs", ownership: "code", widgets: 1 },
    ]);
    const renamed = await draft(
      "reports/n",
      "query",
      { sql: "select 1 as n" },
      { path: "reports/count" },
    );
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(await draftsOf()).toEqual(["boards/mine", "reports/count"]);
    const mine = (await alice.get(`${ws()}/drafts/boards/mine`)).body;
    expect(mine.body.widgets[0].data.rows.source.query).toBe("reports/count");
    // What is deployed is as it was.
    const live = (await alice.get(`${ws()}/resources/boards/mine`)).body;
    expect(live.body.widgets[0].data.rows.source.query).toBe("reports/n");
  });

  test("discarding the rename sets those dashboard drafts aside with it", async () => {
    const discarded = await alice.delete(`${ws()}/drafts/reports/count`);
    expect(discarded.status).toBe(204);
    expect(await draftsOf()).toEqual([]);
  });

  test("a dashboard draft changed after the rename is someone's work, and is kept when the rename is discarded", async () => {
    await draft("reports/n", "query", { sql: "select 1 as n" }, { path: "reports/count" });
    const mine = (await alice.get(`${ws()}/drafts/boards/mine`)).body;
    const edited = await alice.put(`${ws()}/drafts/boards/mine`, {
      kind: "dashboard",
      schemaVersion: 3,
      body: { ...mine.body, title: "Mine, retitled" },
      revision: mine.revision,
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((await alice.delete(`${ws()}/drafts/reports/count`)).status).toBe(204);
    expect(await draftsOf()).toEqual(["boards/mine"]);
    // Left as it was found for the next test.
    expect((await alice.delete(`${ws()}/drafts/boards/mine`)).status).toBe(204);
    expect(await draftsOf()).toEqual([]);
  });

  test("deploying the rename keeps the dashboard running, by path, then by key once the alias has gone", async () => {
    await draft("reports/n", "query", { sql: "select 1 as n" }, { path: "reports/count" });
    expect(await draftsOf()).toEqual(["boards/mine", "reports/count"]);
    await deployAll();
    expect(await draftsOf()).toEqual([]);
    // The console's dashboard was moved to the new path with the rename, and its record too.
    const first = await shown(consoleBoard);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.inputs.rows.followed).toBeUndefined();
    expect((await records(consoleBoard))[0]?.path).toBe("reports/count");

    // The repository's still says the old path: the alias answers for it, with no note.
    const aliased = await shown(repoBoard);
    expect(aliased.status).toBe(200);
    expect(aliased.body.inputs.rows.followed).toBeUndefined();

    // The alias runs out.
    await t.db
      .updateTable("resource_alias")
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where("workspace_id", "=", dev)
      .where("path", "=", "reports/n")
      .execute();
    const followed = await shown(repoBoard);
    expect(followed.status, JSON.stringify(followed.body)).toBe(200);
    expect(followed.body.inputs.rows.rows).toEqual([{ n: 1 }]);
    expect(followed.body.inputs.rows.followed).toEqual({
      names: "reports/n",
      now: "reports/count",
    });
    // A widget that names no query has nothing to follow.
    expect((await shown(repoBoard, "plain")).body.inputs.rows.followed).toBeUndefined();
  });

  test("a widget that names a query that was never there still finds nothing", async () => {
    await draft("boards/lost", "dashboard", dashboard("Lost", "reports/nothing"));
    await deployAll();
    expect((await shown(await idOf("boards/lost"))).status).toBe(404);
  });
});
