import { ERROR_CODES } from "@volvel/manifest";
import type { Access } from "./kernel/http.js";

/**
 * What the API says about itself, in one place: its tags, its security schemes, how it answers
 * when something is wrong, and the policy it keeps for changes. The reference pages are drawn
 * from `/api/v1/openapi.json`, so what is written here is what they print.
 */

/** Every tag a route may carry, with what it groups. A route with another tag fails a test. */
export const API_TAGS = [
  { name: "health", description: "Whether the instance is alive and ready, for a load balancer." },
  {
    name: "instance",
    description: "The instance itself: its version, its settings, this description.",
  },
  { name: "identity", description: "Members, their sign-in, their sessions, API keys and groups." },
  {
    name: "sign-in",
    description: "Signing in and out of the console, served by the authentication library.",
  },
  {
    name: "single sign-on",
    description: "Identity providers for members: setting them up and signing in through them.",
  },
  {
    name: "SCIM",
    description: "SCIM 2.0, for an identity provider to keep members and groups in step.",
  },
  { name: "tenancy", description: "Tenants, their workspaces, and what needs attention in them." },
  { name: "permissions", description: "Roles, permissions and who holds them." },
  {
    name: "bindings",
    description: "Giving a role to someone at a tenant, a workspace or a resource.",
  },
  {
    name: "access",
    description:
      "A tenant's access as resources, released as one set, and operator access to a tenant.",
  },
  { name: "audit", description: "The record of who changed what." },
  {
    name: "resources",
    description: "The resources of a workspace, by path, and the kinds they come in.",
  },
  { name: "authoring", description: "Drafts, their history, and deploying them from the console." },
  { name: "deploys", description: "Bundles, deploying them, promoting them and rolling back." },
  {
    name: "git",
    description: "Connecting a workspace to a repository, pulling from it and pushing to it.",
  },
  { name: "runs", description: "Starting, reading and canceling runs of scripts." },
  { name: "flows", description: "Flows, their runs, their approvals and their steps." },
  { name: "events", description: "Publishing events and reading the ones published." },
  { name: "secrets", description: "Secrets of a workspace. Their values are never read back." },
  { name: "data", description: "Tables, their rows and the queries over them." },
  { name: "data sources", description: "Connections to databases that queries read from." },
  { name: "files", description: "Files stored in a workspace." },
  { name: "apps", description: "Apps, the interfaces they serve and their sign-in pages." },
  { name: "dashboards", description: "Dashboards and what their widgets show." },
  { name: "docs", description: "The documentation a workspace writes and serves." },
  {
    name: "end users",
    description: "The people who use a tenant's apps: their accounts and sign-in.",
  },
  { name: "branding", description: "How the console and a tenant's apps look." },
  { name: "domains", description: "Addresses that reach the instance, and apps served on them." },
  { name: "portability", description: "Exporting and importing a tenant, and its backups." },
  { name: "workers", description: "Workers that run a tenant's code, and what waits for them." },
  { name: "worker protocol", description: "What a worker calls to be given work. Not for people." },
  { name: "worker host", description: "What the instance's worker host calls. Not for people." },
  {
    name: "agents",
    description: "Service accounts' tools and the Model Context Protocol, for agents.",
  },
] as const;

export type ApiTag = (typeof API_TAGS)[number]["name"];

const TAG_NAMES: ReadonlySet<string> = new Set(API_TAGS.map((tag) => tag.name));
export const isApiTag = (name: string): name is ApiTag => TAG_NAMES.has(name);

/** How a change to this API is made, so that a program built on it can rely on it. */
export const API_POLICY =
  "Within `v1` the API only grows: a route, a field of an answer or an optional parameter may " +
  "be added, and nothing that exists changes its meaning or is taken away. A route, field or " +
  "parameter that is to be removed is marked `deprecated` here, and keeps working for at least " +
  "90 days after the release that says so.";

