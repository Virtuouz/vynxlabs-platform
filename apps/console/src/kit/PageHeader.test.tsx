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

test("round 5: a bar heading keeps its name whole and wraps what does not fit beside it, at any width", () => {
  const { container } = render(
    <PageHeader
      compact
      bar
      title="Clinic visits"
      state={<span>1 to fix</span>}
      actions={<button type="button">Publish</button>}
    />,
  );
  const block = container.querySelector("[data-heading-block]") as HTMLElement;
  // The block asks for a minimum and wraps its parts; the row wraps the actions under it.
  expect(block.className).toContain("min-w-[min(100%,12rem)]");
  expect(block.className).toContain("flex-wrap");
  expect(block.parentElement?.className).toContain("flex-wrap");
  // The name never shrinks below what it says: it is cut only at the block's own edge.
  const name = container.querySelector("h1") as HTMLElement;
  expect(name.className).toContain("shrink-0");
  expect(name.className).toContain("max-w-full");
});
