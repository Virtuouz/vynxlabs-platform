// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Queries } from "./screens/Queries.tsx";
import { show } from "./testing.tsx";

configure({ asyncUtilTimeout: 15_000 });

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.split("?")[0] as string;
    calls.push({ method, url: path, body });
    if (path === `${api}/queries/schema`) {
      return new Response(JSON.stringify({ tables: [], functions: [], maySql: true }));
    }
    if (path === `${api}/queries/run`) {
      return new Response(
        JSON.stringify({ columns: [], rows: [], truncated: false, tables: [], sql: "" }),
      );
    }
    if (path === `${api}/queries`) {
      return new Response(
        JSON.stringify({
          items: [
            {
              path: "reports/fees",
              description: "",
              sql: "select $1::int as n",
              parameters: [{ name: "limit", type: "integer", label: "Limit" }],
              ownership: "ui",
              draft: null,
            },
          ],
        }),
      );
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
