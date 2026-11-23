// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CasesEditor, problemsOf, ValuesEditor } from "./screens/FlowEditor.tsx";
import {
  FormDesigner,
  fieldName,
  grantsFor,
  NodeInputs,
  type PickableNode,
  quoted,
  unquoted,
  updateGrants,
  WebhookSettings,
  wholeOf,
} from "./screens/FlowSteps.tsx";

afterEach(cleanup);

const sendEmail: PickableNode = {
  path: "core/send-email",
  label: "Send email",
  category: "Core",
  description: "Sends a message through an SMTP connection.",
  takes: ["connection"],
  input: {
    properties: {
      connection: { type: "string", title: "Mail connection", "x-pick": "connection" },
      to: { title: "To" },
      subject: { type: "string", title: "Subject" },
      text: { type: "string", title: "Message" },
    },
    required: ["connection", "to", "subject"],
  },
};
const choices = {
  connection: [{ value: "mail/outbox", label: "mail/outbox" }],
  table: [],
  event: [],
};

test("plain text becomes an expression that gives it, and comes back as it was", () => {
  expect(quoted("mail/outbox")).toBe("'mail/outbox'");
  expect(unquoted(quoted("it's \\ here"))).toBe("it's \\ here");
  // An expression that is more than text is left alone.
  expect(unquoted("trigger.to")).toBeUndefined();
  expect(unquoted("'a' + 'b'")).toBeUndefined();
});

test("a step hands its script what was chosen in its fields, and only what the script takes", () => {
  expect(grantsFor(sendEmail, { connection: "'mail/outbox'", to: "trigger.to" })).toEqual({
    connections: ["mail/outbox"],
  });
  expect(grantsFor(sendEmail, { to: "trigger.to" })).toBeUndefined();
  expect(grantsFor({ ...sendEmail, takes: [] }, { connection: "'mail/outbox'" })).toBeUndefined();
});

test("a node's input is filled in field by field, and choosing a connection hands it over", () => {
  const changes: Record<string, unknown>[] = [];
  const node = { type: "script", script: "core/send-email", inputs: {} };
  const { rerender } = render(
    <NodeInputs node={node} spec={sendEmail} choices={choices} onChange={(c) => changes.push(c)} />,
  );
  expect(screen.getByText("Sends a message through an SMTP connection.")).toBeTruthy();
  expect(screen.getByLabelText("Message (optional)")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "'Hello'" } });
  expect(changes.at(-1)).toEqual({ inputs: { subject: "'Hello'" }, with: undefined });

  rerender(
    <NodeInputs
      node={{ ...node, inputs: { connection: "'mail/outbox'", subject: "'Hello'" } }}
      spec={sendEmail}
      choices={choices}
      onChange={(c) => changes.push(c)}
    />,
  );
  // Emptying a field takes it out of the input, and what is handed over follows the fields.
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "" } });
  expect(changes.at(-1)).toEqual({
    inputs: { connection: "'mail/outbox'" },
    with: { connections: ["mail/outbox"] },
  });
  // The whole input can be one expression instead.
  fireEvent.change(screen.getByLabelText("Its input"), { target: { value: "whole" } });
  expect(changes.at(-1)).toEqual({
    input: "{'connection': 'mail/outbox', 'subject': 'Hello'}",
    inputs: undefined,
  });
});

test("the editor says what a node still needs, and what a waiting webhook lacks", () => {
  const specs = new Map([[sendEmail.path, sendEmail]]);
  const start = { type: "trigger", trigger: { type: "webhook", respond: "flow" } };
  const mail = { type: "script", script: "core/send-email", inputs: { to: "trigger.to" } };
  expect(problemsOf({ start, mail }, [{ from: "start", to: "mail" }], specs)).toEqual([
    "start waits for the flow to answer. Add an Answer step.",
    "mail needs: Mail connection.",
    "mail needs: Subject.",
  ]);
  // One expression for the whole input is taken on trust.
  expect(
    problemsOf(
      {
        start: { type: "trigger", trigger: { type: "manual" } },
        mail: { type: "script", script: "core/send-email", input: "trigger" },
      },
      [{ from: "start", to: "mail" }],
      specs,
    ),
  ).toEqual([]);
  expect(
    problemsOf(
      {
        asked: {
          type: "trigger",
          trigger: {
            type: "form",
            title: "",
            fields: [
              { name: "a", label: "A", type: "text" },
              { name: "a", label: "", type: "select" },
            ],
          },
        },
      },
      [],
    ),
  ).toEqual([
    "asked needs a title for its form.",
    "asked needs a different name for each question, in lowercase letters.",
    "asked has a question with no text.",
    "asked has a list with nothing in it: .",
  ]);
});

test("a webhook's settings say how it is checked and who answers", () => {
  const seen: Record<string, unknown>[] = [];
  render(
    <WebhookSettings
      trigger={{ type: "webhook" }}
      sources={[]}
      secrets={[{ value: "SHOP_SIGNING", label: "SHOP_SIGNING" }]}
      onChange={(trigger) => seen.push(trigger as never)}
    />,
  );
  fireEvent.change(screen.getByLabelText("The request is answered"), { target: { value: "flow" } });
  expect(seen.at(-1)).toEqual({ type: "webhook", respond: "flow" });
  fireEvent.change(screen.getByLabelText("Each request is checked"), {
    target: { value: "verify" },
  });
  expect(seen.at(-1)).toEqual({
    type: "webhook",
    verify: { scheme: "hmac-sha256", header: "x-signature", secret: "" },
  });
  fireEvent.change(screen.getByLabelText("The flow is given"), { target: { value: "request" } });
  expect(seen.at(-1)).toEqual({ type: "webhook", input: "request" });
});

