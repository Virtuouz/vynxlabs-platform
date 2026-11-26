import { randomBytes } from "node:crypto";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Vault } from "../crypto.js";
import { TAR_END, tarEntry, tarIndex } from "./tar.js";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "import-limits-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

/** An archive whose first header says this about its size, with the checksum made to match. */
function archiveSaying(size: string): Buffer {
  const bytes = Buffer.concat([...tarEntry("a.txt", Buffer.from("hello")), TAR_END]);
  Buffer.alloc(12, 0).copy(bytes, 124);
  Buffer.from(size).copy(bytes, 124);
  const header = bytes.subarray(0, 512);
  header.fill(" ", 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  Buffer.from(`${sum.toString(8).padStart(6, "0")}\0 `).copy(bytes, 148);
  return bytes;
}

describe("p35 what an archive says of its own files is held to what it is", () => {
  for (const size of ["-1000", "abc", "99999999999", "1.5"]) {
    test(`a header size of "${size}" is refused, not looped on`, async () => {
      const path = join(dir, `size-${Math.random()}.tar`);
      await writeFile(path, archiveSaying(size));
      const file = await open(path);
      try {
        await expect(
          Promise.race([
            tarIndex(file),
            new Promise((_, reject) => setTimeout(() => reject(new Error("looped")), 3000)),
          ]),
        ).rejects.toThrow(/damaged|cut short/);
      } finally {
        await file.close();
      }
    }, 10_000);
  }
});

describe("p35 an export's key says how dear its passphrase is, and the platform holds that to a range", () => {
  const vault = new Vault(randomBytes(32));
  const tenantId = "0199d0aa-0000-7000-8000-000000000001";
  const { wrapped } = vault.newTenantKey(tenantId);
  const exported = vault.exportTenantKey(tenantId, wrapped, "a passphrase");

  test("what an export writes is opened", () => {
    expect(vault.importTenantKey(tenantId, exported, "a passphrase")).toBeInstanceOf(Buffer);
  });

  test("a cost far beyond it is refused at once, not run", () => {
    const started = performance.now();
    expect(() =>
      vault.importTenantKey(tenantId, { ...exported, n: 2 ** 17, r: 8, p: 8 }, "a passphrase"),
    ).toThrow(/cost this platform does not accept/);
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("a cost that is not a whole number in range is refused", () => {
    for (const cost of [
      { n: 2 ** 15, r: 8, p: 3 },
      { n: 2 ** 15 + 1, r: 8, p: 1 },
      { n: "32768", r: 8, p: 1 },
      { n: 2 ** 15, r: 0, p: 1 },
      { n: 2 ** 15, r: 8, p: -1 },
    ]) {
      expect(() =>
        vault.importTenantKey(tenantId, { ...exported, ...cost } as never, "a passphrase"),
      ).toThrow(/cost this platform does not accept/);
    }
  });
});
