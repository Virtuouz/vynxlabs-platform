import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  addressAllowed,
  checkHost,
  configureEgress,
  EgressRefused,
  guardedFetch,
  parseEgressAllow,
} from "./egress.js";

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/to-metadata") {
      response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      return response.end();
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => configureEgress({ networks: [], hosts: [] }));

describe("which addresses the instance reaches for a tenant", () => {
  test("internal, metadata and reserved addresses are refused; public ones are not", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.5",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
      "64:ff9b::a9fe:a9fe".replace("a9fe:a9fe", "169.254.169.254"),
    ]) {
      expect(addressAllowed("example", address), address).toBe(false);
    }
    for (const address of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(addressAllowed("example", address), address).toBe(true);
    }
  });

  test("other forms an internal address can take in IPv6 are refused too (HOST-18)", () => {
    for (const address of [
      "64:ff9b::a00:1", // NAT64 of 10.0.0.1, as a resolver answers it
      "64:ff9b::7f00:1",
      "64:ff9b:1::a00:1",
      "2002:a00:1::", // 6to4 of 10.0.0.1
      "2002:808:808::1", // 6to4 of a public address: still refused as a network
      "2001::1", // Teredo
      "fec0::1", // site-local
      "::ffff:a00:1", // mapped 10.0.0.1, in hex
      "::ffff:a9fe:a9fe",
      "0:0:0:0:0:ffff:7f00:1",
    ]) {
      expect(addressAllowed("example", address), address).toBe(false);
    }
    // An operator who allows the IPv4 network allows it in the mapped form.
    configureEgress({ networks: ["10.0.0.0/8"], hosts: [] });
    expect(addressAllowed("x", "::ffff:a00:1")).toBe(true);
    expect(addressAllowed("x", "64:ff9b::a00:1")).toBe(true);
  });

  test("the operator can allow a network or a name", () => {
    configureEgress({ networks: ["10.0.0.0/8"], hosts: ["git.internal"] });
    expect(addressAllowed("anything", "10.9.9.9")).toBe(true);
    expect(addressAllowed("git.internal", "192.168.0.4")).toBe(true);
    expect(addressAllowed("anything", "192.168.0.4")).toBe(false);
  });

  test("EGRESS_ALLOW is read as networks and names, and anything else is refused", () => {
    expect(parseEgressAllow("10.0.0.0/8, git.internal ,::1")).toEqual({
      networks: ["10.0.0.0/8", "::1/128"],
      hosts: ["git.internal"],
    });
    expect(parseEgressAllow("10.0.0.0/40")).toMatch(/not a network/);
    expect(parseEgressAllow("http://x")).toMatch(/neither a network nor a host name/);
  });
});

describe("guarded requests", () => {
  test("a request to an internal address is refused, by address or by name, before it is sent", async () => {
    await expect(guardedFetch(`http://127.0.0.1:${port}/ok`)).rejects.toThrow(EgressRefused);
    await expect(guardedFetch(`http://localhost:${port}/ok`)).rejects.toThrow(
      /localhost is at .*a private or internal address/,
    );
    await expect(checkHost("169.254.169.254")).rejects.toThrow(EgressRefused);
    await expect(checkHost("localhost")).rejects.toThrow(EgressRefused);
  });

  test("allowed, it goes through; a redirect to an internal address is still refused", async () => {
    configureEgress({ networks: ["127.0.0.1/32"], hosts: [] });
    expect(await (await guardedFetch(`http://127.0.0.1:${port}/ok`)).text()).toBe("ok");
    await expect(guardedFetch(`http://127.0.0.1:${port}/to-metadata`)).rejects.toThrow(
      /169\.254\.169\.254 is a private or internal address/,
    );
  });

  test("only http and https", async () => {
    await expect(guardedFetch("file:///etc/passwd")).rejects.toThrow(/Only http and https/);
  });
});
