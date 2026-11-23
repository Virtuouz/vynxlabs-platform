import { expect, test } from "vitest";
import { COMMANDS } from "./commands.js";

test("VOC-52 `volvel tenant` help says access change where it means one, and keeps the command names", () => {
  const tenant = COMMANDS.filter((entry) => entry.usage.startsWith("tenant "));
  const text = tenant.map((entry) => entry.summary).join("\n");
  expect(text).not.toMatch(/\breleas/i);
  expect(text).toContain("access change");
  const usages = tenant.map((entry) => entry.usage).join("\n");
  expect(usages).toContain("tenant release ");
  expect(usages).toContain("tenant releases ");
});
