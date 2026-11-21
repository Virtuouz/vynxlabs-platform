// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import type { InterfaceBody } from "@volvel/manifest";
import { afterEach, describe, expect, test, vi } from "vitest";

const answers: Record<string, unknown> = {};
vi.mock("./api.ts", async (original) => ({
  ...(await original<typeof import("./api.ts")>()),
  api: {
    get: async (url: string) => {
      const found = Object.entries(answers).find(([start]) => url.startsWith(start));
      if (!found) throw new Error(`no answer for ${url}`);
      return found[1];
    },
  },
}));
const { PublishDialog } = await import("./screens/builder/PublishDialog.tsx");

afterEach(cleanup);

const page = (widgets: InterfaceBody["pages"][number]["widgets"]): InterfaceBody => ({
  title: "Clinic performance",
  pages: [{ id: "money", title: "Money", widgets }],
});
const stat = { id: "s", type: "core/stat", title: "Invoiced", at: { x: 0, y: 0, w: 3, h: 3 } };

describe("publishing from the builder", () => {
  test("says what changes against what people see now, as the control plane answers it", async () => {
    const root = "/tenants/t/workspaces/w";
    answers[`${root}/changes/preview`] = {
      possible: true,
      refusal: null,
      summary: { created: 0, updated: 1, deleted: 0, changes: [] },
    };
    // The interface read answers `{ body }` since phase 25.
    answers[`${root}/interfaces/screens/performance`] = {
      path: "screens/performance",
      body: page([stat]),
      tables: {},
    };
    answers[`${root}/resources`] = { items: [] };
    answers["/tenants/t/bindings"] = { items: [] };
    render(
      <PublishDialog
        open
        onClose={() => undefined}
        root={root}
        path="screens/performance"
        appPath="performance"
        body={page([stat, { ...stat, id: "g", type: "labs/goal", title: "This month" }])}
        publishing={false}
        onPublish={() => undefined}
      />,
    );
    expect(await screen.findByText("This month")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Publish/ })).toBeTruthy();
  });
});
