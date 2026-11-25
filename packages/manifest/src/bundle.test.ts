import { describe, expect, test } from "vitest";
import { type BundleManifest, bundleDigest, formatFor, keyOf, needsFormat4 } from "./bundle.js";
import { checkBundleAssets, checkBundleManifests } from "./bundle-check.js";

const variable = (path: string, extra: Partial<BundleManifest> = {}): BundleManifest => ({
  kind: "variable",
  schemaVersion: 1,
  path,
  ownership: "code",
  body: { default: "1" },
  ...extra,
});

const unsigned = (formatVersion: 1 | 2 | 3 | 4, manifests: BundleManifest[]) => ({
  formatVersion,
  sdkVersion: "0.5.0",
  core: { min: "0.5.0", below: "0.6.0" },
  manifests,
  code: "export {};",
});

describe("a manifest's key", () => {
  test("is the one it gives, or its path", () => {
    expect(keyOf(variable("limits/size"))).toBe("limits/size");
    expect(keyOf(variable("limits/size", { key: "size" }))).toBe("size");
  });

  test("belongs to one resource in a bundle", () => {
    expect(checkBundleManifests([variable("a"), variable("b", { key: "a" })])).toEqual([
      'b (variable): its key "a" is also the key of a. A key belongs to one resource: give one of them a key of its own.',
    ]);
    // Two resources swapping paths keep their own keys, and that is fine.
    expect(
      checkBundleManifests([variable("a", { key: "b" }), variable("b", { key: "a" })]),
    ).toEqual([]);
  });

  test("is written as a path is, and a title and a tool name are checked", () => {
    expect(checkBundleManifests([variable("a", { key: "Not A Path" })])).toEqual([
      expect.stringContaining("a (variable): /key must match pattern"),
    ]);
    expect(checkBundleManifests([variable("a", { title: "" })])).toEqual([
      expect.stringContaining("a (variable): /title"),
    ]);
    expect(checkBundleManifests([variable("a", { mcp: { name: "Submit-It" } })])).toEqual([
      expect.stringContaining("a (variable): /mcp/name must match pattern"),
      "a (variable): /mcp only a script or a flow is offered to an agent as a tool.",
    ]);
  });
});

describe("what a manifest refers to", () => {
  test("a schedule that starts a flow that is not there is caught", () => {
    const schedule: BundleManifest = {
      kind: "schedule",
      schemaVersion: 1,
      path: "nightly",
      ownership: "code",
      body: { flow: "flows/gone", cron: "0 2 * * *" },
    };
    expect(checkBundleManifests([schedule])).toEqual([
      'nightly (schedule): flow refers to "flows/gone", which is not a flow in this repository.',
    ]);
  });
});

describe("what a trigger source names", () => {
  test("a connection or variable that is not in the repository is caught, as for a script", () => {
    const source: BundleManifest = {
      kind: "trigger_source",
      schemaVersion: 1,
      path: "sources/inbox",
      ownership: "code",
      body: {
        entry: "inbox",
        mode: "poll",
        uses: { connections: ["mail"], variables: ["limits/size"], secrets: ["INBOX_KEY"] },
      },
    };
    const problems = checkBundleManifests([source]);
    expect(problems).toEqual([
      expect.stringContaining('connections refers to "mail"'),
      expect.stringContaining('variables refers to "limits/size"'),
    ]);
    expect(
      checkBundleManifests([
        source,
        variable("limits/size"),
        {
          kind: "connection",
          schemaVersion: 1,
          path: "mail",
          ownership: "code",
          body: { connector: "http" },
        },
      ]),
    ).toEqual([]);
  });
});

