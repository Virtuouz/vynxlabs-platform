import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { httpConnector } from "./http.js";

const seen: { server: string; headers: IncomingHttpHeaders }[] = [];
let first: Server;
let second: Server;
let firstUrl: string;
let secondUrl: string;

const listen = (server: Server) =>
  new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    );
  });

beforeAll(async () => {
  second = createServer((request, response) => {
    seen.push({ server: "second", headers: request.headers });
    response.end("there");
  });
  secondUrl = await listen(second);
  first = createServer((request, response) => {
    seen.push({ server: "first", headers: request.headers });
    if (request.url === "/away") {
      response.writeHead(302, { location: `${secondUrl}/landed` }).end();
    } else if (request.url === "/within") {
      response.writeHead(302, { location: "/final" }).end();
    } else {
      response.end("here");
    }
  });
  firstUrl = await listen(first);
});

afterAll(() => {
  first.close();
  second.close();
});

const signal = new AbortController().signal;
const client = (credential = "key-1") =>
  httpConnector.create(
    {
      baseUrl: firstUrl,
      headers: { "x-tenant": "acme" },
      auth: { type: "header", name: "x-api-key" },
    },
    credential,
    signal,
  );

test("a redirect to another origin sends neither the key nor the headers there, and says where", async () => {
  seen.length = 0;
  await expect(client().get("/away")).rejects.toThrow(
    new RegExp(`sent the request on to ${secondUrl}.*only calls its own address`),
  );
  expect(seen.map((one) => one.server)).toEqual(["first"]);
});

test("a redirect within the origin is followed with the key", async () => {
  seen.length = 0;
  const response = await client().get("/within");
  expect(response.text).toBe("here");
  expect(seen.map((one) => one.headers["x-api-key"])).toEqual(["key-1", "key-1"]);
});

test("the connection's authorization replaces a caller's of another case", async () => {
  seen.length = 0;
  const bearer = httpConnector.create(
    { baseUrl: firstUrl, auth: { type: "bearer" } },
    "tok",
    signal,
  );
  await bearer.get("/final", { headers: { Authorization: "Bearer other" } });
  expect(seen[0]?.headers.authorization).toBe("Bearer tok");
});
