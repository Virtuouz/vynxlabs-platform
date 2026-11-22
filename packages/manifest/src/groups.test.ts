import { describe, expect, test } from "vitest";
import { missingGroups } from "./groups.js";
import type { PageWidget } from "./page.js";

const at = { x: 0, y: 0, w: 3, h: 1 };
const button = (id: string, groups: string[]): PageWidget =>
  ({
    id,
    type: "core/button",
    at,
    on: { click: { runBy: { groups }, steps: [{ do: "close" }] } },
  }) as PageWidget;

describe("the groups an interface names", () => {
  test("the ones the tenant lacks are listed, with where", () => {
    const body = {
      pages: [
        {
          id: "main",
          title: "Main",
          widgets: [
            button("a", ["billing", "gone"]),
            {
              id: "t",
              type: "core/table",
              at,
              rules: { seenBy: { groups: ["ghost"] } },
              config: {
                rowActions: [
                  { id: "x", label: "X", action: { runBy: { groups: ["gone"] }, steps: [] } },
                ],
              },
            } as unknown as PageWidget,
          ],
        },
      ],
    };
    expect(missingGroups(body, new Set(["billing"]))).toEqual([
      { page: "main", widget: "a", at: "on/click", group: "gone" },
      { page: "main", widget: "t", at: "config/rowActions/0", group: "gone" },
      { page: "main", widget: "t", at: "rules/seenBy", group: "ghost" },
    ]);
  });

  test("a group is known by its key, with or without its folder, and a dashboard is read too", () => {
    expect(
      missingGroups({ widgets: [button("a", ["groups/billing", "end-user-groups/clients"])] }, [
        "billing",
        "clients",
      ]),
    ).toEqual([]);
    expect(missingGroups({ widgets: [button("a", ["x"])] }, [])).toEqual([
      { widget: "a", at: "on/click", group: "x" },
    ]);
  });
});
