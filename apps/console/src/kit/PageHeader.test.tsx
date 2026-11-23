// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { PageHeader } from "./PageHeader.tsx";

afterEach(cleanup);

test("WLK-17e: an editor's compact heading keeps room for the name, so its actions wrap under it on a phone", () => {
  const { container } = render(
    <PageHeader
      compact
      mono
      title="cleanup-nightly"
      state={<span>Draft</span>}
      actions={<button type="button">Done</button>}
    />,
  );
  expect(container.querySelector("[data-heading-block]")?.className).toContain(
    "min-w-[min(100%,16rem)]",
  );
});

test("a bar heading stays one row", () => {
  const { container } = render(
    <PageHeader compact bar title="x" actions={<button type="button">Done</button>} />,
  );
  expect(container.querySelector("[data-heading-block]")?.className).not.toContain("min-w-[min");
});
