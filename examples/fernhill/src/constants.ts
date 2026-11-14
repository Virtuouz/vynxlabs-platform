// Values shared by the scripts and the apps. This file imports nothing, so an
// app can import it without pulling the server SDK into the browser.

export const CLINICS = ["northside", "riverside", "hilltop"] as const;
export type ClinicCode = (typeof CLINICS)[number];

/** Every clinic keeps Pacific time. Opening hours in the clinics table are in it. */
export const TIME_ZONE = "America/Los_Angeles";

export const REASONS = [
  "Checkup",
  "Vaccination",
  "Dental",
  "Surgery",
  "Lameness",
  "Skin",
  "Follow-up",
] as const;
export type Reason = (typeof REASONS)[number];

/** How long each kind of visit takes, in minutes. */
export const VISIT_MINUTES: Record<Reason, number> = {
  Checkup: 20,
  Vaccination: 20,
  Dental: 40,
  Surgery: 60,
  Lameness: 20,
  Skin: 20,
  "Follow-up": 20,
};

/** Consulting rooms per clinic: more visits than this at once is a clash. */
export const ROOMS = 3;

export const APPOINTMENT_STATES = [
  "booked",
  "checked_in",
  "in_exam",
  "done",
  "no_show",
  "cancelled",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATES)[number];

/** Which status may follow which. */
export const NEXT_STATUS: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ["checked_in", "no_show", "cancelled"],
  checked_in: ["in_exam", "cancelled"],
  in_exam: ["done"],
  done: [],
  no_show: ["booked"],
  cancelled: ["booked"],
};

/** A visit's status in plain words. "cancelled" is the stored value; people read "Canceled". */
export const STATUS_WORDS: Record<AppointmentStatus, string> = {
  booked: "Booked",
  checked_in: "Checked in",
  in_exam: "In exam",
  done: "Done",
  no_show: "No-show",
  cancelled: "Canceled",
};

/** Money is stored in cents. */
export const dollars = (cents: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
