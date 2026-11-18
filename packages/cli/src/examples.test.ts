import { fileURLToPath } from "node:url";
import { checkTenantResources, type TenantResource } from "@vynxlabs/manifest";
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

test("higher-ed-devices keeps two of its resources as files, beside the ones its code defines", async () => {
  const built = await buildRepository({ directory: example("higher-ed-devices") });
  const filed = built.bundle.manifests.filter((manifest) => manifest.ownership === "ui");
  expect(filed.map((manifest) => `${manifest.kind} ${manifest.path}`).sort()).toEqual([
    "schedule loans/overdue-each-morning",
    "variable loans/days",
  ]);
  // The script that reads the variable names it by its path, and the build finds it.
  const checkOut = built.bundle.manifests.find((manifest) => manifest.path === "loans/check-out");
  expect(checkOut?.body.uses).toMatchObject({ variables: ["loans/days"] });
}, 120_000);

describe.each(["higher-ed-devices", "fernhill"])("the %s example", (name) => {
  test("builds, with nothing defined and left unexported", async () => {
    const built = await buildRepository({ directory: example(name) });
    expect(built.bundle.manifests.length).toBeGreaterThan(10);
    // It says no key, title or tool name, so it still deploys to an instance from before them.
    expect(built.bundle.formatVersion).toBeLessThan(4);
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
