import "./styles.css";
import {
  ApiError,
  type Filter as AppFilter,
  api,
  appContext,
  signInUrl,
  signOut,
  table,
} from "@vynxlabs/app";
import { Button, Notice } from "@vynxlabs/ui";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { type DataClient, InterfaceRenderer, type InterfaceView } from "../src/index.ts";

/** Rows through the app client, so every request is made as whoever is using the app. */
const client: DataClient = {
  find: (name, options) =>
    table(name).page({
      ...(options.filter ? { filter: options.filter as AppFilter } : {}),
      ...(options.sort?.length ? { sort: options.sort } : {}),
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      ...(options.cursor ? { cursor: options.cursor } : {}),
    }),
  aggregate: (name, options) =>
    table(name).aggregate({
      ...(options.group?.length ? { group: options.group } : {}),
      ...(options.measures?.length ? { measures: options.measures } : {}),
      ...(options.filter ? { filter: options.filter as AppFilter } : {}),
      ...(options.sort?.length ? { sort: options.sort } : {}),
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
    }),
  insert: (name, row) => table(name).insert(row),
  update: (name, id, changes) => table(name).update(id, changes),
  remove: (name, id) => table(name).delete(id),
};

function App() {
  const context = appContext();
  const [view, setView] = useState<InterfaceView>();
  const [problem, setProblem] = useState<string>();
  // The page that is open is in the address, so that it can be linked to and reloaded.
  const [pageId, setPageId] = useState(() => window.location.hash.slice(1) || undefined);

  useEffect(() => {
    const path = context.app.interface;
    if (!path) {
      setProblem("This app was not set up to show anything.");
      return;
    }
    api
      .get<InterfaceView>(
        `/tenants/${context.tenant.id}/workspaces/${context.workspace.id}/interfaces/${path}`,
      )
      .then(setView, (error: unknown) =>
        setProblem(
          error instanceof ApiError && error.status === 404
            ? "You may not open this app, or it is no longer here."
            : (error as Error).message,
        ),
      );
  }, [context]);
  useEffect(() => {
    if (view) document.title = `${view.interface.title} · ${context.tenant.name}`;
  }, [view, context]);

  const who = context.principal;
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-xl font-semibold tracking-tight">
          {view?.interface.title ?? context.app.title}
        </h1>
        <span className="flex flex-wrap items-center gap-3 text-[14px] text-ink-muted">
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
      {view ? (
        <InterfaceRenderer
          body={view.interface}
          tables={view.tables}
          client={client}
          pageId={pageId}
          onPage={(id) => {
            setPageId(id);
            window.history.replaceState(null, "", `#${id}`);
          }}
        />
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
