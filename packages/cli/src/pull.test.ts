import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { pulledFile, pullInto } from "./pull.js";

const directory = mkdtempSync(join(tmpdir(), "vx-pull-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const put = (path: string, content: string) => {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), content);
};
const read = (path: string) => readFileSync(join(directory, path), "utf8");
const pull = (
  files: { path: string; content: string }[],
  elsewhere: { path: string; content: string; resource?: string }[],
  options: { force?: boolean; drafts?: { path: string; revision: number }[] } = {},
) =>
  pullInto(
    join(directory, "platform"),
    pulledFile(directory),
    "ws-1",
    files,
    options.force === true,
    options.drafts ?? [],
    { directory, files: elsewhere },
  );

describe("a pull of files the repository keeps outside platform/", () => {
  const limit = (value: string) => `schemaVersion: 1\nbody:\n  default: "${value}"\n`;

  test("a file that says the same is left as its author wrote it, and one never pulled is not overwritten", async () => {
    const written = `# Ours.\nbody: { default: "5" }\nschemaVersion: 1\n`;
    put("src/lending/limit.variable.yaml", written);
    const same = await pull([], [{ path: "src/lending/limit.variable.yaml", content: limit("5") }]);
    expect(same).toMatchObject({ written: [], unchanged: 1, kept: [] });
    expect(read("src/lending/limit.variable.yaml")).toBe(written);

    // Changed in the console and written by hand here since: the developer's stays.
    put("src/lending/limit.variable.yaml", limit("7"));
    const kept = await pull(
      [],
      [{ path: "src/lending/limit.variable.yaml", content: limit("6"), resource: "lending/limit" }],
      { drafts: [{ path: "lending/limit", revision: 3 }] },
    );
    expect(kept.kept).toEqual([
      { path: "/src/lending/limit.variable.yaml", why: "changed here since it was pulled" },
    ]);
    expect(read("src/lending/limit.variable.yaml")).toBe(limit("7"));
    // The draft was not taken, so a deploy of this repository must not clear it.
    expect(JSON.parse(readFileSync(pulledFile(directory), "utf8")).drafts).toEqual({});
  });

  test("with --force the console's is written where the file is, and a file it wrote is removed when the resource moves", async () => {
    const taken = await pull(
      [],
      [{ path: "src/lending/limit.variable.yaml", content: limit("6"), resource: "lending/limit" }],
      { force: true, drafts: [{ path: "lending/limit", revision: 3 }] },
    );
    expect(taken.written).toEqual([{ path: "/src/lending/limit.variable.yaml", how: "updated" }]);
    expect(read("src/lending/limit.variable.yaml")).toBe(limit("6"));
    expect(JSON.parse(readFileSync(pulledFile(directory), "utf8")).drafts).toEqual({
      "lending/limit": 3,
    });

    // Renamed in the console: the file it wrote goes, and the new one is written.
    put("src/lending/other.variable.yaml", limit("1"));
    const moved = await pull(
      [],
      [{ path: "src/lending/cap.variable.yaml", content: `key: lending/limit\n${limit("6")}` }],
    );
    expect(moved.written).toEqual([{ path: "/src/lending/cap.variable.yaml", how: "new" }]);
    expect(moved.removed).toEqual(["/src/lending/limit.variable.yaml"]);
    // What a pull never wrote is the repository's own, and is not removed.
    expect(read("src/lending/other.variable.yaml")).toBe(limit("1"));
  });
});

describe("a pull over files written by hand", () => {
  const limit = (value: string) => `schemaVersion: 1\nbody:\n  default: "${value}"\n`;

  test("a change made in the console is written into the file as its author wrote it", async () => {
    const written = `# Ours.\nbody: { default: "5" } # one hand\nschemaVersion: 1\n`;
    put("src/notes/hours.variable.yaml", written);
    put("platform/notes/days.variable.yaml", `# Days.\n${limit("1")}`);
    // Both were pulled as they are, so a later change from the console may be written.
    const first = await pull(
      [{ path: "notes/days.variable.yaml", content: limit("1") }],
      [{ path: "src/notes/hours.variable.yaml", content: limit("5") }],
    );
    expect(first).toMatchObject({ written: [], unchanged: 2 });
    const second = await pull(
      [{ path: "notes/days.variable.yaml", content: limit("2") }],
      [{ path: "src/notes/hours.variable.yaml", content: limit("6") }],
    );
    expect(second.written.map((one) => one.path).sort()).toEqual([
      "/src/notes/hours.variable.yaml",
      "notes/days.variable.yaml",
    ]);
    expect(read("src/notes/hours.variable.yaml")).toBe(written.replace('"5"', '"6"'));
    expect(read("platform/notes/days.variable.yaml")).toBe(`# Days.\n${limit("2")}`);
    // What it wrote is what it remembers: the next pull finds nothing to do.
    const third = await pull(
      [{ path: "notes/days.variable.yaml", content: limit("2") }],
      [{ path: "src/notes/hours.variable.yaml", content: limit("6") }],
    );
    expect(third).toMatchObject({ written: [], unchanged: 2 });
  });
});
