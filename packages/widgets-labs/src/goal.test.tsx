// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { definitionProblems, type SummaryData, WidgetRegistry } from "@volvel/widgets";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GoalView } from "../views/goal.tsx";
import { labsPack } from "../views/index.ts";
import { goal, LABS_WIDGETS } from "./index.ts";

afterEach(cleanup);

const summary = (value: unknown): SummaryData => ({
  shape: "summary",
  columns: [{ name: "total", label: "Total", type: "number" }],
  breakdowns: [],
  values: ["total"],
  rows: [{ total: value }],
});

const MONEY = { style: "currency", currency: "USD" } as const;
const SIZE = { w: 3, h: 3, narrow: false };

function draw(config: Parameters<typeof GoalView>[0]["config"], value: unknown, emit = vi.fn()) {
  render(
    <GoalView
      config={config}
      data={{ value: summary(value) }}
      size={SIZE}
      emit={emit}
      building={false}
    />,
  );
  return emit;
}

describe("the Goal's definition", () => {
  test("is a sound definition and the pack holds it", () => {
    expect(definitionProblems(goal)).toEqual([]);
    expect(LABS_WIDGETS).toEqual([goal]);
    expect(new WidgetRegistry(LABS_WIDGETS).get("labs/goal")).toBe(goal);
  });

  test("says what the contract needs of it", () => {
    expect(goal.category).toBe("understand");
    expect(goal.surfaces).toEqual(["app", "dashboard"]);
    expect(goal.data.value).toMatchObject({
      shape: "summary",
      values: { min: 1, max: 1 },
      breakdowns: { min: 0, max: 0 },
    });
    expect(goal.events.click?.gives).toBe("nothing");
    expect(goal.layout).toEqual({ min: { w: 2, h: 2 }, default: { w: 3, h: 3 }, phone: "stack" });
  });

  test("every setting has a hint the inspector can draw", () => {
    const hints = Object.fromEntries(
      Object.entries(goal.config.properties).map(([name, schema]) => [name, schema["x-volvel"]]),
    );
    expect(hints.target?.control).toBe("number");
    expect(hints.target?.level ?? "main").toBe("main");
    expect(hints.format?.control).toBe("format");
    expect(hints.label?.control).toBe("text");
    expect(hints.goodWhen).toMatchObject({ control: "segmented", level: "more" });
    expect(hints.bands).toMatchObject({ control: "switch", level: "more" });
  });

  test("has a view for each definition of the pack", () => {
    for (const definition of labsPack.definitions)
      expect(labsPack.views[definition.type]).toBeDefined();
  });
});

describe("the Goal's view", () => {
  test("draws how far it is: 45,000 toward 60,000 is 75%", () => {
    draw({ target: 60000, format: MONEY, label: "of $60,000 this month" }, 45000);
    expect(screen.getByText("$45,000")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("of $60,000 this month")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
    expect(bar.getAttribute("aria-valuetext")).toBe("75% of $60,000");
  });

  test("a value that comes back as text is read as a number", () => {
    draw({ target: 200 }, "50");
    expect(screen.getByText("25%")).toBeTruthy();
  });

  test("the bar stops at its end, and the share does not", () => {
    draw({ target: 100 }, 150);
    expect(screen.getByText("150%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  test("colours by how close only when asked, and by the way good news goes", () => {
    const fill = () => screen.getByRole("progressbar").firstElementChild?.className ?? "";
    draw({ target: 100 }, 10);
    expect(fill()).toContain("bg-action");
    cleanup();
    draw({ target: 100, bands: true }, 10);
    expect(fill()).toContain("bg-danger");
    cleanup();
    draw({ target: 100, bands: true, goodWhen: "down" }, 10);
    expect(fill()).toContain("bg-success");
  });

  test("a click is raised as the event it declares", () => {
    const emit = draw({ target: 100 }, 10);
    fireEvent.click(screen.getByRole("button"));
    expect(emit).toHaveBeenCalledWith("click", {});
  });

  test("draws nothing reached when no value came back", () => {
    render(<GoalView config={{ target: 100 }} data={{}} size={SIZE} emit={vi.fn()} building />);
    expect(screen.getByText("0%")).toBeTruthy();
  });
});
