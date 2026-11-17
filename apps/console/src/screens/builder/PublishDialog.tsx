import type { InterfaceBody } from "@vynxlabs/manifest";
import { Button, Dialog, Notice } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { api } from "../../api.ts";
import { Loading } from "../../kit/LoadState.tsx";
import { Tag } from "../../kit/status.tsx";

interface Preview {
  possible: boolean;
  refusal: { detail: string; errors: { path: string; message: string }[] } | null;
  summary: {
    created: number;
    updated: number;
    deleted: number;
    changes: { change: string; kind: string; path: string }[];
    warnings?: { path: string; message: string }[];
  } | null;
}

interface Binding {
  resourceId: string | null;
  principalLabel: string;
  roleName: string;
}

/** How the draft differs from what people see now, widget by widget. */
export function widgetChanges(published: InterfaceBody | undefined, draft: InterfaceBody) {
  const out: { page: string; widget: string; change: "added" | "changed" | "removed" }[] = [];
  const pagesBefore = new Map((published?.pages ?? []).map((page) => [page.id, page]));
  for (const page of draft.pages) {
    const before = new Map((pagesBefore.get(page.id)?.widgets ?? []).map((one) => [one.id, one]));
    for (const widget of page.widgets) {
      const was = before.get(widget.id);
      const name = widget.title || widget.id;
      if (!was) out.push({ page: page.title, widget: name, change: "added" });
      else if (JSON.stringify(was) !== JSON.stringify(widget))
        out.push({ page: page.title, widget: name, change: "changed" });
      before.delete(widget.id);
    }
    for (const gone of before.values())
      out.push({ page: page.title, widget: gone.title || gone.id, change: "removed" });
    pagesBefore.delete(page.id);
  }
  for (const page of pagesBefore.values())
    for (const gone of page.widgets)
      out.push({ page: page.title, widget: gone.title || gone.id, change: "removed" });
  return out;
}

/**
 * What publishing would do, before it is done (08 §3.20): the drafts it
 * deploys, how the page differs from what people see now, and who sees it.
 */
export function PublishDialog({
  open,
  onClose,
  root,
  path,
  appPath,
  body,
  publishing,
  onPublish,
}: {
  open: boolean;
  onClose: () => void;
  root: string;
  path: string;
  appPath: string | null;
  body: InterfaceBody;
  publishing: boolean;
  onPublish: () => void;
}) {
  const [preview, setPreview] = useState<Preview>();
  const [published, setPublished] = useState<InterfaceBody | null>();
  const [reaches, setReaches] = useState<Binding[]>();
  useEffect(() => {
    if (!open) return;
    let current = true;
    setPreview(undefined);
    setPublished(undefined);
    const paths = [path, ...(appPath ? [appPath] : [])].join(",");
    api
      .get<Preview>(`${root}/changes/preview?paths=${encodeURIComponent(paths)}`)
      .then((answer) => current && setPreview(answer))
      .catch(() => current && setPreview({ possible: true, refusal: null, summary: null }));
    api
      .get<{ interface: InterfaceBody }>(`${root}/interfaces/${path}`)
      .then((answer) => current && setPublished(answer.interface))
      .catch(() => current && setPublished(null));
    const [base = "", workspaceId = ""] = root.split("/workspaces/");
    Promise.all([
      api.get<{ items: { id: string; kind: string; path: string }[] }>(`${root}/resources`),
      api.get<{ items: Binding[] }>(`${base}/bindings?workspaceId=${workspaceId}`),
    ])
      .then(([resources, bindings]) => {
        const app = resources.items.find((one) => one.kind === "app" && one.path === appPath);
        if (current) setReaches(bindings.items.filter((one) => app && one.resourceId === app.id));
      })
      .catch(() => current && setReaches([]));
    return () => {
      current = false;
    };
  }, [open, root, path, appPath]);

  const changes = published === undefined ? undefined : widgetChanges(published ?? undefined, body);
  const ready = preview !== undefined && changes !== undefined && reaches !== undefined;
  return (
    <Dialog open={open} onClose={onClose} size="wide" title={`Publish ${body.title}`}>
      {!ready ? (
        <Loading what="what publishing does" />
      ) : (
        <div className="flex flex-col gap-4">
          {preview.refusal ? (
            <Notice tone="danger">
              {preview.refusal.detail}
              {preview.refusal.errors.length > 0 ? (
                <ul className="mt-1 mb-0 pl-5">
                  {preview.refusal.errors.map((one) => (
                    <li key={`${one.path} ${one.message}`}>{one.message}</li>
                  ))}
                </ul>
              ) : null}
            </Notice>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="m-0 text-title">On the page</h3>
            {published === null ? (
              <p className="m-0 text-ink-muted">Nobody sees it yet: this is its first publish.</p>
            ) : changes.length === 0 ? (
              <p className="m-0 text-ink-muted">The page is as people see it now.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {changes.map((one) => (
                  <li
                    key={`${one.page}:${one.widget}:${one.change}`}
                    className="flex items-center gap-2"
                  >
                    <Tag
                      tone={
                        one.change === "removed"
                          ? "danger"
                          : one.change === "added"
                            ? "live"
                            : "neutral"
                      }
                    >
                      {one.change}
                    </Tag>
                    <span>{one.widget}</span>
                    <span className="text-meta text-ink-muted">on {one.page}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {preview.summary && preview.summary.changes.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-title">What is deployed</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {preview.summary.changes.map((one) => (
                  <li key={`${one.kind}:${one.path}`} className="flex items-center gap-2">
                    <Tag>{one.change}</Tag>
                    <code className="font-mono text-code">{one.path}</code>
                    <span className="text-meta text-ink-muted">{one.kind}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="m-0 text-title">Who sees it</h3>
            <p className="m-0">
              Staff whose role lets them read this workspace
              {reaches.length > 0
                ? `, and ${reaches.map((one) => one.principalLabel).join(", ")}.`
                : ". It is shared with nobody else yet: share it from Published apps."}
            </p>
          </section>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Not now</Button>
            <Button
              variant="primary"
              loading={publishing}
              disabled={!preview.possible}
              onClick={onPublish}
            >
              Publish
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
