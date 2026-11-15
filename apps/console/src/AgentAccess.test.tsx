// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AgentAccess } from "./screens/AgentAccess.tsx";
import { OfferToAgent } from "./screens/OfferToAgent.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
let asked: string[];
let sent: { address: string; body: unknown }[];

beforeEach(() => {
  asked = [];
  sent = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    asked.push(address);
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body));
      sent.push({ address, body });
      if (address.endsWith("/tool-calls")) {
        return json({
          tool: body.tool,
          isError: false,
          result: { runId: "r1", status: "succeeded", output: { greeting: "Hello Ada" } },
        });
      }
      return new Response(JSON.stringify({ id: "b1" }), { status: 201 });
    }
    if (address.endsWith("/service-accounts")) {
      return json({ items: [{ id: "a1", name: "Support agent" }] });
    }
    if (address.endsWith("/roles")) {
      return json({
        items: [
          { id: "r-dev", name: "developer", builtin: true },
          { id: "r-agent", name: "agent_runner", builtin: true },
        ],
      });
    }
    if (address.includes("/resources/")) return json({ id: "res1" });
    if (address.includes("/bindings?")) return json({ items: [] });
    if (address.endsWith("/workspaces")) {
      return json({
        items: [
          { id: "w1", name: "Main", slug: "main", type: "production" },
          { id: "w2", name: "Sandbox", slug: "sandbox", type: "dev" },
        ],
      });
    }
    return address.endsWith("workspace=w2")
      ? json({
          address: "https://p.example/api/v1/tenants/t1/workspaces/w2/mcp",
          reachable: false,
          tools: [],
        })
      : json({
          address: "https://p.example/api/v1/tenants/t1/workspaces/w1/mcp",
          reachable: true,
          tools: [
            {
              name: "run_orders__greet",
              description: "Runs the script orders/greet.",
              inputSchema: {
                type: "object",
                properties: { name: { type: "string" }, loud: { type: "boolean" } },
                required: ["name"],
              },
            },
            { name: "get_run", description: "Reads a run.", inputSchema: { type: "object" } },
          ],
        });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("an account's tools are shown for a workspace, with what to give the agent", async () => {
  show(<AgentAccess base={base} account="a1" />);
  expect(await screen.findByText("run_orders__greet")).toBeTruthy();
  expect(screen.getByText("name, loud?")).toBeTruthy();
  expect(screen.getByText("Nothing")).toBeTruthy();
  expect(screen.getByText("https://p.example/api/v1/tenants/t1/workspaces/w1/mcp")).toBeTruthy();
  // The settings name the address and leave the key for the person to put in.
  const settings = document.querySelector("pre")?.textContent ?? "";
  expect(JSON.parse(settings).mcpServers.platform).toEqual({
    type: "http",
    url: "https://p.example/api/v1/tenants/t1/workspaces/w1/mcp",
    headers: { Authorization: "Bearer <one of this account's API keys>" },
  });

  fireEvent.change(screen.getByLabelText("In the workspace"), { target: { value: "w2" } });
  expect(await screen.findByText(/An agent would be refused here/)).toBeTruthy();
  expect(screen.getByText("No tools")).toBeTruthy();
  expect(asked.at(-1)).toBe(`/api/v1${base}/service-accounts/a1/tools?workspace=w2`);
});

test("a tool is tried as the account, with a form from its input, and shows what the agent is told", async () => {
  show(<AgentAccess base={base} account="a1" />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Try" }))[0] as HTMLElement);
  expect(await screen.findByText(/It is real: a script runs/)).toBeTruthy();
  fireEvent.input(await screen.findByLabelText("Name"), { target: { value: "Ada" } });
  fireEvent.click(screen.getByRole("button", { name: "Call it" }));
  expect(await screen.findByText("The agent would be told this.")).toBeTruthy();
  expect(screen.getByText(/Hello Ada/)).toBeTruthy();
  expect(sent).toEqual([
    {
      address: `/api/v1${base}/service-accounts/a1/tool-calls`,
      body: { workspace: "w1", tool: "run_orders__greet", arguments: { name: "Ada" } },
    },
  ]);
});

test("offering a script binds the account to the runner role at that script, and says where to connect", async () => {
  show(
    <OfferToAgent
      open
      onClose={() => {}}
      tenantId="t1"
      workspaceId="w1"
      kind="script"
      path="orders/greet"
    />,
  );
  expect(await screen.findByText(/sees no other script, flow or run/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Offer" }));
  expect(await screen.findByText(/Support agent may now run the script/)).toBeTruthy();
  expect(sent).toEqual([
    {
      address: "/api/v1/tenants/t1/bindings",
      body: {
        workspaceId: "w1",
        resourceId: "res1",
        principalType: "service_account",
        principalId: "a1",
        roleId: "r-agent",
      },
    },
  ]);
  expect(screen.getByText("https://p.example/api/v1/tenants/t1/workspaces/w1/mcp")).toBeTruthy();
});
