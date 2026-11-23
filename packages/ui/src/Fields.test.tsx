// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TextAreaField, TextField } from "./Fields.tsx";

afterEach(cleanup);

test("w-limits 1: a limit is said at the field, near it and past it, and typed text is never cut", () => {
  const seen: string[] = [];
  const { rerender } = render(
    <TextField name="n" label="Name" maxLength={10} value="short" onChange={(v) => seen.push(v)} />,
  );
  const box = screen.getByLabelText("Name") as HTMLInputElement;
  // No native limit that would cut a paste in silence.
  expect(box.hasAttribute("maxlength")).toBe(false);
  expect(document.querySelector("[data-field-count]")).toBeNull();
  rerender(<TextField name="n" label="Name" maxLength={10} value="123456789" />);
  expect(document.querySelector("[data-field-count]")?.textContent).toBe("9 of 10");
  rerender(
    <TextField
      name="n"
      label="Name"
      maxLength={10}
      value="12345678901234"
      onChange={(v) => seen.push(v)}
    />,
  );
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("12345678901234");
  expect(screen.getByRole("alert").textContent).toBe("Use at most 10 characters. This is 14.");
  fireEvent.input(box, { target: { value: "pasted past the limit" } });
  expect(seen.at(-1)).toBe("pasted past the limit");
});

test("w-limits 1: a text area says its limit the same way", () => {
  render(<TextAreaField name="d" label="About" maxLength={5} value="abcdefg" />);
  expect(screen.getByLabelText("About").hasAttribute("maxlength")).toBe(false);
  expect(screen.getByRole("alert").textContent).toBe("Use at most 5 characters. This is 7.");
});
