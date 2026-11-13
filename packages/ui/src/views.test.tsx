// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Facts, JsonView, type LogLine, LogViewer } from "./index.ts";

afterEach(cleanup);

const lines: LogLine[] = [
  { seq: 1, time: "2026-10-01T10:41:58.104Z", level: "info", message: "Received job" },
  { seq: 2, time: "2026-10-01T10:42:23.000Z", level: "warn", message: "memory at 82%" },
  {
    seq: 3,
    time: "2026-10-01T10:42:28.000Z",
    level: "error",
    message: "No active warehouse",
    fields: { account: "acme-eu" },
  },
];

test("the log is searched, narrowed to a level, and says how much of it is shown", () => {
  render(<LogViewer lines={lines} />);
  expect(screen.getByRole("list", { name: "Log" }).children).toHaveLength(3);
  expect(screen.getByText("3 lines")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Lowest level to show"), { target: { value: "warn" } });
  expect(screen.getByRole("list", { name: "Log" }).children).toHaveLength(2);
  expect(screen.getByText("2 of 3 lines")).toBeTruthy();

  // A search looks in the fields of a line too.
  fireEvent.change(screen.getByLabelText("Search the log"), { target: { value: "ACME-EU" } });
  expect(screen.getByRole("list", { name: "Log" }).textContent).toContain("No active warehouse");
  expect(screen.getByRole("list", { name: "Log" }).children).toHaveLength(1);

  fireEvent.change(screen.getByLabelText("Search the log"), { target: { value: "nothing" } });
  expect(screen.getByText("No line matches.")).toBeTruthy();
});

test("an empty log says so, offers no download, and only a live one can be followed", () => {
  const { rerender } = render(<LogViewer lines={[]} empty="The script logged nothing." />);
  expect(screen.getByText("The script logged nothing.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  rerender(<LogViewer lines={lines} live />);
  expect(screen.getByRole("button", { name: "Follow" }).getAttribute("aria-pressed")).toBe("true");
});

test("a value is shown as indented JSON, and nothing as a dash", () => {
  const { rerender } = render(
    <JsonView label="Input" value={{ table: "revenue", rows: 3, ok: true }} />,
  );
  const block = screen.getByRole("region", { name: "Input" });
  expect(block.textContent).toBe('{\n  "table": "revenue",\n  "rows": 3,\n  "ok": true\n}');
  // A string that looks like a key is still a value: only what a colon follows is a key.
  rerender(<JsonView label="Input" value={["a:", 1]} />);
  expect(screen.getByRole("region", { name: "Input" }).textContent).toBe('[\n  "a:",\n  1\n]');
  rerender(<JsonView label="Result" value={undefined} />);
  expect(screen.getByRole("region", { name: "Result" }).textContent).toBe("—");
});

test("facts leave out what has no value", () => {
  render(
    <Facts
      facts={[
        { label: "By", value: "Schedule" },
        { label: "Worker", value: "" },
        { label: "Run ID", value: "0195c2a4", code: true },
      ]}
    />,
  );
  expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(["By", "Run ID"]);
});
