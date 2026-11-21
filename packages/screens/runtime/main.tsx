import "./styles.css";
import { ApiError, api, appContext, signInUrl, signOut, type Term, terms } from "@volvel/app";
import type { InterfaceBody, Page } from "@volvel/manifest";
import { Button, GlossaryProvider, Notice, SideSheet, Tabs } from "@volvel/ui";
import { corePack } from "@volvel/widgets-core/views";
import { labsPack } from "@volvel/widgets-labs/views";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type FilterValues,
  type PageDataClient,
  PageView,
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

function workspaceApi() {
  const context = appContext();
  return `/tenants/${context.tenant.id}/workspaces/${context.workspace.id}`;
}

/** What each widget of a page reads, asked of the platform as whoever is using the app. */
function clientFor(path: string, page: string): PageDataClient {
  return {
    async read(widget, filters, options = {}) {
      const query = new URLSearchParams({
        of: "interface",
        path,
        page,
        widget,
        filters: JSON.stringify(filters),
      });
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
  };
}

/** One page of the app. A new page starts with its filters at their defaults. */
function PageOf({ path, page }: { path: string; page: Page }) {
  const client = useMemo(() => clientFor(path, page.id), [path, page.id]);
  const [values, setValues] = useState<FilterValues>({});
  return (
    <PageView
      widgets={page.widgets}
      filters={page.filters ?? []}
      registry={registry}
      client={client}
      filterValues={values}
      onFilterValues={setValues}
    />
  );
}

function App() {
  const context = appContext();
  const [view, setView] = useState<InterfaceView>();
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
  // The page that is open is in the address, so that it can be linked to and reloaded.
  const [pageId, setPageId] = useState(() => window.location.hash.slice(1) || undefined);
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
  // The page that is open, and its help: a page of documentation, when it names one this person may read.
  const open = pages.find((one) => one.id === pageId) ?? pages[0];
  const help = open?.help ? topics[open.help] : undefined;
  const drawn = open && path ? <PageOf key={open.id} path={path} page={open} /> : null;
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
          ) : pages.length === 1 ? (
            drawn
          ) : (
            <Tabs
              label="Pages"
              value={open?.id ?? ""}
              onChange={(id) => {
                setPageId(id);
                window.history.replaceState(null, "", `#${id}`);
              }}
              tabs={pages.map((page) => ({
                id: page.id,
                label: page.title,
                content: page.id === open?.id ? drawn : null,
              }))}
            />
          )}
        </GlossaryProvider>
      ) : problem ? null : (
        <p className="m-0 text-ink-muted">Loading…</p>
      )}
    </div>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
