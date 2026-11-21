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
 */
export interface Over {
  page: string;
  record?: string;
}

export interface Address {
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
  return {
    ...(page ? { page } : {}),
    ...(record ? { record } : {}),
    ...(sheet ? { sheet: { page: sheet, ...(on ? { record: on } : {}) } } : {}),
    // A sheet and a modal are not open together: the sheet is the one named first.
    ...(modal && !sheet ? { modal: { page: modal, ...(on ? { record: on } : {}) } } : {}),
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
  const over = address.sheet ?? address.modal;
  if (over) {
    query.set(address.sheet ? "sheet" : "modal", over.page);
    if (over.record) query.set("record", over.record);
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
  total: number;
  previous: string | undefined;
  next: string | undefined;
}

/** The place of a record among the list it was opened from; nothing when it is not in it. */
export function steppingOf(
  among: readonly string[] | undefined,
  record: string | undefined,
): Stepping | undefined {
  if (!among || !record) return undefined;
  const index = among.indexOf(record);
  if (index < 0) return undefined;
  return {
    at: index + 1,
    total: among.length,
    previous: among[index - 1],
    next: among[index + 1],
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
  const [among, setAmong] = useState<readonly string[]>();
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
      const now = current.current;
      if ("close" in to) {
        if (!now.sheet && !now.modal) return;
        const history = window.history.state as Record<string, unknown> | null;
        if (history?.[OVER] === true) {
          // Back is the way out: the entry the sheet was given is left, not stacked on.
          window.history.back();
        } else {
          show(
            {
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
        ...(now.page ? { page: now.page } : {}),
        ...(now.record ? { record: now.record } : {}),
      };
      const already = now.sheet !== undefined || now.modal !== undefined;
      if (to.as === "sheet") setAmong(to.among && to.among.length > 0 ? to.among : undefined);
      show(
        { ...under, ...(to.as === "sheet" ? { sheet: over } : { modal: over }) },
        already ? "replace" : "push",
        true,
      );
    },
    [show],
  );

  const stepping = useMemo(() => steppingOf(among, address.sheet?.record), [among, address.sheet]);
  /** Moves the open sheet to the record before or after it in its list. */
  const step = useCallback(
    (by: "previous" | "next") => {
      const now = current.current;
      const place = steppingOf(among, now.sheet?.record);
      const record = place?.[by];
      if (!now.sheet || !record) return;
      show({ ...now, sheet: { page: now.sheet.page, record } }, "replace", true);
    },
    [among, show],
  );
  return { address, go, stepping, step };
}

/** "2 of 236", with Previous and Next: a sheet opened from a list steps through it. */
export function Stepper({
  stepping,
  onStep,
}: {
  stepping: Stepping;
  onStep(by: "previous" | "next"): void;
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
        {stepping.at} of {stepping.total}
      </span>
      <Button
        size="small"
        variant="quiet"
        disabled={stepping.next === undefined}
        onClick={() => onStep("next")}
      >
        Next
      </Button>
    </nav>
  );
}
