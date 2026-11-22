// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RecordData, RowsData, WidgetViewProps } from "@volvel/widgets";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DetailView } from "../../widgets-core/views/detail.tsx";
import { FormView } from "../../widgets-core/views/form.tsx";
import { PhoneRows, TableView } from "../../widgets-core/views/table.tsx";

afterEach(cleanup);

// A column whose table says it holds cents, and says nothing else of how it is written.
const total = {
  name: "total",
  type: "integer",
  label: "Total",
  description: "What is owed, in cents.",
};
const number = { name: "number", type: "text", label: "Number" };
const columns = [number, total];

const size = { w: 12, h: 8, narrow: false };

describe("money known from the table, in the table, list and detail", () => {
  const data: RowsData = {
    shape: "rows",
    columns,
    rows: [{ id: "1", number: "INV-1", total: 6500 }],
  };
  test("a table with no format of its own draws cents as money", () => {
    render(
      <TableView
        config={{}}
        data={{ rows: data }}
        size={size}
        emit={() => {}}
        building={false}
      />,
    );
    expect(screen.getByText("$65.00")).toBeTruthy();
    expect(screen.queryByText("6,500")).toBeNull();
  });
  test("a total at the bottom is money too, and the widget's own format still wins", () => {
    render(
      <TableView
        config={{ columns: [{ column: "total", total: true }] }}
        data={{ rows: data }}
        size={size}
        emit={() => {}}
        building={false}
      />,
    );
    expect(screen.getAllByText("$65.00")).toHaveLength(2);
    cleanup();
    render(
      <TableView
        config={{ columns: [{ column: "total", format: { style: "number" } }] }}
        data={{ rows: data }}
        size={size}
        emit={() => {}}
        building={false}
      />,
    );
    expect(screen.getByText("6,500")).toBeTruthy();
  });
  test("the table on a phone draws the same", () => {
    render(<PhoneRows data={data} specs={undefined} onRow={() => {}} />);
    expect(screen.getByText("$65.00")).toBeTruthy();
  });
  test("the detail draws it once, divided once", () => {
    const record: RecordData = { shape: "record", columns, record: data.rows[0] ?? null };
    render(
      <DetailView
        config={{ heading: "number" }}
        data={{ record }}
        size={size}
        emit={() => {}}
        building={false}
      />,
    );
    expect(screen.getAllByText("$65.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$0.65")).toBeNull();
  });
});

describe("money in the form", () => {
  const draw = (record: Record<string, unknown> | null = null) => {
    const act = vi.fn(async () => ({ ok: true as const }));
    const data: RecordData = { shape: "record", columns, record: record ?? {} };
    const props = {
      config: {
        mode: record ? "edit" : "create",
        // No format on the field: the table's words are what say it is money.
        fields: [{ column: "number" }, { column: "total" }],
        submitLabel: "Save it",
      },
      data: { record: data },
      size,
      emit: () => {},
      building: false,
      act,
    } as unknown as WidgetViewProps<never>;
    render(<FormView {...props} />);
    return act;
  };
  const type = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  test("takes 123.45 and keeps 12345 cents, and says the currency instead of 'in cents'", async () => {
    const act = draw();
    expect(screen.queryByText(/in cents/i)).toBeNull();
    expect(screen.getByText("USD")).toBeTruthy();
    type(/Number/, "INV-2");
    type(/Total/, "123.45");
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect((act.mock.calls[0] as unknown[])[1]).toMatchObject({
      inputs: { number: "INV-2", total: 12345 },
    });
  });

  test("no float error: 1.15 is 115 and 19.99 is 1999", async () => {
    const act = draw();
    type(/Number/, "INV-3");
    type(/Total/, "1.15");
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect((act.mock.calls[0] as unknown[])[1]).toMatchObject({ inputs: { total: 115 } });
  });

  test("refuses more than two decimals, in words, and sends nothing", async () => {
    const act = draw();
    type(/Number/, "INV-4");
    type(/Total/, "12.345");
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    expect(await screen.findByText(/at most two decimal places/i)).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
  });

  test("an invoice opens with its amount written as money, and is saved back as cents", async () => {
    const act = draw({ id: "1", number: "INV-1", total: 6500 });
    expect((screen.getByLabelText(/Total/) as HTMLInputElement).value).toBe("65.00");
    type(/Total/, "70.5");
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect((act.mock.calls[0] as unknown[])[1]).toMatchObject({
      record: "1",
      inputs: { total: 7050 },
    });
  });
});

describe("money edited in place in a detail", () => {
  test("takes 123.45 and saves 12345", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    const record: RecordData = { shape: "record", columns, record: { id: "1", number: "INV-1", total: 6500 } };
    render(
      <DetailView
        config={{ heading: "number", edit: true }}
        data={{ record }}
        size={size}
        emit={() => {}}
        building={false}
        act={act}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Total" }));
    const box = screen.getByLabelText("Total") as HTMLInputElement;
    expect(box.value).toBe("65.00");
    fireEvent.change(box, { target: { value: "123.45" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect((act.mock.calls[0] as unknown[])[1]).toEqual({
      record: "1",
      inputs: { total: 12345 },
    });
  });
  test("refuses more than two decimals and saves nothing", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    const record: RecordData = { shape: "record", columns, record: { id: "1", number: "INV-1", total: 6500 } };
    render(
      <DetailView
        config={{ heading: "number", edit: true }}
        data={{ record }}
        size={size}
        emit={() => {}}
        building={false}
        act={act}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Total" }));
    const box = screen.getByLabelText("Total") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "1.234" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
  });
});
