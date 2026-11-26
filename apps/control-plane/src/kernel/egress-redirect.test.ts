import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { configureEgress, guardedFetch } from "./egress.js";

describe("credentials on a redirect", () => {
  const seen: Record<string, Record<string, string | string[] | undefined>> = {};
  let other: Server;
  let otherPort: number;
  let first: Server;
  let firstPort: number;

  beforeAll(async () => {
    other = createServer((request, response) => {
      seen[request.url ?? ""] = request.headers;
      response.end("ok");
    });
    await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
    otherPort = (other.address() as AddressInfo).port;
    first = createServer((request, response) => {
      if (request.url === "/same") {
        response.writeHead(302, { location: "/same-landing" });
        return response.end();
      }
      if (request.url === "/same-landing") {
        seen["/same-landing"] = request.headers;
        return response.end("ok");
      }
      response.writeHead(307, { location: `http://127.0.0.1:${otherPort}/elsewhere` });
      response.end();
    });
    await new Promise<void>((resolve) => first.listen(0, "127.0.0.1", resolve));
    firstPort = (first.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise((resolve) => other.close(resolve));
    await new Promise((resolve) => first.close(resolve));
  });

  const headers = {
    authorization: "Basic c2VjcmV0",
    cookie: "sid=1",
    "x-api-key": "k",
    "x-custom-token": "t",
    accept: "text/plain",
  };

  test("a redirect to another origin does not carry the credentials, and keeps the rest", async () => {
    configureEgress({ networks: ["127.0.0.0/8"], hosts: [] });
    await guardedFetch(`http://127.0.0.1:${firstPort}/start`, {
      method: "POST",
      headers,
      body: "x",
    });
    const got = seen["/elsewhere"];
    expect(got?.authorization).toBeUndefined();
    expect(got?.cookie).toBeUndefined();
    expect(got?.["x-api-key"]).toBeUndefined();
    expect(got?.["x-custom-token"]).toBeUndefined();
    expect(got?.accept).toBe("text/plain");
  });

  test("a redirect inside the same origin keeps them", async () => {
    configureEgress({ networks: ["127.0.0.0/8"], hosts: [] });
    await guardedFetch(`http://127.0.0.1:${firstPort}/same`, { headers });
    expect(seen["/same-landing"]?.authorization).toBe("Basic c2VjcmV0");
    expect(seen["/same-landing"]?.["x-api-key"]).toBe("k");
  });
});
