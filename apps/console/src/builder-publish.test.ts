import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { expect, test } from "vitest";
import { draftChanges } from "./screens/builder/changes.ts";
import { checksFor, plainly, problemWords } from "./screens/builder/publishCheck.ts";

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
  expect(
    plainly("/body/pages/0/widgets/0/config/fields must NOT have fewer than 1 items", made),
  ).toBe("form on Edit invoice: needs at least 1 field");
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

const approvalsWidget = (flows: string[]): PageWidget => ({
  id: "queue",
  type: "core/approvals",
  at: { x: 0, y: 0, w: 8, h: 12 },
  data: { requests: { source: { approvals: { flows } } } },
});
const runWith = (made: InterfaceBody, extra: Record<string, unknown>) =>
  checksFor({
    body: made,
    known: { ...known, ...extra } as never,
    definitionOf: () => undefined,
    problems: [],
    refusal: [],
    warnings: [],
  });

test("Approvals that lists a flow with no approval step says so, in the flow's own name", () => {
  const items = runWith(body(approvalsWidget(["stock/reorder", "stock/count"])), {
    approvalFlows: new Map([
      ["stock/reorder", { title: "Reorder", asks: false }],
      ["stock/count", { title: "Count", asks: true }],
    ]),
  });
  expect(items.filter((one) => one.id.startsWith("approvals:"))).toEqual([
    expect.objectContaining({
      state: "warn",
      text: "Approvals lists Reorder, which asks for no approval",
    }),
  ]);
});

test("while the flows are being read, nothing is said of them", () => {
  const items = runWith(body(approvalsWidget(["stock/reorder"])), { approvalFlows: undefined });
  expect(items.some((one) => one.id.startsWith("approvals:"))).toBe(false);
});

test("an app served at its own address says approvals are decided in the console; one on the console's own address does not", () => {
  const widgets = body(approvalsWidget([]));
  for (const where of ["separate", "console"]) {
    const said = runWith(widgets, { appsAddress: where }).find(
      (one) => one.id === "approvals:console",
    );
    expect(said).toMatchObject({
      state: "warn",
      text: expect.stringContaining("decided in the console"),
    });
  }
  const has = (made: InterfaceBody, where: string) =>
    runWith(made, { appsAddress: where }).some((one) => one.id === "approvals:console");
  expect(has(widgets, "none")).toBe(false);
  // A page with no Approvals widget is not told.
  expect(has(body(form(undefined)), "separate")).toBe(false);
});

test("a refusal names the thing, and says what it needs, never in the schema's words", () => {
  const made = body({
    id: "group",
    type: "core/actions",
    title: "Action group",
    at: { x: 0, y: 0, w: 6, h: 1 },
    config: { actions: [{ id: "a", label: "Do it", action: { steps: [] } }] },
  });
  expect(
    problemWords(
      {
        path: "/body/pages/0/widgets/0/config/actions/0/action/steps",
        message: "must NOT have fewer than 1 items",
      },
      made,
    ),
  ).toBe("Do it on Edit invoice has no steps yet");
  expect(
    problemWords(
      {
        path: "/body/pages/0/widgets/0/config/columns",
        message: "must NOT have fewer than 1 items",
      },
      made,
    ),
  ).toBe("Action group on Edit invoice: needs at least 1 column");
  expect(
    problemWords(
      {
        path: "/body/pages/0/widgets/0/config/rowActions",
        message: "must NOT have more than 8 items",
      },
      made,
    ),
  ).toBe("Action group on Edit invoice: has more than 8 row actions; 8 is the most");
  expect(
    problemWords(
      { path: "/body/pages/0/widgets/0/config", message: "must have required property 'fields'" },
      made,
    ),
  ).toBe("Action group on Edit invoice: needs fields");
});
