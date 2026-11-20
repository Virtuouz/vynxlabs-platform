import { Button, Dialog, EmptyState, Notice, TextField } from "@volvel/ui";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText, takenText } from "../ask.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { ago } from "../kit/format.ts";
import { Mono, StatePill, Tag } from "../kit/status.tsx";
import { Page } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { type Listed, slug } from "./builder/data.ts";

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
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <DataTable<Listed>
          variant="static"
          framed
          label="Apps"
          rows={list.data.items}
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
          ]}
        />
      ) : null}
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
