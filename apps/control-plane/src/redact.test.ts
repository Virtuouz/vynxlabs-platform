import { describe, expect, test } from "vitest";
import { isSecretKey, REDACTED, redact, summarize } from "./kernel/execution/redact.js";

describe("masking secret-looking values", () => {
  test("keys that name a secret are masked, at any depth, and others are kept", () => {
    expect(
      redact({
        user: "ada",
        password: "hunter2",
        nested: { apiKey: "k", items: [{ github_token: "t", name: "x" }] },
        empty: { secret: "" },
      }),
    ).toEqual({
      user: "ada",
      password: REDACTED,
      nested: { apiKey: REDACTED, items: [{ github_token: REDACTED, name: "x" }] },
      empty: { secret: "" },
    });
    expect(isSecretKey("Authorization")).toBe(true);
    expect(isSecretKey("tokenizer")).toBe(false);
    expect(isSecretKey("tokens_used")).toBe(false);
  });

  test("a schema can mark any field secret", () => {
    const schema = {
      type: "object",
      properties: {
        pin: { type: "string", format: "password" },
        card: { type: "string", writeOnly: true },
        list: {
          type: "array",
          items: { type: "object", properties: { iban: { "x-secret": true } } },
        },
      },
    };
    expect(redact({ pin: "1234", card: "4111", list: [{ iban: "DE00" }], ok: 1 }, schema)).toEqual({
      pin: REDACTED,
      card: REDACTED,
      list: [{ iban: REDACTED }],
      ok: 1,
    });
  });

  test("a stored payload's pointer is left as it is", () => {
    expect(redact({ stored: "payloads/r1/output" })).toEqual({ stored: "payloads/r1/output" });
  });

  test("a summary is one short masked line", () => {
    expect(summarize({ ok: true, token: "abc" })).toBe(`{"ok":true,"token":"${REDACTED}"}`);
    expect(summarize(null)).toBeNull();
    const long = summarize({ text: "x".repeat(500) });
    expect(long?.length).toBe(200);
    expect(long?.endsWith("…")).toBe(true);
  });
});
