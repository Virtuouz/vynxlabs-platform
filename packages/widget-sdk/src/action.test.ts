import { describe, expect, it } from "vitest";
import { changesAnything, SERVER_STEPS, STEP_EFFECT, STEP_KINDS } from "./action.ts";

describe("which steps write", () => {
  it("classifies every kind of step, so a new kind cannot be added unclassified", () => {
    expect(Object.keys(STEP_EFFECT).sort()).toEqual([...STEP_KINDS].sort());
    for (const kind of STEP_KINDS) expect(["write", "moves"]).toContain(STEP_EFFECT[kind]);
  });

  it("calls a step a write exactly when the server runs it", () => {
    const writes = STEP_KINDS.filter((kind) => STEP_EFFECT[kind] === "write");
    expect([...writes].sort()).toEqual([...SERVER_STEPS].sort());
  });

  it("changes something when any step writes, and not when steps only move the reader", () => {
    expect(changesAnything({ steps: [{ do: "narrow" }, { do: "script" }] })).toBe(true);
    expect(changesAnything({ steps: [{ do: "narrow" }, { do: "open" }, { do: "message" }] })).toBe(
      false,
    );
    expect(changesAnything({ steps: [] })).toBe(false);
  });
});
