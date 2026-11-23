/**
 * Reads `a=b,c=d`, as `OTEL_EXPORTER_OTLP_HEADERS` is written: names in lower case, values
 * percent-decoded, a part with no `=` left out. The control plane and the worker read it with
 * this one function, so a vendor sees the same header from both.
 * With `strict`, a value that is not valid percent-encoding throws; otherwise it is sent as written.
 */
export function readOtlpHeaders(text: string | undefined, strict = false): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of (text ?? "").split(",")) {
    const at = pair.indexOf("=");
    if (at < 1) continue;
    const raw = pair.slice(at + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch (error) {
      if (strict) throw error;
    }
    headers[pair.slice(0, at).trim().toLowerCase()] = value;
  }
  return headers;
}
