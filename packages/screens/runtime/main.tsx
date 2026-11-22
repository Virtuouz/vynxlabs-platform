import "./styles.css";
import { ApiError, api, appContext, signInUrl, signOut, type Term, terms } from "@volvel/app";
import type { ActingUser, InterfaceBody, Page } from "@volvel/manifest";
import { filtersOf } from "@volvel/manifest/parts";
import {
  Button,
  Closing,
  Dialog,
  GlossaryProvider,
  Notice,
  SideSheet,
  Tabs,
  ToastProvider,
} from "@volvel/ui";
import { corePack } from "@volvel/widgets-core/views";
import { labsPack } from "@volvel/widgets-labs/views";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { filtersFromSearch, searchWithFilters } from "../src/filterAddress.ts";
import {
  ActionError,
  type FilterValues,
  type NavigateTo,
  type PageDataClient,
  PageView,
  Stepper,
  tabsOfAddress,
  useAddress,
  viewRegistry,
  WidgetReadError,
  type WireData,
} from "../src/index.ts";

/** What the platform gives for an interface: its body, and what each table it reads holds. */
interface InterfaceView {
  body: InterfaceBody;
}

/** The platform's packs: what a page made in the console may hold. */
const registry = viewRegistry(corePack, labsPack);
/** Each type's role, for what a page's widgets give it (its filters, its containers). */
const roles = { get: (type: string) => registry.get(type)?.definition };

function workspaceApi() {
  const context = appContext();
  return `/tenants/${context.tenant.id}/workspaces/${context.workspace.id}`;
}

