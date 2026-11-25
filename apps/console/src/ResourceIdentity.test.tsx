// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cannotRename,
  definedWhere,
  type NamedResource,
  ResourceIdentity,
} from "./screens/ResourceIdentity.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const script: NamedResource = {
  path: "requests/submit",
  key: "requests/submit",
  kind: "script",
  title: null,
  ownership: "ui",
  definedIn: null,
};
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    // There is no draft yet: the resource as it is deployed is what gets renamed.
    if (method === "GET" && address.includes("/drafts/")) return json({ detail: "none" }, 404);
    if (method === "GET") {
      return json({
        kind: "script",
        schemaVersion: 1,
        key: "requests/submit",
        title: "Ask for a device",
        body: { source: { code: "x" } },
      });
    }
    return json({ path: "lending/requests/file", change: "rename" });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (dialog: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
const put = () => calls.find((call) => call.method === "PUT");

test("renaming saves a draft of the resource as it is, at the new path, and changes nothing that runs", async () => {
  const done: string[] = [];
  show(
    <ResourceIdentity
      root={root}
      link="/t/t1/workspaces/w1"
      row={script}
      onDone={(path) => done.push(path)}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("requests/submit keeps answering for 90 days");
  expect(dialog.textContent).toContain("Nothing changes until the draft is deployed");
  // Its key is shown and cannot be typed over. Nothing is saved until something changed.
  await within(dialog).findByLabelText("Path");
  expect(dialog.textContent).toContain("It never changes.");
  const save = within(dialog).getByRole("button", { name: "Save as a draft" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  type(dialog, "Path", "lending/requests/file");
  fireEvent.click(save);
  await waitFor(() =>
    expect(put()).toEqual({
      method: "PUT",
      url: `/api/v1${root}/drafts/requests/submit`,
      body: {
        kind: "script",
        schemaVersion: 1,
        body: { source: { code: "x" } },
        path: "lending/requests/file",
      },
    }),
  );
  await waitFor(() => expect(done).toEqual(["lending/requests/file"]));
});

test("a title is changed or taken away where the path is, and an editor's unsaved changes come first", async () => {
  const opened = { path: script.path, kind: "script", ownership: "ui" };
  const { rerender } = show(
    <ResourceIdentity root={root} link="/x" row={opened} label="Name and path" onDone={() => {}} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Name and path" }));
  const dialog = await screen.findByRole("dialog");
  const title = (await within(dialog).findByLabelText("Title")) as HTMLInputElement;
  expect(title.value).toBe("Ask for a device");
  type(dialog, "Title", "  ");
  fireEvent.click(within(dialog).getByRole("button", { name: "Save as a draft" }));
  // The path stays, so it is not said. No title is said as null: left out, it would be kept.
  await waitFor(() =>
    expect(put()?.body).toEqual({
      kind: "script",
      schemaVersion: 1,
      body: { source: { code: "x" } },
      title: null,
    }),
  );

  rerender(
    <ResourceIdentity
      root={root}
      link="/x"
      row={opened}
      label="Name and path"
      unsaved
      onDone={() => {}}
    />,
  );
  const button = screen.getByRole("button", { name: "Name and path" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.focus(button.parentElement as HTMLElement);
  await screen.findByText("Save the draft first.");
});

test("what the repository's code defines is renamed there, and a file is renamed like anything else", () => {
  const generated = { ...script, ownership: "code" };
  const filed = { ...script, key: "old/submit", definedIn: "src/lending/submit.script.yaml" };
  expect(cannotRename(script)).toBeUndefined();
  expect(cannotRename(generated)).toBe(
    'It is defined in the repository\'s code. Change its path or title there, and give it key: "requests/submit".',
  );
  expect(cannotRename(filed)).toBeUndefined();
  expect([script, generated, filed].map(definedWhere)).toEqual([
    "Files",
    "Code",
    "Files, src/lending/submit.script.yaml",
  ]);
  show(<ResourceIdentity root={root} link="/x" row={generated} onDone={() => {}} />);
  expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(true);
});

test("renaming a query lists the dashboards it will update, and the repository's it will not", async () => {
  const query = { path: "reports/n", key: "reports/n", kind: "query", ownership: "ui" };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url: address, body: undefined });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (address.includes("/rename-effects/")) {
      return json({
        dashboards: [
          { path: "boards/mine", title: "Mine", ownership: "ui", widgets: 1 },
          { path: "boards/theirs", title: "Theirs", ownership: "code", widgets: 2 },
        ],
      });
    }
    if (method === "GET" && address.includes("/drafts/")) return json({ detail: "none" }, 404);
    return json({ kind: "query", schemaVersion: 1, key: "reports/n", title: null, body: {} });
  });
  show(<ResourceIdentity root={root} link="/x" row={query} onDone={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  const dialog = await screen.findByRole("dialog");
  // Nothing is said while the path is as it was.
  await within(dialog).findByLabelText("Path");
  expect(within(dialog).queryByTestId("naming")).toBeNull();
  type(dialog, "Path", "reports/count");
  const list = await within(dialog).findByTestId("naming");
  expect(list.textContent).toContain("This dashboard is saved as a draft with the new path:");
  expect(list.textContent).toContain("Mine");
  expect(list.textContent).toContain("boards/mine");
  expect(list.textContent).toContain("the repository's, so it is not changed here");
  expect(list.textContent).toContain("Theirs");
  expect(list.textContent).toContain("2 widgets");
  expect(list.textContent).toContain("Until then its widgets find the query by its key.");
});
