import { PLATFORM_EVENTS } from "@volvel/manifest";
import type { Option } from "@volvel/ui";

/**
 * What an event picker for a trigger offers: the workspace's own events, then the platform's,
 * each with what it says and the fields its payload holds. One list, from the manifest package,
 * for the trigger editor and the flow editor. Not for publishing: the platform's events are
 * published only by the platform.
 */
export function listenChoices(own: Option[]): Option[] {
  const have = new Set(own.map((one) => one.value));
  return [
    ...own,
    ...PLATFORM_EVENTS.filter((one) => !have.has(one.name)).map((one) => ({
      value: one.name,
      label: one.name,
      hint: `${one.description} Payload: ${one.payload
        .map((field) => (field.optional ? `${field.name} (when there is one)` : field.name))
        .join(", ")}.`,
    })),
  ];
}
