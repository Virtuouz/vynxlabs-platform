import type { Connector } from "./extensions.js";

export interface HttpConfig {
  baseUrl: string;
  /** Sent with every request. Not for credentials. */
  headers?: Record<string, string>;
  /** How the connection's credential is sent. */
  auth?:
    | { type: "bearer" }
    | { type: "header"; name: string }
    | { type: "basic"; username: string };
}

export interface HttpRequest {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  /** Sent as a JSON body. */
  json?: unknown;
  body?: string;
  /** Do not throw on a 4xx or 5xx status. */
  allowFailure?: boolean;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  text: string;
  /** The body parsed as JSON. Throws if it is not JSON. */
  json<T = unknown>(): T;
}

export interface HttpClient {
  request(path: string, options?: HttpRequest): Promise<HttpResponse>;
  get(path: string, options?: HttpRequest): Promise<HttpResponse>;
  post(path: string, json?: unknown, options?: HttpRequest): Promise<HttpResponse>;
}

/** An address without its query, fragment and credentials. What is not an address is kept as it is. */
function withoutQuery(address: string): string {
  try {
    const url = new URL(address);
    url.username = "";
    url.password = "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return address.split(/[?#]/)[0] ?? address;
  }
}

/** A request that came back with a 4xx or 5xx status. */
export class HttpError extends Error {
  readonly status: number;
  readonly response: HttpResponse;
  constructor(method: string, url: string, response: HttpResponse) {
    // The query is left out: an API key in it would be written into every log and alert.
    super(`${method} ${withoutQuery(url)} answered ${response.status}.`);
    this.name = "HttpError";
    this.status = response.status;
    this.response = response;
  }
}

/** The built-in connector for any HTTP API. */
export const httpConnector: Connector<HttpConfig, HttpClient> = {
  name: "http",
  configSchema: {
    type: "object",
    properties: {
      baseUrl: { type: "string", pattern: "^https?://", title: "Address" },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        title: "Headers sent with every request",
      },
      auth: {
        title: "How the credential is sent",
        oneOf: [
          {
            type: "object",
            title: "Authorization: Bearer",
            properties: { type: { const: "bearer" } },
            required: ["type"],
            additionalProperties: false,
          },
          {
            type: "object",
            title: "In a header of your choice",
            properties: {
              type: { const: "header" },
              name: { type: "string", minLength: 1, title: "Header name" },
            },
            required: ["type", "name"],
            additionalProperties: false,
          },
          {
            type: "object",
            title: "HTTP Basic",
            properties: {
              type: { const: "basic" },
              username: { type: "string", title: "User name" },
            },
            required: ["type", "username"],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ["baseUrl"],
    additionalProperties: false,
  },
  create(config, credential, signal) {
    const base = config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`;
    const authHeaders: Record<string, string> = {};
    if (config.auth && credential !== undefined) {
      if (config.auth.type === "bearer") authHeaders.authorization = `Bearer ${credential}`;
      else if (config.auth.type === "header") authHeaders[config.auth.name] = credential;
      else {
        authHeaders.authorization = `Basic ${Buffer.from(`${config.auth.username}:${credential}`).toString("base64")}`;
      }
    }

    const request = async (path: string, options: HttpRequest = {}): Promise<HttpResponse> => {
      // An empty path means the base URL exactly as given, which is what a chat webhook needs.
      const url = path === "" ? new URL(config.baseUrl) : new URL(path.replace(/^\/+/, ""), base);
      if (url.origin !== new URL(base).origin) {
        throw new Error(`A connection can only call its own base URL, not ${url.origin}.`);
      }
      for (const [name, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined) url.searchParams.set(name, String(value));
      }
      const method = (
        options.method ?? (options.json !== undefined || options.body ? "POST" : "GET")
      ).toUpperCase();
      const response = await fetch(url, {
        method,
        signal,
        headers: {
          ...config.headers,
          ...(options.json !== undefined ? { "content-type": "application/json" } : {}),
          ...options.headers,
          ...authHeaders,
        },
        ...(options.json !== undefined
          ? { body: JSON.stringify(options.json) }
          : options.body !== undefined
            ? { body: options.body }
            : {}),
      });
      const text = await response.text();
      const result: HttpResponse = {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers),
        text,
        json: <T>() => JSON.parse(text) as T,
      };
      if (!response.ok && !options.allowFailure)
        throw new HttpError(method, url.toString(), result);
      return result;
    };

    return {
      request,
      get: (path, options) => request(path, { ...options, method: "GET" }),
      post: (path, json, options) => request(path, { ...options, method: "POST", json }),
    };
  },
  /** Asks for the base URL. Any answer below 400 means it is reachable with this credential. */
  async test(config, credential, signal) {
    const response = await httpConnector
      .create(config, credential, signal)
      .get("", { allowFailure: true });
    if (!response.ok) {
      throw Object.assign(new Error(`${config.baseUrl} answered ${response.status}.`), {
        status: response.status,
      });
    }
    return { status: response.status };
  },
};
