import type { PageWidget } from "@volvel/manifest";
import type { WidgetData, WidgetState } from "@volvel/widgets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterValues, PageDataClient, WireData } from "./types.ts";
import { isEmpty, toWidgetData } from "./wire.ts";

export interface Reading {
  state: WidgetState;
  /** Each input, as its view is given it. Kept while the next read is on its way. */
  data: Record<string, WidgetData>;
  /** What was drawn is from before the last change, and a newer read is on its way. */
  stale: boolean;
  /** The next page of a rows input: on its way, or why it did not come. */
  more: { loading: boolean; error?: string; retry: () => void } | undefined;
  /**
   * Every row of the rows input that has more, up to `DOWNLOAD_ROWS`, for a download: what the
   * page shows is a page of them. Resolves to what was read when nothing is waiting.
   */
  all: () => Promise<Readonly<Record<string, WireData>> | undefined>;
  /** Reads again. */
  retry: () => void;
  /** Each input as it was read: for the frame's Download, and its notices. */
  read: Readonly<Record<string, WireData>> | undefined;
}

/** The most rows a download reads. */
export const DOWNLOAD_ROWS = 10_000;

const sentence = (error: unknown): { forbidden: boolean; message: string } => {
  const status = (error as { status?: unknown } | null)?.status;
  const message = error instanceof Error && error.message ? error.message : "It could not be read.";
  return { forbidden: status === 403, message };
};

/**
 * Reads what a widget draws: when it mounts, when the page's filters or its
 * own data change, and when `refreshKey` does. A read still on its way when
 * the next begins is abandoned. A widget with no data inputs reads nothing.
 */
