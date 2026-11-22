import { Button } from "@volvel/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavigateTo } from "./actions.tsx";

/**
 * Where the served app is, as its address says (phase 26):
 *
 * | Address | Shows |
 * |---|---|
 * | `<base><page>` | a page |
 * | `<base><page>/<record>` | a record page |
 * | `?sheet=<page>&record=<id>` | a side sheet over the page; the page stays in view |
 * | `?modal=<page>[&record=<id>]` | a modal over the page |
 * | `tab.<widget>=<tab>` | the open tab of a Tabs on the page |
 *
 * A page's own parameters (`tab.*` and the filters' `f.*`) are kept in the address when a sheet
 * or modal is opened over the page or closed, so the page under it stays as it was.
 */
export interface Over {
  page: string;
  record?: string;
}

/** The parameters that belong to the page on screen: its open tabs and its filters. */
const isOwn = (key: string) => key.startsWith("tab.") || key.startsWith("f.");

/** The page's own parameters in a query string. */
export function ownParams(search: string): Record<string, string> {
  const own: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) if (isOwn(key)) own[key] = value;
  return own;
}

/** The open tab of each Tabs an address names, by the Tabs' widget id. */
export function tabsOfAddress(address: Address): Record<string, string> {
  const tabs: Record<string, string> = {};
  for (const [key, value] of Object.entries(address.own ?? {})) {
    if (key.startsWith("tab.") && key.length > 4) tabs[key.slice(4)] = value;
  }
  return tabs;
}

export interface Address {
  /** The page's own parameters, as written (`tab.<widget>`, `f.<filter>`). */
  own?: Record<string, string>;
  page?: string;
  record?: string;
  sheet?: Over;
  modal?: Over;
}

/** What an address says. `base` ends in a slash. */
export function parseAddress(base: string, pathname: string, search: string): Address {
  const root = base.endsWith("/") ? base : `${base}/`;
  const rest = pathname.startsWith(root)
    ? pathname.slice(root.length)
    : pathname === root.slice(0, -1)
      ? ""
      : pathname;
  const [page, record] = rest
    .split("/")
    .filter((part) => part !== "")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  const query = new URLSearchParams(search);
  const on = query.get("record") ?? undefined;
  const sheet = query.get("sheet");
  const modal = query.get("modal");
  // A modal opened from a sheet (an invoice's Edit) is over the sheet, which stays: its record
  // is `modalRecord`. A modal on its own has `record`, as a sheet does; a link that gives it
  // `modalRecord` alone (no sheet under it) means the same, so it is read, not dropped.
  const modalOn = (query.get("modalRecord") ?? (sheet ? undefined : on)) ?? undefined;
  const own = ownParams(search);
  return {
    ...(Object.keys(own).length > 0 ? { own } : {}),
    ...(page ? { page } : {}),
    ...(record ? { record } : {}),
    ...(sheet ? { sheet: { page: sheet, ...(on ? { record: on } : {}) } } : {}),
    ...(modal ? { modal: { page: modal, ...(modalOn ? { record: modalOn } : {}) } } : {}),
  };
}

/** The address for what is shown: the reverse of `parseAddress`. */
export function addressOf(base: string, address: Address): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  const path = [address.page, address.page ? address.record : undefined]
    .filter((part): part is string => part !== undefined)
    .map(encodeURIComponent)
    .join("/");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(address.own ?? {})) query.set(key, value);
  if (address.sheet) {
    query.set("sheet", address.sheet.page);
    if (address.sheet.record) query.set("record", address.sheet.record);
  }
  if (address.modal) {
    query.set("modal", address.modal.page);
    if (address.modal.record)
      query.set(address.sheet ? "modalRecord" : "record", address.modal.record);
  }
  const text = query.toString();
  return `${root}${path}${text ? `?${text}` : ""}`;
}

/** Marks a history entry the app made to put a sheet or modal over a page, so that closing it can go back. */
const OVER = "volvelOver";

