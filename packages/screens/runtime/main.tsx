import "./styles.css";
import { ApiError, api, appContext, signInUrl, signOut, type Term, terms } from "@volvel/app";
import type { ActingUser, InterfaceBody } from "@volvel/manifest";
import { Button, GlossaryProvider, Notice, SideSheet, ToastProvider } from "@volvel/ui";
import { corePack } from "@volvel/widgets-core/views";
import { labsPack } from "@volvel/widgets-labs/views";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ActionError,
  AppSkeleton,
  AppView,
  inMenu,
  type PageDataClient,
  useAddress,
  viewRegistry,
  WidgetReadError,
  type WireData,
} from "../src/index.ts";

/** What the platform gives for an interface: its body, and what each table it reads holds. */
interface InterfaceView {
  body: InterfaceBody;
  /** What each group the page names is called now, by the path it is named by. */
  groupNames?: Record<string, string>;
}

/** The platform's packs: what a page made in the console may hold. */
const registry = viewRegistry(corePack, labsPack);

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
      if (options.sort) query.set("sort", options.sort);
      if (options.size) query.set("size", String(options.size));
      if (options.chosen && Object.keys(options.chosen).length > 0) {
        query.set("chosen", JSON.stringify(options.chosen));
      }
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
      const found = await api.get<{ values: string[]; labels?: Record<string, string> }>(
        `${workspaceApi()}/filter-options?${query}`,
      );
      return found.values.map((value) => ({ value, label: found.labels?.[value] ?? value }));
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
    async decide(widget, id, decision, comment) {
      try {
        return await api.post(`${workspaceApi()}/page-approvals`, {
          path,
          page,
          widget,
          id,
          decision,
          ...(comment ? { comment } : {}),
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
  // What is open is in the address, so that it can be linked to, reloaded and closed with Back.
  const nav = useAddress(context.base);
  const { address } = nav;
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
        ...(view?.groupNames ? { groupNames: view.groupNames } : {}),
      }
    : undefined;
  const clientForPage = useCallback(
    (page: string, record?: string) => clientFor(path ?? "", page, record),
    [path],
  );
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 overflow-x-clip p-4">
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
          <AppView
            nav={nav}
            pages={pages}
            user={user}
            registry={registry}
            clientFor={clientForPage}
            appKey={path ?? ""}
          />
        </GlossaryProvider>
      ) : problem ? null : (
        <AppSkeleton {...(context.app.pages ? { pages: context.app.pages } : {})} />
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
