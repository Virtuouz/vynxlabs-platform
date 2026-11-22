import type { PageFilter } from "@volvel/manifest";
import type { Choice, FilterHost } from "@volvel/widgets";
import { useCallback, useMemo, useRef } from "react";
import { valueFor } from "./filters.ts";
import type { FilterValues, PageDataClient } from "./types.ts";

/** The words of a choice: its own, or else its value. */
const choiceOf = (one: string | Choice): Choice =>
  typeof one === "string" ? { value: one, label: one } : one;

/**
 * What a page gives each of its Search and filter widgets: where the filters stand, a way to
 * set one (every widget it narrows reads again), a way to put this widget's filters back to
 * how they start, and what a choice over a table's column offers. The values stay where the
 * host keeps them (`values`, `onValues`); this only reads and writes them.
 *
 * Two filters that hand on a value in the same moment each add to what the other set,
 * so a set is made on the latest values, not those of the last draw.
 */
export function useFilterHost(options: {
  filters: readonly PageFilter[];
  values: FilterValues;
  onValues: (values: FilterValues) => void;
  client: PageDataClient;
  /** What the host already read for a choice, by filter name. */
  given?: Readonly<Record<string, readonly (string | Choice)[]>> | undefined;
}): (own: readonly PageFilter[]) => FilterHost {
  const { filters, values, onValues, client, given } = options;
  const latest = useRef(values);
  latest.current = values;
  const told = useRef(onValues);
  told.current = onValues;
  // A table's values are read once for as long as the client is the same.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new client is a new read
  const read = useMemo(() => new Map<string, Promise<readonly (string | Choice)[]>>(), [client]);
  const write = useCallback((change: (now: FilterValues) => FilterValues) => {
    latest.current = change(latest.current);
    told.current(latest.current);
  }, []);
  return (own) => {
    const shown: Record<string, unknown> = {};
    for (const filter of filters) shown[filter.name] = valueFor(filter, values);
    const reader = client.options?.bind(client);
    const offers = (filter: PageFilter | undefined, name: string) => {
      if (filter?.choices) return Promise.resolve(filter.choices as readonly string[]);
      const have = given?.[name];
      if (have) return Promise.resolve(have);
      if (!reader) return Promise.reject(new Error("There is nothing to read the values from."));
      const asked = read.get(name) ?? reader(name);
      read.set(name, asked);
      return asked;
    };
    return {
      values: shown,
      set: (name, value) =>
        write((now) => {
          const next = { ...now };
          if (value === undefined) delete next[name];
          else next[name] = value;
          return next;
        }),
      reset: () =>
        write((now) => {
          const next = { ...now };
          for (const filter of own) delete next[filter.name];
          return next;
        }),
      ...(reader || given
        ? {
            options: async (name: string, search: string) => {
              const found = await offers(
                filters.find((one) => one.name === name),
                name,
              );
              const words = search.trim().toLowerCase();
              return found
                .map(choiceOf)
                .filter((one) => `${one.label} ${one.value}`.toLowerCase().includes(words));
            },
          }
        : {}),
    };
  };
}
