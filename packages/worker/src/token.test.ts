import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { readTokenFile } from "./token.js";

test("a credential file gives its first line, and says what is wrong with one that does not", async () => {
  const dir = await mkdtemp(join(tmpdir(), "worker-token-"));
  try {
    await writeFile(join(dir, "good"), "vxw_abc \nignored\n");
    expect(readTokenFile(join(dir, "good"))).toBe("vxw_abc");
    await writeFile(join(dir, "empty"), "\n");
    expect(() => readTokenFile(join(dir, "empty"))).toThrow(/is empty/);
    expect(() => readTokenFile(join(dir, "missing"))).toThrow(/cannot be read: ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("nothing the deploy folder gives a standalone worker puts its credential in the environment (HOST-27)", async () => {
  const folder = fileURLToPath(new URL("../../../deploy/worker/", import.meta.url));
  const files = await readdir(folder);
  expect(files).toContain("compose.yaml");
  for (const name of files) {
    const text = await readFile(join(folder, name), "utf8");
    expect(text, name).not.toMatch(/VOLVEL_WORKER_TOKEN/);
  }
});
