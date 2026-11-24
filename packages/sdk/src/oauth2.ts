import type { Connector } from "./extensions.js";
import { type HttpClient, httpConnector } from "./http.js";

/**
 * An API reached with OAuth 2.0: a member authorizes it once in the console,
 * and the platform keeps the tokens and refreshes them. A worker is handed the
 * access token alone, never the refresh token or the client's secret.
 */
export interface OAuth2Config {
  /** Where the API is. Every request goes here, as with an http connection. */
  baseUrl: string;
  /** The provider's authorization endpoint, where a member is sent to agree. */
  authorizeUrl: string;
  /** The provider's token endpoint. Only the control plane calls it. */
  tokenUrl: string;
  clientId: string;
  scopes?: string[];
  /** Added to the authorization request, such as `{ access_type: "offline" }` for Google. */
  authorizeParams?: Record<string, string>;
  /** How the client authenticates to the token endpoint: in the body, or with HTTP Basic. */
  clientAuth?: "body" | "basic";
  /** Sent with every request. Not for credentials. */
  headers?: Record<string, string>;
  /** What Test asks for, below the base URL. The base URL itself when left out. */
  testPath?: string;
}

/** One line each: a form draws a field allowed 200 characters or more as a text box. */
const url = { type: "string", pattern: "^https?://" };

/**
 * The built-in OAuth 2.0 connector. Its client is an http client that sends
 * the access token as a bearer token. The credential stored with the
 * connection is the client's secret, which a worker never receives: what a
 * worker is given in its place is the current access token.
 */
export const oauth2Connector: Connector<OAuth2Config, HttpClient> = {
  name: "oauth2",
  configSchema: {
    type: "object",
    properties: {
      baseUrl: {
        ...url,
        title: "API address",
        description: "Where the API is. Every request goes under it, as with an `http` connection.",
      },
      authorizeUrl: {
        ...url,
        title: "Authorization address",
        description: "The provider's authorization endpoint, where a member is sent to agree.",
      },
      tokenUrl: {
        ...url,
        title: "Token address",
        description: "The provider's token endpoint. Only the control plane calls it.",
      },
      clientId: {
        type: "string",
        minLength: 1,
        maxLength: 150,
        title: "Client ID",
        description:
          "The client ID the provider gave. The client's secret is the connection's secret.",
      },
      scopes: {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 150 },
        maxItems: 50,
        title: "Scopes",
        description: "What the member is asked to agree to, in the provider's words.",
      },
      authorizeParams: {
        type: "object",
        additionalProperties: { type: "string", maxLength: 150 },
        title: "Extra authorization parameters",
        description:
          "Added to the authorization request, such as `access_type: offline` for Google.",
      },
      clientAuth: {
        enum: ["body", "basic"],
        title: "Client authentication",
        description:
          "How the client proves itself to the token endpoint: in the request body, or with HTTP Basic.",
      },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Sent with every request. Not for credentials.",
      },
      testPath: {
        type: "string",
        maxLength: 150,
        title: "What Test asks for",
        description:
          "What the Test button asks for, below the API address. The address itself when left out.",
      },
    },
    required: ["baseUrl", "authorizeUrl", "tokenUrl", "clientId"],
    additionalProperties: false,
  },
  create(config, accessToken, signal) {
    return httpConnector.create(
      {
        baseUrl: config.baseUrl,
        ...(config.headers ? { headers: config.headers } : {}),
        auth: { type: "bearer" },
      },
      accessToken,
      signal,
    );
  },
  /** Asks for `testPath`, with the access token. Any answer below 400 means it works. */
  async test(config, accessToken, signal) {
    if (accessToken === undefined) {
      throw new Error("The connection has not been authorized yet. Connect it in the console.");
    }
    const target = config.testPath ?? "";
    const response = await oauth2Connector
      .create(config, accessToken, signal)
      .get(target, { allowFailure: true });
    if (!response.ok) {
      throw Object.assign(
        new Error(
          `${config.baseUrl}${target ? `/${target.replace(/^\/+/, "")}` : ""} answered ${response.status}.`,
        ),
        { status: response.status },
      );
    }
    return { status: response.status };
  },
};
