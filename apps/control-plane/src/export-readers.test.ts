import { request, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, expect, test } from "vitest";
import { exportLimits, readerBoundStream } from "./routes/portability.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * An export holds a database connection while its reader reads the download. A few slow readers
 * must not take every connection: the instance writes a few exports at once, a tenant one, and
 * a reader that stops taking its export has it ended.
 */
const PASSWORD = "a-good-long-password";
let t: TestApp;
let port: number;
const people: { tenant: string; client: Client }[] = [];
const held: IncomingMessage[] = [];

async function tenantWithAdmin(slug: string) {
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const tenant = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const made = await t.admin.post(`/tenants/${tenant}/members`, {
    email: `admin@${slug}.example`,
    name: "admin",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: made.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  const client = await t.signIn(`admin@${slug}.example`, PASSWORD);
  people.push({ tenant, client });
  return { tenant, client };
}

/** Asks for an export and reads none of it: a reader that has stopped. */
function slowExport(who: { tenant: string; client: Client }) {
  return new Promise<{ status: number; headers: IncomingMessage["headers"]; res: IncomingMessage }>(
    (resolve, reject) => {
      const body = JSON.stringify({ passphrase: "a-long-enough-passphrase" });
      const req = request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: `/api/v1/tenants/${who.tenant}/exports`,
          headers: {
            ...who.client.headers,
            origin: t.kernel.config.publicUrl,
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(body)),
          },
        },
        (res) => {
          res.pause();
          held.push(res);
          resolve({ status: res.statusCode ?? 0, headers: res.headers, res });
        },
      );
      req.on("error", reject);
      req.end(body);
    },
  );
}

beforeAll(async () => {
  t = await startTestApp();
  await t.app.listen({ host: "127.0.0.1", port: 0 });
  port = (t.app.server.address() as AddressInfo).port;
  for (const slug of ["slow-a", "slow-b", "slow-c", "slow-d"]) await tenantWithAdmin(slug);
}, 60_000);
afterAll(async () => {
  for (const res of held) res.destroy();
  await t?.stop();
});

test("slow readers cannot hold more exports than the instance allows, and the next is told when to come back", async () => {
  const before = { ...exportLimits };
  exportLimits.atOnce = 3;
  exportLimits.stallMs = 60_000;
  try {
    const [a, b, c, d] = people as [
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0],
    ];
    for (const who of [a, b, c]) expect((await slowExport(who)).status).toBe(200);
    const fourth = await slowExport(d);
    expect(fourth.status).toBe(429);
    expect(Number(fourth.headers["retry-after"])).toBeGreaterThan(0);
    // One tenant has one export at a time, whatever the instance's room.
    exportLimits.atOnce = 10;
    expect((await slowExport(a)).status).toBe(429);
  } finally {
    Object.assign(exportLimits, before);
  }
});

test("an export whose reader stops taking it is ended and its place is given back", async () => {
  const before = { ...exportLimits };
  exportLimits.stallMs = 400;
  try {
    const who = people[3] as (typeof people)[0];
    // The earlier test's slow readers are still holding places: they are ended too.
    await sleep(2500);
    const first = await slowExport(who);
    expect(first.status).toBe(200);
    // While it is held, the tenant has no second one.
    expect((await slowExport(who)).status).toBe(429);
    await sleep(2500);
    const next = await slowExport(who);
    expect(next.status, "the stalled export kept its place").toBe(200);
  } finally {
    Object.assign(exportLimits, before);
  }
}, 30_000);

test("an export read in full still works", async () => {
  const who = people[0] as (typeof people)[0];
  await sleep(100);
  const done = await who.client.post(`/tenants/${who.tenant}/exports`, {
    passphrase: "a-long-enough-passphrase",
  });
  expect(done.status).toBe(200);
});

test("a reader that takes a chunk every so often, never stalling, is still ended after the export's total time", async () => {
  const before = { ...exportLimits };
  exportLimits.stallMs = 5000;
  exportLimits.totalMs = 600;
  try {
    async function* chunks() {
      for (;;) yield Buffer.alloc(64 * 1024);
    }
    let released = false;
    const stream = readerBoundStream(chunks(), () => {
      released = true;
    });
    const ended = new Promise<void>((resolve) => stream.once("close", () => resolve()));
    stream.on("error", () => undefined);
    // One chunk every 100 ms: well inside the stall time, for ever.
    const reader = setInterval(() => stream.read(), 100);
    await Promise.race([ended, sleep(4000)]);
    clearInterval(reader);
    expect(released, "the export kept its place with a reader that never stalled").toBe(true);
  } finally {
    Object.assign(exportLimits, before);
  }
}, 15_000);
