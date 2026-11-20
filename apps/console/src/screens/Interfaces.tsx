import { Button, Dialog, EmptyState, Notice, TextField } from "@volvel/ui";
import { useEffect, useState } from "react";
import { ApiError, api, useLoad } from "../api.ts";
import { failureText, notify, takenText } from "../ask.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { ago } from "../kit/format.ts";
import { RemoveDraftButton } from "../kit/RemoveDraftButton.tsx";
import { Mono, StatePill, Tag } from "../kit/status.tsx";
import { Page } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { type Listed, slug } from "./builder/data.ts";
import { cannotRename } from "./ResourceIdentity.tsx";

/** The apps made in the console: each an interface, and the app that serves it. */
export function Interfaces({
  root,
  link,
  editable,
}: {
  root: string;
  link: string;
  /** Only a dev workspace is built in. Others are given what is promoted to them. */
  editable: boolean;
}) {
  const list = useLoad<{ items: Listed[] }>(`${root}/interfaces`);
  const apps = useLoad<{ items: { path: string; url: string }[] }>(`${root}/apps`);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string>();
  const [taken, setTaken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<Listed>();
  const where = address || slug(title);

  const create = editable ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      Make an app
    </Button>
  ) : undefined;

  return (
    <Page
      title="App Builder"
      description="Apps over this workspace's tables, built without code: tables, cards, charts and forms, where choosing a row in one decides what another shows. A change is saved as you make it, and reaches people only when it is published."
      action={create}
    >
      {editable ? null : (
        <Notice tone="plain">
          Apps are built in a dev workspace and promoted. Here they can be opened.
        </Notice>
      )}
      <DataTable<Listed>
        variant="static"
        framed
        label="Apps"
        rows={list.data?.items}
        error={list.error}
        onRetry={list.reload}
        rowKey={(row) => row.path}
        empty={
          <EmptyState title="No apps made here yet" action={create}>
            Make one over a table of this workspace. Tables are under Data.
          </EmptyState>
        }
        columns={[
          {
            header: "App",
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                {editable ? (
                  <Link to={`${link}/screens/${row.path}`} className="font-medium text-action">
                    {row.title}
                  </Link>
                ) : (
                  <span className="font-medium">{row.title}</span>
                )}
                <code className="font-mono text-code text-ink-muted">{row.path}</code>
              </span>
            ),
          },
          {
            header: "Pages",
            cell: (row) => (
              <span className="flex flex-col">
                <Mono>{row.pages ?? "—"}</Mono>
                {row.tables && row.tables.length > 0 ? (
                  <span className="text-meta text-ink-subtle">reads {row.tables.join(", ")}</span>
                ) : null}
              </span>
            ),
          },
          {
            header: "State",
            cell: (row) => (
              <span className="flex flex-wrap items-center gap-1.5">
                {row.deployed ? (
                  <Tag tone="live">Published{row.version ? ` v${row.version}` : ""}</Tag>
                ) : (
                  <Tag tone="draft">Not published</Tag>
                )}
                {row.removing ? (
                  <Tag tone="danger">Being removed</Tag>
                ) : row.draft && row.deployed ? (
                  <StatePill state="draft">Edits not published</StatePill>
                ) : null}
                {row.editedAt ? (
                  <span className="text-meta text-ink-subtle">edited {ago(row.editedAt)}</span>
                ) : null}
              </span>
            ),
          },
          {
            header: "Address",
            cell: (row) => {
              const url = apps.data?.items.find((app) => app.path === row.app)?.url;
              return url ? (
                <a href={url} target="_blank" rel="noreferrer" className="break-all text-action">
                  {url}
                </a>
              ) : (
                <span className="text-ink-muted">
                  {row.app ? "Once it is published" : "No app serves it"}
                </span>
              );
            },
          },
          ...(editable
            ? [
                {
                  header: "",
                  cell: (row: Listed) => (
                    <span className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="small"
                        disabled={
                          cannotRename({
                            ownership: row.ownership ?? "console",
                            path: row.path,
                          }) !== undefined
                        }
                        title={cannotRename({
                          ownership: row.ownership ?? "console",
                          path: row.path,
                        })}
                        onClick={() => setRenaming(row)}
                      >
                        Rename
                      </Button>
                      <RemoveDraftButton
                        root={root}
                        kind="interface"
                        path={row.path}
                        noun="app"
                        size="small"
                        state={
                          row.removing
                            ? "removed"
                            : row.ownership === "code"
                              ? "repository"
                              : row.deployed
                                ? "deployed"
                                : "draft"
                        }
                        also={row.app ? [{ kind: "app", path: row.app }] : []}
                        then="The app's address stops serving it once that is deployed."
                        onDone={() => list.reload()}
                      />
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
      <RenameApp
        root={root}
        link={link}
        row={renaming}
        onClose={() => setRenaming(undefined)}
        onDone={() => list.reload()}
      />
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Make an app"
        description="It starts with one empty page. Nobody else sees it until you publish it."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(undefined);
            setTaken(undefined);
            let screenMade = false;
            const path = `screens/${where}`;
            try {
              await api.put(`${root}/drafts/${path}`, {
                kind: "interface",
                schemaVersion: 1,
                body: {
                  title: title.trim(),
                  pages: [{ id: "main", title: title.trim(), widgets: [] }],
                },
                create: true,
              });
              screenMade = true;
              await api.put(`${root}/drafts/${where}`, {
                kind: "app",
                schemaVersion: 1,
                body: { title: title.trim(), interface: path },
                create: true,
              });
              setCreating(false);
              setTitle("");
              setAddress("");
              navigate(`${link}/screens/${path}`);
            } catch (caught) {
              // The app's own address was taken after its screen was made: the screen is not left behind.
              if (screenMade) await api.delete(`${root}/drafts/${path}`).catch(() => {});
              const refused = takenText(caught);
              if (refused) setTaken(refused);
              else setError(failureText(caught));
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField
            label="Name"
            name="title"
            value={title}
            required
            maxLength={200}
            onChange={(value) => {
              setTaken(undefined);
              setTitle(value);
            }}
          />
          <TextField
            label="Address"
            name="address"
            value={where}
            required
            hint="The app's address ends with this. Lower-case letters, digits and dashes."
            {...(taken ? { error: taken } : {})}
            onChange={(value) => {
              setTaken(undefined);
              setAddress(slug(value));
            }}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="mt-1 flex justify-end gap-2">
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={where === ""}>
              Make the app
            </Button>
          </div>
        </form>
      </Dialog>
    </Page>
  );
}

interface Stored {
  kind: string;
  schemaVersion: number;
  body: Record<string, unknown>;
  /** Of a draft: the one the change is made over. */
  revision?: number;
}

/**
 * Changes an app's title, and only that: in the interface and in the app that
 * serves it, as one draft. The address stays, so links to it and what is
 * bound to it go on working.
 */
function RenameApp({
  root,
  link,
  row,
  onClose,
  onDone,
}: {
  root: string;
  link: string;
  row: Listed | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTitle(row?.title ?? "");
    setError(undefined);
  }, [row]);
  const unchanged = !row || title.trim() === row.title || title.trim() === "";
  const save = async () => {
    if (!row) return;
    setBusy(true);
    setError(undefined);
    try {
      // What each is now: its draft over what is deployed. The rest of each body is kept.
      const read = async (path: string): Promise<Stored | undefined> => {
        const missing = (caught: unknown) => {
          if (caught instanceof ApiError && caught.status === 404) return undefined;
          throw caught;
        };
        const [draft, deployed] = await Promise.all([
          api.get<Stored>(`${root}/drafts/${path}`).catch(missing),
          api.get<Stored>(`${root}/resources/${path}`).catch(missing),
        ]);
        // What is deployed has no draft's revision: the change is a new draft over it.
        return (
          draft ??
          (deployed
            ? { kind: deployed.kind, schemaVersion: deployed.schemaVersion, body: deployed.body }
            : undefined)
        );
      };
      const paths = [row.path, ...(row.app ? [row.app] : [])];
      const found = await Promise.all(paths.map(read));
      const changes = paths.flatMap((path, at) => {
        const one = found[at];
        return one
          ? [
              {
                path,
                kind: one.kind,
                schemaVersion: one.schemaVersion,
                body: { ...one.body, title: title.trim() },
                ...(one.revision ? { revision: one.revision } : {}),
              },
            ]
          : [];
      });
      if (changes.length === 0) throw new Error(`${row.path} is not there any more.`);
      await api.post(`${root}/drafts/batch`, { changes });
      notify.success(`A draft renames ${row.title} to ${title.trim()}.`, {
        action: { label: "Review and deploy", onClick: () => navigate(`${link}/release`) },
      });
      onClose();
      onDone();
    } catch (caught) {
      setError(failureText(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={row !== undefined}
      onClose={onClose}
      title={row ? `Rename ${row.title}` : "Rename"}
      description="Only its name changes. Its address does not, so links to it keep working. Nothing changes for people until you publish."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !unchanged) void save();
        }}
      >
        <TextField
          label="Name"
          name="title"
          value={title}
          required
          maxLength={200}
          onChange={setTitle}
        />
        {row ? (
          <p className="m-0 text-meta text-ink-muted">
            The address stays <code className="font-mono">{row.app ?? row.path}</code>.
          </p>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={unchanged}>
            Save as a draft
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