/** What the server refused, as an error the renderer draws: its words, and what was wrong with what was typed. */
function refusal(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  const fields: Record<string, string> = {};
  for (const one of error.errors) {
    const name = one.path.replace(/^\/inputs\//, "");
    if (name !== one.path) fields[name] = one.message;
  }
  return new ActionError(error.message, error.status, fields);
}

/** What each widget of a page reads, asked of the platform as whoever is using the app. */
function clientFor(path: string, page: string, record?: string): PageDataClient {
  const where = (widget: string) => {
    const query = new URLSearchParams({ of: "interface", path, page, widget });
    if (record) query.set("record", record);
    return query;
  };
  return {
    async read(widget, filters, options = {}) {
      const query = where(widget);
      query.set("filters", JSON.stringify(filters));
      if (options.input) query.set("input", options.input);
      if (options.cursor) query.set("cursor", options.cursor);
      try {
        return await api.get<{ inputs: Record<string, WireData> }>(
          `${workspaceApi()}/widget-data?${query}`,
        );
      } catch (error) {
        throw error instanceof ApiError ? new WidgetReadError(error.message, error.status) : error;
      }
    },
    async options(filter) {
      const query = new URLSearchParams({ of: "interface", path, page, filter });
      const found = await api.get<{ values: string[] }>(
        `${workspaceApi()}/filter-options?${query}`,
      );
      return found.values;
    },
    async act(widget, at, given) {
      try {
        return await api.post(`${workspaceApi()}/page-actions`, {
          of: "interface",
          path,
          page,
          widget,
          at,
          ...(given.records && Object.keys(given.records).length > 0
            ? { records: given.records }
            : {}),
          ...(given.inputs ? { inputs: given.inputs } : {}),
        });
      } catch (error) {
        throw refusal(error);
      }
    },
    async choices(widget, input, column, search) {
      const query = where(widget);
      query.set("input", input);
      query.set("column", column);
      query.set("search", search);
      const found = await api.get<{ choices: { value: string; label: string }[] }>(
        `${workspaceApi()}/widget-choices?${query}`,
      );
      return found.choices;
    },
    async behind(widget, input, group, filters) {
      const query = where(widget);
      query.set("input", input);
      query.set("behind", JSON.stringify(group));
      query.set("filters", JSON.stringify(filters ?? {}));
      try {
        const read = await api.get<{ inputs: Record<string, WireData> }>(
          `${workspaceApi()}/widget-data?${query}`,
        );
        const found = read.inputs[input];
        if (!found) throw new WidgetReadError("The rows could not be read.", 404);
        return found;
      } catch (error) {
        throw error instanceof ApiError ? new WidgetReadError(error.message, error.status) : error;
      }
    },
  };
}

/**
 * One page of the app, open on a record or not. A new page, or a new record, starts with its
 * filters at their defaults. `onNavigate` is what an action's `open` and `close` do.
 */
function PageOf({
  path,
  page,
  record,
  pages,
  user,
  onNavigate,
  over,
  overRecord,
  changed,
  onActed,
  tabs,
}: {
  over?: boolean;
  overRecord?: string;
  path: string;
  page: Page;
  record?: string;
  pages: readonly Page[];
  user: ActingUser | undefined;
  onNavigate(to: NavigateTo): void;
  /** Bumped when an action ran on any page on screen: each reads again. */
  changed: number;
  onActed(): void;
  /** The open tab of each Tabs, kept in the address (the page on screen; not one over it). */
  tabs?: { open: Readonly<Record<string, string>>; choose(widget: string, tab: string): void };
}) {
  const client = useMemo(() => clientFor(path, page.id, record), [path, page.id, record]);
  const filters = useMemo(() => filtersOf(page.widgets, roles), [page.widgets]);
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
      foldKey={`${path}.${page.id}`}
      {...(tabs && kept ? { tabs } : {})}
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

/** Pages that are in the app's menu: a record page, a side sheet and a modal are only opened on something. */
const inMenu = (page: Page) => page.kind === undefined || page.kind === "page";

function App() {
  const context = appContext();
  const [view, setView] = useState<InterfaceView>();
  // An action that ran on any page on screen makes every page on screen read again.
  const [changed, setChanged] = useState(0);
  const [problem, setProblem] = useState<string>();
  // What the workspace's words mean, as far as this person may know. An app works without it.
  const [glossary, setGlossary] = useState<Term[]>([]);
  // Where each topic of the workspace's documentation is served, of those this person may open.
  const [topics, setTopics] = useState<Record<string, { title: string; url: string }>>({});
  const [helping, setHelping] = useState(false);
  useEffect(() => {
    terms().then(
      (found) => {
        setGlossary(found.terms);
        setTopics(Object.fromEntries(found.topics.map((one) => [one.topic, one.page])));
      },
      () => {},
    );
  }, []);
  // What is open is in the address, so that it can be linked to, reloaded and closed with Back.
  const { address, go, stepping, step, choose } = useAddress(context.base);
  const path = context.app.interface;

  useEffect(() => {
    if (!path) {
      setProblem("This app was not set up to show anything.");
      return;
    }
    api
      .get<InterfaceView>(`${workspaceApi()}/interfaces/${path}`)
      .then(setView, (error: unknown) =>
        setProblem(
          error instanceof ApiError && error.status === 404
            ? "You may not open this app, or it is no longer here. Ask whoever gave you its link."
            : (error as Error).message,
        ),
      );
  }, [path]);
  useEffect(() => {
    if (view) document.title = `${view.body.title} · ${context.tenant.name}`;
  }, [view, context]);

  const who = context.principal;
  const pages = view?.body.pages ?? [];
  const menu = pages.filter(inMenu);
  // The page that is open, and its help: a page of documentation, when it names one this person may read.
  const open = pages.find((one) => one.id === address.page) ?? menu[0];
  const help = open?.help ? topics[open.help] : undefined;
  // Who is acting, for what a page draws by who it is. A condition names a group by its name or
  // its key, as the server reads it.
  const user: ActingUser | undefined = who.id
    ? {
        id: who.id,
        ...(who.email ? { email: who.email } : {}),
        ...(who.name ? { name: who.name } : {}),
        groups: [...(who.groups ?? []), ...(who.groupKeys ?? [])],
      }
    : undefined;
  const draw = (page: Page, record?: string, over = false) =>
    path ? (
      <PageOf
        key={`${page.id}/${record ?? ""}`}
        path={path}
        page={page}
        pages={pages}
        user={user}
        onNavigate={go}
        changed={changed}
        onActed={() => setChanged((count) => count + 1)}
        {...(!over ? { tabs: { open: tabsOfAddress(address), choose } } : {})}
        {...(record ? { record } : {})}
        {...(over ? { over } : {})}
        {...(!over && overRecord ? { overRecord } : {})}
      />
    ) : null;
  const overRecord = address.sheet?.record ?? address.modal?.record;
  const drawn = open ? draw(open, open.kind === "record" ? address.record : undefined) : null;
  const sheet = address.sheet ? pages.find((one) => one.id === address.sheet?.page) : undefined;
  const modal = address.modal ? pages.find((one) => one.id === address.modal?.page) : undefined;
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-display font-semibold">{view?.body.title ?? context.app.title}</h1>
        <span className="flex flex-wrap items-center gap-3 text-body text-ink-muted">
          {help ? (
            <Button size="small" variant="quiet" onClick={() => setHelping(true)}>
              Help
            </Button>
          ) : null}
          {who.type === "anonymous" ? (
            <a href={signInUrl()} className="text-action">
              Sign in
            </a>
          ) : (
            <>
              <span>{who.email ?? who.name}</span>
              <Button
                size="small"
                variant="quiet"
                onClick={async () => {
                  await signOut();
                  window.location.assign(signInUrl());
                }}
              >
                Sign out
              </Button>
            </>
          )}
        </span>
      </header>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <SideSheet
        open={helping && help !== undefined}
        onClose={() => setHelping(false)}
        title={help?.title ?? "Help"}
        size="wide"
        footer={
          help ? (
            <a href={help.url} target="_blank" rel="noopener noreferrer" className="text-action">
              Open in a new tab
            </a>
          ) : undefined
        }
      >
        {/* The page as its docs app serves it, so it is the page its other readers see. */}
        {help ? (
          <iframe
            src={help.url}
            title={help.title}
            className="h-[75vh] w-full rounded-control border border-line bg-surface"
          />
        ) : null}
      </SideSheet>
      {view ? (
        <GlossaryProvider terms={glossary}>
          {pages.length === 0 ? (
            <p className="m-0 text-ink-muted">This app has no pages yet.</p>
          ) : open && !inMenu(open) ? (
            // A record page is not in the menu: it is a page of its own, with a way back to the menu.
            <>
              {menu[0] ? (
                <div>
                  <Button
                    size="small"
                    variant="quiet"
                    onClick={() => go({ page: menu[0]?.id ?? "", as: "page" })}
                  >
                    Back to {menu[0].title}
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
              tabs={menu.map((page) => ({
                id: page.id,
                label: page.title,
                content: page.id === open?.id ? drawn : null,
              }))}
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
                    ? document.querySelector<HTMLElement>(
                        `[data-record="${CSS.escape(held.record)}"]`,
                      )
                    : null
                }
                title={held.page.title}
                size="wide"
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
              >
                {draw(held.page, held.record, true)}
              </Dialog>
            )}
          </Closing>
        </GlossaryProvider>
      ) : problem ? null : (
        <p className="m-0 text-ink-muted">Loading…</p>
      )}
    </div>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
