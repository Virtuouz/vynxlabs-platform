// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { problemsOf } from "./screens/FlowEditor.tsx";
import {
  FormDesigner,
  fieldName,
  grantsFor,
  NodeInputs,
  type PickableNode,
  quoted,
  unquoted,
  WebhookSettings,
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
  expect(changes.at(-1)).toEqual({ input: "{}", inputs: undefined });
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
