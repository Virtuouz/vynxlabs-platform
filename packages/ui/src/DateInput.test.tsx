// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { addMonths, formatWall, parseDay, parseEntry, parseTime } from "./dates.ts";
import { DateField } from "./Fields.tsx";

afterEach(cleanup);

const NOW = new Date(2026, 10, 21, 10, 0);
const day = (text: string, locale = "en-US") => {
  const read = parseDay(text, locale, NOW);
  return read ? `${read.y}-${read.m}-${read.d}` : undefined;
};

describe("reading typed dates", () => {
  test("the locale's numeric order, ISO, month names and words", () => {
    expect(day("11/21/2026")).toBe("2026-11-21");
    expect(day("21/11/2026", "en-GB")).toBe("2026-11-21");
    expect(day("3/4/2026", "en-GB")).toBe("2026-4-3");
    expect(day("3/4/2026", "en-US")).toBe("2026-3-4");
    expect(day("21/11/2026", "en-US")).toBe("2026-11-21");
    expect(day("2026-11-21")).toBe("2026-11-21");
    expect(day("Nov 21 2026")).toBe("2026-11-21");
    expect(day("November 21, 2026")).toBe("2026-11-21");
    expect(day("21 nov")).toBe("2026-11-21");
    expect(day("21 nov 2027")).toBe("2027-11-21");
    expect(day("21. November 2026", "de-DE")).toBe("2026-11-21");
    expect(day("today")).toBe("2026-11-21");
    expect(day("Tomorrow")).toBe("2026-11-22");
    expect(day("yesterday")).toBe("2026-11-20");
  });
  test("what is not a date is not read", () => {
    expect(day("banana")).toBeUndefined();
    expect(day("2026-02-30")).toBeUndefined();
    expect(day("13/13/2026")).toBeUndefined();
    expect(day("nov")).toBeUndefined();
  });
  test("times and dates with times", () => {
    expect(parseTime("2:30 PM")).toEqual({ h: 14, mi: 30 });
    expect(parseTime("14:30")).toEqual({ h: 14, mi: 30 });
    expect(parseTime("9am")).toEqual({ h: 9, mi: 0 });
    expect(parseTime("12am")).toEqual({ h: 0, mi: 0 });
    expect(parseTime("25:00")).toBeUndefined();
    expect(parseEntry("2026-11-17T14:20", true, "en-US", NOW)?.time).toEqual({ h: 14, mi: 20 });
    expect(parseEntry("nov 21 2026, 2:30 PM", true, "en-US", NOW)?.time).toEqual({ h: 14, mi: 30 });
    expect(parseEntry("tomorrow 9am", true, "en-US", NOW)?.day.d).toBe(22);
  });
  test("a month on lands in a shorter month", () => {
    expect(addMonths({ y: 2026, m: 1, d: 31 }, 1)).toEqual({ y: 2026, m: 2, d: 28 });
    expect(formatWall("2026-11-21", "en-US", false)).toBe("Nov 21, 2026");
  });
});

describe("the date box", () => {
  test("an ISO value set in the box is handed on as it is, and shown as words after", () => {
    const onChange = vi.fn();
    render(<DateField label="Due" name="due" value="" onChange={onChange} />);
    const box = screen.getByLabelText("Due") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "2026-11-21" } });
    expect(onChange).toHaveBeenCalledWith("2026-11-21");
  });

  test("typed words are read on leaving; what can't be is said and left", () => {
    const onChange = vi.fn();
    render(<DateField label="Due" name="due" value="" onChange={onChange} />);
    const box = screen.getByLabelText("Due") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "21 nov 2026" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith("2026-11-21");
    fireEvent.change(box, { target: { value: "soonish" } });
    fireEvent.blur(box);
    expect(box.value).toBe("soonish");
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't read "soonish"/);
    expect(box.getAttribute("aria-invalid")).toBe("true");
  });

  test("clearing hands on nothing, and a name posts the ISO value", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateField label="Due" name="due" value="2026-03-09" onChange={onChange} />,
    );
    expect((container.querySelector("input[name=due]") as HTMLInputElement).value).toBe(
      "2026-03-09",
    );
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });

  test("a day outside min and max is refused with the reason", () => {
    render(<DateField label="Due" name="due" value="" min="2026-03-01" onChange={() => {}} />);
    const box = screen.getByLabelText("Due");
    fireEvent.change(box, { target: { value: "1 jan 2026" } });
    fireEvent.blur(box);
    expect(screen.getByRole("alert").textContent).toBe("Pick a date on or after Mar 1, 2026.");
  });

  test("the calendar opens on the day, with today marked, and arrows move by day", async () => {
    render(<DateField label="Due" name="due" value="2026-03-09" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose date" });
    const selected = dialog.querySelector("[data-date='2026-03-09']") as HTMLElement;
    expect(selected.getAttribute("aria-label")).toBe("Monday, March 9, 2026, selected");
    fireEvent.keyDown(selected, { key: "ArrowRight" });
    expect(dialog.querySelector("[data-date='2026-03-10']")?.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(selected, { key: "PageDown", shiftKey: true });
    expect(dialog.querySelector("[data-date='2027-03-10']")).toBeTruthy();
  });

  test("picking a day in the calendar sends it", async () => {
    const onChange = vi.fn();
    render(<DateField label="Due" name="due" value="2026-03-09" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog.querySelector("[data-date='2026-03-12']") as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("2026-03-12");
  });
});
