// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cannotRename,
  definedWhere,
  type NamedResource,
  RenameResource,
} from "./screens/RenameResource.tsx";
import { answer, show } from "./testing.tsx";

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
      return json({ kind: "script", schemaVersion: 1, body: { source: { code: "x" } } });
    }
    return json({ path: "lending/requests/file", change: "rename" });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("renaming saves a draft of the resource as it is, at the new path, and changes nothing that runs", async () => {
  let done = 0;
  show(
    <RenameResource root={root} link="/t/t1/workspaces/w1" row={script} onDone={() => done++} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  const said = await answer("Save as a draft", "lending/requests/file");
  expect(said).toContain("requests/submit keeps answering for 90 days");
  expect(said).toContain("Nothing changes until the draft is deployed");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")).toEqual({
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
  await waitFor(() => expect(done).toBe(1));
});

test("what the repository defines is renamed there, and the console says how", () => {
  const generated = { ...script, ownership: "code" };
  const filed = { ...script, key: "old/submit", definedIn: "src/lending/submit.script.yaml" };
  expect(cannotRename(script)).toBeUndefined();
  expect(cannotRename(generated)).toBe(
    'It is defined in the repository\'s code. Change its path there, and give it key: "requests/submit".',
  );
  expect(cannotRename(filed)).toBe(
    "It is defined in src/lending/submit.script.yaml. Move the file there, and give it key: old/submit.",
  );
  expect([script, generated, filed].map(definedWhere)).toEqual([
    "Console",
    "Repository",
    "Repository, src/lending/submit.script.yaml",
  ]);
  show(<RenameResource root={root} link="/x" row={generated} onDone={() => {}} />);
  expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(true);
});
