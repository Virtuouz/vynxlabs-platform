import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WORKER_VERSION } from "./worker.js";

test("the version a worker claims is its package's, which a release sets (HOST-14)", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(WORKER_VERSION).toBe(manifest.version);
  expect(WORKER_VERSION).not.toBe("0.7.0");
});
