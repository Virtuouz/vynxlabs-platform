/** The part of a summary input this reads. */
type Summary = {
  breakdowns: readonly string[];
  values: readonly string[];
  rows: readonly Record<string, unknown>[];
};

/**
 * How many visits the summary counts for a clinic. The columns are the ones its first breakdown
 * and its first value are called, because a builder who chooses the data in the inspector names
 * them as they like ("Count", not "visits").
 */
export function bookedFor(visits: Summary | undefined, clinic: string): number {
  const by = visits?.breakdowns[0];
  const value = visits?.values[0];
  if (!visits || !by || !value) return 0;
  const row = visits.rows.find((candidate) => candidate[by] === clinic);
  return Number(row?.[value] ?? 0);
}
