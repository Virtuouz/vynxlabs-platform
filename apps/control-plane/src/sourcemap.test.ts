import { expect, test } from "vitest";
import { bundleFrames, originalPosition } from "./kernel/execution/sourcemap.js";

// Built by esbuild from a few lines of TypeScript, with an external map and no source contents.
const BUILT = {
  code: '// src/orders.ts\nfunction check(order) {\n  if (order.id > 10) {\n    throw new Error("too big");\n  }\n  return order;\n}\nexport {\n  check\n};\n',
  map: JSON.stringify({
    version: 3,
    sources: ["src/orders.ts"],
    mappings:
      ";AACO,SAAS,MAAM,OAAc;AAClC,MAAI,MAAM,KAAK,IAAI;AACjB,UAAM,IAAI,MAAM,SAAS;AAAA,EAC3B;AACA,SAAO;AACT;",
  }),
};

test("a place in built code is traced back to its line in the TypeScript", () => {
  const lines = BUILT.code.split("\n");
  const at = lines.findIndex((line) => line.includes("throw new Error"));
  const column = (lines[at] ?? "").indexOf("throw") + 1;
  expect(originalPosition(BUILT.map, at + 1, column)).toEqual({
    source: "src/orders.ts",
    line: 4,
    column: 5,
  });
  expect(originalPosition(BUILT.map, 9999, 1)).toBeUndefined();
  expect(originalPosition("not json", 1, 1)).toBeUndefined();
});

test("only frames in the bundle's own module are read from a stack", () => {
  const stack = [
    "Error: too big",
    "    at check (file:///cache/abc123.mjs:12:11)",
    "    at node:internal/process:1:1",
    "    at run (file:///cache/abc123.mjs:40:3)",
  ].join("\n");
  expect(bundleFrames(stack, "abc123")).toEqual([
    { line: 12, column: 11 },
    { line: 40, column: 3 },
  ]);
  expect(bundleFrames(stack, "other")).toEqual([]);
});
