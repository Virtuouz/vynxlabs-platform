// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Badge,
  Button,
  CheckboxField,
  DateField,
  Dialog,
  EmptyState,
  Menu,
  Notice,
  NumberField,
  PageShell,
  Pagination,
  SelectField,
  Table,
  Tabs,
  TextAreaField,
  TextField,
  ToastProvider,
  useToast,
} from "./index.ts";

afterEach(cleanup);

describe("kit components under React", () => {
  test("button", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Create tenant</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Create tenant" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("text field is labeled, reports input and shows its error", () => {
    const onInput = vi.fn();
    const { rerender } = render(
      <TextField label="Slug" name="slug" hint="Lowercase letters" onChange={onInput} />,
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

  test("dialog opens, is labeled by its title and closes", async () => {
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

  test("checkbox field is labeled, reports a check and shows its error", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CheckboxField label="Send a receipt" name="receipt" hint="By email" onChange={onChange} />,
    );
    const box = screen.getByRole("checkbox", { name: "Send a receipt" });
    expect(box.getAttribute("aria-describedby")).toBe(screen.getByText("By email").id);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<CheckboxField label="Send a receipt" name="receipt" error="Agree first." />);
    expect(screen.getByRole("alert").textContent).toBe("Agree first.");
  });

  test("number field reports numbers, and nothing for an empty box", () => {
    const onInput = vi.fn();
    const { rerender } = render(
      <NumberField label="Quantity" name="quantity" value={2} min={1} onChange={onInput} />,
    );
    const input = screen.getByLabelText("Quantity") as HTMLInputElement;
    expect(input.value).toBe("2");
    expect(input.type).toBe("number");
    fireEvent.input(input, { target: { value: "12.5" } });
    expect(onInput).toHaveBeenLastCalledWith(12.5);
    fireEvent.input(input, { target: { value: "" } });
    expect(onInput).toHaveBeenLastCalledWith(undefined);
    // A value set from outside replaces what was typed.
    rerender(<NumberField label="Quantity" name="quantity" value={7} onChange={onInput} />);
    expect(input.value).toBe("7");

    // Without a value it keeps what is typed itself.
    cleanup();
    render(<NumberField label="Weight" name="weight" onChange={onInput} />);
    const free = screen.getByLabelText("Weight") as HTMLInputElement;
    fireEvent.input(free, { target: { value: "4" } });
    expect(onInput).toHaveBeenLastCalledWith(4);
    expect(free.value).toBe("4");
  });

  test("date field asks for a date, or a date and a time", () => {
    const onInput = vi.fn();
    const { rerender } = render(
      <DateField label="Due" name="due" value="2026-03-09" onChange={onInput} />,
    );
    const input = screen.getByLabelText("Due") as HTMLInputElement;
    expect(input.type).toBe("date");
    fireEvent.input(input, { target: { value: "2026-03-10" } });
    expect(onInput).toHaveBeenCalledWith("2026-03-10");
    rerender(<DateField label="Due" name="due" withTime error="That is in the past." />);
    expect((screen.getByLabelText("Due") as HTMLInputElement).type).toBe("datetime-local");
    expect(screen.getByRole("alert").textContent).toBe("That is in the past.");
  });

  test("text area field", () => {
    const onInput = vi.fn();
    render(<TextAreaField label="Notes" name="notes" hint="Anything else" onChange={onInput} />);
    const area = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    fireEvent.input(area, { target: { value: "Leave at the door" } });
    expect(onInput).toHaveBeenCalledWith("Leave at the door");
    expect(screen.getByText("Anything else")).toBeTruthy();
  });

  test("tabs show one panel, and move with a press or the arrow keys", async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Order sections"
        onChange={onChange}
        tabs={[
          { id: "lines", label: "Lines", content: "Two lines" },
          { id: "history", label: "History", content: "Created today" },
        ]}
      />,
    );
    expect(screen.getByRole("tablist", { name: "Order sections" })).toBeTruthy();
    const lines = screen.getByRole("tab", { name: "Lines" });
    const history = screen.getByRole("tab", { name: "History" });
    expect(lines.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Two lines");

    fireEvent.click(history);
    await waitFor(() => expect(history.getAttribute("aria-selected")).toBe("true"));
    expect(onChange).toHaveBeenCalledWith("history");
    await waitFor(() => expect(screen.getByRole("tabpanel").textContent).toBe("Created today"));

    history.focus();
    fireEvent.keyDown(history, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(lines));
  });

  test("tabs can be held from outside", async () => {
    const tabs = [
      { id: "a", label: "First", content: "One" },
      { id: "b", label: "Second", content: "Two" },
    ];
    const { rerender } = render(<Tabs label="Parts" tabs={tabs} value="b" />);
    expect(screen.getByRole("tabpanel").textContent).toBe("Two");
    rerender(<Tabs label="Parts" tabs={tabs} value="a" />);
    await waitFor(() => expect(screen.getByRole("tabpanel").textContent).toBe("One"));
  });

  test("a toast is announced, can be dismissed and leaves by itself", () => {
    vi.useFakeTimers();
    try {
      function Example() {
        const toast = useToast();
        return (
          <>
            <Button onClick={() => toast.success("Order saved.")}>Save</Button>
            <Button onClick={() => toast.danger("Could not save.")}>Fail</Button>
            <Button onClick={() => toast.show("Copied.")}>Copy</Button>
          </>
        );
      }
      render(
        <ToastProvider duration={3000}>
          <Example />
        </ToastProvider>,
      );
      expect(screen.queryByRole("status")).toBeNull();
      fireEvent.click(screen.getByText("Save"));
      expect(screen.getByRole("status").textContent).toContain("Order saved.");
      expect(screen.getByRole("status").className).toContain("bg-success-soft");

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      fireEvent.click(screen.getByText("Fail"));
      fireEvent.click(screen.getByText("Copy"));
      expect(screen.getAllByRole("status")).toHaveLength(3);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // The first toast has had its three seconds, the others have not.
      expect(screen.getAllByRole("status").map((toast) => toast.textContent)).toEqual([
        expect.stringContaining("Could not save."),
        expect.stringContaining("Copied."),
      ]);

      fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0] as HTMLElement);
      expect(screen.getAllByRole("status")).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("useToast says what is missing without a provider", () => {
    function Example() {
      useToast();
      return null;
    }
    expect(() => render(<Example />)).toThrow("useToast needs a ToastProvider above it.");
  });

  test("pagination offers only the ways there are", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(
      <Pagination
        hasPrevious={false}
        hasNext
        onPrevious={onPrevious}
        onNext={onNext}
        label="Page 1"
      />,
    );
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeTruthy();
    expect(screen.getByText("Page 1")).toBeTruthy();
    const previous = screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    fireEvent.click(previous);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledOnce();
  });

  test("page shell frames a page with its title, logo, navigation and account slot", () => {
    render(
      <PageShell
        title="Field service"
        logo="/logo.svg"
        nav={[
          { label: "Jobs", href: "/jobs", current: true },
          { label: "Customers", href: "/customers" },
        ]}
        actions={<Button>Account</Button>}
      >
        <p>Three jobs today</p>
      </PageShell>,
    );
    expect(screen.getByRole("banner").textContent).toContain("Field service");
    expect(screen.getByRole("banner").querySelector("img")?.getAttribute("src")).toBe("/logo.svg");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelectorAll("a")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Jobs" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Customers" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("main").textContent).toBe("Three jobs today");
  });

  test("page shell needs only a title", () => {
    render(<PageShell title="Field service">Content</PageShell>);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("banner").querySelector("img")).toBeNull();
  });
});
