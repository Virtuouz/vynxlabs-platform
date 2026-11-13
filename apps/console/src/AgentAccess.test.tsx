// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AgentAccess } from "./screens/AgentAccess.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
let asked: string[];

beforeEach(() => {
  asked = [];
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
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
                properties: { name: {}, loud: {} },
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
  expect(await screen.findByText(/has no access in this workspace/)).toBeTruthy();
  expect(screen.getByText("No tools")).toBeTruthy();
  expect(asked.at(-1)).toBe(`/api/v1${base}/service-accounts/a1/tools?workspace=w2`);
});
