// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PromotionConfirm } from "./screens/PromotionConfirm.tsx";
import type { PromotionPreview } from "./screens/Release.tsx";
import { answer, show } from "./testing.tsx";

afterEach(cleanup);

const preview = (more: Partial<PromotionPreview> = {}, type = "production"): PromotionPreview => ({
  target: { id: "w2", name: "Clinics", type },
  bundle: { digest: "abc", version: 12 },
  possible: true,
  refusal: null,
  summary: {
    created: 0,
    updated: 1,
    deleted: 0,
    data: [],
    changes: [],
    breaking: [{ path: "orders/lookup", message: "the tool agents call as lookup is removed" }],
  },
  tried: { runs: 0, failed: 0, flowRuns: 0, flowRunsFailed: 0 },
  triggers: 0,
  ...more,
});

test("production's breaking names are listed as sentences", () => {
  show(<PromotionConfirm data={preview()} targetName="Clinics" allowed={[]} onAllow={() => {}} />);
  expect(screen.getByText(/changes a name that something outside calls/)).toBeTruthy();
  expect(screen.getByText("The tool agents call as lookup is removed")).toBeTruthy();
});

test("a workspace that is not production has no agents to warn", () => {
  show(
    <PromotionConfirm
      data={preview({}, "dev")}
      targetName="Sandbox"
      allowed={[]}
      onAllow={() => {}}
    />,
  );
  expect(screen.queryByText(/something outside calls/)).toBeNull();
});

test("Delete them anyway asks first, then says which paths may go, with those already allowed", async () => {
  const onAllow = vi.fn();
  show(
    <PromotionConfirm
      data={preview({
        refusal: {
          code: "rename_suspected",
          detail: "It looks like a rename.",
          errors: [{ path: "script/old", message: "is deleted" }],
        },
        summary: null,
      })}
      targetName="Clinics"
      allowed={["script/earlier"]}
      onAllow={onAllow}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete them anyway" }));
  const said = await answer("Delete them and look again");
  expect(said).toMatch(/Delete script\/old in Clinics\?/);
  expect(onAllow).toHaveBeenCalledWith(["script/earlier", "script/old"]);
});

test("one who may not promote is not offered the deletion", () => {
  show(
    <PromotionConfirm
      data={preview({
        canPromote: false,
        refusal: { code: "rename_suspected", detail: "x", errors: [{ path: "a", message: "b" }] },
      })}
      targetName="Clinics"
      allowed={[]}
      onAllow={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: "Delete them anyway" })).toBeNull();
});