test("a form is designed question by question", () => {
  expect(fieldName("Your e-mail address", [])).toBe("your_e_mail_address");
  expect(fieldName("Name", ["name"])).toBe("name_2");
  expect(fieldName("Website", [])).toBe("website_2");
  expect(fieldName("???", [])).toBe("field");

  const seen: { fields: Record<string, unknown>[] }[] = [];
  const trigger = {
    type: "form" as const,
    title: "Tell us",
    fields: [{ name: "message", label: "Message", type: "textarea", required: true }],
  };
  render(<FormDesigner trigger={trigger} onChange={(next) => seen.push(next as never)} />);
  fireEvent.click(screen.getByRole("button", { name: "Add a question" }));
  expect(seen.at(-1)?.fields).toEqual([
    trigger.fields[0],
    { name: "question", label: "Question", type: "text" },
  ]);
  // A list is given something to choose from as soon as it is one.
  fireEvent.change(screen.getByLabelText("Answered with"), { target: { value: "select" } });
  expect(seen.at(-1)?.fields).toEqual([
    { name: "message", label: "Message", type: "select", required: true, options: ["One", "Two"] },
  ]);
  fireEvent.click(screen.getByLabelText("Must be answered"));
  expect(seen.at(-1)?.fields).toEqual([{ name: "message", label: "Message", type: "textarea" }]);
  // The last question cannot be taken away.
  expect(
    (screen.getByRole("button", { name: "Remove Message" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("editing one field keeps the grants written in code (FLW-05)", () => {
  const written = { connections: ["crm/main"], tables: ["orders"] };
  const node = { type: "script", script: "core/send-email", inputs: {}, with: written };
  const changes: Record<string, unknown>[] = [];
  render(
    <NodeInputs node={node} spec={sendEmail} choices={choices} onChange={(c) => changes.push(c)} />,
  );
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "'Hello'" } });
  expect(changes.at(-1)).toEqual({ inputs: { subject: "'Hello'" }, with: written });
});

test("choosing and clearing a connection adds and takes away only that grant (FLW-05)", () => {
  const written = { connections: ["crm/main"], tables: ["orders"] };
  const chosen = updateGrants(sendEmail, written, {}, { connection: "'mail/outbox'" });
  expect(chosen).toEqual({ connections: ["crm/main", "mail/outbox"], tables: ["orders"] });
  expect(updateGrants(sendEmail, chosen, { connection: "'mail/outbox'" }, {})).toEqual(written);
  expect(
    updateGrants(sendEmail, { connections: ["mail/outbox"] }, { connection: "'mail/outbox'" }, {}),
  ).toBeUndefined();
});

test("fields become the one expression that gives the same input (FLW-05)", () => {
  expect(wholeOf({})).toBe("{}");
  expect(wholeOf({ to: "trigger.to", subject: "'Hi'" })).toBe(
    "{'to': trigger.to, 'subject': 'Hi'}",
  );
});

test("typing a name another value has keeps both, and Add and Remove work (FLW-06)", () => {
  const saved: Record<string, string>[] = [];
  render(<ValuesEditor values={{ one: "1", two: "2" }} onChange={(v) => saved.push(v)} />);
  fireEvent.change(screen.getAllByLabelText("Name")[1] as HTMLElement, {
    target: { value: "one" },
  });
  expect(saved.at(-1)).toEqual({ one: "1" });
  expect(screen.getByText(/The name "one" is used twice/)).toBeTruthy();
  fireEvent.change(screen.getAllByLabelText("Name")[1] as HTMLElement, {
    target: { value: "three" },
  });
  expect(saved.at(-1)).toEqual({ one: "1", three: "2" });
  fireEvent.click(screen.getByText("Add a value"));
  expect(Object.keys(saved.at(-1) ?? {})).toHaveLength(3);
  fireEvent.click(screen.getAllByText("Remove value")[0] as HTMLElement);
  expect(saved.at(-1)).toEqual({ three: "2", value_3: "trigger" });
});

test("Add a header seeds a header name and an expression that gives text (FLW-06)", () => {
  const saved: Record<string, string>[] = [];
  render(
    <ValuesEditor
      headers
      legend="Headers"
      add="Add a header"
      values={{}}
      onChange={(v) => saved.push(v)}
    />,
  );
  fireEvent.click(screen.getByText("Add a header"));
  expect(saved.at(-1)).toEqual({ "x-header": "''" });
});

test("a case is renamed when Enter is pressed, not on each key, and a taken name is refused (FLW-08)", () => {
  const onChange = vi.fn();
  const cases = [
    { name: "a", when: "true" },
    { name: "ab", when: "true" },
  ];
  render(<CasesEditor cases={cases} onChange={onChange} />);
  const name = screen.getAllByLabelText("Name")[0] as HTMLInputElement;
  fireEvent.change(name, { target: { value: "b" } });
  fireEvent.change(name, { target: { value: "ab" } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.submit(name.closest("form") as HTMLFormElement);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText(/already used/)).toBeTruthy();
  fireEvent.change(name, { target: { value: "bc" } });
  fireEvent.submit(name.closest("form") as HTMLFormElement);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0]?.[1]).toEqual({ from: "a", to: "bc" });
});

test("WLK-15: a case called otherwise is refused for what it is, not as already used", () => {
  const onChange = vi.fn();
  render(<CasesEditor cases={[{ name: "a", when: "true" }]} onChange={onChange} />);
  const name = screen.getAllByLabelText("Name")[0] as HTMLInputElement;
  fireEvent.change(name, { target: { value: "otherwise" } });
  fireEvent.submit(name.closest("form") as HTMLFormElement);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText(/way out when no case holds/)).toBeTruthy();
  expect(screen.queryByText(/already used/)).toBeNull();
});
