// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Page } from "@volvel/manifest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageSettings } from "./screens/builder/PageSettings.tsx";

afterEach(cleanup);

const catalog = { maySql: false, queries: [], tables: [{ name: "invoices", columns: [] }] };

const show = (page: Page) => {
  const onChange = vi.fn();
  render(
    <PageSettings
      page={page}
      catalog={catalog}
      mostReadTable="invoices"
      onChange={onChange}
      onRemove={() => undefined}
      canRemove
      root="/tenants/t/workspaces/w"
      link="/t/t/w/w"
    />,
  );
  return onChange;
};

describe("Page settings: icon, title in the app menu, size", () => {
  test("a page has an icon picker with a preview, and it writes Page.icon", () => {
    const onChange = show({ id: "money", title: "Money", widgets: [] });
    expect((screen.getByLabelText("Title in the app menu") as HTMLInputElement).maxLength).toBe(
      100,
    );
    const icon = screen.getByLabelText("Icon") as HTMLSelectElement;
    expect(icon.value).toBe("");
    fireEvent.change(icon, { target: { value: "banknote" } });
    expect(onChange).toHaveBeenCalledWith(
      { id: "money", title: "Money", widgets: [], icon: "banknote" },
      expect.any(String),
    );
  });

  test("the icon chosen is drawn in the preview, and No icon takes it away", () => {
    const onChange = show({ id: "money", title: "Money", widgets: [], icon: "banknote" });
    expect(document.querySelector("[data-page-icon-preview] svg")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Icon"), { target: { value: "" } });
    expect(onChange.mock.calls[0]?.[0]).toEqual({ id: "money", title: "Money", widgets: [] });
  });

  test("a side sheet has a size, Small to Full, and no icon: it is not in the menu", () => {
    const onChange = show({
      id: "detail",
      title: "Invoice detail",
      kind: "sheet",
      record: { table: "invoices" },
      widgets: [],
    });
    expect(screen.queryByLabelText("Icon")).toBeNull();
    const size = screen.getByLabelText("Size") as HTMLSelectElement;
    expect(size.value).toBe("medium");
    expect([...size.options].map((one) => one.textContent)).toEqual([
      "Small",
      "Medium",
      "Large",
      "Extra large",
      "Full",
    ]);
    fireEvent.change(size, { target: { value: "xlarge" } });
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ size: "xlarge" });
    fireEvent.change(size, { target: { value: "medium" } });
    // Medium is the default: it is left out.
    expect(onChange.mock.calls[1]?.[0]).not.toHaveProperty("size");
  });
});
