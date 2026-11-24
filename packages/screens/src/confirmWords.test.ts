import { describe, expect, test } from "vitest";
import { confirmWords, DEFAULT_CONFIRM_TITLE, nounOf } from "./confirmWords.ts";

const visit = {
  id: "a1",
  code: "C-1001",
  pet: "p1",
  starts_at: "2026-11-20T09:30:00.000Z",
  status: "booked",
};
const facts = {
  columns: [
    { name: "code", type: "text" },
    { name: "pet", type: "reference" },
    { name: "starts_at", type: "timestamp" },
    { name: "created_at", type: "timestamp" },
    { name: "status", type: "enum" },
  ],
  names: { pet: { p1: "Pepper" } },
};

describe("the words of a confirmation", () => {
  test("name the record and the action, not 'Are you sure?'", () => {
    const words = confirmWords({
      label: "Cancel",
      confirm: { title: DEFAULT_CONFIRM_TITLE },
      table: "appointments",
      row: visit,
      facts,
    });
    expect(words.title).toMatch(/^Cancel the appointment C-1001 of Pepper on Nov 20(, \d{4})?\?$/);
  });
  test("the day of a timestamp is the one the cell shows, in the reader's zone (P31)", () => {
    const was = process.env.TZ;
    process.env.TZ = "America/Chicago";
    try {
      const late = { ...visit, starts_at: "2026-12-04T00:20:00.000Z" };
      const words = confirmWords({ label: "Cancel", table: "appointments", row: late, facts });
      // 6:20 PM on Dec 3 in Chicago, as the table writes it.
      expect(words.title).toContain("on Dec 3");
      expect(words.title).not.toContain("Dec 4");
    } finally {
      if (was === undefined) Reflect.deleteProperty(process.env, "TZ");
      else process.env.TZ = was;
    }
  });
  test("the button that goes ahead says the action's own label; the other is Go back for Cancel", () => {
    const words = confirmWords({ label: "Cancel", table: "appointments", row: visit, facts });
    expect(words.button).toBe("Cancel");
    expect(words.dismiss).toBe("Go back");
  });
  test("for any other label the other button is Cancel and the going-ahead one says the label", () => {
    const words = confirmWords({ label: "Void", table: "invoices", row: { number: "INV-9" } });
    expect(words.button).toBe("Void");
    expect(words.dismiss).toBe("Cancel");
    expect(words.title).toBe("Void the invoice INV-9?");
  });
  test("a label of several words reads as a sentence", () => {
    expect(
      confirmWords({ label: "Mark paid", table: "invoices", row: { number: "INV-9" } }).title,
    ).toBe("Mark paid for the invoice INV-9?");
  });
  test("with no row it says 'this' and the noun", () => {
    expect(confirmWords({ label: "Cancel", table: "appointments" }).title).toBe(
      "Cancel this appointment?",
    );
  });
  test("what the author wrote wins, and a written button too", () => {
    const words = confirmWords({
      label: "Cancel",
      confirm: { title: "Really cancel?", text: "It cannot be undone.", button: "Yes, cancel" },
      table: "appointments",
    });
    expect(words).toMatchObject({
      title: "Really cancel?",
      text: "It cannot be undone.",
      button: "Yes, cancel",
      dismiss: "Go back",
    });
  });
  test("with no label at all the old words stand, with a plain Confirm", () => {
    expect(confirmWords({})).toMatchObject({
      title: DEFAULT_CONFIRM_TITLE,
      button: "Confirm",
      dismiss: "Cancel",
    });
  });
  test("a noun from a table's name", () => {
    expect(nounOf("clinic/appointments")).toBe("appointment");
    expect(nounOf("categories")).toBe("category");
    expect(nounOf(undefined)).toBe("record");
  });
});

describe("several records", () => {
  test("say how many, and do not name the first", () => {
    const words = confirmWords({
      label: "Remove",
      table: "invoices",
      row: { number: "INV-1" },
      count: 2,
    });
    expect(words.title).toBe("Remove 2 invoices?");
    expect(confirmWords({ label: "Mark paid", table: "categories", count: 3 }).title).toBe(
      "Mark paid for 3 categories?",
    );
  });
});
