import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * A list's and a table's rows grouped by a column (`config.groupRows`): the group leads the order
 * over every page, a time's day is the reader's own, each group is counted whole, and a column
 * that cannot group is refused.
 */

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
let t: TestApp;
let tenant: string;
let dev: string;
let alice: Client;
const ws = () => `/tenants/${tenant}/workspaces/${dev}`;

const widget = (id: string, groupRows: object | undefined, visual: object = {}, config = {}) => ({
  id,
  type: "core/table",
  at: { x: 0, y: 0, w: 12, h: 6 },
  data: { rows: { source: { visual: { table: "visits", ...visual } } } },
  config: { ...(groupRows ? { groupRows } : {}), ...config },
});

const manifest = (kind: string, path: string, body: object): BundleManifest =>
  ({
    kind,
    path,
    schemaVersion: kind === "interface" ? 2 : 1,
    ownership: "code",
    body,
  }) as BundleManifest;

function bundle(): Bundle {
  const manifests = [
    manifest("table", "visits", {
      columns: {
        pet: { type: "text", required: true },
        starts_at: { type: "timestamp" },
        status: { type: "enum", values: ["booked", "done", "cancelled"] },
        extra: { type: "json" },
      },
    }),
    manifest("interface", "screens/visits", {
      title: "Visits",
      pages: [
        {
          id: "main",
          title: "Main",
          widgets: [
            widget("by_day", { column: "starts_at", by: "day" }, {}, { pageSize: 5 }),
            widget(
              "by_day_by_pet",
              { column: "starts_at", by: "day", descending: true },
              { sort: [{ by: "pet" }], columns: ["pet"] },
            ),
            widget("by_week", { column: "starts_at", by: "week" }, {}, { pageSize: 5 }),
            widget("by_status", { column: "status" }, { sort: [{ by: "pet" }] }),
            widget(
              "latest_four",
              { column: "starts_at", by: "day" },
              { sort: [{ by: "starts_at", descending: true }], limit: 4 },
            ),
            widget("by_json", { column: "extra" }),
            widget("plain", undefined, { sort: [{ by: "pet" }] }),
          ],
        },
      ],
    }),
  ];
  const unsigned = {
    formatVersion: 3 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export {};",
    assets: [],
  };
  return { ...unsigned, digest: bundleDigest(unsigned) } as Bundle;
}

const read = async (id: string, more: Record<string, string> = {}) =>
  alice.get(
    `${ws()}/widget-data?${new URLSearchParams({
      of: "interface",
      path: "screens/visits",
      page: "main",
      widget: id,
      ...more,
    })}`,
  );
const rows = async (id: string, more: Record<string, string> = {}) => {
  const answer = await read(id, more);
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.body.inputs.rows;
};
const pets = (wire: Any) => wire.rows.map((row: Any) => row.pet);

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
  const uploaded = await alice.post(`${ws()}/bundles`, bundle());
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
  const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  const seeded = await alice.post(`${ws()}/rows/visits`, {
    rows: [
      // Nov 23 in UTC, and still Nov 22 in Boise.
      { pet: "Late", starts_at: "2026-11-23T04:30:00Z", status: "done" },
      { pet: "Max", starts_at: "2026-11-22T16:00:00Z", status: "booked" },
      { pet: "Poppy", starts_at: "2026-11-22T15:00:00Z", status: "cancelled" },
      { pet: "Archie", starts_at: "2026-11-23T16:00:00Z", status: "booked" },
      { pet: "Bear", starts_at: "2026-11-23T17:00:00Z", status: "done" },
      { pet: "Cleo", starts_at: "2026-11-24T16:00:00Z", status: "done" },
      { pet: "Nala", starts_at: null, status: null },
    ],
  });
  expect(seeded.status, JSON.stringify(seeded.body)).toBe(201);
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

describe("rows grouped by a column", () => {
  test("come by day and then by time, over every page, the rows with no day last", async () => {
    const first = await rows("by_day");
    expect(pets(first)).toEqual(["Poppy", "Max", "Late", "Archie", "Bear"]);
    const second = await rows("by_day", { input: "rows", cursor: first.next });
    expect(pets(second)).toEqual(["Cleo", "Nala"]);
    // Each group is counted whole, with the first page: one that goes on past it is not cut short.
    expect(
      first.groups
        .map((one: Any) => [one.key, one.count])
        .sort((a: Any, b: Any) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["2026-11-22", 2],
      ["2026-11-23", 3],
      ["2026-11-24", 1],
      [null, 1],
    ]);
    expect(second.groups).toBeUndefined();
  });

  test("a time's day is the reader's own: one late in UTC is the day before in Boise", async () => {
    const there = await rows("by_day", { zone: "America/Boise" });
    expect(Object.fromEntries(there.groups.map((one: Any) => [one.key, one.count]))).toMatchObject({
      "2026-11-22": 3,
      "2026-11-23": 2,
    });
    expect((await read("by_day", { zone: "Nowhere/Town" })).status).toBe(400);
    expect((await read("by_day", { zone: "+05:00" })).status).toBe(400);
  });

  test("the latest first, each day in the order asked, and the column read though the widget does not list it", async () => {
    const wire = await rows("by_day_by_pet");
    expect(pets(wire)).toEqual(["Cleo", "Archie", "Bear", "Late", "Max", "Poppy", "Nala"]);
    expect(wire.rows[0].starts_at).toBeTruthy();
    // Everything is here, so there is nothing more to count.
    expect(wire.next).toBeUndefined();
    expect(wire.groups).toBeUndefined();
  });

  test("a heading's sort puts each group in order, and leaves the groups as they are", async () => {
    expect(pets(await rows("by_day_by_pet", { sort: "-pet" }))).toEqual([
      "Cleo",
      "Late",
      "Bear",
      "Archie",
      "Poppy",
      "Max",
      "Nala",
    ]);
  });

  test("weeks begin on Monday", async () => {
    const wire = await rows("by_week");
    expect(Object.fromEntries(wire.groups.map((one: Any) => [one.key, one.count]))).toMatchObject({
      "2026-11-16": 2,
      "2026-11-23": 4,
    });
  });

  test("choices come as their table lists them", async () => {
    const wire = await rows("by_status");
    expect(wire.rows.map((row: Any) => [row.status, row.pet])).toEqual([
      ["booked", "Archie"],
      ["booked", "Max"],
      ["done", "Bear"],
      ["done", "Cleo"],
      ["done", "Late"],
      ["cancelled", "Poppy"],
      [null, "Nala"],
    ]);
  });

  test("the most a widget reads are chosen in its own order, and then grouped", async () => {
    // The latest four visits, by day: not the first four of the days.
    expect(pets(await rows("latest_four"))).toEqual(["Bear", "Archie", "Late", "Cleo"]);
  });

  test("a column that cannot group is refused, and rows with no group are as they were", async () => {
    const refused = await read("by_json");
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("cannot be grouped");
    expect(pets(await rows("plain"))).toEqual([
      "Archie",
      "Bear",
      "Cleo",
      "Late",
      "Max",
      "Nala",
      "Poppy",
    ]);
  });
});