describe("the format a bundle is written in", () => {
  test("is the oldest that can carry it", () => {
    expect(formatFor(1, [variable("a")])).toBe(1);
    expect(formatFor(2, [variable("a")])).toBe(2);
    for (const extra of [
      { key: "b" },
      { title: "A" },
      { mcp: { name: "read_a" } },
      { source: { file: "src/a.ts", generated: true } },
    ]) {
      expect(needsFormat4(variable("a", extra))).toBe(true);
      expect(formatFor(1, [variable("a", extra)])).toBe(4);
    }
  });

  test("an older format that carries what only format 4 can is refused", () => {
    const manifests = [variable("a", { title: "A" })];
    expect(checkBundleAssets(unsigned(3, manifests))).toEqual([
      "a (variable): a key, a title, a tool name and a source need bundle format 4. Build with a current SDK and CLI.",
    ]);
    expect(checkBundleAssets(unsigned(4, manifests))).toEqual([]);
  });

  test("a bundle that says none of it hashes as it always did", () => {
    // Recorded before format 4, whose code did not touch how a bundle is hashed: it must never move.
    expect(bundleDigest(unsigned(1, [variable("a")]))).toBe(
      "cdb3ec674dbdb9189671e330d8c24241885cc5564bd0f73aee9c166ef16fe126",
    );
    expect(bundleDigest(unsigned(1, [variable("a")]))).not.toBe(
      bundleDigest(unsigned(4, [variable("a", { title: "A" })])),
    );
    const plain = variable("a");
    expect(Object.keys(plain).sort()).toEqual([
      "body",
      "kind",
      "ownership",
      "path",
      "schemaVersion",
    ]);
  });
});

describe("the names of an app's files (APP-05)", () => {
  const app = (path: string) => ({
    kind: "app" as const,
    schemaVersion: 1,
    path: "portal",
    ownership: "code" as const,
    body: { title: "Portal", entry: path },
  });
  const check = (...paths: string[]) =>
    checkBundleAssets({
      formatVersion: 2,
      manifests: [app("index.html")],
      assets: ["index.html", ...paths].map((path) => ({
        app: "portal",
        path,
        sha256: "0".repeat(64),
        size: 1,
        contentType: "text/plain",
      })),
    });

  test("may begin with a dot or an underscore, below the top and for .well-known", () => {
    expect(check("assets/_chunk.js", ".well-known/x", "_helpers-1a2b.js", "a/.hidden")).toEqual([]);
  });

  test("never be . or .., nor have a space, and the refusal says how to rename the file", () => {
    for (const path of ["a/../b", "./x", "a b.png", "café.png", "_/x"]) {
      expect(check(path).join(" "), path).toMatch(/portal \(app\):/);
    }
    expect(check("my logo.png")[0]).toContain('the file "my logo.png"');
    expect(check("my logo.png")[0]).toContain("build.rollupOptions.output");
  });
});

describe("a script's worker pool", () => {
  const script = (worker: string): BundleManifest => ({
    kind: "script",
    schemaVersion: 1,
    path: "jobs/nightly",
    ownership: "code",
    body: {
      entry: "nightly",
      input: { type: "object" },
      output: {},
      timeoutSeconds: 30,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      worker,
    },
  });

  test("cannot be called default: that is the queue of scripts that name no pool (GOV-38)", () => {
    const problems = checkBundleManifests([script("default")]);
    expect(problems.join("\n")).toContain("pool called default");
    expect(checkBundleManifests([script("clients-lan")])).toEqual([]);
  });
});

describe("a binding's role", () => {
  const role = (path: string, name: string): BundleManifest => ({
    kind: "role",
    schemaVersion: 1,
    path,
    ownership: "code",
    body: { name, permissions: ["data:read"] },
  });
  const binding = (roleName: string): BundleManifest => ({
    kind: "binding",
    schemaVersion: 1,
    path: "bindings/a",
    ownership: "code",
    body: { role: roleName, principal: { type: "anonymous" } },
  });

  test("may be a built-in role, or one the repository defines, by its name", () => {
    expect(checkBundleManifests([binding("portal_user")])).toEqual([]);
    expect(
      checkBundleManifests([role("roles/reader", "order_reader"), binding("order_reader")]),
    ).toEqual([]);
  });

  test("is refused when it is the path of a role, not its name", () => {
    expect(
      checkBundleManifests([role("roles/reader", "order_reader"), binding("roles/reader")]),
    ).toEqual([
      'bindings/a (binding): /body/role refers to "roles/reader", which is a role\'s path. A binding names a role by its name: "order_reader".',
    ]);
  });

  test("is refused when it is no role of the repository and no built-in, once the tenant's roles are known", () => {
    const known = { tenantRoles: ["front_desk"] };
    expect(checkBundleManifests([binding("front_desk")], known)).toEqual([]);
    expect(checkBundleManifests([binding("portal_usr")], known)).toEqual([
      'bindings/a (binding): /body/role refers to "portal_usr", which is not a role in this repository, a built-in role or one of the tenant\'s.',
    ]);
    // Without them, a name that may be a role made in the console is let through.
    expect(checkBundleManifests([binding("portal_usr")])).toEqual([]);
  });
});
