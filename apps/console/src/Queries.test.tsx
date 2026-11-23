// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Queries } from "./screens/Queries.tsx";
import { show } from "./testing.tsx";

configure({ asyncUtilTimeout: 15_000 });

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown; query?: string }[];
let maySql = true;
let listed: Record<string, unknown>[] | undefined;

beforeEach(() => {
  calls = [];
  maySql = true;
  listed = undefined;
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.split("?")[0] as string;
    calls.push({ method, url: path, body, query: address.split("?")[1] ?? "" });
    if (path === `${api}/queries/schema`) {
      return new Response(JSON.stringify({ tables: [], functions: [], maySql }));
    }
    if (path.startsWith(`${api}/queries/saved/`)) {
      return new Response(
        JSON.stringify({ columns: [], rows: [], truncated: false, tables: [], sql: "" }),
      );
    }
    if (path.startsWith(`${api}/drafts/`) && method === "PUT") {
      return new Response(JSON.stringify({ revision: 1, body: (body as { body: unknown }).body }));
    }
    if (path === `${api}/queries/run`) {
      return new Response(
        JSON.stringify({ columns: [], rows: [], truncated: false, tables: [], sql: "" }),
      );
    }
    if (path === `${api}/queries`) {
      if (listed) return new Response(JSON.stringify({ items: listed }));
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

const savedRuns = () => calls.filter((call) => call.url.startsWith(`${api}/queries/saved/`));

describe("running a saved query without sql:read (QSD-MP7)", () => {
  test("an unchanged deployed query is run by name, as the route allows", async () => {
    maySql = false;
    history.replaceState(null, "", "/?query=reports/fees");
    show(<Queries root={root} link={link} />);
    const field = await screen.findByLabelText("Limit");
    fireEvent.change(field, { target: { value: "7" } });
    const button = screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(savedRuns()).toHaveLength(1));
    expect(savedRuns()[0]?.url).toBe(`${api}/queries/saved/reports/fees`);
    expect(JSON.parse(new URLSearchParams(savedRuns()[0]?.query).get("params") ?? "{}")).toEqual({
      limit: 7,
    });
    expect(ran()).toHaveLength(0);
  });

  test("a query that is not written yet cannot be run, and the words say why", async () => {
    maySql = false;
    show(<Queries root={root} link={link} />);
    await screen.findByText(/sql:read/);
    expect((screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("how many rows a run returns (QSD-MP8)", () => {
  test("up to 10,000 can be asked for, and more is said on the field", async () => {
    await write("select 1");
    const field = await screen.findByLabelText("Rows to return");
    expect((field as HTMLInputElement).value).toBe("1000");
    fireEvent.change(field, { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));
    await waitFor(() => expect(ran()).toHaveLength(1));
    expect((ran()[0]?.body as { limit: number } | undefined)?.limit).toBe(5000);
    fireEvent.change(field, { target: { value: "10001" } });
    await screen.findByText("Must be a whole number from 1 to 10,000.");
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));
    await Promise.resolve();
    expect(ran()).toHaveLength(1);
  });
});

describe("what a query says of itself (QSD-MP3)", () => {
  test("its description and what each parameter is are saved with it", async () => {
    history.replaceState(null, "", "/?query=reports/fees");
    show(<Queries root={root} link={link} />);
    fireEvent.change(await screen.findByLabelText("What it is for"), {
      target: { value: "Fees by device" },
    });
    fireEvent.change(screen.getByLabelText("Name of parameter 1"), { target: { value: "least" } });
    fireEvent.change(screen.getByLabelText("Label of parameter 1"), {
      target: { value: "Least fee" },
    });
    fireEvent.change(screen.getByLabelText("Default of parameter 1"), { target: { value: "5" } });
    fireEvent.click(screen.getByLabelText("Parameter 1 is needed"));
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    const sent = calls.find((call) => call.method === "PUT")?.body as {
      body: { description: string; parameters: unknown[] };
    };
    expect(sent.body.description).toBe("Fees by device");
    expect(sent.body.parameters).toEqual([
      { name: "least", type: "integer", label: "Least fee", default: 5, required: true },
    ]);
  });

  test("a name that is not a name, and a default that does not fit, are said where they are", async () => {
    history.replaceState(null, "", "/?query=reports/fees");
    show(<Queries root={root} link={link} />);
    fireEvent.change(await screen.findByLabelText("Name of parameter 1"), {
      target: { value: "Least Fee" },
    });
    await screen.findByText("Lowercase letters, digits and underscores, starting with a letter.");
    fireEvent.change(screen.getByLabelText("Default of parameter 1"), { target: { value: "x" } });
    await screen.findByText("Must be a whole number.");
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await Promise.resolve();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });
});

describe("the list of saved queries (DAT-30)", () => {
  test("a title is shown with its path, and a rename says what it was", async () => {
    listed = [
      {
        path: "reports/fees",
        title: "Fees by device",
        description: "",
        sql: "select 1",
        parameters: [],
        ownership: "ui",
        draft: "changed",
        renamedFrom: "reports/old",
      },
    ];
    show(<Queries root={root} link={link} />);
    await screen.findByText("Fees by device");
    expect(screen.getByText("reports/fees")).toBeDefined();
    expect(screen.getByText(/Renamed from reports\/old/)).toBeDefined();
  });
});
