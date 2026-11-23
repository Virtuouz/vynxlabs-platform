/**
 * Whether two addresses are at the same origin: the same scheme, host and port. A credential
 * stored for one is not sent to another, so a changed address needs the credential again.
 * An address that cannot be read is another origin.
 */
export function sameOrigin(before: string, after: string): boolean {
  try {
    return new URL(before).origin === new URL(after).origin;
  } catch {
    return false;
  }
}
