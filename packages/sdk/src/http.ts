import type { Connector } from "./extensions.js";

/** The configuration of an `http` connection: its address, the headers sent with every request and how the credential is sent. */
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

/** What a request of an `HttpClient` may say beside its path: the method, headers, a query and a body. */
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

/** What an `HttpClient` gets back: the status, the headers, the body as text and a way to read it as JSON. */
export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  text: string;
  /** The body parsed as JSON. Throws if it is not JSON. */
  json<T = unknown>(): T;
}

/** What a script is given for an `http` or `oauth2` connection: requests to the connection's own address. */
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
/** How many redirects of one request are followed. */
const MAX_REDIRECTS = 5;

/** The built-in connector for any HTTP API. */
export const httpConnector: Connector<HttpConfig, HttpClient> = {
  name: "http",
  configSchema: {
    type: "object",
    properties: {
      baseUrl: {
        type: "string",
        pattern: "^https?://",
        title: "Address",
        description:
          "Where the API is. Every request goes under it, and a script cannot call any other address through the connection.",
      },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        title: "Headers sent with every request",
        description:
          "Sent with every request. Not for credentials: the connection's secret has its own place.",
      },
      auth: {
        title: "How the credential is sent",
        description:
          "How the connection's secret goes to the API. Left out, no credential is sent.",
        oneOf: [
          {
            type: "object",
            title: "Authorization: Bearer",
            properties: {
              type: {
                const: "bearer",
                description: "Sends the secret as `Authorization: Bearer <secret>`.",
              },
            },
            required: ["type"],
            additionalProperties: false,
          },
          {
            type: "object",
            title: "In a header of your choice",
            properties: {
              type: {
                const: "header",
                description: "Sends the secret in a header of your choice.",
              },
              name: {
                type: "string",
                minLength: 1,
                title: "Header name",
                description: "The header that carries the secret, such as `x-api-key`.",
              },
            },
            required: ["type", "name"],
            additionalProperties: false,
          },
          {
            type: "object",
            title: "HTTP Basic",
            properties: {
              type: {
                const: "basic",
                description: "Sends the user name and the secret as HTTP Basic credentials.",
              },
              username: {
                type: "string",
                title: "User name",
                description: "The user to sign in as. The secret is its password.",
              },
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
      // Names are compared without case: the connection's own header replaces a caller's of the same name.
      const sent = new Map<string, [string, string]>();
      const put = (headers: Record<string, string> | undefined) => {
        for (const [name, value] of Object.entries(headers ?? {})) {
          sent.set(name.toLowerCase(), [name, value]);
        }
      };
      put(config.headers);
      if (options.json !== undefined) put({ "content-type": "application/json" });
      put(options.headers);
      put(authHeaders);
      const headers = Object.fromEntries(sent.values());
      const payload =
        options.json !== undefined
          ? JSON.stringify(options.json)
          : options.body !== undefined
            ? options.body
            : undefined;
      // Redirects are followed by hand: the key and the headers go only where the connection points.
      const own = new URL(base).origin;
      let target = url;
      let response = await fetch(target, {
        method,
        signal,
        headers,
        redirect: "manual",
        ...(payload !== undefined ? { body: payload } : {}),
      });
      for (let hops = 0; response.status >= 300 && response.status < 400; hops++) {
        const location = response.headers.get("location");
        if (!location) break;
        const next = new URL(location, target);
        if (next.origin !== own) {
          throw new Error(
            `${own} sent the request on to ${next.origin}. A connection only calls its own address, so the request was not sent there. Change the connection's address if that is where it should go.`,
          );
        }
        if (hops >= MAX_REDIRECTS) {
          throw new Error(`${own} sent the request on more than ${MAX_REDIRECTS} times.`);
        }
        // As a browser does: a POST answered with 301, 302 or 303 is asked again as a GET.
        const again =
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) && method === "POST");
        await response.body?.cancel();
        target = next;
        response = await fetch(target, {
          method: again ? "GET" : method,
          signal,
          headers,
          redirect: "manual",
          ...(!again && payload !== undefined ? { body: payload } : {}),
        });
      }
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
  /**
   * Asks for the base URL. An answer means the service was reached, whatever the status: many
   * services answer nothing at their base while every path works. Only a refusal of the
   * credentials (401, 403, 407) fails, with its status.
   */
  async test(config, credential, signal) {
    const response = await httpConnector
      .create(config, credential, signal)
      .get("", { allowFailure: true });
    if (response.status === 401 || response.status === 403 || response.status === 407) {
      throw Object.assign(new Error(`${config.baseUrl} answered ${response.status}.`), {
        status: response.status,
      });
    }
    return {
      status: response.status,
      ...(response.ok
        ? {}
        : { message: `The base address answered ${response.status}. The service was reached.` }),
    };
  },
};