export const API_DESCRIPTION =
  "The one public API of the platform. Errors are RFC 9457 problem details " +
  "(application/problem+json) with a stable `code` and the `requestId`; every code is listed " +
  "under `x-error-codes`. Sign in through `/api/v1/auth/sign-in/email` for a session cookie, or " +
  "send `Authorization: Bearer <api key>`, where a key begins `vxk_`. Each route says what it " +
  "needs under `x-access`: a permission and where it is checked, that it is public, that it is " +
  "for anyone signed in, or what the route itself decides from what is asked for. " +
  API_POLICY;

export const SECURITY_SCHEMES = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "vxk_ API key",
    description:
      "An API key, made by a member for themselves or for a service account: `Authorization: Bearer vxk_...`. It acts as its owner, with the permissions its owner holds.",
  },
  cookieAuth: {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description:
      "The session cookie the console gets by signing in at `/api/v1/auth/sign-in/email`.",
  },
} as const;

/** What the API answers with for each class of failure, drawn from the one list of codes. */
const ERROR_RESPONSES = {
  "400": "The request is not valid. `errors` says which part, and nothing was changed.",
  "401": "Nobody is signed in, or the key is not one the instance knows.",
  "403":
    "The caller is known and may not do this. The detail says what is needed and who can give it.",
  "404": "What was asked for does not exist, or the caller may not know that it does.",
  "5XX": "The instance could not do it. The `requestId` finds the cause in its log.",
} as const;

const PROBLEM = { $ref: "#/components/schemas/Problem" };
const problemResponse = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: PROBLEM } },
});

/** Every code the API answers with, for a reference to print, from the one list. */
export const errorCodeList = () =>
  Object.entries(ERROR_CODES).map(([code, entry]) => ({
    code,
    status: entry.status,
    title: entry.title,
  }));

/** The words an operation's identifier is made of: `GET /tenants/{t}/rows/*` is `getTenantsByTRowsPath`. */
export function operationIdOf(method: string, path: string): string {
  const words = path
    .replace(/^\/api\/v1/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const parameter = /^\{(.+)\}$/.exec(segment)?.[1];
      const word = parameter === "*" ? "path" : parameter ? `by-${parameter}` : segment;
      return word
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join("");
    });
  return method.toLowerCase() + words.join("");
}

/** What a response with this status is called when its route did not say. */
function describeStatus(status: string, method: string): string {
  if (status === "204") return "Done. Nothing is returned.";
  if (status === "201") return "Made. The answer is the new thing.";
  if (status === "202") return "Accepted. It is done after this answer.";
  if (status.startsWith("2"))
    return method === "get" ? "What was asked for." : "Done. The answer says what is now true.";
  return "The answer.";
}

