// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { duration, Facts, JsonView, type LogLine, LogViewer, Timeline } from "./index.ts";

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
  const rows = () => screen.getByRole("region", { name: "Log" }).querySelectorAll("li");
  expect(rows()).toHaveLength(3);
  expect(screen.getByText("3 lines")).toBeTruthy();

  // Levels are chips with their counts; turning Info off leaves warnings and errors.
  fireEvent.click(screen.getByRole("button", { name: "Info 1" }));
  expect(rows()).toHaveLength(2);
  expect(screen.getByText("2 of 3 lines")).toBeTruthy();

  // A search finds and marks its matches, in the fields of a line too, and steps through them.
  fireEvent.change(screen.getByLabelText("Search the log"), { target: { value: "ACME-EU" } });
  expect(screen.getByText("1 of 1 match")).toBeTruthy();
  expect(screen.getByRole("region", { name: "Log" }).querySelector("mark")?.textContent).toBe(
    "acme-eu",
  );
  expect(rows()).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Only matching" }));
  expect(rows()).toHaveLength(1);
  expect(rows()[0]?.textContent).toContain("No active warehouse");

  fireEvent.change(screen.getByLabelText("Search the log"), { target: { value: "nothing" } });
  expect(screen.getByText("No line matches.")).toBeTruthy();
});

test("matches are stepped through with Enter and Shift+Enter", () => {
  render(
    <LogViewer
      lines={[
        { seq: 1, time: "2026-10-01T10:00:00Z", level: "info", message: "order 1 sent" },
        { seq: 2, time: "2026-10-01T10:00:01Z", level: "info", message: "nothing here" },
        { seq: 3, time: "2026-10-01T10:00:02Z", level: "info", message: "order 2 sent" },
      ]}
    />,
  );
  const box = screen.getByLabelText("Search the log");
  fireEvent.change(box, { target: { value: "order" } });
  expect(screen.getByText("1 of 2 matches")).toBeTruthy();
  fireEvent.keyDown(box, { key: "Enter" });
  expect(screen.getByText("2 of 2 matches")).toBeTruthy();
  fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
  expect(screen.getByText("1 of 2 matches")).toBeTruthy();
});

test("each attempt begins with a mark, and fields open in place", () => {
  render(
    <LogViewer
      lines={[
        { seq: 1, time: "2026-10-01T10:00:00Z", level: "info", message: "try", attempt: 1 },
        {
          seq: 2,
          time: "2026-10-01T10:00:05Z",
          level: "info",
          message: "try again",
          attempt: 2,
          fields: { order: 7 },
        },
      ]}
    />,
  );
  expect(screen.getByText("Attempt 2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open the fields" }));
  expect(screen.getByRole("region", { name: "Log" }).textContent).toContain('"order": 7');
});

test("a #L link opens on its line, numbered from the start of the whole log", () => {
  history.replaceState(null, "", "/runs/r1#L12");
  render(
    <LogViewer
      firstLine={10}
      lines={[0, 1, 2, 3].map((n) => ({
        seq: n,
        time: "2026-10-01T10:00:00Z",
        level: "info",
        message: `line ${10 + n}`,
      }))}
    />,
  );
  const marked = screen.getByRole("button", { name: "Link to line 12" }).closest("li");
  expect(marked?.firstElementChild?.className).toContain("bg-action-soft");
  history.replaceState(null, "", "/");
});

test("a long log draws only the lines near the view", () => {
  const many = Array.from({ length: 50_000 }, (_, n) => ({
    seq: n,
    time: "2026-10-01T10:00:00Z",
    level: "info",
    message: `line ${n + 1}`,
  }));
  render(<LogViewer lines={many} />);
  expect(screen.getByText("50000 lines")).toBeTruthy();
  const drawn = screen.getByRole("region", { name: "Log" }).querySelectorAll("li").length;
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(200);
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

test("a timeline puts rows on one axis, cuts them into parts, and says how long each took", () => {
  const chosen: string[] = [];
  render(
    <Timeline
      now={61_000}
      onSelect={(id) => chosen.push(id)}
      selected="load"
      rows={[
        {
          id: "extract",
          label: "extract",
          start: 1000,
          end: 22_000,
          segments: [
            { kind: "wait", until: 4200 },
            { kind: "run", until: 22_000 },
          ],
        },
        {
          id: "approve",
          label: "approve",
          start: 22_000,
          end: 41_000,
          segments: [{ kind: "hold", until: 41_000 }],
        },
        { id: "load", label: "load", start: 41_000, tone: "danger" },
      ]}
    />,
  );
  const rows = screen.getAllByRole("button");
  expect(rows.map((row) => row.textContent)).toEqual([
    "extract21.0 s",
    "approve19.0 s",
    "load20.0 s…",
  ]);
  expect(rows[2]?.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(rows[0] as HTMLElement);
  expect(chosen).toEqual(["extract"]);
  // Only the kinds of part that appear are explained, and the whole span is given.
  expect(screen.getByText("Waiting")).toBeTruthy();
  expect(screen.getByText("On hold")).toBeTruthy();
  expect(screen.getAllByText("1 m 0 s").length).toBeGreaterThan(0);
});

test("lengths of time read as a person would say them", () => {
  expect(duration(400)).toBe("400 ms");
  expect(duration(13_800)).toBe("13.8 s");
  expect(duration(125_000)).toBe("2 m 5 s");
  expect(duration(3_900_000)).toBe("1 h 5 m");
});
