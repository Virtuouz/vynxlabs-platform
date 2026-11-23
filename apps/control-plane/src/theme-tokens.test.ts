import { THEME_TOKENS as ACCEPTED } from "@volvel/manifest";
import { THEME_TOKENS as DEFINABLE } from "@volvel/sdk";
import { expect, test } from "vitest";

test("EXT-15: the SDK offers every theme token the manifest accepts, and no other", () => {
  expect([...DEFINABLE]).toEqual([...ACCEPTED]);
});
