import { afterEach, describe, expect, it } from "vitest";
import { challengeOf, challengeProblem, dns, zoneOf } from "./kernel/apps/challenge.js";
import type { Kernel } from "./kernel/kernel.js";

const kernel = { config: { authSecret: "s".repeat(32) } } as unknown as Kernel;
const real = dns.resolveTxt;
afterEach(() => {
  dns.resolveTxt = real;
});

/** A resolver that knows these names only, and records what it was asked. */
function resolver(known: Record<string, string>, asked: string[] = []) {
  dns.resolveTxt = async (name) => {
    asked.push(name);
    return name in known ? [[known[name] as string]] : [];
  };
  return asked;
}

describe("the zone of a name", () => {
  it("is the registrable domain, and the host is the name relative to it", () => {
    expect(zoneOf("fly.volvel.dev")).toBe("volvel.dev");
    expect(zoneOf("volvel.dev")).toBe("volvel.dev");
    expect(zoneOf("a.b.shop.co.uk")).toBe("shop.co.uk");
    expect(zoneOf("x.example.com.au")).toBe("example.com.au");
    expect(zoneOf("localhost")).toBe("localhost");
    const challenge = challengeOf(kernel, "t1", "fly.volvel.dev");
    expect(challenge).toMatchObject({
      name: "_vx-challenge.fly.volvel.dev",
      host: "_vx-challenge.fly",
      zone: "volvel.dev",
    });
    expect(challengeOf(kernel, "t1", "volvel.dev").host).toBe("_vx-challenge");
  });
});

describe("the problem of a check", () => {
  const name = "fly.volvel.dev";
  const { value } = challengeOf(kernel, "t1", name);

  it("is none when the record is at the right name, with one question asked", async () => {
    const asked = resolver({ "_vx-challenge.fly.volvel.dev": value });
    expect(await challengeProblem(kernel, "t1", name)).toEqual({ met: true, problem: null });
    expect(asked).toHaveLength(1);
  });

  it("says where a doubled name holds the record, and what to set the host to", async () => {
    const asked = resolver({ "_vx-challenge.fly.volvel.dev.volvel.dev": value });
    const result = await challengeProblem(kernel, "t1", name);
    expect(result.met).toBe(false);
    expect(result.problem).toBe(
      "Found the record at _vx-challenge.fly.volvel.dev.volvel.dev: your DNS provider added volvel.dev to the host. Set the host to _vx-challenge.fly.",
    );
    expect(asked.length).toBeLessThanOrEqual(3);
  });

  it("says the value differs, showing both", async () => {
    resolver({ "_vx-challenge.fly.volvel.dev": "vx-domain=other" });
    const result = await challengeProblem(kernel, "t1", name);
    expect(result.met).toBe(false);
    expect(result.problem).toContain("_vx-challenge.fly.volvel.dev");
    expect(result.problem).toContain("vx-domain=other");
    expect(result.problem).toContain(value);
    expect(result.problem).toMatch(/differs|different/);
  });

  it("says plainly that nothing was found, with the host to use", async () => {
    resolver({});
    const result = await challengeProblem(kernel, "t1", name);
    expect(result.met).toBe(false);
    expect(result.problem).toBe(
      `No TXT record _vx-challenge.fly.volvel.dev with the value ${value} was found. Most DNS providers want the host as _vx-challenge.fly.`,
    );
  });

  it("does not wait on a resolver that never answers", async () => {
    dns.resolveTxt = () => new Promise(() => {});
    const started = Date.now();
    const result = await challengeProblem(kernel, "t1", name, 50);
    expect(result.met).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
