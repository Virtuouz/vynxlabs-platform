/**
 * Masks values that look secret wherever a run's payload is shown: its input and
 * output, a flow's, a step's, and the short summary in run lists. What is stored is
 * never changed; scripts and server-side re-runs use the real values.
 *
 * A value is masked when its schema property is marked `writeOnly`, `format:
 * "password"` or `x-secret`, or when its key names a secret, whatever the schema.
 */

export const REDACTED = "[redacted]";

const SECRET_KEY =
  /^(password|passwd|secret|token|api[-_]?key|authorization|cookie|private[-_]?key|client[-_]?secret|access[-_]?token|refresh[-_]?token)$/i;
/** Keys ending this way are secret too: `dbPassword`, `github_token`, `stripeApiKey`. */
const SECRET_SUFFIX = /(password|secret|token|api[-_]?key|private[-_]?key)$/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key) || SECRET_SUFFIX.test(key);
}

type Schema = Record<string, unknown> | undefined;

/**
 * Values the run was given (secrets, credentials), masked wherever they turn up in a text,
 * whatever key they sit under. Built by `maskFor`.
 */
export type Known = readonly string[];

/** Below this many characters a value is masked only as a whole word: a 2-character secret would wreck every text. */
const SHORT_VALUE = 4;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The strings to look for in a text for one secret: the value, how it reads in a URL and in
 * JSON, its trimmed form, and each long line of a multi-line one (a private key is quoted
 * by line). Only one of the forms is needed to find it, and all are masked.
 */
function forms(value: string): string[] {
  const out = new Set<string>();
  const add = (form: string) => {
    if (form.length > 0) out.add(form);
  };
  add(value);
  add(value.trim());
  add(encodeURIComponent(value));
  add(JSON.stringify(value).slice(1, -1));
  add(Buffer.from(value).toString("base64"));
  if (value.includes("\n")) {
    for (const line of value.split(/\r?\n/)) if (line.trim().length >= 8) add(line.trim());
  }
  // A "Bearer x" or "Basic x" credential is often quoted without its scheme.
  const scheme = /^(bearer|basic|token)\s+(.+)$/i.exec(value.trim());
  if (scheme?.[2]) add(scheme[2]);
  return [...out];
}

/** Known values prepared once: longest first, so a value that holds another is masked whole. */
export function maskFor(values: Iterable<string | null | undefined>): Known {
  const all = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && value.length > 0)
      for (const form of forms(value)) all.add(form);
  }
  return [...all].sort((a, b) => b.length - a.length);
}

/** The text with every known value replaced. */
export function redactText(text: string, known: Known | undefined): string {
  if (!known || known.length === 0 || text.length === 0) return text;
  let out = text;
  for (const value of known) {
    if (value.length >= SHORT_VALUE) {
      if (out.includes(value)) out = out.split(value).join(REDACTED);
    } else {
      const word = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(value)}(?![\\p{L}\\p{N}_])`, "gu");
      out = out.replace(word, REDACTED);
    }
  }
  return out;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function marksSecret(schema: Schema): boolean {
  if (!schema) return false;
  return schema.writeOnly === true || schema.format === "password" || schema["x-secret"] === true;
}

/** The value with every secret-looking part replaced, following `schema` where given. */
export function redact(value: unknown, schema?: Schema, known?: Known): unknown {
  if (marksSecret(schema)) return value === undefined || value === null ? value : REDACTED;
  if (typeof value === "string") return redactText(value, known);
  if (Array.isArray(value)) {
    const items = isObject(schema?.items) ? (schema.items as Schema) : undefined;
    return value.map((item) => redact(item, items, known));
  }
  if (isObject(value)) {
    // A stored payload is a pointer, not the value: nothing to mask.
    if (Object.keys(value).length === 1 && typeof value.stored === "string") return value;
    const properties = isObject(schema?.properties)
      ? (schema.properties as Record<string, Schema>)
      : {};
    const extra = isObject(schema?.additionalProperties)
      ? (schema.additionalProperties as Schema)
      : undefined;
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (isSecretKey(key) && inner !== null && inner !== undefined && inner !== "") {
        out[key] = REDACTED;
        continue;
      }
      out[key] = redact(inner, properties[key] ?? extra, known);
    }
    return out;
  }
  return value;
}

/** A run's error as shown: its message and stack with known values masked. */
export function redactError<T extends { message: string; stack?: string }>(
  error: T,
  known: Known | undefined,
): T {
  return {
    ...error,
    message: redactText(error.message, known),
    ...(error.stack ? { stack: redactText(error.stack, known) } : {}),
  };
}

/** One short line of a payload, masked, for lists. Nothing for a run without output. */
export function summarize(
  value: unknown,
  schema?: Schema,
  max = 200,
  known?: Known,
): string | null {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(redact(value, schema, known));
  if (text === undefined) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
