import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "instance"'s pictures (packages/docs/shots/instance.mjs), by the name a shot's `setup` gives. */

type Tenant = { id: string; slug: string };

/** A tenant of this slug, made, or the one an earlier run left. */
const tenantNamed = async (given: Given, slug: string, body: Record<string, unknown>) => {
  const found = (await given.call("GET", "/tenants?limit=200")).items.find(
    (one: Tenant) => one.slug === slug,
  );
  if (found) return found as Tenant;
  return (await given.call("POST", "/tenants", { slug, ...body })) as Tenant;
};

/**
 * A second database on the instance's own server, for a location to point at (the platform
 * refuses its own database). Made through the server's own address, as a person would with psql.
 */
const anotherDatabase = async (own: string, name: string) => {
  const { Client } = createRequire(new URL("../../packages/db/package.json", import.meta.url))(
    "pg",
  ) as typeof import("pg");
  const client = new Client({ connectionString: own });
  await client.connect();
  try {
    const have = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (have.rowCount === 0) await client.query(`create database ${name}`);
  } finally {
    await client.end();
  }
  const address = new URL(own);
  address.pathname = `/${name}`;
  return address.toString();
};

/** The role of an operator, as the Operators screen adds one. */
const OPERATOR_ROLE = "00000000-0000-7000-8000-000000000001";
const PASSPHRASE = "willow-passphrase-2026";

/**
 * A small tenant, exported, deleted, and its export uploaded and left waiting: the state in
 * which Import a tenant shows "Uploads that wait". The tenant's own name and slug are fixed.
 */
const stageWillow = async (given: Given) => {
  const slug = "willow-clinic";
  const gone = (await given.call("GET", "/tenants?limit=200")).items.find(
    (one: Tenant) => one.slug === slug,
  );
  if (gone) await given.call("POST", `/tenants/${gone.id}/deletion`, { confirm: slug });
  // An upload left by an earlier run is thrown away, so that one waits, and it is this one.
  for (const old of (await given.call("GET", "/instance/tenant-imports/staged")).items ?? [])
    await given.call("DELETE", `/instance/tenant-imports/staged/${old.id}`);
  const tenant = (await given.call("POST", "/tenants", {
    slug,
    name: "Willow Pet Clinic",
    addCreator: true,
  })) as Tenant;
  const workspace = await given.call("POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "main",
    name: "Main",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${workspace.id}`;
  await given.call("PUT", `${W}/drafts/visits`, {
    kind: "table",
    schemaVersion: 1,
    body: {
      description: "Who came in, and why.",
      columns: { pet: { type: "text", required: true }, reason: { type: "text" } },
    },
  });
  await given.call("POST", `${W}/changes/deploy`, {});
  await given.call("POST", `${W}/rows/visits`, {
    rows: [
      { pet: "Biscuit", reason: "ear check" },
      { pet: "Juniper", reason: "booster shot" },
    ],
  });
  await stage(given.page, tenant.id, slug);
};

/** Exports the tenant, deletes it, then uploads that file as a staged import: both in the page, as the administrator. */
const stage = (page: Page, tenantId: string, slug: string) =>
  page.evaluate(
    async ([id, passphrase, slug]) => {
      const made = await fetch(`/api/v1/tenants/${id}/exports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!made.ok) throw new Error(`export: ${made.status} ${await made.text()}`);
      const file = await made.arrayBuffer();
      // The check is made when the file comes, so the tenant is gone by then: it can come in.
      const deleted = await fetch(`/api/v1/tenants/${id}/deletion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: slug }),
      });
      if (!deleted.ok) throw new Error(`delete: ${deleted.status} ${await deleted.text()}`);
      const sent = await fetch("/api/v1/instance/tenant-imports/staged?name=willow-clinic.tar", {
        method: "POST",
        headers: { "content-type": "application/x-tar" },
        body: file,
      });
      if (!sent.ok) throw new Error(`stage: ${sent.status} ${await sent.text()}`);
    },
    [tenantId, PASSPHRASE, slug] as const,
  );

export const scenes: Record<string, Scene> = {
  // Fernhill's second operator, so each row of Operators has its own Remove button.
  "instance-operators": async (given) => {
    const found = (await given.call("GET", "/members?search=devi.shah&limit=20")).items.find(
      (one: { email: string }) => one.email === "devi.shah@fernhill.example",
    );
    if (!found) throw new Error("Devi Shah is not a member: Fernhill is not seeded");
    const have = (await given.call("GET", "/bindings?limit=200")).items.some(
      (one: { memberId?: string; memberEmail: string }) =>
        one.memberEmail === "devi.shah@fernhill.example",
    );
    if (!have) {
      await given.call("POST", "/bindings", { memberId: found.id, roleId: OPERATOR_ROLE });
    }
    return { at: "/" };
  },
  // A dedicated database, with a tenant keeping its tables there.
  "instance-databases": async (given) => {
    const name = "eu-tables";
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set: a location needs a database");
    await given.call("PUT", `/instance/database-locations/${name}`, {
      connectionString: await anotherDatabase(connectionString, "eu_tables"),
      description: "Tables of the tenants that must stay in the EU.",
    });
    await tenantNamed(given, "instance-loc-tenant", {
      name: "Instance Loc Tenant",
      dataLocation: name,
    });
    return { at: "/" };
  },
  // A tenant exported, deleted, and its file uploaded and waiting (Import a tenant, Audit log).
  "instance-import": async (given) => {
    await stageWillow(given);
    return { at: "/" };
  },
};
