import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { staleKindTypes, staleSchemas } from "./emit.js";
import { PATH_PATTERN } from "./envelope.js";
import { KindRegistry } from "./registry.js";
import { displayGuess } from "./table.js";

const fixtureKind = {
  kind: "fixture",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: { timeout: { type: "integer", minimum: 1 }, label: { type: "string" } },
    required: ["timeout"],
    additionalProperties: false,
  },
};

const valid = {
  kind: "fixture",
  schemaVersion: 1,
  path: "billing/send-reminder",
  workspace: "acme-prod",
  ownership: "code",
  body: { timeout: 30 },
};

const registry = new KindRegistry().register(fixtureKind);

function issues(input: unknown) {
  const result = registry.validateManifest(input);
  return result.ok ? [] : result.issues;
}

describe("a field left empty", () => {
  const withPath = new KindRegistry().register({
    kind: "fixture",
    schemaVersion: 1,
    body: {
      type: "object",
      properties: { script: { type: "string", pattern: PATH_PATTERN } },
      required: ["script"],
    },
  });
  test("is said to be empty, not to fail a pattern", () => {
    const result = withPath.validateManifest({ ...valid, body: { script: "" } });
    expect(result.ok).toBe(false);
    const message = result.ok ? "" : (result.issues[0]?.message ?? "");
    expect(message).toBe("is empty: it needs a value");
    // A value that is not empty and still wrong keeps the grammar's own words.
    const wrong = withPath.validateManifest({ ...valid, body: { script: "Not A Path" } });
    expect(wrong.ok ? "" : (wrong.issues[0]?.message ?? "")).toContain("must match pattern");
  });
});

describe("path grammar", () => {
  const pattern = new RegExp(PATH_PATTERN);
  test.each(["sync_orders", "billing/invoices/send-reminder", "a", "2fa/setup"])(
    "accepts %s",
    (path) => {
      expect(pattern.test(path)).toBe(true);
    },
  );
  test.each([
    "",
    "/leading",
    "trailing/",
    "double//slash",
    "Upper",
    "with space",
    "_start",
    "a/-b",
    "dot.name",
  ])("rejects %j", (path) => {
    expect(pattern.test(path)).toBe(false);
  });
});

describe("envelope", () => {
  test("accepts a valid manifest", () => {
    expect(registry.validateManifest(valid)).toEqual({ ok: true, value: valid });
  });

  test("rejects a missing field, an unknown field and a bad ownership", () => {
    const { path: _path, ...missing } = valid;
    expect(issues(missing)).toEqual([{ path: "/", message: "must have required property 'path'" }]);
    expect(issues({ ...valid, extra: 1 })[0]).toEqual({
      path: "/",
      message: "must NOT have additional properties (extra)",
    });
    expect(issues({ ...valid, ownership: "both" })[0]?.path).toBe("/ownership");
  });

  test("an authored manifest may not carry an ID or version", () => {
    expect(
      issues({ ...valid, id: "019a0000-0000-7000-8000-000000000000", version: 1 }),
    ).toHaveLength(2);
  });

  test("a stored resource requires an ID and version", () => {
    const stored = { ...valid, id: "019a0000-0000-7000-8000-000000000000", version: 3 };
    expect(registry.validateStoredResource(stored).ok).toBe(true);
    expect(registry.validateStoredResource(valid).ok).toBe(false);
    expect(registry.validateStoredResource({ ...stored, id: "nope" }).ok).toBe(false);
  });
});

describe("kind registry", () => {
  test("validates the body against the kind's schema", () => {
    expect(issues({ ...valid, body: { timeout: 0, other: true } })).toEqual([
      { path: "/body", message: "must NOT have additional properties (other)" },
      { path: "/body/timeout", message: "must be >= 1" },
    ]);
  });

  test("rejects an unknown kind and an unknown schema version", () => {
    expect(issues({ ...valid, kind: "mystery" })).toEqual([
      { path: "/kind", message: 'unknown kind "mystery"' },
    ]);
    expect(issues({ ...valid, schemaVersion: 2 })).toEqual([
      { path: "/schemaVersion", message: 'kind "fixture" has no schema version 2 (known: 1)' },
    ]);
  });

  test("a kind can gain a schema version without disturbing the old one", () => {
    const local = new KindRegistry().register(fixtureKind).register({
      kind: "fixture",
      schemaVersion: 2,
      body: { type: "object", required: ["retries"] },
    });
    expect(local.kinds()).toEqual([{ kind: "fixture", schemaVersions: [1, 2] }]);
    expect(local.validateManifest(valid).ok).toBe(true);
    expect(local.validateManifest({ ...valid, schemaVersion: 2 }).ok).toBe(false);
  });

  test("refuses a duplicate registration and a bad kind name", () => {
    expect(() => new KindRegistry().register(fixtureKind).register(fixtureKind)).toThrow(
      /already registered/,
    );
    expect(() => new KindRegistry().register({ ...fixtureKind, kind: "Bad-Name" })).toThrow(
      /must match/,
    );
  });
});

describe("emitted schemas", () => {
  test("schemas/ matches the code", async () => {
    const dir = fileURLToPath(new URL("../../../schemas", import.meta.url));
    expect(await staleSchemas(dir)).toEqual([]);
  });

  test("the SDK's generated types match the kinds", async () => {
    const dir = fileURLToPath(new URL("../../sdk/src/generated", import.meta.url));
    expect(await staleKindTypes(dir)).toBe(false);
  });
});

test("a reference names a row by its name or title when the table says nothing stands for it", () => {
  const col = (name: string, type: string, status = "active") => ({ name, type, status });
  expect(displayGuess([col("species", "text"), col("name", "text"), col("born", "date")])).toBe(
    "name",
  );
  expect(displayGuess([col("code", "text"), col("title", "text")])).toBe("title");
  expect(displayGuess([col("weight", "number"), col("breed", "text")])).toBe("breed");
  expect(displayGuess([col("old", "text", "retired"), col("weight", "number")])).toBeUndefined();
});
