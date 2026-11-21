import { randomBytes } from "node:crypto";
import { newId, sql } from "@volvel/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadConfig } from "./config.js";
import { fingerprint, Vault } from "./kernel/crypto.js";
import { decryptFor, encryptFor } from "./kernel/execution/bindings.js";
import { DATA_ROLE_SECRET, instanceSecret } from "./kernel/instance-secrets.js";
import { createKernel, type Kernel } from "./kernel/kernel.js";
import { rekey } from "./kernel/rekey.js";
import { revealSecret, setSecret } from "./kernel/secrets.js";
import { openSecrets } from "./kernel/sso/providers.js";
import { tenantKey } from "./kernel/tenant-keys.js";
import { startTestApp, type TestApp } from "./testing.js";

describe("the vault with two keys", () => {
  const a = randomBytes(32);
  const b = randomBytes(32);

  test("opens with either, always seals with the first, and rewraps only what the second sealed", () => {
    const old = new Vault(a);
    const sealedOld = old.sealForInstance("x", "hello");
    const both = new Vault(b, a);
    expect(both.openForInstance("x", sealedOld)).toBe("hello");
    const sealedNew = both.sealForInstance("x", "hi");
    expect(new Vault(b).openForInstance("x", sealedNew)).toBe("hi");
    expect(() => old.openForInstance("x", sealedNew)).toThrow();

    const moved = both.rewrap("instance:x", sealedOld) as Buffer;
    expect(new Vault(b).openForInstance("x", moved)).toBe("hello");
    expect(both.rewrap("instance:x", moved)).toBeUndefined();
    // Neither key: refused, never guessed at.
    expect(() =>
      both.rewrap("instance:x", new Vault(randomBytes(32)).sealForInstance("x", "?")),
    ).toThrow();
    // Nor under another context.
    expect(() => both.rewrap("instance:y", sealedOld)).toThrow();

    expect(both.fingerprints).toEqual({ current: fingerprint(b), secondary: fingerprint(a) });
    expect(fingerprint(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  test("the setting is read, checked, and refused when it is the master key", () => {
    const env = {
      DATABASE_URL: "postgres://x/y",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
      PUBLIC_URL: "http://localhost:8080",
      AUTH_SECRET: "x".repeat(32),
      MASTER_KEY: a.toString("base64"),
    };
    expect(loadConfig(env).masterKeySecondary).toBeUndefined();
    expect(
      loadConfig({ ...env, MASTER_KEY_SECONDARY: b.toString("base64") }).masterKeySecondary,
    ).toEqual(b);
    expect(() => loadConfig({ ...env, MASTER_KEY_SECONDARY: a.toString("base64") })).toThrow(
      /the same as MASTER_KEY/,
    );
    expect(() => loadConfig({ ...env, MASTER_KEY_SECONDARY: "c2hvcnQ=" })).toThrow(/32 bytes/);
  });
});

describe("rotating the master key", () => {
  const oldKey = randomBytes(32);
  const newKey = randomBytes(32);
  let t: TestApp;
  let tenant: string;
  let workspace: string;
  let provider: string;
  let pending: string;
  /** A connection's credential, sealed with the tenant's key under the old master key. */
  let credential: Buffer;

  /** The same database, as an instance started with other keys would see it. */
  const restart = (masterKey: Buffer, secondary?: Buffer): Kernel =>
    createKernel(
      t.database,
      t.kernel.storage,
      "1.2.3",
      { ...t.kernel.config, masterKey, masterKeySecondary: secondary },
      t.kernel.log,
    );

  beforeAll(async () => {
    t = await startTestApp({ config: { masterKey: oldKey } });
    tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
    const admin = (
      await t.db
        .selectFrom("role")
        .select("id")
        .where("name", "=", "tenant_admin")
        .where("builtin", "=", true)
        .executeTakeFirstOrThrow()
    ).id;
    await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: admin });
    workspace = (
      await t.admin.post(`/tenants/${tenant}/workspaces`, {
        slug: "main",
        name: "Main",
        type: "dev",
      })
    ).body.id;
    const k = t.kernel;
    // A secret, a connection's credential, a database location, the instance's own
    // provider, and a sign-in in progress: one of each thing sealed at either level.
    await t.db
      .transaction()
      .execute((trx) =>
        setSecret(
          trx,
          k.vault,
          { tenantId: tenant, workspaceId: workspace, name: "TOKEN" },
          "s3cr3t",
        ),
      );
    credential = await encryptFor(k, t.db, tenant, workspace, "connection:api", "key-1");
    await t.db
      .insertInto("database_location")
      .values({
        name: "eu-main",
        connection_encrypted: k.data.seal("eu-main", "postgres://eu.example/db"),
      } as never)
      .execute();
    provider = newId();
    await sql`
      insert into identity_provider (id, tenant_id, audience, protocol, name, config, secrets)
      values (${provider}, null, 'members', 'oidc', 'Operators', '{}'::jsonb,
        ${k.vault.sealForInstance(`sso:${provider}`, JSON.stringify({ clientSecret: "cs" }))})
    `.execute(t.db);
    pending = newId();
    await sql`
      insert into sso_state (id, provider_id, purpose, state_hash, browser_hash, secrets, origin, expires_at)
      values (${pending}, ${provider}, 'sign_in', ${newId()}, '',
        ${k.vault.sealForInstance(`sso-state:${pending}`, '{"nonce":"n"}')},
        'http://localhost:8080', now() + interval '10 minutes')
    `.execute(t.db);
  }, 60_000);

  afterAll(async () => {
    await t?.stop();
  });

  test("the data role's secret is the master key it had, kept apart from it", async () => {
    expect(
      await instanceSecret(t.db, t.kernel.vault, DATA_ROLE_SECRET, () => randomBytes(32)),
    ).toEqual(oldKey);
  });

  test("a pass stopped halfway and run again moves everything, and the new key alone then opens it all", async () => {
    // More than one batch of tenant keys, so a pass can stop between batches.
    for (let i = 0; i < 4; i++) {
      const id = (await t.admin.post("/tenants", { slug: `t${i}`, name: `T${i}` })).body.id;
      await tenantKey(t.db, t.kernel.vault, id);
    }
    const both = restart(newKey, oldKey);
    const looked = await rekey(both, { look: true });
    expect(looked.rewrapped).toMatchObject({
      "database locations": 1,
      "identity providers": 1,
      "sign-ins in progress": 1,
      "instance secrets": 1,
    });
    expect(looked.rewrapped["tenant keys"]).toBeGreaterThanOrEqual(1);
    expect(looked.unopened).toEqual([]);

    // Stopped after the first batch of two.
    let batches = 0;
    await expect(
      rekey(both, {
        batch: 2,
        afterBatch: () => {
          batches += 1;
          if (batches === 1) throw new Error("stopped");
        },
      }),
    ).rejects.toThrow("stopped");
    const partway = await rekey(both, { look: true });
    expect(partway.rewrapped["tenant keys"]).toBe((looked.rewrapped["tenant keys"] ?? 0) - 2);
    expect(partway.current["tenant keys"]).toBe(2);

    const done = await rekey(both, { batch: 2 });
    expect(done.unopened).toEqual([]);
    const after = await rekey(both, { look: true });
    expect(Object.values(after.rewrapped).every((n) => n === 0)).toBe(true);

    const fresh = restart(newKey);
    const id = { tenantId: tenant, workspaceId: workspace, name: "TOKEN" };
    expect(await revealSecret(t.db, fresh.vault, id)).toBe("s3cr3t");
    expect(await decryptFor(fresh, t.db, tenant, workspace, "connection:api", credential)).toBe(
      "key-1",
    );
    const location = await t.db
      .selectFrom("database_location")
      .select("connection_encrypted")
      .where("name", "=", "eu-main")
      .executeTakeFirstOrThrow();
    expect(
      fresh.vault.openForInstance("database-location:eu-main", location.connection_encrypted),
    ).toBe("postgres://eu.example/db");
    expect(await openSecrets(fresh, t.db, { id: provider, tenantId: null })).toEqual({
      clientSecret: "cs",
    });
    const state = await sql<{
      secrets: Buffer;
    }>`select secrets from sso_state where id = ${pending}`.execute(t.db);
    expect(
      fresh.vault.openForInstance(`sso-state:${pending}`, state.rows[0]?.secrets as Buffer),
    ).toBe('{"nonce":"n"}');
    // The data role's password is unchanged: still made from the key the instance had.
    expect(
      await instanceSecret(t.db, fresh.vault, DATA_ROLE_SECRET, () => randomBytes(32)),
    ).toEqual(oldKey);
    const store = await fresh.data.platform();
    expect(store.role).toBe((await t.kernel.data.platform()).role);
    // And the old key alone opens none of it any more.
    expect(() =>
      restart(oldKey).vault.openForInstance(
        "database-location:eu-main",
        location.connection_encrypted,
      ),
    ).toThrow();
  });

  test("a value a replica on the old key sealed during the swap is moved by the next pass", async () => {
    const lagging = restart(oldKey);
    const late = (await t.admin.post("/tenants", { slug: "late", name: "Late" })).body.id;
    await tenantKey(t.db, lagging.vault, late);
    const both = restart(newKey, oldKey);
    expect((await rekey(both, { look: true })).rewrapped["tenant keys"]).toBe(1);
    expect((await rekey(both)).rewrapped["tenant keys"]).toBe(1);
    expect((await rekey(both, { look: true })).rewrapped["tenant keys"]).toBe(0);
  });

  test("a value neither key opens is reported and left as it is", async () => {
    const stranger = new Vault(randomBytes(32));
    const id = newId();
    await sql`
      insert into identity_provider (id, tenant_id, audience, protocol, name, config, secrets)
      values (${id}, null, 'members', 'oidc', 'Lost', '{}'::jsonb,
        ${stranger.sealForInstance(`sso:${id}`, "{}")})
    `.execute(t.db);
    const before = await sql<{
      secrets: Buffer;
    }>`select secrets from identity_provider where id = ${id}`.execute(t.db);
    const result = await rekey(restart(newKey, oldKey));
    expect(result.unopened).toEqual([{ place: "identity providers", id }]);
    const after = await sql<{
      secrets: Buffer;
    }>`select secrets from identity_provider where id = ${id}`.execute(t.db);
    expect(after.rows[0]?.secrets).toEqual(before.rows[0]?.secrets);
    await sql`delete from identity_provider where id = ${id}`.execute(t.db);
  });

  test("where a rotation stands is for operators only, and says when the second key can go", async () => {
    // The test app runs with the old key; what it says is about its own keys.
    const status = await t.admin.get("/instance/master-key");
    expect(status.status, JSON.stringify(status.body)).toBe(200);
    expect(status.body).toMatchObject({
      masterKey: fingerprint(oldKey),
      secondaryKey: null,
      secondaryRemovable: false,
    });
    // Everything is under the new key now, which this instance does not have.
    expect(status.body.unopened.length).toBeGreaterThan(0);
    const anonymous = await t.anonymous.get("/instance/master-key");
    expect(anonymous.status).toBe(401);
    const audit = await t.db
      .selectFrom("audit_entry")
      .select(["action", "details"])
      .where("action", "=", "instance.rekeyed")
      .execute();
    expect(audit.length).toBeGreaterThanOrEqual(2);
    expect(audit[0]?.details).toMatchObject({ masterKey: fingerprint(newKey) });
  });
});
