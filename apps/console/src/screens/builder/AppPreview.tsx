import type { InterfaceBody } from "@volvel/manifest";
import { AppView, useAddress } from "@volvel/screens";
import { Button, Notice } from "@volvel/ui";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, useLoad } from "../../api.ts";
import { Loading } from "../../kit/LoadState.tsx";
import { navigate } from "../../router.tsx";
import { DeviceSwitch, VIEWPORTS } from "./BuilderHeader.tsx";
import { pageClient } from "./client.ts";
import { views } from "./registry.ts";

/**
 * The app as it is being built, drawn as people will use it: its menu, record pages, side sheets,
 * modals, forms and filters, with what is open kept in the address and Back going back. It is the
 * served app's own component (`AppView`) reading the draft as the person who is building, so what
 * a button does here really happens in the workspace's rows. It lives at the builder's address
 * with `/preview` after it, and is opened in a new tab from the builder.
 */
export function AppPreview({
  root,
  link,
  path,
  workspaceName,
}: {
  root: string;
  /** The workspace's console address. */
  link: string;
  /** The app's path: "screens/performance". */
  path: string;
  workspaceName: string;
}) {
  const [body, setBody] = useState<InterfaceBody>();
  const [problem, setProblem] = useState<string>();
  const [device, setDevice] = useState<keyof typeof VIEWPORTS>("desktop");
  const nav = useAddress(`${link}/screens/${path}/preview/`);
  const apps = useLoad<{ items: { path: string; url: string }[] }>(`${root}/apps`);
  const published = apps.data?.items.find((one) => one.path === path)?.url;

  useEffect(() => {
    let current = true;
    api.get<{ body: InterfaceBody }>(`${root}/drafts/${path}`).then(
      (draft) => current && setBody(draft.body),
      (error: unknown) => {
        // No draft yet: what is published is what there is to look at. Refused: the person may not read it.
        if (error instanceof ApiError && error.status === 404) {
          api.get<{ body: InterfaceBody }>(`${root}/interfaces/${path}`).then(
            (view) => current && setBody(view.body),
            (again: unknown) => current && setProblem(words(again)),
          );
          return;
        }
        if (current) setProblem(words(error));
      },
    );
    return () => {
      current = false;
    };
  }, [root, path]);

  const clientFor = useCallback(
    (page: string, record?: string) =>
      pageClient(root, { of: "interface", path, page }, true, record),
    [root, path],
  );
  const width = VIEWPORTS[device].width;
  const close = () => {
    // A tab opened from the builder closes; one reached by its address goes to the builder.
    window.close();
    navigate(`${link}/screens/${path}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section
        aria-label="Preview of the draft"
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-line border-b bg-sunken px-4 py-2"
      >
        <p className="m-0 min-w-0 flex-1 text-body-sm text-ink-muted">
          <strong className="font-semibold text-ink">Preview of the draft</strong> · {workspaceName}
          . Actions change {workspaceName}'s rows.
        </p>
        <DeviceSwitch value={device} onChange={setDevice} />
        {published ? (
          <a href={published} target="_blank" rel="noreferrer" className="text-body-sm text-action">
            Open the published app
          </a>
        ) : null}
        <Button onClick={close}>Close</Button>
      </section>
      <div className="min-h-0 flex-1 overflow-auto">
        {problem ? (
          <div className="p-4">
            <Notice tone="danger">{problem}</Notice>
          </div>
        ) : !body ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : (
          <>
            <div
              data-preview-frame={device}
              className="mx-auto flex flex-col gap-4 p-4"
              style={{ maxWidth: width ? `${width}px` : "1400px" }}
            >
              <h1 className="m-0 text-display font-semibold">{body.title}</h1>
              <AppView
                nav={nav}
                pages={body.pages}
                user={undefined}
                registry={views}
                clientFor={clientFor}
                appKey={`preview.${path}`}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** What went wrong reading the draft, in words: not being allowed to read it is said as that. */
function words(error: unknown): string {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return "You may not read this app's draft, or it is no longer here. Ask whoever builds it, or open the published app.";
  }
  return error instanceof Error ? error.message : "The draft could not be read.";
}