const read = (base: string): Address =>
  parseAddress(base, window.location.pathname, window.location.search);

/** Where the list is, and its neighbours. */
export interface Stepping {
  /** 1-based place in the list. */
  at: number;
  /** How many rows there are in all when the server said, else how many were loaded. */
  total: number;
  /** Whether `total` is only what was loaded: there are more rows that nobody has counted. */
  partial: boolean;
  previous: string | undefined;
  /** The next record, if it is loaded; stepping past the last loaded one reads more. */
  next: string | undefined;
  /** Whether there is a next row, loaded or not. */
  hasNext: boolean;
  /** Reading the next rows. */
  loading?: boolean;
}

/** The list a sheet was opened from: the ids of its rows as far as they are loaded, how many there are in all, and how to read on. */
export interface Among {
  ids: readonly string[];
  total?: number | undefined;
  more?: (() => Promise<readonly string[]>) | undefined;
}

/** The place of a record among the list it was opened from; nothing when it is not in it. */
export function steppingOf(
  among: Among | readonly string[] | undefined,
  record: string | undefined,
): Stepping | undefined {
  if (!among || !record) return undefined;
  const list: Among = Array.isArray(among) ? { ids: among as readonly string[] } : (among as Among);
  const index = list.ids.indexOf(record);
  if (index < 0) return undefined;
  const known = list.total !== undefined && list.total >= list.ids.length;
  return {
    at: index + 1,
    total: known ? (list.total as number) : list.ids.length,
    partial: !known && list.more !== undefined,
    previous: list.ids[index - 1],
    next: list.ids[index + 1],
    hasNext: list.ids[index + 1] !== undefined || list.more !== undefined,
  };
}

/**
 * The address as state. A sheet or modal opened from a page is a new entry in the history, so
 * Back closes it; a shared link reopens it because it is all in the address. Stepping a sheet
 * to the next record replaces its entry, so Back still closes it in one press.
 */
