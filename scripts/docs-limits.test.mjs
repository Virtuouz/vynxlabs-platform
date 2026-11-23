import { expect, test } from "vitest";
import { fieldsOf, fieldTable } from "../packages/docs/generators/schema.mjs";

test("a field's minimum, maximum and default are printed in the reference", async () => {
  const { scriptKind } = await import("../packages/manifest/dist/kinds.js");
  const table = fieldTable([...fieldsOf(scriptKind.body).values()]);
  expect(table).toMatch(/`timeoutSeconds`[^\n]*Minimum 1\. Maximum 3600\./);
  expect(table).toMatch(/`memoryMb`[^\n]*Minimum 64\. Maximum 4096\./);
});
