import type { Asserted } from "./people.js";
import type { ClaimNames } from "./providers.js";

/** A claim by name. A name with dots reaches into nested claims when no claim has the whole name. */
export function claim(claims: Record<string, unknown>, name: string): unknown {
  if (Object.hasOwn(claims, name)) return claims[name];
  let value: unknown = claims;
  for (const part of name.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, part)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

const text = (value: unknown): string | undefined => {
  const one = Array.isArray(value) ? value[0] : value;
  if (typeof one === "string") return one.trim() === "" ? undefined : one.trim();
  if (typeof one === "number" || typeof one === "boolean") return String(one);
  return undefined;
};

const list = (value: unknown): string[] => {
  const all = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return [
    ...new Set(
      all
        .filter((one) => typeof one === "string" || typeof one === "number")
        .map((one) => String(one).trim())
        .filter((one) => one !== "" && one.length <= 500),
    ),
  ].slice(0, 1000);
};

const first = (claims: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    const value = text(claim(claims, name));
    if (value !== undefined) return value;
  }
  return undefined;
};

/** Reads a person out of claims, by the names a provider was set up with or the usual ones. */
export function readClaims(
  claims: Record<string, unknown>,
  names: ClaimNames,
  attributes: Record<string, string>,
  usual: { subject: string[]; email: string[]; name: string[]; groups: string[] },
): Omit<Asserted, "emailVerified" | "subject"> & { subject: string | undefined } {
  const groupsFrom = names.groups ? [names.groups] : usual.groups;
  return {
    subject: first(claims, names.subject ? [names.subject] : usual.subject),
    email: first(claims, names.email ? [names.email] : usual.email),
    name: first(claims, names.name ? [names.name] : usual.name),
    groups: list(groupsFrom.map((name) => claim(claims, name)).find((value) => value != null)),
    attributes: Object.fromEntries(
      Object.entries(attributes)
        .map(([name, from]) => [name, text(claim(claims, from))] as const)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([name, value]) => [name, value.slice(0, 500)]),
    ),
  };
}

/** What a provider sent, cut down to something that can be kept and shown. */
export function summarize(claims: Record<string, unknown>): Record<string, unknown> {
  const short = (value: unknown): unknown => {
    if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
    if (Array.isArray(value)) return value.slice(0, 50).map(short);
    if (value !== null && typeof value === "object") return "(an object)";
    return value;
  };
  return Object.fromEntries(
    Object.entries(claims)
      .filter(([name]) => !["nonce", "at_hash", "c_hash", "s_hash", "sid", "jti"].includes(name))
      .slice(0, 60)
      .map(([name, value]) => [name.slice(0, 200), short(value)]),
  );
}