/** What the sign-in library's own routes are, for a reference. Written here because the library writes none. */
type Feature = "signUp" | "social" | "changeEmail" | "deleteUser";
interface LibraryRoute {
  summary: string;
  description: string;
  /** Present only where the instance's sign-in options switch the feature on. */
  feature?: Feature;
}
const SIGN_IN_ROUTES: Record<string, LibraryRoute> = {
  "POST /sign-in/email": {
    summary: "Sign in with an email address and a password",
    description:
      "Answers with the member and sets the session cookie. Held to the sign-in rate limit. A member whose sign-in is required to go through a single sign-on provider is refused.",
  },
  "POST /sign-out": {
    summary: "Sign out of this session",
    description: "Ends the session the cookie names and clears the cookie.",
  },
  "GET /get-session": {
    summary: "Read the session of the caller",
    description: "Answers with the session and its member, or null when nobody is signed in.",
  },
  "POST /get-session": {
    summary: "Read the session of the caller",
    description: "Answers with the session and its member, or null when nobody is signed in.",
  },
  "GET /list-sessions": {
    summary: "List the caller's sessions",
    description: "Every session of the signed-in member that has not ended.",
  },
  "POST /revoke-session": {
    summary: "End one of the caller's sessions",
    description: "Ends the session named by its token.",
  },
  "POST /revoke-sessions": {
    summary: "End all of the caller's sessions",
    description: "Ends every session of the signed-in member, this one included.",
  },
  "POST /revoke-other-sessions": {
    summary: "End the caller's other sessions",
    description: "Ends every session of the signed-in member except this one. It is audited.",
  },
  "POST /update-session": {
    summary: "Change the current session",
    description: "Updates fields the library keeps on the session.",
  },
  "POST /update-user": {
    summary: "Change the caller's own name or image",
    description:
      "A name a directory pushes through SCIM is owned by the directory, and a change here is refused.",
  },
  "POST /change-password": {
    summary: "Change the caller's password",
    description:
      "Needs the current password. It can end the member's other sessions. Held to the sign-in rate limit.",
  },
  "POST /request-password-reset": {
    summary: "Ask for a password reset by email",
    description:
      "Sends a link to the address if a member has it. The answer is the same either way.",
  },
  "POST /reset-password": {
    summary: "Set a new password with a reset token",
    description: "The token is the one in the emailed link.",
  },
  "GET /reset-password/{token}": {
    summary: "Open a password reset link",
    description: "Checks the token and sends the browser on to the reset screen.",
  },
  "POST /verify-password": {
    summary: "Check the caller's password",
    description: "Answers whether the password is the signed-in member's.",
  },
  "POST /send-verification-email": {
    summary: "Send the email that verifies an address",
    description: "Held to the sign-in rate limit.",
  },
  "GET /verify-email": {
    summary: "Verify an email address with the token from the email",
    description: "The token is in the address of the emailed link.",
  },
  "GET /list-accounts": {
    summary: "List the sign-in methods linked to the caller",
    description: "Every account of the signed-in member, such as its password.",
  },
  "GET /ok": {
    summary: "Check that the sign-in service answers",
    description: "Answers `{ ok: true }`.",
  },
  "GET /error": {
    summary: "The page a failed sign-in is sent to",
    description: "Shows the library's error for a failed sign-in.",
  },
  "GET /sso/finish": {
    summary: "Finish a sign-in through a single sign-on provider",
    description: "Where a provider sends the browser back to. It makes the session and redirects.",
  },
  "POST /sign-up/email": {
    summary: "Sign up with an email address and a password",
    description: "Members are made by an admin, so an instance keeps this off.",
    feature: "signUp",
  },
  "POST /sign-in/social": {
    summary: "Sign in with a social provider",
    description: "Starts the provider's sign-in.",
    feature: "social",
  },
  "GET /callback/{id}": {
    summary: "Where a social provider sends the browser back to",
    description: "Finishes a social sign-in.",
    feature: "social",
  },
  "POST /callback/{id}": {
    summary: "Where a social provider sends the browser back to",
    description: "Finishes a social sign-in.",
    feature: "social",
  },
  "POST /link-social": {
    summary: "Link a social provider to the caller",
    description: "Starts linking the provider's account.",
    feature: "social",
  },
  "POST /unlink-account": {
    summary: "Unlink a provider from the caller",
    description: "Removes a linked account.",
    feature: "social",
  },
  "POST /refresh-token": {
    summary: "Refresh a provider's access token",
    description: "For a linked social account.",
    feature: "social",
  },
  "POST /get-access-token": {
    summary: "Read a provider's access token",
    description: "For a linked social account.",
    feature: "social",
  },
  "GET /account-info": {
    summary: "Read a linked provider account's details",
    description: "For a linked social account.",
    feature: "social",
  },
  "POST /change-email": {
    summary: "Change the caller's email address",
    description: "Sends a confirmation to the new address.",
    feature: "changeEmail",
  },
  "POST /delete-user": {
    summary: "Delete the caller's own account",
    description: "Members are removed by an admin, so an instance keeps this off.",
    feature: "deleteUser",
  },
  "GET /delete-user/callback": {
    summary: "Confirm deleting the caller's own account",
    description: "Members are removed by an admin, so an instance keeps this off.",
    feature: "deleteUser",
  },
};

/** Which optional parts of the sign-in library the instance has on, read from its options. */
export type SignInFeatures = Record<Feature, boolean>;

