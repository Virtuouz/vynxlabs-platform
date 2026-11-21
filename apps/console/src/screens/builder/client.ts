import { WidgetReadError } from "@volvel/screens";
import { ApiError, api } from "../../api.ts";
import type { FilterValues, PageDataClient } from "./renderer.ts";

/** What a page's data is read for: an interface's page, or a dashboard. */
export type PageSource =
  | { of: "interface"; path: string; page: string }
  | { of: "dashboard"; id: string };

/**
 * The console's `PageDataClient`: each widget asks the control plane's
 * `widget-data` endpoint, which reads the stored page, compiles the widget's
 * data inputs and runs them as whoever is asking (contract §1).
 *
 * `draft` reads the page as it is being built, before it is published: only
 * for interfaces in the builder. A dashboard is read plainly.
 */
export function pageClient(root: string, source: PageSource, draft = false): PageDataClient {
  /** Which page is asked about, as both endpoints name it. */
  const page = (params: URLSearchParams) => {
    params.set("of", source.of);
    if (source.of === "interface") {
      params.set("path", source.path);
      params.set("page", source.page);
      if (draft) params.set("draft", "1");
    } else {
      params.set("path", source.id);
    }
    return params;
  };
  return {
    read: async (widget, filters: FilterValues, options = {}) => {
      const params = page(new URLSearchParams({ widget }));
      if (Object.keys(filters).length > 0) params.set("filters", JSON.stringify(filters));
      if (options.input) params.set("input", options.input);
      if (options.cursor) params.set("cursor", options.cursor);
      try {
        return await api.get(`${root}/widget-data?${params}`);
      } catch (error) {
        // A refusal is drawn as one, in the widget's frame, not as a failure.
        throw error instanceof ApiError ? new WidgetReadError(error.message, error.status) : error;
      }
    },
    options: async (filter) => {
      const found = await api.get<{ values: string[] }>(
        `${root}/filter-options?${page(new URLSearchParams({ filter }))}`,
      );
      return found.values;
    },
  };
}
