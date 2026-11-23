import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PERMISSION_KINDS } from "@volvel/manifest";
import { expect, test } from "vitest";

const here = import.meta.dirname;
const guide = readFileSync(join(here, "../../../docs/self-hosting.md"), "utf8");

test("every series the metrics answer with is in the self-hosting guide (INS-29)", () => {
  const names = new Set<string>();
  for (const file of ["routes/execution.ts", "kernel/metrics.ts"]) {
    const source = readFileSync(join(here, file), "utf8");
    for (const found of source.matchAll(/(?:# TYPE |")(volvel_[a-z_]+)/g)) {
      names.add(found[1] as string);
    }
  }
  expect(names.size).toBeGreaterThan(15);
  expect([...names].filter((name) => !guide.includes(name))).toEqual([]);
});

test("the permission words say what each permission does (INS-29)", () => {
  const verbs = (kind: string) => PERMISSION_KINDS.find((one) => one.kind === kind)?.verbs;
  // An import is a tenant's: `tenant:write`, not the instance's.
  expect(verbs("instance")?.write).not.toMatch(/import/i);
  expect(verbs("tenant")?.write).toMatch(/import/i);
});

test("the guide does not say what the code does not do (INS-29)", () => {
  // The data role's password is made from a secret kept in the database, not from the master key.
  expect(guide).not.toMatch(/password is derived from the master key/);
  // An import is refused while the tenant is still here: moving means deleting first.
  expect(guide).not.toMatch(/export it and import it into the location you want/);
  expect(guide).toMatch(/`\/api\/v1\/readyz` stays 200/);
  // The screen is called Console branding in the navigation.
  expect(guide).toContain("**Instance → Console branding**");
});

test("the guide says how to restore, upgrade Postgres, change AUTH_SECRET, install with no internet, and what the object store must allow (HOST-28)", () => {
  for (const heading of [
    "## Restoring an instance",
    "### Changing `AUTH_SECRET`",
    "### Upgrading Postgres to a newer major version",
    "### Installing where there is no internet",
  ]) {
    expect(guide, heading).toContain(`\n${heading}\n`);
  }
  // The four things the object store is asked, and the one case that makes the bucket.
  expect(guide).toMatch(/HeadBucket/);
  expect(guide).toMatch(/CreateBucket/);
  expect(guide).toMatch(/DeleteObject/);
});
