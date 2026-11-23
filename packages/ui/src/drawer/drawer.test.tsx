// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AddChip,
  CheckChip,
  ConditionEditor,
  type ConditionValue,
  DrawerEditor,
  DrawerRow,
  DrawerTabs,
  NumberFormatPicker,
  type Position,
  PositionPicker,
  SentenceChip,
  SortableRows,
  SortEditor,
  type SortKey,
  TilePicker,
  ToggleRow,
} from "../index.ts";

afterEach(cleanup);

describe("drawer editor", () => {
  test("a row opens its editor, Escape closes it, and focus returns to the row", async () => {
    render(<DrawerRow label="Source" value="Invoices" editor={<p>Pick a table</p>} />);
    const row = screen.getByRole("button", { name: /Source/ });
    row.focus();
    fireEvent.click(row);
    expect(await screen.findByText("Pick a table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close Source" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Pick a table")).toBeNull());
    expect(document.activeElement).toBe(row);
  });

  test("round 4: a field that opens holding a default text has it selected, so typing replaces it", async () => {
    render(
      <DrawerRow
        label="Title"
        value="Table"
        editor={<input aria-label="Name field" defaultValue="Table" />}
      />,
    );
    const select = vi.spyOn(HTMLInputElement.prototype, "select");
    fireEvent.click(screen.getByRole("button", { name: /Title/ }));
    const field = (await screen.findByLabelText("Name field")) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(field));
    // happy-dom keeps no selection range of its own, so the call is what is read.
    await waitFor(() => expect(select).toHaveBeenCalled());
    expect(select.mock.contexts[0]).toBe(field);
    select.mockRestore();
  });

  test("Done closes it and runs onDone", async () => {
    const onDone = vi.fn();
    render(
      <DrawerEditor trigger={<AddChip>Condition</AddChip>} title="Only include" onDone={onDone}>
        <p>body</p>
      </DrawerEditor>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Condition/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("body")).toBeNull());
  });

  test("a row with an action runs it", () => {
    const onClick = vi.fn();
    render(<DrawerRow label="Do" value="Open detail" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("tabs", () => {
  function Tabs() {
    const [value, setValue] = useState("data");
    return (
      <DrawerTabs
        idPrefix="t"
        value={value}
        onChange={setValue}
        tabs={[
          { id: "data", label: "Data", attention: "The table invoices no longer exists." },
          { id: "display", label: "Display", count: 3 },
          { id: "rules", label: "Rules" },
        ]}
      />
    );
  }
  test("arrow keys move and open, and what needs fixing is said, only where something does", () => {
    render(<Tabs />);
    const data = screen.getByRole("tab", { name: /Data/ });
    expect(data.textContent).toContain("needs fixing: The table invoices no longer exists.");
    expect(data.querySelector("[data-attention]")).toBeTruthy();
    // A tab with nothing to fix has no dot, whatever is set in it.
    expect(screen.getByRole("tab", { name: "Rules" }).querySelector("[data-attention]")).toBeNull();
    expect(
      screen.getByRole("tab", { name: /Display/ }).querySelector("[data-attention]"),
    ).toBeNull();
    data.focus();
    fireEvent.keyDown(data, { key: "ArrowRight" });
    const display = screen.getByRole("tab", { name: /Display/ });
    expect(display.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(display);
    fireEvent.keyDown(display, { key: "End" });
    expect(screen.getByRole("tab", { name: "Rules" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Data/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("chips and switches", () => {
  test("a check chip toggles", () => {
    const onChange = vi.fn();
    render(
      <CheckChip checked onChange={onChange}>
        Clinic
      </CheckChip>,
    );
    const chip = screen.getByRole("button", { name: "Clinic" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  test("a sentence chip edits and removes", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(
      <SentenceChip onEdit={onEdit} onRemove={onRemove} removeLabel="Remove Status is Unpaid">
        Status is <strong>Unpaid</strong>
      </SentenceChip>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Status is Unpaid" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Status is Unpaid" }));
    expect(onEdit).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalled();
  });

  test("a toggle row is a switch with its help", () => {
    const onChange = vi.fn();
    render(
      <ToggleRow label="Show values on bars" help="On each bar" checked onChange={onChange} />,
    );
    const one = screen.getByRole("switch", { name: "Show values on bars" });
    expect(one.getAttribute("aria-checked")).toBe("true");
    expect(one.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(one);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("tiles", () => {
  test("a disabled tile cannot be chosen and says why", () => {
    const onChange = vi.fn();
    render(
      <TilePicker
        label="Chart type"
        value="bar"
        onChange={onChange}
        options={[
          { value: "bar", label: "Bar" },
          { value: "line", label: "Line", disabled: true, reason: "needs a date" },
        ]}
      />,
    );
    const line = screen.getByRole("radio", { name: /Line/ }) as HTMLInputElement;
    expect(line.disabled).toBe(true);
    expect(screen.getByText("needs a date")).toBeTruthy();
    fireEvent.click(line);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("sortable rows", () => {
  const items = [
    { id: "a", label: "Number" },
    { id: "b", label: "Clinic" },
    { id: "c", label: "Total" },
  ];
  function Rows({ seen }: { seen: (ids: string[]) => void }) {
    const [list, setList] = useState(items);
    return (
      <SortableRows
        label="Columns"
        items={list}
        onReorder={(ids) => {
          seen(ids);
          setList(ids.map((id) => items.find((one) => one.id === id) as (typeof items)[number]));
        }}
      />
    );
  }
  const names = () => screen.getAllByRole("listitem").map((li) => li.textContent);

  test("Alt+Down and Alt+Up on the handle move a row and say so", () => {
    const seen = vi.fn();
    render(<Rows seen={seen} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Number/ }), {
      key: "ArrowDown",
      altKey: true,
    });
    expect(seen).toHaveBeenLastCalledWith(["b", "a", "c"]);
    expect(names()[1]).toContain("Number");
    expect(screen.getByRole("status").textContent).toBe("Moved Number to position 2 of 3");
    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Number/ }), {
      key: "ArrowUp",
      altKey: true,
    });
    expect(names()[0]).toContain("Number");
  });

  test("a row cannot move past the ends", () => {
    const seen = vi.fn();
    render(<Rows seen={seen} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Number/ }), {
      key: "ArrowUp",
      altKey: true,
    });
    expect(seen).not.toHaveBeenCalled();
  });

  test("the eye hides a column", () => {
    const onToggle = vi.fn();
    render(
      <SortableRows label="Columns" items={items} onReorder={() => {}} onToggleHidden={onToggle} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide Clinic" }));
    expect(onToggle).toHaveBeenCalledWith("b", true);
  });
});

describe("position picker", () => {
  function Picker({ on }: { on: (p: Position) => void }) {
    const [value, setValue] = useState<Position>("top-left");
    return (
      <PositionPicker
        value={value}
        onChange={(next) => {
          on(next);
          setValue(next);
        }}
      />
    );
  }
  test("arrows move over the grid, and places have names", () => {
    const on = vi.fn();
    render(<Picker on={on} />);
    const first = screen.getByRole("radio", { name: "Top left" });
    expect(first.getAttribute("aria-checked")).toBe("true");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(on).toHaveBeenLastCalledWith("top-center");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(on).toHaveBeenLastCalledWith("middle-center");
    expect(screen.getByRole("radio", { name: "Center" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(on).toHaveBeenLastCalledWith("bottom-center");
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    expect(on).toHaveBeenLastCalledWith("bottom-left");
  });
});

describe("number format picker", () => {
  test("each choice shows a real sample, and choosing writes the shape", () => {
    const onChange = vi.fn();
    render(
      <NumberFormatPicker value={{ style: "currency", currency: "USD" }} onChange={onChange} />,
    );
    for (const name of [
      "Money $43,120.00",
      "Money, whole $43,120",
      "Money, short $43.1k",
      "Number 43,120",
      "Percent 12.5%",
      "Plain 43120",
    ]) {
      expect(screen.getByRole("radio", { name })).toBeTruthy();
    }
    expect(
      (screen.getByRole("radio", { name: "Money $43,120.00" }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /^Money, whole/ }));
    expect(onChange).toHaveBeenLastCalledWith({ style: "currency", currency: "USD", decimals: 0 });
    fireEvent.click(screen.getByRole("radio", { name: /^Money, short/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      style: "currency",
      currency: "USD",
      notation: "compact",
    });
  });

  test("stored in cents says what it means, and keeps the choice", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NumberFormatPicker value={{ style: "currency" }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Stored in cents" }));
    expect(onChange).toHaveBeenLastCalledWith({ style: "currency", minorUnits: true });
    rerender(
      <NumberFormatPicker value={{ style: "currency", minorUnits: true }} onChange={onChange} />,
    );
    expect(screen.getByText("Total is kept as 4312000, shown as $43,120.00")).toBeTruthy();
    // Choosing another way to write it keeps the cents.
    fireEvent.click(screen.getByRole("radio", { name: "Number 43,120" }));
    expect(onChange).toHaveBeenLastCalledWith({ style: "number", minorUnits: true });
  });

  test("the currency is chosen from a list", () => {
    const onChange = vi.fn();
    render(<NumberFormatPicker value={{ style: "currency" }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "EUR" } });
    expect(onChange).toHaveBeenLastCalledWith({ style: "currency", currency: "EUR" });
  });
});

describe("condition editor", () => {
  const columns = [
    { id: "status", label: "Status", type: "choice" },
    { id: "issued", label: "Issued on", type: "date" },
    { id: "total", label: "Total", type: "number" },
  ];
  const operators = (type: string) =>
    type === "date"
      ? [
          { test: "within", label: "is in the last…" },
          { test: "lt", label: "is before" },
          { test: "is_empty", label: "is empty", input: "none" as const },
        ]
      : type === "choice"
        ? [
            { test: "is", label: "is" },
            { test: "is_not", label: "is not" },
          ]
        : [{ test: "gt", label: "is more than" }];
  const choices = (field: string) =>
    field === "status"
      ? [
          { value: "Paid", count: 1204 },
          { value: "Unpaid", count: 236 },
          { value: "Void", count: 18 },
        ]
      : undefined;

  function Editor({ seen }: { seen: (c: ConditionValue) => void }) {
    const [value, setValue] = useState<ConditionValue | undefined>({
      field: "status",
      test: "is_not",
    });
    return (
      <ConditionEditor
        columns={columns}
        operators={operators}
        choices={choices}
        value={value}
        onChange={(next) => {
          seen(next);
          setValue(next);
        }}
      />
    );
  }

  test("a choice column lists its values with counts and returns one or several", () => {
    const seen = vi.fn();
    render(<Editor seen={seen} />);
    expect(screen.getByText("1,204 rows")).toBeTruthy();
    expect(screen.getByText("18 rows")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Void/ }));
    expect(seen).toHaveBeenLastCalledWith({ field: "status", test: "is_not", value: "Void" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Unpaid/ }));
    expect(seen).toHaveBeenLastCalledWith({
      field: "status",
      test: "is_not",
      value: ["Void", "Unpaid"],
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Void/ }));
    expect(seen).toHaveBeenLastCalledWith({ field: "status", test: "is_not", value: "Unpaid" });
  });

  test("choosing a date column swaps the words, and one that takes no value hides the input", () => {
    const seen = vi.fn();
    render(<Editor seen={seen} />);
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "issued" } });
    expect(seen).toHaveBeenLastCalledWith({ field: "issued", test: "within" });
    expect(screen.getByRole("radio", { name: "is before" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "2026-01-01" } });
    expect(seen).toHaveBeenLastCalledWith({ field: "issued", test: "within", value: "2026-01-01" });
    fireEvent.click(screen.getByRole("radio", { name: "is empty" }));
    expect(seen).toHaveBeenLastCalledWith({ field: "issued", test: "is_empty" });
    expect(screen.queryByLabelText("Value")).toBeNull();
  });
});

describe("sort editor", () => {
  function Sort({ seen }: { seen: (s: SortKey[]) => void }) {
    const [sorts, setSorts] = useState<SortKey[]>([{ field: "issued", direction: "desc" }]);
    return (
      <SortEditor
        fields={[
          { id: "issued", label: "Issued on" },
          { id: "total", label: "Total", words: { desc: "Biggest", asc: "Smallest" } },
        ]}
        sorts={sorts}
        onChange={(next) => {
          seen(next);
          setSorts(next);
        }}
        limitOptions={[
          { value: undefined, label: "All rows" },
          { value: 10, label: "10 rows" },
        ]}
        onLimit={() => {}}
      />
    );
  }
  test("a direction, then by, and removing", () => {
    const seen = vi.fn();
    render(<Sort seen={seen} />);
    fireEvent.click(screen.getByRole("radio", { name: "Oldest" }));
    expect(seen).toHaveBeenLastCalledWith([{ field: "issued", direction: "asc" }]);
    fireEvent.click(screen.getByRole("button", { name: /Then by/ }));
    expect(seen).toHaveBeenLastCalledWith([
      { field: "issued", direction: "asc" },
      { field: "total", direction: "desc" },
    ]);
    expect(screen.getByRole("radio", { name: "Biggest" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove sort by Total" }));
    expect(seen).toHaveBeenLastCalledWith([{ field: "issued", direction: "asc" }]);
  });
});
