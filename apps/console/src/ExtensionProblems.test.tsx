// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { usePath } from "./router.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

// Monaco is not drawn in a test, and whether its text box stands in depends on whether it has
// loaded. This one is always a text box that selects the line it is asked to show.
vi.mock("./editor/CodeEditor.tsx", () => ({
  CodeEditor: (props: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onSave?: () => void;
    reveal?: { line: number };
  }) => {
    const box = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
      if (!props.reveal || !box.current) return;
      const lines = box.current.value.split("\n");
      const start = lines.slice(0, props.reveal.line - 1).join("\n").length + 1;
      box.current.setSelectionRange(start, start + (lines[props.reveal.line - 1]?.length ?? 0));
    }, [props.reveal]);
    return (
      <textarea
        ref={box}
        aria-label={props.label}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.metaKey && event.key === "s") props.onSave?.();
        }}
      />
    );
  },
}));

const base = "/tenants/t1/workspaces/w1";
const me: Me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};
let routes: Record<string, (body: unknown) => unknown>;
let calls: { method: string; url: string }[];

beforeEach(() => {
  calls = [];
  routes = {
    [`GET ${base}`]: () => ({ id: "w1", slug: "dev", name: "Dev", type: "dev" }),
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    calls.push({ method, url: path });
    const answer = routes[`${method} ${path}`];
    if (!answer && method === "GET" && path.startsWith(`${base}/drafts/`)) {
      return new Response(JSON.stringify({ title: "Not found" }), { status: 404 });
    }
    const value = answer ? answer(body) : method === "GET" ? { items: [] } : {};
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

/** The workspace screens at whatever the address says, as the console shows them. */
function AtAddress() {
  return <Tenant tenantId="t1" me={me} path={usePath()} />;
}

/**
 * Own file: the editor stands in as a text box only until Monaco has loaded, and a test file that
 * opened an editor earlier would find Monaco ready.
 */
test("EXT-MP4: an extension's code that does not build lists where, in a Problems tab, each line a way to it", async () => {
  localStorage.clear();
  routes[`GET ${base}/drafts/shop/api`] = () => ({
    path: "shop/api",
    revision: 1,
    body: {
      description: "",
      timeoutSeconds: 30,
      uses: { connections: [], secrets: [], variables: [] },
      source: { language: "typescript", code: "export default {};\n" },
    },
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/extensions/connector/edit/shop/api");
  show(<AtAddress />);
  const code = await screen.findByLabelText("Source of shop/api");
  await waitFor(() => expect((code as HTMLTextAreaElement).value).toBe("export default {};\n"));
  vi.stubGlobal("fetch", async (_address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    if (method === "PUT") {
      return new Response(
        JSON.stringify({
          title: "Bad request",
          status: 400,
          detail: "The code written in the console does not build.",
          errors: [{ path: "shop/api.connector.ts:2", message: 'Unexpected ";"' }],
        }),
        { status: 400, headers: { "content-type": "application/problem+json" } },
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
  fireEvent.change(code, { target: { value: "export default {\n  x: (;\n};\n" } });
  fireEvent.keyDown(code, { key: "s", metaKey: true });
  const problems = await screen.findByRole("region", { name: "Problems" });
  const line = await within(problems).findByRole("button", { name: /2:1\s*Unexpected ";"/ });
  fireEvent.click(line);
  const box = code as HTMLTextAreaElement;
  expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe("  x: (;");
});
