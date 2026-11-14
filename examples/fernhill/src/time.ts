// Clock time at a clinic. Times are stored as instants (UTC); opening hours and
// what people read are the clinic's own wall-clock time. Imports nothing, so the
// apps use it too.

/** The wall-clock date, weekday and minutes since midnight of an instant in a time zone. */
export function wallClock(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday as string,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** "08:30" → 510. */
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** 510 → "08:30". */
export const hhmmOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The instant at which a wall-clock date and time happens in a time zone. */
export function instantAt(date: string, minutes: number, timeZone: string): Date {
  // Guess as if UTC, then correct by the zone's offset at that moment (twice, for DST edges).
  let guess = new Date(`${date}T${hhmmOf(minutes)}:00Z`).getTime();
  for (let i = 0; i < 2; i += 1) {
    const seen = wallClock(new Date(guess), timeZone);
    const want = new Date(`${date}T${hhmmOf(minutes)}:00Z`).getTime();
    const got = new Date(`${seen.date}T${hhmmOf(seen.minutes)}:00Z`).getTime();
    guess += want - got;
  }
  return new Date(guess);
}

/** "1:30 PM". */
export function clockText(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(instant),
  );
}

/** Opening hours for a weekday, or null when the clinic is closed. */
export function hoursOn(
  clinic: { opens: string; closes: string; saturday_closes: string | null },
  weekday: string,
): { opens: number; closes: number } | null {
  if (weekday === "Sun") return null;
  if (weekday === "Sat") {
    return clinic.saturday_closes
      ? { opens: minutesOf(clinic.opens), closes: minutesOf(clinic.saturday_closes) }
      : null;
  }
  return { opens: minutesOf(clinic.opens), closes: minutesOf(clinic.closes) };
}
