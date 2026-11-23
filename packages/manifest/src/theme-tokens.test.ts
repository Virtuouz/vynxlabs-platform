import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { THEME_TOKENS } from "./kinds.js";

test("the SDK's ThemeToken names the tokens the schema accepts, no more and no fewer (APP-06)", () => {
  const source = readFileSync(new URL("../../sdk/src/index.ts", import.meta.url), "utf8");
  const union = /export type ThemeToken =([^;]*);/.exec(source)?.[1] ?? "";
  const named = [...union.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
  expect([...named].sort()).toEqual([...THEME_TOKENS].sort());
});
