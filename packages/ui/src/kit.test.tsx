// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Menu,
  Notice,
  SelectField,
  Table,
  TextField,
} from "./index.ts";

afterEach(cleanup);

describe("kit components under Preact", () => {
  test("button", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Create tenant</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Create tenant" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("text field is labelled, reports input and shows its error", () => {
    const onInput = vi.fn();
    const { rerender } = render(
      <TextField label="Slug" name="slug" hint="Lowercase letters" onInput={onInput} />,
    );
    const input = screen.getByLabelText("Slug") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "acme" } });
    expect(onInput).toHaveBeenCalledWith("acme");
    expect(screen.getByText("Lowercase letters")).toBeTruthy();
    rerender(
      <TextField label="Slug" name="slug" hint="Lowercase letters" error="That slug is taken." />,
    );
    expect(screen.getByRole("alert").textContent).toBe("That slug is taken.");
  });

  test("select field", () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="Type"
        name="type"
        options={[
          { value: "dev", label: "Dev" },
          { value: "production", label: "Production" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "production" } });
    expect(onChange).toHaveBeenCalledWith("production");
  });

  test("dialog opens, is labelled by its title and closes", async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Create workspace">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </Dialog>
        </>
      );
    }
    render(<Example />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("Open"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText("Create workspace")).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("menu opens and runs the chosen item", async () => {
    const signOut = vi.fn();
    render(<Menu label="alice@example.com" items={[{ label: "Sign out", onSelect: signOut }]} />);
    fireEvent.click(screen.getByText("alice@example.com"));
    const item = await screen.findByText("Sign out");
    fireEvent.click(item);
    expect(signOut).toHaveBeenCalledOnce();
  });

  test("table renders rows, and its empty state when there are none", () => {
    const columns = [{ header: "Name", cell: (row: { name: string }) => row.name }];
    const { rerender } = render(
      <Table
        columns={columns}
        rows={[{ name: "Main" }]}
        rowKey={(row) => row.name}
        empty={<EmptyState title="No workspaces yet" />}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByText("Main")).toBeTruthy();
    rerender(
      <Table
        columns={columns}
        rows={[]}
        rowKey={(row) => row.name}
        empty={<EmptyState title="No workspaces yet" />}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No workspaces yet")).toBeTruthy();
  });

  test("badge and notice", () => {
    render(
      <Notice tone="danger">
        Sign-in failed. <Badge tone="attention">Production</Badge>
      </Notice>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Sign-in failed.");
    expect(screen.getByText("Production")).toBeTruthy();
  });
});
