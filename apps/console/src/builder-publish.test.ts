import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { expect, test } from "vitest";
import { draftChanges } from "./screens/builder/changes.ts";
import { checksFor, plainly, problemAt, problemWords } from "./screens/builder/publishCheck.ts";

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

test("one refusal said by the save and by the deploy is one line, and it links to its widget", () => {
  const made = body(form(undefined));
  const at = problemAt({ path: "/body/pages/0/widgets/0/config/fields" }, made);
  expect(at).toEqual({ page: "edit", widget: "form" });
  const said = { text: "form on Edit invoice: needs a source to show.", at };
  const items = checksFor({
    body: made,
    known,
    definitionOf: () => undefined,
    problems: [said],
    refusal: [said],
    warnings: [],
  });
  const refused = items.filter((one) => one.id.startsWith("refused:"));
  expect(refused).toHaveLength(1);
  expect(refused[0]?.at).toEqual({ page: "edit", widget: "form" });
});

test("a row action with no words and no icon is refused, and named in the check", () => {
  const table: PageWidget = {
    id: "t",
    type: "core/table",
    title: "Invoices",
    at: { x: 0, y: 0, w: 12, h: 8 },
    config: {
      rowActions: [
        { id: "a", label: "Mark paid", action: { steps: [] } },
        { id: "b", label: "", action: { steps: [] } },
      ],
    },
  };
  const items = run(body(table));
  expect(items.find((one) => one.id === "unnamed")).toMatchObject({
    state: "fail",
    text: "1 button with no label",
    at: { page: "edit", widget: "t" },
  });
});

test("a page whose Help topic no document has is a warning; a known topic, or documents not yet read, say nothing", () => {
  const made = body();
  (made.pages[0] as { help?: string }).help = "billing-help";
  const check = (docTopics: ReadonlySet<string> | undefined) =>
    checksFor({
      body: made,
      known: { ...known, docTopics },
      definitionOf: () => undefined,
      problems: [],
      refusal: [],
      warnings: [],
    }).find((one) => one.id === "help:edit");
  expect(check(new Set(["other"]))).toMatchObject({
    state: "warn",
    text: "Edit invoice has Help topic billing-help, and no document has that topic",
  });
  expect(check(new Set(["billing-help"]))).toBeUndefined();
  expect(check(undefined)).toBeUndefined();
});

test("a Run a flow step with no flow chosen says so, not an empty path (FLW-publish)", async () => {
  const { actionProblem } = await import("./screens/builder/publishCheck.ts");
  const known = {
    tables: undefined,
    queries: undefined,
    flows: new Set(["orders/refund"]),
    scripts: new Set(["orders/size"]),
    groups: undefined,
  } as never;
  const body = { pages: [] } as never;
  const problem = (step: object) => actionProblem({ steps: [step] } as never, body, known, false);
  expect(problem({ do: "flow", path: "" })).toBe("it has no flow chosen");
  expect(problem({ do: "script", path: "" })).toBe("it has no script chosen");
  expect(problem({ do: "flow", path: "orders/other" })).toBe(
    "it starts orders/other, which can't be started by hand",
  );
});
