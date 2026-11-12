import { describe, expect, test } from "vitest";
import { bundleCompatibility } from "./bundle.js";

describe("whether a core runs a bundle", () => {
  const oldest = "0.2.0";
  test("inside the range the bundle states", () => {
    expect(bundleCompatibility("0.3.0", { min: "0.3.0", below: "0.4.0" }, oldest)).toBe("ok");
    expect(bundleCompatibility("0.3.9", { min: "0.3.0", below: "0.4.0" }, oldest)).toBe("ok");
  });
  test("a core older than the bundle needs", () => {
    expect(bundleCompatibility("0.2.5", { min: "0.3.0", below: "0.4.0" }, oldest)).toBe(
      "core_too_old",
    );
  });
  test("a core newer than the bundle knew of runs it, as far back as the core supports", () => {
    expect(bundleCompatibility("0.3.0", { min: "0.2.0", below: "0.3.0" }, oldest)).toBe("ok");
    expect(bundleCompatibility("1.4.0", { min: "0.2.0", below: "0.3.0" }, oldest)).toBe("ok");
    expect(bundleCompatibility("0.3.0", { min: "0.1.0", below: "0.2.0" }, oldest)).toBe(
      "bundle_too_old",
    );
  });
});
