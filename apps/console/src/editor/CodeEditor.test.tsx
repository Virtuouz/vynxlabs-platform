// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TabHint } from "./CodeEditor.tsx";

afterEach(cleanup);

test("p31 fc: the editor says how to leave it with the keyboard, while it has focus", () => {
  const { container } = render(<TabHint />);
  const hint = container.querySelector("[data-tab-hint]");
  expect(hint?.textContent).toContain("Ctrl+M");
  expect(hint?.className).toContain("focus-within");
});
