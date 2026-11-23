import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { setVersion } from "./release-version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "release-version-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A copy of the files a release rewrites, so that the repository's own are not touched. */
function copy() {
  const root = mkdtempSync(join(scratch, "root-"));
  const files = [
    ...["widget-sdk", "markup", "docs-engine", "docs", "ui", "app", "sdk", "cli", "worker"].map(
      (name) => `packages/${name}/package.json`,
    ),
    "apps/control-plane/package.json",
    "apps/console/package.json",
    "packages/sdk/src/index.ts",
    "packages/cli/src/local.ts",
  ];
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(ROOT, file), join(root, file));
  }
  return root;
}
const read = (root, file) => readFileSync(join(root, file), "utf8");

test("a release gives the control plane, console, worker, SDK and starter the same version (HOST-13)", () => {
  const root = copy();
  setVersion(root, "0.6.0");
  for (const folder of [
    "apps/control-plane",
    "apps/console",
    "packages/worker",
    "packages/sdk",
    "packages/cli",
  ]) {
    expect(JSON.parse(read(root, `${folder}/package.json`)).version, folder).toBe("0.6.0");
  }
  const sdk = read(root, "packages/sdk/src/index.ts");
  expect(sdk).toContain('export const SDK_VERSION = "0.6.0";');
  expect(sdk).toContain('export const CORE_RANGE = { min: "0.6.0", below: "0.7.0" };');
  expect(read(root, "packages/cli/src/local.ts")).toContain('STARTER_SDK_RANGE = "^0.6.0";');
});

test("a prerelease is the version it leads to, for the range a bundle asks of a core (HOST-13)", () => {
  const root = copy();
  setVersion(root, "1.2.3-next.4be1c09a");
  expect(read(root, "packages/sdk/src/index.ts")).toContain(
    'export const CORE_RANGE = { min: "1.2.0", below: "1.3.0" };',
  );
  expect(() => setVersion(root, "next")).toThrow(/not a version/);
});
