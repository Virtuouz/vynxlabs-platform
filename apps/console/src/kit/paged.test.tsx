// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { show } from "../testing.tsx";
import { LoadMore, usePagedList } from "./paged.tsx";

let rows: number[];

beforeEach(() => {
  rows = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  vi.stubGlobal("fetch", async (address: string) => {
    const url = new URL(address, "http://x");
    const after = url.searchParams.get("cursor");
    const from = after ? rows.findIndex((row) => row < Number(after)) : 0;
    const items = from < 0 ? [] : rows.slice(from, from + 3);
    const last = items.at(-1);
    const more = last !== undefined && rows.some((row) => row < last);
    return new Response(
      JSON.stringify({
        items: items.map((id) => ({ id })),
        nextCursor: more ? String(last) : null,
      }),
    );
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function List() {
  const list = usePagedList<{ id: number }>("/api/v1/things", { limit: 3 });
  return (
    <div>
      <p data-testid="ids">{list.items?.map((one) => one.id).join(",")}</p>
      <button type="button" onClick={list.reload}>
        Reload
      </button>
      <LoadMore
        shown={list.items?.length ?? 0}
        hasMore={list.hasMore}
        loading={list.loadingMore}
        noun="things"
        onMore={() => void list.loadMore()}
      />
    </div>
  );
}

test("OPS-11: a list read again keeps the pages the reader loaded, and misses nothing a new row pushed down", async () => {
  show(<List />);
  await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("10,9,8"));
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("10,9,8,7,6,5"));
  // Two rows arrive at the head, then the list is read again.
  rows = [12, 11, ...rows];
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("12,11,10,9,8,7,6,5,4"));
});

test("NARROW-3: after Load more the focus stays in the list's footer, also when the button goes away", async () => {
  show(<List />);
  await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("10,9,8"));
  for (const expected of ["10,9,8,7,6,5", "10,9,8,7,6,5,4,3,2", "10,9,8,7,6,5,4,3,2,1"]) {
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe(expected));
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  }
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(document.activeElement?.textContent).toContain("Showing 10 things");
});
