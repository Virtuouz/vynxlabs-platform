import { expect, test } from "vitest";
import {
  collectEntries,
  formatEntry,
  formatNotices,
  missingLicenseText,
} from "./third-party-notices.mjs";

const file = (name, text) => ({ name, text });
const entry = (over = {}) => ({
  name: "left-pad",
  version: "1.3.0",
  license: "MIT",
  homepage: "https://example.com/left-pad",
  licenses: [file("LICENSE", "Copyright (c) Someone")],
  notices: [],
  ...over,
});

test("an entry names the package, its version and license, and carries the license text", () => {
  const text = formatEntry(entry());
  expect(text).toContain("## left-pad 1.3.0");
  expect(text).toContain("License: MIT");
  expect(text).toContain("Copyright (c) Someone");
  expect(text).not.toContain("Note:");
});

test("a package accepted by name carries what its license asks", () => {
  const text = formatEntry(entry({ name: "elkjs", license: "EPL-2.0 OR GPL-3.0-or-later" }));
  expect(text).toContain("It is unmodified.");
  expect(text).toContain("https://github.com/kieler/elkjs");
});

test("the entries are sorted, one per installed version, and Volvel's own packages are left out", () => {
  const list = {
    MIT: [
      { name: "b", versions: ["1.0.0", "2.0.0"], paths: ["/b1", "/b2"] },
      { name: "@volvel/sdk", versions: ["1.0.0"], paths: ["/sdk"] },
      { name: "a", versions: ["1.0.0"], paths: ["/a"] },
    ],
  };
  const entries = collectEntries(list, () => ({ licenses: [], notices: [] }));
  expect(entries.map((one) => `${one.name}@${one.version}`)).toEqual([
    "a@1.0.0",
    "b@1.0.0",
    "b@2.0.0",
  ]);
  expect(formatNotices(entries)).toBe(formatNotices(entries));
  expect(formatNotices(entries)).toContain("the 3 packages below");
});

test("a package with no license text is reported, and one with a recorded holder is not", () => {
  const missing = missingLicenseText([
    entry(),
    entry({ name: "no-text", version: "2.0.0", licenses: [] }),
    entry({ name: "pgpass", version: "1.0.5", licenses: [] }),
  ]);
  expect(missing).toEqual(["no-text@2.0.0"]);
});

test("a package that ships no license file gets the standard text under its holder", () => {
  const text = formatEntry(entry({ name: "pgpass", version: "1.0.5", licenses: [] }));
  expect(text).toContain("ships no license file");
  expect(text).toContain("Copyright (c) Hannes Hörl");
  expect(text).toContain("Permission is hereby granted");
});
