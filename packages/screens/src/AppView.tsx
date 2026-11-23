import type { ActingUser, Page } from "@volvel/manifest";
import { filtersOf } from "@volvel/manifest/parts";
import { Button, Closing, Dialog, pageIconOf, SideSheet, Tabs } from "@volvel/ui";
import { type ReactNode, useMemo, useRef, useState } from "react";
import type { NavigateTo } from "./actions.tsx";
import { filtersFromSearch, searchWithFilters } from "./filterAddress.ts";
import { overlayWidth } from "./layout.ts";
import { type Address, Stepper, tabsOfAddress, type useAddress } from "./navigation.tsx";
import { PageView } from "./PageView.tsx";
import type { FilterValues, PageDataClient, ViewRegistry } from "./types.ts";

/** Pages that are in the app's menu: a record page, a side sheet and a modal are only opened on something. */
export const inMenu = (page: Page) => page.kind === undefined || page.kind === "page";

/**
 * The page whose Help topic the app's Help button opens: the modal that is open, else the side
 * sheet, else the page, taking the topmost that names a topic (a modal with none leaves the one
 * under it). Without a page in the address, the first of the menu (BLD-11).
 */
export function helpingPage(pages: readonly Page[], address: Address): Page | undefined {
  const by = (id: string | undefined) => (id ? pages.find((one) => one.id === id) : undefined);
  const page = by(address.page) ?? pages.filter(inMenu)[0];
  return [by(address.modal?.page), by(address.sheet?.page), page].find((one) => one?.help);
}

/**
 * One page of the app, open on a record or not. A new page, or a new record, starts with its
 * filters at their defaults. `onNavigate` is what an action's `open` and `close` do.
 */
