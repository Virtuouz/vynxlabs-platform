// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SaveBar } from "./kit/SaveBar.tsx";
import { type CreateConfig, CreateDialog } from "./ListScreen.tsx";
import { Shell } from "./Shell.tsx";
import { show } from "./testing.tsx";

let readOnly = true;
beforeEach(() => {
  readOnly = true;
  vi.stubGlobal("fetch", async (address: string) => {
    if (String(address).endsWith("/readyz")) {
      return new Response(
        JSON.stringify({
          status: "ready",
          checks: { database: { ok: true, readOnly }, objectStore: { ok: true } },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ title: "Not found" }), { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const config: CreateConfig = {
  action: "Add column",
  fields: [{ name: "host", label: "Host" }],
  submit: async () => {},
};

test("a database that takes no writes is said under every screen of the shell (INS-MP5)", async () => {
  history.replaceState(null, "", "/instance/members");
  show(
    <Shell
      me={{
        principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
        instancePermissions: ["tenant:*"],
        tenants: [],
      }}
      path="/instance/members"
      tenantId={undefined}
      onSignOut={() => {}}
    >
      <p>Body</p>
    </Shell>,
  );
  expect(await screen.findByText("The instance is read only.")).toBeTruthy();
});

test("Save and a form's action say why they cannot be pressed while the database takes no changes (INS-MP5)", async () => {
  show(<SaveBar dirty onSave={() => {}} onDiscard={() => {}} />);
  await screen.findByText(/It cannot be saved now/);
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  cleanup();
  show(<CreateDialog open onClose={() => {}} config={config} onCreated={() => {}} />);
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Add column" }) as HTMLButtonElement).disabled).toBe(
      true,
    ),
  );
  expect(screen.getByRole("dialog").textContent).toContain("taking no changes for now");
});

test("with a database that takes writes nothing is said or disabled (INS-MP5)", async () => {
  readOnly = false;
  show(<SaveBar dirty onSave={() => {}} onDiscard={() => {}} />);
  await new Promise((r) => setTimeout(r, 50));
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByText(/It cannot be saved now/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
});

test("NARROW-2: on a phone the save bar's buttons take a row of their own, kept clear of the screen's edge", () => {
  show(<SaveBar dirty onSave={() => {}} onDiscard={() => {}} />);
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.parentElement?.className).toContain("max-sm:w-full");
  expect(screen.getByRole("region", { name: "Unsaved changes" }).className).toContain(
    "safe-area-inset-bottom",
  );
});

test("R-last: the save bar reaches the window's bottom at the end of the scroll, over the page's own bottom padding", () => {
  show(<SaveBar dirty onSave={() => {}} onDiscard={() => {}} />);
  const bar = screen.getByRole("region", { name: "Unsaved changes" });
  expect(bar.className).toContain("sticky");
  // It takes back whatever bottom padding the page says it has (`--page-pad-b`, set by the Shell
  // for each layout), so that it does not depend on one padding.
  expect(bar.className).toContain("mb-[calc(var(--page-pad-b,0px)*-1)]");
});

test("R-last: Discard and Save give the focus back to where it was, not to the page", async () => {
  const { useState } = await import("react");
  function Page() {
    const [dirty, setDirty] = useState(false);
    return (
      <form>
        <input aria-label="Issuer" onChange={() => setDirty(true)} />
        <SaveBar dirty={dirty} onSave={() => setDirty(false)} onDiscard={() => setDirty(false)} />
      </form>
    );
  }
  show(<Page />);
  const field = screen.getByLabelText("Issuer");
  field.focus();
  fireEvent.change(field, { target: { value: "x" } });
  const discard = await screen.findByRole("button", { name: "Discard" });
  discard.focus();
  fireEvent.click(discard);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Discard" })).toBeNull());
  expect(document.activeElement).toBe(field);
});
