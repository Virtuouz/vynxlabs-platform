// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Calendar } from "./icons.ts";
import {
  Avatar,
  Button,
  Card,
  DateField,
  DateStepper,
  initialsOf,
  isoDay,
  PageShell,
  SegmentedControl,
  Skeleton,
  utcInputValue,
  utcInstant,
} from "./index.ts";

afterEach(cleanup);

/** The pieces a custom app needs that the console's own screens did not. */
describe("the kit for apps", () => {
  test("icons come with the kit, as components that draw in the text color", () => {
    const { container } = render(<Calendar aria-hidden="true" size={16} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
  });

  test("a button with an address is a link that looks like a button", () => {
    render(
      <Button href="/book" variant="primary">
        Book a visit
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Book a visit" });
    expect(link.getAttribute("href")).toBe("/book");
    expect(link.className).toContain("bg-action");
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("a segmented control is a radio group the arrow keys move through", () => {
    function Clinics() {
      const [clinic, setClinic] = useState("north");
      return (
        <SegmentedControl
          label="Clinic"
          value={clinic}
          onChange={setClinic}
          options={[
            { value: "north", label: "Northside", count: 3 },
            { value: "river", label: "Riverside" },
            { value: "hill", label: "Hilltop", disabled: true },
          ]}
        />
      );
    }
    render(<Clinics />);
    expect(screen.getByRole("group", { name: "Clinic" })).toBeTruthy();
    const north = screen.getByRole("radio", { name: /Northside/ }) as HTMLInputElement;
    const river = screen.getByRole("radio", { name: "Riverside" }) as HTMLInputElement;
    const hill = screen.getByRole("radio", { name: "Hilltop" }) as HTMLInputElement;
    expect(north.checked).toBe(true);
    expect(north.closest("label")?.textContent).toContain("3");
    // One name ties them together, so the browser moves the choice with the arrow keys.
    expect(river.name).toBe(north.name);
    expect(hill.disabled).toBe(true);
    fireEvent.click(river);
    expect(river.checked).toBe(true);
    expect(north.checked).toBe(false);
  });

  test("a card has a heading, an action and a footer, and can be one button", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <Card
        title="Biscuit"
        description="Dog · 4 years"
        action={<span>Booked</span>}
        footer="Next visit Tuesday"
      >
        Allergic to penicillin
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Biscuit" })).toBeTruthy();
    expect(screen.getByText("Next visit Tuesday")).toBeTruthy();
    rerender(
      <Card title="Biscuit" onSelect={onSelect} selected>
        Dog
      </Card>,
    );
    const button = screen.getByRole("button", { name: /Biscuit/ });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  test("an avatar is a picture or the name's initials, named for screen readers", () => {
    expect(initialsOf("Theo Evans")).toBe("TE");
    expect(initialsOf("  maya  ")).toBe("M");
    expect(initialsOf("Mary Jane Watson")).toBe("MW");
    const { rerender } = render(<Avatar name="Theo Evans" />);
    expect(screen.getByRole("img", { name: "Theo Evans" }).textContent).toBe("TE");
    rerender(<Avatar name="Theo Evans" src="/theo.png" />);
    expect(screen.getByRole("img", { name: "Theo Evans" }).getAttribute("src")).toBe("/theo.png");
    rerender(<Avatar name="Theo Evans" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  test("a skeleton says it is loading once, however many shapes it draws", () => {
    render(<Skeleton lines={3} label="Loading your pets" />);
    const status = screen.getByRole("status", { name: "Loading your pets" });
    expect(status.children).toHaveLength(3);
  });

  test("a date stepper moves a day at a time, and back to today", () => {
    const today = isoDay(new Date());
    function Day() {
      const [day, setDay] = useState(today);
      return <DateStepper value={day} onChange={setDay} max={today} />;
    }
    render(<Day />);
    expect(screen.getByText(/^Today, /)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "The day after" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "The day before" }));
    expect(screen.queryByText(/^Today, /)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText(/^Today, /)).toBeTruthy();
  });

  test("a date field in UTC shows UTC times and gives back instants", () => {
    expect(utcInputValue("2026-11-17T10:00:00.000Z")).toBe("2026-11-17T10:00");
    expect(utcInstant("2026-11-17T10:00")).toBe("2026-11-17T10:00:00.000Z");
    expect(utcInstant("")).toBe("");
    const onChange = vi.fn();
    render(
      <DateField
        label="Starts"
        name="starts"
        withTime
        timeZone="UTC"
        value="2026-11-17T10:00:00.000Z"
        hint="Clinic time."
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Starts") as HTMLInputElement;
    expect(input.value).toBe("2026-11-17T10:00");
    expect(screen.getByText("Clinic time. Times are in UTC.")).toBeTruthy();
    fireEvent.change(input, { target: { value: "2026-11-17T14:20" } });
    expect(onChange).toHaveBeenCalledWith("2026-11-17T14:20:00.000Z");
  });

  test("a page shell switches screens in the page, and can use the whole width", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <PageShell
        title="Front desk"
        subtitle="Northside"
        logo={null}
        width="full"
        nav={[
          { label: "Today", current: true, onSelect: () => {} },
          { label: "Callbacks", count: 2, onSelect },
          { label: "Help", href: "/help" },
        ]}
      >
        Board
      </PageShell>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Northside")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: /Callbacks/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Help" }).getAttribute("href")).toBe("/help");
    expect(screen.getByRole("main").className).toContain("max-w-none");
  });
});
