import type { FastifyBaseLogger } from "fastify";
import { describe, expect, test } from "vitest";
import { cleanEmail } from "./endusers.js";
import { Mailer } from "./mail.js";

// The control plane sends mail only to an address it stored: a member's, an end user's. Each is
// checked on its way in, so the long, odd address lists that slow the mail library's address
// reader down cannot reach it from a person who is not the operator. These tests show that, and
// show how long the library takes on such a list if one did arrive.

const quiet = { warn() {}, info() {} } as unknown as FastifyBaseLogger;

// Nothing listens here, so a send fails quickly once the library has read the addresses.
const mailer = new Mailer(
  { mail: { url: "smtp://127.0.0.1:9", from: "noreply@example.com" }, mailCaptureDir: undefined },
  quiet,
);

async function seconds(to: string): Promise<number> {
  const started = performance.now();
  await mailer.send({ to, subject: "s", text: "t" });
  return (performance.now() - started) / 1000;
}

// Shapes that make the address reader do work in proportion to the square of their length.
const shapes: Record<string, (length: number) => string> = {
  "a long list of names without a domain": (n) => "a,".repeat(n / 2),
  "a long run of groups": (n) => "a:".repeat(n / 2),
  "a long list of addresses": (n) => "a@b.c,".repeat(n / 6),
};

describe("an address that someone outside the operator chose, on its way to the mail library", () => {
  test("our own check refuses every shape of a long list (members, end users, sign-in providers)", () => {
    for (const make of Object.values(shapes)) {
      expect(() => cleanEmail(make(100_000))).toThrow("That is not an email address");
    }
  });

  test("the longest thing our check accepts is read in well under a second", async () => {
    // One @, no spaces, 320 characters at most: that is all a stored address can be.
    const longest = `${"a,".repeat(157)}@b.c`;
    expect(cleanEmail(longest)).toBe(longest);
    expect(await seconds(longest)).toBeLessThan(0.5);
  });

  test("the library reads a long list quickly (it was quadratic before the upgrade)", async () => {
    const times: string[] = [];
    let slowest = 0;
    for (const [name, make] of Object.entries(shapes)) {
      const took = await seconds(make(400_000));
      times.push(`${name}: ${took.toFixed(2)} s`);
      slowest = Math.max(slowest, took);
    }
    console.log(`400000 characters, to Mailer.send -> ${times.join("; ")}`);
    expect(slowest).toBeLessThan(1);
  }, 120_000);
});
