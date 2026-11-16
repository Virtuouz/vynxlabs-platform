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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function marksSecret(schema: Schema): boolean {
  if (!schema) return false;
  return schema.writeOnly === true || schema.format === "password" || schema["x-secret"] === true;
}

/** The value with every secret-looking part replaced, following `schema` where given. */
export function redact(value: unknown, schema?: Schema): unknown {
  if (marksSecret(schema)) return value === undefined || value === null ? value : REDACTED;
  if (Array.isArray(value)) {
    const items = isObject(schema?.items) ? (schema.items as Schema) : undefined;
    return value.map((item) => redact(item, items));
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
      out[key] = redact(inner, properties[key] ?? extra);
    }
    return out;
  }
  return value;
}

/** One short line of a payload, masked, for lists. Nothing for a run without output. */
export function summarize(value: unknown, schema?: Schema, max = 200): string | null {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(redact(value, schema));
  if (text === undefined) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
