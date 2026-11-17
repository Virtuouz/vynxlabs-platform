/**
 * Values as a person reads them (07 §7.3), the same in the kit and the console.
 * Durations keep one shape at every size, so a column of them compares by eye.
 */

/** A length of time: "420 ms", "3.0 s", "4m 12s", "2h 5m". */
export function duration(ms: number): string {
  const value = Math.max(0, ms);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(Math.floor(value / 100) / 10).toFixed(1)} s`;
  const seconds = Math.floor(value / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
