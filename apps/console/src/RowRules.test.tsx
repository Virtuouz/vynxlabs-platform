// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { type Policy, policyText, RowRulesEditor, ruleText } from "./screens/RowRules.tsx";

afterEach(cleanup);

const columns = [
  { name: "number", type: "text" },
  { name: "team", type: "text" },
  { name: "assignee", type: "uuid" },
  { name: "paid", type: "boolean" },
  { name: "total", type: "integer" },
];

test("a policy and a rule are each said in words", () => {
  expect(policyText({ type: "open" })).toBe("Everyone with access");
  expect(policyText({ type: "owner", column: "owner_id" })).toBe(
    "Each person sees their own rows (owner_id)",
  );
  expect(policyText({ type: "rules", rules: [{ allow: "read", when: { everyone: true } }] })).toBe(
    "By 1 rule",
  );
  expect(ruleText({ allow: "read", when: { column: "team", in: "groups" } })).toBe(
    "People in the group named in team may read the row.",
  );
  expect(
    ruleText({ allow: "all", when: { column: "customer", equals: { attribute: "customer_id" } } }),
  ).toBe("People whose customer_id is in customer may read and change the row.");
  expect(ruleText({ allow: "write", when: { column: "assignee", is: "principal" } })).toBe(
    "The person named in assignee may read and change the row.",
  );
});

test("rules are built from choices, and nothing is saved until every rule is whole", async () => {
  const saved: Policy[] = [];
  render(
    <RowRulesEditor
      policy={{ type: "open" }}
      columns={columns}
      onSave={async (policy) => void saved.push(policy)}
    />,
  );
  fireEvent.change(screen.getByLabelText("Who sees rows"), { target: { value: "rules" } });
  // It starts with one rule that changes nothing: everyone reads.
  fireEvent.change(screen.getByLabelText("Who"), { target: { value: "groups" } });
  // A column that cannot hold a name or an ID is not offered.
  const offered = [...(screen.getByLabelText("Column") as HTMLSelectElement).options].map(
    (option) => option.value,
  );
  expect(offered).toEqual(["", "number", "team", "assignee"]);
  fireEvent.change(screen.getByLabelText("Column"), { target: { value: "team" } });

  fireEvent.click(screen.getByRole("button", { name: "Add a rule" }));
  fireEvent.change(screen.getAllByLabelText("Who")[1] as HTMLElement, {
    target: { value: "attribute" },
  });
  // An attribute rule with no attribute named cannot be saved.
  const save = screen.getByRole("button", { name: "Save who sees rows" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Attribute"), { target: { value: "customer_id" } });
  fireEvent.change(screen.getAllByLabelText("May")[1] as HTMLElement, { target: { value: "all" } });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toEqual({
    type: "rules",
    rules: [
      { allow: "read", when: { column: "team", in: "groups" } },
      { allow: "all", when: { column: "number", equals: { attribute: "customer_id" } } },
    ],
  });
  expect(screen.getByText("Saved. It applies from the next request.")).toBeTruthy();
});

test("an owner column may be text or uuid, and an existing policy is shown as it is", async () => {
  const onSave = vi.fn(async () => {});
  render(
    <RowRulesEditor
      policy={{ type: "owner", column: "assignee" }}
      columns={columns}
      onSave={onSave}
    />,
  );
  const owner = screen.getByLabelText(
    "The column that holds each row's owner",
  ) as HTMLSelectElement;
  expect(owner.value).toBe("assignee");
  expect([...owner.options].map((option) => option.value)).toEqual([
    "",
    "number",
    "team",
    "assignee",
  ]);
  fireEvent.change(owner, { target: { value: "team" } });
  fireEvent.click(screen.getByRole("button", { name: "Save who sees rows" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ type: "owner", column: "team" }));
});
