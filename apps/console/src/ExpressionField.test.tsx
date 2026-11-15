// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  ExpressionField,
  ExpressionPreview,
  PREVIEW_DELAY_MS,
  shortJson,
} from "./screens/ExpressionField.tsx";

const root = "/tenants/t1/workspaces/w1";
let asked: URLSearchParams[];
let answer: (query: URLSearchParams) => unknown;

beforeEach(() => {
  vi.useFakeTimers();
  asked = [];
  answer = (query) => ({
    value: query.get("expression") === "true" ? true : 42,
    flowRun: { id: "r1" },
  });
  vi.stubGlobal("fetch", async (address: string) => {
    const query = new URL(address, "http://x").searchParams;
    asked.push(query);
    return new Response(JSON.stringify(answer(query)), { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Field({
  start = "",
  noRun,
  condition,
  items,
}: {
  start?: string;
  noRun?: boolean;
  condition?: boolean;
  items?: string;
}) {
  const [value, setValue] = useState(start);
  return (
    <ExpressionPreview.Provider
      value={{ root, flowRun: noRun ? undefined : "r1", flow: "orders/intake", version: "1" }}
    >
      <ExpressionField
        name="x"
        label="Expression"
        value={value}
        onChange={setValue}
        condition={condition}
        items={items}
      />
    </ExpressionPreview.Provider>
  );
}

const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS + 10);
  });
};

test("asks once typing stops, against the test run, and shows what it gives", async () => {
  render(<Field />);
  const input = screen.getByLabelText("Expression");
  for (const text of ["s", "st", "steps.totals.output.count"]) {
    fireEvent.change(input, { target: { value: text } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  }
  expect(asked).toHaveLength(0);
  await settle();
  expect(asked).toHaveLength(1);
  expect(Object.fromEntries(asked[0] as URLSearchParams)).toEqual({
    expression: "steps.totals.output.count",
    flowRun: "r1",
  });
  expect(screen.getByRole("status").textContent).toBe("Gives 42");
});

test("an error is said in the engine's words, and with no run, what to do", async () => {
  answer = () => ({ error: "No such key: phnoe", flowRun: { id: "r1" } });
  render(<Field start="steps.lookup.output.phnoe" />);
  await settle();
  expect(screen.getByRole("status").textContent).toBe("No such key: phnoe");
  cleanup();
  answer = () => ({ note: "Run a test to see its value.", flowRun: null });
  render(<Field start="trigger.x" noRun />);
  await settle();
  expect(asked.at(-1)?.get("flow")).toBe("orders/intake");
  expect(screen.getByRole("status").textContent).toBe("Run a test to see its value.");
});

test("a case that gives something other than true or false says so, and a foreach sends its items", async () => {
  render(<Field start="steps.totals.output.count" condition />);
  await settle();
  expect(screen.getByRole("status").textContent).toMatch(
    /Gives 42 — a case must give true or false/,
  );
  cleanup();
  render(<Field start="true" condition />);
  await settle();
  expect(screen.getByRole("status").textContent).toBe("Gives true");
  cleanup();
  render(<Field start="item.sku" items="trigger.items" />);
  await settle();
  expect(asked.at(-1)?.get("items")).toBe("trigger.items");
  // An empty field asks nothing.
  cleanup();
  const before = asked.length;
  render(<Field start="  " />);
  await settle();
  expect(asked).toHaveLength(before);
});

test("a long value is shortened to one line", () => {
  expect(shortJson({ a: 1 })).toBe('{"a":1}');
  expect(shortJson("x".repeat(500))).toHaveLength(160);
  expect(shortJson(undefined)).toBe("null");
});
