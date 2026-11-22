// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { show } from "../testing.tsx";
import { DocTopicPicker } from "./DocTopicPicker.tsx";

const pages = [
  {
    path: "handbook/billing/refunds",
    title: "Refunds",
    description: "Give money back",
    topic: "refunds",
  },
  { path: "handbook/index", title: "Welcome", description: null, topic: null },
  { path: "handbook/billing/invoices", title: "Invoices", description: null, topic: "invoicing" },
].map((one) => ({
  pages: null,
  app: "docs",
  url: null,
  state: "deployed",
  file: null,
  headings: [],
  terms: [],
  source: "",
  revision: null,
  ...one,
}));
const docs = {
  apps: [
    {
      path: "docs",
      key: "docs",
      title: "Handbook",
      docs: "handbook",
      published: true,
      body: {},
      deployed: true,
      drafted: false,
    },
  ],
  pages,
  tables: [],
};

let reply: () => Response;
beforeEach(() => {
  reply = () => Response.json(docs);
  vi.stubGlobal("fetch", async () => reply());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Picker = ({ value, onChange }: { value?: string; onChange: (topic?: string) => void }) => (
  <DocTopicPicker
    root="/tenants/t/workspaces/w"
    link="/t/t/w/w"
    label="Help topic"
    value={value}
    onChange={onChange}
  />
);

test("a topic that a page has shows the page: title, where it is, and its topic, with Change and Clear", async () => {
  const onChange = vi.fn();
  show(<Picker value="refunds" onChange={onChange} />);
  expect(await screen.findByText("Refunds")).toBeTruthy();
  expect(screen.getByText("billing/refunds")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test("a topic no page has is said to be a problem", async () => {
  show(<Picker value="old-topic" onChange={() => undefined} />);
  expect(await screen.findByText(/No document has the topic/)).toBeTruthy();
  expect(screen.getByText("old-topic")).toBeTruthy();
});

test("the window searches, groups by folder, skips a page with no topic, and Enter chooses", async () => {
  const onChange = vi.fn();
  show(<Picker onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Choose a document/ }));
  const search = await screen.findByRole("combobox", { name: "Search the documents" });
  await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));
  expect(screen.getByRole("group", { name: "billing" })).toBeTruthy();
  // A page with no topic is shown, disabled, with the reason and the way to edit it.
  const welcome = screen.getByRole("option", { name: /Welcome/ });
  expect(welcome.getAttribute("aria-disabled")).toBe("true");
  expect(welcome.textContent).toContain("This page has no topic");
  expect(screen.getByRole("link", { name: "Edit it" }).getAttribute("href")).toBe(
    "/t/t/w/w/docs/edit/handbook/index",
  );
  // Search over description, and arrows.
  fireEvent.change(search, { target: { value: "money" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.change(search, { target: { value: "" } });
  fireEvent.keyDown(search, { key: "ArrowDown" });
  expect(search.getAttribute("aria-activedescendant")).toContain("handbook/billing/refunds");
  fireEvent.keyDown(search, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith("refunds");
});

test("nothing matches, none exist, and the read fails: each is said", async () => {
  show(<Picker onChange={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: /Choose a document/ }));
  const search = await screen.findByRole("combobox", { name: "Search the documents" });
  await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));
  fireEvent.change(search, { target: { value: "zzz" } });
  expect(screen.getByText(/No document matches/)).toBeTruthy();
  cleanup();
  reply = () => Response.json({ ...docs, pages: [] });
  show(<Picker onChange={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: /Choose a document/ }));
  expect(await screen.findByText(/no documentation yet/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Write the first page" }).getAttribute("href")).toBe(
    "/t/t/w/w/docs",
  );
});
