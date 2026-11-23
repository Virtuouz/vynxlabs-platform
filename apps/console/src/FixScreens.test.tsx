// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError, fieldWords } from "./api.ts";
import { actionWords, targetTypeWords } from "./audit-words.ts";
import { type CreateConfig, CreateDialog } from "./ListScreen.tsx";
import { leaveFirst, useNavigationGuard } from "./router.tsx";
import { verbOf } from "./screens/Audit.tsx";
import { answer, show } from "./testing.tsx";

afterEach(cleanup);

test("a length refusal is said as what to do, at the field (w-people 6)", () => {
  expect(fieldWords("must NOT have fewer than 12 characters")).toBe("Use at least 12 characters.");
  expect(fieldWords("must NOT have more than 1 character")).toBe("Use at most 1 character.");
  const error = new ApiError(400, {
    code: "validation_failed",
    detail: "The request body is not valid.",
    errors: [{ path: "/body/password", message: "must NOT have fewer than 12 characters" }],
  });
  expect(error.fields[0]?.message).toBe("Use at least 12 characters.");
});

test("a slug where an ID goes is a place that was not found (w-people 8)", () => {
  const error = new ApiError(400, {
    code: "validation_failed",
    detail: "The request params is not valid.",
    errors: [{ path: "/params/t", message: 'must match format "uuid"' }],
  });
  expect(error.message).toMatch(/was not found/);
  expect(error.message).not.toMatch(/params/);
  // A body that is not valid keeps what the server said.
  expect(
    new ApiError(400, {
      code: "validation_failed",
      detail: "The request body is not valid.",
      errors: [{ path: "/body/x", message: "is invalid" }],
    }).message,
  ).toBe("The request body is not valid.");
});

test("a refusal shown at its field is not said again in a banner (w-people 6, 10)", async () => {
  const config: CreateConfig = {
    action: "Add member",
    fields: [{ name: "password", label: "Initial password", type: "password" }],
    submit: async () => {
      throw new ApiError(400, {
        code: "validation_failed",
        detail: "The request body is not valid.",
        errors: [{ path: "/body/password", message: "must NOT have fewer than 12 characters" }],
      });
    },
  };
  function Screen() {
    const [open, setOpen] = useState(true);
    return (
      <CreateDialog
        open={open}
        onClose={() => setOpen(false)}
        config={config}
        onCreated={() => {}}
      />
    );
  }
  show(<Screen />);
  fireEvent.change(await screen.findByLabelText(/Initial password/), {
    target: { value: "short" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add member" }));
  expect(await screen.findByText("Use at least 12 characters.")).toBeTruthy();
  expect(screen.queryByText("The request body is not valid.")).toBeNull();
});

test("the audit log gives access changes their words (w-words 1)", () => {
  expect(actionWords("access.released")).toBe("Access change applied");
  expect(actionWords("access.release_declined")).toBe("Access change declined");
  expect(targetTypeWords("tenant_release")).toBe("access change");
  expect(targetTypeWords("end_user")).toBe("end user");
});

test("turning something off is an update, not a delete (w-instance 5)", () => {
  expect(verbOf("member.disabled")).toBe("Update");
  expect(verbOf("app_domain.disabled")).toBe("Update");
  expect(verbOf("member.removed")).toBe("Delete");
});

test("changing a tab with unsaved changes asks first, and Stay keeps the tab (w-gov 1)", async () => {
  const change = vi.fn();
  function Held() {
    useNavigationGuard(true, "Your changes to this mapping are not saved.");
    return null;
  }
  show(<Held />);
  leaveFirst(change)("groups");
  expect(await answer("Stay")).toContain("not saved");
  expect(change).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  leaveFirst(change)("groups");
  await answer("Leave");
  await waitFor(() => expect(change).toHaveBeenCalledWith("groups"));
});

test("with nothing unsaved a tab changes at once (w-gov 1)", () => {
  const change = vi.fn();
  leaveFirst(change)("settings");
  expect(change).toHaveBeenCalledWith("settings");
});