interface Operation {
  tags?: string[];
  operationId?: string;
  description?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, { description?: string } & Record<string, unknown>>;
  security?: unknown;
  "x-access"?: Access;
  [key: string]: unknown;
}

const METHODS = new Set(["get", "put", "post", "delete", "patch", "options", "head"]);

/** The sentence a route's `x-access` gives, as part of what a reader is told it needs. */
export function accessSentence(access: Access): string {
  switch (access.kind) {
    case "public":
      return access.says ?? "Needs nothing: anyone may call it.";
    case "signed-in":
      return access.serviceAccounts
        ? "Needs a sign-in or an API key."
        : "Needs a signed-in member. A service account's key is refused.";
    case "custom":
      return access.says;
    case "worker":
      return "Needs a worker credential.";
    case "worker-host":
      return "Needs the instance's worker host token.";
    case "scim":
      return "Needs the SCIM token an identity provider was given.";
    case "permission": {
      const where =
        access.scope === "instance"
          ? "on the instance"
          : access.scope === "tenant"
            ? "in the tenant"
            : access.scope === "workspace"
              ? "in the workspace, or at the resource itself where the route names one"
              : "in the tenant, or on the instance for an operator";
      return `Needs \`${access.permission}\` ${where}.`;
    }
  }
}

/**
 * Brings what a route declares to the shape a reference is drawn from: an identifier for each
 * operation, what it needs written into its description, how it can fail, and a description
 * for each response. It reads only what the routes already say. The authentication library's
 * own routes, which declare no access, keep what the library wrote and share one tag.
 */
export function finish(
  description: {
    paths: Record<string, Record<string, unknown>>;
    components?: { schemas?: Record<string, unknown> } & Record<string, unknown>;
  },
  features?: SignInFeatures,
) {
  const used = new Set<string>();
  for (const [path, item] of Object.entries(description.paths)) {
    for (const [method, value] of Object.entries(item)) {
      if (!METHODS.has(method)) continue;
      const operation = value as Operation;
      const access = operation["x-access"];
      if (!access) {
        const known =
          SIGN_IN_ROUTES[`${method.toUpperCase()} ${path.replace(/^\/api\/v1\/auth/, "")}`];
        // A route of a feature the instance has off is not served, so it is not described.
        if (known?.feature && features && !features[known.feature]) {
          delete item[method];
          continue;
        }
        if (known) {
          operation.summary = known.summary;
          operation.description = known.description;
        }
        operation.tags = ["sign-in"];
        operation.operationId ??= operationIdOf(method, path);
        used.add(operation.operationId);
        continue;
      }
      const id = operationIdOf(method, path);
      used.add(id);
      operation.operationId = id;
      const needs = accessSentence(access);
      operation.description = operation.description
        ? `${operation.description}\n\n${needs}`
        : needs;
      operation.security = access.kind === "public" ? [] : [{ bearerAuth: [] }, { cookieAuth: [] }];
      operation.responses ??= {};
      const responses = operation.responses;
      for (const [status, response] of Object.entries(responses)) {
        if (!response.description || response.description === "Default Response") {
          response.description = describeStatus(status, method);
        }
      }
      const parameters = (operation.parameters ?? []) as { in?: string }[];
      const wanted: string[] = [];
      if (operation.requestBody !== undefined || parameters.some((p) => p.in !== "path")) {
        wanted.push("400");
      }
      if (access.kind !== "public") wanted.push("401", "403");
      if (parameters.some((p) => p.in === "path") || access.kind === "permission")
        wanted.push("404");
      wanted.push("5XX");
      for (const status of wanted) {
        responses[status] ??= problemResponse(
          ERROR_RESPONSES[status as keyof typeof ERROR_RESPONSES],
        );
      }
    }
  }
  // A path whose every route was left out is not described either.
  for (const [path, item] of Object.entries(description.paths)) {
    if (!Object.keys(item).some((method) => METHODS.has(method))) delete description.paths[path];
  }
}
