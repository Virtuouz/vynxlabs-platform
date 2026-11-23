import { describe, expect, test } from "vitest";
import { bundleCompatibility, compareVersions, coreInRange } from "./bundle.js";

describe("versions with a prerelease tag (HOST-13)", () => {
  test("a prerelease compares as the version it leads to, not as NaN", () => {
    expect(compareVersions("0.6.0-next.4be1c09a", "0.6.0")).toBe(0);
    expect(compareVersions("0.6.0-next.1", "0.5.9")).toBeGreaterThan(0);
    expect(coreInRange("0.6.0-next.1", { min: "0.6.0", below: "0.7.0" })).toBe(true);
    expect(coreInRange("0.5.0-next.1", { min: "0.6.0", below: "0.7.0" })).toBe(false);
    expect(bundleCompatibility("0.5.0", { min: "0.6.0", below: "0.7.0" }, "0.5.0")).toBe(
      "core_too_old",
    );
    expect(bundleCompatibility("0.6.0-next.1", { min: "0.6.0", below: "0.7.0" }, "0.5.0")).toBe(
      "ok",
    );
  });
});
