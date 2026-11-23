import { fileURLToPath } from "node:url";
import { checkTenantResources, type TenantResource } from "@volvel/manifest";
import { describe, expect, test } from "vitest";
import { readAccess } from "./access.js";
import { buildRepository } from "./build.js";

/**
 * The sample tenants build, and each brings up its own access: whatever its
 * bindings and its flows name by key is a file in its `tenant/` folder. They
 * are what a new developer copies from, so they are built here with the rest.
 */

const example = (name: string) =>
  fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));

/** Every group or service account a bundle's bindings name by key. */
function namedByKey(manifests: { kind: string; body: Record<string, unknown> }[]) {
  const named: string[] = [];
  for (const manifest of manifests) {
    if (manifest.kind === "binding") {
      const principal = manifest.body.principal as { type?: string; key?: string };
      if (principal.key) named.push(`${principal.type} ${principal.key}`);
    }
    if (manifest.kind === "flow") {
      const nodes = (manifest.body.nodes ?? {}) as Record<
        string,
        { approvers?: { groups?: string[] } }
      >;
      for (const node of Object.values(nodes)) {
        for (const group of node.approvers?.groups ?? []) named.push(`group ${group}`);
      }
    }
  }
  return [...new Set(named)].sort();
}
const has = (resources: TenantResource[]) =>
  resources.map((one) => `${one.kind} ${one.key}`).sort();

test("higher-ed-devices keeps what has no code as files, beside the logic its code defines", async () => {
  const built = await buildRepository({ directory: example("higher-ed-devices") });
  const filed = built.bundle.manifests.filter((manifest) => manifest.ownership === "ui");
  // What the console edits is a file from the start, so editing it there is an edit and
  // never a takeover from the code.
  expect(filed.map((manifest) => `${manifest.kind} ${manifest.path}`).sort()).toEqual([
    "app borrow",
    "app desk",
    "dashboard reports/lending",
    "interface screens/borrow",
    "interface screens/desk",
    "query reports/loans-by-month",
    "schedule loans/overdue-each-morning",
    "theme theme",
    "variable loans/days",
  ]);
  expect(
    built.bundle.manifests
      .filter((manifest) => manifest.ownership === "code")
      .map((manifest) => manifest.kind)
      .filter((kind) => ["app", "interface", "theme", "variable", "schedule"].includes(kind)),
  ).toEqual([]);
  // The script that reads the variable names it by its path, and the build finds it.
  const checkOut = built.bundle.manifests.find((manifest) => manifest.path === "loans/check-out");
  expect(checkOut?.body.uses).toMatchObject({ variables: ["loans/days"] });
}, 120_000);

describe.each(["higher-ed-devices", "fernhill"])("the %s example", (name) => {
  test("builds, with nothing defined and left unexported", async () => {
    const built = await buildRepository({ directory: example(name) });
    expect(built.bundle.manifests.length).toBeGreaterThan(10);
    if (name === "fernhill") {
      // Its handbook's pages each say their title, which a bundle has carried since format 4.
      // An instance old enough not to know that format knows no pages either.
      expect(built.bundle.formatVersion).toBe(4);
      expect(
        built.bundle.manifests.filter((manifest) => manifest.kind === "doc").map((doc) => doc.path),
      ).toEqual([
        "handbook/front-desk/booking",
        "handbook/front-desk/checking-in/arrivals",
        "handbook/front-desk/checking-in/index",
        "handbook/front-desk/checking-in/late-arrivals",
        "handbook/front-desk/index",
        "handbook/front-desk/invoices",
        "handbook/index",
      ]);
      // It uses the four types where they are natural, and says nothing the docs check would warn of.
      expect(built.warnings).toEqual([]);
      const source = (path: string) => {
        const body = built.bundle.manifests.find((one) => one.path === path)?.body as
          | { source?: string }
          | undefined;
        return String(body?.source);
      };
      expect(source("handbook/front-desk/index")).toContain("type: how-to");
      expect(source("handbook/front-desk/invoices")).toContain("type: explanation");
      expect(source("handbook/front-desk/checking-in/late-arrivals")).toContain("type: reference");
    } else {
      // It says no key, title or tool name, so it still deploys to an instance from before them.
      expect(built.bundle.formatVersion).toBeLessThan(4);
    }
  }, 120_000);

  test("names its groups and service accounts by key, and defines each of them in tenant/", async () => {
    const built = await buildRepository({ directory: example(name) });
    const access = await readAccess(example(name));
    expect(checkTenantResources(access)).toEqual([]);
    const named = namedByKey(built.bundle.manifests);
    expect(named.length).toBeGreaterThan(0);
    expect(has(access)).toEqual(expect.arrayContaining(named));
    // And none of its bindings still goes by what a group is called.
    expect(
      built.bundle.manifests.filter(
        (manifest) =>
          manifest.kind === "binding" &&
          (manifest.body.principal as { name?: string }).name !== undefined,
      ),
    ).toEqual([]);
  }, 120_000);
});
