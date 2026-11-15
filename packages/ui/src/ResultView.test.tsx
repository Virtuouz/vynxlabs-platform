// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { columnsOf, MAX_TABLE_ROWS, Markdown, ResultView, resultShapes } from "./index.ts";

afterEach(cleanup);

test("a result is shown by its shape, with JSON always last", () => {
  expect(resultShapes([{ a: 1 }, { b: 2 }])).toEqual(["table", "json"]);
  expect(resultShapes([])).toEqual(["json"]);
  expect(resultShapes([1, 2])).toEqual(["json"]);
  expect(resultShapes([{ a: 1 }, [1]])).toEqual(["json"]);
  expect(resultShapes({ markdown: "# Hi" })).toEqual(["markdown", "json"]);
  expect(resultShapes("https://example.com/a.png")).toEqual(["media", "json"]);
  expect(resultShapes("https://example.com/report")).toEqual(["media", "json"]);
  expect(resultShapes({ url: "https://example.com/r.pdf", name: "Report" })).toEqual([
    "media",
    "json",
  ]);
  // Not an address a page may open, and not a lone link.
  expect(resultShapes("javascript:alert(1)")).toEqual(["json"]);
  expect(resultShapes({ url: "https://example.com", count: 3 })).toEqual(["json"]);
  expect(resultShapes("hello")).toEqual(["json"]);
  expect(resultShapes(null)).toEqual(["json"]);
});

test("a table's columns follow the schema, then the rows", () => {
  const schema = { type: "array", items: { type: "object", properties: { id: {}, name: {} } } };
  expect(columnsOf([{ name: "a", extra: 1, id: 2 }], schema)).toEqual(["id", "name", "extra"]);
  expect(columnsOf([{ b: 1 }, { a: 2, b: 3 }])).toEqual(["b", "a"]);
  // Addresses and nested values go after plain ones.
  expect(
    columnsOf([{ link: "https://example.com/1", notes: { a: 1 }, id: "INV-1", total: 2 }]),
  ).toEqual(["id", "total", "link", "notes"]);
});

test("rows are drawn as a table, at most so many, with the JSON one click away", () => {
  const rows = Array.from({ length: MAX_TABLE_ROWS + 3 }, (_, at) => ({
    id: at,
    site: at === 0 ? "https://example.com/x" : null,
    meta: { nested: true },
  }));
  render(<ResultView label="Output" value={rows} />);
  const table = screen.getByRole("region", { name: "Output" });
  expect(table.querySelectorAll("tbody tr")).toHaveLength(MAX_TABLE_ROWS);
  expect(screen.getByText(`${rows.length} rows; 3 more rows in the JSON`)).toBeTruthy();
  expect(screen.getByRole("link", { name: "https://example.com/x" }).getAttribute("rel")).toContain(
    "noopener",
  );
  expect(screen.getAllByText('{"nested":true}').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByLabelText("JSON"));
  expect(screen.getByRole("region", { name: "Output" }).textContent).toContain('"nested": true');
});

test("markdown is drawn without ever reading HTML, and links only go where a page may", () => {
  render(
    <Markdown
      text={[
        "# Report",
        "",
        "Done **well** and _fast_, see [the docs](https://example.com/docs) or [this](javascript:alert(1)).",
        "",
        "- one",
        "- `two`",
        "",
        "<img src=x onerror=alert(1)>",
        "",
        "```",
        "<b>code</b>",
        "```",
      ].join("\n")}
    />,
  );
  expect(screen.getByRole("heading", { name: "Report" })).toBeTruthy();
  expect(screen.getByText("well").tagName).toBe("STRONG");
  expect(screen.getByRole("link", { name: "the docs" }).getAttribute("href")).toBe(
    "https://example.com/docs",
  );
  expect(screen.queryByRole("link", { name: "this" })).toBeNull();
  expect(screen.getByText(/\[this\]\(javascript:alert\(1\)\)/)).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(document.querySelector("img")).toBeNull();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  expect(screen.getByText("<b>code</b>").tagName).toBe("PRE");
});

test("an image from another site is loaded only when asked for", () => {
  render(
    <ResultView label="Output" value={{ image: "https://example.com/chart.png", alt: "Chart" }} />,
  );
  expect(document.querySelector("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show image" }));
  expect(document.querySelector("img")?.getAttribute("src")).toBe("https://example.com/chart.png");
});
