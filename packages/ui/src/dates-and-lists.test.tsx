// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ComboboxField, MultiSelectField } from "./Combobox.tsx";
import { DateInput } from "./DateInput.tsx";
import { datePattern } from "./dates.ts";
import { SchemaForm } from "./SchemaForm.tsx";

afterEach(cleanup);

test("an empty date box says the shape the locale writes, never an example date", () => {
  expect(datePattern("en-US", false)).toBe("mm/dd/yyyy");
  expect(datePattern("en-US", true)).toBe("mm/dd/yyyy hh:mm");
  expect(datePattern("de-DE", false)).toBe("dd.mm.yyyy");
  render(<DateInput value="" onChange={() => undefined} aria-label="Day" />);
  const hint = (screen.getByLabelText("Day") as HTMLInputElement).placeholder;
  expect(hint).toMatch(/yyyy/);
  expect(hint).not.toMatch(/20\d\d/);
});

test("a form shown to the people who use an app has no JSON toggle", () => {
  const schema = { type: "object", properties: { reason: { type: "string" } } };
  const { unmount } = render(
    <SchemaForm schema={schema} json={false} onSubmit={() => undefined} />,
  );
  expect(screen.queryByText("JSON")).toBeNull();
  unmount();
  render(<SchemaForm schema={schema} onSubmit={() => undefined} />);
  expect(screen.getByText("JSON")).toBeTruthy();
});

test("the groups list opens on focus, and Esc closes it and keeps the pick", () => {
  const options = [
    { value: "a", label: "Practice managers" },
    { value: "b", label: "Billing" },
  ];
  let held: string[] = ["a"];
  let outer = 0;
  render(
    // biome-ignore lint/a11y/noStaticElementInteractions: counts the Esc that reaches the dialog around it
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape") outer += 1;
      }}
    >
      <MultiSelectField
        label="Groups"
        inline
        options={options}
        value={held}
        onChange={(next) => {
          held = next;
        }}
      />
    </div>,
  );
  const box = screen.getByRole("combobox");
  expect(screen.queryByRole("option", { name: "Billing" })).toBeNull();
  fireEvent.focus(box);
  expect(screen.getByRole("option", { name: "Billing" })).toBeTruthy();
  fireEvent.keyDown(box, { key: "Escape" });
  expect(screen.queryByRole("option", { name: "Billing" })).toBeNull();
  expect(outer).toBe(0);
  expect(held).toEqual(["a"]);
});

test("the kit's locale is the reader's locale of the widgets, one rule", async () => {
  const { readerLocale } = await import("@volvel/widgets");
  const { localeOf } = await import("./dates.ts");
  expect(localeOf).toBe(readerLocale);
});

test("NARROW-4: an option's hint wraps, and is not cut at the list's edge", () => {
  const hint = "A run was queued. Payload: runId, flowPath, and the workspace it ran in.";
  render(
    <ComboboxField
      label="Events"
      options={[{ value: "a", label: "run.queued", hint }]}
      value=""
      onChange={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  const shown = screen.getByText(hint);
  expect(shown.className).toContain("break-words");
  expect(shown.className).not.toContain("truncate");
});
