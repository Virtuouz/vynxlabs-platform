import { execFile } from "node:child_process";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TAR_END, tarEntry, tarIndex, tarRead } from "./tar.js";

const run = promisify(execFile);
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tar-test-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const long = `objects/bundles/${"a".repeat(36)}/${"b".repeat(36)}/${"c".repeat(36)}.json`;
const files: [string, Buffer][] = [
  ["key.json", Buffer.from('{"k":1}')],
  ["platform/workspace.0001.jsonl", Buffer.from('{"id":1}\n{"id":2}\n')],
  [long, Buffer.alloc(1500, 7)],
  ["empty", Buffer.alloc(0)],
  ["exact", Buffer.alloc(512, 1)],
];
const archive = () =>
  Buffer.concat([...files.flatMap(([path, content]) => tarEntry(path, content)), TAR_END]);

describe("the archive format", () => {
  test("what is written is read back, name for name and byte for byte", async () => {
    const path = join(dir, "a.tar");
    await writeFile(path, archive());
    const file = await open(path);
    try {
      const index = await tarIndex(file);
      expect(index.map((entry) => [entry.path, entry.size])).toEqual(
        files.map(([name, content]) => [name, content.length]),
      );
      for (const [at, entry] of index.entries()) {
        expect((await tarRead(file, entry)).equals(files[at]?.[1] as Buffer)).toBe(true);
      }
    } finally {
      await file.close();
    }
  });

  test("an ordinary tar program lists and unpacks it", async () => {
    const path = join(dir, "b.tar");
    await writeFile(path, archive());
    const listed = await run("tar", ["-tf", path]);
    expect(listed.stdout.trim().split("\n")).toEqual(files.map(([name]) => name));
    await run("tar", ["-xf", path, "-C", dir]);
    const unpacked = await open(join(dir, long));
    expect((await unpacked.readFile()).equals(files[2]?.[1] as Buffer)).toBe(true);
    await unpacked.close();
  });

  test("a damaged or shortened archive is refused", async () => {
    const whole = archive();
    const cut = join(dir, "cut.tar");
    await writeFile(cut, whole.subarray(0, whole.length - 1500));
    const damaged = join(dir, "damaged.tar");
    const copy = Buffer.from(whole);
    copy[10] = (copy[10] as number) ^ 0xff;
    await writeFile(damaged, copy);
    const other = join(dir, "other.tar");
    await writeFile(other, Buffer.alloc(2048, 65));
    for (const [path, message] of [
      [cut, "cut short"],
      [damaged, "does not add up"],
      [other, "not a tenant export"],
    ] as const) {
      const file = await open(path);
      await expect(tarIndex(file)).rejects.toThrow(message);
      await file.close();
    }
  });

  test("a path too long to store is refused when writing", () => {
    expect(() => tarEntry("x".repeat(300), Buffer.alloc(1))).toThrow("too long");
  });
});
