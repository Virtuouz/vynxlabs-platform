import { ActionError, WidgetReadError } from "@volvel/screens";
import { ApiError, api } from "../../api.ts";
import type { ActResponse } from "./contract.ts";
import type { FilterValues, PageDataClient, WireData } from "./renderer.ts";

/** How many times, and how long apart, a draft read that finds no such widget waits for the save on its way. */
const SAVE_WAITS = 4;
const SAVE_WAIT_MS = 500;

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
export function pageClient(
  root: string,
  source: PageSource,
  draft = false,
  /** The record a page opened on one is drawn with: while building, a sample (phase 26). */
  record?: string,
): PageDataClient {
  /** Which page is asked about, as both endpoints name it. */
  const page = (params: URLSearchParams) => {
    params.set("of", source.of);
    if (source.of === "interface") {
      params.set("path", source.path);
      params.set("page", source.page);
      if (draft) params.set("draft", "1");
      if (record) params.set("record", record);
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
      if (options.sort) params.set("sort", options.sort);
      if (options.zone) params.set("zone", options.zone);
      if (options.size) params.set("size", String(options.size));
      if (options.chosen && Object.keys(options.chosen).length > 0) {
        params.set("chosen", JSON.stringify(options.chosen));
      }
      // A widget just added or copied is on the page before the draft that holds it is
      // saved (the editor saves 700 ms after the last change), so its first read may find
      // no such widget. While building, that is waited out, not shown as a failure.
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await api.get(`${root}/widget-data?${params}`);
        } catch (error) {
          if (draft && error instanceof ApiError && error.status === 404 && attempt < SAVE_WAITS) {
            await new Promise((done) => setTimeout(done, SAVE_WAIT_MS));
            if (options.signal?.aborted) throw error;
            continue;
          }
          // A refusal is drawn as one, in the widget's frame, not as a failure.
          throw error instanceof ApiError
            ? new WidgetReadError(error.message, error.status)
            : error;
        }
      }
    },
    // Preview actions really run in the dev workspace, from the draft, as whoever is building.
    act: async (widget, at, given) => {
      try {
        return await api.post<ActResponse>(`${root}/page-actions`, {
          of: source.of,
          path: source.of === "interface" ? source.path : source.id,
          ...(source.of === "interface" ? { page: source.page } : {}),
          widget,
          at,
          records: { ...(record ? { this: record } : {}), ...given.records },
          ...(given.inputs ? { inputs: given.inputs } : {}),
          ...(draft ? { draft: true } : {}),
          // "Today" is the reader's day (D21).
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } catch (error) {
        // A refusal says what was wrong with what was typed, by field, as the served app's does.
        if (!(error instanceof ApiError)) throw error;
        const fields: Record<string, string> = {};
        for (const one of error.fields) {
          const name = one.path.replace(/^\/inputs\//, "");
          if (name !== one.path) fields[name] = one.message;
        }
        throw new ActionError(error.message, error.status, fields);
      }
    },
    // Preview decisions really are made, in the dev workspace, from the draft, as whoever is building.
    decide: async (widget, id, decision, comment) => {
      if (source.of !== "interface") throw new ActionError("Approvals are decided in an app.");
      try {
        return await api.post(`${root}/page-approvals`, {
          path: source.path,
          page: source.page,
          widget,
          id,
          decision,
          ...(comment ? { comment } : {}),
          ...(draft ? { draft: true } : {}),
        });
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        throw new ActionError(error.message, error.status);
      }
    },
    choices: async (widget, input, column, search) => {
      const params = page(new URLSearchParams({ widget, input, column, search }));
      const found = await api.get<{ choices: { value: string; label: string }[] }>(
        `${root}/widget-choices?${params}`,
      );
      return found.choices;
    },
    behind: async (widget, input, group, filters) => {
      const params = page(new URLSearchParams({ widget, input, behind: JSON.stringify(group) }));
      if (filters && Object.keys(filters).length > 0)
        params.set("filters", JSON.stringify(filters));
      // The endpoint answers every input asked for; the rows behind are that one input's.
      const read = await api.get<{ inputs: Record<string, WireData> }>(
        `${root}/widget-data?${params}`,
      );
      const found = read.inputs[input];
      if (!found) throw new WidgetReadError("The rows could not be read.", 404);
      return found;
    },
    options: async (filter) => {
      const found = await api.get<{ values: string[]; labels?: Record<string, string> }>(
        `${root}/filter-options?${page(new URLSearchParams({ filter }))}`,
      );
      return found.values.map((value) => ({ value, label: found.labels?.[value] ?? value }));
    },
  };
}
