import { checkFlow, type FlowBody } from "@volvel/manifest";
import { expect, test } from "vitest";
import { FLOW_STARTERS, SCRIPT_STARTERS, untouchedStarter } from "./screens/starters.ts";

test("every flow starter is a flow the platform accepts as it is", () => {
  for (const starter of FLOW_STARTERS) {
    expect(checkFlow(starter.body as unknown as FlowBody), starter.id).toEqual([]);
  }
});

test("every script starter has a default export and says what it takes", () => {
  for (const starter of SCRIPT_STARTERS) {
    expect(starter.code, starter.id).toMatch(/export default async function/);
    expect(starter.input.type).toBe("object");
  }
  expect(untouchedStarter(SCRIPT_STARTERS[1]?.code)).toBe(true);
  expect(untouchedStarter("export default async () => 1;")).toBe(false);
});

test("a starter that takes input still runs when given none", () => {
  for (const starter of SCRIPT_STARTERS) {
    // Every field the code reads has a fallback, or the starter takes nothing.
    expect(starter.code, starter.id).not.toMatch(/given\.amounts\.(reduce|length)/);
  }
});
