// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Queries } from "./screens/Queries.tsx";
import { show } from "./testing.tsx";

configure({ asyncUtilTimeout: 15_000 });

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];
let schemaAnswer: Record<string, unknown>;
let saved: Record<string, unknown>[];

beforeEach(() => {
  calls = [];
  schemaAnswer = { tables: [], functions: [], maySql: true, maySave: true };
  saved = [
    {
      path: "reports/fees",
      description: "",
      sql: "select $1::int as n",
      parameters: [{ name: "limit", type: "integer", label: "Limit" }],
      ownership: "ui",
      draft: null,
    },
  ];
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.split("?")[0] as string;
    calls.push({ method, url: path, body });
    if (path === `${api}/queries/schema`) {
      return new Response(JSON.stringify(schemaAnswer));
    }
    if (path === `${api}/queries/run`) {
      return new Response(
        JSON.stringify({ columns: [], rows: [], truncated: false, tables: [], sql: "" }),
      );
    }
    if (path === `${api}/queries`) {
      return new Response(JSON.stringify({ items: saved }));
    }
    return new Response(JSON.stringify({ items: [] }));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const ran = () => calls.filter((call) => call.url === `${api}/queries/run`);

async function write(text: string) {
  show(<Queries root={root} link={link} />);
  const box = (await screen.findByLabelText("The query")) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
}

describe("the parameters of a query written in SQL (DAT-15)", () => {
  test("an apostrophe in a comment does not hide the parameter after it", async () => {
    await write("-- what's this\nselect * from t where a = $1");
    await screen.findByLabelText("$1");
  });

  test("a dollar amount in a comment or a string is not a parameter", async () => {
    await write("/* costs $2024 */ select '$7' as price, \"$5000000\" from t where a = $1");
    await screen.findByLabelText("$1");
    expect(screen.queryByLabelText("$2")).toBeNull();
    expect(screen.queryByLabelText("$7")).toBeNull();
    expect(screen.queryByLabelText("$2024")).toBeNull();
    expect(screen.queryByLabelText("$5000000")).toBeNull();
  });
});

describe("what is typed for a parameter (DAT-14)", () => {
  test("a word for a whole number is said on its field, and nothing is run", async () => {
    history.replaceState(null, "", "/?query=reports/fees");
    show(<Queries root={root} link={link} />);
    fireEvent.change(await screen.findByLabelText("Limit"), { target: { value: "abc" } });
    await screen.findByText("Must be a whole number.");
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));
    await waitFor(() => expect(screen.getByText("Must be a whole number.")).toBeDefined());
    expect(ran()).toHaveLength(0);
  });
});

describe("what the Queries screen offers, and what it says of one that is not there", () => {
  test("Save is not offered to someone who may not keep a query, and the words say what it takes (DAT-24)", async () => {
    schemaAnswer = { ...schemaAnswer, maySave: false };
    await write("select 1");
    expect((screen.getByRole("button", { name: "Save as…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/resource:write/)).toBeTruthy();
  }, 30_000);

  test("Save is not offered in a production workspace, where queries are promoted (DAT-24)", async () => {
    show(<Queries root={root} link={link} editable={false} />);
    const box = (await screen.findByLabelText("The query")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "select 1" } });
    expect((screen.getByRole("button", { name: "Save as…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/dev workspace/)).toBeTruthy();
  }, 30_000);

  test("one that the repository keeps says that saving takes it over (DAT-24)", async () => {
    saved = [{ ...(saved[0] as object), ownership: "code" }];
    history.replaceState(null, "", "/?query=reports/fees");
    show(<Queries root={root} link={link} />);
    await screen.findByText(/Saving a draft of it takes it over/);
  }, 30_000);

  test("an address that names no query says so, with a way to a new one (DAT-26)", async () => {
    history.replaceState(null, "", "/?query=reports/gone");
    show(<Queries root={root} link={link} />);
    await screen.findByText(/There is no query at reports\/gone/);
    expect(screen.queryByText("A new query")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New query" }));
    await screen.findByText("A new query");
    expect(window.location.search).toBe("");
  }, 30_000);

  test("the list gives a query's title with its path under it, and where a renamed one came from (DAT-30)", async () => {
    saved = [
      { ...(saved[0] as object), title: "Fees by device", renamedFrom: "reports/old-fees" },
      { ...(saved[0] as object), path: "reports/plain", title: null },
    ];
    show(<Queries root={root} link={link} />);
    const aside = await screen.findByRole("complementary", { name: "Tables and saved queries" });
    await within(aside).findByText("Fees by device");
    expect(within(aside).getByText("reports/fees")).toBeTruthy();
    expect(within(aside).getByText(/Renamed from reports\/old-fees/)).toBeTruthy();
    // One with no title shows its path, once.
    expect(within(aside).getAllByText("reports/plain")).toHaveLength(1);
  }, 30_000);
});