function PageOf({
  page,
  record,
  pages,
  user,
  registry,
  clientFor,
  foldKey,
  onNavigate,
  over,
  overRecord,
  changed,
  onActed,
  tabs,
  ask,
}: {
  over?: boolean;
  overRecord?: string;
  page: Page;
  record?: string;
  pages: readonly Page[];
  user: ActingUser | undefined;
  registry: ViewRegistry;
  clientFor: (page: string, record?: string) => PageDataClient;
  foldKey: string;
  onNavigate(to: NavigateTo): void;
  /** Bumped when an action ran on any page on screen: each reads again. */
  changed: number;
  onActed(): void;
  /** The open tab of each Tabs, kept in the address (the page on screen; not one over it). */
  tabs?: { open: Readonly<Record<string, string>>; choose(widget: string, tab: string): void };
  /** The question an action asks, kept in the address (the page on screen; not one over it). */
  ask?: { open: string | undefined; set(ref: string | undefined): void };
}) {
  const client = useMemo(() => clientFor(page.id, record), [clientFor, page.id, record]);
  const roles = useMemo(
    () => ({ get: (type: string) => registry.get(type)?.definition }),
    [registry],
  );
  const filters = useMemo(() => filtersOf(page.widgets, roles), [page.widgets, roles]);
  // The page on screen keeps its filters in the address, so a reload and a link keep them; a
  // side sheet or modal over it has its own, in memory.
  const kept = over !== true;
  const [values, setValues] = useState<FilterValues>(() =>
    kept
      ? filtersFromSearch(
          window.location.search,
          filters.map((one) => one.name),
        )
      : {},
  );
  const keep = (next: FilterValues) => {
    if (!kept) return;
    // Replaced, not pushed: a search is typed a letter at a time, and Back is not for undoing it.
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${searchWithFilters(window.location.search, next)}${window.location.hash}`,
    );
  };
  return (
    <PageView
      widgets={page.widgets}
      filters={filters}
      registry={registry}
      client={client}
      filterValues={values}
      onFilterValues={(next) => {
        setValues(next);
        keep(next);
      }}
      pages={pages}
      foldKey={foldKey}
      {...(tabs && kept ? { tabs } : {})}
      {...(ask && kept ? { ask } : {})}
      onNavigate={(to) => {
        onNavigate(to);
        // Opening a sheet or modal, or closing one, rebuilds the address: the filters go back in it.
        if ("close" in to || to.as !== "page") keep(values);
      }}
      refreshKey={changed}
      onActed={onActed}
      {...(over ? { over } : {})}
      {...(overRecord ? { overRecord } : {})}
      {...(record ? { record } : {})}
      {...(user ? { user } : {})}
    />
  );
}

/**
 * The pages of an app, drawn as people use them: the menu, a page, a record page, the side sheet
 * and the modal that are open over it, with what is open kept in the address (`nav`, from
 * `useAddress`). The served app and the console's preview of the draft are this one component,
 * given where the pages and their data come from.
 */
export function AppView({
  nav,
  pages,
  user,
  registry,
  clientFor,
  appKey,
  empty,
}: {
  nav: ReturnType<typeof useAddress>;
  pages: readonly Page[];
  user: ActingUser | undefined;
  registry: ViewRegistry;
  /** What each widget of a page reads and does. */
  clientFor: (page: string, record?: string) => PageDataClient;
  /** Names the app for what a page remembers (a folded section). */
  appKey: string;
  empty?: ReactNode;
}) {
  const { address, go, stepping, step, choose } = nav;
  // An action that ran on any page on screen makes every page on screen read again.
  const [changed, setChanged] = useState(0);
  const menu = pages.filter(inMenu);
  const open = pages.find((one) => one.id === address.page) ?? menu[0];
  const overRecord = address.sheet?.record ?? address.modal?.record;
  const draw = (page: Page, record?: string, over = false) => (
    <PageOf
      key={`${page.id}/${record ?? ""}`}
      page={page}
      pages={pages}
      user={user}
      registry={registry}
      clientFor={clientFor}
      foldKey={`${appKey}.${page.id}`}
      onNavigate={go}
      changed={changed}
      onActed={() => setChanged((count) => count + 1)}
      {...(!over ? { tabs: { open: tabsOfAddress(address), choose } } : {})}
      {...(!over ? { ask: { open: address.own?.ask, set: nav.ask } } : {})}
      {...(record ? { record } : {})}
      {...(over ? { over } : {})}
      {...(!over && overRecord ? { overRecord } : {})}
    />
  );
  const drawn = open ? draw(open, open.kind === "record" ? address.record : undefined) : null;
  // A record page goes back to the page of the menu it was opened from; by a link, to the first.
  const cameFrom = useRef<string>(undefined);
  if (open && inMenu(open)) cameFrom.current = open.id;
  const back = menu.find((one) => one.id === cameFrom.current) ?? menu[0];
  const sheet = address.sheet ? pages.find((one) => one.id === address.sheet?.page) : undefined;
  const modal = address.modal ? pages.find((one) => one.id === address.modal?.page) : undefined;
  return (
    <>
      {pages.length === 0 ? (
        (empty ?? <p className="m-0 text-ink-muted">This app has no pages yet.</p>)
      ) : open && !inMenu(open) ? (
        // A record page is not in the menu: it is a page of its own, with a way back to the menu.
        <>
          {back ? (
            <div>
              <Button
                size="small"
                variant="quiet"
                onClick={() => go({ page: back.id, as: "page" })}
              >
                Back to {back.title}
              </Button>
            </div>
          ) : null}
          {drawn}
        </>
      ) : menu.length === 1 ? (
        drawn
      ) : (
        <Tabs
          label="Pages"
          value={open?.id ?? ""}
          onChange={(id) => go({ page: id, as: "page" })}
          tabs={menu.map((page) => {
            const Icon = pageIconOf(page.icon);
            return {
              id: page.id,
              label: page.title,
              ...(Icon ? { icon: <Icon size={14} /> } : {}),
              content: page.id === open?.id ? drawn : null,
            };
          })}
        />
      )}
      <Closing subject={sheet ? { page: sheet, record: address.sheet?.record } : undefined}>
        {(held, shown) => (
          <SideSheet
            open={shown}
            onClose={() => go({ close: true })}
            // Back to the row of the record it was last on: it may have been stepped to,
            // or opened by a reload or a shared link, with nothing on the page that opened it.
            returnFocus={() =>
              held.record
                ? document.querySelector<HTMLElement>(`[data-record="${CSS.escape(held.record)}"]`)
                : null
            }
            title={held.page.title}
            size="wide"
            width={overlayWidth(held.page)}
            {...(stepping ? { footer: <Stepper stepping={stepping} onStep={step} /> } : {})}
          >
            {draw(held.page, held.record, true)}
          </SideSheet>
        )}
      </Closing>
      <Closing subject={modal ? { page: modal, record: address.modal?.record } : undefined}>
        {(held, shown) => (
          <Dialog
            open={shown}
            onClose={() => go({ close: true })}
            title={held.page.title}
            size="wide"
            width={overlayWidth(held.page)}
          >
            {draw(held.page, held.record, true)}
          </Dialog>
        )}
      </Closing>
    </>
  );
}