export function useAddress(base: string) {
  const [address, setAddress] = useState<Address>(() => read(base));
  // The list a sheet was opened from, by id. Only in memory: a shared link has none.
  const [among, setAmong] = useState<Among>();
  const [reading, setReading] = useState(false);
  const current = useRef(address);
  current.current = address;

  useEffect(() => {
    const onPop = () => {
      const next = read(base);
      setAddress(next);
      if (!next.sheet) setAmong(undefined);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [base]);

  const show = useCallback(
    (next: Address, how: "push" | "replace", over: boolean) => {
      const href = addressOf(base, next);
      if (how === "push") window.history.pushState({ [OVER]: over }, "", href);
      else window.history.replaceState({ [OVER]: over }, "", href);
      setAddress(next);
    },
    [base],
  );

  const go = useCallback(
    (to: NavigateTo) => {
      // The page's own parameters as the address has them now: the page keeps its filters there itself.
      const now: Address = { ...current.current, own: ownParams(window.location.search) };
      if ("close" in to) {
        if (!now.sheet && !now.modal) return;
        const history = window.history.state as Record<string, unknown> | null;
        if (history?.[OVER] === true) {
          // Back is the way out: the entry the sheet (or the modal over it) was given is left.
          window.history.back();
        } else if (now.modal && now.sheet) {
          // A modal over a sheet closes to the sheet.
          const { modal: _modal, ...under } = now;
          show(under, "replace", true);
        } else {
          show(
            {
              ...(now.own ? { own: now.own } : {}),
              ...(now.page ? { page: now.page } : {}),
              ...(now.record ? { record: now.record } : {}),
            },
            "replace",
            false,
          );
          setAmong(undefined);
        }
        return;
      }
      if (to.as === "page") {
        setAmong(undefined);
        show({ page: to.page, ...(to.record ? { record: to.record } : {}) }, "push", false);
        return;
      }
      const over: Over = { page: to.page, ...(to.record ? { record: to.record } : {}) };
      const under: Address = {
        ...(now.own ? { own: now.own } : {}),
        ...(now.page ? { page: now.page } : {}),
        ...(now.record ? { record: now.record } : {}),
      };
      if (to.as === "modal" && now.sheet && !now.modal) {
        // A modal opened from a sheet goes over it, and closing it (or Back) returns to the sheet.
        show({ ...under, sheet: now.sheet, modal: over }, "push", true);
        return;
      }
      const already = now.sheet !== undefined || now.modal !== undefined;
      if (to.as === "sheet") {
        setAmong(
          to.among && to.among.length > 0
            ? { ids: to.among, total: to.amongTotal, more: to.amongMore }
            : undefined,
        );
      }
      show(
        { ...under, ...(to.as === "sheet" ? { sheet: over } : { modal: over }) },
        already ? "replace" : "push",
        true,
      );
    },
    [show],
  );

  /** Opens a tab of a Tabs on the page. A new entry in the history, so Back goes to the tab before. */
  const choose = useCallback(
    (widget: string, tab: string) => {
      const now: Address = { ...current.current, own: ownParams(window.location.search) };
      show({ ...now, own: { ...now.own, [`tab.${widget}`]: tab } }, "push", false);
    },
    [show],
  );

  const stepping = useMemo(() => {
    const place = steppingOf(among, address.sheet?.record);
    return place ? { ...place, loading: reading } : undefined;
  }, [among, address.sheet, reading]);
  /**
   * Moves the open sheet to the record before or after it in its list. Past the last row loaded,
   * the next rows are read first (once), and the sheet goes to the first of them.
   */
  const step = useCallback(
    async (by: "previous" | "next") => {
      const now: Address = { ...current.current, own: ownParams(window.location.search) };
      const place = steppingOf(among, now.sheet?.record);
      let record = place?.[by];
      if (!now.sheet) return;
      if (!record && by === "next" && among?.more && !reading) {
        setReading(true);
        try {
          const more = await among.more();
          if (more.length === 0) {
            // Nothing more after all: the count is what was loaded.
            setAmong({ ids: among.ids, total: among.ids.length });
            return;
          }
          const ids = [...among.ids, ...more.filter((id) => !among.ids.includes(id))];
          setAmong({ ids, total: among.total, more: among.more });
          record = more[0];
        } catch {
          return;
        } finally {
          setReading(false);
        }
      }
      // The address may have moved while the rows were read.
      if (!record || current.current.sheet?.record !== now.sheet.record) return;
      show(
        {
          ...current.current,
          ...(now.own ? { own: now.own } : {}),
          sheet: { page: now.sheet.page, record },
        },
        "replace",
        true,
      );
    },
    [among, reading, show],
  );
  return { address, go, stepping, step, choose };
}

/**
 * "2 of 236", with Previous and Next: a sheet opened from a list steps through it. The count is the
 * real total when the server said it; when only the loaded rows are known and there are more it
 * says so ("2 of 100 or more"); Next past the loaded rows reads the next ones.
 */
export function Stepper({
  stepping,
  onStep,
}: {
  stepping: Stepping;
  onStep(by: "previous" | "next"): void | Promise<void>;
}) {
  return (
    <nav aria-label="Rows" className="mr-auto flex items-center gap-2">
      <Button
        size="small"
        variant="quiet"
        disabled={stepping.previous === undefined}
        onClick={() => onStep("previous")}
      >
        Previous
      </Button>
      <span className="text-body-sm text-ink-muted tabular-nums" aria-live="polite">
        {stepping.at} of {stepping.total.toLocaleString("en-US")}
        {stepping.partial ? " or more" : ""}
      </span>
      <Button
        size="small"
        variant="quiet"
        disabled={!stepping.hasNext || stepping.loading === true}
        onClick={() => void onStep("next")}
      >
        Next
      </Button>
    </nav>
  );
}
