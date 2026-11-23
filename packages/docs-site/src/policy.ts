/** What a docs app's page may load. As an app's, and a picture may also come from an https address its author gave. */
export const DOCS_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // The renderer writes classes, never a style. Inline styles are allowed for a diagram, which
  // Mermaid draws with a style block and style attributes; scripts stay the instance's own.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");
