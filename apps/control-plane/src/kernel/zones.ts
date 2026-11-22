/** Whether text is the name of a time zone, such as Europe/Berlin or UTC (not an offset, which Postgres reads the other way round). */
export function isTimeZone(name: string): boolean {
  if (/^[+-]/.test(name)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
