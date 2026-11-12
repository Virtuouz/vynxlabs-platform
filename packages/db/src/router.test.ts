import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Database } from "./database.js";
import { TenantNotFoundError } from "./errors.js";
import { newId } from "./id.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

let testDb: TestDatabase;
let database: Database;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = new Database({ connectionString: testDb.connectionString });
  await database.migrate();
});

afterAll(async () => {
  await database.close();
  await testDb.drop();
});

async function createTenant(slug: string, dataLocation?: object) {
  const id = newId();
  await database.router
    .platform()
    .insertInto("tenant")
    .values({
      id,
      slug,
      name: slug,
      ...(dataLocation ? { data_location: JSON.stringify(dataLocation) } : {}),
    })
    .execute();
  return id;
}

describe("tenant routing", () => {
  test("a new tenant defaults to the shared location and resolves", async () => {
    const id = await createTenant("acme");
    const handle = await database.router.forTenant(id);
    expect(handle.tenantId).toBe(id);
    expect(handle.location).toEqual({ kind: "shared" });
    const row = await handle.db
      .selectFrom("tenant")
      .select("slug")
      .where("id", "=", handle.tenantId)
      .executeTakeFirstOrThrow();
    expect(row.slug).toBe("acme");
  });

  test("a tenant with a dedicated location resolves, and says where its tables live", async () => {
    const id = await createTenant("globex", { kind: "dedicated", ref: "globex-db" });
    const handle = await database.router.forTenant(id);
    expect(handle.location).toEqual({ kind: "dedicated", ref: "globex-db" });
  });

  test("an unknown or malformed tenant ID is refused with a typed error", async () => {
    await expect(database.router.forTenant(newId())).rejects.toBeInstanceOf(TenantNotFoundError);
    await expect(database.router.forTenant("not-an-id")).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });

  test("the database rejects a malformed data location or slug", async () => {
    await expect(createTenant("bad-location", { kind: "elsewhere" })).rejects.toThrow();
    await expect(createTenant("dedicated-no-ref", { kind: "dedicated" })).rejects.toThrow();
    await expect(createTenant("Not A Slug")).rejects.toThrow();
  });
});

describe("no bypass", () => {
  test("only packages/db imports the database driver", async () => {
    const root = join(import.meta.dirname, "../../..");
    const offenders: string[] = [];
    for (const top of ["apps", "packages"]) {
      const entries = await readdir(join(root, top), { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        const path = join(entry.parentPath, entry.name);
        const rel = relative(root, path);
        if (
          !entry.isFile() ||
          !/\.(ts|mts|js|mjs)$/.test(entry.name) ||
          rel.split(sep).some((part) => part === "node_modules" || part === "dist") ||
          rel.startsWith(join("packages", "db") + sep)
        ) {
          continue;
        }
        const source = await readFile(path, "utf8");
        if (/from\s+["'](pg|pg-pool|pg-native)["']|new\s+Kysely\b/.test(source)) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
