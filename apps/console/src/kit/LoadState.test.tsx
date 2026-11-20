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
