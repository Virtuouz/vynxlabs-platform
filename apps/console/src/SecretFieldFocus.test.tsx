// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { SecretField } from "./kit/SecretField.tsx";

afterEach(cleanup);

function Form() {
  const [value, setValue] = useState("");
  const [removed, setRemoved] = useState(false);
  return (
    <SecretField
      label="Password"
      name="password"
      stored
      setAt="2026-11-01T00:00:00Z"
      value={value}
      onChange={setValue}
      removed={removed}
      onRemove={setRemoved}
    />
  );
}

test("NARROW-3: Replace puts the focus in the new field, and Keep brings it back to Replace", () => {
  render(<Form />);
  const replace = screen.getByRole("button", { name: "Replace the password" });
  replace.focus();
  fireEvent.click(replace);
  expect(document.activeElement).toBe(screen.getByLabelText(/New password/));
  fireEvent.click(screen.getByRole("button", { name: "Keep the stored one" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Replace the password" }));
});

test("NARROW-3: Remove and Keep hand the focus to each other", () => {
  render(<Form />);
  fireEvent.click(screen.getByRole("button", { name: "Remove the password" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep the stored one" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep the stored one" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove the password" }));
});
