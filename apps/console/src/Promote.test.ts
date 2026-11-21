import { expect, test } from "vitest";
import { promoteConfirm, promoteLabel } from "./screens/Release.tsx";

test("a promotion's confirm names the workspace it reaches, not always production", () => {
  const staging = promoteConfirm({ name: "Staging", type: "dev" }, 7, []);
  expect(staging.title).toBe("Promote to Staging?");
  expect(staging.action).toBe("Promote to Staging");
  expect(staging.text).toContain("Staging starts running version 7");
  const production = promoteConfirm({ name: "Clinics", type: "production" }, 7, [
    "A call to refunds changes.",
  ]);
  expect(production.action).toBe("Promote to production");
  expect(production.text).toContain(
    "It also changes what an agent calls: A call to refunds changes.",
  );
  expect(promoteLabel({ name: "Clinics", type: "production" })).toBe("Promote to production");
});
