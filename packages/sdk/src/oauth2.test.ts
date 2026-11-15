import { afterEach, describe, expect, test, vi } from "vitest";
import { oauth2Connector } from "./oauth2.js";

const config = {
  baseUrl: "https://sheets.example/v4",
  authorizeUrl: "https://accounts.example/auth",
  tokenUrl: "https://accounts.example/token",
  clientId: "client-1",
  testPath: "/me",
};

afterEach(() => vi.unstubAllGlobals());

describe("the oauth2 connector", () => {
  test("sends the access token it is handed as a bearer token, to its own API only", async () => {
    const calls: { url: string; authorization: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      calls.push({
        url: String(url),
        authorization: new Headers(init.headers).get("authorization"),
      });
      return new Response("{}", { status: 200 });
    });
    const client = oauth2Connector.create(config, "at-1", new AbortController().signal);
    await client.get("spreadsheets/1");
    expect(calls).toEqual([
      { url: "https://sheets.example/v4/spreadsheets/1", authorization: "Bearer at-1" },
    ]);
    // Not even to the provider it was authorized at.
    await expect(client.get("https://accounts.example/token")).rejects.toThrow(/own base URL/);
  });

  test("Test asks for its test path, and says the status of a refusal", async () => {
    let status = 200;
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      asked.push(String(url));
      return new Response("{}", { status });
    });
    const signal = new AbortController().signal;
    expect(await oauth2Connector.test?.(config, "at-1", signal)).toEqual({ status: 200 });
    expect(asked).toEqual(["https://sheets.example/v4/me"]);
    status = 401;
    await expect(oauth2Connector.test?.(config, "at-1", signal)).rejects.toMatchObject({
      status: 401,
      message: "https://sheets.example/v4/me answered 401.",
    });
    await expect(oauth2Connector.test?.(config, undefined, signal)).rejects.toThrow(
      /not been authorized/,
    );
  });
});
