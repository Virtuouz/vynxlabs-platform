import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { docOf, exportsOf, statementsOf } from "../generators/dts.mjs";
import { entryPoints, exportsOfEntry, sdkFiles } from "../generators/sdk.mjs";

test("the reader of declaration files places a comment, a member, an overload and a re-export (D58)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dts-"));
  mkdirSync(join(dir, "sub"));
  writeFileSync(
    join(dir, "sub/inner.d.ts"),
    `/** The inner thing. */\nexport declare const INNER: number;\nexport interface Hidden { a: string }\n`,
  );
  writeFileSync(
    join(dir, "index.d.ts"),
    `import { z } from "zod";
/** A box, with a { brace } in its words. */
export interface Box<T> extends Base {
    /** What is in it. */
    readonly content: T;
    open?(how: "a;b" | "c"): void;
    plain: { x: number; y: number };
}
/** Makes one. */
export declare function make(a: string): Box<string>;
export declare function make(a: number): Box<number>;
export type Alias = {
    a: 1;
};
export declare const UNSAID = 1;
export { INNER, type Hidden as Shown } from "./sub/inner.js";
export { z };
export * from "@volvel/other";
`,
  );
  const { names, stars } = exportsOf(join(dir, "index.d.ts"));
  const box = names.get("Box");
  expect(box.doc.text).toBe("A box, with a { brace } in its words.");
  expect(box.members.map((one) => [one.name, one.optional, one.doc.text])).toEqual([
    ["content", false, "What is in it."],
    ["open", true, ""],
    ["plain", false, ""],
  ]);
  // Two overloads are one export, with both signatures.
  expect(names.get("make").signature.match(/function make/g)).toHaveLength(2);
  expect(names.get("make").doc.text).toBe("Makes one.");
  expect(names.get("Alias").kind).toBe("type");
  expect(names.get("UNSAID").doc.text).toBe("");
  // A re-export from a file of the package brings the declaration, renamed when it is.
  expect(names.get("INNER").doc.text).toBe("The inner thing.");
  expect(names.get("Shown").kind).toBe("interface");
  // One from another package is said to be from there.
  expect(names.get("z")).toMatchObject({ kind: "reexport", from: "zod" });
  expect(stars).toEqual([{ from: "@volvel/other", package: "@volvel/other" }]);
  expect(statementsOf("export declare const A = 1;\nexport declare const B = 2;")).toHaveLength(2);
  expect(docOf("/**\n * One.\n * @deprecated Use two.\n */")).toEqual({
    text: "One.",
    tags: { deprecated: ["Use two."] },
  });
});

test("every export of @volvel/sdk, @volvel/widgets and @volvel/widget-frame says what it is in a comment (D58, API-22)", () => {
  const entries = entryPoints();
  expect(entries.map((one) => one.specifier)).toEqual([
    "@volvel/sdk",
    "@volvel/sdk/testing",
    "@volvel/widgets",
    "@volvel/widgets/action",
    "@volvel/widgets/frame",
    "@volvel/widgets/page",
    "@volvel/widget-frame",
    "@volvel/widget-frame/react",
  ]);
  const gaps: string[] = [];
  for (const entry of entries) {
    const { names } = exportsOfEntry(entry);
    expect(names.size, entry.specifier).toBeGreaterThan(entry.specifier.endsWith("/react") ? 0 : 5);
    for (const one of names.values()) {
      if (one.kind === "unknown") gaps.push(`${entry.specifier}: ${one.name} could not be read`);
      else if (one.kind !== "reexport" && one.doc.text === "") {
        gaps.push(`${entry.specifier}: ${one.name}`);
      }
    }
  }
  expect(gaps).toEqual([]);
});

test("each entry point has a page that lists every export of it (D58, API-22)", () => {
  const files = sdkFiles();
  expect(files.has("sdk/index.md")).toBe(true);
  for (const entry of entryPoints()) {
    const name = `sdk/${entry.specifier.replace(/^@volvel\//, "").replace(/\//g, "-")}.md`;
    const text = files.get(name) ?? "";
    expect(text, name).not.toBe("");
    for (const one of exportsOfEntry(entry).names.values()) {
      if (one.kind !== "reexport")
        expect(text, `${name}: ${one.name}`).toContain(`### ${one.name}\n`);
    }
  }
  const sdk = files.get("sdk/sdk.md") ?? "";
  expect(sdk).toContain("### defineScript");
  expect(sdk).toContain("Everything `@volvel/widgets` exports is exported from here too.");
});
