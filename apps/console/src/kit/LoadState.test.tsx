// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ApiError } from "../api.ts";
import { ErrorState } from "./LoadState.tsx";

afterEach(cleanup);

test("a failure offers Try again", () => {
  render(<ErrorState error={new ApiError(500, { detail: "Broke." })} onRetry={() => {}} />);
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

test("a refusal does not offer Try again, and says whom to ask", () => {
  render(
    <ErrorState
      error={new ApiError(403, { detail: "This needs the access:write permission." })}
      onRetry={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(screen.getByText(/Ask a member who can give access/)).toBeTruthy();
});

test("WLK-12: a refusal that names a permission says whom to ask wherever it is read, once", () => {
  const error = new ApiError(403, { detail: "This needs the binding:write permission." });
  expect(error.message).toMatch(/binding:write permission\. Ask a member who can give access/);
  render(<ErrorState error={error} />);
  expect(screen.getAllByText(/Ask a member who can give access/)).toHaveLength(1);
});

test("WLK-12: a refused name is said in the characters it may have, not as the server's expression", () => {
  const error = new ApiError(400, {
    errors: [{ path: "/body/name", message: "must match pattern ^[a-z][a-z0-9-]*$" }],
  });
  expect(error.fields[0]?.message).toBe("Use only lowercase letters, digits and hyphens.");
  expect(error.fields[0]?.message).not.toContain("pattern");
});
