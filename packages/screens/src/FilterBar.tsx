import type { PageFilter } from "@volvel/manifest";
import { FilterView, TYPING_PAUSE } from "@volvel/widgets-core/views";
import { useFilterHost } from "./filterHost.ts";
import type { FilterValues, PageDataClient } from "./types.ts";

// The filters are drawn by the Search and filter widget's view, where the widget sits on the
// page (phase 27); this is only that view for a host that holds filters without a widget.
export { TYPING_PAUSE };

export interface FilterBarProps {
  filters: readonly PageFilter[];
  /** What was set, by filter name. A filter that is absent is at its default. */
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  /** For a choice that lists a table's column: what the page read for it, by filter name. */
  options?: Readonly<Record<string, readonly string[]>> | undefined;
}

const NO_CLIENT = {
  read: () => Promise.reject(new Error("A filter bar reads nothing.")),
} satisfies PageDataClient;

/** A page's filters as one bar, outside any page: the Search and filter view over the host's values. */
export function FilterBar({ filters, values, onChange, options }: FilterBarProps) {
  const hostFor = useFilterHost({
    filters,
    values,
    onValues: onChange,
    client: NO_CLIENT,
    given: options,
  });
  return (
    <div className="@container/cell">
      <FilterView
        {...({
          config: { filters: [...filters], reset: true },
          filters: hostFor(filters),
        } as unknown as Parameters<typeof FilterView>[0])}
      />
    </div>
  );
}
