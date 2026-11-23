import { describe, expect, test } from "vitest";
import {
  isSecretKey,
  maskFor,
  REDACTED,
  redact,
  redactText,
  summarize,
} from "./kernel/execution/redact.js";

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

describe("masking values the run was given", () => {
  test("a known value is masked in any text, by value, in the forms it travels in", () => {
    const secret = "s3cr&t value/+=";
    const known = maskFor([secret]);
    expect(redactText(`plain ${secret} end`, known)).toBe(`plain ${REDACTED} end`);
    expect(redactText(`?key=${encodeURIComponent(secret)}&x=1`, known)).toBe(
      `?key=${REDACTED}&x=1`,
    );
    expect(redactText(Buffer.from(secret).toString("base64"), known)).toBe(REDACTED);
    expect(redactText(JSON.stringify({ k: 'a"b' }), maskFor(['a"b']))).toBe(`{"k":"${REDACTED}"}`);
    expect(redactText("Authorization: Bearer abcd1234efgh", maskFor(["Bearer abcd1234efgh"]))).toBe(
      `Authorization: ${REDACTED}`,
    );
    expect(redactText("here is abcd1234efgh", maskFor(["Bearer abcd1234efgh"]))).toBe(
      `here is ${REDACTED}`,
    );
  });

  test("a value that holds another is masked whole, and a multi-line one by its lines", () => {
    expect(redactText("tokentoken-long", maskFor(["token", "tokentoken-long"]))).toBe(REDACTED);
    const key = "-----BEGIN KEY-----\nMIIEvQIBADANBgkqhkiG9w0B\n-----END KEY-----";
    expect(redactText("failed: MIIEvQIBADANBgkqhkiG9w0B", maskFor([key]))).toBe(
      `failed: ${REDACTED}`,
    );
  });

  test("a short value is masked only as a whole word, so ordinary text is left readable", () => {
    const known = maskFor(["ab", "12"]);
    expect(redactText("about ab, table 12 and 123 and a12", known)).toBe(
      `about ${REDACTED}, table ${REDACTED} and 123 and a12`,
    );
    // The same value as a whole field is masked.
    expect(redact({ pin: "12", other: "ab" }, undefined, known)).toEqual({
      pin: REDACTED,
      other: REDACTED,
    });
  });

  test("an empty or missing value masks nothing", () => {
    expect(maskFor(["", undefined, null])).toEqual([]);
    expect(redactText("anything", maskFor([""]))).toBe("anything");
  });

  test("regex characters in a short value are taken literally", () => {
    expect(redactText("a.b and axb", maskFor(["a.b"]))).toBe(`${REDACTED} and axb`);
    expect(redactText("(x) and x", maskFor(["(x"]))).toBe(`${REDACTED}) and x`);
  });
});
