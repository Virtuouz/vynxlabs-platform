import { z } from "@volvel/sdk";
import { APPOINTMENT_STATES, CLINICS } from "./constants.ts";

export { APPOINTMENT_STATES, CLINICS, REASONS } from "./constants.ts";

/**
 * Fernhill Veterinary Group: three clinics in Portland, Oregon: Northside,
 * Riverside and Hilltop.
 *
 * Who sees what is decided by the tables' rules, not by the apps:
 *
 * - Front-desk staff are end users in a group named after their clinic. They
 *   see and change the rows whose `clinic` column names that group.
 * - Pet owners are end users with a `client_id` attribute. They read the rows
 *   whose `client_code` equals it.
 * - Practice managers and vets are members of the tenant. Their roles let them
 *   read everything.
 */

export const Clinic = z.enum(CLINICS);

export const AppointmentState = z.enum(APPOINTMENT_STATES);
