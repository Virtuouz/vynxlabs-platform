import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PERMISSION_KINDS } from "@volvel/manifest";
import { expect, test } from "vitest";
import { METRIC_LIST } from "./kernel/metric-list.js";

const here = import.meta.dirname;
// The self-hosting guide is now the Self-host collection of the documentation.
const content = join(here, "../../../packages/docs/content/self-host");
const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pages(join(dir, entry.name))
      : entry.name.endsWith(".md")
        ? [join(dir, entry.name)]
        : [],
  );
// The metrics reference is generated from the same typed list, into `generated/`.
const generated = join(here, "../../../packages/docs/generated/self-host");
const guide = [...pages(content), ...pages(generated)]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

test("every series the metrics answer with is in the self-hosting guide (INS-29)", () => {
  // Every series is declared once, in the typed list the metrics route answers from.
  const names = new Set(METRIC_LIST.map((metric) => metric.name));
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
  expect(readFileSync(join(content, "reference/console/branding.md"), "utf8")).toContain(
    "**Console branding**",
  );
});

test("the documentation says how to restore, upgrade Postgres, change AUTH_SECRET, install with no internet, and what the object store must allow (HOST-28)", () => {
  for (const page of [
    "how-to/running/restore-an-instance.md",
    "how-to/running/change-auth-secret.md",
    "how-to/running/upgrade-postgres.md",
    "how-to/running/install-offline.md",
  ]) {
    expect(existsSync(join(content, page)), page).toBe(true);
  }
  // The four things the object store is asked, and the one case that makes the bucket.
  expect(guide).toMatch(/HeadBucket/);
  expect(guide).toMatch(/CreateBucket/);
  expect(guide).toMatch(/DeleteObject/);
});
