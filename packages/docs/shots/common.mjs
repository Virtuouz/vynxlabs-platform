// What every area's shots share: the looks, the sizes, and what changes between runs.

export const THEMES = ["light", "dark"];

export const VIEW = { width: 1440, height: 900 };
/** A phone, for a page about phone width. */
export const PHONE = { width: 390, height: 844 };
// A time the server wrote is the moment the scene was built, whatever the clock of the
// browser says: it is painted over, as a <time> or as a cell that reads like one.
export const TIMES = [
  "time",
  // What the console itself marks as changing from one look to the next (the connection's state).
  "[data-volatile]",
  { role: "gridcell", hasText: "\\d{4}, \\d+:\\d\\d\\s[AP]M" },
  // What the server chose, and so is not the same in each run: a row's ID, and the schema a table is stored in.
  { role: "gridcell", hasText: "^[0-9a-f]{8}-[0-9a-f]{4}-" },
  { role: "code", hasText: "^ws_" },
];
