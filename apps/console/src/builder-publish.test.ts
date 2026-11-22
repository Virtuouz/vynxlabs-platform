import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { expect, test } from "vitest";
import { draftChanges } from "./screens/builder/changes.ts";
import { checksFor, plainly } from "./screens/builder/publishCheck.ts";

const form = (data: PageWidget["data"]): PageWidget => ({
  id: "form",
  type: "core/form",
  at: { x: 0, y: 0, w: 12, h: 8 },
  ...(data ? { data } : {}),
  config: { fields: [] },
});
const body = (...widgets: PageWidget[]): InterfaceBody =>
  ({
    title: "App",
    pages: [
      { id: "edit", title: "Edit invoice", kind: "modal", record: { table: "invoices" }, widgets },
    ],
  }) as unknown as InterfaceBody;
const known = {
  tables: new Map([["invoices", new Set<string>()]]),
  queries: new Set<string>(),
  flows: new Set<string>(),
  scripts: new Set<string>(),
  groups: [],
};
const run = (made: InterfaceBody) =>
  checksFor({
    body: made,
    known,
    definitionOf: () => undefined,
    problems: [],
    refusal: [],
    warnings: [],
  });

test("an edit form on a record page takes its table from the page, and is named for the page", () => {
  const items = run(body(form({ record: { source: { record: "this" } } })));
  expect(items.find((one) => one.id === "form:form")).toMatchObject({
    state: "ok",
    text: "Edit invoice form is valid",
  });
});

test("a form that reads nothing still has no table chosen", () => {
  const items = run(body(form(undefined)));
  expect(items.find((one) => one.id === "form:form")).toMatchObject({
    state: "fail",
    detail: "no table chosen",
  });
});

test("what the server refused is said in the page's words", () => {
  const made = body(form(undefined));
  expect(plainly("/body/pages/0/widgets/0/config/x must NOT have fewer than 1 items", made)).toBe(
    "form on Edit invoice: needs at least 1",
  );
  expect(plainly("Something else", made)).toBe("Something else");
});

test("a widget named for its kind is not said twice", () => {
  const was = body({
    id: "t",
    type: "core/text",
    at: { x: 0, y: 0, w: 4, h: 2 },
    config: { text: "a" },
  });
  const now = structuredClone(was);
  (now.pages[0]?.widgets[0] as PageWidget).config = { text: "b" };
  expect(draftChanges(was, now)).toEqual(["Changed text on Edit invoice"]);
});
