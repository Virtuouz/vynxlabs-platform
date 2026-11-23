import { clearReads } from "./api.ts";
import { forgetPreferences } from "./prefs.ts";

/**
 * What the page holds of the person who is leaving: their settings, what they read, and the
 * flow canvas positions this tab remembered. Called on sign-out, and when `/me` says nobody is
 * signed in, so a second person in the same tab starts clean.
 */
export function clearSession() {
  forgetPreferences();
  clearReads();
  try {
    for (const name of Object.keys(sessionStorage)) {
      if (name.startsWith("vx-viewport:")) sessionStorage.removeItem(name);
    }
  } catch {
    // Storage that cannot be reached holds nothing to forget.
  }
}