export function useWidgetData({
  client,
  widget,
  reads,
  filterValues,
  refreshKey,
  emptyMessage,
  chosen,
}: {
  client: PageDataClient;
  widget: PageWidget;
  /** Whether the widget has data inputs to read. */
  reads: boolean;
  filterValues: FilterValues;
  refreshKey: number;
  /** What a read that found nothing says. */
  emptyMessage: string;
  /** The rows chosen in the tables and lists this widget follows (`{ selected }`), by their widget id. */
  chosen?: Readonly<Record<string, string>> | undefined;
}): Reading {
  const [attempt, setAttempt] = useState(0);
  const [inputs, setInputs] = useState<Record<string, WireData>>();
  const [failure, setFailure] = useState<{ forbidden: boolean; message: string }>();
  const [loading, setLoading] = useState(reads);
  const [more, setMore] = useState<{ loading: boolean; error?: string; input?: string }>({
    loading: false,
  });
  // A table's order, asked of the server so that it is over every row and not only the page read.
  const [sorting, setSorting] = useState<{ column: string; descending: boolean }>();
  const sortOf = sorting ? `${sorting.descending ? "-" : ""}${sorting.column}` : undefined;
  const paging = useRef<AbortController | undefined>(undefined);
  const config = widget.config;
  // Everything that decides what is read, as one value to watch. Where a widget is on the page is not part of it.
  const asked = JSON.stringify([
    widget.id,
    widget.type,
    widget.data,
    config?.compareTo,
    config?.trendBy,
    filterValues,
    refreshKey,
    chosen,
    sortOf,
    attempt,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `asked` stands for the widget and filters it was made from
  useEffect(() => {
    if (!reads) return;
    const controller = new AbortController();
    setLoading(true);
    setFailure(undefined);
    setMore({ loading: false });
    client
      .read(widget.id, filterValues, {
        signal: controller.signal,
        ...(chosen ? { chosen } : {}),
        ...(sortOf ? { sort: sortOf } : {}),
      })
      .then(
        (read) => {
          if (controller.signal.aborted) return;
          setInputs(read.inputs);
          setLoading(false);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setFailure(sentence(error));
          setLoading(false);
        },
      );
    return () => {
      controller.abort();
      paging.current?.abort();
    };
  }, [client, asked, reads]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `asked` stands for the filters the page is read under
  const page = useCallback(
    (input: string, cursor: string) => {
      paging.current?.abort();
      const controller = new AbortController();
      paging.current = controller;
      setMore({ loading: true, input });
      client
        .read(widget.id, filterValues, {
          input,
          cursor,
          signal: controller.signal,
          ...(chosen ? { chosen } : {}),
          ...(sortOf ? { sort: sortOf } : {}),
        })
        .then(
          (read) => {
            if (controller.signal.aborted) return;
            const next = read.inputs[input];
            setMore({ loading: false });
            if (next?.shape !== "rows") return;
            setInputs((before) => {
              const held = before?.[input];
              if (held?.shape !== "rows") return before;
              const { next: after, ...fresh } = next;
              const names = { ...held.names };
              for (const [column, found] of Object.entries(next.names ?? {})) {
                names[column] = { ...names[column], ...found };
              }
              const { next: _before, ...kept } = held;
              return {
                ...before,
                [input]: {
                  ...kept,
                  ...fresh,
                  rows: [...held.rows, ...next.rows],
                  names,
                  ...(after !== undefined ? { next: after } : {}),
                },
              };
            });
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            setMore({
              loading: false,
              input,
              error: `More could not be loaded. ${sentence(error).message}`,
            });
          },
        );
    },
    [client, widget.id, asked],
  );

  const data = useMemo(() => {
    const drawn: Record<string, WidgetData> = {};
    for (const [name, wire] of Object.entries(inputs ?? {})) {
      const next = wire.shape === "rows" ? wire.next : undefined;
      const shown = toWidgetData(
        wire,
        next !== undefined ? () => !more.loading && page(name, next) : undefined,
      );
      drawn[name] =
        shown.shape === "rows" && (next !== undefined || sorting)
          ? { ...shown, sortBy: setSorting, ...(sorting ? { sorted: sorting } : {}) }
          : shown;
    }
    return drawn;
  }, [inputs, more.loading, page, sorting]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `asked` stands for the filters, order and widget
  const all = useCallback(async () => {
    if (!inputs) return inputs;
    const whole: Record<string, WireData> = { ...inputs };
    for (const [name, wire] of Object.entries(inputs)) {
      if (wire.shape !== "rows" || wire.next === undefined) continue;
      let rows = [...wire.rows];
      const names = { ...wire.names };
      let cursor: string | undefined = wire.next;
      while (cursor !== undefined && rows.length < DOWNLOAD_ROWS) {
        const read = await client.read(widget.id, filterValues, {
          input: name,
          cursor,
          size: Math.min(1000, DOWNLOAD_ROWS - rows.length),
          ...(chosen ? { chosen } : {}),
          ...(sortOf ? { sort: sortOf } : {}),
        });
        const next = read.inputs[name];
        if (next?.shape !== "rows") break;
        rows = [...rows, ...next.rows];
        for (const [column, found] of Object.entries(next.names ?? {})) {
          names[column] = { ...names[column], ...found };
        }
        cursor = next.next;
      }
      const { next: _after, ...rest } = wire;
      whole[name] = { ...rest, rows, names };
    }
    return whole;
  }, [client, inputs, asked]);

  /**
   * The rows after a cursor, for whoever steps past the ones loaded (a sheet's Next): read as the
   * table reads them (same filters, rows chosen and order), and not added to what the widget shows.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `asked` stands for the filters, order and widget
  const readAfter = useCallback(
    async (input: string, cursor: string) => {
      const read = await client.read(widget.id, filterValues, {
        input,
        cursor,
        ...(chosen ? { chosen } : {}),
        ...(sortOf ? { sort: sortOf } : {}),
      });
      const next = read.inputs[input];
      return next?.shape === "rows"
        ? { rows: next.rows, ...(next.next !== undefined ? { next: next.next } : {}) }
        : undefined;
    },
    [client, asked],
  );

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const retryMore = () => {
    const wire = more.input ? inputs?.[more.input] : undefined;
    if (more.input && wire?.shape === "rows" && wire.next !== undefined)
      page(more.input, wire.next);
  };

  const held = inputs !== undefined;
  const state: WidgetState = !reads
    ? { status: "ready" }
    : failure
      ? { status: failure.forbidden ? "forbidden" : "failed", message: failure.message }
      : !held || (loading && !held)
        ? { status: "loading" }
        : inputs && isEmpty(inputs)
          ? { status: "empty", message: emptyMessage }
          : { status: "ready" };
  return {
    state,
    data,
    stale: reads && held && loading,
    more:
      reads && (more.loading || more.error)
        ? { loading: more.loading, ...(more.error ? { error: more.error } : {}), retry: retryMore }
        : undefined,
    retry,
    all,
    readAfter,
    read: inputs,
  };
}
