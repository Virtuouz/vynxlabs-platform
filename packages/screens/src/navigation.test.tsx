// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { NavigateTo } from "./actions.tsx";
import { addressOf, parseAddress, Stepper, steppingOf, useAddress } from "./navigation.tsx";

const BASE = "/apps/clinic/";

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", BASE));

describe("the address", () => {
  test("a page, a record page, a sheet and a modal are each in the address", () => {
    expect(parseAddress(BASE, "/apps/clinic/", "")).toEqual({});
    expect(parseAddress(BASE, "/apps/clinic/invoices", "")).toEqual({ page: "invoices" });
    expect(parseAddress(BASE, "/apps/clinic/invoice/abc", "")).toEqual({
      page: "invoice",
      record: "abc",
    });
    expect(parseAddress(BASE, "/apps/clinic/invoices", "?sheet=invoice&record=abc")).toEqual({
      page: "invoices",
      sheet: { page: "invoice", record: "abc" },
    });
    expect(parseAddress(BASE, "/apps/clinic/", "?modal=new_invoice")).toEqual({
      modal: { page: "new_invoice" },
    });
  });

  test("an address is read back as it was made", () => {
    const cases = [
      {},
      { page: "invoices" },
      { page: "invoice", record: "a b" },
      { page: "invoices", sheet: { page: "invoice", record: "abc" } },
      { page: "invoices", modal: { page: "new_invoice" } },
    ];
    for (const address of cases) {
      const href = addressOf(BASE, address);
      const [path = "", query = ""] = href.split("?");
      expect(parseAddress(BASE, path, query ? `?${query}` : "")).toEqual(address);
    }
    expect(addressOf(BASE, { page: "invoices", sheet: { page: "invoice", record: "abc" } })).toBe(
      "/apps/clinic/invoices?sheet=invoice&record=abc",
    );
  });

  test("an old #hash address is no longer an address", () => {
    expect(parseAddress(BASE, "/apps/clinic/", "")).toEqual({});
  });
});

describe("stepping", () => {
  test("says where the record is among the list, and what is on either side", () => {
    expect(steppingOf(["a", "b", "c"], "b")).toEqual({
      at: 2,
      total: 3,
      partial: false,
      previous: "a",
      next: "c",
      hasNext: true,
    });
    expect(steppingOf(["a", "b", "c"], "a")?.previous).toBeUndefined();
    expect(steppingOf(["a", "b", "c"], "c")?.next).toBeUndefined();
    expect(steppingOf(["a"], "z")).toBeUndefined();
    expect(steppingOf(undefined, "a")).toBeUndefined();
  });
});

let last: ReturnType<typeof useAddress>;
function Host() {
  last = useAddress(BASE);
  const { address, stepping, step } = last;
  return (
    <div>
      <output data-testid="at">{addressOf(BASE, address)}</output>
      {stepping ? <Stepper stepping={stepping} onStep={step} /> : null}
    </div>
  );
}
const go = (to: NavigateTo) => act(() => last.go(to));
const where = () => screen.getByTestId("at").textContent;
const back = async () => {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};

