// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { definitionProblems, type SummaryData, WidgetRegistry } from "@volvel/widgets";
import { CORE_WIDGETS, goal } from "@volvel/widgets-core";
import { corePack } from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GoalView } from "../../widgets-core/views/goal.tsx";

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
    // Goal is a core widget (decision D37), drawn by the core pack.
    expect(CORE_WIDGETS).toContain(goal);
    expect(new WidgetRegistry(CORE_WIDGETS).get("core/goal")).toBe(goal);
    expect(corePack.views["core/goal"]).toBe(GoalView);
  });

  test("says what the contract needs of it", () => {
    expect(goal.category).toBe("understand");
    expect(goal.surfaces).toEqual(["app", "dashboard"]);
    expect(goal.data.value).toMatchObject({
      shape: "summary",
      values: { min: 1, max: 2 },
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
    expect(hints.goalFrom).toMatchObject({ control: "column", group: "Progress" });
    expect(hints.reached).toMatchObject({ control: "segmented", group: "Look" });
    expect(goal.defaults).toMatchObject({ reached: "green" });
    expect(hints.bands).toMatchObject({ control: "switch", level: "more" });
  });

  test("has a view for each definition of the pack", () => {
    for (const definition of corePack.definitions)
      expect(corePack.views[definition.type]).toBeDefined();
  });
});

describe("the Goal's view", () => {
  test("draws how far it is: 45,000 toward 60,000 is 75%", () => {
    draw({ target: 60000, format: MONEY, label: "of $60,000 this month" }, 45000);
    expect(screen.getByText("$45,000.00")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("of $60,000 this month")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
    expect(bar.getAttribute("aria-valuetext")).toBe("75% of $60,000.00");
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

  test("turns green when reached, if it is asked to", () => {
    const fill = () => screen.getByRole("progressbar").firstElementChild?.className ?? "";
    draw({ target: 100, reached: "green" }, 100);
    expect(fill()).toContain("bg-success");
    cleanup();
    draw({ target: 100, reached: "green" }, 99);
    expect(fill()).toContain("bg-action");
    cleanup();
    draw({ target: 100, reached: "none" }, 120);
    expect(fill()).toContain("bg-action");
    cleanup();
    draw({ target: 100 }, 120);
    expect(fill()).toContain("bg-action");
  });

  test("takes its goal from a column when it is told which", () => {
    render(
      <GoalView
        config={{ goalFrom: "goal", target: 999 }}
        data={{
          value: {
            shape: "summary",
            columns: [
              { name: "total", label: "Total", type: "number" },
              { name: "goal", label: "Goal", type: "number" },
            ],
            breakdowns: [],
            values: ["total", "goal"],
            rows: [{ total: 50, goal: 200 }],
          },
        }}
        size={SIZE}
        emit={vi.fn()}
        building={false}
      />,
    );
    expect(screen.getByText("25%")).toBeTruthy();
  });

  test("the percentage can be left out", () => {
    draw({ target: 100, percent: false }, 25);
    expect(screen.queryByText("25%")).toBeNull();
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
