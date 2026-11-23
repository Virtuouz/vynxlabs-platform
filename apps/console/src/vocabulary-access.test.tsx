import { expect, test } from "vitest";
import { TENANT_SECTIONS, WORKSPACE_SECTIONS } from "./nav.ts";
import { ACCESS_TABS } from "./screens/Members.tsx";

test("VOC-52: the tab is Access changes at the same address", () => {
  const tab = ACCESS_TABS.find((one) => one.slug === "releases");
  expect(tab?.label).toBe("Access changes");
});

test("VOC-56: the navigation item for apps is Apps", () => {
  const labels = [...TENANT_SECTIONS, ...Object.values(WORKSPACE_SECTIONS).flat()].map(
    (s) => s.label,
  );
  expect(labels).not.toContain("Published apps");
});
