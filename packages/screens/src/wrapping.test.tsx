// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { breakable, isCode } from "@volvel/widgets-core/views";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

test("an email address may break after the @ and the dots, not in the middle of a word", () => {
  const { container } = render(<p>{breakable("george.lewis@example.net")}</p>);
  expect(container.textContent).toBe("george.lewis@example.net");
  // A <wbr> after the @ and after each dot.
  expect(container.querySelectorAll("wbr").length).toBe(3);
  expect(container.querySelector("span")?.className).toContain("overflow-wrap:anywhere");
});

test("short text and text with spaces is left as it is, and only codes are record numbers", () => {
  expect(breakable("Northside")).toBe("Northside");
  expect(breakable("Syringes 3 mL, box of 100")).toBe("Syringes 3 mL, box of 100");
  expect(isCode("INV-9338")).toBe(true);
  expect(isCode("George Lewis")).toBe(false);
});
