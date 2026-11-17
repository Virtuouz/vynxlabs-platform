// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Truncate } from "./kit/Truncate.tsx";

afterEach(cleanup);

test("a path is cut before its last part, and is read whole", () => {
  render(
    <p>
      <Truncate mode="middle">billing/record-payment</Truncate>
    </p>,
  );
  expect(screen.getByText("billing/record-payment").className).toBe("sr-only");
  expect(screen.getByText("/record-payment").getAttribute("aria-hidden")).toBe("true");
  expect(screen.getByText("billing").className).toContain("truncate");
});

test("the whole value is a hover title only while it is cut", () => {
  render(<Truncate>The SMS gateway refused the message</Truncate>);
  const text = screen.getByText(/SMS gateway/);
  Object.defineProperty(text, "scrollWidth", { value: 400, configurable: true });
  Object.defineProperty(text, "clientWidth", { value: 120, configurable: true });
  fireEvent.pointerEnter(text);
  expect(text.title).toBe("The SMS gateway refused the message");
  Object.defineProperty(text, "scrollWidth", { value: 100, configurable: true });
  fireEvent.pointerEnter(text);
  expect(text.hasAttribute("title")).toBe(false);
});