describe("moving through the app", () => {
  test("a sheet opens over the page in the address, and Back closes it", async () => {
    render(<Host />);
    await go({ page: "invoices", as: "page" });
    await go({ page: "invoice", record: "a", as: "sheet" });
    expect(where()).toBe("/apps/clinic/invoices?sheet=invoice&record=a");
    expect(last.address.page).toBe("invoices");
    await back();
    expect(where()).toBe("/apps/clinic/invoices");
    expect(last.address.sheet).toBeUndefined();
  });

  test("a shared link reopens a sheet, and close then leaves it without going back out of the app", async () => {
    window.history.replaceState(null, "", "/apps/clinic/invoices?sheet=invoice&record=a");
    render(<Host />);
    expect(last.address.sheet).toEqual({ page: "invoice", record: "a" });
    const before = window.history.length;
    await go({ close: true });
    expect(where()).toBe("/apps/clinic/invoices");
    expect(window.history.length).toBe(before);
  });

  test("close goes back when the app put the sheet there", async () => {
    render(<Host />);
    await go({ page: "invoices", as: "page" });
    await go({ page: "ask", as: "modal" });
    expect(where()).toBe("/apps/clinic/invoices?modal=ask");
    await go({ close: true });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(where()).toBe("/apps/clinic/invoices");
  });

  test("a record page is a new address, and Back returns to the page before it", async () => {
    render(<Host />);
    await go({ page: "invoices", as: "page" });
    await go({ page: "client", record: "c1", as: "page" });
    expect(where()).toBe("/apps/clinic/client/c1");
    await back();
    expect(where()).toBe("/apps/clinic/invoices");
  });

  test("a sheet opened from a list steps through it, replacing its entry so Back closes it at once", async () => {
    render(<Host />);
    await go({ page: "invoices", as: "page" });
    await go({ page: "invoice", record: "b", as: "sheet", among: ["a", "b", "c"] });
    expect(screen.getByText("2 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(where()).toBe("/apps/clinic/invoices?sheet=invoice&record=c");
    expect(screen.getByText("3 of 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(where()).toBe("/apps/clinic/invoices?sheet=invoice&record=a");
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    await back();
    expect(where()).toBe("/apps/clinic/invoices");
    expect(screen.queryByText(/ of 3/)).toBeNull();
  });

  test("the count is the real total, and Next past the loaded rows reads the next ones", async () => {
    let reads = 0;
    render(<Host />);
    await go({ page: "invoices", as: "page" });
    await go({
      page: "invoice",
      record: "b",
      as: "sheet",
      among: ["a", "b"],
      amongTotal: 2750,
      amongMore: async () => {
        reads += 1;
        return reads === 1 ? ["c", "d"] : [];
      },
    });
    expect(screen.getByText("2 of 2,750")).toBeTruthy();
    // The last loaded row: Next is still on, because there are more rows.
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    expect(where()).toBe("/apps/clinic/invoices?sheet=invoice&record=c");
    expect(screen.getByText("3 of 2,750")).toBeTruthy();
    expect(reads).toBe(1);
  });

  test("when the total is not known it says so, and Next with nothing more turns off", async () => {
    render(<Host />);
    await go({ page: "invoices", as: "page" });
    await go({
      page: "invoice",
      record: "a",
      as: "sheet",
      among: ["a"],
      amongMore: async () => [],
    });
    expect(screen.getByText("1 of 1 or more")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    expect(screen.getByText("1 of 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });

  test("a sheet opened by a shared link has no list to step through", async () => {
    window.history.replaceState(null, "", "/apps/clinic/invoices?sheet=invoice&record=b");
    render(<Host />);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
});

test("a modal opened from a sheet is over it: both are in the address, each with its record", () => {
  const address = parseAddress(
    "/apps/a/w/perf/",
    "/apps/a/w/perf/money",
    "?sheet=invoice&record=r1&modal=edit-invoice&modalRecord=r1",
  );
  expect(address).toEqual({
    page: "money",
    sheet: { page: "invoice", record: "r1" },
    modal: { page: "edit-invoice", record: "r1" },
  });
  expect(addressOf("/apps/a/w/perf/", address)).toBe(
    "/apps/a/w/perf/money?sheet=invoice&record=r1&modal=edit-invoice&modalRecord=r1",
  );
  // A modal on its own takes `record`, as a sheet does.
  expect(
    parseAddress("/apps/a/w/perf/", "/apps/a/w/perf/money", "?modal=new&record=r2").modal,
  ).toEqual({
    page: "new",
    record: "r2",
  });
  // A link with only `modalRecord` (no sheet under it) works too: it is the modal's record.
  expect(
    parseAddress("/apps/a/w/perf/", "/apps/a/w/perf/money", "?modal=new&modalRecord=r3").modal,
  ).toEqual({ page: "new", record: "r3" });
});
